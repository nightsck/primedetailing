# Schlüssel und Einstellungen am Server

Schlüssel stehen **nie** im Repo, in der Kunden-Konfiguration oder in Mails. Pro Kunde gibt es keine eigenen Schlüssel.

**Wo eintragen?**
- **Cloudflare:** dash.cloudflare.com → Workers & Pages → `primedetailing-chat` → Settings → Variables and secrets → Add → Deploy. Schlüssel als Typ **Secret**, alles andere als **Text**.
- **Hetzner:** in der Datei `chatbot/hetzner/.env` auf dem Server (Vorlage: `.env.beispiel`), danach `docker compose -f chatbot/hetzner/docker-compose.yml up -d`.

## Für die Kunden-Bots nötig

| Name | Art | Woher | Wofür |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Secret | console.anthropic.com → API Keys. Dort unter Limits ein Ausgabenlimit setzen. | KI für alle Bots. Ohne ihn antworten die Bots nur mit festen Texten. |
| `SESSION_SECRET` | Secret | Selbst erzeugen: lange Zufallszeichenkette (`openssl rand -hex 32`). | Signiert Gesprächsverlauf und Admin-Anmeldung. Einmal setzen, nicht mehr ändern. |
| `ADMIN_LOGIN` | Text | Eure Mail-Adressen, kommagetrennt. | Wer ins Admin-Panel darf. Fehlt es, gilt `CRM_LOGIN`. |
| `BREVO_API_KEY` | Secret | brevo.com → SMTP & API → API-Schlüssel. Vorher die Absender-Domain bestätigen (SPF, DKIM, DMARC), sonst landen Mails im Spam. | Mails an Betriebe und der Anmelde-Code. |
| `MAIL_ABSENDER` | Text | Adresse auf der bei Brevo bestätigten Domain, z. B. `assistent@ki-für-meinen-betrieb.de` (in Punycode-Schreibweise der Domain). | Absender aller Mails. |

## Optional

| Name | Wofür |
|---|---|
| `KILL_SWITCH` | `1` pausiert sofort alle Bots auf diesem Server. |
| `MAIL_TAGESLIMIT` | Höchstzahl Mails pro Kunde und Tag (Standard 100). |
| `LLM_PROVIDER` | `anthropic` (Standard) oder `bedrock` für AWS Frankfurt. Bei `bedrock` zusätzlich AWS-Zugangsdaten und `bedrockModell` in `config/bot.config.json`. |
| `ALLOWED_ORIGINS` | Erlaubte Websites nur für die **alten** Adressen von Prime Detailing. Neue Kunden: Website in den Stammdaten. |
| `DATEN_PFAD` | Nur Hetzner: Ort der Datenbank-Datei (Standard im Container `/daten/kunden.sqlite`). |
| `GOOGLE_SA_JSON`, `TERMIN_*` | Termin-Bot der Vorführung, siehe CLOUDFLARE.md. Für Kunden kommt der Termin-Bot später. |
| `SIPGATE_*`, `ANRUF_*`, `STIMME_*`, `CRM_*`, `VERTRIEB_*`, `WEB3FORMS_KEY` | Anruf-Retter, Telefon-Bot, CRM, Formular von Prime Detailing: unverändert, siehe CLOUDFLARE.md und CRM.md. |

## Prüfen, ob alles sitzt

Im Admin-Panel steht oben in der Kundenliste ein gelber Kasten, solange am Server etwas fehlt. Bei jedem Kunden zeigt der Einrichtungs-Check dieselben Punkte in Rot.

Ohne eingerichteten Mailversand steht der Anmelde-Code im Server-Log: Cloudflare → Worker → Logs, auf Hetzner `docker compose -f chatbot/hetzner/docker-compose.yml logs bots`.
