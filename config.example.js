/* =========================================================================
   config.example.js  —  COPY THIS FILE TO  config.js  AND FILL IN YOUR KEY
   -------------------------------------------------------------------------
   The app loads `config.js` (NOT committed to git) before script.js and reads
   the values from `window.APP_CONFIG`. Keeping the real key in config.js, which
   is listed in .gitignore, prevents the secret from ending up in version
   control.

   ┌─────────────────────────────────────────────────────────────────────┐
   │  HOW TO POINT THIS AT A REAL WHISPER ENDPOINT                         │
   ├─────────────────────────────────────────────────────────────────────┤
   │  This template is pre-configured for Oxlo.ai's OpenAI-compatible      │
   │  Whisper Large v3 endpoint. To use a DIFFERENT provider:              │
   │                                                                       │
   │  1. Set API_URL to the provider's transcription endpoint, e.g.        │
   │       - Oxlo.ai : https://api.oxlo.ai/v1/audio/transcriptions         │
   │       - OpenAI  : https://api.openai.com/v1/audio/transcriptions      │
   │       - Self-host (your spec): https://your-server.com/transcribe     │
   │  2. Set API_KEY to your secret key (leave "" if your endpoint needs   │
   │     no auth, e.g. a local server).                                    │
   │  3. Set MODEL to the model id the provider expects                    │
   │     (e.g. "whisper-large-v3"). Set to "" to omit the field.           │
   │  4. FILE_FIELD is the multipart form field name for the audio file.   │
   │     OpenAI/Oxlo use "file". The simple "/transcribe" spec uses        │
   │     "audio" — change it to match YOUR server.                         │
   │  5. RESPONSE_FORMAT: "verbose_json" returns per-segment data so the   │
   │     app can show a confidence score. Use "json" for a plain           │
   │     { "text": "..." } response.                                       │
   └─────────────────────────────────────────────────────────────────────┘
   ========================================================================= */

window.APP_CONFIG = {
  // Full URL of the transcription endpoint.
  API_URL: "https://api.oxlo.ai/v1/audio/transcriptions",

  // Secret API key. Sent as "Authorization: Bearer <API_KEY>".
  // NEVER commit your real key — keep it only in config.js.
  API_KEY: "YOUR_API_KEY_HERE",

  // Model id sent as a form field. Set to "" to omit it entirely.
  MODEL: "whisper-large-v3",

  // Multipart form field name for the audio file ("file" for OpenAI/Oxlo,
  // "audio" for the bare POST /transcribe spec).
  FILE_FIELD: "file",

  // "verbose_json" enables a confidence score; "json" returns just { text }.
  RESPONSE_FORMAT: "verbose_json",

  // Optional ISO-639-1 hint (e.g. "en"). Leave "" to auto-detect.
  LANGUAGE: "",
};
