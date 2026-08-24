# Anonyme Gruppenstatistik einrichten

Die Statistik besteht aus zwei Teilen:

- Die sichtbare Webseite bleibt auf GitHub Pages.
- Ein kleiner Cloudflare-Dienst speichert nur Gruppencodes und zusammengefasste Übungsergebnisse.

Für die Lehrkraft ist nach der einmaligen Einrichtung keine technische Arbeit nötig. Sie öffnet nur **Lehrerbereich**, legt eine Gruppe an und zeigt der Klasse den sechsstelligen Code.

## Technischer Status

Der Statistikdienst und die EU-gebundene Datenbank sind eingerichtet. Die Webseite verwendet automatisch diese Adresse:

`https://matheklar-statistik-api.pages.dev`

Nach dem Hochladen auf den GitHub-Hauptzweig wird die verbundene Webseite automatisch neu veröffentlicht. Eine zusätzliche Einstellung in GitHub ist nicht erforderlich.

## Alltag für die Lehrkraft

1. Auf der Startseite **Lehrerbereich öffnen** auswählen.
2. Beim ersten Mal den Lehrer-Code eingeben. Die Anmeldung bleibt auf diesem Gerät 90 Tage erhalten.
3. Einen Namen wie `10a · Montag` eingeben und **Anlegen** wählen.
4. Den angezeigten sechsstelligen Code an die Tafel schreiben.
5. Die Schülerinnen und Schüler geben den Code auf der Startseite ein und starten ihre Übung.
6. Im Lehrerbereich auf **Aktualisieren** drücken, um die neuen Ergebnisse zu sehen.
7. Nach der Stunde **Gruppe schließen** wählen. Eine geschlossene Gruppe kann später wieder geöffnet werden; der Code bleibt gleich.

## Welche Daten gespeichert werden

- Gruppenname und zufälliger sechsstelliger Code
- Zeitpunkt und Bearbeitungsdauer einer abgeschlossenen Runde
- je Aufgabe nur Aufgabenschlüssel, Themenbereich und `richtig` oder `falsch`

Nicht gespeichert werden Namen, E-Mail-Adressen, Schülerkonten, eingegebene Antworten oder eine geräteübergreifende Schülerkennung. Jede Übungsrunde hat lediglich eine zufällige Kennung, damit eine schlechte Verbindung nicht zu Doppeleinträgen führt. Übungsrunden werden nach 365 Tagen automatisch gelöscht.

## Technische Wiederherstellung

Aus dem Ordner `stats-worker`:

```powershell
wrangler login
wrangler d1 create matheklar-statistik --jurisdiction=eu
wrangler d1 migrations apply matheklar-statistik --remote
wrangler secret put TEACHER_CODE_HASH
wrangler secret put SESSION_SIGNING_SECRET
wrangler deploy
```

Die vorhandene `database_id` in `stats-worker/wrangler.jsonc` gehört zur eingerichteten EU-Datenbank. Für `TEACHER_CODE_HASH` wird nur der SHA-256-Wert des Lehrer-Codes gespeichert, nicht der Klartext.
