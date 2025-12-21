document.addEventListener("DOMContentLoaded", () => {

    let isRecording = false;  // "live" or "upload"
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const support = !!Recognition;

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
    const downloadSummaryBtn = document.getElementById('downloadSummaryBtn');
    const statusEl = document.getElementById('status');
    const transcriptEl = document.getElementById('transcript');
    const langSelect = document.getElementById('langSelect');
    const lectureNameInput = document.getElementById("lectureName");
    const lectureError = document.getElementById("lectureError");
    const summarizeBtn = document.getElementById("summarizeBtn");
    const summaryEl = document.getElementById("summary");

    const audioFileInput = document.getElementById("audioFileInput");
    const uploadAudioBtn = document.getElementById("uploadAudioBtn");
    const audioStatus = document.getElementById("audioStatus");
    const detectedLanguageEl = document.getElementById("detectedLanguage");

    const clearBtn = document.getElementById("clearBtn");


    downloadSummaryBtn.disabled = true;

    if (!support) {
        statusEl.innerText = "Web Speech API not supported. Use Chrome/Edge.";
    }

    let recog = support ? new Recognition() : null;

    function applyLanguage() {
        if (recog) {
            recog.lang = langSelect.value;
            console.log("Language set:", recog.lang);
        }
    }

    function isValidFilename(name) {
        // Windows + cross-platform safe
        const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
        return !invalidChars.test(name);
    }

    function updateButtons() {
        const hasText = transcriptEl.innerText.trim().length > 0;
        downloadTranscriptBtn.disabled = !hasText;
        summarizeBtn.disabled = !hasText;
    }

    function resetInputModes() {
        isRecording = false;

        // enable everything
        audioFileInput.disabled = false;
        uploadAudioBtn.disabled = false;

        startBtn.disabled = false;
        stopBtn.disabled = true;

        audioStatus.innerText = "";
        statusEl.innerText = "Status: IDLE";
    }

    function resetLecture() {
        // Clear text areas
        transcriptEl.innerText = "";
        summaryEl.innerText = "";

        // Clear inputs
        lectureNameInput.value = "";
        audioFileInput.value = "";

        // Reset statuses
        statusEl.innerText = "Status: IDLE";
        audioStatus.innerText = "";
        lectureError.innerText = "";

        // Reset buttons
        downloadTranscriptBtn.disabled = true;
        downloadSummaryBtn.disabled = true;
        summarizeBtn.disabled = true;
        startBtn.disabled = false;
        stopBtn.disabled = true;

        // Reset input modes
        resetInputModes();
    }

    if (recog) {
        recog.continuous = true;
        recog.interimResults = false;

        applyLanguage(); // initial

        recog.onstart = () => { statusEl.innerText = 'Status: listening...'; };
        recog.onend = () => {
            if (isRecording) {
                setTimeout(() => {
                try { recog.start(); } catch {}
                }, 500);
            } else {
                statusEl.innerText = "Status: STOPPED";
            }
        };
        recog.onerror = (e) => { statusEl.innerText = 'Error: ' + e.error; };

        recog.onresult = (event) => {
            let text = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    text += event.results[i][0].transcript + " ";
                }
            }
            if (text.trim()) {
                transcriptEl.innerText += text;
                updateButtons();
            }
        };
    }

    // Change language immediately
    langSelect.addEventListener('change', () => {
        applyLanguage();
        if (recog) try { recog.stop(); } catch {}
    });

    audioFileInput.addEventListener("change", () => {
        audioStatus.innerText = "";
    });

    lectureNameInput.addEventListener("input", () => {
        lectureError.innerText = "";
    });

    startBtn.onclick = () => {
        isRecording = true;

        startBtn.disabled = true;
        stopBtn.disabled = false;

        audioFileInput.disabled = true;
        uploadAudioBtn.disabled = true;
        audioStatus.innerText = "Audio upload disabled while recording.";

        applyLanguage();
        try { recog.start(); } catch {}
    };

    stopBtn.onclick = () => {
        isRecording = false;
        try { recog.stop(); } catch {}

        startBtn.disabled = false;
        stopBtn.disabled = true;

        audioFileInput.disabled = false;
        uploadAudioBtn.disabled = false;
    };

    clearBtn.onclick = () => {
        if (confirm("Clear current lecture and start a new one?")) {
            resetLecture();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    uploadAudioBtn.onclick = async () => {
        if (isRecording) {
            audioStatus.innerText = "Stop live recording before uploading audio.";
            return;
        }
        const file = audioFileInput.files[0];
        if (!file) {
            audioStatus.innerText = "Please select an audio file.";
            return;
        }

        // disable live recording
        startBtn.disabled = true;
        stopBtn.disabled = true;

        statusEl.innerText = "Live recording disabled while using audio upload.";
        audioStatus.innerText = "Uploading & transcribing… this may take 1-2 minutes.";

        const formData = new FormData();
        formData.append("file", file);

        try {
        const res = await fetch("http://127.0.0.1:8000/v1/transcribe", {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.detail);
            return;
        }

        const data = await res.json();

        transcriptEl.innerText = data.transcript;
        audioStatus.innerText = "Transcription complete.";

        if (data.language) {
            detectedLanguageEl.innerText = "Detected language: " + data.language.toUpperCase();
        }

        resetInputModes();
        updateButtons();

        } catch (err) {
            console.error(err);
            audioStatus.innerText = "Error during transcription.";
        }
    };


    downloadTranscriptBtn.onclick = () => {
        lectureError.innerText = "";

        const lectureName = lectureNameInput.value.trim();
        if (!lectureName) {
            lectureError.innerText = "Please enter a lecture name before downloading the transcript.";
            lectureNameInput.focus();
            return;
        }

        if (!isValidFilename(lectureName)) {
            lectureError.innerText =
            "Lecture name contains invalid characters. Use only letters, numbers, _ or -.";
            lectureNameInput.focus();
            return;
        }

        const text = transcriptEl.innerText.trim();
        if (!text){
            lectureError.innerText = "Transcript is empty. Nothing to download.";
            return;
        }
        
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${lectureName}_transcript.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    downloadSummaryBtn.onclick = () => {
        lectureError.innerText = "";

        const lectureName = lectureNameInput.value.trim();

        if (!lectureName) {
            lectureError.innerText = "Please enter a lecture name before downloading the summary.";
            lectureNameInput.focus();
            return;
        }

        if (!isValidFilename(lectureName)) {
            lectureError.innerText =
            "Lecture name contains invalid characters. Use only letters, numbers, _ or -.";
            lectureNameInput.focus();
            return;
        }

        const summary = summaryEl.innerText.trim();
        if (!summary) {
            lectureError.innerText = "Summary is empty. Please generate a summary first.";
            return;
        }

        const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${lectureName}_summary.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    summarizeBtn.onclick = async () => {
        lectureError.innerText = "";

        const lectureName = lectureNameInput.value.trim();
        if (!lectureName) {
            lectureError.innerText = "Lecture name is required.";
            return;
        }

        if (!isValidFilename(lectureName)) {
        lectureError.innerText =
            "Lecture name contains invalid characters for a file name.";
            return;
        }

        const transcript = transcriptEl.innerText.trim();
        if (!transcript) {
            lectureError.innerText = "Transcript is empty.";
            return;
        }

        // disable summarize during processing
        summarizeBtn.disabled = true;
        downloadSummaryBtn.disabled = true;
        summaryEl.innerText = "Summarizing... please wait (this may take 1-3 minutes).";

        try {
            const res = await fetch("http://127.0.0.1:8000/v1/summarize", {
                method: "POST",
                headers: {
                "Content-Type": "application/json"
                },
                body: JSON.stringify({
                transcript: transcript,
                options: {
                    length: "short",
                    format: "bullets",
                    include_timestamps: false,
                    extract_qna: false,
                    extract_actions: false,
                    speakers_as_sections: false
                }
                })
            });

            if (!res.ok) {
                console.error("Summarization failed:", res);

                let err;
                try {
                    err = await res.json();
                } catch (jsonErr) {
                    // THIS is what was happening
                    summaryEl.innerText =
                        `Server error (${res.status}). Please try again later.`;
                    summarizeBtn.disabled = false;
                    return;
                }

                if (!err.detail?.instructions) {
                    alert(err.detail?.message || "Server error");
                    return;
                }

                alert(err.detail.message + "\n\n" + err.detail.instructions.join("\n"));
                return;
            }


            const data = await res.json();
            summaryEl.innerText = data.summary_text;

            // enable buttons again
            downloadSummaryBtn.disabled = false;
            summarizeBtn.disabled = false;

            document.getElementById("summaryTitle").scrollIntoView({ behavior: "smooth" });

        } catch (err) {
            summaryEl.innerText = "Error connecting to backend.";
            console.error(err);

            // re-enable summarize so user can retry
            summarizeBtn.disabled = false;
        }
    };

});
