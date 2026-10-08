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

### Stufe 1 – ein durchgehender, funktionierender Ablauf

1. **Kampagne → Schnitt:** Kampagnen-Video als Schnittprojekt öffnen. Pro Shot wird der gewählte Versuch mit Schnittdauer übernommen. Vorhandene Clips werden wiederverwendet, nichts neu generiert.
2. **Versuch auswählen:** im Kampagnenbereich pro Shot festlegen, welcher Clip in den Schnitt kommt. Alte Versuche bleiben erhalten.
3. **Agent-Werkzeuge** (je mit Kostenanzeige, bei Kosten mit Freigabe): Schnitt anlegen, Voiceover erzeugen oder Upload nutzen, Musik wählen/erzeugen, Untertitel aus dem tatsächlichen Voiceover, Overlays/Logo/Endcard setzen, Export starten. Sie rufen nur die bestehenden Funktionen auf.
4. **Endcard und Logo:** einfache Endcard-Vorlage mit hochgeladenem Original-Logo. Ohne Logo-Datei mit Rechten bleibt die Endcard blockiert, kein Ersatzlogo.
5. **Musikabsenkung:** einstellbarer Wert statt fest 35 %, Standard unverändert.
6. **Status-Stufen:** Planung fertig → Einzelclips fertig → Schnitt fertig → finaler Spot geprüft. „Fertig“ erst, wenn Voiceover, Musik, Untertitel, Pflichttexte und Export vorhanden sind und die Abschlussprüfung bestanden ist (Dauer genau 30 s, 9:16, Tonspur vorhanden).
7. **Ergebnis:** fertige Datei im Kampagnenbereich abspielbar und herunterladbar.

### Stufe 2 – Komfort und Qualität

- Ton-Fähigkeit der Modelle im Router berücksichtigen.
- Soundeffekte prüfen und ggf. nachrüsten.
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
