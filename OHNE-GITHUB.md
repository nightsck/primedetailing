# Betrieb ohne GitHub

Bisher hing an GitHub mehr als nur der Code. Diese Anleitung zeigt, wie alles direkt von deinem PC zu Cloudflare geht.

## Was bisher über GitHub lief

| Was | Bisher | Ohne GitHub |
|---|---|---|
| **Code** | lag im Repo `nightsck/primedetailing` | liegt in diesem Ordner auf deinem PC. **Sichern!** (siehe unten) |
| **Chat-Server (alle Bots, Admin-Panel, CRM)** | Cloudflare hat bei jedem Push auf `main` selbst gebaut | Doppelklick auf `bots-bereitstellen.cmd` |
| **Website primedetailing.eu** | GitHub Pages | Cloudflare Pages, Doppelklick auf `website-bereitstellen.cmd` |
| **Inhalte ändern (Preise, Texte, Stellen)** | Pages CMS im Browser (braucht GitHub) | Dateien in `src/_data/` mit dem Editor ändern, dann beide `.cmd` ausführen |
| **CRM: Firmensuche bei OpenStreetMap** | GitHub Actions alle 20 Minuten | Der Server sucht selbst, sobald drei Stunden nichts von GitHub kam (war schon eingebaut). Etwas langsamer, sonst gleich. |

Schlüssel und Einstellungen (API-Key, Brevo, Kalender …) liegen bei Cloudflare und bleiben erhalten. Kundendaten und CRM-Daten liegen ebenfalls bei Cloudflare und sind von GitHub unabhängig.

## 1. Code sichern (sofort)

Dieser Ordner ist jetzt das Original. Lege eine Kopie an einen zweiten Ort (externe Platte, Cloud-Speicher). Wenn du wieder eine Versionsverwaltung willst: Der Ordner funktioniert mit jedem Git-Anbieter (z. B. Codeberg aus Deutschland oder GitLab), ein privates Repo dort reicht.

## 2. Einmalig einrichten (ca. 10 Minuten)

**Wichtig, solange Cloudflare noch mit GitHub verbunden ist:** Jede Änderung, die auf `main` landet (auch ein Merge), geht sofort live. Und umgekehrt würde ein späterer Push auf `main` einen Stand vom PC wieder überschreiben. Darum diese Reihenfolge einhalten:

0. **Den aktuellen Stand auf den PC holen.** Die Kopie in `E:\Claude KI\Backup\primedetailing-chatbot` ist vom 28.10. und viel älter als das, was live läuft. Bereitgestellt wird immer der Ordner, aus dem du `bots-bereitstellen.cmd` startest. Darum zuerst den Stand von `main` (oder den freigegebenen PR) als ZIP herunterladen bzw. von Claude in einen Ordner legen lassen, z. B. `E:\ClaudeCode\primedetailing`.
1. **Node.js installieren:** nodejs.org → aktuelle LTS-Version (mindestens 22.18, das Skript prüft das). Danach PC neu starten.
2. **Bei Cloudflare anmelden:** Eingabeaufforderung im Ordner `chatbot` öffnen und eingeben:
   ```
   npx wrangler login
   ```
   Es öffnet sich der Browser, dort mit deinem Cloudflare-Konto zustimmen.
3. **Verbindung zu GitHub trennen:** dash.cloudflare.com → Workers & Pages → `primedetailing-chat` → Settings → Build → **Disconnect**. Sonst zeigt Cloudflare dauernd fehlgeschlagene Builds.

## 3. Chat-Server bereitstellen

Doppelklick auf **`bots-bereitstellen.cmd`**. Das Skript

1. prüft die Node-Version,
2. installiert genau die Paket-Versionen aus `package-lock.json` (`npm ci`),
3. lässt alle Tests und den Probelauf der Abnahme-Checkliste laufen (`npm run abnahme`) und bricht ab, wenn etwas rot ist,
4. fragt noch einmal nach (Strg+C bricht ab),
5. stellt bereit und ruft danach `/health` und das Admin-Panel auf.

Was dabei gesetzt wird, steht vollständig in `chatbot/wrangler.toml`: Name, Datenbanken (Durable Objects), der 10-Minuten-Takt fürs CRM, die Adresse `…workers.dev` und die Route `app.ki-für-meinen-betrieb.de/*`. Variablen, die nur im Dashboard stehen (z. B. `KILL_SWITCH`, `KONTAKT_MAIL`, `TERMIN_KALENDER`), bleiben dank `keep_vars = true` erhalten, Secrets sowieso.

Die Secrets sind seit dem 12.11. gesetzt (`SESSION_SECRET`, `BREVO_API_KEY`, `MAIL_ABSENDER`, `GOOGLE_SA_JSON`, `ANTHROPIC_API_KEY`). `ADMIN_LOGIN` nur setzen, wenn außer kifuermeinenbetrieb@gmail.com weitere Adressen ins Admin-Panel sollen. Liste und Bedeutung: `chatbot/SECRETS.md`.

Zurück zur vorherigen Fassung, falls etwas nicht stimmt: Cloudflare → Worker `primedetailing-chat` → Deployments → ältere Fassung → **Rollback**.

## 4. Website primedetailing.eu zu Cloudflare umziehen

Solange GitHub Pages die Seite noch ausliefert, eilt das nicht. Fällt sie aus, sind es diese Schritte:

1. **Projekt anlegen (einmalig)**, im Hauptordner:
   ```
   npx wrangler pages project create primedetailing --production-branch main
   ```
2. Doppelklick auf **`website-bereitstellen.cmd`**. Die Seite läuft danach unter `primedetailing.pages.dev`.
3. **Domain umstellen.** Am saubersten: die Domain zu Cloudflare-DNS umziehen (kostenlos).
   - Cloudflare → **Add a domain** → `primedetailing.eu`. Cloudflare liest die bestehenden Einträge ein. **Prüfen, dass die MX-Einträge (E-Mail) dabei sind**, sonst kommen keine Mails mehr an.
   - Die vier A-Einträge auf GitHub (`185.199.108.153` bis `…111.153`) und den CNAME `www` löschen.
   - Bei Hostinger die zwei Nameserver eintragen, die Cloudflare anzeigt.
   - Cloudflare → Workers & Pages → `primedetailing` → Custom domains → `primedetailing.eu` und `www.primedetailing.eu` hinzufügen.
   - Die Umstellung dauert meist unter einer Stunde, höchstens einen Tag.
4. Wenn die Domain bei Cloudflare liegt, kann der Chat-Server zusätzlich eine eigene Adresse bekommen (z. B. `chat.primedetailing.eu`): Worker → Settings → Domains & Routes.

**Achtung bei Preisen und Stellen:** Website und Bot lesen dieselben Dateien in `src/_data/`. Nach einer Änderung dort **beide** Skripte ausführen, sonst nennt der Bot andere Preise als die Website.

## 5. Was nicht mehr geht

- **Pages CMS** (Inhalte im Browser ändern, auch für Jonas). Ersatz für den Moment: Dateien direkt ändern. Auf Dauer wäre ein kleiner Bereich im Admin-Panel dafür sinnvoll.
- **Automatisches Bereitstellen bei jeder Änderung.** Dafür gibt es jetzt die zwei Skripte.

## Hetzner statt Cloudflare

Der Weg auf den eigenen Server steht in `chatbot/BETRIEB.md`. Dort ersetzt du `git clone` durch das Hochladen dieses Ordners (z. B. mit WinSCP) und `git pull` durch erneutes Hochladen.
