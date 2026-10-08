# Roadmap — AdTool Agent campaigns
- [x] Phase A: research, pillars, business areas, content matrix, diversity + semantic duplicate check, coverage score, script + shot plan, social discovery — approved and completed 2026-09-30
- [ ] Phase B: shot-level model routing (learns from past QA per content category) + campaign approval + generation + per-shot QA + controlled retry — Video 1 generated for €3.40; all 5 shots have valid QA (needs_retry); retry plans prepared (all switch away from Kling 3, total ~10.04 vs 3.40 left) — need a new budget approval; no retry started
- [ ] Phase C: German voice/music + composition — blocked on B
- [ ] Phase D: upscale + final QA + demo/master export — blocked on C
- [ ] Phase E: leads + outreach drafts — blocked on D
- [ ] Phase F: connected email sending with approval — blocked on E

- [ ] Phase C (not started): compose Video 1 — German TTS voiceover, music/SFX, deterministic overlays/CTA from saved post_production, final QA → final_client_ready

- [x] Open points before more paid runs (2026-10-07): S2 read-only answer, interrupted/Ask-again, durable request idempotency, server read-only mode, single-shot retry approvals bound + atomic, View-clip UI — deployed and checked
- [x] Remaining Agent UI polish (2026-10-07): mobile header overflow fixed at source, keyboard-safe composer, safe Markdown, and clip titles verified on desktop/mobile without sending messages or triggering paid actions
- [x] CORDIAL: planning mode for continuations, plan saved in existing campaign without paid actions
- [ ] CORDIAL planning finish (2026-10-08): id-stable shot saves + archive, full routing fingerprint (prompt/negatives/refs/resolution/model audio), like-for-like comparison, cut vs generation seconds, reference_only assets, capped background planning jobs, negation fix, routing saved as planning data only
- [ ] Stufe 1 Spot-Fertigung (2026-10-08): Versuchsauswahl pro Shot, ein Schnittprojekt pro Kampagnen-Video, Ton/Text-Ebene, Agent-Werkzeuge (gesperrt in Lese/Planung), Export im Kampagnenbereich, technische + inhaltliche Prüfung, Statusstufen mit veraltetem Export — nur Mocks, keine bezahlten Aufrufe
