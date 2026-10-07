# CORDIAL-Planung: Fortsetzungen richtig einstufen und Plan speichern

Grenzen: keine Medien, keine Produktion, keine Retries, keine Budgetfreigaben, keine Wallet-Buchungen. Keine zweite Kampagne. Bestehende Daten bleiben.

## Bereits bestätigt
- Die Server-Einstufung bewertet nur die aktuelle Nachricht. Bei „weiter“ findet sie kein Handlungsverb und wählt deshalb den Lesemodus. Leere oder sehr kurze Texte gelten sogar ausdrücklich als lesend.
- Die beiden „weiter“-Nachrichten (20:04 und 20:06 UTC) haben deshalb nur Lese-Antworten bekommen. Die Antwort um 20:06 sieht aus wie ein Plan, ist aber nur Text im Chat und wurde nicht gespeichert.

## 1. Ursache belegen
- Für die drei CORDIAL-Anfragen die gespeicherten Request-Einträge, die Modusentscheidung und die Werkzeugaufrufe auslesen. Belegen, welche Speicherwerkzeuge blockiert wurden oder gar nicht angeboten waren.

## 2. Drei Modi statt zwei
- **Lesend:** Statusfragen. Unverändert hart abgesichert.
- **Planung:** Neuer Modus mit einer ausdrücklichen Liste einzeln freigegebener Werkzeuge. Das campaign-Verzeichnis wird nicht pauschal freigegeben. Für jedes Werkzeug wird im Code geprüft und festgehalten, dass es keine Medien, Produktionsjobs, Freigaben oder Buchungen auslösen kann. Interne API-Kosten, etwa für Recherche, werden je Werkzeug vermerkt, denn „ohne Wallet-Abbuchung“ heißt nicht „ohne interne Kosten“. Alle anderen Werkzeuge sperrt der Server, sowohl in der angebotenen Liste als auch bei der Ausführung.
- **Normal:** Wie bisher.
- Kurze Fortsetzungen („weiter“, „continue“, „sigue“, „ok, mach“) übernehmen den Modus des letzten serverseitig gespeicherten Auftrags derselben Unterhaltung, höchstens aber Planung.
- Nach einem fehlgeschlagenen oder abgelehnten Produktionsauftrag löst „weiter“ nie Produktion aus.
- Ist der Kontext nicht eindeutig, bleibt der Turn lesend und der Agent fragt gezielt nach.
- Eine ausdrückliche Statusfrage bleibt auch nach einem Planungsauftrag lesend.
- Das Client-Kennzeichen kann weiterhin nur den Lesemodus erzwingen.
- „Planung speichern“ / „plan speichern“ gilt ausdrücklich als Planungsauftrag.

## 3. CORDIAL-Plan in der bestehenden Kampagne speichern
- Über den neuen Planungsmodus in Kampagne b5c51de3-… Website, Zielgruppe, Fakten mit Quellen, Säulen, Geschäftsbereiche, Assets (reference_only) und ein Video mit Skript und 5–7 Shots speichern, zusammen genau 30 s.
- Wiederholbares Speichern: Ein erneutes „weiter“ oder eine Fortsetzung nach einem Abbruch ergänzt die vorhandenen Objekte gezielt. Dafür gibt es feste Schlüssel: Kampagne + Videonummer, Video + Shotnummer, normalisierter Fakt + Quelle, Asset-URL. So entstehen keine doppelten Skript-, Shot-, Fakten- oder Asset-Zeilen. Ein Test führt dasselbe Speichern zweimal aus und prüft, dass die Zeilenzahl gleich bleibt.
- Danach die Datenbank erneut lesen und den Nachweis zeigen: Anzahl Shots, Summe der Sekunden, Skript vorhanden.

## 4. Inhalt
- Absolute, unbelegte Aussagen („Kein Knacken. Kein Wackeln.“) entfernen oder durch belegte, vorsichtige Formulierungen ersetzen. Produktfamilien nur zusammen nennen, wenn eine Quelle den Zusammenhang belegt. Dazu eine Regel in die Agentenanweisung für Planungen aufnehmen.

## 5. Modellvergleich und Kosten
- Pro Modell den tatsächlichen API-Anbieter (z. B. Replicate, ModelArk) und den Hersteller (z. B. Kuaishou, ByteDance) getrennt angeben. Nur Modelle nennen, die im Katalog integriert sind.
- USD-Schätzung je Shot und gesamt aus dem bestehenden Preiskatalog. Das passiert als reine Rechnung, ohne Freigabekarte und ohne Reservierung. Unbekannte Preise bleiben ausdrücklich offen.

## 6. „Agent-Kosten $0.1577“
- Quelle im Code prüfen (usage-Event, Token-Kosten des Agentenmodells). Erklären: Das sind interne Rechenkosten für das Sprachmodell. Prüfen und belegen, ob davon etwas die Nutzer-Wallet belastet (Erwartung: nein, aber nachweisen). Die Antworten des Agenten sollen das künftig korrekt benennen statt „keine Kosten“.

## Prüfung und Bericht
- Tests:
  - „weiter“ nach einem Planungsauftrag läuft als Planung.
  - „weiter“ nach einer Statusfrage bleibt lesend.
  - „weiter“ nach einem fehlgeschlagenen oder abgelehnten Produktionsauftrag läuft höchstens als Planung, nie als Produktion.
  - „weiter“ ohne eindeutigen Kontext bleibt lesend und fragt nach.
  - Eine ausdrückliche Statusfrage nach einem Planungsauftrag bleibt lesend.
  - Im Planungsmodus wird jedes nicht freigegebene Werkzeug abgelehnt.
  - Ein manipuliertes Kennzeichen kann den Modus nicht anheben.
  - Doppeltes Speichern erzeugt keine doppelten Zeilen.
- Vorher/Nachher: Geplante Videokonzepte und Shots werden getrennt von erzeugten Videos gezählt. Neue Konzepte und Shots sind erlaubt. Erzeugte Medien, Produktionsversuche, Wallet, Spend-Records und Freigaben bleiben unverändert. Neue Planungszeilen und Nachrichten werden separat ausgewiesen.
- Nur die geänderten Funktionen deployen und danach rein lesend prüfen.
- Der Bericht trennt Ursache, Änderung, gespeicherte Planung, Tests und offene Lücken.

## Technische Details
- `_shared/muse/turnPolicy.ts`: `TurnMode` um `'planning'` erweitern. `PLANNING_TOOLS` ist eine explizite Liste: READ_ONLY_TOOLS plus einzeln geprüfte Planungswerkzeuge, jedes mit Vermerk zu internen API-Kosten. Ein Test stellt sicher, dass kein Werkzeug aus Produktion, Freigabe, Retry, Wallet oder Generierung enthalten ist. Dazu `isContinuation(msg)` und `resolveTurnMode({message, clientReadOnly, priorTurn})`. `priorTurn` ist der Modus und das Ergebnis des letzten gespeicherten Nutzer-Auftrags derselben Unterhaltung. Der Server liest ihn aus `agent_request_ids`, nie vom Client.
- Planungs-Schreibwerkzeuge in `_shared/muse/campaign/` auf Upsert über die genannten festen Schlüssel umstellen. Falls dafür eindeutige Indizes fehlen, folgt eine kleine Migration. Vorher werden vorhandene Duplikate gezählt, ohne etwas zu löschen.
- `muse-agent/index.ts`: Modus in `agent_request_ids` mitspeichern, `guardToolCall` für planning, eigene Planungsanweisung (Belegpflicht, Anbieter/Hersteller, Kostenrechnung ohne Freigabe).
- Kostenschätzung als lesendes Tool auf `_shared/videoPricingCatalog.ts` (keine Reservierung, kein Approval-Insert).
- Deno-Tests in `turnPolicy.test.ts`; EN/DE/ES-Muster für Fortsetzungen.
