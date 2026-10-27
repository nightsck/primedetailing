# primedetailing.eu

Website von Prime Detailing. Inhalte (Preise, Texte, FAQ, Fotos) liegen in `src/_data/*.yml` und werden über **Pages CMS** im Browser bearbeitet. Bei jeder Änderung baut GitHub die Seite automatisch neu (Eleventy) und veröffentlicht sie auf GitHub Pages.

```
Pages CMS (Browser)  →  Commit ins Repo  →  GitHub Action baut  →  primedetailing.eu
```

## Einmalig einrichten

### 1. Repository anlegen
1. Auf GitHub ein neues Repository anlegen, z. B. `primedetailing`.
2. Den Inhalt dieser ZIP hochladen, **inklusive der versteckten Dateien** `.pages.yml`, `.github/` und `.gitignore`.
   Am einfachsten per Terminal:
   ```bash
   cd primedetailing
   git init && git add . && git commit -m "Neue Website"
   git branch -M main
   git remote add origin https://github.com/<DEIN-NAME>/primedetailing.git
   git push -u origin main
   ```

### 2. GitHub Pages aktivieren
1. Repo → *Settings* → *Pages* → **Source: „GitHub Actions“** (nicht „Deploy from a branch“).
2. Unter *Actions* sollte „Website veröffentlichen“ laufen und grün werden.
3. *Settings* → *Pages* → Custom domain: `primedetailing.eu` eintragen, danach **Enforce HTTPS** anhaken.

### 3. Domain umstellen (bei Hostinger)
- `A`-Records für `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `CNAME` für `www`: `<DEIN-NAME>.github.io`
- Alte A-Records von Hostinger entfernen. **MX-Records (E-Mail) nicht anfassen!**
- Erst wenn die Seite unter primedetailing.eu läuft, den Hostinger-Webspace kündigen.

### 4. Pages CMS verbinden
1. Auf https://app.pagescms.org mit GitHub anmelden.
2. Die Pages-CMS-App für das Repo installieren und das Repo öffnen.
3. Links erscheinen die Bereiche: Kontakt & Allgemein, Startseite, Leistungen, Preise & Pakete, Preisrechner, FAQ, Impressum, Datenschutz.
4. Jonas genauso einrichten: Ihn auf GitHub als Collaborator zum Repo hinzufügen (*Settings → Collaborators*), dann kann er sich ebenfalls bei Pages CMS anmelden.

Nach dem Speichern im CMS dauert es ca. 1–2 Minuten, bis die Änderung live ist.

## Vor dem Livegang

- [ ] **Teamfotos** im CMS unter *Startseite → Team* hochladen (Querformat 3:2, max. ~1600 px).
- [ ] **Vorher/Nachher-Fotos** unter *Startseite → Vorher / Nachher*. Der Abschnitt erscheint automatisch, sobald beide da sind.
- [ ] **Preisrechner** prüfen: Aufschläge für Fahrzeuggrößen stehen auf 0 €, und es gibt nur die zwei Extras mit echten Preisen. Eigene Werte im CMS eintragen.
- [ ] **Impressum & Datenschutz** prüfen (GbR-Name!), gelbe Hinweiskästen löschen.
- [ ] **FAQ und Ablauf** gegenlesen.
- [ ] Formular einmal testen. Mails kommen über FormSubmit an die E-Mail aus *Kontakt & Allgemein*.

## Lokal testen (optional)

```bash
npm install
npm start        # http://localhost:8080
```

## Aufbau

```
src/_data/          Inhalte als YAML (vom CMS bearbeitet)
  site.yml          Kontaktdaten, WhatsApp, SEO
  startseite.yml    Hero, Ablauf, Über uns, Team, Vorher/Nachher
  leistungen.yml    Leistungsübersicht
  preise.yml        Alle Pakete und Preise (speist auch Rechner und Formular)
  rechner.yml       Fahrzeuggrößen, Extras
  faq.yml
src/recht/          Impressum, Datenschutz (Markdown)
src/index.njk       Startseite (Vorlage)
src/feedback.njk    Feedback-Seite inkl. QR-Code
src/assets/         CSS, JS, Schriften (lokal, DSGVO-freundlich)
src/redirects/      Weiterleitungen der alten URLs (/about, /pricing …)
.pages.yml          Pages-CMS-Konfiguration
.github/workflows/  Automatischer Build und Upload
```
