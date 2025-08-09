# File: backend/security.py
from fastapi import Depends, Header, HTTPException, status
from backend.config import get_settings, Settings

def require_api_key(
    settings: Settings = Depends(get_settings),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
):
    if not settings.api_key_required:
        return  # open mode (dev)
    if not settings.api_key_secret or x_api_key != settings.api_key_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
