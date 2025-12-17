from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import whisper
import tempfile
import os
import uuid
import asyncio
import requests

# ================= OLLAMA MODEL CLIENT =================

class ModelClient:
    def __init__(self):
        self.url = "http://localhost:11434/api/generate"
        self.model = "mistral"

    def _generate(self, prompt: str, max_tokens: int, temperature: float) -> str:
        response = requests.post(
            self.url,
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature
                }
            },
            timeout=300
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response", "").strip()

    async def summarize_chunks(self, prompts: List[str]) -> List[str]:
        results = []
        for p in prompts:
            text = await asyncio.to_thread(self._generate, p, 200, 0.3)
            results.append(text)
        return results

    async def consolidate_summaries(self, partials: List[str]) -> str:
        combined = "\n".join(partials)
        prompt = f"""
You are an academic assistant.
Combine the following partial summaries into one clear lecture summary.

{combined}

Final summary:
"""
        return await asyncio.to_thread(self._generate, prompt, 300, 0.3)

# ================= FASTAPI SETUP =================

app = FastAPI(title="ClassCapsule API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_client: Optional[ModelClient] = None
whisper_model = None

# ================= SCHEMAS =================

class SummaryOptions(BaseModel):
    length: Literal["short", "medium", "long"] = "medium"
    format: Literal["paragraph", "bullets"] = "bullets"

class SummarizeRequest(BaseModel):
    transcript: str
    options: SummaryOptions = Field(default_factory=SummaryOptions)
    lecture_title: Optional[str] = None

class SummarizeResponse(BaseModel):
    summary_id: str
    summary_text: str
    format: str
    length: str
    metadata: Dict[str, Any]

# ================= HELPERS =================

def chunk_transcript(text: str, max_chars: int = 4000) -> List[str]:
    chunks = []
    current = ""

    for line in text.splitlines():
        if len(current) + len(line) > max_chars:
            chunks.append(current)
            current = ""
        current += line + "\n"

    if current.strip():
        chunks.append(current)

    return chunks

def save_text(folder: str, name: str, content: str):
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
        f.write(content)

# ================= API =================

@app.post("/v1/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    global model_client

    if not req.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")

    if model_client is None:
        model_client = ModelClient()

    chunks = chunk_transcript(req.transcript)
    prompts = [
        f"Summarize the following lecture text:\n\n{c}\n\nSummary:"
        for c in chunks
    ]

    try:
        partials = await model_client.summarize_chunks(prompts)
        final = await model_client.consolidate_summaries(partials)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    filename = (req.lecture_title or "lecture") + "_summary.txt"
    save_text("data/summaries", filename, final)

    return SummarizeResponse(
        summary_id=str(uuid.uuid4()),
        summary_text=final,
        format=req.options.format,
        length=req.options.length,
        metadata={
            "chunks": len(chunks),
            "characters": len(req.transcript)
        }
    )

# ================= TRANSCRIPTION =================

@app.post("/v1/transcribe")
async def transcribe(file: UploadFile = File(...)):
    global whisper_model

    if whisper_model is None:
        whisper_model = whisper.load_model("base")

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name

    try:
        result = whisper_model.transcribe(path)
        text = result["text"].strip()
        save_text("data/transcripts", f"{uuid.uuid4()}.txt", text)
    finally:
        os.remove(path)

    return {"transcript": text, "language": result.get("language")}

@app.get("/health")
async def health():
    return {"status": "ok"}
