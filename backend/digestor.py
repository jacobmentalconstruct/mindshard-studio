# File: src/mindshard_backend/digestor.py
"""
Digestor: a robust, high-performance ingestion and retrieval service for RAG workflows.

Features & Best Practices:
- Dependency injection for embedder, chunker, and summarizer functions.
- Async-friendly ingestion and query methods with batch processing.
- Incremental, idempotent ingestion using content hashing to avoid duplicates.
- Pluggable VectorStore backend (FAISS, Chroma).
- Optional deletion, update, and clear operations for lifecycle management.
- Metrics instrumentation hooks for observability.
- Comprehensive error handling and logging for non-fragile integration.
"""
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional, Callable

from prometheus_client import Counter, Summary

from mindshard_backend.utils import chunk_text
from mindshard_backend.vector_store import VectorStore

logger = logging.getLogger(__name__)

# Metrics
INGEST_COUNTER = Counter(
    'digestor_ingest_chunks_total', 'Total number of chunks ingested'
)
QUERY_COUNTER = Counter(
    'digestor_query_total', 'Total number of queries processed'
)
QUERY_LATENCY = Summary(
    'digestor_query_latency_seconds', 'Latency for digestor.query calls'
)

class Digestor:
    """
    Service class for RAG ingestion and retrieval, designed for reliability and performance.
    """
    def __init__(
        self,
        store: VectorStore,
        embedder: Callable[[str], List[float]],
        chunker: Callable[[str, int, int], List[str]] = chunk_text,
        summarizer: Optional[Callable[[str], str]] = None,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        max_workers: int = 4,
    ):
        """
        Initialize the Digestor.

        Args:
            store: a configured VectorStore instance.
            embedder: function mapping text to vector embeddings.
            chunker: function splitting text into chunks (text, size, overlap).
            summarizer: optional function to generate abstractive summaries.
            chunk_size: default max characters per chunk.
            chunk_overlap: default overlap between chunks.
            max_workers: thread pool size for parallel embedding.
        """
        self.store = store
        self.embedder = embedder
        self.chunker = chunker
        self.summarizer = summarizer
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        # Track seen content hashes to skip re-ingestion
        self._seen_hashes = set()

    def _hash_content(self, content: str) -> str:
        return hashlib.md5(content.encode('utf-8')).hexdigest()

    def ingest_documents(self,
                         source: str,
                         documents: List[Dict[str, str]],
                         force: bool = False) -> None:

        """
        Ingests documents by chunking, embedding, and indexing.

        Args:
            documents: list of {'path': str, 'content': str}
            force: if True, re-ingest even if content hash seen.
        """
        for doc in documents:
            path = doc.get('path', '<unknown>')
            content = doc.get('content', '')
            if not content:
                logger.debug('Skipping empty document', path=path)
                continue
            content_hash = self._hash_content(content)
            if content_hash in self._seen_hashes and not force:
                logger.debug('Skipping previously ingested document', path=path)
                continue
            chunks = self.chunker(content, self.chunk_size, self.chunk_overlap)
            metadatas = [
                {
                    'source': source,
                    'path': path,
                    'chunk_index': idx,
                    'content_hash': content_hash
                }
                for idx in range(len(chunks))
            ]
            self.ingest_chunks(chunks, metadatas)
            self._seen_hashes.add(content_hash)

    def ingest_chunks(
        self,
        chunks: List[str],
        metadatas: List[Dict[str, Any]]
    ) -> None:
        """
        Embeds and indexes text chunks with metadata in parallel.
        """
        if len(chunks) != len(metadatas):
            logger.error(
                'Chunks/metadata mismatch: %d chunks vs %d metadata',
                len(chunks), len(metadatas)
            )
            raise ValueError('Chunks and metadata length must match')

        # Parallel embedding
        futures = []
        for idx, text in enumerate(chunks):
            futures.append(
                self.executor.submit(self.embedder, text)
            )

        embeddings = []
        for idx, future in enumerate(futures):
            try:
                vec = future.result()
                embeddings.append(vec)
            except Exception:
                logger.exception('Embedding failed for chunk %d', idx)

        if embeddings:
            self.store.add(embeddings, metadatas)
            count = len(embeddings)
            INGEST_COUNTER.inc(count)
            logger.info('Ingested %d chunks', count)
        else:
            logger.warning('No embeddings ingested')

    @QUERY_LATENCY.time()
    def query(
        self,
        text: str,
        k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Retrieve top-k relevant metadata entries for the query text.
        """
        QUERY_COUNTER.inc()
        try:
            query_vec = self.embedder(text)
        except Exception:
            logger.exception('Failed to embed query')
            return []

        results = []
        try:
            results = self.store.search(query_vec, k)
            logger.debug('Query returned %d results', len(results))
        except Exception:
            logger.exception('Vector store search failed')
        return results

    def summarize(
        self,
        entries: List[Dict[str, Any]],
        **summarizer_kwargs: Any
    ) -> str:
        """
        Generate an abstractive summary from retrieved entries.
        """
        if not callable(self.summarizer):
            logger.error('Summarizer missing')
            raise RuntimeError('No summarizer configured')

        contents = []
        for e in entries:
            meta = e.get('metadata', {})
            chunk_content = meta.get('content') or ''
            contents.append(chunk_content)
        if not contents:
            return ''

        combined = '\n'.join(contents)
        try:
            summary = self.summarizer(combined, **summarizer_kwargs)
            logger.info('Generated summary (%d chars)', len(summary))
            return summary
        except Exception:
            logger.exception('Summarization error')
            raise

    def delete_by_metadata(self, filters: Dict[str, Any]) -> int:
        """
        Remove indexed entries matching metadata filters.

        Args:
            filters: dict of metadata key-values for deletion.
        Returns:
            Number of entries deleted.
        """
        try:
            deleted = self.store.delete_by_metadata(filters)
            logger.info('Deleted %d entries by metadata', deleted)
            return deleted
        except AttributeError:
            logger.error('Store does not support delete_by_metadata')
            raise NotImplementedError('delete_by_metadata not implemented in store')

    def update_document(
        self,
        document: Dict[str, str]
    ) -> None:
        """
        Update an existing document by removing old chunks and re-ingesting.
        """
        path = document.get('path', '<unknown>')
        content = document.get('content', '')
        content_hash = self._hash_content(content)
        # Remove old versions
        self.delete_by_metadata({'path': path})
        # Re-ingest
        self._seen_hashes.discard(content_hash)
        self.ingest_documents([document], force=True)

    def clear(self) -> None:
        """
        Clear all indexed data and reset state.
        """
        try:
            self.store.clear()  # optional store method
        except Exception:
            logger.exception('Store clear failed')
        self._seen_hashes.clear()
        logger.info('Digestor state cleared')

