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
- [ ] Was darf der Bot auf keinen Fall sagen oder versprechen?
- [ ] Wer baut die eine Zeile Code in die Website ein? (Kunde, sein Webdesigner oder wir)

## 2. Im Admin-Panel anlegen (ca. 10 Minuten)

1. `/admin` öffnen, anmelden (Code kommt per Mail).
2. **+ Neuer Kunde** → Branche wählen → Schritte durchgehen → **Kunden anlegen**.
   Die Branchen-Vorlage bringt Leistungen, Fragen, Stellen und Regeln mit.
3. Reiter der Reihe nach anpassen, jeweils **Speichern**:
   - **Wissen:** Leistungen und Preise des Kunden eintragen, Beispiele aus der Vorlage löschen, häufige Fragen ergänzen.
   - **Module:** Stellen des Kunden eintragen, „Das bieten wir“ prüfen.
   - **Benachrichtigungen:** Empfänger eintragen, **Test-Mail schicken** und beim Kunden nachfragen, ob sie angekommen ist (Spam-Ordner!).
   - **Recht & Technik:** Link zur Datenschutzerklärung.

## 3. Testen (ca. 5 Minuten)

Reiter **Testen**. Dort läuft der Entwurf, ohne dass etwas live geht oder verschickt wird.
- Kunden-Chat: nach einem Preis fragen, nach etwas Unbekanntem fragen, einen Termin anfragen, einen Rabatt verlangen.
- Bewerber-Chat: eine Stelle wählen, nach Arbeitszeiten und Gehalt fragen, bis zum Abschicken durchklicken.

## 4. Veröffentlichen und einbauen (ca. 5 Minuten)

1. Reiter **Übersicht**: Rote Punkte im Einrichtungs-Check beheben.
2. Oben **Veröffentlichen**.
3. Reiter **Einbau-Code**:
   - **Kunden-Chat:** die Script-Zeile kopieren und an den Kunden oder seinen Webdesigner schicken („direkt vor `</body>` einfügen“).
   - **Bewerber-Chat:** Link kopieren, QR-Code herunterladen und dem Kunden schicken.
4. Auf der echten Website des Kunden einmal durchspielen: Anfrage schicken, Bewerbung schicken. Kommt die Mail beim Betrieb an? Steht der Eintrag unter **Anfragen & Bewerbungen**?

## 5. Danach

- **Änderungen** (neue Stelle, neue Preise): im Admin-Panel ändern, speichern, veröffentlichen. Am Einbau-Code ändert sich nichts.
- **Testphase:** Das Enddatum steht in den Stammdaten. Danach schalten sich die Bots ab, bis der Status auf „Aktiv“ steht.
- **Kündigung:** Status „Gekündigt“ und veröffentlichen. Nach der vereinbarten Frist den Kunden unter „Verlauf & Daten“ löschen.

## Textbaustein für die Datenschutzerklärung des Kunden

> Vor Verwendung anwaltlich prüfen lassen. Platzhalter in eckigen Klammern anpassen.

**Digitaler Assistent (KI-Chat und Bewerbung per Chat).** Auf unserer Website und unter [Link zur Bewerber-Seite] setzen wir einen digitalen Assistenten der [Name eures Unternehmens, Anschrift] ein. Er beantwortet Fragen mit Hilfe künstlicher Intelligenz (Claude, Anbieter Anthropic) und nimmt Anfragen und Bewerbungen entgegen. Verarbeitet werden Ihre Eingaben im Chat, bei Anfragen und Bewerbungen Ihre Kontaktdaten und Angaben sowie hochgeladene Unterlagen. Chat-Verläufe werden nicht gespeichert, solange Sie keine Anfrage absenden. Anfragen, Bewerbungen und Unterlagen löschen wir nach [Anzahl] Tagen, auf Wunsch früher. Zum Schutz vor Missbrauch wird Ihre IP-Adresse gekürzt als Prüfsumme für höchstens 24 Stunden gezählt. Es werden keine Cookies gesetzt. Die KI trifft keine Entscheidungen über Bewerbungen und bewertet niemanden; jede Bewerbung liest ein Mensch. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Anbahnung eines Vertrags oder Beschäftigungsverhältnisses), bei Bewerbungen zusätzlich § 26 BDSG. Dienstleister: [Hosting-Anbieter], Anthropic (KI), Brevo (E-Mail-Versand), jeweils mit Vertrag zur Auftragsverarbeitung.

## Abnahme-Checkliste (zum selbst Durchklicken, Ziel unter 30 Minuten)

Testkunde „Malerbetrieb Müller“ mit Kunden-Chat und Bewerber-Chat:

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
- [ ] Status „Pausiert“ und veröffentlichen: Das Chat-Fenster verschwindet von der Test-Seite, der Bewerber-Link zeigt „nicht verfügbar“.
- [ ] primedetailing.eu: Chat unten rechts und /jobs/ funktionieren wie vorher.
