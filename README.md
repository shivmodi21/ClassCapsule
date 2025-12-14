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

## ▶️ Running the Application

### Start Backend Server

```bash
python -m uvicorn backend.app:app --reload
```

The backend will start at:

```
http://127.0.0.1:8000
```

---

### Open Frontend

Open the following file directly in your browser (**Chrome** or **Microsoft Edge**):

```text
frontend/index.html
```

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

