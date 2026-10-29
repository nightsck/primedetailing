# Design: Vorführseite /demo (Auftragsfänger)

Gilt nur für `src/demo.njk`, `src/assets/demo.css`, `src/assets/demo.js`.
Die Website von Prime Detailing hat ihr eigenes Design in `src/assets/style.css`.

## Idee

Zwei Ebenen, die man nie verwechselt:

1. **Die Vorführung (Rahmen):** nüchtern wie ein Werkzeug. Papierweiß, schwarze Schrift,
   feine Linien statt Karten, ein einziges Signal-Gelb (Warnweste, Textmarker).
   Sie erklärt kurz und tritt dann zurück.
2. **Der Beispielbetrieb (Muster Fahrzeugpflege):** sieht aus wie eine echte kleine
   Firmen-Website im Browserfenster, mit eigener Markenfarbe. Der Chat sitzt als Knopf
   unten rechts und öffnet sich über der Seite, so wie er beim Kunden später aussieht.
   Er übernimmt die Farbe des Betriebs, nicht die der Vorführung.

Bewusst vermieden: abgerundete Einheitskarten, Großbuchstaben-Zeilen über Überschriften,
Pillen für alles, Kachel-Dashboards, Verläufe, Emojis, doppelte KI-Hinweise.

## Farbe

| Token | Hell | Dunkel | Rolle |
|---|---|---|---|
| `--paper` | #F4F2EE | #151617 | Seitenhintergrund des Rahmens |
| `--sheet` | #FFFFFF | #1E2022 | Flächen im Rahmen (Detailansicht, Dialog) |
| `--ink` | #1B1D1F | #ECEAE6 | Text, Primärknopf (Hintergrund) |
| `--ink-2` | #4A4E52 | #B9B6B0 | Fließtext zweitrangig |
| `--muted` | #6B6F73 | #8E9196 | Hinweise, Zeitstempel |
| `--line` | #D9D5CE | #33363A | Linien, Trenner, Eingabefelder |
| `--signal` | #F2C200 | #F2C200 | Markierung: aktive Ansicht, wichtigste Zahl, Fokus. Text darauf immer `--ink` hell (#1B1D1F) |
| `--ok` | #2E6B45 | #7CC79A | Status „Bestätigt“ |
| `--wait` | #8A5A00 | #E6B85C | Status „Angebot raus“ |
| `--bad` | #A8322A | #F08A80 | Fehler, Löschen |

Beispielbetrieb (immer hell, auch im Dunkelmodus, weil es „seine“ Website ist):

| Token | Wert | Rolle |
|---|---|---|
| `--mf-brand` | #0F4C5C | Markenfarbe: Kopf, Knöpfe, Chat-Kopf, Kunden-Nachrichten |
| `--mf-brand-2` | #E7F0F1 | helle Fläche, Bot-Nachrichten |
| `--mf-ink` | #16222A | Text |
| `--mf-muted` | #5A6A73 | Nebentext |
| `--mf-line` | #D6DEE1 | Linien |

## Schrift

- **Archivo** (lokal, schmal geschnitten `font-stretch: 80%`, 700) für Überschriften und große Zahlen.
- **Inter Tight** (lokal) für alles andere.
- Größen: 13 / 15 / 16 (Fließtext) / 18 / 22 / 28 / 40. Zeilenhöhe 1.5 Fließtext, 1.1 Überschriften.
- Zahlen in Tabellen und Beträgen: `tabular-nums`.

## Abstände und Form

- Raster 4 px: 4, 8, 12, 16, 24, 32, 48.
- Inhaltsbreite 1200 px, Seitenrand mindestens 16 px.
- Radius: Rahmen 4 px; Beispielbetrieb 8 px; Chatfenster 14 px.
- Schatten nur für Dinge, die über der Seite schweben: Chatfenster, Dialog, Chat-Knopf.

## Bausteine

- **Knöpfe:** Primär = `--ink`-Fläche, weiße Schrift. Sekundär = Linie `--line`, transparent.
  Leise = nur Text, unterstrichen beim Hover. Fokus: 3 px `--signal`-Ring.
- **Ansichten-Wechsel:** Textreiter mit Nummer, aktiver Reiter mit gelbem Unterstrich (4 px).
- **Listen statt Karten:** Anfragen als Zeilen mit Trennlinie, Status als kleines Wort mit Punkt.
- **Kennzahlen:** eine Zeile Fließtext mit Zahlen („3 Anfragen · 2 nach Feierabend …“), der Euro-Wert gelb unterlegt wie mit Textmarker.
- **Chat (im Beispielbetrieb):** Knopf unten rechts, Fenster 380 × 600 px, am Handy Vollbild.
  Ein KI-Hinweis im Chat, sonst keiner.

## Bilder und Symbole

Keine Stockfotos, keine Illustrationen. Symbole nur als einfache Linien-SVG (1.8 px), wo sie eine
Funktion haben (Kamera, Senden, Telefon).
