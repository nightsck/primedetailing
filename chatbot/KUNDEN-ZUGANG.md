# Kunden-Zugang: Der Kunde ändert Kleinigkeiten selbst

Jeder Kunde kann eine eigene kleine Seite bekommen: `https://<server>/k/<kunden-id>/verwalten`.
Sie läuft im selben Worker wie die Bots. Es kommt kein neuer Dienst und kein neuer Preis dazu.

## Einschalten (einmal pro Kunde, 1 Minute)

1. Admin-Panel → Kunde öffnen → Reiter **Stammdaten** → Karte **Kunden-Zugang**.
2. Haken bei „Der Kunde darf Kleinigkeiten selbst ändern“.
3. Bei „Wer darf sich anmelden?“ die E-Mail-Adressen des Kunden eintragen, eine pro Zeile. Leer = die Kontakt-Adresse aus den Stammdaten.
4. **Speichern** und **Veröffentlichen**.
5. Reiter **Einbau-Code** → den Link unter „Kunden-Zugang“ kopieren und dem Kunden schicken.

## Was der Kunde ändern kann

| Bereich | Felder | Wann live? |
|---|---|---|
| Öffnungszeiten und Hinweis | Öffnungszeiten, aktueller Hinweis (z. B. Betriebsferien) | sofort |
| Leistungen | Name, Kategorie, Beschreibung, hinzufügen, entfernen | sofort |
| **Preise** | Preis und „ab“-Haken | **erst nach deiner Freigabe** |
| Häufige Fragen | Frage und Antwort | sofort |
| Bezahlung, Anfahrt, Termine | Bezahlung, Anfahrt, Wartezeit, Begrüßung | sofort |
| Stellen (nur mit Bewerber-Chat) | Arbeitszeiten, „Das bieten wir“, Stellen | sofort |

Gesperrt bleibt alles andere: feste Antworten, Verbote, verbotene Wörter, Module, Paket, Status, Farben, Benachrichtigungen, Limits, Technik. Diese Felder kommen in der Seite des Kunden gar nicht vor.

## Was bei einer Änderung passiert

1. Die Eingabe läuft durch dieselben Prüfregeln wie im Admin-Panel.
2. Die neue Fassung geht live und steht im Verlauf mit „Kunde: adresse@…“.
3. Du bekommst eine Mail mit jeder einzelnen Änderung. Der Kunde bekommt zur Kontrolle dieselbe Liste.
4. Preise: Der Bot nennt weiter den bisherigen Preis. In der Übersicht des Kunden erscheint oben eine gelbe Karte mit „Übernehmen“ und „Ablehnen“. Der Kunde sieht bei sich „Preis wartet auf Freigabe“.

Nicht einverstanden? Reiter **Verlauf & Daten** → die Fassung davor „Zurückholen“ → „Veröffentlichen“.

## Gut zu wissen

- **Umbenennen behält den Preis.** Benennt der Kunde eine Leistung mit Preis um, gilt der Preis weiter. Die Mail an dich markiert das mit „ACHTUNG“.
- **Dein Entwurf bleibt.** Hast du gerade einen unveröffentlichten Entwurf, geht er nicht versehentlich live. Er bekommt nur die Felder dazu, die der Kunde geändert hat.
- **Gleichzeitig offen?** Speicherst du im Admin-Panel, nachdem der Kunde etwas geändert hat, kommt ein Hinweis statt eines stillen Überschreibens. Seite neu laden, dann weiter.
- **Ohne Mailversand** steht der Code im Server-Log (nur zum Testen gedacht).
- **Anmeldung**: Code per E-Mail, 10 Minuten gültig, 12 Stunden angemeldet. Einzelheiten in `SICHERHEIT.md`.

## Text für den Kunden (zum Kopieren)

> Guten Tag,
>
> ab sofort können Sie Kleinigkeiten an Ihrem Website-Assistenten selbst ändern, zum Beispiel Öffnungszeiten, Betriebsferien, Leistungen und häufige Fragen:
>
> [Link einfügen]
>
> Anmelden: Ihre E-Mail-Adresse eintragen, Sie bekommen einen Code per E-Mail. Ein Passwort brauchen Sie nicht.
> Änderungen sind sofort online. Neue Preise prüfen wir kurz und schalten sie dann frei.
> Wichtig: Wir fragen Sie nie nach diesem Code, weder am Telefon noch per E-Mail.
