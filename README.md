# ClassCapsule — AI Lecture Assistant

Turn your lectures into clear, organized notes with AI.

**Live demo:** [https://classcapsule.onrender.com/](https://classcapsule.onrender.com/)

ClassCapsule provides a browser-based interface for transcribing lecture audio and generating summaries through a FastAPI backend and a hosted AI API.

## Features

- Transcribe uploaded audio using the configured hosted speech-to-text model.
- Capture live speech in supported browsers using the Web Speech API.
- Summarize transcripts with a hosted language model.
- Edit transcripts before summarizing.
- Download transcript and summary text files.

## Tech stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, FastAPI, Uvicorn
- **Hosted AI:** Groq API
- **Deployment:** Render

## Local installation

### Requirements

- Python 3.11 recommended
- Git
- A Groq API key: [Create one in Groq Console](https://console.groq.com/keys)

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

**Windows Command Prompt:**

```bat
py -3.11 -m venv .venv
.venv\Scripts\activate.bat
```

**macOS/Linux:**

```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Configure the API key

Set `GROQ_API_KEY` in the terminal you will use to run the app. Do not put the key in frontend code or commit it to Git.

**Windows PowerShell:**

```powershell
$env:GROQ_API_KEY = "your_actual_groq_api_key"
```

**macOS/Linux:**

```bash
export GROQ_API_KEY="your_actual_groq_api_key"
```

The optional model environment variables are `GROQ_CHAT_MODEL` and `GROQ_STT_MODEL`. Check [Groq's model documentation](https://console.groq.com/docs/models) for currently supported models and limits.

### 5. Start the application

Run from the repository root:

```bash
python -m uvicorn backend.app:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). Keep the terminal open while using the app; press `Ctrl+C` to stop the server.

More detailed instructions and troubleshooting are in [LOCAL_INSTALLATION.md](LOCAL_INSTALLATION.md).

## Deploy on Render

This repository is configured for Render Blueprint deployment using `render.yaml`.

1. Make sure `render.yaml` is in the **repository root**, next to `requirements.txt`.
2. The deployment branch for this project is **`test-v3`**. Ensure the service's `branch` field in `render.yaml` is set to `test-v3` and that Render is connected to that branch.
3. Commit and push changes to `test-v3`:

   ```bash
   git add .
   git commit -m "Describe your changes"
   git push origin test-v3
   ```

4. In [Render Dashboard](https://dashboard.render.com/), select **New → Blueprint** and connect the repository if you have not already done so.
5. Set `GROQ_API_KEY` as a secret environment variable in Render. Do not commit your real API key or place it in `render.yaml`.
6. To deploy new commits automatically, open the service's **Settings → Build & Deploy** and set **Auto-Deploy** to **On Commit**. Also make sure Blueprint auto-sync is enabled if you want changes to the Blueprint configuration in Git to sync automatically.

The `branch: test-v3` value in `render.yaml` should match the branch you push to. After setup, pushes to `test-v3` should trigger deployments when auto-deploy is enabled. If they do not, check the linked repository, branch, and service auto-deploy setting in Render.

## Notes

- Groq API usage has provider-specific rate limits and model availability; check the current plan and quotas.
- Render free web services may spin down after inactivity, so the first request after a quiet period can be slow.
- Files stored on Render's default filesystem may not persist across restarts or redeployments.
- Browser-based live speech recognition depends on browser support.

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
├── README.md
└── LOCAL_INSTALLATION.md
```

## Author

**Shiv Modi** — B.Tech. + M.Tech., IIT Bombay  
[GitHub](https://github.com/shivmodi21) · [Portfolio](https://shivmodi21.github.io/) · [LinkedIn](https://www.linkedin.com/in/shivmodi210/)
