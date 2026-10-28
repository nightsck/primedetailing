# Live schalten mit Cloudflare Workers

Dauer: ca. 20 Minuten. Kosten: Cloudflare kostenlos (Free-Plan, 100.000 Anfragen/Tag), KI ca. 0,3 Cent pro Gespräch.

## 1. Anthropic API-Key (5 Min.)
1. Auf **console.anthropic.com** registrieren, Zahlungsmittel hinterlegen, ein paar Euro Guthaben aufladen.
2. Unter **Limits** ein Ausgabenlimit setzen (z. B. 10 €/Monat). **Das ist die harte Kostengrenze:** Ist es erreicht, antwortet der Bot nicht mehr mit KI, sondern verweist auf WhatsApp/Telefon. Mehr kann nie abgebucht werden.
3. Unter **API Keys** einen Key erstellen und kopieren (beginnt mit `sk-ant-`).

## 2. Lokal mit echter KI testen (5 Min.)
```bash
npm install
copy .env.example .env       # Windows (Mac/Linux: cp .env.example .env)
notepad .env                  # hinter ANTHROPIC_API_KEY= den Key einfügen, speichern
npm run evals                 # 46 Testfragen gegen die echte KI
npm start                     # http://localhost:8787 im Browser ausprobieren
```
**Foto-Check ausprobieren:** Im Chat auf „📷 Foto-Check“ tippen und 3–4 echte Fotos schicken (verschmutzter Innenraum, Tierhaare, Lack mit Swirls, ein sauberes Auto, ein Foto ohne Auto). Passt die Einschätzung und das empfohlene Paket? Wenn nicht: Text unter `foto.worauf` in `config/bot.config.json` anpassen.
Bei `npm run evals` müssen alle **kritischen** Fälle bestehen. Fällt einer durch, das Ergebnis (`tests/eval-ergebnis.json`) an Claude geben.

## 3. Cloudflare-Konto und Worker (10 Min.)
1. Kostenloses Konto auf **dash.cloudflare.com** anlegen (die Domain muss dafür **nicht** zu Cloudflare umziehen).
2. Im Projektordner:
```bash
npx wrangler login                          # öffnet den Browser, einmal bestätigen
npx wrangler secret put ANTHROPIC_API_KEY   # Key einfügen
npx wrangler secret put SESSION_SECRET      # irgendeine lange Zufallszeichenkette, z. B. aus einem Passwortgenerator
npm run deploy
```
3. Am Ende steht die Adresse des Workers, z. B. `https://primedetailing-chat.DEIN-NAME.workers.dev`.
4. Im Browser `https://…workers.dev/` öffnen: Die Testseite mit dem Chat erscheint. Einmal eine Frage und eine Testanfrage schicken.

**Erste Anfrage über FormSubmit:** FormSubmit schickt beim allerersten Mal eine Bestätigungsmail an support@primedetailing.eu. Den Link darin einmal klicken, danach kommen alle Anfragen an. (Falls das Kontaktformular der Website schon bestätigt ist, entfällt das.)

## 4. Auf der Website einbauen (2 Min.)
In der Website (Repo `nightsck/primedetailing`) vor `</body>` in `src/_includes/base.njk`:
```html
<script src="https://primedetailing-chat.DEIN-NAME.workers.dev/widget.js" defer></script>
```
Committen, GitHub baut die Seite neu, nach 1–2 Minuten ist der Chat unten rechts da.

## 5. Vor dem Livegang
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

Alternativ im Projektordner: in `wrangler.toml` unter `[vars]` die Zeile `KILL_SWITCH = "1"` ergänzen → `npm run deploy`.

## Später ändern
| Was | Wie |
|---|---|
| Preise | `data/preise.json` ändern → `npm test` → `npm run deploy` |
| Infos/FAQ | `data/wissen.md` ändern → `npm run evals` → `npm run deploy` |
| Chat sofort pausieren | siehe **Notbremse** oben |
| Foto-Check abschalten | `foto.aktiv` in `config/bot.config.json` auf `false` → `npm run deploy` |
| Logs ansehen | `npx wrangler tail` oder im Dashboard unter Workers → Logs |
| Eigene Adresse `chat.primedetailing.eu` | nur möglich, wenn die Domain-DNS bei Cloudflare liegt; sonst bleibt `…workers.dev` (funktioniert genauso) |
