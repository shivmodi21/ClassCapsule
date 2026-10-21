# ClassCapsule — Local Installation Guide

This guide runs ClassCapsule locally while using Groq's hosted API for audio transcription and text summarization. You do not need Ollama, local AI model downloads, or FFmpeg for this version.

## Requirements

- Python 3.11 recommended
- Git
- A Groq API key from https://console.groq.com/keys

## 1. Get the source code

```bash
git clone https://github.com/shivmodi21/ClassCapsule.git
cd ClassCapsule
```

If you already have the repository, open a terminal in its root directory instead.

## 2. Create a virtual environment

### Windows PowerShell

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### Windows Command Prompt

```bat
py -3.11 -m venv .venv
.venv\Scripts\activate.bat
```

### macOS / Linux

```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

## 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 4. Set your API key

Create a key at https://console.groq.com/keys. Set it in the same terminal you will use to launch the app.

### Windows PowerShell

```powershell
$env:GROQ_API_KEY = "your_actual_groq_api_key"
```

### Windows Command Prompt

```bat
set GROQ_API_KEY=your_actual_groq_api_key
```

### macOS / Linux

```bash
export GROQ_API_KEY="your_actual_groq_api_key"
```

Do not paste the real key into source code or commit it to GitHub. The application reads these environment variables when the backend starts.

Optional model overrides:

```text
GROQ_CHAT_MODEL=openai/gpt-oss-20b
GROQ_STT_MODEL=whisper-large-v3-turbo
```

These are defaults; confirm current availability in https://console.groq.com/docs/models.

## 5. Run the server

From the project root, with the virtual environment activated and the API key set:

```bash
python -m uvicorn backend.app:app --reload
```

Open:

- App: http://127.0.0.1:8000
- API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

Keep the terminal running while you use the app. Press `Ctrl+C` to stop it. After restarting the terminal, reactivate `.venv` and set the API key again.

## Troubleshooting

- **AI provider not configured:** Ensure `GROQ_API_KEY` is set in the same terminal and restart Uvicorn.
- **Authentication or quota error:** Verify the key in Groq Console and check the account's current model access, usage, and rate limits.
- **Model unavailable:** Set `GROQ_CHAT_MODEL` or `GROQ_STT_MODEL` to a currently supported model, then restart the server.
- **Frontend doesn't load:** Run Uvicorn from the repository root so the `backend/` and `frontend/` paths resolve correctly.
