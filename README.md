# VoiceScribe — Speech to Text

A modern, responsive Speech-to-Text web app built with plain **HTML, CSS, and
JavaScript** (no build step, no framework). Record audio in the browser, send it
to a **Whisper Large v3** endpoint, and watch the transcript appear — with
glassmorphism styling, light/dark mode, and smooth animations.

![VoiceScribe](docs/screenshot-dark.png)

## Features

- 🎙️ Big center microphone button with a live recording animation + timer
- 🔊 Records mic audio via `MediaRecorder` and uploads it as `multipart/form-data`
- ⏳ Loading spinner while the API transcribes
- 📝 Transcript shown in a large textarea, **appended** across multiple recordings
- 📊 Optional transcription **confidence** badge (when the API returns it)
- 📋 **Copy**, 🗑️ **Clear**, and ⬇️ **Download** transcript buttons
- ⚠️ Clear error messages for denied mic permission or API failures
- 🌙 Light / dark mode (remembers your choice; respects OS preference)
- 🧊 Modern glassmorphism UI with animated background

## Project structure

```
index.html          # Markup
style.css           # Glassmorphism styling, themes, animations
script.js           # Recording, API call, transcript + UI logic
config.example.js   # Template for your API URL/key  (committed)
config.js           # Your real API URL/key          (git-ignored)
```

## Setup

1. **Create your config** from the template:
   ```bash
   cp config.example.js config.js
   ```
2. **Add your API key** by editing `config.js`:
   ```js
   window.APP_CONFIG = {
     API_URL: "https://api.oxlo.ai/v1/audio/transcriptions",
     API_KEY: "sk_your_real_key_here",
     MODEL: "whisper-large-v3",
     FILE_FIELD: "file",
     RESPONSE_FORMAT: "verbose_json",
     LANGUAGE: "",
   };
   ```
   `config.js` is listed in `.gitignore`, so your key is never committed.
3. **Serve the folder** (mic access needs `https://` or `localhost`, not `file://`):
   ```bash
   python3 -m http.server 8000
   # then open http://localhost:8000
   ```

## Using a different Whisper endpoint

All endpoint details live in **one place** — the config object. To swap
providers, edit `config.js` (full guidance is in `config.example.js`):

| Field             | What it does                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `API_URL`         | Full transcription endpoint URL                                          |
| `API_KEY`         | Secret key, sent as `Authorization: Bearer <key>` (use `""` for none)   |
| `MODEL`           | Model id form field, e.g. `whisper-large-v3` (use `""` to omit)         |
| `FILE_FIELD`      | Multipart field name for the audio (`file` for OpenAI/Oxlo, `audio` for the bare `/transcribe` spec) |
| `RESPONSE_FORMAT` | `verbose_json` to enable the confidence score, or `json` for `{ text }` |
| `LANGUAGE`        | Optional ISO-639-1 hint (e.g. `en`); `""` auto-detects                  |

Examples:

- **Oxlo.ai** (default): `https://api.oxlo.ai/v1/audio/transcriptions`
- **OpenAI**: `https://api.openai.com/v1/audio/transcriptions`
- **Your own server** matching the spec in the task
  (`POST /transcribe`, returns `{ "text": "..." }`): set
  `API_URL` to `https://your-server.com/transcribe`, `FILE_FIELD` to `audio`,
  `MODEL`/`RESPONSE_FORMAT` to `""`.

The app expects a JSON response containing a `text` field:

```json
{ "text": "Transcribed speech appears here" }
```

It also understands OpenAI/Whisper `verbose_json` (with `segments[]`), from which
it derives the confidence score.

## Deployment

It's a fully static site — deploy the folder to any static host (Netlify,
Vercel, GitHub Pages, S3/CloudFront, nginx).

> **Security note:** any key placed in `config.js` ships to the browser and is
> visible to users. For production, prefer a small backend that holds the key
> and proxies requests to the Whisper API; then point `API_URL` at your proxy
> and leave `API_KEY` empty.
