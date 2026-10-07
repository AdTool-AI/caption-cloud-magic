# Verbleibende Oberflächenprobleme des AdTool Agents beheben

## Umfang und Sicherheitsgrenzen
- Nur Darstellung und mobile Bedienbarkeit ändern.
- Keine Agentenanfrage senden, keine Generierung, kein Retry, keine Freigabe und keine Abbuchung auslösen.
- Bestehende Kampagnen-, Chat-, Video- und Finanzdaten unverändert lassen.
- EN/DE/ES-Texte beibehalten.

## 1. Mobile Kopfzeile an der Ursache korrigieren
- Die beiden festen Elementgruppen der Kopfzeile so responsiv priorisieren, dass ihre Mindestbreiten zusammen nie größer als der Bildschirm werden.
- Auf sehr kleinen Breiten nur die wichtigsten Aktionen als Symbole zeigen; sekundäre Statusanzeigen erst ab passender Breite einblenden.
- Flexible Bereiche mit korrektem Schrumpfverhalten versehen und feste Abstände mobil reduzieren.
- Kein globales `overflow-x: hidden` und kein Abschneiden als Ersatz für eine passende Anordnung.
- Automatisiert prüfen, dass Dokument- und Kopfzeilenbreite bei 320 px, 375 px und 390 px nicht über den sichtbaren Bereich hinausgehen.

## 2. Nachrichtenfeld bei mobiler Bildschirmtastatur erreichbar halten
- Den Agentenbereich auf Mobilgeräten an die tatsächlich sichtbare Höhe koppeln statt an eine feste `75vh`-Höhe.
- Änderungen der sichtbaren Browserfläche über `visualViewport` berücksichtigen, mit `dvh`-Fallback für Browser ohne diese API.
- Nachrichtenliste und Eingabebereich als stabiles Flex-Layout führen: nur die Nachrichten scrollen, das Eingabefeld bleibt innerhalb der sichtbaren Agentenfläche am unteren Rand.
- Beim Fokus und bei Größenänderungen sicherstellen, dass das Eingabefeld sichtbar bleibt, ohne den Chat doppelt zu scrollen.
- Mit einer verkleinerten mobilen Sichtfläche als Tastatur-Simulation testen: Feld, Senden-Schaltfläche und letzte Nachricht bleiben erreichbar. Falls keine echte mobile Bildschirmtastatur testbar ist, wird diese Einschränkung ausdrücklich berichtet.

## 3. Chat-Markdown korrekt und sicher darstellen
- Nur Assistentenantworten mit dem bereits vorhandenen Markdown-Renderer und GFM-Unterstützung ausgeben; Nutzernachrichten bleiben unveränderter Klartext.
- Sichere, kompakte Darstellungsregeln für Absätze, Fettdruck, Listen, Links und Code definieren, passend zum bestehenden Stil.
- Rohes HTML nicht aktivieren; externe Links nur sicher in einem neuen Tab öffnen. Skript-/HTML-Inhalte dürfen nicht ausgeführt werden.
- Tests ergänzen: `**Fettdruck**` wird als Fettdruck dargestellt, Listen bleiben lesbar, HTML/Skripte bleiben inert und lange Inhalte erzeugen keinen horizontalen Überlauf.

## 4. Shot-Titel im Clip-Player verifizieren
- Den bestehenden Dialogtitel für aktuelle Clips und frühere Versuche prüfen: mindestens `V#·S#`, bei Shot-Karten zusätzlich der Shot-Zweck und bei Historie die Versuchnummer.
- Desktop und Mobil testen, sowohl über eine Shot-Karte als auch über „Clip ansehen“ aus dem Chat, ohne einen neuen Clip zu erzeugen.
- Sicherstellen, dass Titel, Player und Schließen-Steuerung auf kleinen Bildschirmen vollständig sichtbar bleiben.

## 5. Prüfung der bereitgestellten Vorschau
- Relevante Oberflächentests ausführen und den aktuellen Fehlerstatus der Vorschau kontrollieren.
- Authentifiziert mit den vorhandenen Café-Buur-Daten prüfen. Vorhandene Clips dürfen geöffnet und Eingabefelder fokussiert werden; es wird keine Nachricht gesendet und keine Produktions- oder Freigabeaktion ausgelöst.
- Screenshots anfertigen:
  - Desktop: Agentenchat mit gerendertem Markdown und geöffneter Clip-Ansicht samt Shot-Titel.
  - Mobil: vollständige Kopfzeile ohne Überlauf, erreichbares Nachrichtenfeld bei verkleinerter sichtbarer Höhe und Clip-Ansicht samt Shot-Titel.
- Vorher/Nachher kontrollieren, dass Wallet, Videos, Spend-Records, Produktionsversuche und Freigaben unverändert sind.
- Die eindeutig identifizierte geprüfte Vorschau-Version im Bericht nennen.
- Falls anschließend live veröffentlicht wird, die wichtigsten Darstellungsprüfungen dort wiederholen und die veröffentlichte Version ebenfalls eindeutig nennen.
- Abschlussbericht klar trennen in: umgesetzt, automatisiert geprüft, in der bereitgestellten Vorschau visuell geprüft, gegebenenfalls live nachgeprüft, verbleibende Einschränkungen.

## Technische Details
- Voraussichtlich betroffen: `src/components/layout/AppHeader.tsx`, einzelne vorhandene Kopfzeilen-Statuskomponenten, `src/pages/AdToolAgent.tsx`, optional eine kleine sichere Markdown-Komponente und fokussierte UI-/Playwright-Tests.
- `react-markdown` und `remark-gfm` sind bereits installiert; kein neues Paket nötig.
- Der Clip-Dialog besitzt bereits einen Titelpfad. Die Arbeit dort ist Prüfung und nur bei nachgewiesenem Darstellungsproblem eine kleine Korrektur.
- Keine Backend-Funktion, Kampagnenlogik, Preislogik, Wallet-Logik oder Retry-Bindung wird geändert oder bereitgestellt.
