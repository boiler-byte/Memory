# Memory v2

Memory mit Bildthemen, Designwechsel, Theme-Editor und lokal gespeichertem Tresor.

## Neu in v2: Tresor

- Im Dialog "Thema erstellen / bearbeiten" befindet sich rechts neben dem Themennamen ein Schloss. Offen bedeutet: normales Thema; geschlossen bedeutet: Thema im Tresor. Die Einstellung wird mit dem Custom-Thema gespeichert.
- Neben dem Merkphase-Schalter gibt es ein separates Schloss für den Tresor. Ohne eingerichtetes Passwort ist er zunächst offen.
- Beim ersten Schließen wird ein Passwort mit Bestätigungsfeld angefordert. Mindestlänge: 1 Zeichen. Beide Eingaben lassen sich über die Augen-Symbole ein- und ausblenden.
- Mit dem Schließen verschwinden Tresor-Themen aus der Themenauswahl und der Bildervorschau. Ihre älteren Ergebnisse werden ausgeblendet; auch deren Highscores werden nicht angezeigt. Die Daten werden nicht gelöscht.
- Zum Öffnen muss das Passwort eingegeben werden. Über "Passwort ändern" kann nach Eingabe des bisherigen Passworts ein neues festgelegt werden.
- Nach dem erstmaligen Einrichten des Passworts ist der Tresor nach dem Neustart der App aus Sicherheitsgründen immer geschlossen. Während der laufenden Sitzung kann er geöffnet bleiben, bis das Schloss wieder geschlossen wird.
- Die Tresor-Markierung wird beim ZIP-Export in `theme.json` mitgegeben und beim ZIP-Import berücksichtigt.

## Speicherung und Datenschutz

Custom-Themes und ihre Tresor-Markierung verbleiben wie bisher in `localStorage` / `IndexedDB` des Browsers. Gespeichert wird **kein Klartextpasswort**, sondern ein mit PBKDF2-SHA-256 und zufälligem Salt abgeleiteter Prüfwert.

**Wichtig:** Der Tresor ist ein Sichtschutz innerhalb der App, **keine Verschlüsselung der Bild- und Ergebnisdaten**. Personen mit Zugriff auf Browserdaten oder Entwicklertools können sie weiterhin auslesen. Bei Verlust des Passworts gibt es keine eingebaute Wiederherstellung.

## Ausführung / Kompatibilität

- `index.html` in einem aktuellen Browser öffnen; für die zuverlässige lokale Datenspeicherung und Installation als PWA vorzugsweise via HTTPS oder `localhost` bereitstellen.
- Bestehende Custom-Themes, Bilder, Ergebnisse und Highscores bleiben erhalten. Bisherige Themen sind standardmäßig nicht im Tresor.
- Die PWA-Cacheversion wurde auf `v2.0.0` erhöht.
- **Ausgangsdateien:** Das ursprüngliche ZIP enthielt keine Verzeichnisse `img/`, `icons/` oder `fonts/` auf Projektebene, obwohl die bestehende App darauf verweist. Die referenzierten Standardmotiv-Bilder und einige Darstellungsressourcen müssen separat ergänzt werden; vorhandene Dateien wurden nicht ersetzt oder nachgebildet. Die ursprünglich mitgelieferte `css/fonts/`-Symbolschrift wird nicht erneut ausgeliefert: Das Verzeichnis aus der ursprünglichen Installation bitte beibehalten.
