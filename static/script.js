let currentAudioUrl = null;
let currentAudioPlayer = null;
const audioHistory = [];

const LANG_NAMES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-CN": "Chinese",
    "ru": "Russian",
    "ar": "Arabic",
    "nl": "Dutch",
    "tr": "Turkish",
    "pl": "Polish",
    "sv": "Swedish",
    "id": "Indonesian",
    "th": "Thai",
    "vi": "Vietnamese"
};

function updateStatus(isSpeaking, text = "Ready to speak") {
    const statusBox = document.getElementById("statusBox");
    const statusText = document.getElementById("statusText");
    const speakBtn = document.getElementById("speakBtn");
    const stopBtn = document.getElementById("stopBtn");

    if (isSpeaking) {
        if (statusBox) statusBox.classList.add("active");
        if (statusText) statusText.textContent = text;
        if (speakBtn) {
            speakBtn.disabled = true;
            const btnSpan = speakBtn.querySelector("span");
            if (btnSpan) btnSpan.textContent = "Speaking...";
        }
        if (stopBtn) stopBtn.style.display = "inline-flex";
    } else {
        if (statusBox) statusBox.classList.remove("active");
        if (statusText) statusText.textContent = text;
        if (speakBtn) {
            speakBtn.disabled = false;
            const btnSpan = speakBtn.querySelector("span");
            if (btnSpan) btnSpan.textContent = "Speak Now";
        }
        if (stopBtn) stopBtn.style.display = "none";
    }
}

function stopSpeech() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    if (currentAudioPlayer) {
        currentAudioPlayer.pause();
        currentAudioPlayer.currentTime = 0;
    }
    updateStatus(false, "Stopped");
}

function getSelectedLang() {
    const langSelect = document.getElementById("langSelect");
    return langSelect ? langSelect.value : "en";
}

function syncLangSelection(selectedLang) {
    const langSelect = document.getElementById("langSelect");
    if (langSelect) {
        let found = false;
        for (let opt of langSelect.options) {
            if (opt.value === selectedLang || opt.value.startsWith(selectedLang)) {
                langSelect.value = opt.value;
                found = true;
                break;
            }
        }
        if (!found) langSelect.value = selectedLang;
    }

    const chips = document.querySelectorAll(".lang-chip");
    chips.forEach(chip => {
        if (chip.getAttribute("data-lang") === selectedLang) {
            chip.classList.add("active");
        } else {
            chip.classList.remove("active");
        }
    });
}

function findSoftConfidentMaleVoice(lang) {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const searchPrefix = lang.split('-')[0].toLowerCase();

    const maleKeywords = [
        'david', 'george', 'daniel', 'james', 'mark', 'guy', 'thomas',
        'alex', 'fred', 'rishi', 'neil', 'oliver', 'male', 'google uk english male', 'google us english male'
    ];

    const langVoices = voices.filter(v => {
        const vLang = v.lang.toLowerCase();
        return vLang === searchPrefix || vLang.startsWith(searchPrefix);
    });

    if (langVoices.length > 0) {
        let maleVoice = langVoices.find(v => {
            const nameLower = v.name.toLowerCase();
            return maleKeywords.some(kw => nameLower.includes(kw));
        });
        if (maleVoice) return maleVoice;
        return langVoices[0];
    }

    let anyMale = voices.find(v => {
        const nameLower = v.name.toLowerCase();
        return maleKeywords.some(kw => nameLower.includes(kw));
    });

    return anyMale || voices[0];
}

async function speakText(event) {
    if (event) event.preventDefault();

    const textInput = document.getElementById("text");
    if (!textInput || !textInput.value.trim()) return;

    const textValue = textInput.value.trim();
    const lang = getSelectedLang();
    const langName = LANG_NAMES[lang] || lang;

    stopSpeech();

    const matchingVoice = findSoftConfidentMaleVoice(lang);

    if ('speechSynthesis' in window && matchingVoice) {
        speakWithBrowser(textValue, lang, langName, matchingVoice);
    } else {
        await speakWithServer(textValue, lang, langName);
    }
}

function speakWithBrowser(textValue, lang, langName, voice) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textValue);
    utterance.voice = voice;
    utterance.lang = voice.lang || lang;

    const rateRange = document.getElementById("rateRange");
    const pitchRange = document.getElementById("pitchRange");

    utterance.rate = rateRange ? parseFloat(rateRange.value) : 0.95;
    utterance.pitch = pitchRange ? parseFloat(pitchRange.value) : 0.85;

    utterance.onstart = () => {
        updateStatus(true, `Speaking in Soft Male Voice (${langName})...`);
    };

    utterance.onend = () => {
        updateStatus(false, "Finished speaking");
        addToHistory(textValue, lang, null);
    };

    utterance.onerror = (e) => {
        console.warn("Browser SpeechSynthesis failed, falling back to server:", e);
        speakWithServer(textValue, lang, langName);
    };

    window.speechSynthesis.speak(utterance);
}

async function speakWithServer(textValue, lang, langName) {
    updateStatus(true, `Generating ${langName} speech...`);

    const audioContainer = document.getElementById("audioContainer");
    if (!audioContainer) return;

    try {
        const formData = new FormData();
        formData.append("text", textValue);
        formData.append("lang", lang);

        const response = await fetch("/speak", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        const blob = await response.blob();
        if (!blob || blob.size === 0) {
            throw new Error("Empty audio response");
        }

        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
        }

        currentAudioUrl = URL.createObjectURL(blob);

        renderAudioCard(currentAudioUrl, textValue, langName);
        addToHistory(textValue, lang, currentAudioUrl);

        if (currentAudioPlayer) {
            const rateRange = document.getElementById("rateRange");
            if (rateRange) {
                currentAudioPlayer.playbackRate = parseFloat(rateRange.value) || 0.95;
            }

            currentAudioPlayer.onplay = () => {
                updateStatus(true, `Playing ${langName} audio...`);
            };

            currentAudioPlayer.onended = () => {
                updateStatus(false, "Finished playing");
            };

            currentAudioPlayer.onerror = () => {
                updateStatus(false, "Audio playback error");
            };

            const playPromise = currentAudioPlayer.play();
            if (playPromise !== undefined) {
                await playPromise;
            }
        }
    } catch (err) {
        console.error("Server audio error:", err);
        updateStatus(false, "Error generating speech");
    }
}

function renderAudioCard(audioUrl, text, langName) {
    const audioContainer = document.getElementById("audioContainer");
    if (!audioContainer) return;

    audioContainer.innerHTML = `
        <div class="audio-card">
            <div class="audio-header">
                <span class="audio-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                    Generated Audio Clip (${langName})
                </span>
                <a href="${audioUrl}" download="voiceflow-${Date.now()}.mp3" class="download-link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download MP3
                </a>
            </div>
            <audio id="audioPlayer" controls src="${audioUrl}"></audio>
        </div>
    `;

    currentAudioPlayer = document.getElementById("audioPlayer");
}

function addToHistory(text, lang, audioUrl) {
    audioHistory.unshift({ text, lang, audioUrl, timestamp: new Date() });
    if (audioHistory.length > 5) audioHistory.pop();

    const historySection = document.getElementById("historySection");
    const historyList = document.getElementById("historyList");

    if (historySection && historyList) {
        historySection.style.display = "block";
        historyList.innerHTML = audioHistory.map((item, idx) => `
            <div class="history-item">
                <div style="display: flex; align-items: center;">
                    <span class="history-lang">${item.lang.toUpperCase()}</span>
                    <span class="history-text" title="${item.text}">${item.text}</span>
                </div>
                <div class="history-actions">
                    <button type="button" class="history-play-btn" onclick="playHistoryItem(${idx})">Replay</button>
                </div>
            </div>
        `).join('');
    }
}

window.playHistoryItem = function(idx) {
    const item = audioHistory[idx];
    if (!item) return;

    const textarea = document.getElementById("text");
    if (textarea) {
        textarea.value = item.text;
        textarea.dispatchEvent(new Event("input"));
    }
    syncLangSelection(item.lang);
    speakText();
};

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("ttsForm");
    if (form) {
        form.addEventListener("submit", speakText);
    }

    const stopBtn = document.getElementById("stopBtn");
    if (stopBtn) {
        stopBtn.addEventListener("click", stopSpeech);
    }

    // Language Chips
    const chips = document.querySelectorAll(".lang-chip");
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            const lang = chip.getAttribute("data-lang");
            syncLangSelection(lang);
        });
    });

    // Language Select
    const langSelect = document.getElementById("langSelect");
    if (langSelect) {
        langSelect.addEventListener("change", (e) => {
            syncLangSelection(e.target.value);
        });
    }

    // Sample Text Buttons
    const sampleBtns = document.querySelectorAll(".sample-btn");
    sampleBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const sampleText = btn.getAttribute("data-text");
            const textarea = document.getElementById("text");
            if (textarea && sampleText) {
                textarea.value = sampleText;
                textarea.dispatchEvent(new Event("input"));
                textarea.focus();

                // If sample has French/Spanish words, auto select language
                if (btn.textContent === "Spanish") syncLangSelection("es");
                else if (btn.textContent === "French") syncLangSelection("fr");
                else syncLangSelection("en");
            }
        });
    });

    // Text Area Stats Calculator
    const textarea = document.getElementById("text");
    const charCount = document.getElementById("charCount");
    const wordCount = document.getElementById("wordCount");
    const estDuration = document.getElementById("estDuration");

    if (textarea) {
        const updateStats = () => {
            const val = textarea.value.trim();
            const chars = val.length;
            const words = val ? val.split(/\s+/).length : 0;
            const estSeconds = Math.round(words * 0.45);

            if (charCount) charCount.textContent = `${chars} char${chars === 1 ? '' : 's'}`;
            if (wordCount) wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
            if (estDuration) estDuration.textContent = `~${estSeconds}s speech`;
        };

        textarea.addEventListener("input", updateStats);
        updateStats();
    }

    // Copy Button
    const copyBtn = document.getElementById("copyBtn");
    if (copyBtn && textarea) {
        copyBtn.addEventListener("click", async () => {
            if (!textarea.value.trim()) return;
            try {
                await navigator.clipboard.writeText(textarea.value);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = `✓ Copied`;
                setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 1800);
            } catch (e) {
                console.error("Copy failed", e);
            }
        });
    }

    // Clear Button
    const clearBtn = document.getElementById("clearBtn");
    if (clearBtn && textarea) {
        clearBtn.addEventListener("click", () => {
            textarea.value = "";
            textarea.dispatchEvent(new Event("input"));
            textarea.focus();
            stopSpeech();
        });
    }

    // Speed Slider & Presets
    const rateRange = document.getElementById("rateRange");
    const rateVal = document.getElementById("rateVal");
    const presetBtns = document.querySelectorAll(".preset-btn");

    if (rateRange && rateVal) {
        rateRange.addEventListener("input", () => {
            const val = parseFloat(rateRange.value).toFixed(2);
            rateVal.textContent = `${val}x`;

            presetBtns.forEach(btn => {
                const btnSpeed = parseFloat(btn.getAttribute("data-speed"));
                if (Math.abs(btnSpeed - parseFloat(val)) < 0.05) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });

            if (currentAudioPlayer) {
                currentAudioPlayer.playbackRate = parseFloat(val);
            }
        });
    }

    presetBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const speed = btn.getAttribute("data-speed");
            if (rateRange && rateVal) {
                rateRange.value = speed;
                rateRange.dispatchEvent(new Event("input"));
            }
        });
    });

    // Pitch Slider
    const pitchRange = document.getElementById("pitchRange");
    const pitchVal = document.getElementById("pitchVal");
    if (pitchRange && pitchVal) {
        pitchRange.addEventListener("input", () => {
            pitchVal.textContent = parseFloat(pitchRange.value).toFixed(2);
        });
    }

    // Pre-load Web Speech voices
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        }
    }
});
