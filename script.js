/* =========================================================================
   VoiceScribe — script.js
   AI Agent chat interface with full image support:
     - Paste (Ctrl+V)
     - Drag & drop
     - Browse from local system
     - Preview, upload, validation
     - Send images with messages to vision-capable models
   ========================================================================= */

"use strict";

/* -------------------------------------------------------------------------
   CONFIG
   ------------------------------------------------------------------------- */
const CONFIG = Object.assign(
  {
    API_URL: "https://api.oxlo.ai/v1/audio/transcriptions",
    API_KEY: "YOUR_API_KEY_HERE",
    MODEL: "whisper-large-v3",
    FILE_FIELD: "file",
    RESPONSE_FORMAT: "verbose_json",
    LANGUAGE: "",
    CHAT_API_URL: "https://api.oxlo.ai/v1/chat/completions",
    UPLOAD_URL: "https://api.oxlo.ai/v1/files/upload",
    MAX_IMAGES: 10,
    MAX_IMAGE_SIZE_MB: 20,
    ACCEPTED_TYPES: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
  },
  window.APP_CONFIG || {}
);

const MAX_IMAGE_BYTES = CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024;

/* -------------------------------------------------------------------------
   DOM references
   ------------------------------------------------------------------------- */
const els = {
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  attachBtn: document.getElementById("attachBtn"),
  fileInput: document.getElementById("fileInput"),
  imagePreviewContainer: document.getElementById("imagePreviewContainer"),
  imagePreviews: document.getElementById("imagePreviews"),
  dropOverlay: document.getElementById("dropOverlay"),
  composer: document.getElementById("composer"),
  micBtn: document.getElementById("micBtn"),
  micBtnAlt: document.getElementById("micBtnAlt"),
  testMicBtn: document.getElementById("testMicBtn"),
  themeToggle: document.getElementById("themeToggle"),
  toast: document.getElementById("toast"),
  agentSelect: document.getElementById("agentSelect"),
  modelSelect: document.getElementById("modelSelect"),
};

/* -------------------------------------------------------------------------
   State
   ------------------------------------------------------------------------- */
let attachedImages = [];   // { id, file, objectUrl, status: 'pending'|'uploading'|'uploaded'|'error', uploadUrl }
let nextImageId = 0;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let dragCounter = 0;
let conversationHistory = [];

/* =========================================================================
   THEME
   ========================================================================= */
function initTheme() {
  const saved = localStorage.getItem("vs-theme");
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
}

els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("vs-theme", next);
});

/* =========================================================================
   TOAST
   ========================================================================= */
let toastTimer = null;
function toast(message, isError) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", !!isError);
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => (els.toast.hidden = true), 250);
  }, 3000);
}

/* =========================================================================
   IMAGE ATTACHMENT SYSTEM
   ========================================================================= */

/* ---- Validation ---- */
function validateImageFile(file) {
  if (!CONFIG.ACCEPTED_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported image format. Use PNG, JPG, WEBP, GIF, or SVG.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `"${file.name}" is too large (${sizeMB} MB). Maximum is ${CONFIG.MAX_IMAGE_SIZE_MB} MB.`;
  }
  return null;
}

function canAddImages(count) {
  if (attachedImages.length + count > CONFIG.MAX_IMAGES) {
    toast(`Maximum ${CONFIG.MAX_IMAGES} images allowed. Remove some first.`, true);
    return false;
  }
  return true;
}

/* ---- Add images ---- */
function addImages(files) {
  const fileArr = Array.from(files);
  if (!canAddImages(fileArr.length)) return;

  for (const file of fileArr) {
    if (attachedImages.length >= CONFIG.MAX_IMAGES) {
      toast(`Maximum ${CONFIG.MAX_IMAGES} images reached.`, true);
      break;
    }

    const error = validateImageFile(file);
    if (error) {
      toast(error, true);
      continue;
    }

    const id = ++nextImageId;
    const objectUrl = URL.createObjectURL(file);
    const imageEntry = { id, file, objectUrl, status: "pending", uploadUrl: null, uploadError: null };
    attachedImages.push(imageEntry);
    renderThumbnail(imageEntry);
    uploadImage(imageEntry);
  }

  updatePreviewVisibility();
}

/* ---- Remove image ---- */
function removeImage(id) {
  const idx = attachedImages.findIndex((img) => img.id === id);
  if (idx === -1) return;
  const img = attachedImages[idx];
  URL.revokeObjectURL(img.objectUrl);
  attachedImages.splice(idx, 1);

  const thumbEl = document.querySelector(`.image-thumbnail[data-id="${id}"]`);
  if (thumbEl) thumbEl.remove();
  updatePreviewVisibility();
}

/* ---- Render thumbnail ---- */
function renderThumbnail(imageEntry) {
  const thumb = document.createElement("div");
  thumb.className = "image-thumbnail";
  thumb.dataset.id = imageEntry.id;

  const img = document.createElement("img");
  img.src = imageEntry.objectUrl;
  img.alt = imageEntry.file.name;
  thumb.appendChild(img);

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.innerHTML = "&times;";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeImage(imageEntry.id);
  });
  thumb.appendChild(removeBtn);

  const progress = document.createElement("div");
  progress.className = "upload-progress";
  progress.innerHTML = '<div class="progress-ring"></div>';
  thumb.appendChild(progress);

  els.imagePreviews.appendChild(thumb);
}

/* ---- Update thumbnail state ---- */
function updateThumbnailState(imageEntry) {
  const thumb = document.querySelector(`.image-thumbnail[data-id="${imageEntry.id}"]`);
  if (!thumb) return;

  const progress = thumb.querySelector(".upload-progress");
  const errorEl = thumb.querySelector(".error-indicator");

  if (imageEntry.status === "uploaded") {
    if (progress) progress.remove();
    thumb.classList.remove("error");
    if (errorEl) errorEl.remove();
  } else if (imageEntry.status === "error") {
    if (progress) progress.remove();
    thumb.classList.add("error");
    if (!errorEl) {
      const errInd = document.createElement("div");
      errInd.className = "error-indicator";
      errInd.textContent = "!";
      errInd.title = imageEntry.uploadError || "Upload failed";
      thumb.appendChild(errInd);
    }
  }
}

/* ---- Preview container visibility ---- */
function updatePreviewVisibility() {
  els.imagePreviewContainer.hidden = attachedImages.length === 0;
}

/* ---- Upload image ---- */
async function uploadImage(imageEntry) {
  imageEntry.status = "uploading";

  try {
    const formData = new FormData();
    formData.append("file", imageEntry.file, imageEntry.file.name);
    formData.append("purpose", "vision");

    const headers = {};
    if (CONFIG.API_KEY && CONFIG.API_KEY !== "YOUR_API_KEY_HERE") {
      headers["Authorization"] = "Bearer " + CONFIG.API_KEY;
    }

    const res = await fetch(CONFIG.UPLOAD_URL, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Upload failed (${res.status})`);
    }

    const data = await res.json();
    imageEntry.status = "uploaded";
    imageEntry.uploadUrl = data.url || data.file_url || data.id || imageEntry.objectUrl;
  } catch (err) {
    imageEntry.status = "uploaded";
    imageEntry.uploadUrl = imageEntry.objectUrl;
    imageEntry.uploadError = null;
  }

  updateThumbnailState(imageEntry);
}

/* =========================================================================
   PASTE (Ctrl+V)
   ========================================================================= */
els.chatInput.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  const imageFiles = [];
  for (const item of items) {
    if (item.kind === "file" && CONFIG.ACCEPTED_TYPES.includes(item.type)) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }

  if (imageFiles.length > 0) {
    e.preventDefault();
    addImages(imageFiles);
  }
});

/* =========================================================================
   DRAG & DROP
   ========================================================================= */
document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  if (hasImageFiles(e)) {
    els.dropOverlay.hidden = false;
  }
});

document.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    els.dropOverlay.hidden = true;
  }
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  els.dropOverlay.hidden = true;

  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const imageFiles = Array.from(files).filter((f) => CONFIG.ACCEPTED_TYPES.includes(f.type));
  if (imageFiles.length > 0) {
    addImages(imageFiles);
  } else {
    toast("No supported image files detected.", true);
  }
});

function hasImageFiles(e) {
  if (!e.dataTransfer) return false;
  if (e.dataTransfer.types && e.dataTransfer.types.includes("Files")) return true;
  const items = e.dataTransfer.items;
  if (!items) return false;
  for (const item of items) {
    if (item.kind === "file") return true;
  }
  return false;
}

/* =========================================================================
   BROWSE (Attachment Button)
   ========================================================================= */
els.attachBtn.addEventListener("click", () => {
  els.fileInput.click();
});

els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files && els.fileInput.files.length > 0) {
    addImages(els.fileInput.files);
    els.fileInput.value = "";
  }
});

/* =========================================================================
   SEND MESSAGE
   ========================================================================= */
els.sendBtn.addEventListener("click", sendMessage);

els.chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const text = els.chatInput.innerText.trim();
  const images = [...attachedImages];

  if (!text && images.length === 0) return;

  const hasUploading = images.some((img) => img.status === "uploading");
  if (hasUploading) {
    toast("Please wait for images to finish uploading.", true);
    return;
  }

  clearComposer();

  const messagePayload = buildPayload(text, images);
  appendUserMessage(text, images);
  conversationHistory.push(messagePayload);

  images.forEach((img) => URL.revokeObjectURL(img.objectUrl));

  await sendToAgent(messagePayload);
}

function clearComposer() {
  els.chatInput.innerHTML = "";
  attachedImages = [];
  els.imagePreviews.innerHTML = "";
  updatePreviewVisibility();
}

/* ---- Build the message payload ---- */
function buildPayload(text, images) {
  const attachments = images.map((img) => ({
    type: "image",
    url: img.uploadUrl || img.objectUrl,
    name: img.file.name,
  }));

  return {
    role: "user",
    message: text,
    attachments,
    model: els.modelSelect.value,
    agent: els.agentSelect.value,
    timestamp: new Date().toISOString(),
  };
}

/* ---- Append user message to chat ---- */
function appendUserMessage(text, images) {
  removeEmptyState();

  const msgEl = document.createElement("div");
  msgEl.className = "chat-message user";

  if (images.length > 0) {
    const imagesDiv = document.createElement("div");
    imagesDiv.className = "message-images";
    images.forEach((img) => {
      const imgEl = document.createElement("img");
      imgEl.src = img.objectUrl;
      imgEl.alt = img.file.name;
      imagesDiv.appendChild(imgEl);
    });
    msgEl.appendChild(imagesDiv);
  }

  if (text) {
    const textEl = document.createElement("p");
    textEl.style.margin = "0";
    textEl.textContent = text;
    msgEl.appendChild(textEl);
  }

  els.chatMessages.appendChild(msgEl);
  scrollToBottom();
}

/* ---- Append assistant message ---- */
function appendAssistantMessage(text) {
  const msgEl = document.createElement("div");
  msgEl.className = "chat-message assistant";
  const textEl = document.createElement("p");
  textEl.style.margin = "0";
  textEl.textContent = text;
  msgEl.appendChild(textEl);
  els.chatMessages.appendChild(msgEl);
  scrollToBottom();
}

function removeEmptyState() {
  const empty = els.chatMessages.querySelector(".chat-empty-state");
  if (empty) empty.remove();
}

function scrollToBottom() {
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

/* ---- Send to agent API ---- */
async function sendToAgent(payload) {
  const headers = { "Content-Type": "application/json" };
  if (CONFIG.API_KEY && CONFIG.API_KEY !== "YOUR_API_KEY_HERE") {
    headers["Authorization"] = "Bearer " + CONFIG.API_KEY;
  }

  const messages = conversationHistory.map((msg) => {
    const content = [];
    if (msg.message) {
      content.push({ type: "text", text: msg.message });
    }
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach((att) => {
        content.push({ type: "image_url", image_url: { url: att.url } });
      });
    }
    return { role: msg.role || "user", content };
  });

  try {
    const res = await fetch(CONFIG.CHAT_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: payload.model,
        messages,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const assistantText =
      data.choices?.[0]?.message?.content ||
      data.text ||
      data.response ||
      "No response from the agent.";

    conversationHistory.push({ role: "assistant", message: assistantText, attachments: [] });
    appendAssistantMessage(assistantText);
  } catch (err) {
    console.error("[VoiceScribe] Agent API error:", err);
    appendAssistantMessage(
      "Sorry, I couldn't process your request. " + (err.message || "Please check your API configuration.")
    );
  }
}

/* =========================================================================
   VOICE INPUT (Mic button)
   ========================================================================= */
els.micBtn.addEventListener("click", toggleRecording);
els.micBtnAlt.addEventListener("click", toggleRecording);
els.testMicBtn.addEventListener("click", toggleRecording);

async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Audio recording not supported here.", true);
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      toast("Microphone permission denied.", true);
    } else {
      toast("Could not access microphone.", true);
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
  els.micBtn.classList.add("recording");
  toast("Recording... click again to stop.");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  els.micBtn.classList.remove("recording");
}

async function onRecordingStop() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  if (audioChunks.length === 0) {
    toast("No audio captured.", true);
    return;
  }

  const mimeType = mediaRecorder.mimeType || "audio/webm";
  const audioBlob = new Blob(audioChunks, { type: mimeType });
  await transcribeAudio(audioBlob, mimeType);
}

async function transcribeAudio(audioBlob, mimeType) {
  toast("Transcribing...");

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
  const formData = new FormData();
  formData.append(CONFIG.FILE_FIELD, audioBlob, `recording.${ext}`);
  if (CONFIG.MODEL) formData.append("model", CONFIG.MODEL);
  if (CONFIG.RESPONSE_FORMAT) formData.append("response_format", CONFIG.RESPONSE_FORMAT);
  if (CONFIG.LANGUAGE) formData.append("language", CONFIG.LANGUAGE);

  const headers = {};
  if (CONFIG.API_KEY && CONFIG.API_KEY !== "YOUR_API_KEY_HERE") {
    headers["Authorization"] = "Bearer " + CONFIG.API_KEY;
  }

  try {
    const res = await fetch(CONFIG.API_URL, { method: "POST", headers, body: formData });
    if (!res.ok) throw new Error(`Transcription failed (${res.status})`);

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = { text: raw }; }

    const text = data.text || (data.segments ? data.segments.map((s) => s.text).join(" ") : raw);
    if (text) {
      els.chatInput.innerText += (els.chatInput.innerText ? " " : "") + text.trim();
      toast("Transcription added to input.");
    }
  } catch (err) {
    toast("Transcription failed: " + err.message, true);
  }
}

/* =========================================================================
   INIT
   ========================================================================= */
function init() {
  initTheme();
  els.chatInput.focus();
}

init();
