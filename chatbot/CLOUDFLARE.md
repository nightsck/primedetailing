# Live schalten mit Cloudflare Workers

Dauer: ca. 20 Minuten. Kosten: Cloudflare kostenlos (Free-Plan, 100.000 Anfragen/Tag), KI ca. 0,3 Cent pro Gespräch.

## So ist es eingerichtet
- Der Bot liegt im Website-Repo im Ordner `chatbot/` und läuft als Cloudflare Worker **`primedetailing-chat`**: https://primedetailing-chat.tom-schindler999.workers.dev
- Cloudflare ist mit GitHub verbunden: **Jeder Push auf `main` baut und deployt den Bot automatisch** (Stammverzeichnis `chatbot`, Deploy-Befehl `npm run deploy`).
- **Preise kommen aus dem CMS:** Beim Bauen liest der Bot `src/_data/preise.yml` und `rechner.yml`. Preis im CMS ändern → Website und Bot sind nach 1–2 Minuten aktuell.
- Auf der Website eingebunden über `chatbot_url` in `src/_data/site.yml` (im CMS unter „Kontakt & Allgemein“). Feld leeren = Chat verschwindet von der Website.

## Kunden-Bots und Admin-Panel
Unter `/admin` liegt das Admin-Panel für alle weiteren Kunden (neue Kunden anlegen, einstellen, testen, veröffentlichen). Anleitung: [EINRICHTUNG-NEUER-KUNDE.md](EINRICHTUNG-NEUER-KUNDE.md), Aufbau: [ARCHITEKTUR.md](ARCHITEKTUR.md), Schlüssel: [SECRETS.md](SECRETS.md).
- Die Datenbank dafür (Durable Object `KundenDaten`) legt Cloudflare beim nächsten Deploy selbst an. Zu tun ist nichts.
- Einmalig in Cloudflare setzen: `ADMIN_LOGIN` (Text, eure Mail-Adressen kommagetrennt; ohne gilt `CRM_LOGIN`), `SESSION_SECRET` (Secret), dazu `BREVO_API_KEY` und `MAIL_ABSENDER` für die Mails an Betriebe und den Anmelde-Code.
- Prime Detailing läuft unverändert über die alten Adressen und wird weiter über CMS und `config/bot.config.json` gepflegt.
- Limits und Tagesbudget zählen jetzt je Kunde. Die Vorführseiten (`/api/demo/…`) haben ein eigenes Budget und bremsen Prime Detailing nicht mehr aus.

## 1. Anthropic API-Key (einmalig)
1. **console.anthropic.com** → Zahlungsmittel, etwas Guthaben, unter **Limits** ein Ausgabenlimit (z. B. 10 €/Monat). **Das ist die harte Kostengrenze:** Ist es erreicht, verweist der Bot auf WhatsApp/Telefon. Mehr kann nie abgebucht werden.
2. Unter **API Keys** einen Key erstellen (beginnt mit `sk-ant-`).
3. Cloudflare → Workers & Pages → `primedetailing-chat` → **Settings → Variables and secrets → Add** → Typ **Secret**, Name `ANTHROPIC_API_KEY`, Wert = Key → **Deploy**.

Ein eigenes `SESSION_SECRET` ist optional (ohne wird es aus dem API-Key abgeleitet).

## 2. Lokal testen (optional)
```bash
cd chatbot
npm install
copy .env.example .env       # Windows (Mac/Linux: cp .env.example .env)
notepad .env                  # hinter ANTHROPIC_API_KEY= den Key einfügen, speichern
npm run evals                 # 46 Testfragen gegen die echte KI
npm start                     # http://localhost:8787
```
**Foto-Check ausprobieren:** Im Chat auf „📷 Foto-Check“ tippen und 3–4 echte Fotos schicken (verschmutzter Innenraum, Tierhaare, Lack mit Swirls, ein sauberes Auto, ein Foto ohne Auto). Passt die Einschätzung? Sonst `foto.worauf` in `config/bot.config.json` anpassen.

**Anfragen:** gehen per Web3Forms an support@primedetailing.eu (Empfänger im Web3Forms-Dashboard, Konto tom.schindler999@gmail.com).

## 3. Vor dem Livegang
- [ ] Datenschutzerklärung um den KI-Chat ergänzen: Anbieter Anthropic und Cloudflare, Zweck, Speicherdauer (Gespräche und Fotos werden nicht auf dem Server gespeichert; Fotos gehen nur zur Auswertung an die KI, Standortdaten werden vorher im Browser entfernt; für den Spam-Schutz wird die IP-Adresse verschlüsselt (Hash) höchstens 24 Stunden gezählt; Anfragen kommen per E-Mail)
- [ ] AV-Vertrag mit Anthropic (in der Console unter Legal/DPA) und Cloudflare (im Dashboard) akzeptieren
- [ ] Optional, zusätzlich zu den eingebauten Limits: In Cloudflare unter **Security → WAF → Rate limiting rules** eine Regel: max. 20 Anfragen pro 10 Sekunden pro IP auf `/api/*` (blockt grobe Angriffe, bevor der Worker überhaupt läuft)

## Termin-Bot mit Google Kalender verbinden (optional)
Ohne Kalender läuft `/demo/termin/` im Vorführmodus: Zeiten nach Öffnungszeiten, Buchungen nur im Browser. Mit Kalender zeigt der Bot echte freie Zeiten und trägt Termine direkt ein. Dauer ca. 15 Minuten, kostenlos.

1. **console.cloud.google.com** → oben neues Projekt anlegen, z. B. `termin-bot`.
2. **APIs & Dienste → Bibliothek** → „Google Calendar API“ suchen → **Aktivieren**.
3. **IAM & Verwaltung → Dienstkonten → Dienstkonto erstellen**, Name `termin-bot`, Rollen braucht es keine. Danach das Dienstkonto öffnen → **Schlüssel → Schlüssel hinzufügen → Neuen Schlüssel erstellen → JSON**. Eine Datei wird heruntergeladen.
4. **calendar.google.com** → links bei „Weitere Kalender“ auf **+ → Neuen Kalender erstellen**, z. B. „Termine Demo“. Dann **Einstellungen und Freigabe** dieses Kalenders:
   - **Für bestimmte Personen freigeben** → die E-Mail des Dienstkontos eintragen (endet auf `iam.gserviceaccount.com`, steht auch in der JSON-Datei bei `client_email`) → Berechtigung **„Änderungen an Terminen vornehmen“**.
   - Weiter unten bei **Kalender integrieren** die **Kalender-ID** kopieren (endet auf `@group.calendar.google.com`).
5. Cloudflare → Workers & Pages → `primedetailing-chat` → **Settings → Variables and secrets**:
   - **Add → Secret**, Name `GOOGLE_SA_JSON`, Wert = **kompletter Inhalt** der JSON-Datei.
   - **Add → Text**, Name `TERMIN_KALENDER`, Wert = Kalender-ID. → **Deploy**.
6. Test im Browser: `https://primedetailing-chat.tom-schindler999.workers.dev/api/demo/termin/zeiten?betrieb=fahrzeug&termin=aussen` muss `"kalender":true` zeigen.

Danach die JSON-Datei löschen oder sicher ablegen, **nie ins Repo**. Optional je Beispielbetrieb ein eigener Kalender: `TERMIN_KALENDER_FAHRZEUG`, `TERMIN_KALENDER_MALER`, `TERMIN_KALENDER_ELEKTRO`. Termine aus der Vorführung tragen „[Demo]“ im Titel; `TERMIN_DEMO = "0"` schaltet das für echte Kunden ab. Buchungen zählen zum Formular-Limit (max. 10 pro Besucher und Tag), die Notbremse `KILL_SWITCH` stoppt auch den Termin-Bot.

## Termin-Bestätigung per E-Mail (optional)
Nach jeder Buchung bekommen **Kunde und Betrieb eine Mail** mit allen Angaben und dem Termin als Kalender-Datei (`termin.ics`). Der Kunde bekommt dazu einen Link zum Absagen, beim Absagen gehen wieder beide Mails raus. Ohne Einrichtung wird nichts verschickt.

1. **brevo.com** → kostenlos registrieren (bis 300 Mails/Tag gratis, Firma in der EU). Im Konto den Vertrag zur Auftragsverarbeitung (AVV) annehmen.
2. **Absender → Domains → Domain hinzufügen**, z. B. `primedetailing.eu` oder später die neue Firmen-Domain. Brevo zeigt 3–4 DNS-Einträge (Brevo-Code, DKIM, DMARC) → beim Domain-Anbieter eintragen → in Brevo **Authentifizieren**. Ohne diesen Schritt landen die Mails im Spam.
3. **SMTP & API → API-Schlüssel → Neuen Schlüssel erstellen** (beginnt mit `xkeysib-`).
4. Cloudflare → Worker `primedetailing-chat` → **Settings → Variables and secrets**:
   - **Secret** `BREVO_API_KEY` = der Schlüssel
   - **Text** `MAIL_ABSENDER` = z. B. `termine@primedetailing.eu` (muss zur bestätigten Domain passen)
   - **Text** `TERMIN_MAIL_BETRIEB` = Adresse, an die neue Termine gehen, z. B. `support@primedetailing.eu`
   - → **Deploy**

Optional: eigene Empfänger je Beispielbetrieb `TERMIN_MAIL_BETRIEB_FAHRZEUG` / `_MALER` / `_ELEKTRO`, Tagesgrenze für alle Mails `MAIL_TAGESLIMIT` (Standard 100), Adresse der Termin-Seite für den Absage-Link `TERMIN_SEITE` (Standard `https://primedetailing.eu/demo/termin/`). Statt Brevo geht auch Resend (`RESEND_API_KEY`). In die Datenschutzerklärung gehört dann ein Satz zu Brevo als Mail-Dienstleister.

## Anruf-Retter: verpasster Anruf → SMS (optional, sipgate)
Geht beim Betrieb niemand ans Telefon, bekommt der Anrufer wenige Sekunden später eine SMS mit dem Link zur Anfrage, und der Betrieb sofort eine Mail mit der Nummer und einem Rückruf-Knopf. Code: `src/anruf.ts`, Tests: `tests/anruf.test.ts`.

**Ablauf:** Handy des Chefs leitet „bei Nichtmelden“ (z. B. nach 20 Sekunden) auf eine sipgate-Nummer um → sipgate meldet den Anruf an `…/api/anruf/sipgate` → der Bot prüft die Signatur von sipgate, schickt die SMS (nur an deutsche Handynummern, höchstens eine pro Nummer und Tag) und die Mail.

**Ohne sipgate (Probelauf, kostenlos):** Fehlen die sipgate-Zugangsdaten, wird keine SMS verschickt, nur die Mail an den Betrieb. Zum Vorführen ohne Telefon: Variable `ANRUF_PROBE = "1"` setzen, dann löst `POST /api/anruf/probe` mit `{"von":"4915712345678"}` eine Probe-Mail aus. Danach `ANRUF_PROBE` wieder löschen.

**Mit sipgate (kostet Geld, erst nach Freigabe):**
1. sipgate-Konto mit Rufnummer und SMS-Funktion. Im Konto das Zusatzpaket **sipgate.io** buchen (S: bis 100 Anrufe/Monat ohne Aufpreis) und als Webhook-URL für eingehende Anrufe eintragen: `https://primedetailing-chat.tom-schindler999.workers.dev/api/anruf/sipgate`
2. Einen **persönlichen Zugangs-Token** (Personal Access Token) mit dem Recht zum SMS-Versand erstellen. Er besteht aus Token-ID und Token.
3. Cloudflare → Worker → **Variables and secrets**:
   - **Secret** `SIPGATE_TOKEN_ID` und **Secret** `SIPGATE_TOKEN`
   - **Text** `SIPGATE_SMS_ID` = SMS-Absender-ID aus sipgate (meist `s0`)
   - **Text** `ANRUF_BETRIEB` = `fahrzeug`, `maler` oder `elektro` (für echte Kunden später eigener Eintrag)
   - optional **Text** `ANRUF_LINK` = Link in der SMS (Standard: Anfrage-Seite der Vorführung)
   - optional **Text** `ANRUF_MAIL_BETRIEB` = Empfänger der Mail (Standard: `TERMIN_MAIL_BETRIEB`)
   - optional **Text** `ANRUF_ANSAGE` = https-Adresse einer WAV-Datei (mono, 16 Bit, 8 kHz), wird dem Anrufer vorgespielt
4. Beim Handy des Chefs die Rufumleitung „bei Nichtmelden“ auf die sipgate-Nummer stellen (beim Mobilfunkanbieter, oft per Code `**61*NUMMER**20#`).

Mehrere Betriebe: je Rufnummer `ANRUF_BETRIEB_<Nummer ohne +>` = Betrieb, eigener Link `ANRUF_LINK_<BETRIEB>`, eigener Empfänger `ANRUF_MAIL_BETRIEB_<BETRIEB>`. Die Notbremse `KILL_SWITCH` stoppt auch den Anruf-Retter. Die SMS ist eine Antwort auf den Anruf und keine Werbung; in die Datenschutzerklärung gehört trotzdem ein Satz dazu (Telefonnummer, sipgate als Dienstleister).

## Schutz vor Spam und Kosten (eingebaut)
| Schutz | Wert | Wo ändern |
|---|---|---|
| Zeichen pro Nachricht | 800 | `limits.maxZeichenProNachricht` |
| Gespräch zu lang | 30 Nachrichten oder 12.000 Zeichen → Verweis auf WhatsApp | `limits.maxNachrichtenProGespraech`, `maxZeichenProGespraech` |
| Nachrichten pro Besucher | 8 / Minute · 40 / Stunde · 100 / Tag | `limits.proIp` |
| Fotos pro Besucher | 3 pro Gespräch · 3 / Minute · 6 / Stunde · 10 / Tag | `limits.maxFotosProGespraech`, `limits.fotosProIp` |
| Abgeschickte Anfragen | 2 / Minute · 5 / Stunde · 10 / Tag | `limits.anfragenFormularProIp` |
| Ganzer Bot pro Tag | 1.500 Nachrichten | `limits.tagesbudgetNachrichten` |
| Monatliche Kosten | dein Ausgabenlimit | Anthropic Console → Limits |

Ein normales Kundengespräch hat 5–15 Nachrichten, das wird nie gebremst. Wer über ein Limit kommt, bekommt einen freundlichen Hinweis plus WhatsApp-/Anruf-Button. Gezählt wird gemeinsam über alle Cloudflare-Server (Durable Object, im kostenlosen Tarif enthalten). Werte stehen in `config/bot.config.json`, danach `npm run deploy`.

## Notbremse (Chat sofort pausieren)
**Am schnellsten, auch vom Handy:** dash.cloudflare.com → Workers & Pages → `primedetailing-chat` → **Einstellungen → Variablen und Geheimnisse** → Variable `KILL_SWITCH` mit Wert `1` hinzufügen → **Bereitstellen**. Wirkt nach wenigen Sekunden; der Chat zeigt dann „Der Chat ist gerade pausiert“. Zum Wiedereinschalten auf `0` setzen oder löschen.

Oder im CMS das Feld „KI-Chat“ leeren – dann ist der Chat nicht mehr auf der Website.

## Später ändern
| Was | Wie |
|---|---|
| Preise | im CMS ändern – der Bot übernimmt sie automatisch |
| Infos/FAQ | `chatbot/data/wissen.md` ändern und pushen (vorher `npm run evals`) |
| Chat sofort pausieren | siehe **Notbremse** oben |
| Foto-Check abschalten | `foto.aktiv` in `chatbot/config/bot.config.json` auf `false` und pushen |
| Logs ansehen | `npx wrangler tail` oder im Dashboard unter Workers → Logs |
| Eigene Adresse `chat.primedetailing.eu` | nur möglich, wenn die Domain-DNS bei Cloudflare liegt; sonst bleibt `…workers.dev` (funktioniert genauso) |
