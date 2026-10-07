# CORDIAL: Planung und Routing abschließen (ohne Budget)

Grenzen: keine Mediengenerierung, Produktion, Retries, Budgetfreigaben, Reservierungen oder Wallet-Buchungen. Keine zweite CORDIAL-Kampagne. Bestehende Nachrichten, Ledger und Versuche bleiben.

## Bestätigt aus dem Code
- Beim Speichern des Plans werden alle Shots eines Videos gelöscht und neu angelegt (`runtime.ts`, Zeilen 319 und 362). Dadurch gehen IDs, Modellwahl und Kosten verloren.

## 1. Speichern ohne Datenverlust
- Shots per stabilem Schlüssel (Video + Shot-Index bzw. vorhandene ID) aktualisieren statt ersetzen; nur wirklich entfernte Shots werden archiviert (nicht gelöscht, falls Versuche existieren).
- Inhalts-Fingerabdruck der routingrelevanten Felder (Dauer, Aktion, Risiko, Format, Referenzen). Nur bei Änderung: `routing_stale = true` für diesen Shot; sonst bleiben Modell und Kosten.
- Test: zweimal identisch speichern → gleiche IDs, Routing, Kosten; ein Shot geändert → nur dieser veraltet.

## 2. Routing nachvollziehbar
- Tatsächliche Routerentscheidung je Shot aus `routing.ts` auslesen (Punkte, Strafen, Ausschlüsse) und erklären, warum Wan 2.7 Pro gewinnt.
- Vergleich integrierter Anbieter bei identischen Anforderungen (gleiche Generierungsdauer, Auflösung, Format), Kosten aus dem kanonischen Preiskatalog.
- 3,04 USD und 9,10 USD werden auf ihre Herkunft geprüft und als vergleichbar oder nicht vergleichbar gekennzeichnet.

## 3. Schnitt- vs. Generierungsdauer
- Pro Shot getrennt speichern: Schnittdauer (Summe exakt 30 s) und Generierungsdauer (vom Modell erlaubte Mindest-/Stufen-Dauer, voll berechnet).
- Tabelle je Shot: Schnittdauer, Generierungsdauer, Modell, API-Anbieter, Auflösung, USD-Kosten; Summe.
- Empfehlung als Planungsdaten speichern (kein Freigabe-Datensatz, keine Karte).

## 4. Referenzen
- Konkrete Logo-/Produktbild-URLs aus bereits recherchierten Quellen als `reference_only` speichern.
- Fehlende Dateien und ungeklärte Nutzungsrechte ausdrücklich markieren. Keine Ersatzbilder generieren.

## 5. Auftrag ohne „weiter“ fertigstellen
- Autorisierter Planungsauftrag speichert Fortschritt; Fortsetzung über bestehenden `agent_tasks`-Mechanismus nur mit Planungswerkzeugen, fester Schrittgrenze pro Lauf und Gesamtgrenze.
- Bei echtem Hindernis: gespeicherte Unterbrechungsmeldung mit Grund, kein weiterer Lauf.

## 6. Berichtskorrektur
- 501 vs. 262: beide Abfragen mit Tabelle und Filtern erneut ausführen und Unterschied erklären.
- Gekürzte Projektregel mit genauem Vorher-/Nachher-Text aus der Git-Historie zeigen.

## Abschlussprüfung
Gespeicherte Daten neu lesen: 6 Shots, 30 s Schnittdauer, erhaltene Shot-IDs und Routing, Kostenaufschlüsselung, vorhandene/fehlende Referenzen. Vorher/Nachher: Wallet, erzeugte Videos, Ledger, Versuche, Freigaben unverändert; neue Planungsobjekte separat ausgewiesen.

## Technische Details
- `_shared/muse/campaign/runtime.ts`: Upsert statt Delete/Insert für `campaign_shots`; Fingerabdruck + `routing_stale`.
- Migration (additiv): nullable `cut_duration_s`, `generation_duration_s`, `routing_fingerprint`, `routing_stale bool default false`, `archived_at` auf `campaign_shots`; Planungsauftrag-Fortschritt in `agent_tasks` (neuer kind, planning-only).
- `routing.ts`: Entscheidungs-Trace exportieren; Vergleichsfunktion rein.
- `agent-task-resume`: Planungsfortsetzung mit PLANNING_TOOLS, Schrittlimit.
- Deno-Tests für Upsert-Erhalt, Stale-Markierung, Dauertrennung, Fortsetzungs-Limit. Nur geänderte Funktionen deployen, danach rein lesend prüfen.
