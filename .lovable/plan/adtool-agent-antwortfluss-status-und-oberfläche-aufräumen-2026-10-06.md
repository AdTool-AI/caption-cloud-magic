# AdTool Agent: Antwortfluss, Status und Oberfläche aufräumen

Keine bezahlte Erstellung, keine Wallet-Buchung, keine Ausweitung von Freigaben, keine automatischen Wiederholungen. Bestehende Daten bleiben erhalten. Umsetzung in drei Schritten, jeweils geprüft vor dem nächsten.

## Bereits bestätigt (aus dem Code)
- Der Chat rendert Freigabekarten als eigene Liste **unter allen Nachrichten**, nicht beim zugehörigen Turn — dadurch erscheinen alte Budgetkarten unter jeder neuen Frage.
- Kampagnen-Budgetkarten und Shot-Kosten haben das Euro-Zeichen fest eingebaut; die Wallet nutzt ihre gespeicherte Währung (USD).
- Aufgabenkarten zeigen bei Status "completed" immer "Video fertig und geprüft", unabhängig vom QA-Ergebnis.
- Große Videoplayer (220–240 px) stecken direkt in Aufgaben- und Tool-Karten; es gibt drei getrennte Scrollbereiche.

## Noch nicht bestätigt
- Warum die letzte S2-Frage keine sichtbare Antwort hat (nie erzeugt, nicht gespeichert oder nur nicht angezeigt). Schritt 1 klärt das anhand der Café-Buur-Datensätze und Funktionsprotokolle, bevor etwas geändert wird.

## Schritt 1 — Jede Anfrage bekommt eine sichtbare Antwort
- Letzte Nachricht durchverfolgen: Nachrichtentabelle, Operationen, Agent-Protokolle, Anzeige.
- Jeder Nutzer-Turn bekommt eine Turn-Kennung; Antworten, Tool-Ergebnisse und Freigaben werden ihr zugeordnet und direkt darunter angezeigt.
- Endet ein Turn ohne Antwort (Fehler, Abbruch, Zeitlimit), wird eine ehrliche Statusnachricht gespeichert ("Antwort unterbrochen") mit Button "Erneut fragen" — kein erfundener Text.
- Reine Lese-Fragen: Server erzeugt dabei keine Freigaben und startet nichts (Prüfung, dass in einem solchen Turn kein kostenpflichtiges Werkzeug lief).

## Schritt 2 — Währung, Status, Freigaben korrekt
- Währung überall aus dem gespeicherten Datensatz (Freigabe, Ledger, Wallet); keine Umrechnung, kein festes €-Zeichen.
- Shot-/Produktionsstatus aus echten Jobs ableiten: wartet auf Freigabe, in Warteschlange, wird erstellt, wird geprüft, fertig, braucht Änderungen, unterbrochen, fehlgeschlagen, unklar.
- "Visuell fertig" und "Fertige Anzeige" getrennt; QA fehlgeschlagen/nicht verfügbar nie als "geprüft". Planungsabdeckung als solche beschriftet.
- Kampagnenkopf: aktueller Zustand + nächste nötige Aktion (z. B. "Wartet auf Retry-Freigabe für V1·S2, Versuch 2").
- Freigaben: nur gültige, offene sind klickbar; abgelaufene, verbrauchte, ersetzte wandern in einen eingeklappten "Verlauf". Server lehnt Entscheidungen/Starts für solche Freigaben ab (bestehende Prüfung verifizieren, ggf. ergänzen). Einzelshot-Freigaben zeigen Shot und Versuch, Umfang, Währung, Schätzung und Maximum.

## Schritt 3 — Layout
- Chat: Nutzer-/Agent-Nachrichten, kurze Fortschrittszeilen, kompakte Ergebniszeile mit "Clip ansehen" (öffnet den Shot im Kampagnenbereich). Keine Inline-Player.
- Technische Aktivitätsliste in eingeklapptes "Aktivitätsdetails".
- Kampagnenbereich (bestehendes Panel, kein neues): Vorschaubilder; großer Player nur auf Klick; pro Shot Status, Versuch, Modell, Kosten, QA-Ergebnis, nächste Aktion; Original und Retry-Versuche getrennt sichtbar.
- Ein Hauptscrollbereich je Spalte, Eingabefeld immer erreichbar; Desktop und Mobil.

## Prüfung vor dem Abschlussbericht
- Lese-Frage zu S2 erzeugt sichtbare, passende Antwort; keine neuen Freigaben, Ledger-Zeilen oder Generierungen (Wallet 92.32 USD, 501 Videos, 10 Ledger-Zeilen bleiben).
- Alte Freigaben erscheinen nicht als neue Antwort; abgelaufene/verbrauchte können nichts starten.
- Neu laden erhält Nachrichten, Versuche und Status.
- Clips aus dem Kampagnenbereich erreichbar; Screenshots Desktop + Mobil.
- Bericht trennt umgesetzte Korrekturen, Ursachen und offene Punkte.

## Technische Details
- Dateien: `src/pages/AdToolAgent.tsx`, `src/components/agent/CampaignPanel.tsx`, `src/services/muse/{history,types,agentClient}.ts`, `supabase/functions/muse-agent/index.ts` (Turn-Kennung, Fallback-Nachricht, Lese-Turn-Schutz), ggf. kleine Migration: nullable `turn_id` auf `agent_messages`/`agent_operations`/Freigabetabellen, alte Zeilen per Zeitstempel dem vorherigen Nutzer-Turn zugeordnet.
- Reiner Status-Ableiter `deriveShotStatus()` + Tests; Tests für Turn-Zuordnung, Freigabe-Replay (abgelaufen/verbraucht → abgelehnt), Währungsanzeige.
- Nur geänderte Funktionen deployen; EN/DE/ES-Parität.
