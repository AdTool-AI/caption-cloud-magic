# CORDIAL: Planung und Routing abschließen (ohne Budget)

Grenzen: keine Mediengenerierung, Produktion, Retries, Budgetfreigaben, Reservierungen oder Wallet-Buchungen. Keine zweite CORDIAL-Kampagne. Keine zusätzlichen Funktionen über diesen Plan hinaus. Bestehende Nachrichten, Ledger und Versuche bleiben.

## 1. Speichern ohne Datenverlust
- Zuordnung zuerst über vorhandene Shot-ID; der Shot-Index dient nur als Rückfall für Shots ohne ID. Beim Umsortieren wird dadurch kein Shot einem fremden Inhalt zugeordnet.
- Nicht mehr enthaltene Shots werden archiviert (`archived_at`), nie gelöscht, wenn Versuche existieren. Archivierte Shots zählen weder zum aktiven Routing noch zur 30-Sekunden-Summe.
- Routing-Fingerabdruck umfasst: Schnittdauer, Aktion/Beschreibung, Risiko, Format, Prompt, negativer Prompt, Referenzdateien, erforderliche Auflösung.
- Audio: Ein separat erstelltes Voiceover zählt nicht zum Fingerabdruck. Soll das Modell Sprache oder eigenen Ton erzeugen, gehören die relevanten Audioanforderungen (Sprechtext, Sprache, Tonquelle) dazu.
- Bei Änderung bleibt das alte Routing sichtbar, ist aber als veraltet markiert; Budgetschätzungen lehnen veraltete Shots ab.
- Tests: identisches Speichern erhält IDs/Routing/Kosten; Umsortieren erhält die richtige Zuordnung; geänderter Prompt/Referenz/Auflösung markiert nur diesen Shot veraltet; archivierte Shots fehlen in Summe und Routing.

## 2. Anbieter-Vergleich
- Für jeden integrierten geeigneten Anbieter dieselben Zielanforderungen (Schnittdauern 4/5/5/5/6/5 s, 9:16, Modus, Zielauflösung).
- Generierungsdauer je Modell nach dessen erlaubten Dauerstufen; immer tatsächlich berechnete Dauer und vollständigen Preis aus dem kanonischen Preiskatalog ausweisen.
- Erklären, welches Modell der Router wählt und warum (Punkte, QA-Daten, Konsistenz, Ausschlüsse).
- 3,04 USD und 9,10 USD Einstellung für Einstellung vergleichen (Modell je Shot, Auflösung, berechnete Dauer, Preis je Sekunde, Modus). Das Ergebnis wird erst aus diesem Vergleich abgeleitet, nicht vorab festgelegt.

## 3. Schnitt- vs. Generierungsdauer
- Pro Shot Schnittdauer und berechnete Generierungsdauer getrennt speichern; Tabelle mit Modell, API-Anbieter, Auflösung, USD-Kosten und Summe.
- Routing und unverbindliche USD-Kostenschätzung werden nur als Planungsdaten am Shot gespeichert: keine Budgetfreigabe, keine Freigabekarte, keine Reservierung, keine Abbuchung.

## 4. Referenzen
- Konkrete Logo-/Produktbild-URLs aus vorhandenen Quellen als `reference_only` speichern; fehlende Dateien und ungeklärte Rechte ausdrücklich markieren. Keine Ersatzbilder.

## 5. Planungsauftrag ohne „weiter“ fertigstellen
- Hintergrundauftrag speichert seinen Modus (`planning`) serverseitig; beim Wiederaufnehmen werden nur Planungswerkzeuge freigegeben, Produktion/Freigaben/Buchungen bleiben gesperrt, auch wenn der Auftrag manipuliert wird.
- Atomare Übernahme je Schritt (Lease), damit parallele Worker denselben Schritt nicht doppelt ausführen.
- Feste Obergrenzen: Schritte pro Lauf, Anzahl automatischer Fortsetzungen, interne Recherche-/Agent-Kosten (USD). Beim Erreichen: Fortschritt und Unterbrechungsgrund als sichtbare Nachricht speichern, kein weiterer Lauf.
- Verneinungen wie „keine Produktion“ heben den Modus nicht auf Normal an.

## 6. Berichtskorrektur
- 501 vs. 262: beide Abfragen mit Tabelle und Filter erneut ausführen und Unterschied belegen.
- Gekürzte Projektregel mit genauem Vorher-/Nachher-Text.

## Abschluss
- Bestehende CORDIAL-Planung vervollständigen (Routing speichern ohne Budgetschätzung, Referenzen).
- Gespeicherte Daten neu lesen: 6 aktive Shots, 30 s Schnittdauer, erhaltene IDs und Routing, Kostenaufschlüsselung, vorhandene/fehlende Referenzen.
- Vorher/Nachher: Wallet, erzeugte Videos, Ledger, Versuche, Freigaben, Reservierungen unverändert; neue Planungsobjekte und interne Agent-Kosten separat.
- Bericht trennt lokale Tests, Prüfung der bereitgestellten Version und reine Codeprüfung.

## Technische Details
- `campaign/shotPersistence.ts`: Matching per ID, dann Index; Fingerabdruck um prompt, negative_prompt, reference ids, required_resolution erweitert; Archivierung statt Löschen.
- Migration (additiv): `campaign_shots.archived_at`, `cut_duration_s`, `generation_duration_s` (nullable); `agent_tasks` nutzt vorhandene Spalten für `mode`, Fortsetzungszähler, Kostenzähler (falls fehlend: nullable/default-Spalten).
- `production.ts`: aktive Shots filtern `archived_at is null`; Stale-Guard; Vergleichsfunktion rein.
- `turnPolicy.ts`: Verneinungserkennung; `agent-task-resume`: planning-only Zweig mit atomarem Claim und Limits.
- Deno-Tests für alle Punkte; nur geänderte Funktionen deployen, danach rein lesend prüfen.
