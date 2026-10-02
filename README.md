# 🎓 ClassCapsule – Student Assistant

ClassCapsule is a lightweight **Student Assistant** designed to help summarize lecture transcripts and assist students during their learning.  
It uses a **FastAPI backend** and a simple **HTML/CSS/JS frontend**, making it easy to prototype and extend.

---

## 🚀 Features
- Lecture transcript summarization
- Simple backend API using FastAPI
- Lightweight frontend (HTML + CSS + JS)
- Easy local setup for development and testing

---

## 🛠️ Tech Stack
- **Backend:** Python, FastAPI, Uvicorn
- **Frontend:** HTML, CSS, JavaScript
- **Environment:** Python Virtual Environment (`.venv`)

---

## 📦 Installation & Setup

### Prerequisites
- Python 3.10+
- Git
- FFmpeg (required for audio transcription)

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/shivmodi21/ClassCapsule.git
cd ClassCapsule
````

---

### 2️⃣ Create and Activate Virtual Environment

#### On Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

#### On macOS / Linux

```bash
python -m venv .venv
source .venv/bin/activate
```

---

### 3️⃣ Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### Install FFmpeg (Required for Whisper)

#### Windows
1. Download FFmpeg (ffmpeg-release-essentials.zip) from https://www.gyan.dev/ffmpeg/builds/
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to PATH
4. Restart terminal

Verify:
```bash
ffmpeg -version
```
---

#### Install Ollama

Download and install:

👉 [https://ollama.com/download](https://ollama.com/download)

After installation verify:

```bash
ollama --version
```

---

#### 🤖 Install AI Models

ClassCapsule uses **local AI models** via Ollama. The app lists models that are already installed. It does not download them for you.

Keep the backend terminal running. Use a **second terminal** for Ollama.

##### If the model dropdown shows an error

Ollama is not running. In that second terminal, start it and leave it open:

```bash
ollama serve
```

Then refresh http://127.0.0.1:8000, or click **Check for models** in the page.

##### Choose a model and install it

Pick one model and run its command in the second terminal. Then refresh the page.

| Model | Command | Rough size |
| --- | --- | --- |
| Llama 3.2 3B | `ollama pull llama3.2` | about 2 GB |
| Gemma 2 2B | `ollama pull gemma2:2b` | about 1.6 GB |
| Qwen 2.5 3B | `ollama pull qwen2.5:3b` | about 2 GB |
| Phi-3 mini | `ollama pull phi3` | about 2.2 GB |
| Mistral 7B | `ollama pull mistral` | about 4.5 GB |

Mistral needs about **4.5GB+ free RAM**. The smaller models are a better fit on CPU.

You can install a different Ollama text model the same way. In the app, type that model name under the dropdown. The page shows the exact `ollama pull` command to run in the other terminal. After the download finishes, click **Check for models**.

---

## ▶️ Running the Application

### Start Backend Server

```bash
python -m uvicorn backend.app:app --reload
```

The website and API start at:

```
http://127.0.0.1:8000
```

Open that address in **Chrome** or **Microsoft Edge**. You do not need to open `frontend/index.html` separately.

---

## 📁 Project Structure

```text
ClassCapsule/
│
├── backend/
│   └── app.py          # FastAPI backend
│
├── frontend/
│   └── index.html
│   └── style.css
│   └── script.js
│
├── .gitignore          # Cache and Data to be ignored by git
├── requirements.txt    # Python dependencies
├── README.md
└── .venv/              # Virtual environment (ignored by git)
```

---

## 🧪 Development Notes

* The backend supports hot reload using `--reload`
* The frontend communicates with the backend API
* Designed as a prototype-friendly architecture

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome.
Feel free to fork the repository and submit a pull request.

---

## 📄 License

This project is open-source and intended for educational purposes.

---

## Author

**Shiv Modi** — B.Tech. + M.Tech., IIT Bombay  
[GitHub](https://github.com/shivmodi21) · [Portfolio](https://shivmodi21.github.io/) · [LinkedIn](https://www.linkedin.com/in/shivmodi210/)
