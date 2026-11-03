# Vertriebs-CRM mit Akquise-Bot (intern)

Adresse: **https://primedetailing-chat.tom-schindler999.workers.dev/crm**
Kosten: 0 € (Cloudflare-Gratistarif). Nur die KI-Bewertung läuft über den Anthropic-Schlüssel (Centbeträge).

## Anmelden
1. `/crm` öffnen, E-Mail eintragen, „Link schicken“.
2. Link aus der Mail öffnen und auf „Jetzt anmelden“ tippen. Der Link gilt 20 Minuten und nur einmal; danach bleibt man 30 Tage angemeldet.
3. Erlaubt sind nur Adressen aus der Variablen `CRM_LOGIN` (Standard: `kifuermeinenbetrieb@gmail.com`). Weitere Person, z. B. Giosuè: in Cloudflare `CRM_LOGIN` = `kifuermeinenbetrieb@gmail.com,giosue@…` (kommagetrennt). Namen in der Kontakthistorie: `CRM_NAMEN` = `kifuermeinenbetrieb@gmail.com=Tom,giosue@…=Giosuè`.

## Was wo ist
| Bereich | Inhalt |
|---|---|
| **Heute** | Wen heute anrufen (Anruf-Impulse + fällige Wiedervorlagen), Kennzahlen, Stand des Bots |
| **Pipeline** | Alle Firmen nach Status: Neu → Bewertet → Anruf-Impuls → Angerufen → Infos per Mail → Termin → Angebot → Kunde |
| **Firmen** | Suchen, anlegen. Pro Firma die **Kundenakte**: Anruf erfassen, Kontakthistorie, Ansprechpartner, Dateien (bis 10 MB), Verträge, Zahlungen, Einwilligung, Sperre |
| **Verträge** | Laufende und beendete Verträge, Summe pro Monat |
| **Zahlungen** | Offene Posten, Überfällige zuerst, „Bezahlt“ mit Datum |
| **Produkte** | Preisliste als Vorlage für Verträge (Preise liefert Giosuè nach) |
| **Einstellungen** | Zielbranchen, Zielregionen, Schwelle, Empfänger der Anruf-Impulse, Info-Mail-Vorlage, Impressum, Bot von Hand starten |

## Der Akquise-Bot (läuft alle 10 Minuten von selbst)
**Suche (Standard: ganz Baden-Württemberg, alle Branchen).** Das Land ist in 460 Gebiete von rund 11 × 11 km geteilt, Stuttgart zuerst. Zwischen 6 und 22 Uhr fragt der Bot bei jedem Durchlauf ein Gebiet bei **OpenStreetMap** ab, aber nur, solange weniger als 60 Firmen auf ihre Bewertung warten. Gesucht werden Betriebe mit Namen **und Website oder E-Mail** (Geschäfte, Handwerk, Büros, Praxen, Gastronomie, Hotels, Fitness …), ohne Filialketten und ohne Behörden/Vereine. Liefert ein Gebiet 200 Treffer (Innenstädte), wird es geviertelt und die Viertel kommen als Nächstes dran. Nach dem letzten Gebiet beginnt der Bot 30 Tage später von vorn. Dubletten (Website, Telefon, Name+PLZ) und gesperrte Firmen werden übersprungen. Die Abfrage bei OpenStreetMap macht **GitHub** (Workflow `.github/workflows/osm-suche.yml`, alle 20 Minuten von 6 bis 22 Uhr, kostenlos), weil overpass-api.de keine Anfragen von Cloudflare annimmt. GitHub holt sich beim CRM das nächste Gebiet und liefert die Treffer zurück; das CRM prüft dabei die Kennung des GitHub-Laufs (nur dieses Repo, main-Zweig, dieser Workflow), ein Passwort gibt es nicht. Hat GitHub drei Stunden nichts geliefert, versucht es der Server selbst über Ersatz-Server. Eine Abfrage dauert rund 40 Sekunden. Läufe ansehen oder von Hand starten: GitHub → Actions → „CRM – Firmen suchen“. Hinweis: GitHub pausiert zeitgesteuerte Workflows, wenn im Repo 60 Tage lang nichts passiert; dann dort wieder einschalten.
Alternative in den Einstellungen: „Nur die Zielbranchen in den Zielregionen“ (eine Kombination pro Tag).

**Bewertung.** Bei jedem Durchlauf bis zu drei Firmen, solche mit Website zuerst: Website und Impressum lesen, KI-Bewertung (0–100 Punkte, Begründung als Sachbezug, Einstiegssatz, Inhaber, Branche). Ohne erreichbare Website oder ohne KI-Schlüssel nach festen Regeln (kostenlos). **Kostenbremse:** höchstens `KI-Bewertungen pro Tag` (Standard 40, je ca. 0,05 Cent, also unter 1 € im Monat). Ab der Schwelle (Standard 70) → „Anruf-Impuls“.

**Mails an `Anruf-Impulse an` (Standard `kifuermeinenbetrieb@gmail.com`), werktags:**
- **ab 8 Uhr immer** eine Mail: neue Anruf-Impulse, fällige Wiedervorlagen und der Stand des Bots (letzte 24 Stunden, Fortschritt in Baden-Württemberg, Störungen). Auch wenn es niemanden anzurufen gibt.
- **ab 14 Uhr ein Nachtrag**, aber nur, wenn seit dem Morgen neue Anruf-Impulse dazugekommen sind.
- Knopf „Anruf-Impulse jetzt schicken“ in den Einstellungen: sofort, an jedem Tag.
Dieselbe Firma kommt als Impuls frühestens nach einer Woche wieder.

**Täglich ab 7 Uhr:** Monatsposten anlegen, Mail bei Zahlungen > 7 Tage überfällig, aufräumen (nie kontaktierte Leads unter der Schwelle nach 6 Monaten löschen; gesperrte bleiben als Sperrliste).

Jede Bot-Aktion steht in der Kontakthistorie („durch: Bot“). Notbremse `KILL_SWITCH = 1` stoppt auch den Bot; „Bot ist aktiv“ in den Einstellungen schaltet nur den Bot aus. Eigener KI-Schlüssel nur fürs CRM (damit die Kunden-Chats nie mitbetroffen sind): Secret `CRM_ANTHROPIC_API_KEY`.

## Rechtlicher Rahmen (aus dem Bauplan, technisch eingebaut)
- **Erst anrufen, dann mailen.** Der Bot schickt nie Werbe-Mails. Eine Info-Mail geht nur, wenn bei der Firma eine **Einwilligung** mit Nachweis eingetragen und sie **nicht gesperrt** ist. Das prüft der Server bei jedem Versand.
- **Info-Mails sind ausgeschaltet**, bis ein Absender auf eurer eigenen, bei Brevo bestätigten Domain gesetzt ist: Cloudflare-Variable `VERTRIEB_ABSENDER` (z. B. `vertrieb@ki-fuer-meinen-betrieb.de`), optional `VERTRIEB_NAME`. Vorher Vorlage und Ablauf **anwaltlich prüfen lassen** und das Impressum in den Einstellungen eintragen.
- Jede Info-Mail enthält Impressum und **Abmeldelink**; die Abmeldung sperrt die Firma sofort.
- „Widerspruch“ beim Anruf oder „Sperren“ → keine Anrufe, keine Mails, nie wieder vom Bot angelegt.
- Datenschutz-Information beim ersten Kontakt (Daten aus öffentlichen Quellen, OpenStreetMap) gehört ins Gesprächsskript.

## Technik
- Code: `src/crm/` (`kern.ts` Daten und Abläufe, `routen.ts` Web-Adressen, Anmeldung, Zeitplan, `bot.ts` OpenStreetMap/Website/KI, `seite.html` Oberfläche). Nach Änderungen an `src/crm/*.html`: `node scripts/crm-seite.mjs`.
- Daten: Durable Object `CrmDaten` (SQLite), getrennt von den Kunden-Bots. Zeitplan: `[triggers]` in `wrangler.toml`.
- Tests: `node --test tests/crm.test.ts tests/crm-web.test.ts` (laufen ohne Fremdpakete).
- Optionale Variablen: `CRM_URL` (Adresse in Mails), `CRM_MODELL` (KI-Modell, Standard `claude-haiku-5-5`).
