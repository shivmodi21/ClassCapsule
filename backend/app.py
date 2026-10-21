# filename: app.py
from typing import List, Optional, Literal, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from groq import Groq
import os
import re
import uuid
import asyncio
import logging

logger = logging.getLogger(__name__)

# Hosted inference configuration. Set GROQ_API_KEY in Render's Environment tab.
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "openai/gpt-oss-20b")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_groq_client = None


def get_groq_client() -> Groq:
    """Return a lazily initialized Groq client, or a clear setup error."""
    global _groq_client
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AI_PROVIDER_NOT_CONFIGURED",
                "message": "API key is not set.",
            },
        )
    if _groq_client is None:
        _groq_client = Groq(api_key=GROQ_API_KEY, timeout=300.0, max_retries=2)
    return _groq_client


class ModelClient:
    """Small adapter around Groq's hosted chat-completions API."""
    def __init__(self, model: str = GROQ_CHAT_MODEL):
        self.model = model
        self.client = get_groq_client()

    def _generate(self, prompt: str, max_tokens: int = 200, temperature: float = 0.3) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=max_tokens,
            temperature=temperature,
        )
        content = response.choices[0].message.content
        return (content or "").strip()

    async def summarize_chunks(self, prompts: List[str]) -> List[str]:
        semaphore = asyncio.Semaphore(2)

        async def generate_summary(prompt: str) -> str:
            async with semaphore:
                return await asyncio.to_thread(
                    self._generate, prompt, max_tokens=500, temperature=0.3
                )

        summaries = await asyncio.gather(
            *(generate_summary(prompt) for prompt in prompts),
            return_exceptions=True,
        )
        failures = [item for item in summaries if isinstance(item, Exception)]
        if failures:
            raise failures[0]
        return [str(item).strip() for item in summaries]

    async def consolidate_summaries(self, partials: List[str], query: str) -> str:
        combined_text = "\n\n".join(partials)
        final_prompt = (
            "You are an academic assistant. Follow the instructions and use only the "
            "information in the supplied partial summaries.\n"
            f"{query.strip()}\n\nPartial summaries:\n{combined_text}\n\nFinal summary:"
        )
        return await asyncio.to_thread(
            self._generate, final_prompt, max_tokens=800, temperature=0.3
        )


model_client = None
loaded_model = None

# --- FastAPI app ---
app = FastAPI(title="ClassCapsule API", version="1.1")

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
    model: Optional[str] = None
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
def _line_timestamp(line: str) -> Optional[str]:
    if line.startswith("[") and "]" in line[:10]:
        return line.split("]", 1)[0].lstrip("[")
    return None


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

        # Split before applying this line so its timestamp stays with the new chunk.
        if current and cur_len + len(ln) + 1 > max_chars:
            flush_chunk()

        timestamp = _line_timestamp(ln)
        if timestamp:
            if start_time is None:
                start_time = timestamp
            end_time = timestamp

        current.append(ln)
        cur_len += len(ln) + 1

    flush_chunk()
    return chunks

_WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def safe_filename_stem(name: str, fallback: str = "lecture", strip_extension: bool = False) -> str:
    raw = (name or "").replace("\\", "/").split("/")[-1].strip()
    if strip_extension:
        raw = os.path.splitext(raw)[0]
    raw = re.sub(r"\s+", "_", raw)
    raw = re.sub(r"[^A-Za-z0-9._-]", "", raw).strip("._")
    if not raw:
        return fallback
    if raw.upper() in _WINDOWS_RESERVED_NAMES:
        raw = f"{raw}_file"
    return raw[:80]


def save_text_to_file(folder: str, filename: str, content: str):
    if not filename or filename != os.path.basename(filename) or filename in {".", ".."}:
        raise ValueError("Unsafe filename")
    os.makedirs(folder, exist_ok=True)
    folder_real = os.path.realpath(folder)
    path = os.path.realpath(os.path.join(folder_real, filename))
    if os.path.commonpath([folder_real, path]) != folder_real:
        raise ValueError("Unsafe filename")
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

    # The frontend lists only the model configured by the deployment owner.
    selected_model = req.model or GROQ_CHAT_MODEL
    if selected_model != GROQ_CHAT_MODEL:
        raise HTTPException(
            status_code=400,
            detail="Model not enabled on the server.",
        )
    print("Using hosted model:", selected_model)

    try:
        if model_client is None or loaded_model != selected_model:
            model_client = ModelClient(model=selected_model)
            loaded_model = selected_model
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not initialize hosted AI client")
        raise HTTPException(status_code=502, detail="Could not connect to AI provider.") from exc

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

    lecture_name = safe_filename_stem(req.lecture_title or "", "lecture")

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
async def transcribe_audio(
    file: UploadFile = File(...),
    lecture_title: Optional[str] = Form(None),
):
    """Transcribe uploaded audio using Groq-hosted Whisper; no local model download."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded audio file is empty")

    try:
        client = get_groq_client()
        result = await asyncio.to_thread(
            client.audio.transcriptions.create,
            file=(file.filename, contents),
            model=GROQ_STT_MODEL,
            response_format="verbose_json",
        )
        transcript_text = (getattr(result, "text", "") or "").strip()
        detected_language = getattr(result, "language", None)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Hosted audio transcription failed")
        raise HTTPException(
            status_code=502,
            detail={
                "error": "TRANSCRIPTION_PROVIDER_ERROR",
                "message": "Transcription failed.",
            },
        ) from exc

    if not transcript_text:
        raise HTTPException(status_code=502, detail="The transcription provider returned an empty transcript")

    stem_source = (lecture_title or "").strip() or file.filename
    safe_name = safe_filename_stem(
        stem_source,
        "lecture",
        strip_extension=not (lecture_title or "").strip(),
    )
    save_text_to_file("data/transcripts", f"{safe_name}_transcript.txt", transcript_text)

    return {"transcript": transcript_text, "language": detected_language}


# --- Endpoint to list the configured hosted model ---
@app.get("/v1/models")
async def get_models():
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AI_PROVIDER_NOT_CONFIGURED",
                "message": "API key is not set.",
            },
        )
    return {
        "models": [{
            "id": GROQ_CHAT_MODEL,
            "name": f"{GROQ_CHAT_MODEL}",
            "memory_required_gb": None,
        }]
    }

# --- Health and example endpoints ---
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ai_provider_configured": bool(GROQ_API_KEY),
        "chat_model": GROQ_CHAT_MODEL,
        "transcription_model": GROQ_STT_MODEL,
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


_frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
