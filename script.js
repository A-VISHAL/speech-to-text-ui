/* =========================================================================
   VoiceScribe — script.js
   Handles recording, calling the Whisper API, and all UI behaviour.
   ========================================================================= */

"use strict";

/* -------------------------------------------------------------------------
   CONFIG
   The real config lives in config.js (window.APP_CONFIG), which is loaded
   before this file and is kept out of git. The fallback below is only used
   if config.js is missing, so the page still loads with clear placeholders.
   See config.example.js for a full explanation of each field and for how to
   swap in a different Whisper endpoint.
   ------------------------------------------------------------------------- */
const CONFIG = Object.assign(
  {
    API_URL: "https://api.oxlo.ai/v1/audio/transcriptions",
    API_KEY: "YOUR_API_KEY_HERE",
    MODEL: "whisper-large-v3",
    FILE_FIELD: "file",
    RESPONSE_FORMAT: "verbose_json",
    LANGUAGE: "",
  },
  window.APP_CONFIG || {}
);

/* -------------------------------------------------------------------------
   DOM references
   ------------------------------------------------------------------------- */
const els = {
  recordBtn: document.getElementById("recordBtn"),
  statusText: document.getElementById("statusText"),
  recordingMeta: document.getElementById("recordingMeta"),
  timer: document.getElementById("timer"),
  loader: document.getElementById("loader"),
  errorBox: document.getElementById("errorBox"),
  transcript: document.getElementById("transcript"),
  confidenceBadge: document.getElementById("confidenceBadge"),
  copyBtn: document.getElementById("copyBtn"),
  clearBtn: document.getElementById("clearBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  themeToggle: document.getElementById("themeToggle"),
  toast: document.getElementById("toast"),
  apiHint: document.getElementById("apiHint"),
};

/* -------------------------------------------------------------------------
   Recording state
   ------------------------------------------------------------------------- */
let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let isRecording = false;
let timerInterval = null;
let secondsElapsed = 0;

/* =========================================================================
   THEME (light / dark) — persisted in localStorage
   ========================================================================= */
function initTheme() {
  const saved = localStorage.getItem("vs-theme");
  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
}

els.themeToggle.addEventListener("click", () => {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("vs-theme", next);
});

/* =========================================================================
   SMALL UI HELPERS
   ========================================================================= */
function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.hidden = false;
}
function clearError() {
  els.errorBox.hidden = true;
  els.errorBox.textContent = "";
}

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => (els.toast.hidden = true), 250);
  }, 2200);
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* =========================================================================
   RECORDING
   ========================================================================= */
els.recordBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording() {
  clearError();

  // Guard: the MediaRecorder / getUserMedia APIs require a secure context
  // (https:// or localhost).
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError(
      "Audio recording isn't supported here. Open the app over https:// or localhost in a modern browser."
    );
    return;
  }

  try {
    // Ask the browser for microphone access. If denied this throws.
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
      showError(
        "Microphone permission denied. Allow mic access in your browser settings and try again."
      );
    } else if (err && err.name === "NotFoundError") {
      showError("No microphone was found. Connect a mic and try again.");
    } else {
      showError("Could not access the microphone: " + (err && err.message ? err.message : err));
    }
    return;
  }

  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  });

  mediaRecorder.addEventListener("stop", onRecordingStop);

  mediaRecorder.start();
  isRecording = true;

  // UI: switch to "recording" mode (pulsing button, timer, waveform).
  els.recordBtn.classList.add("recording");
  els.recordBtn.setAttribute("aria-pressed", "true");
  els.recordBtn.setAttribute("aria-label", "Stop recording");
  els.recordingMeta.hidden = false;
  setStatus("Listening… tap again to stop");

  secondsElapsed = 0;
  els.timer.textContent = formatTime(0);
  timerInterval = setInterval(() => {
    secondsElapsed += 1;
    els.timer.textContent = formatTime(secondsElapsed);
  }, 1000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  clearInterval(timerInterval);

  // UI: leave "recording" mode.
  els.recordBtn.classList.remove("recording");
  els.recordBtn.setAttribute("aria-pressed", "false");
  els.recordBtn.setAttribute("aria-label", "Start recording");
  els.recordingMeta.hidden = true;
}

async function onRecordingStop() {
  // Release the microphone hardware.
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  if (audioChunks.length === 0) {
    showError("No audio was captured. Please try again.");
    return;
  }

  const mimeType = mediaRecorder.mimeType || "audio/webm";
  const audioBlob = new Blob(audioChunks, { type: mimeType });
  await transcribe(audioBlob, mimeType);
}

/* =========================================================================
   API CALL
   Sends the recorded audio to the Whisper endpoint as multipart/form-data:

       POST {CONFIG.API_URL}
       Authorization: Bearer {CONFIG.API_KEY}
       Content-Type: multipart/form-data   (set automatically by the browser)

       <FILE_FIELD>=<audio blob>
       model=<CONFIG.MODEL>
       response_format=<CONFIG.RESPONSE_FORMAT>

   Expected response (per the spec):  { "text": "transcribed speech" }
   With response_format=verbose_json the response also contains "segments",
   from which we derive an optional confidence score.
   ========================================================================= */
async function transcribe(audioBlob, mimeType) {
  clearError();
  els.loader.hidden = false;
  setStatus("Transcribing your audio…");
  setControlsDisabled(true);

  // Warn (don't block) if the key is still a placeholder.
  if (!CONFIG.API_KEY || CONFIG.API_KEY === "YOUR_API_KEY_HERE") {
    console.warn(
      "[VoiceScribe] No API key set. Edit config.js (see config.example.js)."
    );
  }

  // Pick a sensible file extension for the recorded mime type.
  const ext = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4")
    ? "mp4"
    : mimeType.includes("wav")
    ? "wav"
    : "webm";

  const formData = new FormData();
  formData.append(CONFIG.FILE_FIELD, audioBlob, `recording.${ext}`);
  if (CONFIG.MODEL) formData.append("model", CONFIG.MODEL);
  if (CONFIG.RESPONSE_FORMAT) formData.append("response_format", CONFIG.RESPONSE_FORMAT);
  if (CONFIG.LANGUAGE) formData.append("language", CONFIG.LANGUAGE);

  // Only send the Authorization header when a key is configured. (Don't set
  // Content-Type manually — the browser adds the multipart boundary for us.)
  const headers = {};
  if (CONFIG.API_KEY && CONFIG.API_KEY !== "YOUR_API_KEY_HERE") {
    headers["Authorization"] = "Bearer " + CONFIG.API_KEY;
  }

  try {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch (_) {}
      throw new Error(
        `API responded ${res.status} ${res.statusText}${detail ? " — " + detail.slice(0, 200) : ""}`
      );
    }

    // The API may return JSON or, for response_format=text, plain text.
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = { text: raw };
    }

    const text = extractText(data);
    if (!text) {
      throw new Error("The API response did not contain any transcribed text.");
    }

    appendTranscript(text);
    showConfidence(extractConfidence(data));
    setStatus("Done! Tap the mic to add more.");
    toast("Transcription added");
  } catch (err) {
    console.error(err);
    showError(
      "Transcription failed: " +
        (err && err.message ? err.message : String(err)) +
        ". Check the API URL/key in config.js and your network connection."
    );
    setStatus("Something went wrong. Tap the mic to retry.");
  } finally {
    els.loader.hidden = true;
    setControlsDisabled(false);
  }
}

/* Pull the transcript text out of the various shapes an API might return. */
function extractText(data) {
  if (!data) return "";
  if (typeof data === "string") return data.trim();
  if (typeof data.text === "string") return data.text.trim();
  if (data.result && typeof data.result.text === "string") return data.result.text.trim();
  if (Array.isArray(data.segments)) {
    return data.segments.map((s) => s.text || "").join(" ").trim();
  }
  return "";
}

/* Derive a 0–100% confidence from verbose_json segment data, if present.
   Whisper segments expose avg_logprob (log-probability); exp() maps it back
   to a probability we can show as a percentage. Returns null if unavailable. */
function extractConfidence(data) {
  if (!data || typeof data !== "object") return null;

  if (typeof data.confidence === "number") {
    return clampPct(data.confidence <= 1 ? data.confidence * 100 : data.confidence);
  }

  if (Array.isArray(data.segments) && data.segments.length) {
    // Preferred: per-segment avg_logprob (log-probability) -> exp() = probability.
    const logprobs = data.segments
      .map((s) => (typeof s.avg_logprob === "number" ? s.avg_logprob : null))
      .filter((v) => v !== null);
    if (logprobs.length) {
      const avg = logprobs.reduce((a, b) => a + b, 0) / logprobs.length;
      return clampPct(Math.exp(avg) * 100);
    }

    // Fallback: average of per-word probabilities (already 0–1).
    const wordProbs = [];
    data.segments.forEach((s) => {
      if (Array.isArray(s.words)) {
        s.words.forEach((w) => {
          if (typeof w.probability === "number") wordProbs.push(w.probability);
        });
      }
    });
    if (wordProbs.length) {
      const avg = wordProbs.reduce((a, b) => a + b, 0) / wordProbs.length;
      return clampPct(avg * 100);
    }
  }
  return null;
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function showConfidence(pct) {
  if (pct === null || pct === undefined) {
    els.confidenceBadge.hidden = true;
    return;
  }
  els.confidenceBadge.textContent = `Confidence: ${pct}%`;
  els.confidenceBadge.hidden = false;
}

/* =========================================================================
   TRANSCRIPT TEXT MANAGEMENT
   ========================================================================= */
function appendTranscript(text) {
  const existing = els.transcript.value.trim();
  els.transcript.value = existing ? existing + "\n\n" + text : text;
  // Scroll to the newest text.
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function setControlsDisabled(disabled) {
  els.copyBtn.disabled = disabled;
  els.clearBtn.disabled = disabled;
  els.downloadBtn.disabled = disabled;
}

/* =========================================================================
   TOOLBAR: copy / clear / download
   ========================================================================= */
els.copyBtn.addEventListener("click", async () => {
  const text = els.transcript.value;
  if (!text.trim()) {
    toast("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch (_) {
    // Fallback for browsers without the async clipboard API.
    els.transcript.select();
    document.execCommand("copy");
    toast("Copied to clipboard");
  }
});

els.clearBtn.addEventListener("click", () => {
  if (!els.transcript.value.trim()) {
    toast("Already empty");
    return;
  }
  els.transcript.value = "";
  els.confidenceBadge.hidden = true;
  clearError();
  toast("Transcript cleared");
  setStatus("Tap the mic and start speaking");
});

els.downloadBtn.addEventListener("click", () => {
  const text = els.transcript.value;
  if (!text.trim()) {
    toast("Nothing to download");
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `transcript-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Transcript downloaded");
});

/* =========================================================================
   INIT
   ========================================================================= */
function init() {
  initTheme();
  try {
    const host = new URL(CONFIG.API_URL).host;
    els.apiHint.textContent = host;
  } catch (_) {
    els.apiHint.textContent = "endpoint not configured";
  }
}

init();
