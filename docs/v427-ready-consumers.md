# v427C — Inventar der `ready`-Consumer (Phase 0)

Vor dem Flip (C3) muss jede Stelle, die `clip_status`, `lip_sync_status`, `pipeline_state`,
`clip_url` oder `last_frame_url` liest, auf die neuen Gates umgestellt sein:

```text
Kontinuitäts-Gate:   base_clip_status = ready AND Übergangsmaterial vorhanden
Nutzer-/Export-Gate: clip_status = ready AND (requires_lip_sync = false OR lip_sync_status = done)
```

## Backend (`supabase/functions/`)

| Datei | Rolle | Ziel-Gate |
|---|---|---|
| `_shared/continuity-chain.ts` | Kettenfortsetzung | Kontinuitäts-Gate |
| `_shared/scene-state.ts` | Zustandsprojektion | beide (Quelle der Wahrheit) |
| `_shared/scene-run-begin.ts`, `_shared/scene-hard-reset.ts` | Run-Start / Purge | unverändert (Freeze) |
| `compose-clip-webhook` | Basisabschluss | schreibt `base_clip_ready` (C1) |
| `modelark-poll` | Poller | nur assert + Heartbeat |
| `sync-so-webhook`, `compose-dialog-segments` | Lip-Sync-Segmente | Segment-Jobs |
| `compose-video-assemble`, `compose-stitch-and-handoff` | Export/Handoff | Nutzer-Gate |
| `composer-cancel-scene`, `composer-cancel-project` | Abbruch | Nutzer-Gate |
| `recover-stuck-composer-clip`, `qa-watchdog`, `qa-weekly-deep-sweep` | Sweeper | beide |
| `remotion-webhook` | Mux/Render | Nutzer-Gate |
| `_shared/autopilotComposerBridge.ts`, `auto-director-compose` | Autopilot | Nutzer-Gate |
| `hybrid-extend-scene`, `generate-composer-image-scene` | Sonderpfade | Nutzer-Gate |
| `composer-reset-selftest`, `lipsync-selftest`, `reset-lipsync-scene` | QA | beide |

## Frontend (`src/`)

| Datei | Rolle | Ziel-Gate |
|---|---|---|
| `lib/composer/sceneState.ts` | Projektion für UI | beide |
| `lib/composer/isRealizedScene.ts` | "fertig?"-Prädikat | Nutzer-Gate |
| `lib/video-composer/lipSyncPending.ts` | Lip-Sync-Wartezustand | Nutzer-Gate |
| `lib/video-composer/sceneSnapshot.ts` | Snapshot/Persistenz | beide |
| `hooks/useSceneGenerate.ts`, `hooks/useTwoShotAutoTrigger.ts` | Start/Trigger | beide |
| `hooks/useComposerPersistence.ts` | Speichern/Laden | beide |
| `lib/adDirector/spawnAdCampaignChildren.ts` | Kampagnen | Nutzer-Gate |
| `pages/MotionStudio/StudioMode.tsx` | Studio-Anzeige | beide |

Fortschrittsanzeige (`usePipelineProgress`, `pipelineEvents`) leitet ihre Phasen ab C-Phase
ausschließlich aus `pipeline_state` ab.

## Phase-0-Punkt erledigt

`tail_padding_ms` ist extrahiert: `supabase/functions/_shared/v427-duration-contract.ts`
(`TAIL_PADDING_MS = 300`, dazu Grace 300 ms, Cap 5 s, Step 100 ms, Sprecherpause 250 ms sowie
die Providerfenster). Die Werte stammen unverändert aus `compose-twoshot-audio`, das jetzt die
benannten Konstanten nutzt. Bewacht durch `src/lib/composer/__tests__/v427DurationContract.test.ts`.
