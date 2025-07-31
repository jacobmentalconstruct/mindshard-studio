# File: src/backend/api/project_tools_api.py (Corrected and Final)
"""
API endpoints for project-level tools, such as inspecting the
local Conda environment.
"""
import subprocess
import structlog
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from pathlib import Path
import pytesseract
from PIL import Image
import io
from ..config import get_settings, Settings # Add this import

log = structlog.get_logger(__name__)
# The prefix and tags are now handled dynamically by main.py
tools_api = APIRouter()

# Define project_root globally for this module
project_root = Path(__file__).parent.parent.resolve()

# --- Pydantic Models ---
class OcrRequest(BaseModel):
    path: str
    # Future options like language could be added here
    # lang: str = 'eng'

class OcrResponse(BaseModel):
    text: str
    
class FilePathRequest(BaseModel):
    path: str

class FileContentResponse(BaseModel):
    content: str
    
class FileWriteRequest(BaseModel):
    path: str
    content: str

class SuccessResponse(BaseModel):
    success: bool
    message: str
    
class ListModelsRequest(BaseModel):
    path: str = Field("models", description="Path to the models directory, relative to the project root.")

# --- Helper to resolve paths safely ---
def resolve_safe_path(project_root: Path, requested_path: str) -> Path:
    target_path = (project_root / requested_path).resolve()
    if project_root not in target_path.parents and target_path != project_root:
        raise HTTPException(status_code=403, detail="Access denied: Path is outside the project root.")
    return target_path

# --- API Endpoints ---
@tools_api.post(
    "/tools/project/list-models",
    response_model=List[str],
    summary="List model files from a directory"
)

def list_models_in_path(req: ListModelsRequest, settings: Settings = Depends(get_settings)):
    """
    Safely lists all .gguf and .bin files from a specified directory
    within the project root.
    """
        
    # Calculate project_root from the settings, which is more reliable
    target_dir = (project_root / req.path).resolve()

    # --- SECURITY CHECK ---
    # Ensure the target directory is within the project root to prevent directory traversal attacks.
    if project_root not in target_dir.parents and target_dir != project_root:
        log.warning("Attempted directory traversal", requested_path=req.path, resolved_path=str(target_dir))
        raise HTTPException(status_code=403, detail="Access denied: Path is outside the project root.")

    if not target_dir.is_dir():
        log.error("Model directory not found", path=str(target_dir))
        raise HTTPException(status_code=404, detail=f"Directory not found: {req.path}")

    try:
        model_files = [
            f.name for f in target_dir.iterdir()
            if f.is_file() and f.suffix.lower() in ['.gguf', '.bin']
        ]
        log.info("Found models", count=len(model_files), directory=req.path)
        return model_files
    except Exception as e:
        log.exception("Failed to list models", path=req.path, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to read directory {req.path}: {e}")

@tools_api.get(
    "/tools/conda/envs",
    response_model=List[Dict[str, Any]],
    summary="List Conda Environments"
)
def list_envs():
    """
    Executes `conda env list` and parses the output.
    Note: This will only work if the server is run from a shell where `conda` is available.
    """
    try:
        # Run the command with a timeout and check for errors
        out = subprocess.run(
            ["conda", "env", "list"],
            capture_output=True,
            text=True,
            check=True, # Raise a CalledProcessError if the command returns a non-zero exit code
            timeout=10  # Prevent the request from hanging indefinitely
        )
        envs = []
        for line in out.stdout.splitlines():
            # Skip comments and empty lines
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            # Ensure the line has at least two parts (name and path)
            if len(parts) >= 2:
                envs.append({
                    "name": parts[0],
                    "path": parts[-1],
                    "isActive": "*" in line
                })
        return envs
    except FileNotFoundError:
        log.error("The 'conda' command was not found. Is Conda installed and in the system's PATH?")
        raise HTTPException(status_code=500, detail="The 'conda' command is not available to the server.")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        log.error("Failed to execute 'conda env list'", error=str(e), stderr=getattr(e, 'stderr', 'N/A'))
        raise HTTPException(status_code=500, detail=f"Could not list conda environments: {e}")

@tools_api.get("/tools/server/status", summary="Get mock server status")
def server_status():
    """Returns a mock status for a secondary development server."""
    return {"running": False, "port": None}

@tools_api.get("/tools/server/logs", summary="Get mock server logs")
def server_logs():
    """Returns mock logs for a secondary development server."""
    try:
        with open("server.log") as f:
            lines = f.read().splitlines()[-200:]
    except FileNotFoundError:
        lines = []
    return {"logs": lines}
    
@tools_api.post("/tools/project/get-file-content", response_model=FileContentResponse)
def get_file_content(req: FilePathRequest):
    """Safely reads and returns the content of a file within the project."""
    file_path = resolve_safe_path(project_root, req.path)

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {req.path}")
    
    try:
        # For media files, we'll send a base64 string
        if file_path.suffix.lower() in ['.png', '.jpg', '.jpeg', '.pdf', '.tiff']:
            import base64
            media_type = f"image/{file_path.suffix[1:]}" if file_path.suffix != '.pdf' else 'application/pdf'
            content = f"data:{media_type};base64,{base64.b64encode(file_path.read_bytes()).decode()}"
        else:
            content = file_path.read_text(encoding='utf-8')
        return FileContentResponse(content=content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

@tools_api.post("/tools/project/save-file-content", response_model=SuccessResponse)
def save_file_content(req: FileWriteRequest):
    """Safely writes content to a file within the project."""
    file_path = resolve_safe_path(project_root, req.path)

    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(req.content, encoding='utf-8')
        return SuccessResponse(success=True, message=f"File saved successfully to {req.path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

# --- OCR endpoint ---
@tools_api.post("/tools/project/run-ocr", response_model=OcrResponse)
def run_ocr(req: OcrRequest):
    """Runs Tesseract OCR on an image file within the project."""
    log.info("OCR request received", path=req.path)
    file_path = resolve_safe_path(project_root, req.path)

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found for OCR: {req.path}")
    
    try:
        image_bytes = file_path.read_bytes()
        image = Image.open(io.BytesIO(image_bytes))
        extracted_text = pytesseract.image_to_string(image)
        
        log.info("OCR successful", path=req.path, text_length=len(extracted_text))
        return OcrResponse(text=extracted_text)
    except Exception as e:
        log.exception("OCR processing failed", path=req.path)
        raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

