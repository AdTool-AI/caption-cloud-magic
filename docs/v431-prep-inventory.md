# v431 — Vorbereitungsdossier (Analyse, keine Produktionsänderung)

Stand: v430.1 eingefroren. Dieses Dokument ändert kein Laufzeitverhalten. Es inventarisiert
die Legacy-Lip-Sync-Schreibstellen, klärt die roten `scene-state-write-contract`-Befunde,
ordnet den Output-Reader-Cleanup ein und legt die Migrationsgruppen fest.

Maschinenlesbares Gegenstück: `src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts`
(Schlüssel = stabile semantische ID, Zeilennummern sind volatile Fundstellen).

## 0. Kennzahlen

- **83 Legacy-Schreib-Statements** (Feld-Ebene: 89 betroffene Legacy-Felder).
- Rollenverteilung: state=81, output=1, substate=1
- Trigger: edge-invoke=51, webhook=16, watchdog=9, ui=4, fan-in=3
- Callback-Risiko: medium=66, high=16, low=1
- Kein einziger der 83 Writer prüft heute `active_run_id` oder `plate_generation` im
  Update-Filter. Alle laufen über `.eq("id", sceneId)` (bzw. `scene_id`) — der Run-Abgleich
  passiert, wenn überhaupt, vorher in JavaScript und ist damit nicht atomar.

## 1. Inventar

Rollen-Vertrag:

- `state` / `substate` — brauchen zwingend ein Ziel in `pipeline_state` / `pipeline_substate`.
- `output` / `job_metadata` / `diagnostic` — ausdrücklich **kein State-Wechsel**. Diesen
  Zeilen darf v431 später *keinen* `pipeline_state` andichten.

Ableitungsregel für `targetState` ist die DB-Funktion `composer_state_from_legacy()`:
`canceled → canceled`, `failed → failed`, `done|applied → complete`, `stitching → lipsync_muxing`,
`running → lipsync_running`, `audio_muxing` wirkt über `twoshot_stage`, `pending` erzwingt für
sich allein **keinen** Zustandswechsel (der Zustand ergibt sich aus `clip_status`/`twoshot_stage`),
`null` ist ein Feld-Reset ohne eigenen Zielzustand.

| ID | Datei:Zeile | Rolle | Trigger | Ziel-State | Ableitbar | Run-Guard | Atomar mit | Idempotenz | Callback-Risiko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SceneCard:canceled` | `src/components/video-composer/SceneCard.tsx:2431` | state | ui | canceled | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `useSceneGenerate:conditional-audio_prep-or-plate_rendering` | `src/hooks/useSceneGenerate.ts:136` | state | ui | forceCinematicSync ? 'audio_prep' : 'plate_rendering' | kontext | id-only | — | unguarded-low-traffic | medium |
| `useTwoShotAutoTrigger:pending` | `src/hooks/useTwoShotAutoTrigger.ts:129` | state | ui | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, clip_status, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `useTwoShotAutoTrigger:failed` | `src/hooks/useTwoShotAutoTrigger.ts:400` | state | ui | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `autopilotComposerBridge:plate-ready` | `supabase/functions/_shared/autopilotComposerBridge.ts:173` | state | fan-in | "plate_ready" | 1:1 | id-only | — | unguarded | medium |
| `continuity-chain:queued` | `supabase/functions/_shared/continuity-chain.ts:130` | state | fan-in | "queued" | 1:1 | id-only | clip_error, clip_status | unguarded | medium |
| `continuity-chain:failed` | `supabase/functions/_shared/continuity-chain.ts:201` | state | fan-in | "failed" | 1:1 | id-only | clip_error, clip_status | unguarded | medium |
| `lipsync-fail:failed` | `supabase/functions/_shared/lipsync-fail.ts:173` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `materialize-scene-output:write` | `supabase/functions/_shared/materialize-scene-output.ts:68` | output | edge-invoke | kein State-Wechsel | 1:1 | id-only | processed_video_url | unguarded-low-traffic | medium |
| `scene-hard-reset:idle` | `supabase/functions/_shared/scene-hard-reset.ts:601` | state | edge-invoke | "idle" | 1:1 | id-only | — | unguarded-low-traffic | medium |
| `scene-run-begin:clear` | `supabase/functions/_shared/scene-run-begin.ts:130` | state | edge-invoke | Reset des Legacy-Feldes — kein State-Wechsel | kontext | scene_id | clip_error, clip_status, dialog_shots | unguarded-low-traffic | medium |
| `auto-director-compose:plate-queued` | `supabase/functions/auto-director-compose/index.ts:216` | state | edge-invoke | 'plate_queued' | kontext | id-only | — | unguarded-low-traffic | medium |
| `cancel-dialog-lipsync:canceled` | `supabase/functions/cancel-dialog-lipsync/index.ts:200` | state | edge-invoke | canceled | 1:1 | id-only | — | unguarded-low-traffic | medium |
| `compose-clip-webhook:failed` | `supabase/functions/compose-clip-webhook/index.ts:490` | state | webhook | failed | 1:1 | id-only | twoshot_stage | unguarded | high |
| `compose-clip-webhook:clear` | `supabase/functions/compose-clip-webhook/index.ts:519` | state | webhook | Reset des Legacy-Feldes — kein State-Wechsel | kontext | id-only | clip_error, clip_status, dialog_shots, twoshot_stage | unguarded | high |
| `compose-clip-webhook:clear-2` | `supabase/functions/compose-clip-webhook/index.ts:633` | state | webhook | Reset des Legacy-Feldes — kein State-Wechsel | kontext | id-only | clip_error, clip_status, dialog_shots, twoshot_stage | unguarded | high |
| `compose-dialog-segments:failed` | `supabase/functions/compose-dialog-segments/index.ts:948` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:pending` | `supabase/functions/compose-dialog-segments/index.ts:1028` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, clip_status, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:pending-2` | `supabase/functions/compose-dialog-segments/index.ts:1125` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-2` | `supabase/functions/compose-dialog-segments/index.ts:1208` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-3` | `supabase/functions/compose-dialog-segments/index.ts:1240` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:conditional-running-or-pending` | `supabase/functions/compose-dialog-segments/index.ts:1285` | state | edge-invoke | konditional — manuell prüfen | kontext | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-4` | `supabase/functions/compose-dialog-segments/index.ts:1441` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-5` | `supabase/functions/compose-dialog-segments/index.ts:2512` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-6` | `supabase/functions/compose-dialog-segments/index.ts:2714` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-7` | `supabase/functions/compose-dialog-segments/index.ts:2837` | state | edge-invoke | failed | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-8` | `supabase/functions/compose-dialog-segments/index.ts:3003` | state | edge-invoke | failed | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-9` | `supabase/functions/compose-dialog-segments/index.ts:3245` | state | edge-invoke | failed | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-10` | `supabase/functions/compose-dialog-segments/index.ts:3529` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-11` | `supabase/functions/compose-dialog-segments/index.ts:3561` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-12` | `supabase/functions/compose-dialog-segments/index.ts:3830` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-13` | `supabase/functions/compose-dialog-segments/index.ts:3942` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-14` | `supabase/functions/compose-dialog-segments/index.ts:4161` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:pending-3` | `supabase/functions/compose-dialog-segments/index.ts:4221` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-15` | `supabase/functions/compose-dialog-segments/index.ts:4795` | state | edge-invoke | failed | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-16` | `supabase/functions/compose-dialog-segments/index.ts:5507` | state | edge-invoke | failed | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-17` | `supabase/functions/compose-dialog-segments/index.ts:6009` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:failed-18` | `supabase/functions/compose-dialog-segments/index.ts:7091` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded-low-traffic | medium |
| `compose-dialog-segments:running` | `supabase/functions/compose-dialog-segments/index.ts:7519` | state | edge-invoke | lipsync_running | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-scene-anchor:anchor` | `supabase/functions/compose-scene-anchor/index.ts:840` | substate | edge-invoke | konditional — manuell prüfen | kontext | id-only | twoshot_stage | unguarded-low-traffic | medium |
| `compose-twoshot-audio:failed` | `supabase/functions/compose-twoshot-audio/index.ts:653` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-video-clips:clear` | `supabase/functions/compose-video-clips/index.ts:641` | state | edge-invoke | Reset des Legacy-Feldes — kein State-Wechsel | kontext | id-only | — | unguarded-low-traffic | medium |
| `compose-video-clips:failed` | `supabase/functions/compose-video-clips/index.ts:1630` | state | edge-invoke | "failed" | 1:1 | id-only | clip_error, clip_status | unguarded-low-traffic | medium |
| `compose-video-clips:clear-2` | `supabase/functions/compose-video-clips/index.ts:1743` | state | edge-invoke | Reset des Legacy-Feldes — kein State-Wechsel | kontext | id-only | twoshot_stage | unguarded-low-traffic | medium |
| `compose-video-clips:pending` | `supabase/functions/compose-video-clips/index.ts:1888` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `compose-video-clips:pending-2` | `supabase/functions/compose-video-clips/index.ts:4131` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_status, twoshot_stage | unguarded-low-traffic | medium |
| `compose-video-clips:clear-3` | `supabase/functions/compose-video-clips/index.ts:4524` | state | edge-invoke | Reset des Legacy-Feldes — kein State-Wechsel | kontext | active_run_id, plate_generation | clip_error, clip_status, dialog_shots, twoshot_stage | guarded | low |
| `compose-video-clips:pending-3` | `supabase/functions/compose-video-clips/index.ts:4907` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_status, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `compose-video-clips:clear-4` | `supabase/functions/compose-video-clips/index.ts:5255` | state | edge-invoke | Reset des Legacy-Feldes — kein State-Wechsel | kontext | id-only | dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `generate-talking-head:plate-ready` | `supabase/functions/generate-talking-head/index.ts:464` | state | edge-invoke | 'plate_ready' | kontext | id-only | clip_status | unguarded-low-traffic | medium |
| `generate-talking-head:failed` | `supabase/functions/generate-talking-head/index.ts:510` | state | edge-invoke | 'failed' | kontext | id-only | clip_error, clip_status | unguarded-low-traffic | medium |
| `generate-talking-head:plate-rendering` | `supabase/functions/generate-talking-head/index.ts:648` | state | edge-invoke | 'plate_rendering' | kontext | id-only | — | unguarded-low-traffic | medium |
| `generate-talking-head:failed-2` | `supabase/functions/generate-talking-head/index.ts:695` | state | edge-invoke | 'failed' | kontext | id-only | clip_error, clip_status | unguarded-low-traffic | medium |
| ~~`hybrid-extend-scene:idle`~~ | `supabase/functions/hybrid-extend-scene/index.ts:194` | **insert-default (v431 G2.4 reklassifiziert, kein State-Writer)** | edge-invoke | "idle" als Feldwert im INSERT | — | kein From-State | — | — | — |
| `lipsync-watchdog:failed` | `supabase/functions/lipsync-watchdog/index.ts:325` | state | watchdog | failed | 1:1 | id-only | clip_error, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `lipsync-watchdog:clear` | `supabase/functions/lipsync-watchdog/index.ts:353` | state | watchdog | Reset des Legacy-Feldes — kein State-Wechsel | kontext | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `lipsync-watchdog:pending` | `supabase/functions/lipsync-watchdog/index.ts:690` | state | watchdog | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `motion-studio-superuser:plate-ready` | `supabase/functions/motion-studio-superuser/index.ts:513` | state | edge-invoke | "plate_ready" | 1:1 | id-only | — | unguarded-low-traffic | medium |
| `motion-studio-superuser:plate-ready-2` | `supabase/functions/motion-studio-superuser/index.ts:526` | state | edge-invoke | "plate_ready" | 1:1 | id-only | — | unguarded-low-traffic | medium |
| `qa-watchdog:failed` | `supabase/functions/qa-watchdog/index.ts:224` | state | watchdog | "failed" | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `qa-watchdog:canceled` | `supabase/functions/qa-watchdog/index.ts:309` | state | watchdog | "canceled" | 1:1 | id-only | clip_error, clip_status | unguarded-low-traffic | medium |
| `qa-watchdog:failed-2` | `supabase/functions/qa-watchdog/index.ts:352` | state | watchdog | "failed" | 1:1 | id-only | clip_error, clip_status | unguarded-low-traffic | medium |
| `qa-watchdog:canceled-2` | `supabase/functions/qa-watchdog/index.ts:444` | state | watchdog | "canceled" | 1:1 | id-only | clip_error, clip_status | unguarded-low-traffic | medium |
| `qa-weekly-deep-sweep:plate-ready` | `supabase/functions/qa-weekly-deep-sweep/index.ts:318` | state | watchdog | "plate_ready" | 1:1 | id-only | — | unguarded-low-traffic | medium |
| `recover-stuck-composer-clip:failed` | `supabase/functions/recover-stuck-composer-clip/index.ts:104` | state | watchdog | "failed" | 1:1 | id-only | clip_error, clip_status, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `remotion-webhook:done` | `supabase/functions/remotion-webhook/index.ts:278` | state | webhook | complete | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded | high |
| `remotion-webhook:failed` | `supabase/functions/remotion-webhook/index.ts:666` | state | webhook | failed | 1:1 | id-only | clip_error, dialog_shots, twoshot_stage | unguarded | high |
| `render-sync-segments-audio-mux:failed` | `supabase/functions/render-sync-segments-audio-mux/index.ts:749` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `render-sync-segments-audio-mux:audio-muxing` | `supabase/functions/render-sync-segments-audio-mux/index.ts:881` | state | edge-invoke | lipsync_muxing (via twoshot_stage=audio_muxing) | kontext | id-only | dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `render-sync-segments-audio-mux:failed-2` | `supabase/functions/render-sync-segments-audio-mux/index.ts:926` | state | edge-invoke | failed | 1:1 | id-only | clip_error, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `report-lipsync-motion-probe:failed` | `supabase/functions/report-lipsync-motion-probe/index.ts:305` | state | edge-invoke | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded-low-traffic | medium |
| `reset-lipsync-scene:pending` | `supabase/functions/reset-lipsync-scene/index.ts:119` | state | edge-invoke | kein direkter State (bleibt Vorzustand) | kontext | id-only | clip_error, clip_status, dialog_shots, twoshot_stage | unguarded-low-traffic | medium |
| `sync-so-webhook:running` | `supabase/functions/sync-so-webhook/index.ts:446` | state | webhook | lipsync_running | 1:1 | id-only | clip_error, dialog_shots, twoshot_stage | unguarded | high |
| `sync-so-webhook:failed` | `supabase/functions/sync-so-webhook/index.ts:796` | state | webhook | failed | 1:1 | id-only | clip_error, twoshot_stage | unguarded | high |
| `sync-so-webhook:failed-2` | `supabase/functions/sync-so-webhook/index.ts:1022` | state | webhook | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded | high |
| `sync-so-webhook:running-2` | `supabase/functions/sync-so-webhook/index.ts:1064` | state | webhook | lipsync_running | 1:1 | id-only | twoshot_stage | unguarded | high |
| `sync-so-webhook:running-3` | `supabase/functions/sync-so-webhook/index.ts:1076` | state | webhook | lipsync_running | 1:1 | id-only | dialog_shots, twoshot_stage | unguarded | high |
| `sync-so-webhook:applied` | `supabase/functions/sync-so-webhook/index.ts:1124` | state | webhook | complete | 1:1 | id-only | clip_error, clip_status, dialog_shots | unguarded | high |
| `sync-so-webhook:audio-muxing` | `supabase/functions/sync-so-webhook/index.ts:1181` | state | webhook | lipsync_muxing (via twoshot_stage=audio_muxing) | kontext | id-only | clip_error, dialog_shots | unguarded | high |
| `sync-so-webhook:running-4` | `supabase/functions/sync-so-webhook/index.ts:1445` | state | webhook | lipsync_running | 1:1 | id-only | dialog_shots | unguarded | high |
| `sync-so-webhook:failed-3` | `supabase/functions/sync-so-webhook/index.ts:1649` | state | webhook | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded | high |
| `sync-so-webhook:failed-4` | `supabase/functions/sync-so-webhook/index.ts:1725` | state | webhook | failed | 1:1 | id-only | clip_error, dialog_shots | unguarded | high |
| `sync-so-webhook:conditional-audio_muxing-or-running` | `supabase/functions/sync-so-webhook/index.ts:1751` | state | webhook | konditional — manuell prüfen | kontext | id-only | dialog_shots, twoshot_stage | unguarded | high |

### Schwerpunkt-Beobachtungen

- **`sync-so-webhook` (11 Stellen, alle `callbackRisk: high`)** — schreibt Zwischen- und
  Endzustände (`running`, `audio_muxing`, `applied`, `failed`) zusammen mit `dialog_shots`
  (Pass-Fan-in) in einem Statement, gefiltert nur über `.eq("id", sceneId)`. Es gibt keinen
  Job-ID- oder Run-Guard im Filter: ein verspäteter Callback eines abgebrochenen Runs kann
  eine frische Szene zurückwerfen. `partialMux`-Zweige schreiben zusätzlich konditionale
  Werte (`audio_muxing` vs. `running`) — für die Migration heißt das: erst Guard, dann State.
- **`remotion-webhook` (2)** — `done` und `failed`; `done` ist der eigentliche
  Complete-Übergang und muss atomar mit dem Output geschrieben werden.
- **`render-sync-segments-audio-mux` (3)** — Mux-Fan-in: `audio_muxing` und zwei
  Failure-Pfade. Zustand und finaler Output sind heute nicht garantiert im selben Statement.
- **`compose-dialog-segments` (23)** — mit Abstand der größte Writer; überwiegend
  Failure-Pfade (`failed`) plus Dispatch-Zustände (`pending`, `running`). Die Failure-Pfade
  sind 1:1 auf `failSceneState()` abbildbar, die Dispatch-Pfade brauchen Kontext
  (`twoshot_stage`), weil `pending` allein keinen Zustandswechsel bedeutet.
- **`compose-video-clips` (8)** — mischt Plate-Zustand mit Legacy-Lip-Sync-Resets
  (`lip_sync_status: null`); enthält zusätzlich einen direkten `pipeline_state: "failed"`.
- **UI-Writer** (`SceneCard`, `useSceneGenerate`, `useTwoShotAutoTrigger`) schreiben Zustand
  direkt aus dem Client. Sie gehören nach G5, sind aber die einzigen Writer, die ohne
  Service-Role laufen und damit zusätzlich RLS-abhängig sind.

## 2. `scene-state-write-contract` — Klassifikation der roten Befunde

Der Vertragstest (`supabase/functions/_shared/scene-state-write-contract.test.ts`) erlaubt
heute nur `scene-hard-reset.ts`, `scene-state.ts` und sich selbst. Direkte
`pipeline_state`-Writes existieren aktuell an 18 Stellen. Klassifikation in genau eine von
drei Kategorien:

| Stelle | Wert | Kategorie | Begründung |
| --- | --- | --- | --- |
| `continuity-chain.ts:136` | `queued` | 1 — `transitionScene()` | Regulärer Kettenstart aus `idle`; legaler Übergang, nur am Wrapper vorbei geschrieben. |
| `continuity-chain.ts:204` | `failed` | 2 — `failSceneState()` | Terminales Kettenversagen mit Fehlertext. |
| `compose-video-clips:1633` | `failed` | 2 — `failSceneState()` | Terminaler Renderfehler im eigenen Run. |
| `generate-talking-head:467` | `plate_ready` | 1 — `transitionScene()` | Erfolgreicher Plate-Abschluss. |
| `generate-talking-head:511` / `:696` | `failed` | 2 — `failSceneState()` | Terminale Fehler im eigenen Run. |
| `generate-talking-head:648` | `plate_rendering` | 1 — `transitionScene()` | Regulärer Start. |
| `autopilotComposerBridge:173` | `plate_ready` | 1 — `transitionScene()` | Import eines fertigen Autopilot-Assets; legaler Übergang. |
| `auto-director-compose:216` | `plate_queued` | 1 — `transitionScene()` | Regulärer Einreihungs-Übergang. |
| `motion-studio-superuser:513/526` | `plate_ready` | 1 — `transitionScene()` | Testharness setzt einen regulären Zustand; sollte denselben Wrapper nutzen wie Produktion, sonst testet der Harness eine Welt, die es nicht gibt. |
| `qa-weekly-deep-sweep:318` | `plate_ready` | **3 — Recovery-Override** | Sweep repariert Szenen, die einen Clip haben, aber im Zustand hängen. Vorzustand ist per Definition inkonsistent. |
| ~~`hybrid-extend-scene:194`~~ | `idle` | **v431 G2.4 korrigiert: insert-default, kein Recovery-Override** | Kein Reset einer Bestandszeile — der Wert steht im INSERT der neu angelegten Szene. Kein Vorzustand, kein Übergang, damit auch keine Runless-Ausnahme nötig. Die drei echten Failure-Writes laufen seit G2.4 run-/generation-gebunden über `composer_fail_hybrid_extend_scene`. |
| `qa-watchdog:228/312/358/447` | `failed` / `canceled` | **3 — Recovery-Override** | Springt aus beliebigen hängenden Zuständen auf terminal. Genau der Fall, den `failSceneState()` heute nicht ausdrücken kann, weil es einen gültigen Vorzustand voraussetzt. |
| `recover-stuck-composer-clip:107` | `failed` | **3 — Recovery-Override** | Wie oben, zusätzlich mit Legacy-Reset (`lip_sync_status: null`) im selben Statement. |

**Kategorie 3 ist eine Vertragslücke, keine Dauer-Erlaubnis.** Kein direkter
`pipeline_state`-Write wird dauerhaft allowlistet. Für G0 ist ein expliziter, getesteter
Recovery-Primitive zu bauen — Skizze:

```text
composer_recover_scene(
  _scene_id       uuid,
  _expected_run   uuid,          -- active_run_id ODER Run-Ledger-Eintrag; NULL nur bei
                                 -- nachweislich verwaistem Run (eigener Grund-Code)
  _expected_gen   int,           -- plate_generation
  _target         composer_scene_state,  -- NUR 'failed' | 'canceled'
  _reason         composer_recovery_reason,  -- Enum, kein Freitext
  _actor          text
) returns composer_scene_state
```

Pflichtbedingungen (sonst ist der Primitive nur ein schöner benannter Bypass):

1. **Run-Abgleich**: `active_run_id` / `plate_generation` bzw. ein vorhandener
   Run-Ledger-Eintrag muss geprüft werden; ein veralteter Run darf nichts überschreiben.
2. **Zielmenge**: ausschließlich `failed` oder `canceled`. Kein `idle`, kein `plate_ready`.
   Für `hybrid-extend-scene` und `qa-weekly-deep-sweep` heißt das: sie brauchen **nicht**
   den Recovery-Primitive, sondern entweder einen legalen Übergang oder den bestehenden
   Hard-Reset (`scene-hard-reset.ts`) als einzigen Zwangsschreiber.
3. **Maschinenlesbarer Grund** als Enum (`watchdog_timeout`, `orphaned_run`,
   `provider_gone`, `manual_operator`, …).
4. **Audit/Logging** mit Vorzustand, Zielzustand, Run-ID, Grund und Auslöser — Zeile in der
   bestehenden Übergangstabelle, nicht nur `console.log`.
5. **Test**: jeder Recovery-Aufruf muss durch einen Fixture-Test abgedeckt sein, der zeigt,
   dass ein veralteter Run **nicht** durchkommt.

Bis G0 steht, bleibt der Vertragstest wie er ist (rot für diese Stellen) — bewusst, als
sichtbare Schuld. Eine temporäre Allowlist-Eintragung ist nur zulässig, wenn sie die
Kategorie-3-Markierung und einen Verweis auf diese Tabelle trägt.

## 3. Legacy-Output-Randzeilen

Der v430-Audit hatte 8 Randzeilen notiert. Nachgemessen am aktuellen Datenstand:

| Prüfung | Ergebnis heute |
| --- | --- |
| `processed_video_url` gesetzt, `clip_url` abweichend | 0 Zeilen |
| `lip_sync_status in ('done','applied')` ohne `processed_video_url`/`base_video_url` | 0 Zeilen |
| `pipeline_state = 'complete'` ohne jede Output-URL | 0 Zeilen |
| `processed_video_url` gesetzt, aber `pipeline_state <> 'complete'` | 0 Zeilen |
| Gesamt: `processed_video_url` gesetzt / `lip_sync_status='done'` | 228 / 228 (deckungsgleich) |

**Befund:** Die 8 Randzeilen existieren nicht mehr — sie wurden durch die v430.0-Migration
(228 Szenen) mitkorrigiert. Es bleibt eine legitime Restklasse, die *keine* Anomalie ist:

- 160 Szenen `failed` + `base_video_url` gesetzt, `processed_video_url` NULL (Plate da,
  Lip-Sync nie fertig) — korrekt, `resolveSceneOutput()` liefert die Base-URL.
- 10 Szenen `canceled` mit Base-URL — dito.
- 1 Szene `plate_ready` / `pending` — regulärer Zwischenzustand.

**Empfehlung:** keine Datenkorrektur, keine neue Resolver-Regel. Stattdessen die drei
Restklassen als erwartete Zustände in den Output-Paritätstest aufnehmen, damit ein späteres
Wiederauftreten echter Anomalien vom Rauschen unterscheidbar bleibt.

## 4. Eigener Track T1 — `compose-video-assemble` → `resolveSceneOutput()`

Kein Teil der Writer-Migration; es ist ein **Output-Reader-Cleanup**.

Heutiger Stand: `compose-video-assemble/index.ts` prüft die Verwendbarkeit einer Szene über
`legacyClipReadyEquivalentRow(s) && !!s.clip_url` (Zeile 153), patcht `clip_url` bei
Upload-Szenen manuell (Zeile 179/180), probet die Dauer über `s.clip_url` (Zeile 221) und
gibt zuletzt `videoUrl: s.clip_url` in die Assembly (Zeile 328). Die geteilte Kette
`resolveSceneOutput()` (`processed → base → legacy_clip → upload`) wird nicht benutzt.

- **Abweichung:** Solange `materializeCompatibilityOutput()` `clip_url` sauber
  nachführt, ist das Ergebnis identisch; bricht die Materialisierung einmal aus, fällt
  Assembly auf einen veralteten Clip zurück, statt auf `processed_video_url`.
- **Aufwand:** klein (ein Reader, vier Fundstellen).
- **Risiko:** Export-Parität — muss mit einem Vorher/Nachher-Vergleich über bestehende
  Projekte belegt werden, nicht nur durch Unit-Tests.
- **Empfehlung:** eigener kleiner Track, unabhängig von G0–G5, aber **vor** G6. Die
  Bridge-Abschaltung nimmt der Legacy-`clip_url`-Nachführung ihre Selbstverständlichkeit;
  bis dahin sollte Assembly über den geteilten Resolver lesen.

## 5. Migrationsgruppen

```text
G0  State-/Recovery-Verträge vervollständigen
    transitionScene / failSceneState / composer_recover_scene (Kategorie-3-Fälle)
G1  Einfache terminale UI-/Cancel-Pfade
    cancel-dialog-lipsync, SceneCard:canceled, lipsync-fail, explizite Failure-Helper
G2  Audio-/Dispatch-Zwischenzustände
    compose-twoshot-audio, compose-dialog-segments Dispatch-/Start-Pfade, useSceneGenerate
G3  Webhooks + Mux/Fan-in
    sync-so-webhook, remotion-webhook, compose-clip-webhook,
    compose-dialog-segments Failure-Fan-in, render-sync-segments-audio-mux
G4  Watchdog/Recovery
    qa-watchdog, lipsync-watchdog, recover-stuck-composer-clip, qa-weekly-deep-sweep
    -> erst nachdem dieselben States durch G1-G3 sauber geschrieben werden
G5  verbleibende Client-/Compatibility-Pfade
    useTwoShotAutoTrigger, ClipsTab-Reader, autopilotComposerBridge
G6  Reverse-Bridge global abschalten

Eigener Track (parallel, nicht Teil von G0-G6):
T1  compose-video-assemble -> resolveSceneOutput() (Output-Reader-Cleanup), vor G6
```

Watchdog/Recovery steht bewusst spät: die Läufe sind selten, treffen aber genau die
kaputten und race-lastigen Zustände. Abbruchkriterien je Gruppe:

| Gruppe | Abbruchkriterium | Nachweis |
| --- | --- | --- |
| G0 | Recovery-Primitive lehnt veralteten Run ab; Audit-Zeile entsteht | Fixture-Test + Übergangstabelle |
| G1 | keine Änderung an sichtbarer Cancel-Semantik | Composer-Suite + UI-Smoke |
| G2 | Dispatch erzeugt dieselben Zustände wie heute, keine Doppel-Runs | Run-/Kosten-Paritätsnachweis wie in v430.1 |
| G3 | verspäteter Callback eines alten Runs verändert nichts | Fixture mit out-of-order Callbacks |
| G4 | hängende Szene wird terminal, frische Szene bleibt unberührt | Recovery-Fixture über beide Fälle |
| G5 | Client schreibt keinen Zustand mehr direkt | Scanner-Test (Client-Writer = 0) |
| G6 | kein `state`/`substate`-Legacy-Write mehr im Inventar | Inventar-Guard grün |

## 6. Guard-Semantik der Fixture

`src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts` friert **alle** Legacy-Writes
ein, der spätere Guard unterscheidet aber nach `writeRole`:

- **bindend**: `state`, `substate` — neue Schreibstelle ohne Inventareintrag = Testfehler,
  und diese Rollen bestimmen, wann G6 überhaupt möglich ist.
- **nicht bindend**: `output`, `job_metadata`, `diagnostic` — werden separat bewertet und
  blockieren die Bridge-Abschaltung nicht automatisch.

In diesem Auftrag wird die Fixture nur erzeugt und gegen den Ist-Stand eingefroren; der
erzwingende Contract-Test entsteht in G0.

## 7. Abgrenzung dieses Auftrags

- Kein Writer umgestellt, kein Recovery-Primitive gebaut.
- Reverse-Bridge unverändert aktiv.
- Keine Migration, keine Datenkorrektur.
- Keine Allowlist-Erweiterung im `scene-state-write-contract`-Test.
- Nächster Schritt: Freigabe G0, danach erst G1.
