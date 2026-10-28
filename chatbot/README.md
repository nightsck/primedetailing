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

## Tests

```bash
npm test                  # 33 Tests ohne KI: Preise, Prüfungen, Filter, Werkzeuge, Spam-Limits, Foto-Check, Gesprächslogik
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
