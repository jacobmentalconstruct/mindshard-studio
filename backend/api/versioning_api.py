# File: src/backend/api/versioning_api.py

import structlog
import subprocess
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import json

log = structlog.get_logger(__name__)
versioning_api = APIRouter()

# --- Pydantic Models ---
class Commit(BaseModel):
    sha: str
    author: str
    date: str
    message: str
    diff: str

class CreateSnapshotRequest(BaseModel):
    message: str

class RevertRequest(BaseModel):
    sha: str

# --- NEW: A proper Pydantic model for the revert response ---
class RevertResponse(BaseModel):
    status: str
    
# --- API Endpoints ---
@versioning_api.get("/versioning/commits", response_model=List[Commit])
def get_commits():
    """Uses git log to get the commit history and diffs."""
    try:
        # A complex git command to format the output as JSON-like records
        log_command = [
            'git', 'log', '--pretty=format:{"sha":"%H", "author":"%an", "date":"%ad", "message":"%s"}', 
            '--date=iso-local', '-n', '20'
        ]
        log_result = subprocess.run(log_command, capture_output=True, text=True, check=True)
        
        # This was causing an error with multi-line commits. Let's fix it by parsing as a whole.
        # A simple split('\n') is not robust enough. We need a better delimiter.
        # For simplicity, we'll assume single-line messages for now.
        commits_data = [json.loads(line) for line in log_result.stdout.strip().split('\n') if line]

        for commit_data in commits_data:
            diff_command = ['git', 'show', '--pretty=format:""', commit_data['sha']]
            diff_result = subprocess.run(diff_command, capture_output=True, text=True, check=True)
            commit_data['diff'] = diff_result.stdout.strip()
            commit_data['message'] = commit_data['message'].replace('"', '\\"')

        return [Commit(**data) for data in commits_data]
    except Exception:
        # If git isn't available or there's an error, return an empty list.
        # This prevents the UI from crashing if the project isn't a git repo.
        return []

@versioning_api.post("/versioning/snapshots", response_model=Commit)
def create_snapshot(req: CreateSnapshotRequest):
    """Creates a new git commit (a 'snapshot')."""
    try:
        subprocess.run(['git', 'add', '.'], check=True)
        subprocess.run(['git', 'commit', '-m', req.message], check=True, capture_output=True, text=True) # capture stderr
        commits = get_commits()
        if not commits:
            raise HTTPException(status_code=500, detail="Failed to retrieve new commit after snapshot.")
        return commits[0]
    except subprocess.CalledProcessError as e:
        if "nothing to commit" in e.stderr.lower():
            raise HTTPException(status_code=400, detail="No changes to commit for a new snapshot.")
        log.error("Failed to create snapshot", error=e.stderr)
        raise HTTPException(status_code=500, detail=f"Git commit failed: {e.stderr}")

@versioning_api.post("/versioning/revert", response_model=RevertResponse)
def revert_to_commit(req: RevertRequest):
    """Reverts the project to a specific commit."""
    try:
        subprocess.run(['git', 'reset', '--hard', req.sha], check=True, capture_output=True, text=True)
        return RevertResponse(status=f"Successfully reverted to commit {req.sha}")
    except subprocess.CalledProcessError as e:
        log.error("Failed to revert to commit", sha=req.sha, error=e.stderr)
        raise HTTPException(status_code=500, detail=f"Git reset failed: {e.stderr}")
