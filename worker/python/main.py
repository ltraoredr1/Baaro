import os
import hmac
import hashlib
import time
import json
import unicodedata
from fastapi import FastAPI, Request, HTTPException

app = FastAPI(title="BAARO Python Engine", version="1.0.0")
SECRET = os.getenv("BAARO_PYTHON_SECRET", "")

@app.get("/health")
async def health():
    return {"service": "baaro-python", "status": "ok"}

@app.post("/v1/process")
async def process(request: Request):
    body = await request.body()
    timestamp = request.headers.get("x-baaro-timestamp", "")
    signature = request.headers.get("x-baaro-signature", "")

    if not SECRET or not timestamp or not signature:
        raise HTTPException(401, "Unauthorized")

    try:
        if abs(int(timestamp) - int(time.time())) > 60:
            raise HTTPException(401, "Expired request")
    except ValueError:
        raise HTTPException(401, "Invalid timestamp")

    signed = timestamp.encode() + b"." + body
    expected = hmac.new(
        SECRET.encode(), signed, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Invalid signature")

    try:
        data = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    task = data.get("task")
    text = data.get("input", {}).get("text", "")

    if not isinstance(text, str) or len(text) > 20000:
        raise HTTPException(400, "Invalid text")

    if task == "text.normalize":
        result = unicodedata.normalize("NFC", text.strip())

    elif task == "text.analyze":
        result = {
            "characters": len(text),
            "words": len(text.split()),
            "lines": len(text.splitlines())
        }

    else:
        raise HTTPException(400, "Unsupported task")

    return {"success": True, "task": task, "result": result}
