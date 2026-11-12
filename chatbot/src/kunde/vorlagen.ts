// Branchen-Vorlagen: sinnvolle Startwerte je Branche. Ein neuer Kunde wird mit
// einer Vorlage angelegt und danach nur noch angepasst. Preise sind bewusst
// leer („auf Anfrage“) – echte Preise trägt man beim Kunden ein.
//
// Neue Branche: unten einen Eintrag ergänzen, dazu einen bei MEHR (häufige Fragen, feste Antworten).
// Die Tests prüfen jede Vorlage automatisch (gültig, Stichworte eindeutig, Antworten bestehen die Prüfregeln).
import type { Kunde } from "./schema.ts";

type Teil<T> = { [K in keyof T]?: T[K] extends object ? Teil<T[K]> : T[K] };
export type Vorlage = { name: string; werte: Teil<Kunde> };

const L = (kategorie: string, name: string, beschreibung = "") => ({ kategorie, name, preis: null, ab: false, beschreibung });
const F = (frage: string, antwort: string) => ({ frage, antwort });
const S = (id: string, name: string, umfang: string, text: string, fragen: any = ["erfahrung", "fuehrerschein", "start"]) => ({ id, name, umfang, text, fragen });
const T = (id: string, name: string, kurz: string, dauerMin: number, ort: "betrieb" | "kunde" | "telefon" = "betrieb") => ({ id, name, kurz, dauerMin, ort });
const R = (stichworte: string[], antwort: string, dringlichkeit: "notfall" | "dringend" = "notfall") => ({ stichworte, antwort, dringlichkeit });

const FEUER = R(["Brand", "Brandgeruch", "Rauch", "Funken", "Schmorgeruch", "Kabel liegt frei"],
  "Bitte zuerst die Sicherung oder den Hauptschalter ausschalten und die Stelle nicht anfassen. Bei Feuer oder Rauch sofort 112 anrufen.");
const WASSER = R(["Wasser tritt aus", "Wasser läuft", "Rohrbruch", "Überschwemmung"],
  "Wenn möglich zuerst den Haupthahn fürs Wasser zudrehen. Ist Wasser in der Nähe von Steckdosen oder Leitungen, auch die Sicherung ausschalten.");
const GAS = R(["Gasgeruch", "riecht nach Gas"], "Bei Gasgeruch: Fenster öffnen, keine Schalter und kein Feuer benutzen, Haus verlassen und von draußen den Notdienst des Gasversorgers oder 112 anrufen.");
const NIE_STANDARD = ["Keine Termine zusagen oder bestätigen.", "Keine Rabatte oder Sonderpreise nennen."];

export const VORLAGEN: Record<string, Vorlage> = {
  handwerk: { name: "Handwerk allgemein", werte: {
    stammdaten: { brancheText: "Handwerksbetrieb", oeffnungszeiten: "Mo–Fr 7–16 Uhr" },
    wissen: { leistungen: [L("Leistungen", "Reparatur"), L("Leistungen", "Neubau und Umbau"), L("Leistungen", "Wartung")],
      faq: [F("Kommen Sie zu mir nach Hause?", "Ja, wir kommen zur Besichtigung vorbei und machen danach ein Angebot."), F("Was kostet ein Angebot?", "Das Angebot ist unverbindlich. Details klärt das Team persönlich.")],
      nieSagen: NIE_STANDARD },
    module: { kundenChat: { startKnoepfe: ["Angebot anfragen", "Reparatur", "Frage stellen"], objektLabel: "Worum geht es?", objektPlatzhalter: "z. B. Bad im Erdgeschoss" },
      bewerberChat: { arbeitszeiten: "Mo–Fr 7–16 Uhr", bietet: "Arbeitskleidung und Werkzeug werden gestellt, feste Arbeitszeiten, Einarbeitung durch erfahrene Kollegen.",
        stellen: [S("geselle", "Geselle (m/w/d)", "Vollzeit", "Arbeiten bei Privat- und Gewerbekunden in der Region. Führerschein Klasse B nötig."), S("helfer", "Helfer (m/w/d)", "Vollzeit oder Teilzeit", "Vorbereiten, Zuarbeiten, Material tragen. Quereinsteiger willkommen."), S("ausbildung", "Ausbildung (m/w/d)", "3 Jahre, Start im September", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("besichtigung", "Besichtigung vor Ort", "Wir schauen uns alles an, ca. 45 Minuten", 45, "kunde"), T("rueckruf", "Rückruf", "Wir rufen zur vereinbarten Zeit an, ca. 15 Minuten", 15, "telefon")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Reparatur", "Neubau oder Umbau", "Wartung", "Etwas anderes"], sicherheitsregeln: [FEUER, WASSER] } },
  } },
  maler: { name: "Maler", werte: {
    stammdaten: { brancheText: "Malerbetrieb", oeffnungszeiten: "Mo–Fr 7–16 Uhr" },
    wissen: { leistungen: [L("Innen", "Räume streichen"), L("Innen", "Tapezieren"), L("Außen", "Fassade streichen"), L("Lackieren", "Türen, Fenster, Heizkörper lackieren"), L("Sanierung", "Schimmel und Wasserschaden")],
      faq: [F("Muss ich die Möbel selbst wegräumen?", "Kleine Möbel bitte selbst wegräumen. Große Möbel rücken wir in die Raummitte und decken alles ab."), F("Wie lange dauert ein Zimmer?", "Das hängt von Größe und Zustand ab. Nach der Besichtigung nennt das Team die Dauer.")],
      nieSagen: NIE_STANDARD },
    module: { kundenChat: { startKnoepfe: ["Räume streichen", "Fassade", "Tapezieren", "Frage stellen"], objektLabel: "Objekt", objektPlatzhalter: "z. B. Wohnung, 3 Zimmer" },
      bewerberChat: { arbeitszeiten: "Mo–Fr 7–16 Uhr", bietet: "Firmenwagen für die Fahrt zur Baustelle, Arbeitskleidung, Weiterbildung zum Vorarbeiter möglich.",
        stellen: [S("geselle", "Maler und Lackierer Geselle (m/w/d)", "Vollzeit", "Innen- und Fassadenarbeiten bei Privat- und Gewerbekunden in der Region. Führerschein Klasse B nötig."), S("helfer", "Helfer auf der Baustelle (m/w/d)", "Vollzeit oder Teilzeit", "Abdecken, Abkleben, Vorbereiten, Material tragen. Quereinsteiger willkommen."), S("ausbildung", "Ausbildung Maler und Lackierer (m/w/d)", "3 Jahre, Start im September", "Praktikum in den Ferien möglich.", ["start"])] },
      terminBot: { termine: [T("besichtigung", "Besichtigung vor Ort", "Wir schauen uns alles an und messen auf, ca. 45 Minuten", 45, "kunde"), T("farbberatung", "Farbberatung", "Farben und Muster ansehen, ca. 45 Minuten", 45), T("rueckruf", "Rückruf zur Beratung", "Wir rufen zur vereinbarten Zeit an, ca. 15 Minuten", 15, "telefon")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Räume streichen", "Fassade", "Tapezieren", "Lackieren", "Schimmel oder Wasserschaden", "Etwas anderes"], sicherheitsregeln: [WASSER] } },
  } },
  elektro: { name: "Elektro", werte: {
    stammdaten: { brancheText: "Elektrobetrieb", oeffnungszeiten: "Mo–Do 7–16 Uhr, Fr 7–12 Uhr" },
    wissen: { leistungen: [L("Kundendienst", "Reparatur und Störungssuche"), L("Installation", "Steckdosen, Licht, Leitungen"), L("E-Mobilität", "Wallbox"), L("Prüfung", "E-Check"), L("Projekte", "Sanierung und Neubau")],
      faq: [F("Kann ich eine Wallbox an jede Hausinstallation anschließen?", "Das prüft das Team vor Ort beim Wallbox-Check."), F("Was tun, wenn die Sicherung immer wieder rausfliegt?", "Geräte ausstecken und die Sicherung nicht dauernd wieder einschalten. Das Team schaut sich das an.")],
      nieSagen: [...NIE_STANDARD, "Keine Anleitungen zum Selbstreparieren an elektrischen Anlagen."] },
    module: { kundenChat: { startKnoepfe: ["Störung", "Wallbox", "Neue Installation", "Frage stellen"], objektLabel: "Objekt", objektPlatzhalter: "z. B. Einfamilienhaus, Baujahr 1985" },
      bewerberChat: { arbeitszeiten: "Mo–Do 7–16 Uhr, Fr 7–12 Uhr", bietet: "Eigenes Werkzeug und Firmenwagen, Schulungen bei Herstellern, Freitag ab Mittag frei.",
        stellen: [S("elektroniker", "Elektroniker für Energie- und Gebäudetechnik (m/w/d)", "Vollzeit", "Installation in Neubau und Bestand, Wartung, Kundendienst. Führerschein Klasse B nötig."), S("buero", "Bürokraft (m/w/d)", "Teilzeit, vormittags", "Telefon, Termine, Rechnungen schreiben.", ["erfahrung", "stunden", "start"]), S("ausbildung", "Ausbildung Elektroniker (m/w/d)", "3,5 Jahre, Start im September", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("kundendienst", "Reparatur vor Ort", "Etwas geht nicht mehr, ca. 1,5 Stunden", 90, "kunde"), T("besichtigung", "Besichtigung für ein Angebot", "ca. 1 Stunde", 60, "kunde"), T("wallbox", "Wallbox-Check", "Wir prüfen, ob und wo eine Wallbox passt, ca. 45 Minuten", 45, "kunde")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Störung oder Ausfall", "Steckdosen, Licht, Leitungen", "Wallbox", "Sanierung oder Neubau", "E-Check", "Etwas anderes"],
        sicherheitsregeln: [FEUER, R(["Stromschlag", "gewischt"], "Bitte die Sicherung ausschalten und das Gerät nicht mehr anfassen. Bei Beschwerden nach einem Stromschlag sofort 112 anrufen."), R(["ganzes Haus ohne Strom", "Sicherung fliegt"], "", "dringend")] } },
  } },
  fahrzeugpflege: { name: "Fahrzeugpflege", werte: {
    stammdaten: { brancheText: "Fahrzeugaufbereitung", oeffnungszeiten: "Mo–Fr 8–17 Uhr, Sa 9–13 Uhr" },
    wissen: { leistungen: [L("Innen", "Innenreinigung"), L("Außen", "Außenwäsche von Hand"), L("Lack", "Politur"), L("Lack", "Keramikversiegelung"), L("Extras", "Leasingrückgabe-Aufbereitung")],
      faq: [F("Wie lange dauert eine Innenreinigung?", "Meist einige Stunden, je nach Zustand. Die genaue Dauer nennt das Team bei der Terminabsprache."), F("Gehen alle Flecken raus?", "Das hängt vom Fleck und vom Material ab. Das Team schaut es sich an und sagt ehrlich, was möglich ist.")],
      nieSagen: [...NIE_STANDARD, "Kein Ergebnis versprechen (z. B. dass ein Fleck oder Kratzer ganz verschwindet)."] },
    module: { kundenChat: { fotoCheck: true, fotoWorauf: "Innenraum: Verschmutzung von Sitzen, Teppichen und Kofferraum, Tierhaare, Flecken. Außen: Schmutzfilm, Insekten, stumpfer Lack, Kratzer, Felgen.", startKnoepfe: ["Innenreinigung", "Außen", "Politur/Versiegelung", "Frage stellen"], objektLabel: "Fahrzeug", objektPlatzhalter: "z. B. VW Golf 8, Kombi" },
      bewerberChat: { arbeitszeiten: "Mo–Fr 8–17 Uhr, samstags nach Absprache", bietet: "Einarbeitung durch erfahrene Kollegen, Arbeitskleidung und Werkzeug werden gestellt.",
        stellen: [S("aufbereiter", "Fahrzeugaufbereiter (m/w/d)", "Vollzeit oder Teilzeit", "Innenreinigung, Politur und Versiegelung. Führerschein Klasse B ist hilfreich."), S("aushilfe", "Aushilfe samstags (m/w/d)", "Minijob", "Waschen, Saugen und Übergabe an Kunden. Keine Erfahrung nötig.", ["erfahrung", "fuehrerschein", "wochenende", "start"])] },
      terminBot: { termine: [T("aussen", "Außenwäsche", "Handwäsche mit Felgen, ca. 1 Stunde", 60), T("innen", "Innenreinigung", "ca. 2,5 Stunden", 150), T("beratung", "Kurz vorbeikommen", "Auto ansehen lassen, ca. 20 Minuten", 20)] },
      anfrageChat: { kategorien: ["Innenreinigung", "Außenpflege", "Politur oder Versiegelung", "Kratzer oder Delle", "Etwas anderes"] } },
  } },
  autohaus: { name: "Autohaus / Werkstatt", werte: {
    stammdaten: { brancheText: "Autohaus mit Werkstatt", oeffnungszeiten: "Mo–Fr 8–18 Uhr, Sa 9–13 Uhr" },
    wissen: { leistungen: [L("Werkstatt", "Inspektion und Wartung"), L("Werkstatt", "HU/AU"), L("Werkstatt", "Reifenwechsel und Einlagerung"), L("Verkauf", "Neuwagen und Gebrauchtwagen"), L("Verkauf", "Probefahrt")],
      faq: [F("Bekomme ich einen Ersatzwagen?", "Ein Ersatzwagen ist nach Absprache möglich. Bitte bei der Terminanfrage angeben."), F("Kann ich mein Auto in Zahlung geben?", "Ja, das Team bewertet das Fahrzeug vor Ort.")],
      nieSagen: [...NIE_STANDARD, "Keine Aussagen zu Finanzierung, Zinsen oder Leasingraten.", "Keine Ferndiagnose zu Defekten."] },
    module: { kundenChat: { startKnoepfe: ["Werkstatt-Termin", "Probefahrt", "Reifenwechsel", "Frage stellen"], objektLabel: "Fahrzeug", objektPlatzhalter: "z. B. Ford Kuga, Baujahr 2021" },
      bewerberChat: { arbeitszeiten: "Mo–Fr 8–17 Uhr", bietet: "Moderne Werkstatt, Schulungen beim Hersteller, Mitarbeiterkonditionen.",
        stellen: [S("mechatroniker", "Kfz-Mechatroniker (m/w/d)", "Vollzeit", "Wartung, Diagnose und Reparatur. Führerschein Klasse B nötig."), S("serviceberater", "Serviceberater (m/w/d)", "Vollzeit", "Annahme, Kundengespräche, Terminplanung.", ["erfahrung", "start"]), S("ausbildung", "Ausbildung Kfz-Mechatroniker (m/w/d)", "3,5 Jahre, Start im September", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("inspektion", "Inspektion", "Auto morgens bringen", 120), T("reifen", "Reifenwechsel", "ca. 30 Minuten", 30), T("probefahrt", "Probefahrt", "ca. 45 Minuten", 45)] },
      anfrageChat: { kategorien: ["Werkstatt", "Reifen", "Fahrzeugkauf", "Unfall oder Panne", "Etwas anderes"], sicherheitsregeln: [R(["Bremse", "Bremsen", "Lenkung", "Öl-Warnleuchte", "raucht"], "Bitte nicht weiterfahren, wenn Bremsen, Lenkung oder eine rote Warnleuchte betroffen sind. Bei einer Panne an gefährlicher Stelle zuerst absichern.", "dringend")] } },
  } },
  gastro: { name: "Gastronomie", werte: {
    stammdaten: { brancheText: "Restaurant", oeffnungszeiten: "Di–So 17–23 Uhr, Montag Ruhetag" },
    ton: { anrede: "Sie" },
    wissen: { leistungen: [L("Angebot", "Tischreservierung"), L("Angebot", "Feiern und Gruppen"), L("Angebot", "Speisen zum Mitnehmen"), L("Angebot", "Gutscheine")],
      faq: [F("Gibt es vegetarische Gerichte?", "Ja. Die aktuelle Karte steht auf der Website."), F("Sind Hunde erlaubt?", "Bitte kurz beim Team nachfragen.")],
      nieSagen: ["Keine Reservierung bestätigen – das macht das Team.", "Keine verlässlichen Aussagen zu Allergenen. Dafür immer an das Team verweisen.", "Keine Rabatte nennen."] },
    module: { kundenChat: { startKnoepfe: ["Tisch reservieren", "Feier anfragen", "Öffnungszeiten", "Frage stellen"], objektLabel: "Anlass / Personenzahl", objektPlatzhalter: "z. B. Geburtstag, 12 Personen" },
      bewerberChat: { arbeitszeiten: "Abends und am Wochenende, nach Dienstplan", bietet: "Faire Bezahlung plus Trinkgeld, Essen während der Schicht, feste freie Tage.",
        stellen: [S("service", "Servicekraft (m/w/d)", "Teilzeit oder Minijob", "Gäste bedienen, kassieren. Erfahrung hilfreich, aber kein Muss.", ["erfahrung", "wochenende", "stunden", "start"]), S("kueche", "Koch / Köchin (m/w/d)", "Vollzeit", "Vorbereitung und Abendservice im kleinen Team.", ["erfahrung", "wochenende", "start"]), S("aushilfe", "Küchenhilfe / Spüler (m/w/d)", "Minijob", "Spülen, Vorbereiten. Keine Erfahrung nötig.", ["wochenende", "stunden", "start"])] },
      terminBot: { termine: [T("tisch", "Tisch reservieren", "2 Stunden", 120)], pufferMin: 0, vorlaufStunden: 3, zeiten: { mo: "", di: "17-21", mi: "17-21", do: "17-21", fr: "17-21", sa: "17-21", so: "17-21" } },
      anfrageChat: { kategorien: ["Reservierung", "Feier oder Gruppe", "Gutschein", "Etwas anderes"] } },
  } },
  friseur: { name: "Friseur", werte: {
    stammdaten: { brancheText: "Friseursalon", oeffnungszeiten: "Di–Fr 9–18 Uhr, Sa 8–13 Uhr" },
    ton: { anrede: "du", stil: "locker, freundlich, kurz" },
    wissen: { leistungen: [L("Damen", "Waschen, Schneiden, Föhnen"), L("Damen", "Farbe und Strähnen"), L("Herren", "Haarschnitt"), L("Herren", "Bart"), L("Kinder", "Kinderhaarschnitt")],
      faq: [F("Kann ich ohne Termin kommen?", "Mit Termin geht es am schnellsten. Ohne Termin nur, wenn gerade etwas frei ist."), F("Wie lange dauert Färben?", "Je nach Länge und Technik unterschiedlich. Das Team sagt es dir bei der Terminabsprache.")],
      nieSagen: [...NIE_STANDARD, "Kein Ergebnis versprechen (z. B. eine bestimmte Haarfarbe)."] },
    module: { kundenChat: { fotoCheck: false, startKnoepfe: ["Termin anfragen", "Preise", "Öffnungszeiten", "Frage stellen"], objektLabel: "Was soll gemacht werden?", objektPlatzhalter: "z. B. Schneiden und Strähnen" },
      bewerberChat: { arbeitszeiten: "Di–Sa nach Dienstplan", bietet: "Weiterbildungen, Trinkgeld bleibt bei dir, Produkte zum Mitarbeiterpreis.",
        stellen: [S("friseur", "Friseur / Friseurin (m/w/d)", "Vollzeit oder Teilzeit", "Schneiden, Färben, Beraten. Gesellenbrief erwünscht.", ["erfahrung", "wochenende", "start"]), S("ausbildung", "Ausbildung Friseur (m/w/d)", "3 Jahre, Start im September", "Probearbeiten vorher möglich.", ["start"])] },
      terminBot: { termine: [T("herren", "Herrenhaarschnitt", "ca. 30 Minuten", 30), T("damen", "Waschen, Schneiden, Föhnen", "ca. 1 Stunde", 60), T("farbe", "Farbe", "ca. 2 Stunden", 120)], pufferMin: 5, vorlaufStunden: 4, zeiten: { mo: "", di: "9-18", mi: "9-18", do: "9-18", fr: "9-18", sa: "8-13", so: "" } },
      anfrageChat: { kategorien: ["Termin", "Farbe und Beratung", "Hochzeit oder Anlass", "Etwas anderes"] } },
  } },
  arztpraxis: { name: "Arztpraxis", werte: {
    stammdaten: { brancheText: "Arztpraxis", oeffnungszeiten: "Mo–Fr 8–12 Uhr, Mo, Di, Do 15–18 Uhr" },
    wissen: { leistungen: [L("Praxis", "Sprechstunde"), L("Praxis", "Vorsorge"), L("Praxis", "Rezepte und Überweisungen")],
      faq: [F("Wie bekomme ich ein Folgerezept?", "Folgerezepte können über das Praxisteam bestellt werden. Bitte Versichertenkarte bereithalten."), F("Was mache ich außerhalb der Sprechzeiten?", "Der ärztliche Bereitschaftsdienst ist unter 116 117 erreichbar, in Notfällen die 112.")],
      nieSagen: ["Keine medizinische Einschätzung, Diagnose oder Empfehlung zu Medikamenten.", "Nie nach Beschwerden, Diagnosen oder anderen Gesundheitsdaten fragen.", "Keine Termine zusagen oder bestätigen.", "Bei akuten Beschwerden immer auf 112 bzw. 116 117 hinweisen."] },
    module: { kundenChat: { startKnoepfe: ["Sprechzeiten", "Termin anfragen", "Rezept", "Frage stellen"], objektLabel: "Anliegen", objektPlatzhalter: "z. B. Vorsorgetermin (bitte keine Gesundheitsdaten)" },
      bewerberChat: { arbeitszeiten: "Mo–Fr zu den Sprechzeiten", bietet: "Geregelte Arbeitszeiten, kein Wochenenddienst, Fortbildungen.",
        stellen: [S("mfa", "Medizinische Fachangestellte (m/w/d)", "Vollzeit oder Teilzeit", "Anmeldung, Assistenz, Abrechnung.", ["erfahrung", "stunden", "start"]), S("ausbildung", "Ausbildung MFA (m/w/d)", "3 Jahre, Start im August", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("sprechstunde", "Sprechstunde", "ca. 15 Minuten", 15), T("vorsorge", "Vorsorge", "ca. 30 Minuten", 30)], pufferMin: 0, rasterMin: 15, zeiten: { mo: "8-12, 15-18", di: "8-12, 15-18", mi: "8-12", do: "8-12, 15-18", fr: "8-12", sa: "", so: "" } },
      anfrageChat: { kategorien: ["Termin", "Rezept", "Überweisung", "Etwas anderes"],
        sicherheitsregeln: [R(["Brustschmerz", "Atemnot", "bewusstlos", "Schlaganfall", "starke Blutung", "Notfall"], "Bei einem medizinischen Notfall bitte sofort die 112 anrufen. Außerhalb der Sprechzeiten hilft der ärztliche Bereitschaftsdienst unter 116 117.")] } },
  } },
  makler: { name: "Immobilienmakler", werte: {
    stammdaten: { brancheText: "Immobilienmakler", oeffnungszeiten: "Mo–Fr 9–18 Uhr, Besichtigungen nach Absprache" },
    wissen: { leistungen: [L("Verkauf", "Immobilie verkaufen"), L("Verkauf", "Wertermittlung"), L("Vermietung", "Immobilie vermieten"), L("Suche", "Immobilie suchen und Besichtigung")],
      faq: [F("Was kostet eine Wertermittlung?", "Das klärt das Team persönlich im Erstgespräch."), F("Welche Unterlagen brauche ich für den Verkauf?", "Zum Beispiel Grundbuchauszug, Energieausweis und Grundrisse. Das Team hilft beim Zusammenstellen.")],
      nieSagen: ["Keine Aussagen zum Wert einer Immobilie oder zu erzielbaren Preisen.", "Keine Angaben zu Provision oder Courtage – das klärt das Team.", "Keine Besichtigung zusagen.", "Keine Rechts- oder Steuerberatung."] },
    module: { kundenChat: { startKnoepfe: ["Immobilie verkaufen", "Immobilie suchen", "Besichtigung", "Frage stellen"], objektLabel: "Immobilie / Wunsch", objektPlatzhalter: "z. B. Einfamilienhaus in Villingen" },
      bewerberChat: { arbeitszeiten: "Flexibel, auch abends und samstags", bietet: "Firmenwagen, Provision, freie Zeiteinteilung.",
        stellen: [S("makler", "Immobilienberater (m/w/d)", "Vollzeit", "Objekte aufnehmen, Besichtigungen, Verkaufsgespräche.", ["erfahrung", "fuehrerschein", "start"]), S("buero", "Assistenz im Büro (m/w/d)", "Teilzeit", "Telefon, Exposés, Termine.", ["erfahrung", "stunden", "start"])] },
      terminBot: { termine: [T("erstgespraech", "Erstgespräch", "ca. 30 Minuten am Telefon", 30, "telefon"), T("bewertung", "Termin zur Wertermittlung", "bei Ihnen vor Ort, ca. 1 Stunde", 60, "kunde")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Verkaufen", "Vermieten", "Kaufen oder Mieten", "Mieter meldet Schaden", "Etwas anderes"], sicherheitsregeln: [WASSER, FEUER, GAS, R(["Heizung ausgefallen", "kein Warmwasser", "Schlüssel verloren"], "", "dringend")] } },
  } },
  shk: { name: "Sanitär / Heizung", werte: {
    stammdaten: { brancheText: "Sanitär- und Heizungsbetrieb", oeffnungszeiten: "Mo–Do 7–16 Uhr, Fr 7–12 Uhr" },
    wissen: { leistungen: [L("Kundendienst", "Reparatur und Störungssuche"), L("Heizung", "Heizungswartung"), L("Heizung", "Heizungstausch und Wärmepumpe"), L("Bad", "Badsanierung"), L("Sanitär", "Armaturen, WC, Leitungen")],
      faq: [F("Warten Sie Heizungen aller Hersteller?", "Das klärt das Team gern persönlich. Bitte nennen Sie Hersteller und Baujahr bei der Anfrage."), F("Wie schnell kommt jemand bei einer Störung?", "Bei Störungen bitte direkt anrufen. Das Team sagt Ihnen, wann jemand kommen kann.")],
      nieSagen: [...NIE_STANDARD, "Keine Anleitungen zu Arbeiten an Gas-, Heizungs- oder Trinkwasseranlagen.", "Keine Aussagen zu Fördermitteln oder zur Höhe einer Förderung."] },
    module: { kundenChat: { startKnoepfe: ["Störung", "Heizung", "Bad", "Frage stellen"], objektLabel: "Objekt", objektPlatzhalter: "z. B. Einfamilienhaus, Gasheizung von 2004" },
      bewerberChat: { arbeitszeiten: "Mo–Do 7–16 Uhr, Fr 7–12 Uhr", bietet: "Firmenwagen und Werkzeug, Schulungen bei Herstellern, Freitag ab Mittag frei.",
        stellen: [S("anlagenmechaniker", "Anlagenmechaniker SHK (m/w/d)", "Vollzeit", "Heizung, Sanitär und Bäder in Neubau und Bestand. Führerschein Klasse B nötig."), S("kundendienst", "Kundendienstmonteur (m/w/d)", "Vollzeit", "Wartung und Störungsbehebung beim Kunden. Führerschein Klasse B nötig."), S("ausbildung", "Ausbildung Anlagenmechaniker SHK (m/w/d)", "3,5 Jahre, Start im September", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("kundendienst", "Reparatur vor Ort", "Etwas geht nicht mehr, ca. 1,5 Stunden", 90, "kunde"), T("wartung", "Heizungswartung", "ca. 1 Stunde", 60, "kunde"), T("besichtigung", "Besichtigung für ein Angebot", "ca. 1 Stunde", 60, "kunde")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Störung oder Ausfall", "Heizung", "Bad und Sanitär", "Wartung", "Etwas anderes"], sicherheitsregeln: [GAS, WASSER, R(["Heizung ausgefallen", "Heizung kalt", "kein Warmwasser"], "", "dringend")] } },
  } },
  dachdecker: { name: "Dachdecker", werte: {
    stammdaten: { brancheText: "Dachdeckerbetrieb", oeffnungszeiten: "Mo–Fr 7–16 Uhr" },
    wissen: { leistungen: [L("Dach", "Reparatur und Sturmschaden"), L("Dach", "Neueindeckung und Sanierung"), L("Dach", "Dachfenster"), L("Dach", "Dachrinnen und Blecharbeiten"), L("Dämmung", "Dachdämmung"), L("Flachdach", "Abdichtung")],
      faq: [F("Kommen Sie für eine Besichtigung vorbei?", "Ja, das Team schaut sich das Dach an und macht danach ein Angebot."), F("Machen Sie auch kleine Reparaturen?", "Ja, auch einzelne Ziegel oder eine undichte Stelle.")],
      nieSagen: [...NIE_STANDARD, "Keine Einschätzung, ob ein Dach noch dicht oder sicher ist – das geht nur vor Ort.", "Niemanden auffordern oder ermutigen, selbst aufs Dach zu steigen."] },
    module: { kundenChat: { startKnoepfe: ["Reparatur", "Neues Dach", "Dachfenster", "Frage stellen"], objektLabel: "Objekt", objektPlatzhalter: "z. B. Einfamilienhaus, Satteldach" },
      bewerberChat: { arbeitszeiten: "Mo–Fr 7–16 Uhr", bietet: "Arbeitskleidung und Schutzausrüstung werden gestellt, festes Team, Einarbeitung durch erfahrene Kollegen.",
        stellen: [S("geselle", "Dachdecker Geselle (m/w/d)", "Vollzeit", "Steildach, Flachdach und Reparaturen in der Region. Führerschein Klasse B nötig."), S("helfer", "Helfer auf dem Dach (m/w/d)", "Vollzeit", "Zuarbeiten, Material vorbereiten. Schwindelfrei solltest du sein. Quereinsteiger willkommen."), S("ausbildung", "Ausbildung Dachdecker (m/w/d)", "3 Jahre, Start im September", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("besichtigung", "Besichtigung vor Ort", "Wir schauen uns das Dach an, ca. 45 Minuten", 45, "kunde"), T("rueckruf", "Rückruf", "Wir rufen zur vereinbarten Zeit an, ca. 15 Minuten", 15, "telefon")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Reparatur oder Sturmschaden", "Neueindeckung oder Sanierung", "Dachfenster", "Dachrinne", "Etwas anderes"],
        sicherheitsregeln: [R(["Ziegel lose", "Ziegel fallen", "Sturmschaden", "Ast auf dem Dach"], "Bitte halten Sie Abstand zu Stellen, an denen Teile herabfallen können, und steigen Sie nicht selbst aufs Dach. Bei Gefahr für Personen rufen Sie die 112."), R(["Wasser tritt ein", "es tropft", "regnet rein", "Dach undicht"], "Bitte stellen Sie Eimer unter und räumen Sie empfindliche Dinge weg. Steigen Sie nicht selbst aufs Dach.", "dringend")] } },
  } },
  gartenbau: { name: "Garten- und Landschaftsbau", werte: {
    stammdaten: { brancheText: "Garten- und Landschaftsbau", oeffnungszeiten: "Mo–Fr 7–16 Uhr" },
    wissen: { leistungen: [L("Pflege", "Gartenpflege und Rasen"), L("Pflege", "Hecken- und Baumschnitt"), L("Neuanlage", "Pflaster, Wege und Terrassen"), L("Neuanlage", "Bepflanzung und Rollrasen"), L("Extras", "Zaunbau"), L("Winter", "Winterdienst")],
      faq: [F("Kommen Sie regelmäßig zur Pflege?", "Ja, einmalig oder regelmäßig. Den Rhythmus stimmt das Team mit Ihnen ab."), F("Nehmen Sie den Grünschnitt mit?", "Ja, die Entsorgung kann mit angeboten werden.")],
      nieSagen: [...NIE_STANDARD, "Keine Aussage, ob ein Baum gefällt werden darf – das hängt von Gemeinde und Jahreszeit ab."] },
    module: { kundenChat: { startKnoepfe: ["Gartenpflege", "Neuanlage", "Hecke oder Baum", "Frage stellen"], objektLabel: "Garten", objektPlatzhalter: "z. B. Reihenhausgarten, ca. 200 m²" },
      bewerberChat: { arbeitszeiten: "Mo–Fr 7–16 Uhr", bietet: "Arbeit an der frischen Luft im festen Team, Arbeitskleidung, moderne Maschinen.",
        stellen: [S("gaertner", "Gärtner im Garten- und Landschaftsbau (m/w/d)", "Vollzeit", "Pflege, Pflanzungen, Pflaster- und Wegebau. Führerschein Klasse B nötig."), S("helfer", "Helfer im Gartenbau (m/w/d)", "Vollzeit oder Teilzeit", "Mähen, Schneiden, Zuarbeiten. Quereinsteiger willkommen."), S("ausbildung", "Ausbildung Gärtner (m/w/d)", "3 Jahre, Start im August", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("besichtigung", "Besichtigung im Garten", "Wir schauen uns alles an, ca. 45 Minuten", 45, "kunde"), T("rueckruf", "Rückruf", "Wir rufen zur vereinbarten Zeit an, ca. 15 Minuten", 15, "telefon")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Gartenpflege", "Hecken- oder Baumschnitt", "Neuanlage", "Pflaster oder Terrasse", "Winterdienst", "Etwas anderes"],
        sicherheitsregeln: [R(["Baum umgestürzt", "Baum droht", "Ast droht", "Sturmschaden"], "Bitte halten Sie Abstand und sperren Sie den Bereich ab. Bei Gefahr für Personen oder Straßen rufen Sie die 112.")] } },
  } },
  reinigung: { name: "Gebäudereinigung", werte: {
    stammdaten: { brancheText: "Gebäudereinigung", oeffnungszeiten: "Mo–Fr 8–17 Uhr" },
    wissen: { leistungen: [L("Regelmäßig", "Büro- und Praxisreinigung"), L("Regelmäßig", "Treppenhausreinigung"), L("Glas", "Fenster- und Glasreinigung"), L("Einmalig", "Grundreinigung"), L("Einmalig", "Bauendreinigung"), L("Einmalig", "Teppich- und Polsterreinigung")],
      faq: [F("Reinigen Sie auch Privathaushalte?", "Das klärt das Team gern persönlich mit Ihnen."), F("Bringen Sie Reinigungsmittel und Geräte mit?", "Ja, Mittel und Geräte bringt das Team mit.")],
      nieSagen: [...NIE_STANDARD, "Kein Ergebnis versprechen (z. B. dass ein Fleck ganz verschwindet)."] },
    module: { kundenChat: { startKnoepfe: ["Büroreinigung", "Fenster", "Grundreinigung", "Frage stellen"], objektLabel: "Objekt", objektPlatzhalter: "z. B. Büro, 250 m², zweimal pro Woche" },
      bewerberChat: { arbeitszeiten: "Früh morgens oder abends, nach Einsatzplan", bietet: "Feste Objekte in deiner Nähe, Einarbeitung, Arbeitskleidung und Material werden gestellt.",
        stellen: [S("reinigungskraft", "Reinigungskraft (m/w/d)", "Teilzeit oder Minijob", "Büros und Treppenhäuser reinigen, meist früh morgens oder abends. Keine Erfahrung nötig.", ["erfahrung", "fuehrerschein", "stunden", "start"]), S("glasreiniger", "Glas- und Gebäudereiniger (m/w/d)", "Vollzeit", "Fenster, Fassaden und Sonderreinigungen. Führerschein Klasse B nötig.")] },
      terminBot: { termine: [T("besichtigung", "Besichtigung des Objekts", "Wir schauen uns alles an, ca. 30 Minuten", 30, "kunde"), T("rueckruf", "Rückruf", "Wir rufen zur vereinbarten Zeit an, ca. 15 Minuten", 15, "telefon")], fahrtMin: 30 },
      anfrageChat: { kategorien: ["Regelmäßige Reinigung", "Fenster und Glas", "Grundreinigung", "Bauendreinigung", "Etwas anderes"] } },
  } },
  kosmetik: { name: "Kosmetikstudio", werte: {
    stammdaten: { brancheText: "Kosmetikstudio", oeffnungszeiten: "Di–Fr 9–18 Uhr, Sa 9–14 Uhr" },
    wissen: { leistungen: [L("Gesicht", "Gesichtsbehandlung"), L("Hände und Füße", "Maniküre"), L("Hände und Füße", "Kosmetische Fußpflege"), L("Haarentfernung", "Waxing"), L("Augen", "Wimpern und Augenbrauen")],
      faq: [F("Wie sage ich einen Termin ab?", "Bitte so früh wie möglich Bescheid geben, dann findet das Team einen neuen Termin."), F("Gibt es Gutscheine?", "Ja, Gutscheine gibt es direkt im Studio.")],
      nieSagen: [...NIE_STANDARD, "Kein Ergebnis versprechen.", "Keine Einschätzung zu Hautproblemen und keine Empfehlung bei Hautkrankheiten, Schwangerschaft oder Medikamenten."] },
    module: { kundenChat: { startKnoepfe: ["Termin anfragen", "Behandlungen", "Öffnungszeiten", "Frage stellen"], objektLabel: "Was soll gemacht werden?", objektPlatzhalter: "z. B. Gesichtsbehandlung" },
      bewerberChat: { arbeitszeiten: "Di–Sa nach Dienstplan", bietet: "Weiterbildungen, Produkte zum Mitarbeiterpreis, festes Team.",
        stellen: [S("kosmetik", "Kosmetiker / Kosmetikerin (m/w/d)", "Vollzeit oder Teilzeit", "Gesichtsbehandlungen, Maniküre, Beratung. Abgeschlossene Ausbildung erwünscht.", ["erfahrung", "wochenende", "start"]), S("fusspflege", "Fußpfleger / Fußpflegerin (m/w/d)", "Teilzeit", "Kosmetische Fußpflege im Studio.", ["erfahrung", "stunden", "start"])] },
      terminBot: { termine: [T("gesicht", "Gesichtsbehandlung", "ca. 1 Stunde", 60), T("manikuere", "Maniküre", "ca. 45 Minuten", 45), T("fusspflege", "Kosmetische Fußpflege", "ca. 45 Minuten", 45)], pufferMin: 10, vorlaufStunden: 4, zeiten: { mo: "", di: "9-18", mi: "9-18", do: "9-18", fr: "9-18", sa: "9-14", so: "" } },
      anfrageChat: { kategorien: ["Termin", "Beratung", "Gutschein", "Etwas anderes"] } },
  } },
  physio: { name: "Physiotherapie", werte: {
    stammdaten: { brancheText: "Physiotherapiepraxis", oeffnungszeiten: "Mo–Do 8–19 Uhr, Fr 8–14 Uhr" },
    wissen: { leistungen: [L("Therapie", "Krankengymnastik"), L("Therapie", "Manuelle Therapie"), L("Therapie", "Lymphdrainage"), L("Therapie", "Massage"), L("Extras", "Hausbesuche")],
      faq: [F("Brauche ich ein Rezept?", "Für Behandlungen auf Kassenrezept ja. Ob es auch ohne geht, sagt Ihnen das Praxisteam."), F("Was muss ich zum ersten Termin mitbringen?", "Bitte bringen Sie Ihr Rezept, Ihre Versichertenkarte und ein Handtuch mit.")],
      nieSagen: ["Keine medizinische Einschätzung, Diagnose oder Übungsempfehlung.", "Nie nach Beschwerden, Diagnosen oder anderen Gesundheitsdaten fragen.", "Keine Termine zusagen oder bestätigen.", "Keine Aussage dazu, was die Krankenkasse übernimmt."] },
    module: { kundenChat: { startKnoepfe: ["Termin anfragen", "Rezept", "Öffnungszeiten", "Frage stellen"], objektLabel: "Anliegen", objektPlatzhalter: "z. B. Termin mit Rezept (bitte keine Gesundheitsdaten)" },
      bewerberChat: { arbeitszeiten: "Mo–Fr zu den Praxiszeiten", bietet: "Fortbildungen, feste Behandlungszeiten, kein Wochenenddienst.",
        stellen: [S("physio", "Physiotherapeut / Physiotherapeutin (m/w/d)", "Vollzeit oder Teilzeit", "Behandlungen in der Praxis und bei Hausbesuchen.", ["erfahrung", "stunden", "start"]), S("rezeption", "Rezeptionskraft (m/w/d)", "Teilzeit", "Telefon, Terminplanung, Abrechnung.", ["erfahrung", "stunden", "start"])] },
      terminBot: { termine: [T("ersttermin", "Ersttermin", "ca. 30 Minuten", 30), T("behandlung", "Behandlung", "ca. 30 Minuten", 30)], pufferMin: 0, zeiten: { mo: "8-19", di: "8-19", mi: "8-19", do: "8-19", fr: "8-14", sa: "", so: "" } },
      anfrageChat: { kategorien: ["Termin", "Rezept", "Hausbesuch", "Etwas anderes"],
        sicherheitsregeln: [R(["Brustschmerz", "Atemnot", "bewusstlos", "Schlaganfall", "starke Blutung", "Notfall"], "Bei einem medizinischen Notfall bitte sofort die 112 anrufen. Außerhalb der Sprechzeiten hilft der ärztliche Bereitschaftsdienst unter 116 117.")] } },
  } },
  steuerberater: { name: "Steuerkanzlei", werte: {
    stammdaten: { brancheText: "Steuerkanzlei", oeffnungszeiten: "Mo–Do 8–17 Uhr, Fr 8–13 Uhr" },
    wissen: { leistungen: [L("Privat", "Einkommensteuererklärung"), L("Unternehmen", "Buchhaltung"), L("Unternehmen", "Lohnabrechnung"), L("Unternehmen", "Jahresabschluss"), L("Beratung", "Existenzgründung")],
      faq: [F("Nehmen Sie neue Mandanten auf?", "Das klärt die Kanzlei gern in einem kurzen Erstgespräch."), F("Welche Unterlagen brauche ich für die Steuererklärung?", "Das hängt von Ihrer Situation ab. Die Kanzlei schickt Ihnen eine passende Liste.")],
      nieSagen: ["Keine Steuerberatung: keine Aussagen dazu, was absetzbar ist, wie hoch eine Steuer ausfällt oder welche Frist im Einzelfall gilt.", "Keine Aussagen zu Honorar oder Kosten – das klärt die Kanzlei.", "Keine Termine zusagen oder bestätigen.", "Nie nach Einkommen, Steuernummer oder anderen vertraulichen Daten fragen."] },
    module: { kundenChat: { startKnoepfe: ["Erstgespräch anfragen", "Unterlagen einreichen", "Öffnungszeiten", "Frage stellen"], objektLabel: "Anliegen", objektPlatzhalter: "z. B. Steuererklärung (bitte keine vertraulichen Daten)" },
      bewerberChat: { arbeitszeiten: "Mo–Do 8–17 Uhr, Fr 8–13 Uhr", bietet: "Fortbildungen, flexible Arbeitszeiten, Einarbeitung im festen Team.",
        stellen: [S("steuerfachangestellte", "Steuerfachangestellte (m/w/d)", "Vollzeit oder Teilzeit", "Buchhaltung, Steuererklärungen, Jahresabschlüsse.", ["erfahrung", "stunden", "start"]), S("lohn", "Lohnbuchhalter (m/w/d)", "Teilzeit", "Lohn- und Gehaltsabrechnungen für Mandanten.", ["erfahrung", "stunden", "start"]), S("ausbildung", "Ausbildung Steuerfachangestellte (m/w/d)", "3 Jahre, Start im August", "Praktikum vorher möglich.", ["start"])] },
      terminBot: { termine: [T("erstgespraech", "Erstgespräch", "ca. 30 Minuten am Telefon", 30, "telefon"), T("besprechung", "Besprechung in der Kanzlei", "ca. 1 Stunde", 60)] },
      anfrageChat: { kategorien: ["Neuer Mandant", "Steuererklärung", "Buchhaltung oder Lohn", "Post vom Finanzamt", "Etwas anderes"], sicherheitsregeln: [R(["Frist läuft ab", "Einspruchsfrist", "Mahnung vom Finanzamt", "Vollstreckung", "Betriebsprüfung", "Steuerfahndung"], "", "dringend")] } },
  } },
};

// ---------- Mehr Wissen und feste Antworten je Branche ----------
// Wird in ausVorlage zu den Werten oben dazugenommen (Fragen und Verbote werden angehängt).
const A = (stichworte: string[], antwort: string) => ({ stichworte, antwort });
// Feste Antworten, die jede Branche mitbekommt (hinter den eigenen der Branche). Je einmal für „Sie“ und „du“.
const IMMER_FEST: { stichworte: string[]; sie: string; du: string }[] = [
  { stichworte: ["Reklamation", "Beschwerde", "unzufrieden", "Geld zurück", "Anwalt", "Schadensersatz"],
    sie: "Das tut uns leid. Damit sich sofort jemand persönlich darum kümmert, melden Sie sich bitte direkt beim Team – die Kontaktdaten finden Sie unten. Ich als KI-Assistent kann dazu nichts zusagen.",
    du: "Das tut uns leid. Damit sich sofort jemand persönlich darum kümmert, melde dich bitte direkt beim Team – die Kontaktdaten findest du unten. Ich als KI-Assistent kann dazu nichts zusagen." },
  { stichworte: ["Daten löschen", "Auskunft über meine Daten", "DSGVO"],
    sie: "Fragen zu Ihren Daten beantwortet der Betrieb direkt. Bitte schreiben Sie an die Kontakt-Adresse unten; die Datenschutzerklärung ist im Chat verlinkt.",
    du: "Fragen zu deinen Daten beantwortet der Betrieb direkt. Schreib bitte an die Kontakt-Adresse unten; die Datenschutzerklärung ist im Chat verlinkt." },
  { stichworte: ["mit einem Menschen", "echter Mensch", "echten Menschen", "bist du ein Mensch", "sind Sie ein Mensch", "bist du eine KI", "sind Sie eine KI", "bist du ein Bot", "sind Sie ein Bot", "Roboter", "Chatbot", "künstliche Intelligenz"],
    sie: "Ich bin ein KI-Assistent und kein Mensch. Wenn Sie lieber mit jemandem aus dem Team sprechen möchten: Die Kontaktdaten finden Sie unten.",
    du: "Ich bin ein KI-Assistent und kein Mensch. Wenn du lieber mit jemandem aus dem Team sprechen möchtest: Die Kontaktdaten findest du unten." },
  { stichworte: ["Rabatt", "Skonto", "Preisnachlass", "Sonderpreis", "billiger machen", "günstiger machen", "am Preis machen"],
    sie: "Über Preise entscheidet nur das Team. Als KI-Assistent kann ich dazu nichts zusagen. Schreiben Sie dem Team gern direkt – die Kontaktdaten finden Sie unten.",
    du: "Über Preise entscheidet nur das Team. Als KI-Assistent kann ich dazu nichts zusagen. Schreib dem Team gern direkt – die Kontaktdaten findest du unten." },
  { stichworte: ["Gewährleistung", "Garantie", "Widerruf", "Haftung", "AGB"],
    sie: "Zu Gewährleistung und Vertragsfragen gibt Ihnen nur das Team verlässlich Auskunft. Als KI-Assistent darf ich dazu nichts sagen. Die Kontaktdaten finden Sie unten.",
    du: "Zu Gewährleistung und Vertragsfragen gibt dir nur das Team verlässlich Auskunft. Als KI-Assistent darf ich dazu nichts sagen. Die Kontaktdaten findest du unten." },
  { stichworte: ["Presseanfrage", "Kooperation", "Sponsoring", "Werbung schalten", "Vertreter", "Lieferant", "Suchmaschinenoptimierung"],
    sie: "Anfragen von Presse, Lieferanten und Dienstleistern beantwortet der Betrieb direkt. Bitte schreiben Sie an die Kontakt-Adresse unten.",
    du: "Anfragen von Presse, Lieferanten und Dienstleistern beantwortet der Betrieb direkt. Schreib bitte an die Kontakt-Adresse unten." },
];
// Feste Antworten im Bewerber-Chat (der duzt immer). Die Gehaltsfrage steht auch als Standard im Schema.
const BEWERBER_FEST = [
  A(["Gehalt", "verdien", "Bezahlung", "bezahlt", "Stundenlohn", "Monatslohn", "wie viel Geld"], "Das Gehalt besprechen wir offen im ersten Gespräch. Frag dort gern direkt danach."),
  A(["Stand meiner Bewerbung", "noch nichts gehört", "keine Antwort bekommen", "keine Rückmeldung", "Absage bekommen", "abgelehnt worden"], "Ich kann nicht sehen, wie weit deine Bewerbung ist. Das Team meldet sich bei dir. Wenn es dir zu lange dauert, frag gern direkt im Betrieb nach."),
  A(["schwanger", "Schwangerschaft", "Behinderung", "schwerbehindert", "Kopftuch", "Religion", "Vorstrafe", "vorbestraft", "zu alt"], "Bei uns zählt, ob du zur Stelle passt. Solche persönlichen Angaben musst du in der Bewerbung nicht machen, und in diesen Chat gehören sie nicht. Wenn du dazu etwas klären möchtest, sprich es gern im persönlichen Gespräch an."),
  A(["Probezeit", "Kündigungsfrist", "Arbeitsvertrag", "befristet", "unbefristet"], "Das steht im Arbeitsvertrag und wird im Gespräch offen besprochen. Frag dort gern direkt danach."),
  A(["Bewerbung zurückziehen", "Bewerbung löschen", "Daten löschen", "DSGVO"], "Du kannst deine Bewerbung jederzeit zurückziehen. Schreib dazu kurz an den Betrieb, dann werden deine Angaben und Unterlagen gelöscht."),
];
const IMMER_NIE = ["Nicht über andere Betriebe oder Mitbewerber urteilen und keine Preise vergleichen.", "Keine Aussagen zu Gewährleistung, Haftung oder Vertragsfragen – dafür ans Team verweisen.", "Keine persönlichen Daten erfragen; Name und Kontakt trägt der Kunde selbst ins Formular ein."];

const MEHR: Record<string, { faq?: any[]; feste?: any[]; nie?: string[]; zahlung?: string; wartezeit?: string }> = {
  handwerk: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Machen Sie auch kleine Aufträge?", "Ja, auch kleine Aufträge. Schildern Sie kurz, worum es geht, dann meldet sich das Team."), F("Bekomme ich einen Kostenvoranschlag?", "Ja. Nach einer Besichtigung erstellt das Team ein schriftliches Angebot."), F("Arbeiten Sie auch für Firmen und Vermieter?", "Ja, für Privat- und Gewerbekunden.")],
    feste: [A(["Notdienst", "Notfall", "sofort jemand"], "Bei einem Notfall rufen Sie uns bitte direkt an – die Nummer steht unten. Über den Chat kann ich niemanden losschicken.")] },
  maler: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Welche Farben verwenden Sie?", "Hochwertige Markenfarben. Welche genau passt, bespricht das Team bei der Besichtigung."), F("Streichen Sie auch nur einzelne Räume?", "Ja, auch einzelne Räume oder nur die Decke."), F("Muss ich während der Arbeit zu Hause sein?", "Nein. Schlüsselübergabe und Ablauf stimmen wir vorher ab."), F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot.")],
    feste: [A(["gesundheitsschädlich", "giftig", "Asbest"], "Zu Gesundheitsfragen kann ich als KI-Assistent nichts sagen. Bitte lassen Sie die Stelle unverändert und melden Sie sich direkt beim Team, das schaut es sich vor Ort an.")],
    nie: ["Keine Aussage, ob Schimmel gesundheitsschädlich ist oder woher er kommt."] },
  elektro: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Machen Sie auch Kleinreparaturen?", "Ja, zum Beispiel defekte Steckdosen, Schalter oder Lampenanschlüsse."), F("Gibt es Förderung für eine Wallbox?", "Förderprogramme ändern sich häufig. Das Team sagt Ihnen beim Wallbox-Check, was aktuell gilt."), F("Was ist ein E-Check?", "Eine Prüfung der elektrischen Anlage mit Protokoll. Das Team erklärt Ihnen gern den Ablauf."), F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot.")],
    feste: [A(["selber anschließen", "selbst anschließen", "selber reparieren", "selbst reparieren", "wie klemme ich", "welches Kabel"], "Arbeiten an elektrischen Anlagen sind gefährlich und gehören in die Hand einer Elektrofachkraft. Dazu gebe ich keine Anleitung. Das Team hilft Ihnen gern – unten finden Sie den Kontakt."),
      A(["Notdienst", "Notfall"], "Bei Gefahr (Brandgeruch, Funken, Rauch) schalten Sie bitte die Sicherung aus und rufen Sie bei Feuer die 112. Für alles Dringende rufen Sie uns bitte direkt an – die Nummer steht unten.")] },
  fahrzeugpflege: { zahlung: "Bar, EC-Karte oder Überweisung.",
    faq: [F("Muss das Auto vorher leer sein?", "Ja, bitte persönliche Gegenstände und Kindersitze vorher herausnehmen."), F("Machen Sie auch Leasingrückgaben?", "Ja. Das Team schaut sich das Fahrzeug an und sagt, was sinnvoll ist."), F("Wie lange hält eine Versiegelung?", "Das hängt von Produkt und Pflege ab. Das Team berät Sie dazu persönlich."), F("Kann ich auf das Auto warten?", "Bei kurzen Arbeiten ja. Bei längeren bringen Sie das Auto morgens und holen es später ab.")],
    feste: [A(["Lackschaden", "beschädigt"], "Das tut uns leid. Bitte melden Sie sich mit Fotos direkt beim Team, damit es sich das sofort ansehen kann. Ich als KI-Assistent kann dazu nichts beurteilen oder zusagen.")] },
  autohaus: { zahlung: "Bar, EC-Karte oder Überweisung. Zur Finanzierung berät das Verkaufsteam persönlich.",
    faq: [F("Kann ich mein Auto auch ohne Termin bringen?", "Mit Termin geht es am schnellsten. Ohne Termin nur, wenn die Werkstatt gerade Luft hat."), F("Lagern Sie Reifen ein?", "Ja, Einlagerung ist möglich. Details klärt das Serviceteam."), F("Machen Sie Fahrzeuge aller Marken?", "Das klärt das Serviceteam gern persönlich mit Ihnen."), F("Gibt es einen Hol- und Bringservice?", "Nach Absprache. Bitte bei der Terminanfrage angeben.")],
    feste: [A(["Finanzierung", "Leasingrate", "Zinsen", "Kredit", "Ratenzahlung"], "Zu Finanzierung und Leasing berät Sie unser Verkaufsteam persönlich. Als KI-Assistent nenne ich dazu keine Zahlen. Unten finden Sie den Kontakt."),
      A(["Unfall", "Panne", "liegen geblieben", "abschleppen"], "Sichern Sie bitte zuerst die Unfall- oder Pannenstelle und rufen Sie bei Verletzten die 112. Für Abschleppen und Hilfe rufen Sie uns bitte direkt an – die Nummer steht unten.")] },
  gastro: { zahlung: "Bar und mit Karte.",
    faq: [F("Kann ich mit einer großen Gruppe kommen?", "Ja. Bitte schicken Sie eine Anfrage mit Datum und Personenzahl, das Team meldet sich."), F("Gibt es Parkplätze?", "Das beantwortet Ihnen das Team gern."), F("Kann ich Gutscheine kaufen?", "Ja, Gutscheine gibt es direkt im Restaurant."), F("Haben Sie Kinderstühle?", "Bitte geben Sie das bei der Reservierung an, dann richtet das Team alles her.")],
    feste: [A(["Allergie", "Allergen", "allergisch", "Unverträglichkeit", "glutenfrei", "laktosefrei", "Nüsse", "Zöliakie"], "Zu Allergenen und Unverträglichkeiten gibt Ihnen nur unser Team verlässlich Auskunft. Bitte fragen Sie vor der Bestellung direkt nach – als KI-Assistent darf ich dazu keine Auskunft geben."),
      A(["lebensmittelvergiftung", "schlecht geworden", "krank nach"], "Das tut uns sehr leid. Bitte melden Sie sich direkt beim Team, damit es sich persönlich darum kümmert. Bei Beschwerden wenden Sie sich bitte an einen Arzt.")] },
  friseur: { zahlung: "Bar und mit Karte.",
    faq: [F("Schneidet ihr auch Kinder?", "Ja, gern."), F("Was mache ich, wenn ich den Termin nicht schaffe?", "Sag bitte so früh wie möglich Bescheid, dann finden wir einen neuen."), F("Macht ihr Hochzeitsfrisuren?", "Ja. Schick am besten eine Anfrage mit dem Datum, das Team meldet sich."), F("Verkauft ihr Pflegeprodukte?", "Ja, im Salon. Das Team berät dich gern.")],
    feste: [A(["Kopfhaut", "Haarausfall", "allergisch", "Allergie", "Ausschlag"], "Dazu kann ich als KI-Assistent nichts sagen. Sprich das bitte direkt im Salon an; bei Beschwerden hilft dir ein Hautarzt weiter.")] },
  arztpraxis: { zahlung: "",
    faq: [F("Nehmen Sie neue Patienten auf?", "Das beantwortet Ihnen das Praxisteam gern am Telefon."), F("Brauche ich eine Überweisung?", "Das hängt vom Anliegen ab. Bitte fragen Sie beim Praxisteam nach."), F("Was muss ich zum Termin mitbringen?", "Bitte bringen Sie Ihre Versichertenkarte mit, bei Bedarf Überweisung und Vorbefunde."), F("Wie sage ich einen Termin ab?", "Bitte so früh wie möglich telefonisch beim Praxisteam.")],
    feste: [A(["Notfall", "starke Schmerzen", "hohes Fieber", "Blutung", "Atemnot", "bewusstlos", "Suizid", "umbringen", "Brustschmerz"], "In einem Notfall rufen Sie bitte sofort die 112. Außerhalb der Sprechzeiten erreichen Sie den ärztlichen Bereitschaftsdienst unter 116 117. Als KI-Assistent kann ich keine medizinische Einschätzung geben – bitte rufen Sie in der Praxis an."),
      A(["Medikament", "Dosierung", "Nebenwirkung", "Diagnose", "Befund", "Laborwert", "Symptom", "Krankschreibung"], "Dazu darf und kann ich als KI-Assistent nichts sagen. Bitte besprechen Sie das direkt mit der Praxis – telefonisch oder in der Sprechstunde.")],
    nie: ["Niemals Gesundheitsdaten im Chat erfragen oder wiederholen.", "Keine Aussage dazu, ob ein Arztbesuch nötig ist oder warten kann."] },
  makler: { zahlung: "",
    faq: [F("In welcher Region sind Sie tätig?", "Das steht unter Einsatzgebiet; im Zweifel fragen Sie bitte kurz beim Team nach."), F("Wie läuft ein Verkauf ab?", "Erstgespräch, Wertermittlung, Vermarktung, Besichtigungen, Notartermin. Die Einzelheiten erklärt das Team persönlich."), F("Kann ich mich als Suchkunde vormerken lassen?", "Ja. Schicken Sie eine Anfrage mit Ihren Wünschen, das Team meldet sich."), F("Bieten Sie auch Vermietung an?", "Ja, das Team betreut auch Vermietungen.")],
    feste: [A(["Provision", "Courtage", "Maklergebühr", "Maklerkosten"], "Zur Provision informiert Sie unser Team persönlich und transparent im Erstgespräch. Als KI-Assistent nenne ich dazu keine Zahlen."),
      A(["was ist mein Haus wert", "Wert meiner", "Marktwert", "Quadratmeterpreis", "Preisentwicklung"], "Den Wert einer Immobilie kann nur unser Team nach einer Besichtigung seriös einschätzen. Als KI-Assistent nenne ich dazu keine Zahlen. Gern bereite ich eine Anfrage für eine Wertermittlung vor."),
      A(["Mietrecht", "Kündigung", "Eigenbedarf", "Steuer", "Grunderwerbsteuer", "Vertrag prüfen"], "Das ist eine Rechts- oder Steuerfrage. Dazu darf ich nichts sagen; bitte wenden Sie sich an einen Anwalt oder Steuerberater. Für alles rund um Ihre Immobilie hilft unser Team gern.")] },
  shk: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Machen Sie auch Kleinreparaturen?", "Ja, zum Beispiel ein tropfender Wasserhahn oder eine laufende Spülung."), F("Gibt es Förderung für eine neue Heizung?", "Förderprogramme ändern sich häufig. Das Team sagt Ihnen bei der Beratung, was aktuell gilt."), F("Planen Sie auch komplette Bäder?", "Ja, von der Planung bis zur Übergabe. Den Ablauf bespricht das Team bei der Besichtigung."), F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot.")],
    feste: [A(["Gasgeruch", "riecht nach Gas"], "Bei Gasgeruch: Fenster öffnen, keine Schalter und kein Feuer benutzen, das Haus verlassen und von draußen den Notdienst Ihres Gasversorgers oder die 112 anrufen."),
      A(["selber reparieren", "selbst reparieren", "selber einbauen", "selbst einbauen", "selber anschließen", "selbst anschließen", "Therme öffnen"], "Arbeiten an Gas-, Heizungs- und Trinkwasseranlagen gehören in die Hand eines Fachbetriebs. Dazu gebe ich keine Anleitung. Das Team hilft Ihnen gern – unten finden Sie den Kontakt."),
      A(["Notdienst", "Notfall", "Rohrbruch"], "Bei einem Rohrbruch drehen Sie bitte zuerst den Haupthahn zu. Für alles Dringende rufen Sie uns bitte direkt an – die Nummer steht unten. Über den Chat kann ich niemanden losschicken.")] },
  dachdecker: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot."), F("Arbeiten Sie auch im Winter?", "Das hängt vom Wetter ab. Das Team spricht den Zeitraum mit Ihnen ab."), F("Helfen Sie bei der Meldung an die Versicherung?", "Das Team erstellt Ihnen ein Angebot und Fotos für die Versicherung. Ob sie zahlt, klären Sie bitte mit Ihrer Versicherung."), F("Brauche ich ein Gerüst?", "Das entscheidet das Team bei der Besichtigung.")],
    feste: [A(["selber aufs Dach", "selbst aufs Dach", "selber reparieren", "selbst reparieren", "selber abdichten", "selbst abdichten"], "Arbeiten auf dem Dach sind gefährlich. Bitte steigen Sie nicht selbst hinauf; dazu gebe ich keine Anleitung. Das Team schaut es sich an – unten finden Sie den Kontakt."),
      A(["Sturmschaden", "Notdienst", "Notfall"], "Halten Sie bitte Abstand zu Stellen, an denen Teile herabfallen können, und rufen Sie bei Gefahr für Personen die 112. Für alles Dringende rufen Sie uns bitte direkt an – die Nummer steht unten."),
      A(["zahlt die Versicherung", "Versicherung zahlt", "Asbest"], "Das kann ich als KI-Assistent nicht beurteilen. Das Team schaut es sich vor Ort an und sagt Ihnen, wie es weitergeht.")] },
  gartenbau: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot."), F("Machen Sie auch kleine Gärten?", "Ja, auch kleine Gärten und einzelne Arbeiten."), F("Wann ist die beste Zeit für den Heckenschnitt?", "Das Team berät Sie dazu und schlägt einen passenden Termin vor."), F("Bieten Sie Winterdienst an?", "Ja. Schicken Sie eine Anfrage mit Adresse und Fläche, das Team meldet sich.")],
    feste: [A(["Baum fällen", "Baumfällung", "Fällgenehmigung", "Baumschutz"], "Ob und wann ein Baum gefällt werden darf, hängt von Ihrer Gemeinde und der Jahreszeit ab. Das kann ich als KI-Assistent nicht beurteilen. Das Team schaut es sich an und klärt mit Ihnen, was nötig ist."),
      A(["Unkrautvernichter", "Pflanzenschutzmittel", "Glyphosat", "Gift"], "Zu Pflanzenschutzmitteln gebe ich keine Auskunft. Das Team berät Sie persönlich.")] },
  reinigung: { zahlung: "Auf Rechnung, per Überweisung.",
    faq: [F("Bekomme ich ein Angebot vorab?", "Ja. Nach einer Besichtigung bekommen Sie ein schriftliches Angebot."), F("Kommt immer dieselbe Reinigungskraft?", "Das Team setzt nach Möglichkeit feste Kräfte ein. Die Einzelheiten klären wir persönlich."), F("Reinigen Sie auch außerhalb der Bürozeiten?", "Ja, die Zeiten stimmen wir mit Ihnen ab."), F("Wie kurzfristig können Sie anfangen?", "Das hängt vom Umfang ab. Das Team sagt es Ihnen nach der Besichtigung.")],
    feste: [A(["Schlüssel verloren", "Schlüssel weg", "Diebstahl", "gestohlen"], "Bitte melden Sie sich dazu sofort direkt beim Team – die Nummer steht unten. Als KI-Assistent kann ich dazu nichts aufnehmen."),
      A(["beschädigt", "kaputt gemacht", "Schaden verursacht"], "Das tut uns leid. Bitte melden Sie den Schaden mit Fotos direkt beim Team, damit es sich sofort darum kümmert. Ich als KI-Assistent kann dazu nichts beurteilen.")] },
  kosmetik: { zahlung: "Bar und mit Karte.",
    faq: [F("Muss ich vor der Behandlung etwas beachten?", "Das sagt Ihnen das Team bei der Terminabsprache."), F("Behandeln Sie auch Männer?", "Ja, gern."), F("Welche Produkte verwenden Sie?", "Das Team zeigt Ihnen die Produkte im Studio und berät Sie persönlich."), F("Kann ich ohne Termin kommen?", "Mit Termin geht es am schnellsten. Ohne Termin nur, wenn gerade etwas frei ist.")],
    feste: [A(["Allergie", "allergisch", "Ausschlag", "Entzündung", "Akne", "Neurodermitis", "schwanger", "Schwangerschaft", "Medikament", "Diabetes", "Blutverdünner"], "Dazu kann ich als KI-Assistent nichts sagen. Bitte sprechen Sie das vor der Behandlung direkt im Studio an; bei Beschwerden hilft Ihnen eine Ärztin oder ein Arzt weiter.")] },
  physio: { zahlung: "",
    faq: [F("Wie sage ich einen Termin ab?", "Bitte so früh wie möglich telefonisch beim Praxisteam."), F("Machen Sie Hausbesuche?", "Hausbesuche sind mit entsprechender Verordnung möglich. Bitte fragen Sie beim Praxisteam nach."), F("Nehmen Sie neue Patienten auf?", "Das beantwortet Ihnen das Praxisteam gern."), F("Gibt es Parkplätze?", "Das beantwortet Ihnen das Praxisteam gern.")],
    feste: [A(["Notfall", "Atemnot", "bewusstlos", "Brustschmerz", "Schlaganfall", "Suizid", "umbringen"], "In einem Notfall rufen Sie bitte sofort die 112. Außerhalb der Sprechzeiten erreichen Sie den ärztlichen Bereitschaftsdienst unter 116 117. Als KI-Assistent kann ich keine medizinische Einschätzung geben."),
      A(["Schmerzen", "Übung", "Diagnose", "Befund", "Medikament", "Bandscheibe", "Operation", "Krankschreibung"], "Dazu darf und kann ich als KI-Assistent nichts sagen. Bitte besprechen Sie das direkt in der Praxis oder mit Ihrer Ärztin, Ihrem Arzt."),
      A(["Zuzahlung", "Krankenkasse zahlt", "übernimmt die Kasse", "Privatpreis"], "Was Ihre Krankenkasse übernimmt und wie hoch die Zuzahlung ist, klärt das Praxisteam mit Ihnen persönlich.")],
    nie: ["Niemals Gesundheitsdaten im Chat erfragen oder wiederholen."] },
  steuerberater: { zahlung: "",
    faq: [F("Was kostet die Steuererklärung?", "Das Honorar richtet sich nach der Steuerberatervergütungsverordnung und Ihrem Fall. Die Kanzlei nennt es Ihnen im Erstgespräch."), F("Wie reiche ich Unterlagen ein?", "Das bespricht die Kanzlei mit Ihnen, zum Beispiel digital oder per Post."), F("Betreuen Sie auch Vereine und Vermieter?", "Das klärt die Kanzlei gern im Erstgespräch."), F("Wie lange dauert die Bearbeitung?", "Das hängt vom Umfang ab. Die Kanzlei nennt Ihnen einen Zeitrahmen.")],
    feste: [A(["Steuerfahndung", "Selbstanzeige", "Steuerstrafverfahren", "Durchsuchung"], "Bitte rufen Sie dazu sofort direkt in der Kanzlei an – die Nummer steht unten. Schreiben Sie dazu bitte nichts in diesen Chat."),
      A(["absetzen", "absetzbar", "Steuerklasse", "Steuer sparen", "Freibetrag", "Abgabefrist", "wie viel Steuer", "Erbschaftsteuer", "Schenkung", "Umsatzsteuer", "Kleinunternehmer"], "Das ist eine steuerliche Einzelfrage. Dazu darf ich als KI-Assistent nichts sagen. Die Kanzlei berät Sie persönlich – gern bereite ich eine Anfrage für ein Erstgespräch vor."),
      A(["Honorar", "Gebühren", "Stundensatz"], "Zum Honorar informiert Sie die Kanzlei persönlich im Erstgespräch. Als KI-Assistent nenne ich dazu keine Zahlen.")] },
};

function mische(ziel: any, quelle: any): any {
  for (const [k, v] of Object.entries(quelle || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) ziel[k] = mische(ziel[k] && typeof ziel[k] === "object" ? ziel[k] : {}, v);
    else if (v !== undefined) ziel[k] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : v;
  }
  return ziel;
}

/** Startwerte für einen neuen Kunden: Branchen-Vorlage + eigene Angaben (eigene gewinnen). */
export function ausVorlage(branche: string, eigene: Teil<Kunde>): any {
  const v = VORLAGEN[branche] || VORLAGEN.handwerk;
  const basis = mische({}, v.werte);
  basis.stammdaten = { ...(basis.stammdaten || {}), branche: VORLAGEN[branche] ? branche : "handwerk" };
  // Mehr Wissen, feste Antworten und Verbote der Branche dazunehmen
  const m = MEHR[basis.stammdaten.branche] || {}, w = (basis.wissen ||= {});
  w.faq = [...(w.faq || []), ...(m.faq || [])];
  const du = basis.ton?.anrede === "du";
  w.festeAntworten = [...JSON.parse(JSON.stringify(m.feste || [])), ...IMMER_FEST.map((f) => A([...f.stichworte], du ? f.du : f.sie))];
  if (basis.module?.bewerberChat) basis.module.bewerberChat.festeAntworten = JSON.parse(JSON.stringify(BEWERBER_FEST));
  w.nieSagen = [...(w.nieSagen || []), ...(m.nie || []), ...IMMER_NIE];
  if (m.zahlung) w.zahlung = m.zahlung;
  return mische(basis, eigene);
}
