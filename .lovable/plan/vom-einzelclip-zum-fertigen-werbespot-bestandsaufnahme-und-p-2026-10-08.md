# Vom Einzelclip zum fertigen Werbespot – Bestandsaufnahme und Plan

Grundlage: nur Codeprüfung. Es wurde nichts ausgeführt, generiert oder gebucht. „Funktionsfähig“ heißt unten: echter Anbieteraufruf im Code vorhanden. Getestet wurde in dieser Prüfung noch nichts.

## Bestandsaufnahme

| Funktion | Vorhandene UI | Backend / Anbieter | Zustand | Nachweis | Fehlende Arbeit |
|---|---|---|---|---|---|
| Recherche, Konzept, Skript, Shots | Agent-Chat, Kampagnenbereich | Kampagnen-Werkzeuge des Agenten | funktionsfähig, live geprüft | CORDIAL: 6 Shots, 30 s gespeichert | – |
| Modellwahl, Kosten, Produktion nach Freigabe | Agent, Freigabekarte | Router, Preisliste, `generate-*-video` | funktionsfähig, Café Buur bezahlt getestet | Video 1 erzeugt, 5 Versuche | Audio-Fähigkeit nicht im Router gefiltert |
| Clips prüfen | Kampagnenbereich | Shot-QA | funktionsfähig | 5 gültige QA-Ergebnisse Café Buur | Auswahl „dieser Versuch kommt in den Schnitt“ fehlt |
| Kürzen und Zusammenfügen | Director's Cut | `render-directors-cut` → Remotion Lambda | funktionsfähig (Code) | echte Lambda-Anfrage, Szenen mit Start/Ende | Kampagnen-Shots können nicht in Director's Cut geladen werden (nur Motion-Studio-Projekte) |
| Deutsches Voiceover | Director's Cut | `generate-voiceover` (ElevenLabs) | funktionsfähig (Code) | echter TTS-Aufruf, Speicherung, Dauer | Agent hat kein Werkzeug; Upload-Pfad für Kampagnen fehlt |
| Musik | Director's Cut | `generate-music-track` (Stable Audio, MiniMax, ElevenLabs Music, Lyria), Stock-Suche | funktionsfähig (Code) | Modellliste mit Preisen | Agent hat kein Werkzeug |
| Soundeffekte | Director's Cut | `director-cut-sound-design` | ungeklärt | nicht vollständig geprüft | Prüfen, ob echte Dateien entstehen |
| Lautstärke, Absenken unter Sprache | Director's Cut | Mischung im Render | teilweise | Absenkung fest auf 35 % | Empfehlungsfunktion ist nicht mit dem Render verbunden; einstellbarer Wert fehlt |
| Untertitel aus Voiceover | Director's Cut | `generate-subtitles` (ElevenLabs Scribe, Wort-Zeitmarken, Standard Deutsch) | funktionsfähig (Code) | echter Aufruf, Zeitmarken im Render | Agent hat kein Werkzeug |
| Texte, Logo, Produktname, Endcard | Director's Cut Overlays | Remotion-Overlays | funktionsfähig (Code) | Overlays werden serverseitig gerendert | Agent speichert nur Anforderungen; keine Endcard-Vorlage mit Original-Logo |
| Vorschau | Director's Cut Vorschau | eigener Vorschau-Renderer | funktionsfähig | live genutzt | mögliche Abweichung zwischen Vorschau und Export |
| Finaler Export 9:16, eine Datei | Director's Cut Export | Lambda-Render, Statusabfrage | funktionsfähig (Code) | 1080×1920 vorgesehen | Übergabe ins Kampagnen-Ergebnis und Download dort fehlen; Abschlusspfad nicht vollständig verfolgt |
| „Finaler Spot geprüft“ | Kampagnenbereich | `final_client_ready` | Platzhalter | Feld wird nirgends gesetzt | Abschlussprüfung des fertigen Spots fehlt |

Kurz: Die manuellen Werkzeuge existieren weitgehend. Es fehlt die Brücke von der Kampagne in den Schnitt sowie Agent-Werkzeuge, die diese Funktionen nutzen.

## Kosten (getrennt)

| Bereich | Interne Kosten | Nutzerpreis |
|---|---|---|
| Video-Clips | Anbieterpreis laut Preisliste | Preisliste mit Aufschlag (wie bisher) |
| Voiceover (ElevenLabs) | **unbekannt**, nicht im Code beziffert | derzeit keine Abbuchung |
| Musik | 0,30–0,55 USD pro Titel bzw. 0,023 USD/s | laut Funktion (genau zu bestätigen) |
| Untertitel (ElevenLabs STT) | **unbekannt** | derzeit keine Abbuchung |
| Finaler Render (AWS Lambda) | **unbekannt**, nicht gemessen | kostenlos seit v428 |

Vor dem ersten bezahlten Lauf: unbekannte Kosten messen und zeigen; Preisregeln nicht ändern ohne deine Entscheidung.

## Plan

### Stufe 1 – ein durchgehender Ablauf vom Kampagnen-Clip zum fertigen Spot

Anbieteraufrufe, die nur im Code vorhanden sind, heißen im Bericht „implementiert, noch nicht getestet“.

0. **Offene Pfade zuerst nachvollziehen (nur lesen):** Soundeffekte, Export bis zur herunterladbaren Datei (Render-Abschluss, Speicherort, Download-Link), deutsche Ausgabe pro Stimme und Übergabe der Untertitel in den Render. Lücken werden behoben, bevor die Kampagne angebunden wird.
1. **Versuch pro Shot auswählen:** Im Kampagnenbereich wird pro Shot ein vorhandener Versuch für den Schnitt gewählt. Alte Clips und Versuche bleiben erhalten.
2. **Schnittprojekt zur Kampagne:** genau ein Schnittprojekt pro Kampagnen-Video. Auswahl, Reihenfolge und Schnittpunkte werden dauerhaft gespeichert. Erneutes Öffnen lädt dasselbe Projekt und erzeugt keine Duplikate. Clips ersetzen, umsortieren oder kürzen nutzt vorhandene Dateien und generiert nie neu.
3. **Ton- und Textebene in Director's Cut:** Voiceover erzeugen oder hochladen, Musik, Soundeffekte, Lautstärken, einstellbare Musikabsenkung (Standard wie bisher 35 %), Untertitel aus dem tatsächlichen Voiceover, Original-Logo, Textoverlays und Endcard. Alles bleibt manuell bearbeitbar. Ohne Logo-Datei bleibt die Endcard blockiert, es gibt kein Ersatzlogo.
4. **Agent nutzt dieselben Funktionen:** Neue Werkzeuge rufen die bestehenden Funktionen auf und schreiben in dasselbe Schnittprojekt. Werkzeuge, die Anbieter aufrufen, sind im Lese- und Planungsmodus gesperrt und brauchen eine Freigabe. Das gilt auch ohne bisherige Wallet-Abbuchung, weil intern Kosten entstehen können.
5. **Kosten dokumentieren:** Interne Kosten und aktuelle Nutzerpreise werden pro Bestandteil getrennt dokumentiert. Unbekannte Werte stehen ausdrücklich als „unbekannt“ da. Preisregeln bleiben unverändert.
6. **Export im Kampagnenbereich:** Die fertige Datei wird dort abgespielt und kann heruntergeladen werden.
7. **Abschlussprüfung, zweigeteilt:**
   - *Technisch:* Dauer, 9:16, Auflösung, decodierbare Bild- und Tonspur, Pflichttexte vorhanden und zeitlich passend zu den Untertiteln und dem Voiceover.
   - *Inhaltlich:* Ist das Voiceover hörbar und korrekt? Das wird separat geprüft und ausgewiesen, denn eine vorhandene Tonspur allein beweist das nicht.
8. **Statusstufen:** Planung fertig → Einzelclips fertig → Schnitt fertig → Export fertig → finaler Spot geprüft. Jede Änderung an Schnitt, Ton oder Overlays markiert den vorherigen Export sichtbar als veraltet. Clips werden nie automatisch neu generiert.

**Tests:** nur mit gemockten Anbietern und vorhandenen geeigneten Testdateien. Keine bezahlten Video-, Audio-, Analyse- oder Render-Aufrufe, keine Freigaben, Reservierungen oder Buchungen. Die CORDIAL-Kampagne bleibt erhalten.

**Abschlussbericht:** Er zeigt getrennt, was durchgehend funktioniert, was nur mit Mocks geprüft wurde und welche echten Tests noch fehlen. Außerdem nennt er das konkrete Budget für den CORDIAL-Abnahmetest.

### Stufe 2 – Komfort und Qualität

- Ton-Fähigkeit der Modelle im Router berücksichtigen.
- Abweichungen zwischen Vorschau und Export messen.
- KI-Prüfung des fertigen Spots (Bild, Ton, Text).
- Kosten für Voiceover, Untertitel und Render messen und anzeigen.

### CORDIAL-Abnahme (später, mit deiner Freigabe)

6 Clips erzeugen → Schnitt 30 s, 9:16 → deutsches Voiceover → Musik und SFX → Untertitel → Logo und Endcard → Export → Abschlussprüfung → abspielen und herunterladen. Benötigt vorher: Logo-Datei mit geklärten Rechten und eine Budgetfreigabe.

## Grenzen

Ohne deine weitere Zustimmung finden keine Generierung, Produktion, Retries, Freigaben, Reservierungen oder Buchungen statt. Es wird keine zweite CORDIAL-Kampagne angelegt. Vorhandene Daten bleiben erhalten. Nicht geprüft wurden: Soundeffekte, der Abschlusspfad des Exports bis zum Download, die Durchsetzung der deutschen Sprache pro Stimme und alle Funktionen im echten Lauf.

## Technische Details

- Brücke: Kampagnen-Shots werden in das Szenenformat übertragen, das Director's Cut schon aus Motion-Studio-Projekten lädt (`?source=composer`). Dafür kommt ein neuer Einstieg `?source=campaign&video_id=` dazu.
- Agent-Werkzeuge in `_shared/muse/campaign/` rufen `generate-voiceover`, `generate-music-track`, `generate-subtitles` und `render-directors-cut` mit dem JWT des Nutzers auf. Kostenpflichtige Werkzeuge stehen nicht in den Planungs- oder Lese-Listen.
- `final_client_ready` wird nur gesetzt, nachdem der Render abgeschlossen und die Prüfung bestanden ist. Die Ergebnis-URL wird am Kampagnen-Video gespeichert.
