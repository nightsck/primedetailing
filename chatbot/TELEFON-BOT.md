# Telefon-Bot (Sprach-KI mit ElevenLabs)

Ein Sprach-Agent nimmt Anrufe an, nennt freie Termine aus dem echten Kalender, bucht sie und nimmt Rückrufwünsche auf. Die Stimme und das Gespräch macht **ElevenLabs Agents**. Termine, Öffnungszeiten und Mails kommen von **unserem Worker** (`src/stimme.ts`), mit demselben Kalender und denselben Bestätigungsmails wie der Termin-Bot auf der Website.

Kosten zum Start: 0 €. Der Gratisplan von ElevenLabs hat 15 Gesprächsminuten pro Monat. Getestet wird zuerst im Browser, ohne Telefonnummer. Eine echte Nummer über sipgate kommt erst dazu, wenn ein Kunde zahlt.

## 1. Worker vorbereiten (einmalig, Cloudflare)

Worker `primedetailing-chat` → Einstellungen → Variablen:

| Name | Art | Wert |
|---|---|---|
| `STIMME_SCHLUESSEL` | Secret | langes Zufallswort, mind. 16 Zeichen (z. B. aus einem Passwort-Generator, 40 Zeichen) |
| `STIMME_BETRIEB` | Variable | `fahrzeug`, `maler` oder `elektro` (welcher Beispielbetrieb), Standard `fahrzeug` |

Kalender (`GOOGLE_SA_JSON`, `TERMIN_KALENDER`) und Mails (Brevo) sind vom Termin-Bot schon eingerichtet. Ohne `STIMME_SCHLUESSEL` sind die Telefon-Werkzeuge aus.

## 2. Agent in ElevenLabs anlegen

ElevenLabs → Agenten → **Neuer Agent** → „Leerer Agent“.

- **Name:** Telefon-Bot Demo (Fahrzeugpflege)
- **Sprache:** Deutsch
- **Stimme:** eine ruhige deutsche Stimme (z. B. in der Stimmen-Bibliothek nach „German“ filtern, männlich oder weiblich, „conversational“)
- **KI-Modell:** ein schnelles Modell (Standard lassen oder Claude Haiku, falls angeboten)
- **Erste Nachricht:**

  > Guten Tag, Muster Fahrzeugpflege, hier ist der digitale Assistent. Ich kann Ihnen einen Termin geben oder einen Rückruf ausmachen. Worum geht es?

- **System-Prompt:** den Text aus Abschnitt 4 einfügen.

## 3. Werkzeuge (Tools) anlegen

Im Agenten → **Tools** → „Tool hinzufügen“ → **Webhook**. Viermal, jeweils:

- **Methode:** POST
- **Header:** `x-stimme-schluessel` = derselbe Wert wie `STIMME_SCHLUESSEL` (in ElevenLabs als **Secret** anlegen)
- **Body-Parameter** wie unten (Typ, Beschreibung, Pflichtfeld)

Basis-Adresse: `https://primedetailing-chat.tom-schindler999.workers.dev`

### `betrieb_info`
- URL: `/api/stimme/info`
- Beschreibung: „Holt Name, Öffnungszeiten, Adresse und die buchbaren Terminarten des Betriebs sowie das heutige Datum. Zu Beginn jedes Gesprächs einmal aufrufen.“
- Parameter: keine

### `freie_zeiten`
- URL: `/api/stimme/zeiten`
- Beschreibung: „Sucht freie Termine im Kalender. Immer aufrufen, bevor du eine Uhrzeit nennst. Nenne dem Anrufer das Feld ‚sagen‘.“
- Parameter:
  - `termin` (string, Pflicht): ID der Terminart aus `betrieb_info`, z. B. `aussen`
  - `wunsch` (string): Wunsch des Anrufers in seinen Worten, z. B. „Donnerstag nachmittag“, „morgen gegen 10“
  - `datum` (string): konkretes Datum JJJJ-MM-TT, wenn bekannt

### `termin_buchen`
- URL: `/api/stimme/buchen`
- Beschreibung: „Trägt den Termin verbindlich ein. Nur aufrufen, wenn der Anrufer Tag und Uhrzeit bestätigt und der Speicherung zugestimmt hat.“
- Parameter:
  - `termin` (string, Pflicht), `datum` (string JJJJ-MM-TT, Pflicht), `zeit` (string HH:MM, Pflicht)
  - `name` (string, Pflicht), `telefon` (string, Pflicht), `email` (string)
  - `strasse`, `plz`, `ort` (string): nur bei Terminen beim Kunden vor Ort
  - `anliegen` (string): worum es geht, z. B. Fahrzeug und Zustand
  - `einwilligung` (boolean, Pflicht): true nur, wenn der Anrufer der Speicherung zugestimmt hat

### `rueckruf`
- URL: `/api/stimme/rueckruf`
- Beschreibung: „Nimmt einen Rückrufwunsch auf und schickt ihn per Mail an den Betrieb. Für alles, was du nicht selbst lösen kannst.“
- Parameter: `name` (string), `telefon` (string, Pflicht), `anliegen` (string, Pflicht), `wann` (string: wann erreichbar), `dringend` (boolean)

Jede Antwort enthält ein Feld **`sagen`**: ein fertiger Satz für den Anrufer.

## 4. System-Prompt (zum Einfügen)

```
Du bist der telefonische Assistent eines Handwerks- bzw. Servicebetriebs. Du sprichst Deutsch, siezt, bist freundlich, ruhig und kurz. Ein bis zwei Sätze pro Antwort, eine Frage auf einmal. Keine Aufzählungen, keine Sternchen, keine Emojis: alles, was du sagst, wird vorgelesen.

Ablauf:
1. Rufe zu Beginn einmal betrieb_info auf. Von dort kennst du Betrieb, Öffnungszeiten, Adresse, Terminarten und das heutige Datum.
2. Finde heraus, was der Anrufer möchte. Ordne es einer Terminart zu. Wenn unklar, frag kurz nach.
3. Für Termine: Rufe freie_zeiten auf (mit seinem Wunsch in seinen Worten). Nenne nur Zeiten aus der Antwort, nie selbst ausgedachte. Lies das Feld "sagen" sinngemäß vor.
4. Wenn er eine Zeit wählt: Frag nach Name und Rückrufnummer. Bei Terminen vor Ort auch nach der Adresse. Frag nach dem Anliegen (z. B. Fahrzeug, Zustand), wenn es noch fehlt. Eine E-Mail-Adresse nur, wenn er eine Bestätigung möchte; lass sie dir buchstabieren.
5. Fasse Tag, Uhrzeit und Terminart in einem Satz zusammen und frag: „Darf ich Ihren Namen und Ihre Nummer für den Termin speichern?“ Erst nach einem klaren Ja termin_buchen aufrufen, mit einwilligung = true.
6. Bestätige mit dem Feld "sagen" aus der Antwort und verabschiede dich.

Wenn etwas nicht klappt, der Anrufer einen Menschen sprechen will, es um Preise im Einzelfall, Reklamationen oder einen Notfall geht: Nimm mit rueckruf Name, Nummer und Anliegen auf (bei Notfall dringend = true) und sag, dass sich jemand meldet.

Regeln:
- Du bist eine KI. Wenn jemand fragt, sag das ehrlich.
- Erfinde keine Preise, Zeiten oder Zusagen. Was du nicht weißt, gibst du per Rückruf weiter.
- Wiederhole Telefonnummern zur Kontrolle in Zweiergruppen.
- Uhrzeiten sprichst du natürlich aus: „halb elf“, „vierzehn Uhr“.
- Wenn der Anrufer keinen Kontakt mehr wünscht, respektiere das und beende das Gespräch höflich.
- Bevor du ein Werkzeug aufrufst, sag höchstens einmal kurz, dass du nachschaust. Wiederhole diesen Satz nicht.
- Auch vor rueckruf: Nummer in Zweiergruppen wiederholen und bestätigen lassen, erst dann rueckruf aufrufen.
```

## 5. Testen

1. Im Agenten oben rechts **„Testen“** → mit dem Mikrofon sprechen („Ich hätte gern nächste Woche eine Innenreinigung“).
2. Der Termin erscheint im Kalender „Termine Demo“ mit dem Vermerk „gebucht über den Telefon-Bot“, die Bestätigung kommt per Mail (wenn eine Adresse genannt wurde).
3. Unter Konversationen in ElevenLabs steht jedes Gespräch mit Mitschrift.

## 6. Später: echte Telefonnummer (sipgate)

Erst wenn ein Kunde zahlt. In ElevenLabs → Telefonnummern → **SIP-Trunk** importieren; bei sipgate einen SIP-Trunk (sipgate trunking) mit Rufnummer anlegen und die Zugangsdaten dort eintragen. Der Missed-Call-Bot kann dann auf diese Nummer umleiten: Wer den Chef nicht erreicht, landet beim Telefon-Bot statt bei der SMS.

## Datenschutz (vor dem ersten echten Kunden klären)

- Auftragsverarbeitungsvertrag (AVV) mit ElevenLabs abschließen und prüfen, wo Gesprächsdaten gespeichert werden; Aufbewahrung der Mitschriften in ElevenLabs begrenzen.
- Hinweis zu Beginn des Gesprächs, dass ein digitaler Assistent spricht (steht in der ersten Nachricht).
- Datenschutzerklärung des Kunden-Betriebs um den Telefon-Assistenten ergänzen.
