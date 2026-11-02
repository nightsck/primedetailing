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
- **ab 6 Uhr, einmal am Tag:** sucht Firmen für die nächste Kombination aus Branche und Region (reihum) über **OpenStreetMap** (kostenlos), höchstens 40 pro Suche. Dubletten (Website, Telefon, Name+PLZ) und gesperrte Firmen werden übersprungen.
- **bei jedem Durchlauf:** liest bei zwei Firmen Website und Impressum und bewertet sie mit der KI (0–100 Punkte, Begründung als Sachbezug, Einstiegssatz, Inhaber). Ohne KI-Schlüssel oder bei KI-Fehler nach festen Regeln. Ab der Schwelle (Standard 70) → Status „Anruf-Impuls“.
- **werktags ab 8 Uhr, einmal am Tag:** Mail „Heute anrufen“ an den Empfänger aus den Einstellungen (Standard `kifuermeinenbetrieb@gmail.com`). Dieselbe Firma kommt frühestens nach einer Woche wieder.
- **ab 7 Uhr, einmal am Tag:** Monatsposten anlegen, Mail bei Zahlungen > 7 Tage überfällig, aufräumen (nie kontaktierte Leads unter der Schwelle nach 6 Monaten löschen; gesperrte bleiben als Sperrliste).
- Jede Bot-Aktion steht in der Kontakthistorie („durch: Bot“). Notbremse `KILL_SWITCH = 1` stoppt auch den Bot; „Bot ist aktiv“ in den Einstellungen schaltet nur den Bot aus.

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
