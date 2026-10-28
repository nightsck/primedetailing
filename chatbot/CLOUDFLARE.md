# Live schalten mit Cloudflare Workers

Dauer: ca. 20 Minuten. Kosten: Cloudflare kostenlos (Free-Plan, 100.000 Anfragen/Tag), KI ca. 0,3 Cent pro Gespräch.

## So ist es eingerichtet
- Der Bot liegt im Website-Repo im Ordner `chatbot/` und läuft als Cloudflare Worker **`primedetailing-chat`**: https://primedetailing-chat.tom-schindler999.workers.dev
- Cloudflare ist mit GitHub verbunden: **Jeder Push auf `main` baut und deployt den Bot automatisch** (Stammverzeichnis `chatbot`, Deploy-Befehl `npm run deploy`).
- **Preise kommen aus dem CMS:** Beim Bauen liest der Bot `src/_data/preise.yml` und `rechner.yml`. Preis im CMS ändern → Website und Bot sind nach 1–2 Minuten aktuell.
- Auf der Website eingebunden über `chatbot_url` in `src/_data/site.yml` (im CMS unter „Kontakt & Allgemein“). Feld leeren = Chat verschwindet von der Website.

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

**Anfragen:** gehen per FormSubmit an support@primedetailing.eu. Beim allerersten Mal kommt eine Bestätigungsmail – Link einmal klicken.

## 3. Vor dem Livegang
- [ ] Datenschutzerklärung um den KI-Chat ergänzen: Anbieter Anthropic und Cloudflare, Zweck, Speicherdauer (Gespräche und Fotos werden nicht auf dem Server gespeichert; Fotos gehen nur zur Auswertung an die KI, Standortdaten werden vorher im Browser entfernt; für den Spam-Schutz wird die IP-Adresse verschlüsselt (Hash) höchstens 24 Stunden gezählt; Anfragen kommen per E-Mail)
- [ ] AV-Vertrag mit Anthropic (in der Console unter Legal/DPA) und Cloudflare (im Dashboard) akzeptieren
- [ ] Optional, zusätzlich zu den eingebauten Limits: In Cloudflare unter **Security → WAF → Rate limiting rules** eine Regel: max. 20 Anfragen pro 10 Sekunden pro IP auf `/api/*` (blockt grobe Angriffe, bevor der Worker überhaupt läuft)

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
