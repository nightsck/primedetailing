# Sicherheit: Was die Bots schützt und was du selbst einstellen musst

Stand: 12.11.2026. Grundlage sind die frei verfügbaren Empfehlungen von OWASP (Quellen unten).
Kein System ist unknackbar. Ziel ist: Angriffe sind teuer, Schäden bleiben klein, und du merkst es sofort.

## Was im Code eingebaut ist

| Bereich | Schutz | Wo |
|---|---|---|
| **Anmeldung** (Admin-Panel, Kunden-Zugang) | Kein Passwort, das jemand erraten oder wiederverwenden kann. 6-stelliger Code per Mail, gilt 10 bis 15 Minuten und einmal, liegt nur als Hash im Speicher. Ein neuer Code macht alle alten ungültig. | `admin/anmeldung.ts`, `zugang/anmeldung.ts` |
| **Durchprobieren** | Pro Besucher 6 Versuche pro Minute, 15 pro Stunde, 30 pro Tag. Pro Adresse 8 bis 10 falsche Codes am Tag, dann ist Schluss. | `limits.ts` (Art „login“) |
| **Mail-Flut** | Pro Adresse höchstens 6 (Kunde) bzw. 10 (Admin) Code-Mails am Tag. | wie oben |
| **Adressen erraten** | Die Antwort ist immer gleich, egal ob es die Adresse gibt. | wie oben |
| **Sitzung** | Cookie mit `HttpOnly` (kein Skript kann es lesen), `Secure` (nur verschlüsselt), `SameSite=Strict` (fremde Websites schicken es nie mit), enger Pfad. Kunde: 12 Stunden, nur für seine eigene Seite. Admin: 14 Tage, nur `/admin`. Eigener Schlüssel je Bereich. | `sicherheit.ts` |
| **Untergeschobene Klicks** (CSRF) | Schreibende Aufrufe nur von unserer eigenen Seite: Herkunft wird geprüft, dazu ein eigener Kopf, den fremde Websites nicht mitschicken können. | `sicherheit.ts` → `eigeneHerkunft` |
| **Eingeschleuster Code** (XSS) | Seiten mit Anmeldung führen nur unser eigenes Skript aus (Content-Security-Policy mit neuer Freigabe bei jeder Auslieferung), laden nichts von fremden Servern und lassen sich nicht in fremde Seiten einbetten. Alle angezeigten Texte werden maskiert. | `sicherheit.ts` → `seitenKoepfe` |
| **Alle Antworten** | Nur verschlüsselt (HSTS), keine geratenen Dateitypen, sparsamer Referrer. | `sicherheit.ts` → `grundSchutz` |
| **Kunden untereinander** | Jede Abfrage im Speicher filtert nach der Kunden-ID. Das Cookie von Kunde A öffnet Kunde B nicht, auch nicht bei gleicher E-Mail-Adresse. | `speicher/`, `zugang/` |
| **Kunden-Zugang** | Der Kunde sieht und schickt nur freigegebene Felder. Unbekannte Felder werden abgelehnt. Preise gelten erst nach deiner Freigabe. Jede Änderung: Mail an dich und an den Kunden, Eintrag im Verlauf, mit einem Klick zurückholbar. | `zugang/aenderung.ts` |
| **Bot austricksen** | Umprogrammier-Versuche fängt der Code vor der KI ab. Jeder Satz der KI wird geprüft (erfundene Preise, Zusagen, Rabatte, verbotene Wörter), bevor ihn jemand sieht. Heikles steht als feste Antwort ohne KI. | `guard.ts` |
| **Website einlesen** | Der Server ruft nur die eigenen https-Adressen des Kunden ab, nie IP-Nummern oder interne Adressen, und folgt keiner Weiterleitung nach außen. Der Text ist für den Bot eine Information, keine Anweisung; Umprogrammier-Versuche auf der Website werden nicht gespeichert. | `website.ts` |
| **Kosten und Spam** | Limits pro Besucher, Tages- und Monatsbudget je Kunde, Tageslimit für Mails, Größenlimit für jede Anfrage, Notbremse `KILL_SWITCH`. | `limits.ts`, `mail.ts` |
| **Uploads** (Bewerbungen) | Nur PDF, Word und Fotos, geprüft am Datei-Inhalt und nicht am Namen. Download nur mit langem Zufallslink, immer als Datei, nie im Browser ausgeführt. Automatisches Löschen nach Frist. | `jobs.ts`, `kunden-routen.ts` |
| **Pakete** | `npm audit` ohne offene Lücke, die uns betrifft (Stand oben). | `package.json` |

Die Tests in `tests/zugang.test.ts` und `tests/admin.test.ts` prüfen diese Punkte bei jedem `npm test`.

## Was du selbst einstellen musst (alles kostenlos)

1. **`SESSION_SECRET` setzen**: lange Zufallsfolge als Secret (`wrangler secret put SESSION_SECRET`). Ohne sie gelten Anmeldungen nur bis zum nächsten Neustart. Erzeugen: `openssl rand -base64 48`.
2. **Zwei-Faktor-Anmeldung einschalten** bei Cloudflare, Anthropic, Brevo, dem Domain-Anbieter und beim Mail-Postfach der Admin-Adressen. Das ist der wichtigste Punkt: Wer dein Mail-Postfach hat, bekommt auch die Anmelde-Codes.
3. **Ausgabenlimit in der Anthropic Console** setzen. Das ist die harte Obergrenze, falls doch einmal etwas durchrutscht.
4. **Eigene Domain statt `workers.dev`** für die Bots (z. B. `bots.ki-für-meinen-betrieb.de`). Erst dann greifen die Schutzfunktionen von Cloudflare für Websites:
   - Bot Fight Mode einschalten (im kostenlosen Tarif enthalten).
   - Das kostenlose verwaltete Regelwerk der Firewall ist aktiv; nachsehen unter Security.
   - Die eine kostenlose Rate-Limiting-Regel auf die Anmelde-Adressen legen (Pfad enthält `/api/anmelden` oder `/api/einloesen`).
   - SSL/TLS auf „Full (strict)“, „Always Use HTTPS“ an, Mindestversion TLS 1.2.
5. **Admin-Adressen knapp halten** (`ADMIN_LOGIN`): nur du und Giosuè, keine Sammelpostfächer.
6. **Kunden-Zugang**: nur Adressen eintragen, die dem Kunden wirklich gehören. Verlässt jemand den Betrieb, Adresse entfernen. Die Sitzung endet dann sofort.
7. **Mails absichern**: SPF, DKIM und DMARC für die Absender-Domain (bei Brevo geführt einzurichten). Sonst kann jemand Mails in eurem Namen fälschen.

## Was das nicht abdeckt

- **Gestohlenes Mail-Postfach**: Wer das Postfach eines Kunden oder von dir übernimmt, kann sich anmelden. Dagegen hilft nur Punkt 2. Beim Kunden begrenzt die Preis-Freigabe den Schaden, und du bekommst jede Änderung per Mail.
- **Täuschung am Telefon oder per Mail**: Niemand von uns fragt je nach einem Code. Das steht auch in der Code-Mail und auf der Anmeldeseite.
- **Die KI selbst**: „Streng“-Modus und „Das sagt der Bot nie“ sind Anweisungen an die KI, keine Garantie. Deshalb gibt es die Prüfungen im Code, die festen Antworten und den Selbsttest.
- **Kein Ersatz für eine Prüfung von außen**: Vor größeren Kunden lohnt sich ein bezahlter Sicherheitstest durch Dritte.

## Wenn etwas passiert ist

1. `KILL_SWITCH=1` setzen: Alle Bots sind sofort pausiert.
2. `SESSION_SECRET` neu setzen: Alle Anmeldungen sind sofort ungültig.
3. Beim betroffenen Kunden unter „Verlauf & Daten“ die letzte gute Fassung zurückholen und den Kunden-Zugang ausschalten.
4. Schlüssel tauschen, die betroffen sein könnten (Anthropic, Brevo, Google-Dienstkonto).
5. Sind personenbezogene Daten betroffen: Meldung an die Datenschutz-Aufsicht innerhalb von 72 Stunden prüfen (Art. 33 DSGVO) und die Kunden informieren. Das ist eine Rechtsfrage; im Zweifel kurz beraten lassen.

## Quellen

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Multifactor Authentication Cheat Sheet (Umgang mit Einmal-Codes): https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- OWASP Secure Headers Project: https://owasp.org/www-project-secure-headers/
- Cloudflare, Schutz vor Bots im kostenlosen Tarif: https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/
- Cloudflare, Firewall-Funktionen je Tarif: https://developers.cloudflare.com/support/firewall/tools
