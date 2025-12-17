document.addEventListener("DOMContentLoaded", () => {

  // ================== ELEMENTS ==================
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const clearBtn = document.getElementById("clearBtn");

  const transcriptEl = document.getElementById("transcript");
  const summaryEl = document.getElementById("summary");
  const statusEl = document.getElementById("status");

  const lectureNameInput = document.getElementById("lectureName");
  const lectureError = document.getElementById("lectureError");

  const downloadTranscriptBtn = document.getElementById("downloadTranscriptBtn");
  const summarizeBtn = document.getElementById("summarizeBtn");
  const downloadSummaryBtn = document.getElementById("downloadSummaryBtn");

  const audioFileInput = document.getElementById("audioFileInput");
  const uploadAudioBtn = document.getElementById("uploadAudioBtn");
  const audioStatus = document.getElementById("audioStatus");
  const detectedLanguageEl = document.getElementById("detectedLanguage");

  const langSelect = document.getElementById("langSelect");

  // ================== SPEECH RECOGNITION ==================
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    statusEl.innerText = "Speech recognition not supported. Use Chrome or Edge.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;

  let isRecording = false;

  function applyLanguage() {
    recognition.lang = langSelect.value || "en-US";
  }

  recognition.onstart = () => {
    statusEl.innerText = "Status: LISTENING...";
  };

  recognition.onresult = (event) => {
    let text = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        text += event.results[i][0].transcript + " ";
      }
    }

    if (text.trim()) {
      transcriptEl.innerText += text;
      downloadTranscriptBtn.disabled = false;
      summarizeBtn.disabled = false;
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== "no-speech") {
      statusEl.innerText = "Mic error: " + event.error;
    }
  };

  recognition.onend = () => {
    if (isRecording) {
      // Chrome stops automatically on silence → restart ONCE
      setTimeout(() => {
        try {
          recognition.start();
        } catch {}
      }, 500);
    } else {
      statusEl.innerText = "Status: STOPPED";
    }
  };

  // ================== BUTTONS ==================
  startBtn.onclick = () => {
    applyLanguage();
    isRecording = true;

    audioFileInput.disabled = true;
    uploadAudioBtn.disabled = true;

    startBtn.disabled = true;
    stopBtn.disabled = false;

    try {
      recognition.start();
    } catch {}
  };

  stopBtn.onclick = () => {
    isRecording = false;
    try {
      recognition.stop();
    } catch {}

    startBtn.disabled = false;
    stopBtn.disabled = true;

    audioFileInput.disabled = false;
    uploadAudioBtn.disabled = false;
  };

  clearBtn.onclick = () => {
    if (!confirm("Clear current lecture and start new one?")) return;

    transcriptEl.innerText = "";
    summaryEl.innerText = "";
    lectureNameInput.value = "";
    detectedLanguageEl.innerText = "";

    downloadTranscriptBtn.disabled = true;
    summarizeBtn.disabled = true;
    downloadSummaryBtn.disabled = true;

    statusEl.innerText = "Status: IDLE";
  };

  // ================== AUDIO UPLOAD ==================
  uploadAudioBtn.onclick = async () => {
    const file = audioFileInput.files[0];
    if (!file) {
      audioStatus.innerText = "Select an audio file first.";
      return;
    }

    audioStatus.innerText = "Uploading & transcribing...";
    startBtn.disabled = true;
    stopBtn.disabled = true;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/v1/transcribe", {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      transcriptEl.innerText = data.transcript || "";
      detectedLanguageEl.innerText = data.language
        ? "Detected language: " + data.language.toUpperCase()
        : "";

      downloadTranscriptBtn.disabled = false;
      summarizeBtn.disabled = false;
      audioStatus.innerText = "Transcription complete.";

    } catch {
      audioStatus.innerText = "Transcription failed.";
    }

    startBtn.disabled = false;
  };

  // ================== SUMMARIZE ==================
  summarizeBtn.onclick = async () => {
    lectureError.innerText = "";

    const lectureName = lectureNameInput.value.trim();
    if (!lectureName) {
      lectureError.innerText = "Lecture name required.";
      return;
    }

    const transcript = transcriptEl.innerText.trim();
    if (!transcript) return;

    summaryEl.innerText = "Summarizing...";
    summarizeBtn.disabled = true;

    try {
      const res = await fetch("http://127.0.0.1:8000/v1/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript })
      });

      const data = await res.json();
      summaryEl.innerText = data.summary_text || "";
      downloadSummaryBtn.disabled = false;

    } catch {
      summaryEl.innerText = "Backend error.";
    }

    summarizeBtn.disabled = false;
  };

});
