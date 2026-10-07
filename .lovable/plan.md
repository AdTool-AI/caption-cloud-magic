# CORDIAL-Planung: Fortsetzungen richtig einstufen und Plan speichern

Grenzen: keine Medien, keine Produktion, keine Retries, keine Budgetfreigaben, keine Wallet-Buchungen. Keine zweite Kampagne. Bestehende Daten bleiben.

## Bereits bestätigt
- Die Server-Einstufung bewertet nur die aktuelle Nachricht. Bei „weiter“ findet sie kein Handlungsverb und wählt deshalb den Lesemodus. Leere oder sehr kurze Texte gelten sogar ausdrücklich als lesend.
- Die beiden „weiter“-Nachrichten (20:04 und 20:06 UTC) haben deshalb nur Lese-Antworten bekommen. Die Antwort um 20:06 sieht aus wie ein Plan, ist aber nur Text im Chat und wurde nicht gespeichert.

## 1. Ursache belegen
- Für die drei CORDIAL-Anfragen die gespeicherten Request-Einträge, die Modusentscheidung und die Werkzeugaufrufe auslesen. Belegen, welche Speicherwerkzeuge blockiert wurden oder gar nicht angeboten waren.

## 2. Drei Modi statt zwei
- **Lesend:** Statusfragen. Unverändert hart abgesichert.
- **Planung:** Neuer Modus, nur mit kostenlosen Planungswerkzeugen (Recherche, Fakten, Säulen, Geschäftsbereiche, Assets als reference_only, Videokonzept/Skript/Shots, Kampagnen-Update). Produktions-, Freigabe-, Retry-, Buchungs- und Generierungswerkzeuge sind auf dem Server gesperrt, sowohl in der angebotenen Liste als auch bei der Ausführung.
- **Normal:** Wie bisher.
- Kurze Fortsetzungen („weiter“, „continue“, „sigue“, „ok, mach“) übernehmen den Modus des letzten Auftrags in derselben Unterhaltung, höchstens aber Planung. Eine Fortsetzung kann nie Produktion oder Freigaben freischalten. Das Client-Kennzeichen kann weiterhin nur den Lesemodus erzwingen.
- „Planung speichern“ / „plan speichern“ gilt ausdrücklich als Planungsauftrag.

## 3. CORDIAL-Plan in der bestehenden Kampagne speichern
- Über den neuen Planungsmodus in Kampagne b5c51de3-… Website, Zielgruppe, Fakten mit Quellen, Säulen, Geschäftsbereiche, Assets (reference_only) und ein Video mit Skript und 5–7 Shots speichern, zusammen genau 30 s.
- Danach die Datenbank erneut lesen und den Nachweis zeigen (Anzahl Shots, Summe der Sekunden, Skript vorhanden).

## 4. Inhalt
- Absolute, unbelegte Aussagen („Kein Knacken. Kein Wackeln.“) entfernen oder durch belegte, vorsichtige Formulierungen ersetzen. Produktfamilien nur zusammen nennen, wenn eine Quelle den Zusammenhang belegt. Dazu eine Regel in die Agentenanweisung für Planungen aufnehmen.

## 5. Modellvergleich und Kosten
- Pro Modell den tatsächlichen API-Anbieter (z. B. Replicate, ModelArk) und den Hersteller (z. B. Kuaishou, ByteDance) getrennt angeben. Nur Modelle nennen, die im Katalog integriert sind.
- USD-Schätzung je Shot und gesamt aus dem bestehenden Preiskatalog. Das passiert als reine Rechnung, ohne Freigabekarte und ohne Reservierung. Unbekannte Preise bleiben ausdrücklich offen.

## 6. „Agent-Kosten $0.1577“
- Quelle im Code prüfen (usage-Event, Token-Kosten des Agentenmodells). Erklären: Das sind interne Rechenkosten für das Sprachmodell. Prüfen und belegen, ob davon etwas die Nutzer-Wallet belastet (Erwartung: nein, aber nachweisen). Die Antworten des Agenten sollen das künftig korrekt benennen statt „keine Kosten“.

## Prüfung und Bericht
- Tests: „weiter“ nach Planungsauftrag → Planung; „weiter“ nach Statusfrage → lesend; Fortsetzung nach Produktionsauftrag → höchstens Planung; im Planungsmodus werden alle bezahlten Werkzeuge abgelehnt; manipuliertes Kennzeichen kann den Modus nicht anheben.
- Vorher/Nachher: Wallet, Videos, Spend-Records, Versuche und Freigaben bleiben unverändert. Neue Planungszeilen und Nachrichten werden separat ausgewiesen.
- Nur die geänderten Funktionen deployen und danach rein lesend prüfen.
- Der Bericht trennt Ursache, Änderung, gespeicherte Planung, Tests und offene Lücken.

## Technische Details
- `_shared/muse/turnPolicy.ts`: `TurnMode` um `'planning'` erweitern, `PLANNING_TOOLS` = READ_ONLY_TOOLS + freie Tools aus `_shared/muse/campaign/`, `isContinuation(msg)`, `resolveTurnMode({message, clientReadOnly, previousUserMode})`. Den vorherigen Modus liest der Server aus `agent_request_ids` bzw. aus dem letzten Nutzer-Turn der Unterhaltung, nie vom Client.
- `muse-agent/index.ts`: Modus in `agent_request_ids` mitspeichern, `guardToolCall` für planning, eigene Planungsanweisung (Belegpflicht, Anbieter/Hersteller, Kostenrechnung ohne Freigabe).
- Kostenschätzung als lesendes Tool auf `_shared/videoPricingCatalog.ts` (keine Reservierung, kein Approval-Insert).
- Deno-Tests in `turnPolicy.test.ts`; EN/DE/ES-Muster für Fortsetzungen.
