# ClassCapsule — Local Installation Guide

This guide explains how to run ClassCapsule locally while using the hosted Groq API for AI features.

## Requirements

- Python 3.11 recommended
- Git
- A Groq API key from [Groq Console](https://console.groq.com/keys)

## 1. Get the project

```bash
git clone https://github.com/shivmodi21/ClassCapsule.git
cd ClassCapsule
```

If you already have the project, open a terminal at its root directory.

## 2. Create and activate a virtual environment

**Windows PowerShell:**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell activation is blocked, use Command Prompt:

```bat
.venv\Scripts\activate.bat
```

**macOS/Linux:**

```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

## 3. Install dependencies

From the repository root, run:

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 4. Set the Groq API key

Create an API key at [https://console.groq.com/keys](https://console.groq.com/keys). Set it in the same terminal session that will run the backend.

**Windows PowerShell:**

```powershell
$env:GROQ_API_KEY = "your_actual_groq_api_key"
```

**Windows Command Prompt:**

```bat
set GROQ_API_KEY=your_actual_groq_api_key
```

**macOS/Linux:**

```bash
export GROQ_API_KEY="your_actual_groq_api_key"
```

Optional model overrides can be set as environment variables `GROQ_CHAT_MODEL` and `GROQ_STT_MODEL`. Check [Groq's model documentation](https://console.groq.com/docs/models) for currently supported models. Never commit your actual API key to GitHub.

## 5. Launch the app

Make sure your virtual environment is active and `GROQ_API_KEY` is set, then run this command from the project root:

```bash
python -m uvicorn backend.app:app --reload
```

Open the app at [http://127.0.0.1:8000](http://127.0.0.1:8000). OpenAPI documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). Press `Ctrl+C` in the terminal to stop the server.

When opening a new terminal, reactivate `.venv` and set `GROQ_API_KEY` again.

## Troubleshooting

- **API key missing:** Set `GROQ_API_KEY` in the same terminal before launching Uvicorn.
- **Authentication error:** Verify the key in Groq Console.
- **Rate limit or quota error:** Check your Groq account's current limits and model availability.
- **App or frontend not found:** Run Uvicorn from the repository root, where the `backend/` and `frontend/` directories are located.

## Render deployment branch

The project's deployment branch is **`test-v3`**. For a Render deployment, make sure `render.yaml` is in the repository root and its service configuration points to `test-v3`.

Push changes to that branch with:

```bash
git add .
git commit -m "Describe your changes"
git push origin test-v3
```

For automatic deployments, open the service in [Render Dashboard](https://dashboard.render.com/), go to **Settings → Build & Deploy**, and set **Auto-Deploy** to **On Commit**. If using a Blueprint, enable auto-sync as well if you want Blueprint configuration changes to sync from Git.
