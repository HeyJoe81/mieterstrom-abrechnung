# Mieterstrom-Abrechnung

Web-App für die Abrechnung von Mieterstrom in Wohnungseigentümergemeinschaften (Messkonzept 13).
Läuft vollständig im Browser, ohne Server und ohne Installation.

**Online:** https://heyjoe81.github.io/mieterstrom-abrechnung/ (nach Aktivierung von GitHub Pages)
**Ausprobieren ohne eigene Daten:** https://heyjoe81.github.io/mieterstrom-abrechnung/?beispiel

## Was die App kann

- **Mehrere Objekte:** je Objekt eine eigene Datendatei (`Name.mieterstrom.json`).
- **Historie:** Zählerstände mit Datum und Quelle, Verbrauch zwischen zwei Ablesungen, Schätzung durch Interpolation, wenn ein Stichtag fehlt.
- **Tarife mit Gültigkeitszeitraum:** Mieterstromtarif, Verrechnungspreis an die WEG (Heizung, Allgemeinstrom) und Lieferantenverträge. Ein Preis- oder Lieferantenwechsel mitten im Abrechnungszeitraum wird automatisch in Abschnitte geteilt.
- **Frei wählbarer Abrechnungszeitraum** je Objekt.
- **Berechnungen**
  - Mieterstrom je Kunde: Arbeitspreis × Verbrauch + Grundpreis anteilig nach Tagen, abzüglich Abschläge.
  - Heizung und Allgemeinstrom: Arbeitspreis je Zähler, Grundpreis je Zeitraum einmal und nach Verbrauch aufgeteilt.
  - Simulation der Lieferantenrechnung nach Messkonzept 13: Bezug am Übergabezähler minus Verbrauch der Nicht-Teilnehmer, Grundpreis, Arbeitspreis, Stromsteuer, § 14a EnWG, Umsatzsteuer.
  - Prüfung der 90-%-Grenze gegenüber der Grundversorgung.
- **Dokumente:** Mieterstrom-Abrechnungen, Abrechnung Heizung / Allgemeinstrom und Proforma-Lieferantenrechnung. Im Druckdialog „Als PDF sichern“ wählen.

## Datenschutz

Personenbezogene Daten liegen **nicht** in diesem Repository und werden nicht übertragen.
Die App liest und schreibt nur die Datei, die Sie auf Ihrem Rechner auswählen (z. B. im OneDrive).
`*.mieterstrom.json` ist über `.gitignore` gesperrt.

In Chrome und Edge speichert „Speichern“ direkt in die geöffnete Datei. In Safari und Firefox wird beim Speichern eine neue Datei heruntergeladen.

## Rechenregeln

- Eine Ablesung mit Datum D ist der Stand am **Ende** von Tag D. Der Anfangsstand eines Zeitraums ist die Ablesung vom Vortag (z. B. 30.06.), ersatzweise eine Ablesung am Starttag (Einbau).
- Lieferanten zählen Tage inklusiv. Für Mieterstrom und WEG ist die Zählweise je Objekt einstellbar („Ende minus Beginn“ wie bisher in der Excel, oder inklusiv).
- Gerundet wird je Position auf Cent.

## Entwicklung

Keine Abhängigkeiten, kein Build. Lokal starten:

```
python3 -m http.server 8000   # dann http://localhost:8000
```

Tests des Rechenkerns (Node 18 oder neuer):

```
npm test
```

Die Tests prüfen den Rechenkern mit anonymisierten Daten gegen von Hand nachgerechnete Ergebnisse.

| Datei | Inhalt |
|---|---|
| `js/calc.js` | Rechenkern (ohne Oberfläche, testbar) |
| `js/app.js` | Oberfläche, Laden und Speichern |
| `js/docs.js` | Abrechnungsdokumente |
| `js/beispiel.js` | erfundenes Beispielobjekt |
| `test/calc.test.mjs` | Tests |
