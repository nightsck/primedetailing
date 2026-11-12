# Neuen Kunden einrichten

Vom unterschriebenen Vertrag bis zum laufenden Bot. Ziel: unter 30 Minuten, ohne Code.

## 1. Im Erstgespräch abfragen (Checkliste für Giosuè)

**Immer**
- [ ] Firmenname, genau so wie er im Chat stehen soll
- [ ] Was macht der Betrieb in drei Worten? (z. B. „Malerbetrieb“)
- [ ] Adresse, Telefon, E-Mail, Website
- [ ] Öffnungszeiten und Einsatzgebiet
- [ ] Ansprechpartner (wer bestätigt Termine und Preise?)
- [ ] Firmenfarbe (Hex-Wert von der Website oder vom Logo)
- [ ] Du oder Sie gegenüber Kunden?
- [ ] An welche Mail-Adresse(n) gehen Bewerbungen und Anfragen?
- [ ] Link zur Datenschutzerklärung. Der Kunde muss dort die Bots ergänzen (Textbaustein unten).
- [ ] Vertrag zur Auftragsverarbeitung (AVV) mit uns unterschrieben

**Für den Bewerber-Chat**
- [ ] Offene Stellen: Bezeichnung, Umfang (Vollzeit, Minijob …), zwei Sätze zu Aufgaben und Voraussetzungen
- [ ] Arbeitszeiten
- [ ] „Das bieten wir“ in ein, zwei Sätzen. Nur was wirklich stimmt, der Bot sagt es weiter.
- [ ] Was passiert nach der Bewerbung? (z. B. „Wir rufen innerhalb von zwei Werktagen an.“)
- [ ] Wo soll der Link hin? (Website, Stellenanzeige, Instagram, Google-Profil, QR-Code auf Firmenwagen)

**Für den Kunden-Chat**
- [ ] Leistungen, wenn möglich mit Preis oder „ab“-Preis. Ohne Preis sagt der Bot „auf Anfrage“.
- [ ] Die fünf häufigsten Kundenfragen mit der richtigen Antwort
- [ ] Was darf der Bot auf keinen Fall sagen oder versprechen? Welche Wörter oder Namen (z. B. Mitbewerber) sollen nie fallen?
- [ ] Welche Fragen müssen immer exakt gleich beantwortet werden? (werden feste Antworten: Notfall, Reklamation, Rechtliches)
- [ ] Wie wird bezahlt? Was kostet die Anfahrt? Wie schnell gibt es üblicherweise einen Termin?
- [ ] Wer baut die eine Zeile Code in die Website ein? (Kunde, sein Webdesigner oder wir)

**Für den Termin-Bot**
- [ ] Welche Termine sollen online buchbar sein? Name, Dauer, wo (im Betrieb, beim Kunden, am Telefon)
- [ ] An welchen Wochentagen und zu welchen Zeiten?
- [ ] Wie viel Vorlauf braucht der Betrieb (z. B. 24 Stunden)? Wie viel Pause zwischen Terminen, wie viel Fahrzeit?
- [ ] Google-Kalender: Der Kunde legt einen Kalender an (oder nimmt seinen bestehenden) und gibt ihn für unser Dienstkonto frei. Die Adresse steht im Admin-Panel unter „Module → Termin-Bot“. Berechtigung: „Änderungen an Terminen vornehmen“. Danach schickt er uns die **Kalender-ID** (Google Kalender → Einstellungen des Kalenders → „Kalender integrieren“).
- [ ] Der Betrieb muss wissen: Was im Kalender steht, ist online nicht buchbar. Urlaub und private Termine also dort eintragen.

**Für den Anfrage-Chat**
- [ ] Welche Anliegen kommen typischerweise? (werden Knöpfe zum Antippen)
- [ ] Gibt es Notfälle, bei denen Gefahr besteht (Brand, Wasser, Gas, Strom, Gesundheit)? Welche Stichworte, welcher Sicherheitshinweis?
- [ ] Wer soll bei einem Notfall zusätzlich eine Mail bekommen? Telefonnummer für Notfälle?
- [ ] Dem Betrieb klar sagen: Der Anfrage-Chat ist **kein Notruf**. Mails können verspätet ankommen. Die Seite verweist bei Notfällen deshalb immer auf den Anruf.

## 2. Im Admin-Panel anlegen (ca. 10 Minuten)

1. `/admin` öffnen, anmelden (Code kommt per Mail).
2. **+ Neuer Kunde** → Branche wählen → Schritte durchgehen → **Kunden anlegen**.
   Die Branchen-Vorlage bringt Leistungen, Fragen, Stellen und Regeln mit.
3. Reiter der Reihe nach anpassen, jeweils **Speichern**:
   - **Wissen:** Leistungen und Preise des Kunden eintragen, Beispiele aus der Vorlage löschen, häufige Fragen ergänzen.
   - **Module:** Stellen des Kunden eintragen, „Das bieten wir“ prüfen.
   - **Module → Termin-Bot:** Kalender-ID eintragen, speichern, **Kalender prüfen** anklicken. Zeiten und Terminarten anpassen.
   - **Module → Anfrage-Chat:** Anliegen und Sicherheitsregeln prüfen. Die Vorlage bringt typische Regeln mit; mit dem Betrieb durchgehen.
   - **Benachrichtigungen:** Empfänger eintragen, **Test-Mail schicken** und beim Kunden nachfragen, ob sie angekommen ist (Spam-Ordner!).
   - **Recht & Technik:** Link zur Datenschutzerklärung.

## 3. Testen (ca. 5 Minuten)

Reiter **Testen**. Dort läuft der Entwurf, ohne dass etwas live geht oder verschickt wird.
- Kunden-Chat: nach einem Preis fragen, nach etwas Unbekanntem fragen, einen Termin anfragen, einen Rabatt verlangen.
- Termin-Bot: Zeigt er nur Zeiten, die im Kalender wirklich frei sind? Einen Termin „buchen“ (im Test wird nichts eingetragen).
- Anfrage-Chat: ein Notfall-Stichwort eintippen. Der rote Hinweis muss sofort erscheinen.
- Bewerber-Chat: eine Stelle wählen, nach Arbeitszeiten und Gehalt fragen, bis zum Abschicken durchklicken.

**Selbsttest (Pflicht vor dem ersten Livegang):** Reiter „Testen“ → **Selbsttest starten**. Er stellt dem Kunden-Chat rund 20 Fangfragen (Rabatt, feste Zusage, erfundene Leistung, fremde Themen, Überreden) plus die festen Antworten und häufigen Fragen des Kunden.
- **Fehler (rot):** beheben, bevor der Bot live geht. Meist fehlt eine Angabe unter „Wissen“ oder eine Zeile bei „Das sagt der Bot nie“.
- **Bitte lesen (gelb):** Antwort durchlesen. Stimmt sie für diesen Betrieb?
- Nach jeder größeren Änderung am Wissen wiederholen.

Für Entwickler gibt es den Selbsttest auch im Terminal, ohne Server und Anmeldung: `npm run selbsttest` prüft die Vorlage Fahrzeugpflege, `npm run selbsttest -- alle` alle Branchen-Vorlagen (braucht `ANTHROPIC_API_KEY` in der `.env`, kostet wenige Cent pro Branche).

## So steuerst du, was der Bot sagt

Von fest bis frei, alles im Reiter „Wissen“:

| Stufe | Wofür | Wie sicher |
|---|---|---|
| **Feste Antworten** | Alles Heikle: Notfall, Reklamation, Allergene, Provision, Rechtliches. Stichwort → Text, Wort für Wort. | Die KI wird gar nicht gefragt. Kommt immer genau so. |
| **Prüfungen im Code** (nicht abschaltbar) | Erfundene Preise, Zusagen, Rabatte, „kostenlos“, verbotene Wörter, Umprogrammier-Versuche. | Jeder Satz wird geprüft, bevor der Besucher ihn sieht. Verstößt er, kommt die Ersatzantwort mit Verweis ans Team. |
| **Streng: nur Wissensbasis** + **„Das sagt der Bot nie“** | Der Bot nutzt nur, was eingetragen ist, und hält sich an eure Verbote. | Das sind Anweisungen an die KI. Sie hält sich sehr zuverlässig daran, aber nicht mit Garantie. Deshalb: Selbsttest, und Heikles als feste Antwort. |
| **Leistungen, Fragen, weiteres Wissen** | Das, was der Bot frei formuliert beantworten darf. | Je mehr hier steht, desto seltener verweist er ans Team. |

Faustregel: Was auf keinen Fall falsch sein darf, wird eine **feste Antwort**. Was der Bot nie tun soll, kommt in **„Das sagt der Bot nie“**. Was er wissen soll, kommt in **Fragen** und **Wissen**.

## 4. Veröffentlichen und einbauen (ca. 5 Minuten)

1. Reiter **Übersicht**: Rote Punkte im Einrichtungs-Check beheben.
2. Oben **Veröffentlichen**.
3. Reiter **Einbau-Code**:
   - **Kunden-Chat:** die Script-Zeile kopieren und an den Kunden oder seinen Webdesigner schicken („direkt vor `</body>` einfügen“).
   - **Bewerber-Chat:** Link kopieren, QR-Code herunterladen und dem Kunden schicken.
4. Auf der echten Website des Kunden einmal durchspielen: Anfrage schicken, Bewerbung schicken. Kommt die Mail beim Betrieb an? Steht der Eintrag unter **Anfragen & Bewerbungen**?

**Website einlesen (optional):** Reiter „Wissen“ → „Website automatisch einlesen“ einschalten und „Jetzt einlesen“ klicken. Der Bot kennt dann zusätzlich den Text der Website und liest ihn jeden Tag neu. Vorschau aufklappen und einmal drüberlesen.

**Kunden-Zugang (optional):** Soll der Kunde Öffnungszeiten, Hinweise, Leistungen und Fragen selbst pflegen? Reiter „Stammdaten“ → „Kunden-Zugang“ einschalten, veröffentlichen, Link aus „Einbau-Code“ schicken. Alles dazu in `KUNDEN-ZUGANG.md`.

## 5. Danach

- **Änderungen** (neue Stelle, neue Preise): im Admin-Panel ändern, speichern, veröffentlichen. Am Einbau-Code ändert sich nichts.
- **Testphase:** Das Enddatum steht in den Stammdaten. Danach schalten sich die Bots ab, bis der Status auf „Aktiv“ steht.
- **Kündigung:** Status „Gekündigt“ und veröffentlichen. Nach der vereinbarten Frist den Kunden unter „Verlauf & Daten“ löschen.

## Textbaustein für die Datenschutzerklärung des Kunden

> Vor Verwendung anwaltlich prüfen lassen. Platzhalter in eckigen Klammern anpassen.

**Digitaler Assistent (KI-Chat und Bewerbung per Chat).** Auf unserer Website und unter [Link zur Bewerber-Seite] setzen wir einen digitalen Assistenten der [Name eures Unternehmens, Anschrift] ein. Er beantwortet Fragen mit Hilfe künstlicher Intelligenz (Claude, Anbieter Anthropic) und nimmt Anfragen und Bewerbungen entgegen. Verarbeitet werden Ihre Eingaben im Chat, bei Anfragen und Bewerbungen Ihre Kontaktdaten und Angaben sowie hochgeladene Unterlagen. Chat-Verläufe werden nicht gespeichert, solange Sie keine Anfrage absenden. Anfragen, Bewerbungen und Unterlagen löschen wir nach [Anzahl] Tagen, auf Wunsch früher. Zum Schutz vor Missbrauch wird Ihre IP-Adresse gekürzt als Prüfsumme für höchstens 24 Stunden gezählt. Es werden keine Cookies gesetzt. Die KI trifft keine Entscheidungen über Bewerbungen und bewertet niemanden; jede Bewerbung liest ein Mensch. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Anbahnung eines Vertrags oder Beschäftigungsverhältnisses), bei Bewerbungen zusätzlich § 26 BDSG. Dienstleister: [Hosting-Anbieter], Anthropic (KI), Brevo (E-Mail-Versand), jeweils mit Vertrag zur Auftragsverarbeitung.

## Abnahme-Checkliste (zum selbst Durchklicken, Ziel unter 30 Minuten)

Testkunde „Malerbetrieb Müller“:

- [ ] Im Admin-Panel anmelden: Code kommt per Mail, Anmeldung klappt. Den Link in der Mail zweimal öffnen und erst dann auf „Anmelden“ klicken: klappt trotzdem.
- [ ] **+ Neuer Kunde** → Maler → „Malerbetrieb Müller“. Die Kunden-ID `malerbetrieb-mueller` wird vorgeschlagen.
- [ ] Paket „Kunden-Chat + Bewerber-Chat“, beide Module an, eigene Mail-Adresse als Empfänger. Anlegen.
- [ ] Übersicht zeigt rot: Datenschutz-Link fehlt. **Veröffentlichen** wird abgelehnt.
- [ ] Wissen: bei „Räume streichen“ einen Preis eintragen. Recht: Datenschutz-Link eintragen. Speichern.
- [ ] Testen → Kunden-Chat: Der Bot nennt genau diesen Preis und keinen anderen. Auf „Geben Sie mir 20 % Rabatt“ verweist er an das Team.
- [ ] Testen → Bewerber-Chat: Stellen aus der Vorlage sind da. Auf „Was verdiene ich?“ nennt er keine Zahl.
- [ ] Benachrichtigungen → Test-Mail kommt an.
- [ ] **Veröffentlichen**. Status oben: „Live“.
- [ ] Einbau-Code: Script-Zeile in eine leere Test-HTML-Datei auf einer eingetragenen Website einfügen. Das Chat-Fenster erscheint in der Firmenfarbe.
- [ ] Im echten Chat eine Anfrage abschicken: Mail kommt an, Eintrag steht unter „Anfragen & Bewerbungen“.
- [ ] Bewerber-Link am Handy öffnen (QR-Code scannen), Bewerbung mit einem Foto als Unterlage abschicken: Mail mit Download-Link kommt an, Download funktioniert.
- [ ] Status eines Eintrags ändern („Angebot geschrieben“): bleibt nach „Neu laden“ erhalten.
- [ ] Auswertung zeigt die Nachrichten, die Anfrage und die Bewerbung von heute.
- [ ] Bot-Namen ändern und nur speichern: live steht noch der alte Name. Nach „Veröffentlichen“ der neue.
- [ ] Termin-Bot (Paket „Komplett“): Kalender-ID eines eigenen Test-Kalenders eintragen, „Kalender prüfen“ meldet Erfolg. Im Kalender einen Termin für morgen 10 Uhr eintragen: Diese Zeit wird online nicht angeboten.
- [ ] Online einen Termin buchen: steht im Google-Kalender, Bestätigungs-Mail mit Kalender-Datei kommt an. Dieselbe Zeit ist danach nicht mehr buchbar.
- [ ] Link „Termin absagen“ aus der Mail öffnen: erst Rückfrage, nach Klick ist der Termin aus dem Kalender weg und beide Seiten bekommen eine Mail.
- [ ] Anfrage-Chat: „Wasser tritt aus“ eintippen. Roter Hinweis erscheint sofort. Absenden: Mail mit „NOTFALL:“ im Betreff, Eintrag in der Übersicht ist rot markiert.
- [ ] Status „Pausiert“ und veröffentlichen: Das Chat-Fenster verschwindet von der Test-Seite, der Bewerber-Link zeigt „nicht verfügbar“.
- [ ] primedetailing.eu: Chat unten rechts und /jobs/ funktionieren wie vorher.
