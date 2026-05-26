# filename: app.py
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

class ModelService():

    def check_ollama_running(self, url="http://localhost:11434"):
        try:
            r = requests.get(url, timeout=2)
            return r.status_code == 200
        except requests.exceptions.RequestException:
            return False
    
    def check_model_available(self, model="mistral"):
        try:
            r = requests.get("http://localhost:11434/api/tags", timeout=5)
            r.raise_for_status()

            models = [m["name"] for m in r.json().get("models", [])]

            # match mistral, mistral:latest, mistral:7b, etc.
            return any(m.startswith(model + ":") or m == model for m in models)

        except requests.exceptions.RequestException:
            return False
        
    def get_available_models(self):
        try:
            r = requests.get(
                "http://localhost:11434/api/tags",
                timeout=5
            )
            r.raise_for_status()

            models = r.json().get("models", [])

            formatted_models = []

            for model in models:
                size_bytes = model.get("size", 0)
                size_gb = round(size_bytes / (1024**3), 2)

                formatted_models.append({
                    "id": model.get("name"),
                    "name": model.get("name"),
                    "memory_required_gb": size_gb
                })

            return formatted_models

        except requests.exceptions.RequestException:
            return []

class ModelClient:
    def __init__(self, model="mistral:latest"):
        self.url = "http://localhost:11434/api/generate"
        self.model = model

    def _generate(self, prompt: str, max_tokens: int = 200, temperature: float = 0.3) -> str:
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature
            }
        }
        try:
            response = requests.post(self.url, json=payload, timeout=300)
            response.raise_for_status()
            data = response.json()

            if response.status_code != 200:
                raise Exception(
                    f"Ollama Error {response.status_code}: "
                    f"{response.text}"
                )

            data = response.json()
            return data.get("response", "").strip()

        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to connect to Ollama: {e}")
    
    async def summarize_chunks(self, prompts: List[str]) -> List[str]:
        semaphore = asyncio.Semaphore(2)

        async def generate_summary(prompt):
            async with semaphore:
                return await asyncio.to_thread(
                    self._generate,
                    prompt,
                    max_tokens=200,
                    temperature=0.3
                )

        tasks = [
            generate_summary(prompt)
            for prompt in prompts
        ]

        summaries = await asyncio.gather(*tasks, return_exceptions=True)

        cleaned = []

        for s in summaries:
            if isinstance(s, Exception):
                cleaned.append("Summary generation failed.")
            else:
                cleaned.append(s.strip())

        return cleaned

    async def consolidate_summaries(self, partials: List[str], query: str) -> str:
        combined_text = "\n".join(partials)

        final_prompt = f"""
            You are an academic assistant.
            Combine the following partial summaries into a clear, concise lecture summary.

            {combined_text}

            Final summary:
            """

        final_summary = await asyncio.to_thread(
            self._generate,
            final_prompt,
            max_tokens=300,
            temperature=0.3
        )

        return final_summary.strip()

# instantiate model client and whisper model globally
model_service = ModelService()
model_client = None
whisper_model = None
loaded_model = None

# --- FastAPI app ---
app = FastAPI(title="ClassCapsule API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request / Response models ---
class SummaryOptions(BaseModel):
    length: Literal["short", "medium", "long"] = Field("medium", description="Desired summary length")
    format: Literal["paragraph", "bullets"] = Field("bullets", description="Output format")
    include_timestamps: bool = Field(False, description="Include timestamps for key points if transcript includes them")
    extract_qna: bool = Field(False, description="Extract Q&A pairs found in transcript")
    extract_actions: bool = Field(False, description="Extract action items mentioned")
    speakers_as_sections: bool = Field(False, description="Split summary by speaker when speaker labels present")

class SummarizeRequest(BaseModel):
    transcript: str = Field(..., description="Full lecture transcript text. Prefer format: [00:05:12] Speaker: ...")
    options: SummaryOptions = Field(default_factory=SummaryOptions)
    # optional metadata
    model: Optional[str] = "mistral:latest"
    lecture_title: Optional[str] = None
    max_tokens_for_model: Optional[int] = 3000

class SummarizeChunk(BaseModel):
    chunk_id: str
    text: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None

class SummarizeResponse(BaseModel):
    summary_id: str
    summary_text: str
    format: str
    length: str
    metadata: Dict[str, Any] = {}
    # optionally return qna and actions if requested
    qna: Optional[List[Dict[str, str]]] = None
    actions: Optional[List[str]] = None

# --- Utility: chunk transcript into manageable pieces ---
def chunk_transcript(transcript: str, max_chars: int = 4000) -> List[SummarizeChunk]:
    """
    Simple character-based chunking that tries to preserve speaker/timestamps by splitting on line breaks.
    For more advanced splitting, parse timestamps and use time windows.
    """
    lines = transcript.splitlines()
    chunks: List[SummarizeChunk] = []
    current = []
    cur_len = 0
    start_time = None
    end_time = None

    def flush_chunk():
        nonlocal current, cur_len, start_time, end_time
        if not current:
            return
        chunk_id = str(uuid.uuid4())
        chunk_text = "\n".join(current).strip()
        chunks.append(SummarizeChunk(chunk_id=chunk_id, text=chunk_text, start_time=start_time, end_time=end_time))
        current = []
        cur_len = 0
        start_time = None
        end_time = None

    for line in lines:
        ln = line.strip()
        if not ln:
            continue
        # attempt to detect timestamp like [00:03:21] at start of line
        if start_time is None:
            # a naive timestamp capture
            if ln.startswith("[") and "]" in ln[:10]:
                start_time = ln.split("]")[0].lstrip("[")
        end_time = None
        if ln.startswith("[") and "]" in ln[:10]:
            end_time = ln.split("]")[0].lstrip("[")

        # accumulate
        if cur_len + len(ln) + 1 > max_chars:
            flush_chunk()
        current.append(ln)
        cur_len += len(ln) + 1

    flush_chunk()
    return chunks

def save_text_to_file(folder: str, filename: str, content: str):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


# --- Prompt builder ---
def build_prompt_for_chunk(chunk: SummarizeChunk, options: SummaryOptions, idx: int, total: int) -> str:
    """
    Construct a prompt instructing the model how to summarise this chunk.
    Use system+user style when calling model SDK (not shown here).
    """
    header = f"Chunk {idx}/{total}. Summarize the following lecture excerpt."
    if options.speakers_as_sections:
        header += " Keep different speakers as separate sections if speaker names are present."
    if options.include_timestamps:
        header += " Preserve timestamps when mentioning key points if available."
    header += f" Produce a {options.length} length summary in {options.format} format."
    if options.extract_qna:
        header += " Also list any Q&A pairs found in this chunk."
    if options.extract_actions:
        header += " Also extract action items as short lines."
    prompt = f"""
    {header}

    === LECTURE TEXT START ===
    {chunk.text}
    === LECTURE TEXT END ===

    Output:
    """

    return prompt

# --- Main summarization endpoint ---
@app.post("/v1/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    global model_client
    global loaded_model

    print("Received summarize request")
    print(f"Transcript length: {len(req.transcript)} characters")
    
    if not req.transcript or len(req.transcript.strip()) == 0:
        raise HTTPException(status_code=400,
                            detail={
                                "error": "INVALID_REQUEST",
                                "message": "Transcript is empty",
                                "instructions": []
                            })

    # ensure model service is ready
    if not model_service.check_ollama_running():
        raise HTTPException(
            status_code=503,
            detail={
                "error": "LLM_NOT_READY",
                "message": "Ollama is not running",
                "instructions": [
                    "Install Ollama: https://ollama.com/download",
                    "Run: ollama serve",
                    "Run: ollama pull mistral"
                ]
            }
        )
    
    selected_model = req.model or "mistral:latest"
    print("Using model:", selected_model)

    base_model_name = (selected_model.split(":")[0])

    if not model_service.check_model_available(base_model_name):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "LLM_NOT_READY",
                "message":
                    f"{selected_model} not found",
                "instructions": [
                    f"Run: ollama pull {base_model_name}"
                ]
            }
        )

    # only switch if model changed
    if (model_client is None or loaded_model != selected_model):
        print(f"Loading model: {selected_model}")
        model_client = ModelClient(model=selected_model)
        loaded_model = selected_model
    else:
        print(f"Using cached model: {selected_model}")

    # chunk transcript
    # choose chunk size based on expected model context; adjust as desired
    approx_max_chars = 4000 if req.max_tokens_for_model and req.max_tokens_for_model >= 2000 else 2500
    chunks = chunk_transcript(req.transcript, max_chars=approx_max_chars)

    # build prompts for each chunk
    prompts = [build_prompt_for_chunk(ch, req.options, i + 1, len(chunks)) for i, ch in enumerate(chunks)]

    print(f"Created {len(chunks)} chunks for summarization")

    # call model to summarize each chunk (replace with real model calls)
    try:
        partial_summaries = await model_client.summarize_chunks(prompts)
        print(f"Obtained {len(partial_summaries)} partial summaries")
    except Exception as e:
        raise HTTPException(status_code=500,
                            detail={
                                "error": "MODEL_ERROR",
                                "message": f"Model Error: {e}",
                                "instructions": []
                            })

    # consolidate partial summaries into single final summary
    consolidate_query = (
        "Combine the partial summaries into one coherent summary. "
        f"Produce a {req.options.length} length summary in {req.options.format} format. "
    )
    try:
        final_summary = await model_client.consolidate_summaries(partial_summaries, consolidate_query)
    except Exception as e:
        # fallback: naive concatenation
        final_summary = "\n\n".join(partial_summaries)

    lecture_name = req.lecture_title or "lecture"
    lecture_name = lecture_name.replace(" ", "_")

    save_text_to_file(
        "data/summaries",
        f"{lecture_name}_summary.txt",
        final_summary
    )

    # Optionally extract Q&A and actions from the consolidated summary via additional model calls
    qna, actions = None, None
    if req.options.extract_qna:
        # placeholder: leave empty or re-run model to extract Q&A; implemented as naive pass-through
        qna = []
        for p in partial_summaries:
            if "?" in p:
                qna.append({"question": "Found in chunk", "answer": p.split("?")[-1][:200]})
    if req.options.extract_actions:
        actions = []
        for p in partial_summaries:
            if "action" in p.lower() or "to do" in p.lower():
                actions.append(p[:200])

    response = SummarizeResponse(
        summary_id=str(uuid.uuid4()),
        summary_text=final_summary,
        format=req.options.format,
        length=req.options.length,
        metadata={
            "chunk_count": len(chunks),
            "source_chars": len(req.transcript),
        },
        qna=qna,
        actions=actions,
    )
    return response


@app.post("/v1/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    global whisper_model

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Load Whisper model lazily
    if whisper_model is None:
        whisper_model = whisper.load_model("base")  # base is good for prototype

    # Save uploaded audio to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = whisper_model.transcribe(tmp_path)
        transcript_text = result["text"].strip()
        detected_language = result.get("language")

        safe_name = os.path.splitext(file.filename)[0]
        safe_name = safe_name.replace(" ", "_")

        save_text_to_file(
            "data/transcripts",
            f"{safe_name}_transcript.txt",
            transcript_text
        )

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not transcript_text:
        raise HTTPException(status_code=500, detail="Transcription failed")

    return {
        "transcript": transcript_text,
        "language": detected_language
    }

# --- Endpoint to list available models in Ollama ---
@app.get("/v1/models")
async def get_models():
    if not model_service.check_ollama_running():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running"
        )

    models = model_service.get_available_models()

    return {
        "models": models
    }

# --- Health and example endpoints ---
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ollama_running": model_service.check_ollama_running(),
        "model_available": model_service.check_model_available("mistral"),
        "model": "mistral"
    }

@app.get("/example_request")
def example_request():
    return {
        "transcript": "[00:00:05] Prof: Welcome to the lecture on probability.\n[00:05:12] Student: Can you explain Bayes' theorem?\n...",
        "options": {
            "length": "short",
            "format": "bullets",
            "include_timestamps": True,
            "extract_qna": True,
            "extract_actions": False,
            "speakers_as_sections": True
        },
        "lecture_title": "Intro to Probability"
    }
