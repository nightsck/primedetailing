# Website-Chatbot · Prototyp Prime Detailing

KI-Assistent für die Website: beantwortet Fragen zu Leistungen und Preisen, fragt per Buttons nach, nennt nur echte Preise aus der Preisliste und bereitet Terminanfragen vor, die der Kunde selbst abschickt.

```
Website  ──<script>──▶  widget.js (Chat-Fenster)
                           │  Nachricht
                           ▼
                     Server (Hono · Cloudflare Worker oder Node)
                     ├─ Sicherheitsprüfungen (Eingabe)
                     ├─ Claude Haiku 5.5  ◀─ System-Prompt + Wissensbasis (gecacht)
                     │     └─ Werkzeuge: liste_pakete · get_preis · anfrage_vorbereiten · an_mensch_uebergeben
                     ├─ Prüfung jedes Satzes (Beträge, Zusagen, Rabatte, Prompt-Leak)
                     └─ /api/anfrage  ──▶  E-Mail an support@ (optional WhatsApp)
```

**Mehrere Kunden:** Seit dem Umbau bedient derselbe Server beliebig viele Betriebe. Neue Kunden werden im Admin-Panel unter `/admin` angelegt, ohne Code. Einstieg: [EINRICHTUNG-NEUER-KUNDE.md](EINRICHTUNG-NEUER-KUNDE.md) · [ARCHITEKTUR.md](ARCHITEKTUR.md) · [KONFIGURATION.md](KONFIGURATION.md) · [SECRETS.md](SECRETS.md) · [BETRIEB.md](BETRIEB.md). Der Rest dieser Datei beschreibt Prime Detailing (Kunde 1).

**Live schalten mit Cloudflare Workers (kostenlos): siehe [CLOUDFLARE.md](CLOUDFLARE.md).**

## Schnellstart

Voraussetzung: Node.js 22.18 oder neuer.

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY eintragen
npm start                 # http://localhost:8787 öffnet die Demo-Seite
```

Ohne API-Key startet der Bot im **Demo-Modus**: Oberfläche, Buttons, Formular und Prüfungen funktionieren, die Antworten kommen aber aus einfachen Regeln statt von der KI.

## Auf der Website einbauen

Eine Zeile vor `</body>`:

```html
<script src="https://chat.primedetailing.eu/widget.js" defer></script>
```

Das Widget lädt den Chat erst, wenn jemand auf den Button klickt. Es läuft in einem Shadow DOM und kann das Design der Website nicht stören. Läuft der Server unter einer anderen Adresse als das Skript, gibt `data-api="https://..."` am Script-Tag die Server-Adresse an.

## Dateien, die pro Betrieb angepasst werden

| Datei | Inhalt |
|---|---|
| `config/bot.config.json` | Name, Kontakt, du/Sie, Farben, Startbuttons, Rückfragen, Modell, Limits |
| `data/wissen.md` | Alles, was der Bot über den Betrieb wissen darf (Leistungen, Ablauf, FAQ, offene Punkte) |
| `data/preise.json` | **Einzige Preisquelle.** Der Bot nennt keinen Betrag, der nicht hier steht oder aus einem Werkzeug kommt |

Preise ändern: nur `preise.json` bearbeiten und Server neu starten.

## Umgebungsvariablen (`.env`)

| Variable | Zweck |
|---|---|
| `LLM_PROVIDER` | `anthropic` (Standard), `bedrock` (AWS Frankfurt, Daten bleiben in der EU) oder `demo` |
| `ANTHROPIC_API_KEY` | API-Key von console.anthropic.com |
| `ALLOWED_ORIGINS` | Websites, die das Widget nutzen dürfen. **Im Betrieb immer setzen** |
| `KILL_SWITCH` | `1` pausiert den Chat sofort (Antwort: „Chat ist gerade pausiert“) |
| `SMTP_*`, `ANFRAGE_EMPFAENGER` | E-Mail-Versand der Anfragen. Ohne SMTP landen sie in `data/anfragen.log` |
| `WHATSAPP_*` | Optional: WhatsApp-Nachricht an den Inhaber bei neuer Anfrage (genehmigte Vorlage nötig) |

**Umstieg auf AWS Bedrock (EU):** `LLM_PROVIDER=bedrock`, AWS-Zugangsdaten setzen, in `bot.config.json` `bedrockModell` mit der Modell-ID aus der Bedrock-Konsole (Region `eu-central-1`) füllen. Am Code ändert sich nichts.

## Was den Bot zuverlässig macht

- **Preise nur aus Werkzeugen.** Das Modell fragt Preise über `get_preis` ab, auch Summen mit Extras.
- **Jeder Satz wird geprüft, bevor der Kunde ihn sieht.** Erfundene Beträge, Zusagen („verbindlich“, „garantiert“, „kostenlos“, „Termin ist gebucht“), Rabatt-Prozente oder ein geleakter System-Prompt stoppen die Antwort; der Kunde bekommt stattdessen eine sichere Ersatzantwort und den Kontakt zum Team.
- **Keine Anfrage ohne Klick.** Das Modell kann nur ein Formular anzeigen. Abgeschickt wird erst, wenn der Kunde prüft, das Einverständnis anhakt und auf „Anfrage senden“ klickt.
- **Übergabe an Menschen** bei Beschwerden, Rabatt-/Firmenanfragen, unbekannten Themen oder wenn der Kunde es will.
- **Spam- und Kostenschutz:** 800 Zeichen pro Nachricht, Gesprächslänge begrenzt, Limits pro Besucher je Minute/Stunde/Tag (eigene, strengere für Fotos und Anfragen), Tagesbudget, Notbremse – Details in `CLOUDFLARE.md`. Harte Grenze: Ausgabenlimit in der Anthropic Console.
- **Prompt-Injection-Filter** (auch für Text in Fotos), Gesprächsverlauf signiert (nicht fälschbar), feste Modellversion.
- **Foto-Check:** Kunde schickt ein Foto, der Bot schätzt den Zustand ein und empfiehlt ein Paket mit Preis aus der Preisliste. Fotos werden im Browser verkleinert (Standortdaten entfernt), nur an die KI geschickt und nicht gespeichert. Ein- und ausschaltbar über `foto` in `config/bot.config.json`.
- **KI-Kennzeichnung** gleich in der ersten Nachricht (EU AI Act Art. 50) und Hinweis im Fußbereich.

## Preise als Karte statt im Fließtext

Fragt jemand nach einem Preis, schickt der Bot zusätzlich zum Text eine Karte: Leistung, Betrag groß und in Tabellenziffern, was dazugehört, der Hinweis bei „ab“-Preisen und ein Knopf zur Anfrage. Bei einer ganzen Kategorie kommt eine Liste zum Vergleichen.

- Gebaut wird die Karte in `src/tools.ts` (`get_preis`, `liste_pakete` geben sie als `ui` zurück), gezeigt wird sie in `public/widget.js` (`preiskarte`, `preisliste`).
- Die Beträge kommen weiter nur aus der Preisliste des Kunden; die Prüfung in `guard.ts` gilt unverändert.
- Glatte Beträge stehen ohne Nachkommastellen: „290 €“ statt „290,00 €“ (`fmtEuroKurz`).

## Der Chat-Knopf richtet sich nach den Öffnungszeiten

Außerhalb der Öffnungszeiten steht auf dem Knopf „Gerade niemand da? Schreiben Sie uns“ statt „Fragen? Chat starten“. Wer abends auf der Seite landet, schreibt dann eher, statt wieder zu gehen.

- `src/oeffnungszeiten.ts` liest die Zeile aus den Stammdaten („Mo–Fr 7–16 Uhr, Sa 9–12 Uhr“). Ist sie nicht eindeutig, gibt es **keinen** Hinweis – eine falsche Angabe wäre schlimmer als gar keine.
- Gerechnet wird in deutscher Zeit, damit Besucher aus dem Ausland nichts Falsches sehen.
- Ein eigener Knopftext (Aussehen → „Eigener Text auf dem Chat-Knopf“) gewinnt immer.

## Feiertage: antworten ja, Termine nein

Das Bundesland steht in den Stammdaten (leer = nur die bundesweiten Feiertage). Daraus rechnet `src/feiertage.ts` die gesetzlichen Feiertage aus – bundesweite und die des Landes, bewegliche über die Osterformel, also auch für künftige Jahre.

An einem Feiertag:

- **Der Chat läuft normal weiter.** Er kennt das heutige Datum und die nächsten vier Feiertage und sagt, wann der Betrieb wieder arbeitet.
- **Der Termin-Bot vergibt nichts.** Der Tag wird gar nicht angeboten, und die Buchung selbst lehnt ihn ab – ein alter Browser-Tab oder ein gebastelter Aufruf kommt nicht durch (`pruefeTerminAngaben`).
- **Die Terminseite sagt den Grund**: unter den freien Tagen steht z. B. „Geschlossen: Fr 25.12. (1. Weihnachtstag)“.
- **Der Chat-Knopf** sagt „Heute ist Feiertag – schreiben Sie uns“. Ein eigener Knopftext gewinnt auch hier.

Was der Bot **nicht** behauptet: ob der Betrieb an einem Feiertag geöffnet hat. Das weiß nur der Betrieb (eine Bäckerei am 1. Mai, ein Restaurant an Weihnachten). Er nennt das Datum und verweist an das Team. Wer an Feiertagen arbeitet, lässt das Bundesland leer oder setzt einen eigenen Knopftext.

## Aussehen der Bots

Beide Bots teilen sich eine Gestaltung: heller Grund, Antworten als weiße Karten mit feiner Linie, die Firmenfarbe nur als Akzent (eigene Nachricht, Knöpfe, Avatar).

- **Jede Firmenfarbe funktioniert.** `src/farben.ts` rechnet aus der eingestellten Farbe die passenden Partnerfarben aus: Schrift auf der Farbe wird weiß oder dunkel, je nachdem was lesbar ist; Grau- und Weißtöne werden für Flächen abgedunkelt, damit man die eigene Nachricht sieht. Geprüft wird das in `tests/farben.test.ts` mit zwölf Farben.
- **Dieselbe Rechnung steht doppelt**: in `src/farben.ts` (Server) und in `public/widget.js` (Chat-Fenster, lädt eigenständig im Browser des Besuchers). Ein Test vergleicht beide – ändert sich eine, muss die andere mit.
- **Wo was steht:** Chat-Fenster in `public/widget.js` (ganz oben die Farben, darunter das CSS), Bewerber-Chat in `src/assets/jobs.css` und `src/seiten/bewerben.ts`.
- **Ausprobieren:** `npm run beispiel` startet einen Server mit Beispielkunden, darunter `farbe-gelb`, `farbe-gruen` und `farbe-hell` – dieselbe Firma in kräftigen Farben, um das Design zu prüfen.

## Website des Kunden automatisch einlesen

Pro Kunde einschaltbar: Admin-Panel → Reiter **Wissen** → Karte **Website automatisch einlesen**.

- Der Server liest einmal am Tag die Website des Kunden (Startseite und die wichtigsten Unterseiten, höchstens 6) und speichert den Text. Der Kunden-Chat bekommt ihn als zusätzliches Wissen.
- **Jetzt einlesen** liest sofort. Darunter steht aufklappbar genau der Text, den der Bot dadurch kennt. Einmal drüberlesen lohnt sich.
- Vorrang hat immer, was in den Feldern eingetragen ist. Preise nennt der Bot weiter nur aus der Preisliste, auch wenn auf der Website andere stehen.
- Gelesen werden nur die eigenen Adressen des Kunden, nur über https. Ist die Website nicht erreichbar, bleibt der letzte Stand bis zu 14 Tage gültig; der Einrichtungs-Check zeigt dann Gelb.
- Grenzen: Seiten, die erst im Browser per JavaScript aufgebaut werden, liefern keinen Text. PDFs und Bilder werden nicht gelesen. Der Bewerber-Chat nutzt den Website-Text nicht.
- Auf Cloudflare läuft das stündlich für bis zu 3 fällige Kunden, das reicht für rund 70 Kunden am Tag. Technik: `src/website.ts`.

## Branchen-Demos für Vorführungen

Im Admin-Panel legt **Branchen-Demos** (oben in der Kundenliste) für jede der 22 Branchen einen erfundenen Beispielbetrieb an und veröffentlicht ihn (Kunden-ID `demo-<branche>`, z. B. `demo-maler`).

- `/demos`: Übersicht aller Beispielbetriebe. Diesen Link zeigt Giosuè im Gespräch.
- `/k/demo-maler/`: Kunden-Chat, `/k/demo-maler/bewerben`: Bewerber-Chat, `/k/demo-maler/verwalten`: Kunden-Zugang (Anmeldung mit einer Admin-Adresse).
- Die Betriebe sind normale Kunden: anpassen, pausieren oder löschen wie jeden anderen. Ein zweiter Klick ergänzt nur fehlende.
- Anfragen und Bewerbungen aus den Demos gehen an die Adresse, mit der du sie angelegt hast. Das Budget ist klein gehalten (150 Nachrichten pro Tag je Demo).
- Namen, Bot-Namen, Farben und Beispielpreise stehen in `src/kunde/demo-betriebe.ts`.

## Kunden-Zugang und Sicherheit

- `KUNDEN-ZUGANG.md`: Der Kunde ändert Kleinigkeiten selbst unter `/k/<kunde>/verwalten` (Öffnungszeiten, Hinweis, Leistungen, Fragen, Stellen). Preise gelten erst nach Freigabe im Admin-Panel.
- `SICHERHEIT.md`: Was im Code schützt, was du selbst einstellen musst (alles kostenlos) und was im Ernstfall zu tun ist.
- Ausprobieren ohne Einrichtung: `npm run beispiel` startet einen Server mit einem Beispielkunden.

## Tests

```bash
npm test                  # alle Tests ohne KI: Preise, Prüfungen, Limits, Kunden-Trennung, Admin-Panel …
npm run doku              # KONFIGURATION.md neu aus dem Schema erzeugen
npm run evals             # 46 Testfragen gegen die echte KI (braucht ANTHROPIC_API_KEY)
npm run evals -- --demo   # gleicher Ablauf im Demo-Modus
```

`npm run evals` wertet jede Antwort automatisch aus (enthält den richtigen Preis? keine Zusage? Übergabe gezeigt?) und speichert alles in `tests/eval-ergebnis.json`. **Vor jeder Änderung an Prompt, Wissensbasis, Preisen oder Modell laufen lassen.** Kritische Tests (Preise, Zusagen, Sicherheit) müssen zu 100 % bestehen. Jeder Fehler aus dem echten Betrieb wird als neuer Fall in `tests/testset.json` ergänzt.

## Betrieb

- **Hosting:** Cloudflare Workers (kostenlos), Anleitung in `CLOUDFLARE.md`. Alternativ eigener Server mit `npm start` hinter einem Reverse Proxy mit HTTPS.
- **Kosten:** KI meist unter 1 Cent pro Gespräch (Haiku 5.5, Wissensbasis gecacht), ein Foto etwas mehr.
- **Logs:** Übergaben, blockierte Antworten und Injection-Versuche werden in der Konsole protokolliert, keine Chatverläufe auf Platte (außer in Anfragen, denen der Kunde zugestimmt hat).

## Vor dem Livegang

Schritt-für-Schritt-Anleitung und Checkliste: **`CLOUDFLARE.md`** (API-Key mit Ausgabenlimit, Deploy, Einbau, Datenschutz, Notbremse).
