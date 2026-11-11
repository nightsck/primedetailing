# Kunden-Konfiguration: alle Felder

Diese Datei wird automatisch erzeugt (`npm run doku` in `chatbot/`). Nicht von Hand ändern.
Quelle ist `chatbot/src/kunde/schema.ts`. Dieselben Texte stehen im Admin-Panel unter jedem Feld.

Felder ohne Erklärung (z. B. Straße, PLZ, Telefon) sind selbsterklärend und hier nicht aufgeführt.
`[]` bedeutet: Davon kann es mehrere geben (eine Liste).

## Pakete

| Paket | Enthaltene Module |
|---|---|
| Bewerber-Chat | Bewerber-Chat |
| Kunden-Chat + Bewerber-Chat | Kunden-Chat, Bewerber-Chat |
| Komplett | Kunden-Chat, Bewerber-Chat, Termin-Bot, Anfrage-Chat, Anruf-Retter (kommt bald) |

## Branchen-Vorlagen

`handwerk` Handwerk allgemein · `maler` Maler · `elektro` Elektro · `fahrzeugpflege` Fahrzeugpflege · `autohaus` Autohaus / Werkstatt · `gastro` Gastronomie · `friseur` Friseur · `arztpraxis` Arztpraxis · `makler` Immobilienmakler

## Vertrag

| Feld | Wofür ist das? |
|---|---|
| `id` | Kunden-ID. Steht in allen Links dieses Kunden und kann später nicht mehr geändert werden. |
| `status` | Test = Probezeit. Aktiv = zahlender Kunde. Pausiert und Gekündigt schalten alle Bots des Kunden ab. |
| `paket` | Tarif. Bestimmt, welche Module eingeschaltet werden dürfen. |
| `testBis` | Ende der Testphase (JJJJ-MM-TT). Danach sind die Bots aus, bis der Status auf Aktiv steht. Leer = kein Ende. |
| `notiz` | Interne Notiz, nur im Admin-Panel sichtbar. |

## Stammdaten

| Feld | Wofür ist das? |
|---|---|
| `stammdaten.branche` | Branchen-Vorlage, mit der der Kunde angelegt wurde. |
| `stammdaten.brancheText` | So beschreibt der Bot den Betrieb, z. B. „Malerbetrieb“ oder „mobile Fahrzeugaufbereitung“. |
| `stammdaten.whatsapp` | WhatsApp-Nummer nur aus Ziffern mit 49 vorn. Leer = kein WhatsApp-Knopf. |
| `stammdaten.email` | Allgemeine Kontakt-Adresse des Betriebs. Steht im Chat als Kontakt. |
| `stammdaten.website` | Website des Betriebs. Von dort darf das Chat-Fenster geladen werden. |
| `stammdaten.oeffnungszeiten` | z. B. Mo–Fr 7–16 Uhr. |
| `stammdaten.einsatzgebiet` | z. B. „Umkreis von 30 km um Villingen“. |
| `stammdaten.ansprechpartner` | Wer im Betrieb zuständig ist. Der Bot sagt z. B. „Termine bestätigt Herr Müller persönlich“. |

## Aussehen

| Feld | Wofür ist das? |
|---|---|
| `aussehen.botName` | Name des Bots im Chat-Fenster. |
| `aussehen.primaerfarbe` | Hauptfarbe des Chat-Fensters (Kopfzeile, Knöpfe). Am besten die Firmenfarbe. |
| `aussehen.akzentfarbe` | Zweite Farbe für Hervorhebungen. |
| `aussehen.position` | Ecke, in der der Chat-Knopf sitzt. |
| `aussehen.knopfText` | Text auf dem Chat-Knopf. |
| `aussehen.begruessung` | Erste Nachricht des Bots. Leer = Standardtext mit Bot-Name und Firmenname. |
| `aussehen.logoBuchstaben` | 1–3 Buchstaben als Logo auf der Bewerber-Seite, z. B. MM. Leer = Anfangsbuchstaben der Firma. |

## Ton

| Feld | Wofür ist das? |
|---|---|
| `ton.anrede` | Wie der Kunden-Chat die Besucher anspricht. Der Bewerber-Chat duzt immer. |
| `ton.stil` | Ton in Stichworten. |

## Wissen

| Feld | Wofür ist das? |
|---|---|
| `wissen.leistungen` | Was der Betrieb anbietet. Einzige Preisquelle des Bots. |
| `wissen.leistungen[].kategorie` | Überschrift, unter der die Leistung einsortiert wird, z. B. „Innenanstrich“. |
| `wissen.leistungen[].preis` | Preis in Euro. Leer lassen = „auf Anfrage“. Der Bot nennt nur Preise, die hier stehen. |
| `wissen.leistungen[].ab` | Ankreuzen, wenn es ein „ab“-Preis ist (Richtpreis). |
| `wissen.faq` | Häufige Fragen mit der richtigen Antwort. |
| `wissen.freitext` | Alles Weitere, was der Bot wissen darf: Ablauf, Zahlung, Anfahrt, Besonderheiten. |
| `wissen.nieSagen` | Was der Bot nie sagen oder versprechen darf, z. B. „Keine Aussagen zu Lieferzeiten“. |
| `wissen.erlaubtePhrasen` | Ausnahmen vom Zusage-Filter. Der Bot darf z. B. nie „kostenlos“ sagen – außer in den Formulierungen hier, etwa „Anfahrt kostenlos“. |

## Modul Kunden-Chat

| Feld | Wofür ist das? |
|---|---|
| `module.kundenChat.fotoCheck` | Besucher können ein Foto schicken, der Bot schätzt ein und empfiehlt eine Leistung. |
| `module.kundenChat.fotoWorauf` | Worauf der Bot auf Fotos achten soll. |
| `module.kundenChat.startKnoepfe` | Knöpfe unter der Begrüßung, z. B. die wichtigsten Leistungen. |
| `module.kundenChat.objektLabel` | Beschriftung des Feldes im Anfrageformular, z. B. „Fahrzeug“ oder „Objekt“. |

## Modul Bewerber-Chat

| Feld | Wofür ist das? |
|---|---|
| `module.bewerberChat.bietet` | „Das bieten wir“ in ein, zwei Sätzen. Der Bot antwortet nur damit – es muss stimmen. |
| `module.bewerberChat.ablauf` | Was nach der Bewerbung passiert. |
| `module.bewerberChat.stellen[].id` | Kurzname der Stelle für Links, z. B. geselle. Wird im Link ?stelle=geselle benutzt. |
| `module.bewerberChat.stellen[].name` | Stellenbezeichnung, z. B. „Maler und Lackierer Geselle (m/w/d)“. |
| `module.bewerberChat.stellen[].umfang` | z. B. Vollzeit, Minijob, 3 Jahre Ausbildung. |
| `module.bewerberChat.stellen[].text` | Zwei, drei Sätze: Aufgaben und was man mitbringen sollte. |
| `module.bewerberChat.stellen[].fragen` | Welche kurzen Fragen der Chat stellt (zum Antippen). |
| `module.bewerberChat.initiativ` | Zusätzlich „Initiativbewerbung“ anbieten. |
| `module.bewerberChat.maxDateiMb` | Größte erlaubte Datei in MB (PDF, Word, Fotos). |

## Modul Termin-Bot (kommt bald)

| Feld | Wofür ist das? |
|---|---|
| `module.terminBot.kalenderId` | Kalender-ID aus Google Kalender (endet meist auf @group.calendar.google.com). Der Kunde gibt diesen Kalender für unser Dienstkonto frei. |
| `module.terminBot.zeiten` | Wann Termine möglich sind, je Wochentag. Schreibweise: 8-12, 13-17 oder 7:30-16. Leer = an dem Tag keine Termine. |
| `module.terminBot.rasterMin` | Abstand der angebotenen Startzeiten in Minuten (30 = 8:00, 8:30, 9:00 …). |
| `module.terminBot.pufferMin` | Pause nach jedem Termin in Minuten. |
| `module.terminBot.fahrtMin` | Fahrzeit vor und nach Terminen beim Kunden. |
| `module.terminBot.vorlaufStunden` | So viele Stunden vorher muss gebucht werden. |
| `module.terminBot.tageVoraus` | So weit im Voraus kann gebucht werden. |

## Modul Anfrage-Chat (kommt bald)

| Feld | Wofür ist das? |
|---|---|
| `module.anfrageChat.kategorien` | Anliegen zum Antippen, z. B. „Störung“, „Neubau“. |
| `module.anfrageChat.sicherheitsregeln` | Feste Regeln im Code. Sie gelten immer und können von der KI nicht überstimmt werden. |
| `module.anfrageChat.sicherheitsregeln[].stichworte` | Wörter, bei denen die Regel greift, z. B. Brandgeruch, Funken. |
| `module.anfrageChat.sicherheitsregeln[].antwort` | Fester Hinweis, den der Kunde sofort sieht (ohne KI). |

## Modul Anruf-Retter (kommt bald)

| Feld | Wofür ist das? |
|---|---|
| `module.anrufRetter.aktiv` | Noch nicht verfügbar. Bleibt aus, bis die Telefon-Anbindung fertig ist. |

## Benachrichtigungen

| Feld | Wofür ist das? |
|---|---|
| `benachrichtigungen.anfragen` | Wer Anfragen aus dem Kunden-Chat bekommt. Leer = Kontakt-Adresse aus den Stammdaten. |
| `benachrichtigungen.bewerbungen` | Wer Bewerbungen bekommt. |
| `benachrichtigungen.termine` | Wer neue und abgesagte Termine bekommt. |
| `benachrichtigungen.notfall` | Zusätzliche Empfänger bei Dringlichkeit „Notfall“. |

## Rechtliches

| Feld | Wofür ist das? |
|---|---|
| `rechtliches.datenschutzUrl` | Link zur Datenschutzerklärung des Kunden. Pflicht, bevor ein Bot live geht. |
| `rechtliches.aufbewahrungTage` | Nach so vielen Tagen werden Anfragen, Bewerbungen und Unterlagen automatisch gelöscht. |
| `rechtliches.poweredBy` | Hinweis „Powered by Claude (Anthropic)“ im Chat-Fenster zeigen. |

## Technik

| Feld | Wofür ist das? |
|---|---|
| `technik.erlaubteWebsites` | Weitere Adressen, auf denen das Chat-Fenster laufen darf (die Website aus den Stammdaten ist immer erlaubt). |
| `technik.tagesbudget` | Höchstens so viele Chat-Nachrichten pro Tag für diesen Kunden. Schützt vor Spam. |
| `technik.monatsbudget` | Höchstens so viele Chat-Nachrichten pro Monat. Kostenbremse: 1.000 Nachrichten kosten grob 1–3 €. |
