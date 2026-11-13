// Die Kunden-Konfiguration: EINE Beschreibung pro Kunde, aus der alle Bots
// ihre Einstellungen holen. Hier steht, welche Felder es gibt, was erlaubt ist
// und wofür jedes Feld da ist (der Text bei `.describe(...)` erscheint im
// Admin-Panel als Hilfe und in KONFIGURATION.md).
//
// Regel: Alles, was von Kunde zu Kunde anders ist, steht hier – nichts im Code.
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const mail = z.string().trim().toLowerCase().regex(/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/, "Das sieht nicht nach einer E-Mail-Adresse aus.");
const mails = z.array(mail).max(5).default([]);
const farbe = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farbe als Hex-Wert, z. B. #1f2a37");
const url = z.string().trim().max(300).regex(/^https:\/\/[^\s]+$/, "Adresse muss mit https:// anfangen.");
const urlOderLeer = z.union([z.literal(""), url]).default("");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche, z. B. malerbetrieb-mueller").min(3).max(40);

export const MODULE = ["kundenChat", "bewerberChat", "terminBot", "anfrageChat", "anrufRetter"] as const;
export type ModulName = (typeof MODULE)[number];
export const MODUL_NAMEN: Record<ModulName, string> = {
  kundenChat: "Kunden-Chat", bewerberChat: "Bewerber-Chat", terminBot: "Termin-Bot", anfrageChat: "Anfrage-Chat", anrufRetter: "Anruf-Retter",
};

/** Tarife: Welche Module darf ein Kunde mit diesem Paket einschalten? */
export const PAKETE: Record<string, { name: string; module: ModulName[] }> = {
  bewerber: { name: "Bewerber-Chat", module: ["bewerberChat"] },
  chat: { name: "Kunden-Chat + Bewerber-Chat", module: ["kundenChat", "bewerberChat"] },
  komplett: { name: "Komplett", module: ["kundenChat", "bewerberChat", "terminBot", "anfrageChat", "anrufRetter"] },
};
/** Module, die es für echte Kunden noch nicht gibt (nur als Vorführung). Einstellungen sind schon da, einschalten geht noch nicht. */
export const NOCH_NICHT: ModulName[] = ["anrufRetter"];
export const STATUS = { test: "Test", aktiv: "Aktiv", pausiert: "Pausiert", gekuendigt: "Gekündigt" } as const;

export const TAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"] as const;
export type Wochentag = (typeof TAGE)[number];
// Zeitfenster eines Tages als Text: "8-12, 13-17" oder "7:30-16"; leer = geschlossen
const zeitfenster = z.string().trim().max(60).regex(/^$|^\d{1,2}(:\d{2})?\s*-\s*\d{1,2}(:\d{2})?(\s*,\s*\d{1,2}(:\d{2})?\s*-\s*\d{1,2}(:\d{2})?)*$/, "Schreibweise: 8-12, 13-17 oder 7:30-16. Leer = geschlossen.");

const Leistung = z.object({
  kategorie: text(60).default("Leistungen").describe("Überschrift, unter der die Leistung einsortiert wird, z. B. „Innenanstrich“."),
  name: text(80).min(1, "Die Leistung braucht einen Namen."),
  preis: z.number().min(0).max(99999).nullable().default(null).describe("Preis in Euro. Leer lassen = „auf Anfrage“. Der Bot nennt nur Preise, die hier stehen."),
  ab: z.boolean().default(false).describe("Ankreuzen, wenn es ein „ab“-Preis ist (Richtpreis)."),
  beschreibung: text(300).default(""),
  wunsch: z.object({ preis: z.number().min(0).max(99999).nullable(), ab: z.boolean() }).nullable().default(null)
    .describe("Preis, den der Kunde über seinen Kunden-Zugang eingetragen hat. Der Bot nennt ihn noch nicht: Er gilt erst nach der Freigabe hier im Admin-Panel."),
});
const FesteAntwort = z.object({
  stichworte: z.array(text(60).min(3, "Mindestens 3 Zeichen, sonst greift die Regel zu oft.")).min(1).describe("Kommt eines dieser Wörter in der Nachricht vor, greift die feste Antwort. Gezählt wird nur, wenn ein Wort damit ANFÄNGT („Gehalt“ trifft auch „Gehaltsvorstellung“). Eindeutige Wörter wählen."),
  antwort: text(600).min(3).describe("Genau dieser Text wird geantwortet – Wort für Wort, ohne KI."),
});
const Frage = z.object({ frage: text(200).min(1), antwort: text(800).min(1) });
const Stelle = z.object({
  id: slug.describe("Kurzname der Stelle für Links, z. B. geselle. Wird im Link ?stelle=geselle benutzt."),
  name: text(100).min(1).describe("Stellenbezeichnung, z. B. „Maler und Lackierer Geselle (m/w/d)“."),
  umfang: text(80).default("").describe("z. B. Vollzeit, Minijob, 3 Jahre Ausbildung."),
  text: text(500).default("").describe("Zwei, drei Sätze: Aufgaben und was man mitbringen sollte."),
  fragen: z.array(z.enum(["erfahrung", "fuehrerschein", "wochenende", "stunden", "start"])).default(["erfahrung", "start"])
    .describe("Welche kurzen Fragen der Chat stellt (zum Antippen)."),
});
const Terminart = z.object({
  id: slug, name: text(80).min(1), kurz: text(160).default(""),
  dauerMin: z.number().int().min(5).max(600).default(60),
  ort: z.enum(["betrieb", "kunde", "telefon"]).default("betrieb"),
});
const Sicherheitsregel = z.object({
  stichworte: z.array(text(60).min(2)).min(1).describe("Wörter, bei denen die Regel greift, z. B. Brandgeruch, Funken."),
  dringlichkeit: z.enum(["notfall", "dringend"]).default("notfall"),
  antwort: text(400).default("").describe("Fester Hinweis, den der Kunde sofort sieht (ohne KI)."),
});

export const KundeSchema = z.object({
  id: slug.describe("Kunden-ID. Steht in allen Links dieses Kunden und kann später nicht mehr geändert werden."),
  status: z.enum(["test", "aktiv", "pausiert", "gekuendigt"]).default("test")
    .describe("Test = Probezeit. Aktiv = zahlender Kunde. Pausiert und Gekündigt schalten alle Bots des Kunden ab."),
  paket: z.enum(["bewerber", "chat", "komplett"]).default("bewerber").describe("Tarif. Bestimmt, welche Module eingeschaltet werden dürfen."),
  testBis: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default("")
    .describe("Ende der Testphase (JJJJ-MM-TT). Danach sind die Bots aus, bis der Status auf Aktiv steht. Leer = kein Ende."),
  notiz: text(1000).default("").describe("Interne Notiz, nur im Admin-Panel sichtbar."),

  stammdaten: z.object({
    firmenname: text(80).min(2, "Bitte den Firmennamen eintragen."),
    branche: text(40).default("handwerk").describe("Branchen-Vorlage, mit der der Kunde angelegt wurde."),
    brancheText: text(80).min(2, "Bitte kurz beschreiben, was der Betrieb macht.").describe("So beschreibt der Bot den Betrieb, z. B. „Malerbetrieb“ oder „mobile Fahrzeugaufbereitung“."),
    strasse: text(100).default(""), plz: text(5).default(""), ort: text(60).default(""),
    telefon: text(30).default(""),
    whatsapp: z.string().regex(/^\d{8,15}$/, "Nur Ziffern mit Ländervorwahl, z. B. 4917112345678").or(z.literal("")).default("")
      .describe("WhatsApp-Nummer nur aus Ziffern mit 49 vorn. Leer = kein WhatsApp-Knopf."),
    email: mail.describe("Allgemeine Kontakt-Adresse des Betriebs. Steht im Chat als Kontakt."),
    website: urlOderLeer.describe("Website des Betriebs. Von dort darf das Chat-Fenster geladen werden."),
    oeffnungszeiten: text(200).default("").describe("z. B. Mo–Fr 7–16 Uhr."),
    einsatzgebiet: text(200).default("").describe("z. B. „Umkreis von 30 km um Villingen“."),
    ansprechpartner: text(80).default("").describe("Wer im Betrieb zuständig ist. Der Bot sagt z. B. „Termine bestätigt Herr Müller persönlich“."),
  }),

  aussehen: z.object({
    botName: text(30).default("Assistent").describe("Name des Bots im Chat-Fenster."),
    primaerfarbe: farbe.default("#1f2a37").describe("Hauptfarbe des Chat-Fensters (Kopfzeile, Knöpfe). Am besten die Firmenfarbe."),
    akzentfarbe: farbe.default("#c99a2e").describe("Zweite Farbe für Hervorhebungen."),
    position: z.enum(["rechts", "links"]).default("rechts").describe("Ecke, in der der Chat-Knopf sitzt."),
    knopfText: text(30).default("").describe("Eigener Text auf dem Chat-Knopf. Leer = der Knopf wählt selbst: während der Öffnungszeiten „Fragen? Chat starten“, außerhalb „Gerade niemand da? Schreiben Sie uns“ (nur wenn die Öffnungszeiten eindeutig eingetragen sind)."),
    begruessung: text(400).default("").describe("Erste Nachricht des Bots. Leer = Standardtext mit Bot-Name und Firmenname."),
    logoBuchstaben: text(3).default("").describe("1–3 Buchstaben als Logo auf der Bewerber-Seite, z. B. MM. Leer = Anfangsbuchstaben der Firma."),
  }).prefault({}),

  ton: z.object({
    anrede: z.enum(["Sie", "du"]).default("Sie").describe("Wie der Kunden-Chat die Besucher anspricht. Der Bewerber-Chat duzt immer."),
    stil: text(120).default("freundlich, kurz, konkret, ohne Floskeln").describe("Ton in Stichworten."),
  }).prefault({}),

  wissen: z.object({
    leistungen: z.array(Leistung).max(80).default([]).describe("Was der Betrieb anbietet. Einzige Preisquelle des Bots."),
    faq: z.array(Frage).max(60).default([]).describe("Häufige Fragen mit der richtigen Antwort."),
    freitext: text(6000).default("").describe("Alles Weitere, was der Bot wissen darf: Ablauf, Zahlung, Anfahrt, Besonderheiten."),
    websiteLesen: z.object({
      aktiv: z.boolean().default(false)
        .describe("Der Server liest einmal am Tag die Website des Kunden und gibt dem Kunden-Chat den Text als zusätzliches Wissen mit. Was der Bot dadurch weiß, siehst du hier unter dem Knopf „Jetzt einlesen“. Bei Widerspruch gilt, was in den Feldern eingetragen ist. Preise nennt der Bot weiter nur aus der Preisliste."),
      seiten: z.array(url).max(6).default([])
        .describe("Welche Seiten gelesen werden, eine Adresse pro Zeile (höchstens 6). Leer = die Startseite und die wichtigsten Unterseiten werden selbst gefunden. Es gehen nur Adressen der Website aus den Stammdaten."),
    }).prefault({}),
    hinweis: text(300).default("").describe("Aktueller Hinweis, z. B. „Betriebsferien vom 23.12. bis 6.1.“ oder „Im August nur Notdienst“. Der Bot nennt ihn, wenn es zur Frage passt. Leer = kein Hinweis."),
    zahlung: text(200).default("").describe("Wie kann bezahlt werden? z. B. „Bar, EC-Karte, Überweisung. Rechnung nach der Arbeit.“"),
    anfahrt: text(300).default("").describe("Anfahrt und Parken, oder ob und was die Anfahrt zum Kunden kostet."),
    wartezeit: text(200).default("").describe("Wie schnell gibt es üblicherweise einen Termin? z. B. „Meist innerhalb von zwei Wochen.“ Leer = der Bot sagt dazu nichts."),
    festeAntworten: z.array(FesteAntwort).max(30).default([])
      .describe("Antworten, die Wort für Wort feststehen. Greift ein Stichwort, antwortet der Bot genau damit und fragt die KI gar nicht erst. Für alles Heikle: Notfall, Reklamation, Rechtliches."),
    verboteneWoerter: z.array(text(60).min(3)).max(40).default([])
      .describe("Wörter, die in keiner Antwort vorkommen dürfen (z. B. Namen von Mitbewerbern). Enthält eine KI-Antwort eines davon, wird sie verworfen und der Bot verweist ans Team."),
    nurWissensbasis: z.boolean().default(true)
      .describe("Streng: Der Bot antwortet nur mit dem, was hier eingetragen ist. Kein Allgemeinwissen zur Branche, keine Tipps, keine Schätzungen. Empfohlen."),
    nieSagen: z.array(text(200).min(3)).max(20).default([]).describe("Was der Bot nie sagen oder versprechen darf, z. B. „Keine Aussagen zu Lieferzeiten“."),
    erlaubtePhrasen: z.array(text(80).min(3)).max(20).default([])
      .describe("Ausnahmen vom Zusage-Filter. Der Bot darf z. B. nie „kostenlos“ sagen – außer in den Formulierungen hier, etwa „Anfahrt kostenlos“."),
  }).prefault({}),

  module: z.object({
    kundenChat: z.object({
      aktiv: z.boolean().default(false),
      fotoCheck: z.boolean().default(false).describe("Besucher können ein Foto schicken, der Bot schätzt ein und empfiehlt eine Leistung."),
      fotoWorauf: text(600).default("").describe("Worauf der Bot auf Fotos achten soll."),
      startKnoepfe: z.array(text(40).min(1)).max(6).default([]).describe("Knöpfe unter der Begrüßung, z. B. die wichtigsten Leistungen."),
      objektLabel: text(30).default("Worum geht es?").describe("Beschriftung des Feldes im Anfrageformular, z. B. „Fahrzeug“ oder „Objekt“."),
      objektPlatzhalter: text(60).default(""),
    }).prefault({}),
    bewerberChat: z.object({
      aktiv: z.boolean().default(false),
      arbeitszeiten: text(200).default(""),
      bietet: text(400).default("").describe("„Das bieten wir“ in ein, zwei Sätzen. Der Bot antwortet nur damit – es muss stimmen."),
      ablauf: text(400).default("Nach der Bewerbung meldet sich jemand aus dem Team innerhalb von zwei Werktagen. Danach gibt es ein kurzes Kennenlernen.")
        .describe("Was nach der Bewerbung passiert."),
      stellen: z.array(Stelle).max(15).default([]),
      festeAntworten: z.array(FesteAntwort).max(20).default([{ stichworte: ["Gehalt", "verdien", "Bezahlung", "bezahlt", "Stundenlohn", "Monatslohn", "wie viel Geld"], antwort: "Das Gehalt besprechen wir offen im ersten Gespräch. Frag dort gern direkt danach." }])
        .describe("Feste Antworten für Bewerber, Wort für Wort und ohne KI. Voreingestellt: die Frage nach dem Gehalt."),
      initiativ: z.boolean().default(true).describe("Zusätzlich „Initiativbewerbung“ anbieten."),
      maxDateiMb: z.number().int().min(1).max(10).default(10).describe("Größte erlaubte Datei in MB (PDF, Word, Fotos)."),
    }).prefault({}),
    terminBot: z.object({
      aktiv: z.boolean().default(false),
      kalenderId: text(200).default("").describe("Kalender-ID aus Google Kalender (endet meist auf @group.calendar.google.com). Der Kunde gibt diesen Kalender für unser Dienstkonto frei."),
      termine: z.array(Terminart).max(12).default([]),
      zeiten: z.object(Object.fromEntries(TAGE.map((t) => [t, zeitfenster.default(["sa", "so"].includes(t) ? "" : "8-17")])) as Record<Wochentag, typeof zeitfenster>).prefault({})
        .describe("Wann Termine möglich sind, je Wochentag. Schreibweise: 8-12, 13-17 oder 7:30-16. Leer = an dem Tag keine Termine."),
      rasterMin: z.number().int().min(5).max(120).default(30).describe("Abstand der angebotenen Startzeiten in Minuten (30 = 8:00, 8:30, 9:00 …)."),
      pufferMin: z.number().int().min(0).max(120).default(15).describe("Pause nach jedem Termin in Minuten."),
      fahrtMin: z.number().int().min(0).max(180).default(0).describe("Fahrzeit vor und nach Terminen beim Kunden."),
      vorlaufStunden: z.number().int().min(0).max(336).default(24).describe("So viele Stunden vorher muss gebucht werden."),
      tageVoraus: z.number().int().min(1).max(90).default(28).describe("So weit im Voraus kann gebucht werden."),
    }).prefault({}),
    anfrageChat: z.object({
      aktiv: z.boolean().default(false),
      kategorien: z.array(text(60).min(1)).max(12).default([]).describe("Anliegen zum Antippen, z. B. „Störung“, „Neubau“."),
      sicherheitsregeln: z.array(Sicherheitsregel).max(20).default([])
        .describe("Feste Regeln im Code. Sie gelten immer und können von der KI nicht überstimmt werden."),
    }).prefault({}),
    anrufRetter: z.object({
      aktiv: z.boolean().default(false).describe("Noch nicht verfügbar. Bleibt aus, bis die Telefon-Anbindung fertig ist."),
      rufnummer: text(30).default(""), smsText: text(160).default(""),
    }).prefault({}),
  }).prefault({}),

  benachrichtigungen: z.object({
    anfragen: mails.describe("Wer Anfragen aus dem Kunden-Chat bekommt. Leer = Kontakt-Adresse aus den Stammdaten."),
    bewerbungen: mails.describe("Wer Bewerbungen bekommt."),
    termine: mails.describe("Wer neue und abgesagte Termine bekommt."),
    notfall: mails.describe("Zusätzliche Empfänger bei Dringlichkeit „Notfall“."),
  }).prefault({}),

  zugang: z.object({
    aktiv: z.boolean().default(false)
      .describe("Kunden-Zugang einschalten. Der Kunde kann dann unter …/verwalten Kleinigkeiten selbst ändern: Öffnungszeiten, aktueller Hinweis, Leistungen, häufige Fragen, Stellen. Das geht sofort live. Preise gelten erst nach der Freigabe hier im Admin-Panel. Alles andere (feste Antworten, Verbote, Module, Technik) bleibt gesperrt."),
    adressen: mails.describe("Wer sich anmelden darf: E-Mail-Adressen des Kunden, eine pro Zeile. Leer = die Kontakt-Adresse aus den Stammdaten. Angemeldet wird mit einem Code per E-Mail, ohne Passwort."),
  }).prefault({}),

  rechtliches: z.object({
    datenschutzUrl: urlOderLeer.describe("Link zur Datenschutzerklärung des Kunden. Pflicht, bevor ein Bot live geht."),
    impressumUrl: urlOderLeer,
    aufbewahrungTage: z.number().int().min(7).max(730).default(180).describe("Nach so vielen Tagen werden Anfragen, Bewerbungen und Unterlagen automatisch gelöscht."),
    poweredBy: z.boolean().default(true).describe("Hinweis „Powered by Claude (Anthropic)“ im Chat-Fenster zeigen."),
  }).prefault({}),

  technik: z.object({
    erlaubteWebsites: z.array(url).max(10).default([]).describe("Weitere Adressen, auf denen das Chat-Fenster laufen darf (die Website aus den Stammdaten ist immer erlaubt)."),
    tagesbudget: z.number().int().min(50).max(20000).default(500).describe("Höchstens so viele Chat-Nachrichten pro Tag für diesen Kunden. Schützt vor Spam."),
    monatsbudget: z.number().int().min(100).max(200000).default(5000).describe("Höchstens so viele Chat-Nachrichten pro Monat. Kostenbremse: 1.000 Nachrichten kosten grob 1–3 €."),
  }).prefault({}),
});

export type Kunde = z.infer<typeof KundeSchema>;
export type Fehler = { feld: string; text: string };

/** Prüft eine Konfiguration. Füllt Standardwerte auf und erklärt Fehler auf Deutsch. */
export function pruefeKunde(eingabe: unknown): { ok: true; kunde: Kunde } | { ok: false; fehler: Fehler[] } {
  const r = KundeSchema.safeParse(eingabe);
  if (!r.success) {
    return { ok: false, fehler: r.error.issues.map((i) => ({ feld: i.path.join("."), text: deutsch(i) })) };
  }
  const kunde = r.data, fehler: Fehler[] = [];
  // Regeln, die mehrere Felder betreffen
  const erlaubt = PAKETE[kunde.paket].module;
  for (const m of MODULE) {
    if (kunde.module[m].aktiv && !erlaubt.includes(m)) fehler.push({ feld: `module.${m}.aktiv`, text: `${MODUL_NAMEN[m]} ist im Paket „${PAKETE[kunde.paket].name}“ nicht enthalten.` });
  }
  for (const m of NOCH_NICHT) {
    if (kunde.module[m].aktiv) fehler.push({ feld: `module.${m}.aktiv`, text: `${MODUL_NAMEN[m]} ist für Kunden noch nicht verfügbar. Die Einstellungen können schon vorbereitet werden.` });
  }
  const ids = new Set<string>();
  kunde.module.bewerberChat.stellen.forEach((s, i) => { if (ids.has(s.id)) fehler.push({ feld: `module.bewerberChat.stellen.${i}.id`, text: `Den Kurznamen „${s.id}“ gibt es doppelt.` }); ids.add(s.id); });
  return fehler.length ? { ok: false, fehler } : { ok: true, kunde };
}

export function deutsch(i: any): string {
  if (i.message && !/^(Invalid|Too|Expected|Required|Unrecognized|String|Number|Array)/.test(i.message)) return i.message;
  if (i.code === "too_big" && i.origin === "array") return `Zu viele Einträge (höchstens ${i.maximum}).`;
  if (i.code === "too_big") return i.origin === "string" ? `Zu lang (höchstens ${i.maximum} Zeichen).` : `Zu groß (höchstens ${i.maximum}).`;
  if (i.code === "too_small") return i.origin === "string" ? "Bitte ausfüllen." : i.origin === "array" ? "Bitte mindestens einen Eintrag machen." : `Zu klein (mindestens ${i.minimum}).`;
  if (i.code === "invalid_type") return i.input === undefined || i.input === null ? "Bitte ausfüllen." : "Falsche Art von Wert.";
  if (i.code === "invalid_value") return "Dieser Wert ist hier nicht erlaubt.";
  return "Ungültiger Wert.";
}

/** Feld-Erklärungen (Pfad → Text) für die Hilfe im Admin-Panel und für KONFIGURATION.md. */
export function feldHilfen(): Record<string, string> {
  const out: Record<string, string> = {};
  const geh = (s: any, pfad: string) => {
    if (!s || typeof s !== "object") return;
    if (s.description && pfad) out[pfad] = s.description;
    if (s.properties) for (const [k, v] of Object.entries(s.properties)) geh(v, pfad ? `${pfad}.${k}` : k);
    if (s.items) geh(s.items, pfad + "[]");
    for (const k of ["anyOf", "oneOf"]) if (Array.isArray(s[k])) for (const x of s[k]) geh(x, pfad);
  };
  geh(z.toJSONSchema(KundeSchema, { io: "input" }), "");
  return out;
}
