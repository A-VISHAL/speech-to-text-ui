/* =========================================================================
   config.example.js  —  COPY THIS FILE TO  config.js  AND FILL IN YOUR KEY
   -------------------------------------------------------------------------
   The app loads `config.js` (NOT committed to git) before script.js and reads
   the values from `window.APP_CONFIG`. Keeping the real key in config.js, which
   is listed in .gitignore, prevents the secret from ending up in version
   control.

   ┌─────────────────────────────────────────────────────────────────────┐
   │  CONFIGURATION GUIDE                                                │
   ├─────────────────────────────────────────────────────────────────────┤
   │                                                                     │
   │  SPEECH-TO-TEXT (voice input):                                      │
   │  - API_URL: Whisper endpoint for transcription                      │
   │  - API_KEY: Secret key (Bearer token)                               │
   │  - MODEL: Model id (e.g. "whisper-large-v3")                        │
   │  - FILE_FIELD: Multipart field name ("file" for OpenAI/Oxlo)        │
   │  - RESPONSE_FORMAT: "verbose_json" or "json"                        │
   │  - LANGUAGE: ISO-639-1 hint or "" for auto-detect                   │
   │                                                                     │
   │  CHAT / VISION (agent + image understanding):                       │
   │  - CHAT_API_URL: Chat completions endpoint (vision-capable model)   │
   │  - UPLOAD_URL: File upload endpoint for images                      │
   │  - MAX_IMAGES: Max images per message (default 10)                  │
   │  - MAX_IMAGE_SIZE_MB: Max file size per image (default 20)          │
   │  - ACCEPTED_TYPES: MIME types to accept                             │
   │                                                                     │
   │  The chat API should accept OpenAI-compatible messages format:      │
   │  { role: "user", content: [                                         │
   │    { type: "text", text: "..." },                                   │
   │    { type: "image_url", image_url: { url: "..." } }                 │
   │  ]}                                                                 │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘
   ========================================================================= */

window.APP_CONFIG = {
  // ─── Speech-to-text (Whisper) ───────────────────────────────────────────
  API_URL: "https://api.oxlo.ai/v1/audio/transcriptions",
  API_KEY: "YOUR_API_KEY_HERE",
  MODEL: "whisper-large-v3",
  FILE_FIELD: "file",
  RESPONSE_FORMAT: "verbose_json",
  LANGUAGE: "",

  // ─── Chat / Vision Agent ────────────────────────────────────────────────
  // Endpoint for chat completions (must support vision / image_url content).
  CHAT_API_URL: "https://api.oxlo.ai/v1/chat/completions",

  // Endpoint for uploading images. The response should include a `url` field.
  // If upload is not available, images are sent as data URLs (base64).
  UPLOAD_URL: "https://api.oxlo.ai/v1/files/upload",

  // ─── Image Constraints ──────────────────────────────────────────────────
  MAX_IMAGES: 10,             // Maximum attachments per message
  MAX_IMAGE_SIZE_MB: 20,      // Maximum file size per image in MB

  // Accepted MIME types for image attachments.
  ACCEPTED_TYPES: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ],
};
