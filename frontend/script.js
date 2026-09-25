document.addEventListener("DOMContentLoaded", () => {

    let isRecording = false;
    let recognitionStopReason = null;
    let lectureEpoch = 0;
    let summaryIsCurrent = false;
    let uploadController = null;
    let summarizeController = null;

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

    const modelSelect = document.getElementById("modelSelect");
    const modelMemoryInfo = document.getElementById("modelMemoryInfo");
    const modelHelp = document.getElementById("modelHelp");
    const modelHelpText = document.getElementById("modelHelpText");
    const modelToPull = document.getElementById("modelToPull");
    const modelPullCommand = document.getElementById("modelPullCommand");
    const modelNameError = document.getElementById("modelNameError");
    const reloadModelsBtn = document.getElementById("reloadModelsBtn");
    let selectedModel = "mistral:latest";
    let modelSelectBound = false;

    const FATAL_RECOGNITION_ERRORS = [
        "not-allowed",
        "service-not-allowed",
        "audio-capture",
        "network",
        "language-not-supported"
    ];

    downloadSummaryBtn.disabled = true;

    if (!support) {
        statusEl.innerText = "Web Speech API not supported. Use Chrome/Edge.";
        startBtn.disabled = true;
    }

    let recog = support ? new Recognition() : null;

    function applyLanguage() {
        if (recog) {
            recog.lang = langSelect.value;
            console.log("Language set:", recog.lang);
        }
    }

    function isValidFilename(name) {
        const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
        return !invalidChars.test(name);
    }

    function isCurrentLecture(epoch) {
        return epoch === lectureEpoch;
    }

    function updateButtons() {
        const hasText = transcriptEl.innerText.trim().length > 0;
        downloadTranscriptBtn.disabled = !hasText;
        summarizeBtn.disabled = !hasText;
    }

    function enableLiveInputs() {
        audioFileInput.disabled = false;
        uploadAudioBtn.disabled = false;
        startBtn.disabled = !support;
        stopBtn.disabled = true;
    }

    function abortInFlight() {
        if (uploadController) {
            uploadController.abort();
            uploadController = null;
        }
        if (summarizeController) {
            summarizeController.abort();
            summarizeController = null;
        }
    }

    function stopRecognition(reason) {
        isRecording = false;
        recognitionStopReason = reason;
        if (recog) {
            try { recog.stop(); } catch {}
        }
    }

    function invalidateSummary() {
        const inFlight = summarizeController !== null;
        if (!summaryIsCurrent && !inFlight) {
            return;
        }
        if (summarizeController) {
            const controller = summarizeController;
            summarizeController = null;
            controller.abort();
        }
        summaryIsCurrent = false;
        downloadSummaryBtn.disabled = true;
        summaryEl.innerText = inFlight
            ? "Transcript changed. Run summarize again."
            : "";
    }

    function clearSummaryOutput() {
        if (summarizeController) {
            const controller = summarizeController;
            summarizeController = null;
            controller.abort();
        }
        summaryIsCurrent = false;
        downloadSummaryBtn.disabled = true;
        summaryEl.innerText = "";
    }

    function requireLectureName(actionLabel) {
        lectureError.innerText = "";
        const lectureName = lectureNameInput.value.trim();
        if (!lectureName) {
            lectureError.innerText = `Please enter a lecture name before ${actionLabel}.`;
            lectureNameInput.focus();
            return null;
        }
        if (!isValidFilename(lectureName)) {
            lectureError.innerText =
                "Lecture name contains invalid characters. Use only letters, numbers, _ or -.";
            lectureNameInput.focus();
            return null;
        }
        return lectureName;
    }

    async function errorMessageFromResponse(res) {
        let err = null;
        try {
            err = await res.json();
        } catch {
            return `Server error (${res.status}). Please try again later.`;
        }

        const detail = err && err.detail;
        if (typeof detail === "string" && detail.trim()) {
            return detail;
        }
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
            const lines = [detail.message || `Server error (${res.status}).`];
            if (Array.isArray(detail.instructions) && detail.instructions.length) {
                lines.push("", ...detail.instructions);
            }
            return lines.join("\n");
        }
        return `Server error (${res.status}). Please try again later.`;
    }

    function showModelHelp(message) {
        modelHelp.hidden = false;
        modelHelpText.textContent = message;
        updatePullCommand();
    }

    function hideModelHelp() {
        modelHelp.hidden = true;
        modelHelpText.textContent = "";
    }

    function updatePullCommand() {
        const name = modelToPull.value.trim();
        const safeName = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(name);
        if (!name || !safeName) {
            modelNameError.innerText = name
                ? "Use letters, numbers, and . _ : - only. Example: llama3.2"
                : "";
            modelPullCommand.textContent = "ollama pull llama3.2";
            return;
        }
        modelNameError.innerText = "";
        modelPullCommand.textContent = `ollama pull ${name}`;
    }

    function bindModelSelect() {
        if (modelSelectBound) return;
        modelSelectBound = true;
        modelSelect.addEventListener("change", () => {
            const selectedOption = modelSelect.options[modelSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) return;
            selectedModel = selectedOption.value;
            const memory = selectedOption.dataset.memory;
            modelMemoryInfo.innerText = memory
                ? `Required memory: ${memory} GB`
                : "Required memory: --";
        });
    }

    async function loadModels() {
        reloadModelsBtn.disabled = true;
        try {
            const res = await fetch("http://127.0.0.1:8000/v1/models");

            if (!res.ok) {
                let detail = "";
                try {
                    const err = await res.json();
                    detail = typeof err.detail === "string" ? err.detail : "";
                } catch {
                    detail = "";
                }
                modelSelect.innerHTML = "<option>Models unavailable</option>";
                modelMemoryInfo.innerText = "Required memory: --";
                if (res.status === 503) {
                    showModelHelp(
                        "Models are not listed because Ollama is not running. Leave the backend terminal open. In another terminal, run: ollama serve. Then install a model with the command below and check again."
                    );
                } else {
                    showModelHelp(
                        detail || `Could not load models (server error ${res.status}).`
                    );
                }
                return;
            }

            const data = await res.json();
            modelSelect.innerHTML = "";

            if (!Array.isArray(data.models) || data.models.length === 0) {
                modelSelect.innerHTML = "<option>No models found</option>";
                modelMemoryInfo.innerText = "No Ollama models are available";
                showModelHelp(
                    "Ollama is running, but no models are installed. In another terminal, run the pull command below. When it finishes, click Check for models."
                );
                return;
            }

            hideModelHelp();
            data.models.forEach((model, index) => {
                const option = document.createElement("option");
                option.value = model.id;
                option.textContent = model.name;
                option.dataset.memory = model.memory_required_gb;
                modelSelect.appendChild(option);
                if (index === 0) {
                    selectedModel = model.id;
                    modelMemoryInfo.innerText =
                        `Required memory: ${model.memory_required_gb} GB`;
                }
            });
            bindModelSelect();
        } catch (err) {
            console.error(err);
            modelSelect.innerHTML = "<option>Error loading models</option>";
            modelMemoryInfo.innerText = "Could not connect to backend";
            showModelHelp(
                "Could not connect to the backend at http://127.0.0.1:8000. In a terminal, run: python -m uvicorn backend.app:app --reload. If the backend is already running, start Ollama in another terminal with: ollama serve"
            );
        } finally {
            reloadModelsBtn.disabled = false;
        }
    }

    function resetLecture() {
        lectureEpoch += 1;
        abortInFlight();
        stopRecognition("reset");

        transcriptEl.innerText = "";
        summaryEl.innerText = "";
        summaryIsCurrent = false;

        lectureNameInput.value = "";
        audioFileInput.value = "";

        statusEl.innerText = "Status: IDLE";
        audioStatus.innerText = "";
        detectedLanguageEl.innerText = "";
        lectureError.innerText = "";

        downloadTranscriptBtn.disabled = true;
        downloadSummaryBtn.disabled = true;
        summarizeBtn.disabled = true;
        enableLiveInputs();
    }

    if (recog) {
        recog.continuous = true;
        recog.interimResults = false;

        applyLanguage();

        recog.onstart = () => {
            if (!isRecording) return;
            statusEl.innerText = 'Status: listening...';
        };
        recog.onend = () => {
            if (isRecording) {
                setTimeout(() => {
                    if (!isRecording) return;
                    try { recog.start(); } catch {}
                }, 500);
                return;
            }
            if (recognitionStopReason === "reset" || recognitionStopReason === "error") {
                return;
            }
            statusEl.innerText = "Status: STOPPED";
            enableLiveInputs();
        };
        recog.onerror = (e) => {
            if (e.error === "aborted" || recognitionStopReason === "reset") return;
            if (FATAL_RECOGNITION_ERRORS.includes(e.error)) {
                isRecording = false;
                recognitionStopReason = "error";
                statusEl.innerText = "Error: " + e.error;
                enableLiveInputs();
                return;
            }
            statusEl.innerText = "Error: " + e.error;
        };

        recog.onresult = (event) => {
            if (!isRecording) return;
            let text = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    text += event.results[i][0].transcript + " ";
                }
            }
            if (!text.trim() || !isRecording) return;
            invalidateSummary();
            transcriptEl.innerText += text;
            updateButtons();
        };
    }

    langSelect.addEventListener('change', () => {
        applyLanguage();
        if (recog && isRecording) {
            try { recog.stop(); } catch {}
        }
    });

    audioFileInput.addEventListener("change", () => {
        audioStatus.innerText = "";
    });

    lectureNameInput.addEventListener("input", () => {
        lectureError.innerText = "";
    });

    transcriptEl.addEventListener("input", () => {
        invalidateSummary();
        updateButtons();
    });

    startBtn.onclick = () => {
        if (!recog || uploadController) return;

        recognitionStopReason = null;
        isRecording = true;

        startBtn.disabled = true;
        stopBtn.disabled = false;

        audioFileInput.disabled = true;
        uploadAudioBtn.disabled = true;
        audioStatus.innerText = "Audio upload disabled while recording.";

        applyLanguage();
        try {
            recog.start();
        } catch {
            isRecording = false;
            recognitionStopReason = "error";
            enableLiveInputs();
            statusEl.innerText = "Error: could not start microphone.";
        }
    };

    stopBtn.onclick = () => {
        stopRecognition("user");
        statusEl.innerText = "Status: STOPPED";
        enableLiveInputs();
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

        const lectureName = requireLectureName("uploading audio");
        if (!lectureName) return;

        const file = audioFileInput.files[0];
        if (!file) {
            audioStatus.innerText = "Please select an audio file.";
            return;
        }

        const epoch = lectureEpoch;
        startBtn.disabled = true;
        stopBtn.disabled = true;
        uploadAudioBtn.disabled = true;
        audioFileInput.disabled = true;

        statusEl.innerText = "Live recording disabled while using audio upload.";
        audioStatus.innerText = "Uploading & transcribing… this may take 1-2 minutes.";

        const controller = new AbortController();
        uploadController = controller;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("lecture_title", lectureName);

        try {
        const res = await fetch("http://127.0.0.1:8000/v1/transcribe", {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        if (!isCurrentLecture(epoch)) return;

        if (!res.ok) {
            const message = await errorMessageFromResponse(res);
            if (!isCurrentLecture(epoch)) return;
            audioStatus.innerText = message;
            return;
        }

        const data = await res.json();
        if (!isCurrentLecture(epoch)) return;

        clearSummaryOutput();
        transcriptEl.innerText = data.transcript || "";
        audioStatus.innerText = "Transcription complete.";
        detectedLanguageEl.innerText = data.language
            ? "Detected language: " + data.language.toUpperCase()
            : "";
        updateButtons();

        } catch (err) {
            if (err.name === "AbortError" || !isCurrentLecture(epoch)) return;
            console.error(err);
            audioStatus.innerText = "Error during transcription.";
        } finally {
            if (uploadController === controller) {
                uploadController = null;
            }
            if (isCurrentLecture(epoch) && !isRecording) {
                enableLiveInputs();
                if (statusEl.innerText === "Live recording disabled while using audio upload.") {
                    statusEl.innerText = "Status: IDLE";
                }
            }
        }
    };


    downloadTranscriptBtn.onclick = () => {
        const lectureName = requireLectureName("downloading the transcript");
        if (!lectureName) return;

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
        const lectureName = requireLectureName("downloading the summary");
        if (!lectureName) return;

        const summary = summaryEl.innerText.trim();
        if (!summary || !summaryIsCurrent) {
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
        const lectureName = requireLectureName("summarizing");
        if (!lectureName) return;

        const transcript = transcriptEl.innerText.trim();
        if (!transcript) {
            lectureError.innerText = "Transcript is empty.";
            return;
        }

        const epoch = lectureEpoch;
        summarizeBtn.disabled = true;
        downloadSummaryBtn.disabled = true;
        summaryIsCurrent = false;
        summaryEl.innerText = "Summarizing... please wait (this may take 1-3 minutes).";

        const controller = new AbortController();
        summarizeController = controller;

        try {
            const res = await fetch("http://127.0.0.1:8000/v1/summarize", {
                method: "POST",
                headers: {
                "Content-Type": "application/json"
                },
                signal: controller.signal,
                body: JSON.stringify({
                    transcript: transcript,
                    lecture_title: lectureName,
                    model: selectedModel,
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

            if (!isCurrentLecture(epoch)) return;

            if (!res.ok) {
                const message = await errorMessageFromResponse(res);
                if (!isCurrentLecture(epoch)) return;
                summaryEl.innerText = message;
                return;
            }

            const data = await res.json();
            if (!isCurrentLecture(epoch)) return;

            summaryEl.innerText = data.summary_text || "";
            summaryIsCurrent = summaryEl.innerText.trim().length > 0;
            downloadSummaryBtn.disabled = !summaryIsCurrent;

            document.getElementById("summaryTitle").scrollIntoView({ behavior: "smooth" });

        } catch (err) {
            if (err.name === "AbortError" || !isCurrentLecture(epoch)) return;
            summaryEl.innerText = "Error connecting to backend.";
            console.error(err);
        }
        finally {
            if (summarizeController === controller) {
                summarizeController = null;
            }
            if (isCurrentLecture(epoch)) {
                updateButtons();
            }
        }
    };

    modelToPull.addEventListener("input", updatePullCommand);
    reloadModelsBtn.addEventListener("click", () => {
        loadModels();
    });

    loadModels();

});
