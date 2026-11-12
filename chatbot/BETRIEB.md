# Betrieb auf dem eigenen Server (Hetzner)

Die Demo und Prime Detailing laufen weiter bei Cloudflare (siehe CLOUDFLARE.md). Diese Anleitung ist für den Server in Deutschland, auf dem echte Kunden laufen sollen.

> Stand: Die Docker-Dateien sind geschrieben, aber noch nicht auf einem echten Server gelaufen. Beim ersten Aufsetzen bitte Schritt für Schritt vorgehen und Fehler melden.

## Einmalig einrichten (ca. 30 Minuten)

1. **Server bestellen:** Hetzner Cloud, Standort Nürnberg oder Falkenstein, kleinste Größe reicht (2 GB RAM), Ubuntu 24.04. Im Hetzner-Konto den Vertrag zur Auftragsverarbeitung abschließen.
2. **Domain zeigen lassen:** Beim Domain-Anbieter einen A-Eintrag anlegen, z. B. `bots.<eure-domain>` → IP des Servers.
3. **Docker installieren:** per SSH anmelden, dann `curl -fsSL https://get.docker.com | sh`.
4. **Code holen:** `git clone https://github.com/nightsck/primedetailing.git && cd primedetailing`
5. **Schlüssel eintragen:** `cp chatbot/hetzner/.env.beispiel chatbot/hetzner/.env`, dann mit `nano chatbot/hetzner/.env` ausfüllen (siehe SECRETS.md).
6. **Starten:** `docker compose -f chatbot/hetzner/docker-compose.yml up -d --build`
7. **Prüfen:** `https://bots.<eure-domain>/health` zeigt `{"ok":true,…}`. Admin-Panel: `https://bots.<eure-domain>/admin`.
8. **Firewall:** In der Hetzner-Konsole nur die Ports 22, 80 und 443 freigeben.

Abkürzung für die folgenden Befehle: `alias dc='docker compose -f chatbot/hetzner/docker-compose.yml'`

## Alltag

| Aufgabe | Befehl (im Ordner `primedetailing`) |
|---|---|
| Neue Version einspielen | `git pull && dc up -d --build` |
| Logs ansehen | `dc logs -f bots` |
| Neu starten | `dc restart bots` |
| Alle Bots sofort pausieren | In `.env` `KILL_SWITCH=1` setzen, dann `dc up -d` |
| Läuft alles? | `dc ps` und `https://…/health` |

## Backup

Alle Kundendaten liegen in **einer Datei** im Docker-Volume `daten`. Sichern:

```bash
dc exec bots node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/daten/kunden.sqlite').exec(\"VACUUM INTO '/daten/sicherung.sqlite'\")"
docker cp "$(dc ps -q bots)":/daten/sicherung.sqlite ./sicherung-$(date +%F).sqlite
```

Die Sicherung enthält personenbezogene Daten (Anfragen, Bewerbungen). Verschlüsselt ablegen, nach spätestens 30 Tagen löschen. Am besten als täglichen Cronjob einrichten und zusätzlich in Hetzner die automatischen Server-Backups einschalten.

Zurückspielen: `dc stop bots`, Datei mit `docker cp` nach `/daten/kunden.sqlite` kopieren, `dc start bots`.

Einzelne Kunden lassen sich auch im Admin-Panel sichern: Reiter „Verlauf & Daten“ → Konfiguration herunterladen.

## Was automatisch passiert

- **Löschfristen:** Einmal am Tag löscht der Server Anfragen, Bewerbungen und Unterlagen, deren Frist (je Kunde einstellbar, Standard 180 Tage) abgelaufen ist. Nicht abgeschickte Unterlagen nach 2 Tagen.
- **HTTPS-Zertifikat:** holt und erneuert Caddy selbst.
- **Neustart:** Nach einem Server-Neustart starten die Container von allein.

## Typische Fehler

| Problem | Ursache und Lösung |
|---|---|
| Seite nicht erreichbar | DNS zeigt noch nicht auf den Server, oder Ports 80/443 in der Firewall zu. `dc logs caddy` ansehen. |
| Admin-Login: keine Mail | Mailversand nicht eingerichtet. Der Code steht dann im Log: `dc logs bots \| grep admin-login`. |
| Chat antwortet nur mit festen Texten | `ANTHROPIC_API_KEY` fehlt oder Ausgabenlimit bei Anthropic erreicht. |
| „Diese Website ist für den Chat nicht freigeschaltet“ | Website des Kunden fehlt in den Stammdaten oder ist ohne `https://` eingetragen. Nach dem Ändern veröffentlichen. |
| Änderung im Admin-Panel wirkt nicht | Gespeichert, aber nicht veröffentlicht. Danach dauert es höchstens 30 Sekunden. |
| Nach Update startet der Container nicht | `dc logs bots`. Zur Not `git log` → vorherigen Stand auschecken und `dc up -d --build`. |

## Umzug eines Kunden von Cloudflare nach Hetzner

Im Admin-Panel bei Cloudflare die Konfiguration herunterladen, im Admin-Panel auf Hetzner über „Aus Datei anlegen“ einlesen, veröffentlichen, dann beim Kunden den Einbau-Code gegen den neuen tauschen. Anfragen und Zahlen ziehen dabei nicht mit um.
