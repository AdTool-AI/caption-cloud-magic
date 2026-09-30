---
name: Gemini Vision MP4 Payload Shapes
description: Which Lovable AI Gateway payload shapes return 200 for MP4 video input on google/gemini-2.5-flash (re-verified 2026-09-30)
type: feature
---

Re-verified 2026-09-30 (gateway log 01a0f109-85ba-778c-98f0-527e06b50a59 + direct tests, 19.2 MB 1080p MP4):

| Variante | Status |
|---|---|
| `type=input_video` mit mp4-URL | **400** "content part type" — NICHT mehr verwenden |
| **`type=image_url` mit öffentlicher mp4-URL** | **200** ✅ (kein Download, keine Größengrenze im Code) |
| **`type=image_url` mit `data:video/mp4;base64,...`** | **200** ✅ (auch 19.2 MB) |

Strategie `agent-video-qa`: öffentliche URL via `image_url` primär, base64 (≤18 MB) Fallback.
`_shared/plate-face-detect.ts` / `validate-frame-face` nutzen noch `input_video` — separat prüfen, nicht ungefragt ändern (Lip-Sync-Freeze).
