# Offene Punkte AdTool Agent abschließen und prüfen

Grenzen: keine Videos, keine Retries, keine Wallet-Buchungen, keine neuen oder erweiterten Budgetfreigaben. Bestehende Daten und Versuche bleiben erhalten. Punkte werden nacheinander erledigt.

## 0. Ausgangsstand festhalten
Vorher und nachher erfassen: Wallet-Stand, Anzahl Videos, Spend-Records, Freigaben (Anzahl und Status), Versuche, Nachrichten. Abweichungen vom letzten Stand (92,32 USD, 501, 10) werden dokumentiert.

## 1. S2-Antwort erneut testen
- Lesende Frage zu S2 erneut stellen.
- Erwartet: vorgeschlagenes Modell, Kosten in USD, QA-Probleme, geplante Änderungen, ob neue Freigabe nötig ist. Fehlendes wird ausdrücklich als fehlend genannt.
- Fehlt etwas, wird die Statusabfrage bzw. die Agentenanweisung ergänzt und erneut getestet.

## 2. Antwortabbruch und „Erneut fragen“
- Kontrollierter Testfehler nur für einen Testmodus (Kennzeichen in der Anfrage, nur für Admins, löst vor jedem Modell- oder Provider-Aufruf aus).
- Prüfen: Unterbrechungsmeldung bleibt nach Neuladen; Button nur an der neuesten passenden Nachricht; Doppelklick erzeugt keine doppelte Anfrage (Button sperrt sofort, Server verwirft gleiche Anfrage per Kennung); alte Generierungs-/Retry-Anweisungen werden nie automatisch erneut gesendet.

## 3. Retry-Freigaben eindeutig binden
- Neue Felder an der Freigabe: Kampagne, Shot, konkreter Versuch, Modell, Einstellungen (Dauer, Auflösung, Modus), Währung, Kostenlimit.
- Beim Start prüft der Server alle Werte gegen den aktuellen Shot und Retry-Plan; jede Abweichung wird abgelehnt und verlangt eine neue Freigabe.
- Alte Freigaben ohne diese Zuordnung gelten nie für einen neuen Versuch.
- Automatisierte Tests mit gemockten Provider-Aufrufen: falscher Shot, falscher Versuch, anderes Modell, andere Einstellung, höheres Limit, alte Freigabe ohne Zuordnung, abgelaufen, bereits verbraucht.
- Es wird keine Freigabe angelegt; Tests laufen nur gegen Testdaten bzw. reine Funktionen.

## 4. Lesende Fragen serverseitig absichern
- Lesemodus im Agenten: der Server stellt in diesem Modus nur lesende Werkzeuge bereit und blockt zusätzlich bei der Ausführung jedes Werkzeug, das generiert, Retries startet, Freigaben ändert oder bucht.
- Aktivierung: Statusfragen werden als Lesemodus gesendet (vom Client gekennzeichnet und serverseitig durchgesetzt); unklare Fälle bleiben im normalen Modus mit den bestehenden Freigabe-Prüfungen.
- Tests ohne Provider-Aufrufe: jedes kostenpflichtige Werkzeug liefert im Lesemodus eine Ablehnung, lesende Werkzeuge funktionieren.

## 5. Oberfläche vollständig prüfen
- Testnachricht mit Clip-Ergebnis nur in einer Testunterhaltung (verweist auf ein bestehendes Video, keine Generierung), danach entfernt bzw. als Test markiert.
- Screenshots Desktop und Mobil: Scrollen, Nachrichtenfeld, Freigaben, Shot-Karten, Clip-Player, „Clip ansehen“ springt zum Shot.

## Ergänzungen (verbindlich)
- **Lesemodus serverseitig erzwungen:** Der Server entscheidet selbst, ob eine Anfrage eine Statusfrage ist (eigene Einstufung vor dem Modellaufruf). Ein Client-Kennzeichen kann den Lesemodus nur einschalten, nie ausschalten. Ein fehlendes oder manipuliertes Kennzeichen umgeht die Sperre nicht. Das wird ausdrücklich getestet.
- **Dauerhafte Idempotenz:** Request-IDs werden in der Datenbank gespeichert, eindeutig pro Nutzer, zusammen mit einem Inhalts-Fingerabdruck. Das wirkt auch bei parallelen Anfragen, nach Neuladen und nach einem Neustart der Funktion. Gleiche ID mit anderem Inhalt wird abgelehnt. Getestet wird mit parallelen Anfragen.
- **Atomare Freigabe-Reservierung:** Der Start einer Freigabe wird in einem einzigen Datenbankschritt geprüft und als verbraucht markiert. Zwei gleichzeitige Starts können dieselbe Freigabe nicht beide nutzen. Das wird mit einem Parallelitätstest und gemocktem Provider geprüft. Das Kostenlimit kann nach der Freigabe nicht mehr geändert werden; die tatsächlichen Kosten dürfen darunter liegen.
- **Vollständige Bindung:** Gebunden werden auch Provider, Referenzdateien und die freigegebene Version des Retry-Plans (Fingerabdruck). Ein Test prüft die Werte, die tatsächlich an den gemockten Provider übergeben werden. Ändert sich der gebundene Plan, wird die alte Freigabe abgelehnt.
- **Deploy und Nachprüfung:** Erst nach den lokalen Tests werden nur die geänderten Funktionen und die Migration bereitgestellt. Danach wird die bereitgestellte Version noch einmal rein lesend geprüft.

## Bericht
Getrennt nach: umgesetzt / lokal getestet / an der bereitgestellten Version geprüft / nur per Code geprüft / offen. Im Vorher-Nachher-Vergleich werden die erwarteten neuen Testnachrichten separat aufgeführt. Wallet, Videos, Spend-Records, Produktionsversuche und Freigaben bleiben unverändert. Bestehende Nachrichten werden nicht gelöscht.

## Technische Details
- `supabase/functions/muse-agent/index.ts`: `readOnly`-Flag, Test-Fehler-Hook (Admin-only, vor Modellaufruf), Idempotenz per Client-Request-ID.
- `_shared/muse/toolRuntime.ts` / `tools.ts`: Werkzeugliste nach Modus filtern + harte Sperre im Dispatcher.
- `_shared/muse/campaign/production.ts`: Binding-Prüfung vor `dispatchShot` im Retry-Pfad; Migration mit nullable Spalten (`shot_id`, `attempt_no`, `model`, `settings` jsonb, `currency`, `max_cost`) an der Freigabetabelle; alte Zeilen bleiben unverändert und gelten als ungebunden.
- Neue Deno-Tests für Binding und Lesemodus; Vitest für Ask-again-Logik.
- Nur geänderte Funktionen deployen; EN/DE/ES-Parität.
