# File: src/backend/vector_store.py (Corrected)
"""
Vector store connector supporting both FAISS and ChromaDB backends.
"""
import os
import uuid
from typing import Any, Dict, List

# FAISS dependencies
import numpy as np
import faiss

# ChromaDB dependencies
import chromadb

class VectorStore:
    """Abstract interface for vector stores."""
    def add(self, embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        raise NotImplementedError
    def search(self, query_embedding: List[float], k: int) -> List[Dict[str, Any]]:
        raise NotImplementedError
    def delete_by_metadata(self, filters: Dict[str, Any]) -> int:
        raise NotImplementedError
    def count(self) -> int:
        raise NotImplementedError

class FaissVectorStore(VectorStore):
    # This class remains unchanged as it doesn't use ChromaDB
    def __init__(self, index_path: str, dim: int):
        self.index_path = index_path
        self.dim = dim
        if os.path.exists(index_path):
            self.index = faiss.read_index(index_path)
        else:
            self.index = faiss.IndexFlatL2(dim)
        self.metadata: List[Dict[str, Any]] = []
    def add(self, embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        arr = np.array(embeddings).astype("float32")
        self.index.add(arr)
        self.metadata.extend(metadatas)
        faiss.write_index(self.index, self.index_path)
    def search(self, query_embedding: List[float], k: int) -> List[Dict[str, Any]]:
        arr = np.array([query_embedding]).astype("float32")
        dists, idxs = self.index.search(arr, k)
        results = []
        for dist, idx in zip(dists[0], idxs[0]):
            meta = self.metadata[idx]
            results.append({**meta, "score": float(dist)})
        return results
    def delete_by_metadata(self, filters: Dict[str, Any]) -> int:
        to_remove = [
            idx for idx, meta in enumerate(self.metadata)
            if all(meta.get(k) == v for k, v in filters.items())
        ]
        if not to_remove:
            return 0
        keep_idxs = [i for i in range(len(self.metadata)) if i not in to_remove]
        kept_vectors = [self.index.reconstruct(i) for i in keep_idxs]
        kept_meta    = [self.metadata[i]       for i in keep_idxs]
        self.index.reset()
        self.metadata.clear()
        if kept_vectors:
            arr = np.array(kept_vectors).astype("float32")
            self.index.add(arr)
            self.metadata.extend(kept_meta)
        faiss.write_index(self.index, self.index_path)
        return len(to_remove)
    def count(self) -> int:
        return self.index.ntotal

class ChromaVectorStore(VectorStore):
    """Vector store implementation for ChromaDB, updated for the new API."""
    def __init__(self, persist_directory: str, collection_name: str):
        # The new, simpler way to create a persistent client
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection = self.client.get_or_create_collection(collection_name)

    def add(self, embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        # Generate unique IDs for each chunk to add, as required by ChromaDB
        ids = [str(uuid.uuid4()) for _ in embeddings]
        self.collection.add(
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
        # The PersistentClient automatically handles saving to disk.

    def search(self, query_embedding: List[float], k: int) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            include=["metadatas", "distances", "documents"]
        )
        output = []
    
        # Check if the core lists exist and are not empty before proceeding.
        # This handles cases where a search returns zero results.
        if not all(key in results and results[key] and results[key][0] for key in ['metadatas', 'distances', 'documents']):
            return [] # Return an empty list if there are no results

        metadatas = results['metadatas'][0]
        distances = results['distances'][0]
        documents = results['documents'][0]

        # Iterate over all three lists at once
        for meta, dist, doc in zip(metadatas, distances, documents):
            entry = meta.copy()
            entry['score'] = dist
            entry['text'] = doc or "" 
            output.append(entry)
        return output

    def delete_by_metadata(self, filters: Dict[str, Any]) -> int:
        # The new API doesn't return a count, so we query before and after.
        # This is less efficient but the only way with the current API.
        count_before = self.collection.count()
        self.collection.delete(where=filters)
        count_after = self.collection.count()
        return count_before - count_after

    def count(self) -> int:
        return self.collection.count()
