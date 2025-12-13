# filename: app.py
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import math
import uuid
import os
import asyncio

# --- Replace this with your actual model client (OpenAI, etc.) ---
# Example minimal interface used below:
class ModelClient:
    """
    Implement `async def summarize_chunks(self, prompts: List[str]) -> List[str]`
    to call your preferred LLM or summarization model. The example below uses a
    hypothetical async call; replace with real SDK calls (openai.ChatCompletion.acreate, etc.).
    """
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    async def summarize_chunks(self, prompts: List[str]) -> List[str]:
        # Placeholder: simply echo or do naive shortening.
        # Replace this with real model calls and prompt engineering.
        await asyncio.sleep(0.1 * len(prompts))
        return [f"SUMMARY_OF_CHUNK_{i+1}: " + (p[:200] + "..." if len(p) > 200 else p) for i, p in enumerate(prompts)]

    async def consolidate_summaries(self, partials: List[str], query: str) -> str:
        # Replace with a call that instructs the model to combine partial summaries
        await asyncio.sleep(0.1)
        return "CONSOLIDATED: " + " ".join(p[:300] for p in partials)

# instantiate model client (swap in real client)
model_client = ModelClient(api_key=os.environ.get("MODEL_API_KEY"))

# --- FastAPI app ---
app = FastAPI(title="Lecture Summarizer API", version="1.0")

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
    prompt = f"{header}\n\nExcerpt:\n{chunk.text}\n\nOutput:"
    return prompt

# --- Main summarization endpoint ---
@app.post("/v1/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    if not req.transcript or len(req.transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Transcript is empty")

    # chunk transcript
    # choose chunk size based on expected model context; adjust as desired
    approx_max_chars = 4000 if req.max_tokens_for_model and req.max_tokens_for_model >= 2000 else 2500
    chunks = chunk_transcript(req.transcript, max_chars=approx_max_chars)

    # build prompts for each chunk
    prompts = [build_prompt_for_chunk(ch, req.options, i + 1, len(chunks)) for i, ch in enumerate(chunks)]

    # call model to summarize each chunk (replace with real model calls)
    try:
        partial_summaries = await model_client.summarize_chunks(prompts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {e}")

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

# --- Health and example endpoints ---
@app.get("/health")
async def health():
    return {"status": "ok"}

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
