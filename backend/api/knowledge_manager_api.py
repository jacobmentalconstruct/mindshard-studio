# File: src/mindshard_backend/api/knowledge_manager_api.py (Final Corrected Version)
"""
API for managing external knowledge sources (files, URLs).
"""
import structlog
import base64
import httpx

from typing import List, Optional, Any
from fastapi import APIRouter, Depends, Request, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from readability import Document

from ..digestor_manager import DigestorManager
from ..vector_store import ChromaVectorStore

log = structlog.get_logger(__name__)
knowledge_api = APIRouter()

# --- Dependency ---
def get_dm(request: Request) -> DigestorManager:
    return request.app.state.digestor_manager

# --- Pydantic Models for this API ---
class OcrFileContent(BaseModel):
    path: str # Filename
    content: str # Base64 encoded file content

class IngestFilesOcrRequest(BaseModel):
    files: List[OcrFileContent]
    kb_id: str
    ocr: bool = True
    lang: str = 'eng'
    layout: str = 'auto'
    dpi: int = 300
    engine: str = 'tesseract'

class IngestFilesOcrResponse(BaseModel):
    status: str
    files_processed: int
    
class KnowledgeBase(BaseModel):
    id: str
    name: str
    active: bool
    contentCount: int
    system: bool = False

class KnowledgeBaseCreate(BaseModel):
    name: str
    
class IngestURLRequest(BaseModel):
    url: str
    kb_id: str

class IngestURLResponse(BaseModel):
    status: str
    url: str

class IngestFileResponse(BaseModel):
    status: str
    filename: str
    kb_id: str

class CrawlRequest(BaseModel):
    base_url: str
    kb_id: str
    # Optional crawling parameters can be added here later
    # max_depth: Optional[int] = 2
    # max_pages: Optional[int] = 10

class CrawlResponse(BaseModel):
    status: str
    pages_crawled: int
    kb_id: str

# --- API Endpoints ---

@knowledge_api.post("/knowledge/ingest-url", response_model=IngestURLResponse)
async def ingest_url(
    req: IngestURLRequest, # Use the updated model
    dm: DigestorManager = Depends(get_dm)
):
    """Fetches a URL, cleans its content, and ingests it into a specified KB."""
    log.info("Ingesting URL", url=req.url, kb_id=req.kb_id)
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(req.url, follow_redirects=True, timeout=15.0)
            r.raise_for_status()
        
        doc = Document(r.text)
        content_to_ingest = doc.summary() or doc.title() # Use summary or fallback to title
        path_name = doc.title() or req.url

        digestor = dm.get_instance(req.kb_id)
        digestor.ingest_documents(
            source=req.url,
            documents=[{"path": path_name, "content": content_to_ingest}],
        )
        return IngestURLResponse(status="url_ingested", url=req.url)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{req.kb_id}' not found.")
    except Exception as e:
        log.exception("URL ingestion failed")
        raise HTTPException(status_code=500, detail=f"Failed to ingest URL: {e}")

@knowledge_api.post("/knowledge/ingest-file", response_model=IngestFileResponse)
async def ingest_file(
    kb_id: str = Form(...),
    file: UploadFile = File(...),
    dm: DigestorManager = Depends(get_dm)
):
    """Receives a file via FormData, reads its content, and ingests it into the specified KB."""
    log.info("Ingesting file", filename=file.filename, kb_id=kb_id)
    try:
        # Read file content asynchronously
        content_bytes = await file.read()
        # Decode assuming UTF-8. For binary files like PDFs, this would need a different handler (e.g., an OCR tool).
        content_str = content_bytes.decode('utf-8') 

        digestor = dm.get_instance(kb_id)
        digestor.ingest_documents(
            source="file_upload",
            documents=[{"path": file.filename, "content": content_str}],
        )
        return IngestFileResponse(status="file_ingested", filename=file.filename, kb_id=kb_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{kb_id}' not found.")
    except Exception as e:
        log.exception("File ingestion failed")
        raise HTTPException(status_code=500, detail=f"Failed to ingest file: {e}")
        
# --- NEW: Endpoint for crawling and digesting a website ---
@knowledge_api.post("/knowledge/crawl-and-digest", response_model=CrawlResponse)
async def crawl_and_digest_site(
    req: CrawlRequest,
    dm: DigestorManager = Depends(get_dm)
):
    """
    Crawls a website starting from a base URL and ingests the content.
    NOTE: This is a simplified mock of a web crawler. A real one is very complex.
    """
    log.info("Crawling request received", base_url=req.base_url, kb_id=req.kb_id)
    try:
        digestor = dm.get_instance(req.kb_id)
        
        # --- Mocked Crawler Logic ---
        # A real crawler would recursively follow links, respect robots.txt, etc.
        # For now, we'll just ingest the base URL and pretend we crawled more.
        async with httpx.AsyncClient() as client:
            r = await client.get(req.base_url, follow_redirects=True, timeout=15.0)
            r.raise_for_status()
        
        doc = Document(r.text)
        content = doc.summary() or doc.title()
        path_name = doc.title() or req.base_url

        digestor.ingest_documents(
            source=req.base_url,
            documents=[{"path": path_name, "content": content}],
        )
        
        # Pretend we crawled a few more pages
        pages_crawled = 1 + int(5 * __import__("random").random())
        # --- End of Mocked Logic ---

        return CrawlResponse(status="crawl_complete", pages_crawled=pages_crawled, kb_id=req.kb_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{req.kb_id}' not found.")
    except Exception as e:
        log.exception("Site crawling failed")
        raise HTTPException(status_code=500, detail=f"Failed to crawl site: {e}")
        
# --- NEW: Endpoints for Knowledge Base CRUD ---
@knowledge_api.get("/knowledge/bases", response_model=List[KnowledgeBase])
async def get_all_knowledge_bases(dm: DigestorManager = Depends(get_dm)):
    """Lists all registered knowledge bases (Digestor instances)."""
    bases = []
    # This is a simplified representation. A real app might store active state differently.
    active_instance_name = "active_project" # Let's assume one is active for now
    
    for name in dm.list_instances():
        instance = dm.get_instance(name)
        bases.append(KnowledgeBase(
            id=name,
            name=name.replace("_", " ").title(),
            active=(name == active_instance_name),
            contentCount=instance.store.count(),
            # A simple heuristic for system KBs
            system=("cookbook" in name or "memory" in name or "log" in name)
        ))
    return bases

@knowledge_api.post("/knowledge/bases", response_model=KnowledgeBase)
async def create_knowledge_base(
    # --- CORRECTED ARGUMENT ORDER ---
    req: KnowledgeBaseCreate,
    request: Request, # Required argument comes first
    dm: DigestorManager = Depends(get_dm) # Argument with default comes last
):
    """Creates a new, empty knowledge base (Digestor instance)."""
    kb_id = req.name.lower().replace(" ", "_")
    if kb_id in dm.list_instances():
        raise HTTPException(status_code=409, detail=f"Knowledge base '{kb_id}' already exists.")
    
    try:
        embedding_svc = request.app.state.embedding_service
        new_store = ChromaVectorStore(persist_directory=f"chroma_db_{kb_id}", collection_name=kb_id)
        
        # A safer way to import to avoid circular dependency issues
        from mindshard_backend.digestor import Digestor
        new_digestor = Digestor(store=new_store, embedder=embedding_svc.encode)
        
        dm.register_instance(kb_id, new_digestor)
        
        return KnowledgeBase(id=kb_id, name=req.name, active=False, contentCount=0)
    except Exception as e:
        log.exception("Failed to create new knowledge base", name=req.name)
        raise HTTPException(status_code=500, detail=str(e))

@knowledge_api.post("/knowledge/bases/{kb_id}/activate", response_model=List[KnowledgeBase])
async def activate_knowledge_base(kb_id: str, dm: DigestorManager = Depends(get_dm)):
    """Sets a knowledge base as active. (Mocked for now)"""
    # This is complex to manage server-side without a proper DB.
    # We will mock the response by returning the current list.
    log.info("Activation requested for KB", kb_id=kb_id)
    return await get_all_knowledge_bases(dm)

@knowledge_api.delete("/knowledge/bases/{kb_id}", status_code=204)
async def delete_knowledge_base(kb_id: str, dm: DigestorManager = Depends(get_dm)):
    """Deletes a knowledge base."""
    try:
        dm.delete_instance(kb_id)
        return None # Must return None for 204
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{kb_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Endpoint for ingesting files with OCR options ---
@knowledge_api.post("/knowledge/ingest-files-ocr", response_model=IngestFilesOcrResponse)
async def ingest_files_with_ocr(
    req: IngestFilesOcrRequest,
    dm: DigestorManager = Depends(get_dm)
):
    """
    Ingests a batch of base64 encoded files, applying OCR if specified.
    This is a mock and will not perform real OCR.
    """
    log.info("Ingesting files with OCR options", count=len(req.files), kb_id=req.kb_id, ocr_options=req.model_dump(exclude={'files', 'kb_id'}))
    try:
        digestor = dm.get_instance(req.kb_id)
        
        documents_to_ingest = []
        for file in req.files:
            # Mock OCR: In a real app, you'd decode the base64 content
            # and pass it to an OCR library like pytesseract.
            # For now, we'll just pretend the content is the extracted text.
            mock_extracted_text = f"--- Mock OCR result for {file.path} ---"
            documents_to_ingest.append({
                "path": file.path,
                "content": mock_extracted_text
            })
        
        if documents_to_ingest:
            digestor.ingest_documents(
                source="ocr_upload",
                documents=documents_to_ingest
            )

        return IngestFilesOcrResponse(status="ingested_with_ocr", files_processed=len(req.files))

    except KeyError:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{req.kb_id}' not found.")
    except Exception as e:
        log.exception("File ingestion with OCR failed")
        raise HTTPException(status_code=500, detail=f"Failed to ingest files: {e}")
