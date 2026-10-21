# ClassCapsule — AI Lecture Assistant

**Turn your lectures into clear, organized notes with AI.**

🌐 **Live demo:** [https://classcapsule.onrender.com/](https://classcapsule.onrender.com/)

ClassCapsule is a lightweight lecture assistant with an HTML/CSS/JavaScript frontend and a FastAPI backend. It can transcribe uploaded lecture audio, capture speech through the browser where supported, and summarize transcripts using a hosted AI model through the Groq API.

## Features

- Transcribe uploaded audio using a hosted speech-to-text model.
- Capture live speech using the browser's Web Speech API (browser support required).
- Generate concise lecture summaries from transcripts using a hosted language model.
- Choose the configured hosted summarization model from the model selector.
- Edit transcripts before summarizing.
- Download the transcript and summary as text files.
- Support multiple speech-recognition languages in browsers that provide them.

## Tech stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, FastAPI, Uvicorn
- **Hosted AI:** Groq API
- **Deployment:** Render

## Live demo

Try ClassCapsule here: [https://classcapsule.onrender.com/](https://classcapsule.onrender.com/)

The demo may take a little time to respond after inactivity because Render's free web services can spin down. AI availability is also subject to the provider's account limits, model availability, and rate limits.

## Local installation

### Prerequisites

- Python 3.11 (recommended; the deployment configuration uses Python 3.11.11)
- Git
- A Groq API key: [Create one in Groq Console](https://console.groq.com/keys)

You do **not** need to install Ollama, download a local language model, or install FFmpeg for this hosted-AI version. Uploaded-audio transcription is handled by the hosted API.

### 1. Clone the repository

```bash
git clone https://github.com/shivmodi21/ClassCapsule.git
cd ClassCapsule
```

### 2. Create and activate a virtual environment

**Windows PowerShell:**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, you can use Command Prompt instead:

```bat
.venv\Scripts\activate.bat
```

**macOS / Linux:**

```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

### 3. Install Python dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Configure your Groq API key

Set the key in the terminal where you will run the server. Do not commit your API key to Git or put it in frontend JavaScript.

**Windows PowerShell:**

```powershell
$env:GROQ_API_KEY = "your_actual_groq_api_key"
```

**macOS / Linux (bash/zsh):**

```bash
export GROQ_API_KEY="your_actual_groq_api_key"
```

Optional model overrides (defaults are shown):

```text
GROQ_CHAT_MODEL=openai/gpt-oss-20b
GROQ_STT_MODEL=whisper-large-v3-turbo
```

Check [Groq's current model documentation](https://console.groq.com/docs/models) for availability and supported limits. The API key and any model quotas are managed by Groq, separately from Render hosting.

### 5. Start the application

Run this command from the repository root:

```bash
python -m uvicorn backend.app:app --reload
```

Open the app in your browser:

- **Application:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **API documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health check:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

Keep the terminal open while using the app. Press `Ctrl+C` to stop the server. If you open a new terminal, activate `.venv` and set `GROQ_API_KEY` again before starting the app.

## Deploy on Render

This repository includes `render.yaml` for Render Blueprint deployment.

1. Push the project to GitHub, including `render.yaml` at the repository root.
2. In [Render Dashboard](https://dashboard.render.com/), select **New → Blueprint** and connect the repository.
3. Keep the service root directory blank because `backend/`, `frontend/`, and `requirements.txt` are at the repository root.
4. When prompted, set `GROQ_API_KEY` as a secret environment variable. Never add the real key to `render.yaml` or commit it to Git.
5. Apply the Blueprint and wait for the service deployment to complete.
6. Set the service's branch and auto-deploy settings to match the branch you push to if you want commits to trigger deployments automatically.

The Render service serves the frontend and API from the same URL. The health check is `/health`.

## Project structure

```text
ClassCapsule/
├── backend/
│   └── app.py
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── requirements.txt
├── render.yaml
├── .python-version
├── .gitignore
└── README.md
```

## Notes and limitations

- **API usage:** Groq's availability, pricing, quotas, and rate limits depend on its current plan and model. Check the provider's documentation before processing long recordings.
- **Free hosting:** Render free web services may spin down after inactivity, so the first request after a quiet period can be slow.
- **Saved files:** The backend writes generated text under `data/`. Files on Render's default filesystem are not durable across all restarts or redeployments; use persistent or external storage if you need long-term retention.
- **Live microphone recording:** This feature depends on browser support for the Web Speech API. Uploaded audio uses the hosted transcription API.
- **Privacy:** Do not upload sensitive or confidential recordings unless you are comfortable with the relevant provider's data-handling terms.

## Author

**Shiv Modi** — B.Tech. + M.Tech., IIT Bombay  
[GitHub](https://github.com/shivmodi21) · [Portfolio](https://shivmodi21.github.io/) · [LinkedIn](https://www.linkedin.com/in/shivmodi210/)
