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
    const audioFileName = document.getElementById("audioFileName");
    const audioFileHint = document.getElementById("audioFileHint");
    const audioDropZone = document.getElementById("audioDropZone");
    const uploadAudioBtn = document.getElementById("uploadAudioBtn");
    const audioStatus = document.getElementById("audioStatus");
    const detectedLanguageEl = document.getElementById("detectedLanguage");

    const clearBtn = document.getElementById("clearBtn");
    const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
    const clearTranscriptBtn = document.getElementById("clearTranscriptBtn");
    const copySummaryBtn = document.getElementById("copySummaryBtn");
    const clearSummaryBtn = document.getElementById("clearSummaryBtn");

    const modelSelect = document.getElementById("modelSelect");
    const modelMemoryInfo = document.getElementById("modelMemoryInfo");
    const modelHelp = document.getElementById("modelHelp");
    const modelHelpText = document.getElementById("modelHelpText");
    const reloadModelsBtn = document.getElementById("reloadModelsBtn");
    let selectedModel = "openai/gpt-oss-20b";
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

    function formatFileSize(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return "";
        const units = ["B", "KB", "MB", "GB"];
        let size = bytes;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit += 1;
        }
        const digits = size >= 10 || unit === 0 ? 0 : 1;
        return `${size.toFixed(digits)} ${units[unit]}`;
    }

    function setAudioFileLabel(file) {
        if (!audioFileName) return;
        if (file) {
            audioFileName.textContent = file.name;
            audioFileName.title = file.name;
            if (audioFileHint) {
                const sizeLabel = formatFileSize(file.size);
                audioFileHint.textContent = sizeLabel
                    ? `${sizeLabel} · Ready to upload & transcribe`
                    : "Ready to upload & transcribe";
            }
            audioDropZone?.classList.add("has-file");
        } else {
            audioFileName.textContent = "Drop audio or browse";
            audioFileName.title = "";
            if (audioFileHint) {
                audioFileHint.textContent = "MP3, WAV, M4A, WebM…";
            }
            audioDropZone?.classList.remove("has-file");
        }
    }

    function assignAudioFile(file) {
        if (!file || audioFileInput.disabled) return;
        if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|webm|ogg|flac|aac)$/i.test(file.name)) {
            audioStatus.innerText = "Please choose an audio file.";
            return;
        }
        const transfer = new DataTransfer();
        transfer.items.add(file);
        audioFileInput.files = transfer.files;
        audioStatus.innerText = "";
        setAudioFileLabel(file);
    }

    function updateButtons() {
        const hasText = transcriptEl.innerText.trim().length > 0;
        const hasSummary = summaryEl.innerText.trim().length > 0;
        downloadTranscriptBtn.disabled = !hasText;
        summarizeBtn.disabled = !hasText;
        if (copyTranscriptBtn) copyTranscriptBtn.disabled = !hasText;
        if (clearTranscriptBtn) clearTranscriptBtn.disabled = !hasText;
        if (copySummaryBtn) copySummaryBtn.disabled = !hasSummary;
        if (clearSummaryBtn) clearSummaryBtn.disabled = !hasSummary;
    }

    async function copyPanelText(sourceEl, feedbackBtn) {
        const text = sourceEl.innerText.trim();
        if (!text) return;

        const originalLabel = feedbackBtn.textContent;
        try {
            await navigator.clipboard.writeText(text);
            feedbackBtn.textContent = "Copied!";
            feedbackBtn.classList.add("is-copied");
        } catch {
            feedbackBtn.textContent = "Failed";
        }

        window.setTimeout(() => {
            feedbackBtn.textContent = originalLabel;
            feedbackBtn.classList.remove("is-copied");
        }, 1600);
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
        updateButtons();
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

    function shortErrorFromDetail(detail, status) {
        const byCode = {
            AI_PROVIDER_NOT_CONFIGURED: "API key is not set.",
            TRANSCRIPTION_PROVIDER_ERROR: "Transcription failed.",
            INVALID_REQUEST: "Invalid request.",
            MODEL_ERROR: "AI model error.",
        };

        if (typeof detail === "string" && detail.trim()) {
            return detail.trim();
        }
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
            if (detail.error && byCode[detail.error]) {
                return byCode[detail.error];
            }
            if (typeof detail.message === "string" && detail.message.trim()) {
                return detail.message.trim();
            }
        }
        return status ? `Server error (${status}).` : "Something went wrong.";
    }

    async function errorMessageFromResponse(res) {
        try {
            const err = await res.json();
            return shortErrorFromDetail(err?.detail, res.status);
        } catch {
            return `Server error (${res.status}).`;
        }
    }

    function showModelHelp(message) {
        modelHelp.hidden = false;
        modelHelpText.textContent = message;
    }

    function hideModelHelp() {
        modelHelp.hidden = true;
        modelHelpText.textContent = "";
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
                ? `Hosted model`
                : "Hosted AI model";
        });
    }

    async function loadModels() {
        reloadModelsBtn.disabled = true;
        try {
            const res = await fetch("/v1/models");

            if (!res.ok) {
                let message = "Could not load AI model.";
                try {
                    const err = await res.json();
                    message = shortErrorFromDetail(err?.detail, res.status);
                } catch {
                    message = `Could not load AI model (${res.status}).`;
                }
                modelSelect.innerHTML = "<option>Models unavailable</option>";
                modelMemoryInfo.innerText = "AI model unavailable";
                showModelHelp(message);
                return;
            }

            const data = await res.json();
            modelSelect.innerHTML = "";

            if (!Array.isArray(data.models) || data.models.length === 0) {
                modelSelect.innerHTML = "<option>No models found</option>";
                modelMemoryInfo.innerText = "Hosted AI model unavailable";
                showModelHelp("No AI model configured on the server.");
                return;
            }

            hideModelHelp();
            data.models.forEach((model, index) => {
                const option = document.createElement("option");
                option.value = model.id;
                option.textContent = model.name;
                option.dataset.memory = model.memory_required_gb ?? "";
                modelSelect.appendChild(option);
                if (index === 0) {
                    selectedModel = model.id;
                    modelMemoryInfo.innerText = "Hosted model";
                }
            });
            bindModelSelect();
        } catch (err) {
            console.error(err);
            modelSelect.innerHTML = "<option>Error loading models</option>";
            modelMemoryInfo.innerText = "Backend unreachable";
            showModelHelp("Could not connect to the server.");
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
        setAudioFileLabel(null);

        statusEl.innerText = "Status: IDLE";
        audioStatus.innerText = "";
        detectedLanguageEl.innerText = "";
        lectureError.innerText = "";

        downloadTranscriptBtn.disabled = true;
        downloadSummaryBtn.disabled = true;
        summarizeBtn.disabled = true;
        enableLiveInputs();
        updateButtons();
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
        setAudioFileLabel(audioFileInput.files[0] || null);
    });

    if (audioDropZone) {
        ["dragenter", "dragover"].forEach((eventName) => {
            audioDropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                if (audioFileInput.disabled) return;
                audioDropZone.classList.add("is-dragover");
            });
        });
        ["dragleave", "drop"].forEach((eventName) => {
            audioDropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                audioDropZone.classList.remove("is-dragover");
            });
        });
        audioDropZone.addEventListener("drop", (event) => {
            if (audioFileInput.disabled) return;
            const file = event.dataTransfer?.files?.[0];
            if (file) assignAudioFile(file);
        });
    }

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
        }
    };

    copyTranscriptBtn.onclick = () => copyPanelText(transcriptEl, copyTranscriptBtn);
    clearTranscriptBtn.onclick = () => {
        if (!transcriptEl.innerText.trim()) return;
        transcriptEl.innerText = "";
        invalidateSummary();
        updateButtons();
        transcriptEl.focus();
    };
    copySummaryBtn.onclick = () => copyPanelText(summaryEl, copySummaryBtn);
    clearSummaryBtn.onclick = () => clearSummaryOutput();

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
        const res = await fetch("/v1/transcribe", {
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
            audioStatus.innerText = "Transcription failed.";
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
            const res = await fetch("/v1/summarize", {
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

        } catch (err) {
            if (err.name === "AbortError" || !isCurrentLecture(epoch)) return;
            summaryEl.innerText = "Could not connect to the server.";
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

    reloadModelsBtn.addEventListener("click", () => {
        loadModels();
    });

    loadModels();
    updateButtons();

});
