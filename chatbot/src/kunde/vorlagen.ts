// Branchen-Vorlagen: sinnvolle Startwerte je Branche. Ein neuer Kunde wird mit
// einer Vorlage angelegt und danach nur noch angepasst. Preise sind bewusst
// leer („auf Anfrage“) – echte Preise trägt man beim Kunden ein.
//
// Neue Branche: unten einen Eintrag ergänzen. Mehr ist nicht nötig.
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
};

// ---------- Mehr Wissen und feste Antworten je Branche ----------
// Wird in ausVorlage zu den Werten oben dazugenommen (Fragen und Verbote werden angehängt).
const A = (stichworte: string[], antwort: string) => ({ stichworte, antwort });
const REKLAMATION = A(["Reklamation", "Beschwerde", "unzufrieden", "Geld zurück", "Anwalt", "Schadensersatz"],
  "Das tut uns leid. Damit sich sofort jemand persönlich darum kümmert, melden Sie sich bitte direkt beim Team – die Kontaktdaten finden Sie unten. Ich als KI-Assistent kann dazu nichts zusagen.");
const DATEN = A(["Daten löschen", "Auskunft über meine Daten", "DSGVO"],
  "Fragen zu Ihren Daten beantwortet der Betrieb direkt. Bitte schreiben Sie an die Kontakt-Adresse unten; die Datenschutzerklärung ist im Chat verlinkt.");
const IMMER_NIE = ["Nicht über andere Betriebe oder Mitbewerber urteilen und keine Preise vergleichen.", "Keine Aussagen zu Gewährleistung, Haftung oder Vertragsfragen – dafür ans Team verweisen.", "Keine persönlichen Daten erfragen; Name und Kontakt trägt der Kunde selbst ins Formular ein."];

const MEHR: Record<string, { faq?: any[]; feste?: any[]; nie?: string[]; zahlung?: string; wartezeit?: string }> = {
  handwerk: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Machen Sie auch kleine Aufträge?", "Ja, auch kleine Aufträge. Schildern Sie kurz, worum es geht, dann meldet sich das Team."), F("Bekomme ich einen Kostenvoranschlag?", "Ja. Nach einer Besichtigung erstellt das Team ein schriftliches Angebot."), F("Arbeiten Sie auch für Firmen und Vermieter?", "Ja, für Privat- und Gewerbekunden.")],
    feste: [A(["Notdienst", "Notfall", "sofort jemand"], "Bei einem Notfall rufen Sie uns bitte direkt an – die Nummer steht unten. Über den Chat kann ich niemanden losschicken."), REKLAMATION, DATEN] },
  maler: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Welche Farben verwenden Sie?", "Hochwertige Markenfarben. Welche genau passt, bespricht das Team bei der Besichtigung."), F("Streichen Sie auch nur einzelne Räume?", "Ja, auch einzelne Räume oder nur die Decke."), F("Muss ich während der Arbeit zu Hause sein?", "Nein. Schlüsselübergabe und Ablauf stimmen wir vorher ab."), F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot.")],
    feste: [A(["gesundheitsschädlich", "giftig", "Asbest"], "Zu Gesundheitsfragen kann ich als KI-Assistent nichts sagen. Bitte lassen Sie die Stelle unverändert und melden Sie sich direkt beim Team, das schaut es sich vor Ort an."), REKLAMATION, DATEN],
    nie: ["Keine Aussage, ob Schimmel gesundheitsschädlich ist oder woher er kommt."] },
  elektro: { zahlung: "Auf Rechnung nach Abschluss der Arbeit, per Überweisung.",
    faq: [F("Machen Sie auch Kleinreparaturen?", "Ja, zum Beispiel defekte Steckdosen, Schalter oder Lampenanschlüsse."), F("Gibt es Förderung für eine Wallbox?", "Förderprogramme ändern sich häufig. Das Team sagt Ihnen beim Wallbox-Check, was aktuell gilt."), F("Was ist ein E-Check?", "Eine Prüfung der elektrischen Anlage mit Protokoll. Das Team erklärt Ihnen gern den Ablauf."), F("Bekomme ich ein Angebot vorab?", "Ja, nach der Besichtigung bekommen Sie ein schriftliches Angebot.")],
    feste: [A(["selber anschließen", "selbst anschließen", "selber reparieren", "selbst reparieren", "wie klemme ich", "welches Kabel"], "Arbeiten an elektrischen Anlagen sind gefährlich und gehören in die Hand einer Elektrofachkraft. Dazu gebe ich keine Anleitung. Das Team hilft Ihnen gern – unten finden Sie den Kontakt."),
      A(["Notdienst", "Notfall"], "Bei Gefahr (Brandgeruch, Funken, Rauch) schalten Sie bitte die Sicherung aus und rufen Sie bei Feuer die 112. Für alles Dringende rufen Sie uns bitte direkt an – die Nummer steht unten."), REKLAMATION, DATEN] },
  fahrzeugpflege: { zahlung: "Bar, EC-Karte oder Überweisung.",
    faq: [F("Muss das Auto vorher leer sein?", "Ja, bitte persönliche Gegenstände und Kindersitze vorher herausnehmen."), F("Machen Sie auch Leasingrückgaben?", "Ja. Das Team schaut sich das Fahrzeug an und sagt, was sinnvoll ist."), F("Wie lange hält eine Versiegelung?", "Das hängt von Produkt und Pflege ab. Das Team berät Sie dazu persönlich."), F("Kann ich auf das Auto warten?", "Bei kurzen Arbeiten ja. Bei längeren bringen Sie das Auto morgens und holen es später ab.")],
    feste: [A(["Lackschaden", "beschädigt"], "Das tut uns leid. Bitte melden Sie sich mit Fotos direkt beim Team, damit es sich das sofort ansehen kann. Ich als KI-Assistent kann dazu nichts beurteilen oder zusagen."), REKLAMATION, DATEN] },
  autohaus: { zahlung: "Bar, EC-Karte oder Überweisung. Zur Finanzierung berät das Verkaufsteam persönlich.",
    faq: [F("Kann ich mein Auto auch ohne Termin bringen?", "Mit Termin geht es am schnellsten. Ohne Termin nur, wenn die Werkstatt gerade Luft hat."), F("Lagern Sie Reifen ein?", "Ja, Einlagerung ist möglich. Details klärt das Serviceteam."), F("Machen Sie Fahrzeuge aller Marken?", "Das klärt das Serviceteam gern persönlich mit Ihnen."), F("Gibt es einen Hol- und Bringservice?", "Nach Absprache. Bitte bei der Terminanfrage angeben.")],
    feste: [A(["Finanzierung", "Leasingrate", "Zinsen", "Kredit", "Ratenzahlung"], "Zu Finanzierung und Leasing berät Sie unser Verkaufsteam persönlich und verbindlich. Als KI-Assistent nenne ich dazu keine Zahlen. Unten finden Sie den Kontakt."),
      A(["Unfall", "Panne", "liegen geblieben", "abschleppen"], "Sichern Sie bitte zuerst die Unfall- oder Pannenstelle und rufen Sie bei Verletzten die 112. Für Abschleppen und Hilfe rufen Sie uns bitte direkt an – die Nummer steht unten."), REKLAMATION, DATEN] },
  gastro: { zahlung: "Bar und mit Karte.",
    faq: [F("Kann ich mit einer großen Gruppe kommen?", "Ja. Bitte schicken Sie eine Anfrage mit Datum und Personenzahl, das Team meldet sich."), F("Gibt es Parkplätze?", "Das beantwortet Ihnen das Team gern."), F("Kann ich Gutscheine kaufen?", "Ja, Gutscheine gibt es direkt im Restaurant."), F("Haben Sie Kinderstühle?", "Bitte geben Sie das bei der Reservierung an, dann richtet das Team alles her.")],
    feste: [A(["Allergie", "Allergen", "allergisch", "Unverträglichkeit", "glutenfrei", "laktosefrei", "Nüsse", "Zöliakie"], "Zu Allergenen und Unverträglichkeiten gibt Ihnen nur unser Team verlässlich Auskunft. Bitte fragen Sie vor der Bestellung direkt nach – als KI-Assistent darf ich dazu keine Auskunft geben."),
      A(["lebensmittelvergiftung", "schlecht geworden", "krank nach"], "Das tut uns sehr leid. Bitte melden Sie sich direkt beim Team, damit es sich persönlich darum kümmert. Bei Beschwerden wenden Sie sich bitte an einen Arzt."), REKLAMATION, DATEN] },
  friseur: { zahlung: "Bar und mit Karte.",
    faq: [F("Schneidet ihr auch Kinder?", "Ja, gern."), F("Was mache ich, wenn ich den Termin nicht schaffe?", "Sag bitte so früh wie möglich Bescheid, dann finden wir einen neuen."), F("Macht ihr Hochzeitsfrisuren?", "Ja. Schick am besten eine Anfrage mit dem Datum, das Team meldet sich."), F("Verkauft ihr Pflegeprodukte?", "Ja, im Salon. Das Team berät dich gern.")],
    feste: [A(["Kopfhaut", "Haarausfall", "allergisch", "Allergie", "Ausschlag"], "Dazu kann ich als KI-Assistent nichts sagen. Sprich das bitte direkt im Salon an; bei Beschwerden hilft dir ein Hautarzt weiter."), REKLAMATION, DATEN] },
  arztpraxis: { zahlung: "",
    faq: [F("Nehmen Sie neue Patienten auf?", "Das beantwortet Ihnen das Praxisteam gern am Telefon."), F("Brauche ich eine Überweisung?", "Das hängt vom Anliegen ab. Bitte fragen Sie beim Praxisteam nach."), F("Was muss ich zum Termin mitbringen?", "Bitte bringen Sie Ihre Versichertenkarte mit, bei Bedarf Überweisung und Vorbefunde."), F("Wie sage ich einen Termin ab?", "Bitte so früh wie möglich telefonisch beim Praxisteam.")],
    feste: [A(["Notfall", "starke Schmerzen", "hohes Fieber", "Blutung", "Atemnot", "bewusstlos", "Suizid", "umbringen", "Brustschmerz"], "In einem Notfall rufen Sie bitte sofort die 112. Außerhalb der Sprechzeiten erreichen Sie den ärztlichen Bereitschaftsdienst unter 116 117. Als KI-Assistent kann ich keine medizinische Einschätzung geben – bitte rufen Sie in der Praxis an."),
      A(["Medikament", "Dosierung", "Nebenwirkung", "Diagnose", "Befund", "Laborwert", "Symptom", "Krankschreibung"], "Dazu darf und kann ich als KI-Assistent nichts sagen. Bitte besprechen Sie das direkt mit der Praxis – telefonisch oder in der Sprechstunde."), DATEN],
    nie: ["Niemals Gesundheitsdaten im Chat erfragen oder wiederholen.", "Keine Aussage dazu, ob ein Arztbesuch nötig ist oder warten kann."] },
  makler: { zahlung: "",
    faq: [F("In welcher Region sind Sie tätig?", "Das steht unter Einsatzgebiet; im Zweifel fragen Sie bitte kurz beim Team nach."), F("Wie läuft ein Verkauf ab?", "Erstgespräch, Wertermittlung, Vermarktung, Besichtigungen, Notartermin. Die Einzelheiten erklärt das Team persönlich."), F("Kann ich mich als Suchkunde vormerken lassen?", "Ja. Schicken Sie eine Anfrage mit Ihren Wünschen, das Team meldet sich."), F("Bieten Sie auch Vermietung an?", "Ja, das Team betreut auch Vermietungen.")],
    feste: [A(["Provision", "Courtage", "Maklergebühr", "Maklerkosten"], "Zur Provision informiert Sie unser Team persönlich und transparent im Erstgespräch. Als KI-Assistent nenne ich dazu keine Zahlen."),
      A(["was ist mein Haus wert", "Wert meiner", "Marktwert", "Quadratmeterpreis", "Preisentwicklung"], "Den Wert einer Immobilie kann nur unser Team nach einer Besichtigung seriös einschätzen. Als KI-Assistent nenne ich dazu keine Zahlen. Gern bereite ich eine Anfrage für eine Wertermittlung vor."),
      A(["Mietrecht", "Kündigung", "Eigenbedarf", "Steuer", "Grunderwerbsteuer", "Vertrag prüfen"], "Das ist eine Rechts- oder Steuerfrage. Dazu darf ich nichts sagen; bitte wenden Sie sich an einen Anwalt oder Steuerberater. Für alles rund um Ihre Immobilie hilft unser Team gern."), REKLAMATION, DATEN] },
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
  w.festeAntworten = JSON.parse(JSON.stringify(m.feste || [REKLAMATION, DATEN]));
  w.nieSagen = [...(w.nieSagen || []), ...(m.nie || []), ...IMMER_NIE];
  if (m.zahlung) w.zahlung = m.zahlung;
  return mische(basis, eigene);
}
