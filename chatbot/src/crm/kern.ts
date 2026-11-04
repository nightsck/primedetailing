// Vertriebs-CRM: Datenmodell und alle Abläufe, unabhängig von Cloudflare.
// Auf Workers steckt das im Durable Object (src/crm/do.ts) mit SQLite,
// in Tests in node:sqlite. Beträge in Cent, Kalendertage als "JJJJ-MM-TT".
//
// Tabellen: firma (Mittelpunkt), ansprechpartner, kontakt (Kontakthistorie),
// dokument + dokteil (Kundenakte), produkt, vertrag, zahlung (Soll-Posten),
// einstellung, login/sitzung (Anmeldung), zaehler (Schutz vor Missbrauch).

export type Sql = { exec(q: string, ...p: unknown[]): { toArray(): any[] } };

export const STATUS = ["neu", "bewertet", "anruf_impuls", "angerufen", "infos_mail", "termin", "angebot", "kunde", "beendet", "kein_interesse"] as const;
export const STATUS_TEXT: Record<string, string> = {
  neu: "Neu", bewertet: "Bewertet", anruf_impuls: "Anruf-Impuls", angerufen: "Angerufen", infos_mail: "Infos per Mail",
  termin: "Termin / Demo", angebot: "Angebot", kunde: "Kunde", beendet: "Vertrag beendet", kein_interesse: "Kein Interesse",
};
export const ERGEBNISSE = ["nicht_erreicht", "rueckruf", "infos_mail", "termin", "kein_interesse", "widerspruch"] as const;
export const KANAELE = ["anruf", "email", "termin", "brief", "recherche", "notiz"] as const;
/** Qualifizierung beim Anruf (Punkt 6 der Anpassungsliste) */
export const QUALI = {
  entscheider: { ja: "Entscheider erreicht", nein: "Nicht der Entscheider" },
  bedarf: { hoch: "Bedarf hoch", mittel: "Bedarf mittel", gering: "Bedarf gering", keiner: "Kein Bedarf" },
  zeitrahmen: { sofort: "Sofort", monate3: "In 3 Monaten", monate6: "In 6 Monaten", spaeter: "Später", unklar: "Unklar" },
} as const;
export const VERLUSTGRUENDE: Record<string, string> = {
  zu_teuer: "Zu teuer", kein_bedarf: "Kein Bedarf", hat_loesung: "Hat schon eine Lösung", konkurrenz: "Anderer Anbieter",
  skeptisch: "Skeptisch gegenüber KI", zeitpunkt: "Falscher Zeitpunkt", kein_entscheider: "Entscheider nicht erreichbar", sonstiges: "Sonstiges",
};
/** Aufgaben / Wiedervorlagen: welche Arten es gibt */
export const AUFGABEN_ARTEN: Record<string, string> = {
  anruf: "Anruf", nachfassen: "Angebot nachfassen", ablauf: "Angebot läuft ab", frist: "Vertragsfrist", rueckgewinnung: "Rückgewinnung",
  einrichtung: "Technische Einrichtung", sonstiges: "Aufgabe",
};
const ANRUF_ARTEN = ["anruf", "nachfassen", "ablauf", "rueckgewinnung"];
export const UNTERLAGEN: Record<string, string> = { vertrag: "Unterschriebener Vertrag", avv: "Auftragsverarbeitungsvertrag (AVV)", sepa: "SEPA-Mandat" };
export const ONBOARDING: Record<string, string> = { einrichtung: "Einrichtung", test: "Test", golive: "Go-live" };

export const STANDARD_EINSTELLUNGEN = {
  bot_aktiv: true,
  /** "bw" = ganz Baden-Württemberg, alle Firmen mit Website oder E-Mail; "branchen" = nur Zielbranchen in Zielregionen */
  suchmodus: "bw",
  /** Höchstens so viele KI-Bewertungen pro Tag (Kostenbremse, ca. 0,05 Cent pro Bewertung) */
  ki_pro_tag: 40,
  zielbranchen: ["autowerkstatt", "fahrzeugpflege"],
  zielregionen: ["Stuttgart", "Karlsruhe", "Mannheim", "Freiburg im Breisgau", "Heilbronn", "Ulm"],
  schwelle: 70,
  impulse_pro_tag: 10,
  impulse_an: "kifuermeinenbetrieb@gmail.com",
  neue_pro_lauf: 40,
  infomail_betreff: "Ihre Infos zu KI für Ihren Betrieb",
  infomail_text: "Guten Tag {ansprechpartner},\n\nvielen Dank für das nette Telefonat. Wie besprochen schicke ich Ihnen hier die Infos.\n\nWir richten für Betriebe wie {firma} digitale Helfer ein, die Anfragen annehmen, wenn niemand ans Telefon kann: einen Chat auf der Website, Online-Terminbuchung und eine automatische Rückmeldung bei verpassten Anrufen. Eine Vorführung sehen Sie hier: https://primedetailing.eu/demo/\n\nWenn Sie Fragen haben, antworten Sie einfach auf diese Mail.\n\nViele Grüße",
  impressum: "",
  /** Team für Wiedervorlagen und Übergabe (Namen wie in CRM_NAMEN) */
  team: ["Tom", "Giosuè"],
  /** Wer die technische Einrichtung nach Vertragsabschluss übernimmt */
  technik: "Tom",
  /** Nach so vielen Werktagen ein Angebot nachfassen (0 = aus), zweites Nachfassen */
  nachfassen_tage: 3,
  nachfassen2_tage: 7,
  /** So viele Tage ist ein Angebot gültig */
  angebot_gueltig_tage: 30,
  /** So viele Tage vor dem letzten Kündigungstag erinnert der Fristen-Wächter */
  frist_vorlauf_tage: 45,
  /** Montags ab 8 Uhr Wochenbericht per Mail */
  wochenbericht: true,
};
export type Einstellungen = typeof STANDARD_EINSTELLUNGEN;

const TAG = 86_400_000;
export const tagAus = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(ms)); // JJJJ-MM-TT in deutscher Zeit
export const plusTage = (tag: string, n: number) => new Date(Date.parse(tag + "T12:00:00Z") + n * TAG).toISOString().slice(0, 10);
export function plusWerktage(tag: string, n: number) {
  let t = tag;
  while (n > 0) { t = plusTage(t, 1); const wd = new Date(t + "T12:00:00Z").getUTCDay(); if (wd !== 0 && wd !== 6) n--; }
  return t;
}
/** Monate addieren; der Tag wird aufs Monatsende begrenzt (31.01. + 1 Monat = 28.02.). */
export function plusMonate(tag: string, n: number) {
  const [j, m, t] = tag.split("-").map(Number);
  const letzter = new Date(Date.UTC(j, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(j, m - 1 + n, Math.min(t, letzter))).toISOString().slice(0, 10);
}
/** Mitternacht deutscher Zeit eines Kalendertags als Zeitstempel. */
export function mitternacht(tag: string) {
  const utc = Date.parse(tag + "T00:00:00Z");
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utc)).find((p) => p.type === "hour")?.value ?? 0);
  return utc - h * 3_600_000;
}
/** Montag der Woche eines Tages. */
export const montagVon = (tag: string) => plusTage(tag, -((new Date(tag + "T12:00:00Z").getUTCDay() + 6) % 7));
/** Fristen eines Vertrags mit Mindestlaufzeit: nächstes Laufzeitende und letzter Kündigungstag ab `heute`.
 *  Annahme: Nach der Mindestlaufzeit verlängert sich der Vertrag jeweils um dieselbe Laufzeit. */
export function fristen(v: { beginn: string; mindestlaufzeit?: number | null; frist_monate?: number | null; ende?: string | null; status?: string }, heute: string) {
  const monate = Number(v.mindestlaufzeit) || 0;
  if (monate <= 0 || !istTag(v.beginn)) return null;
  const frist = Math.max(0, Number(v.frist_monate) || 0);
  for (let k = 1; k < 100; k++) {
    const naechster = plusMonate(v.beginn, k * monate);
    const ende = plusTage(naechster, -1);
    const kuendigen_bis = plusTage(plusMonate(naechster, -frist), -1);
    if (kuendigen_bis >= heute) return { mindest_ende: plusTage(plusMonate(v.beginn, monate), -1), laufzeit_ende: ende, kuendigen_bis, verlaengert: k > 1 };
  }
  return null;
}
export const fristText = (monate: number, frist: number) => frist <= 0 ? "jederzeit" : `${frist} ${frist === 1 ? "Monat" : "Monate"} zum ${monate > 0 ? "Laufzeitende" : "Monatsende"}`;
export const laufzeitName = (monate: number) => monate > 0 ? `${monate} Monate` : "Monatlich kündbar";
export const istTag = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"));
const monatVon = (tag: string) => tag.slice(0, 7);
const monatPlus = (monat: string, n: number) => { const [j, m] = monat.split("-").map(Number); const d = new Date(Date.UTC(j, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const cent = (eur: unknown) => { const n = Number(String(eur ?? "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const txt = (s: unknown, max = 500) => (s === null || s === undefined ? null : String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) || null);
const deTag = (t: string) => t.split("-").reverse().join(".");
const wahr = (v: unknown) => v === true || v === 1 || v === "1" || v === "true" || v === "on";
export const nurZiffern =(s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^0049/, "0").replace(/^49/, "0");
export function domainVon(url: unknown): string | null {
  const s = String(url ?? "").trim();
  if (!s) return null;
  try { return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase() || null; } catch { return null; }
}

/** Startinhalt für den Leitfaden „Allgemein“; Giosuè passt ihn im CRM an und legt weitere pro Branche an. */
const LEITFADEN_ALLGEMEIN = {
  einstieg: "Guten Tag, hier ist … von „KI für deinen Betrieb“. Ich rufe an, weil mir auf Ihrer Website aufgefallen ist, dass … Haben Sie zwei Minuten?\n\nDatenschutz-Hinweis beim ersten Kontakt: Ihre Firmendaten haben wir aus öffentlichen Quellen (OpenStreetMap, Ihre Website). Wenn Sie keinen Kontakt wünschen, trage ich Sie sofort aus.",
  fragen: "• Wie viele Anrufe verpassen Sie, wenn Sie gerade beim Kunden oder in der Werkstatt sind?\n• Wie kommen Termine heute zustande: Telefon, Mail, WhatsApp?\n• Wer entscheidet bei Ihnen über so etwas?\n• Wann wäre ein guter Zeitpunkt, das anzugehen?",
  einwaende: "„Keine Zeit“ → Genau deshalb: Der Helfer nimmt Anfragen an, wenn Sie keine Zeit haben. Darf ich Ihnen eine kurze Vorführung schicken?\n„Zu teuer“ → Ein verpasster Auftrag im Monat zahlt das meist schon. Wir können klein anfangen, monatlich kündbar.\n„Kunden wollen Menschen“ → Der Helfer ersetzt niemanden, er nimmt nur auf, was sonst verloren geht, und Sie rufen zurück.\n„Haben wir schon“ → Was nutzen Sie? Wie zufrieden sind Sie damit?",
};

const FIRMA_FELDER =["name", "branche", "strasse", "plz", "ort", "bundesland", "telefon", "website", "email", "notiz", "zustaendig", "wiedervorlage", "status"] as const;

export function crmKern(sql: Sql, uhr: () => number = () => Date.now()) {
  const q = (s: string, ...p: unknown[]) => sql.exec(s, ...p.map((x) => (x === undefined ? null : typeof x === "boolean" ? (x ? 1 : 0) : x))).toArray();
  const eins = (s: string, ...p: unknown[]) => q(s, ...p)[0];
  const neueId = () => Number(eins("SELECT last_insert_rowid() AS id").id);

  for (const s of [
    `CREATE TABLE IF NOT EXISTS firma (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, branche TEXT, strasse TEXT, plz TEXT, ort TEXT, bundesland TEXT,
      telefon TEXT, telefon_norm TEXT, website TEXT, domain TEXT, email TEXT, quelle TEXT, quelle_id TEXT, score INTEGER, score_grund TEXT, einstieg TEXT, infos TEXT,
      status TEXT NOT NULL DEFAULT 'neu', einwilligung INTEGER NOT NULL DEFAULT 0, einwilligung_datum TEXT, einwilligung_nachweis TEXT,
      gesperrt INTEGER NOT NULL DEFAULT 0, gesperrt_grund TEXT, gesperrt_datum TEXT, wiedervorlage TEXT, zustaendig TEXT, notiz TEXT,
      impuls_am TEXT, bewertet_am INTEGER, erstellt INTEGER NOT NULL, geaendert INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS firma_domain ON firma(domain)`,
    `CREATE INDEX IF NOT EXISTS firma_tel ON firma(telefon_norm)`,
    `CREATE INDEX IF NOT EXISTS firma_quelle ON firma(quelle_id)`,
    `CREATE INDEX IF NOT EXISTS firma_status ON firma(status)`,
    `CREATE TABLE IF NOT EXISTS ansprechpartner (id INTEGER PRIMARY KEY AUTOINCREMENT, firma_id INTEGER NOT NULL, name TEXT NOT NULL, rolle TEXT, telefon TEXT, email TEXT, notiz TEXT)`,
    `CREATE TABLE IF NOT EXISTS kontakt (id INTEGER PRIMARY KEY AUTOINCREMENT, firma_id INTEGER NOT NULL, zeitpunkt INTEGER NOT NULL, kanal TEXT NOT NULL, richtung TEXT,
      durch TEXT, ergebnis TEXT, notiz TEXT, einwilligung INTEGER NOT NULL DEFAULT 0, naechster_schritt TEXT, wiedervorlage TEXT)`,
    `CREATE INDEX IF NOT EXISTS kontakt_firma ON kontakt(firma_id, zeitpunkt)`,
    `CREATE TABLE IF NOT EXISTS dokument (id TEXT PRIMARY KEY, firma_id INTEGER NOT NULL, vertrag_id INTEGER, titel TEXT NOT NULL, typ TEXT NOT NULL, name TEXT NOT NULL,
      mime TEXT NOT NULL, groesse INTEGER NOT NULL, datum TEXT, erstellt INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS dokteil (id TEXT NOT NULL, nr INTEGER NOT NULL, daten BLOB NOT NULL, PRIMARY KEY (id, nr))`,
    `CREATE TABLE IF NOT EXISTS produkt (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, beschreibung TEXT, einmal_ct INTEGER NOT NULL DEFAULT 0,
      monat_ct INTEGER NOT NULL DEFAULT 0, leistung TEXT, aktiv INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS vertrag (id INTEGER PRIMARY KEY AUTOINCREMENT, firma_id INTEGER NOT NULL, nummer TEXT NOT NULL, produkt TEXT, beginn TEXT NOT NULL,
      mindestlaufzeit INTEGER, kuendigungsfrist TEXT, ende TEXT, status TEXT NOT NULL DEFAULT 'aktiv', einmal_ct INTEGER NOT NULL DEFAULT 0,
      monat_ct INTEGER NOT NULL DEFAULT 0, notiz TEXT, erstellt INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS zahlung (id INTEGER PRIMARY KEY AUTOINCREMENT, vertrag_id INTEGER NOT NULL, firma_id INTEGER NOT NULL, art TEXT NOT NULL,
      leistungsmonat TEXT NOT NULL, betrag_ct INTEGER NOT NULL, faellig TEXT NOT NULL, bezahlt INTEGER NOT NULL DEFAULT 0, bezahlt_am TEXT,
      rechnungsnummer TEXT, erinnert INTEGER NOT NULL DEFAULT 0, UNIQUE (vertrag_id, art, leistungsmonat))`,
    `CREATE TABLE IF NOT EXISTS einstellung (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS login (hash TEXT PRIMARY KEY, email TEXT NOT NULL, ablauf INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sitzung (hash TEXT PRIMARY KEY, email TEXT NOT NULL, ablauf INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS zaehler (k TEXT PRIMARY KEY, n INTEGER NOT NULL, bis INTEGER NOT NULL)`,
    // Anpassungen 11/2026: Laufzeiten, Angebote, Aufgaben (Wiedervorlagen), Gesprächsleitfäden
    `CREATE TABLE IF NOT EXISTS laufzeit (id INTEGER PRIMARY KEY AUTOINCREMENT, produkt_id INTEGER NOT NULL, monate INTEGER NOT NULL DEFAULT 0,
      frist_monate INTEGER NOT NULL DEFAULT 1, kuendigungsfrist TEXT, einmal_ct INTEGER NOT NULL DEFAULT 0, monat_ct INTEGER NOT NULL DEFAULT 0, reihe INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS angebot (id INTEGER PRIMARY KEY AUTOINCREMENT, firma_id INTEGER NOT NULL, nummer TEXT NOT NULL, produkt_id INTEGER, laufzeit_id INTEGER,
      produkt TEXT, laufzeit TEXT, monate INTEGER NOT NULL DEFAULT 0, frist_monate INTEGER NOT NULL DEFAULT 1, kuendigungsfrist TEXT,
      einmal_ct INTEGER NOT NULL DEFAULT 0, monat_ct INTEGER NOT NULL DEFAULT 0, datum TEXT NOT NULL, gueltig_bis TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offen', verlustgrund TEXT, entschieden_am TEXT, vertrag_id INTEGER, wichtig INTEGER NOT NULL DEFAULT 0, notiz TEXT, durch TEXT, erstellt INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS angebot_firma ON angebot(firma_id)`,
    `CREATE TABLE IF NOT EXISTS aufgabe (id INTEGER PRIMARY KEY AUTOINCREMENT, firma_id INTEGER NOT NULL, art TEXT NOT NULL, titel TEXT, faellig TEXT NOT NULL,
      zustaendig TEXT, grund TEXT, wichtig INTEGER NOT NULL DEFAULT 0, angebot_id INTEGER, vertrag_id INTEGER, verschoben INTEGER NOT NULL DEFAULT 0,
      erledigt INTEGER NOT NULL DEFAULT 0, erledigt_am TEXT, erledigt_durch TEXT, durch TEXT, erstellt INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS aufgabe_offen ON aufgabe(erledigt, faellig)`,
    `CREATE INDEX IF NOT EXISTS aufgabe_firma ON aufgabe(firma_id)`,
    `CREATE TABLE IF NOT EXISTS leitfaden (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, stichworte TEXT, einstieg TEXT, fragen TEXT, einwaende TEXT, geaendert INTEGER NOT NULL)`,
  ]) sql.exec(s);
  // Neue Spalten an bestehenden Tabellen (die Datenbank läuft schon, daher nachträglich)
  const spalten = (t: string) => new Set(q(`SELECT name FROM pragma_table_info('${t}')`).map((r) => String(r.name)));
  for (const [t, neu] of Object.entries({
    firma: ["wichtig INTEGER NOT NULL DEFAULT 0", "entscheider TEXT", "bedarf TEXT", "zeitrahmen TEXT", "verlustgrund TEXT"],
    kontakt: ["wichtig INTEGER NOT NULL DEFAULT 0", "code TEXT", "entscheider TEXT", "bedarf TEXT", "zeitrahmen TEXT", "verlustgrund TEXT", "angebot_id INTEGER"],
    vertrag: ["laufzeit TEXT", "frist_monate INTEGER", "angebot_id INTEGER", "u_vertrag TEXT", "u_avv TEXT", "u_sepa TEXT",
      "ob_einrichtung TEXT", "ob_test TEXT", "ob_golive TEXT", "frist_erinnert TEXT"],
  })) {
    const da = spalten(t);
    for (const s of neu) if (!da.has(s.split(" ")[0])) sql.exec(`ALTER TABLE ${t} ADD COLUMN ${s}`);
  }
  // Alte Wiedervorlage-Daten an Firmen werden zu offenen Aufgaben (einmalig)
  for (const f of q("SELECT id, wiedervorlage, zustaendig FROM firma WHERE wiedervorlage IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aufgabe a WHERE a.firma_id = firma.id)"))
    q("INSERT INTO aufgabe (firma_id, art, faellig, zustaendig, durch, erstellt) VALUES (?, 'anruf', ?, ?, 'System', ?)", f.id, f.wiedervorlage, f.zustaendig, uhr());
  // Alte Produkte ohne Laufzeit: ihr Preis wird zur ersten Laufzeit „monatlich kündbar“
  for (const p of q("SELECT * FROM produkt WHERE NOT EXISTS (SELECT 1 FROM laufzeit l WHERE l.produkt_id = produkt.id)"))
    q("INSERT INTO laufzeit (produkt_id, monate, frist_monate, kuendigungsfrist, einmal_ct, monat_ct) VALUES (?, 0, 1, ?, ?, ?)", p.id, fristText(0, 1), p.einmal_ct, p.monat_ct);
  if (!eins("SELECT id FROM leitfaden LIMIT 1")) q("INSERT INTO leitfaden (name, stichworte, einstieg, fragen, einwaende, geaendert) VALUES (?, '', ?, ?, ?, ?)",
    "Allgemein", LEITFADEN_ALLGEMEIN.einstieg, LEITFADEN_ALLGEMEIN.fragen, LEITFADEN_ALLGEMEIN.einwaende, uhr());

  /* ---------- Einstellungen ---------- */
  function einstellungen(): Einstellungen {
    const e: any = { ...STANDARD_EINSTELLUNGEN };
    for (const r of q("SELECT k, v FROM einstellung")) if (r.k in e) { try { e[r.k] = JSON.parse(r.v); } catch { /* alter Wert bleibt */ } }
    return e;
  }
  function einstellungenSetzen(neu: Partial<Einstellungen>) {
    const s: any = STANDARD_EINSTELLUNGEN;
    for (const [k, v] of Object.entries(neu || {})) {
      if (!(k in s)) continue;
      let w: any = v;
      if (Array.isArray(s[k])) w = (Array.isArray(v) ? v : String(v ?? "").split(/[,\n]/)).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 50);
      else if (typeof s[k] === "number") { w = Number(v); if (!Number.isFinite(w)) continue; w = Math.max(0, Math.min(1000, Math.round(w))); }
      else if (typeof s[k] === "boolean") w = v === true || v === "true" || v === 1 || v === "1";
      else w = String(v ?? "").slice(0, 5000);
      if (k === "suchmodus" && w !== "bw" && w !== "branchen") continue;
      q("INSERT INTO einstellung (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, JSON.stringify(w));
    }
    return einstellungen();
  }
  const zustand = (k: string, v?: unknown) => {
    if (v === undefined) { const r = eins("SELECT v FROM einstellung WHERE k = ?", "_" + k); return r ? JSON.parse(r.v) : null; }
    q("INSERT INTO einstellung (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", "_" + k, JSON.stringify(v));
    return v;
  };

  /* ---------- Firmen ---------- */
  function doppelt(d: { name?: unknown; plz?: unknown; telefon?: unknown; website?: unknown; quelle_id?: unknown }, ausser = 0): number | null {
    const dom = domainVon(d.website), tel = nurZiffern(d.telefon);
    const r = (d.quelle_id && eins("SELECT id FROM firma WHERE quelle_id = ? AND id != ?", d.quelle_id, ausser))
      || (dom && eins("SELECT id FROM firma WHERE domain = ? AND id != ?", dom, ausser))
      || (tel.length >= 6 && eins("SELECT id FROM firma WHERE telefon_norm = ? AND id != ?", tel, ausser))
      || (d.name && d.plz && eins("SELECT id FROM firma WHERE lower(name) = lower(?) AND plz = ? AND id != ?", String(d.name).trim(), String(d.plz).trim(), ausser));
    return r ? Number(r.id) : null;
  }
  function firmaAnlegen(d: any, durch: string, quelle = "manuell"): { id: number; neu: boolean } {
    const name = txt(d?.name, 200);
    if (!name) throw new Error("Bitte einen Firmennamen eintragen.");
    const vorhanden = doppelt(d);
    if (vorhanden) return { id: vorhanden, neu: false };
    const jetzt = uhr();
    q(`INSERT INTO firma (name, branche, strasse, plz, ort, bundesland, telefon, telefon_norm, website, domain, email, quelle, quelle_id, status, notiz, zustaendig, erstellt, geaendert)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'neu', ?, ?, ?, ?)`,
      name, txt(d.branche, 100), txt(d.strasse, 200), txt(d.plz, 10), txt(d.ort, 100), txt(d.bundesland, 60), txt(d.telefon, 60), nurZiffern(d.telefon) || null,
      txt(d.website, 300), domainVon(d.website), txt(d.email, 200), quelle, txt(d.quelle_id, 100), txt(d.notiz, 4000), txt(d.zustaendig, 60), jetzt, jetzt);
    const id = neueId();
    kontakt(id, { kanal: "recherche", durch, ergebnis: quelle === "bot" ? "Firma vom Bot gefunden" : "Firma angelegt" });
    return { id, neu: true };
  }
  function firmaAendern(id: number, d: any) {
    const f = eins("SELECT id FROM firma WHERE id = ?", id);
    if (!f) throw new Error("Firma nicht gefunden.");
    const sets: string[] = [], werte: unknown[] = [];
    for (const k of FIRMA_FELDER) {
      if (!(k in (d || {})) || k === "wiedervorlage") continue;
      let v: unknown = txt(d[k], k === "notiz" ? 4000 : 300);
      if (k === "name" && !v) throw new Error("Der Firmenname darf nicht leer sein.");
      if (k === "status" && !STATUS.includes(v as any)) continue;
      if (k === "wiedervorlage" && v && !istTag(v)) continue;
      sets.push(`${k} = ?`); werte.push(v);
      if (k === "telefon") { sets.push("telefon_norm = ?"); werte.push(nurZiffern(v) || null); }
      if (k === "website") { sets.push("domain = ?"); werte.push(domainVon(v)); }
    }
    if ("wichtig" in (d || {})) { sets.push("wichtig = ?"); werte.push(wahr(d.wichtig) ? 1 : 0); }
    if (sets.length) q(`UPDATE firma SET ${sets.join(", ")}, geaendert = ? WHERE id = ?`, ...werte, uhr(), id);
    if ("wiedervorlage" in (d || {}) && (d.wiedervorlage === "" || d.wiedervorlage === null || istTag(d.wiedervorlage))) {
      const offen = eins("SELECT faellig FROM aufgabe WHERE firma_id = ? AND erledigt = 0 AND art = 'anruf' ORDER BY faellig LIMIT 1", id);
      if ((offen?.faellig ?? null) !== (d.wiedervorlage || null)) wiedervorlageSetzen(id, d.wiedervorlage || null, { durch: d.durch || "Team", zustaendig: d.zustaendig });
    }
    return firma(id);
  }
  function firmaLoeschen(id: number) {
    for (const d of q("SELECT id FROM dokument WHERE firma_id = ?", id)) q("DELETE FROM dokteil WHERE id = ?", d.id);
    for (const t of ["dokument", "ansprechpartner", "kontakt", "zahlung", "vertrag", "aufgabe", "angebot"]) q(`DELETE FROM ${t} WHERE firma_id = ?`, id);
    q("DELETE FROM firma WHERE id = ?", id);
  }
  const firmaZeile = (r: any) => r && ({ ...r, infos: r.infos ? JSON.parse(r.infos) : null, einwilligung: !!r.einwilligung, gesperrt: !!r.gesperrt, wichtig: !!r.wichtig });
  function firma(id: number) {
    const f = firmaZeile(eins("SELECT * FROM firma WHERE id = ?", id));
    if (!f) return null;
    const heute = tagAus(uhr());
    return {
      ...f,
      ansprechpartner: q("SELECT * FROM ansprechpartner WHERE firma_id = ? ORDER BY id", id),
      kontakte: q("SELECT * FROM kontakt WHERE firma_id = ? ORDER BY wichtig DESC, zeitpunkt DESC, id DESC LIMIT 200", id).map((k) => ({ ...k, einwilligung: !!k.einwilligung, wichtig: !!k.wichtig })),
      dokumente: q("SELECT id, vertrag_id, titel, typ, name, mime, groesse, datum, erstellt FROM dokument WHERE firma_id = ? ORDER BY erstellt DESC", id),
      vertraege: q("SELECT * FROM vertrag WHERE firma_id = ? ORDER BY beginn DESC", id).map((v) => vertragZeile(v, heute)),
      zahlungen: zahlungen({ firma_id: id }),
      aufgaben: aufgaben({ firma_id: id, offen: true }),
      angebote: q("SELECT * FROM angebot WHERE firma_id = ? ORDER BY wichtig DESC, (status = 'offen') DESC, datum DESC", id).map((a) => angebotZeile(a, heute)),
      leitfaden: leitfadenFuer(f.branche),
    };
  }
  function firmen(o: { q?: string; status?: string; limit?: number } = {}) {
    const w: string[] = [], p: unknown[] = [];
    if (o.status && STATUS.includes(o.status as any)) { w.push("status = ?"); p.push(o.status); }
    if (o.q) { w.push("(name LIKE ? OR ort LIKE ? OR plz LIKE ? OR telefon LIKE ? OR domain LIKE ?)"); const s = `%${String(o.q).slice(0, 80)}%`; p.push(s, s, s, s, s); }
    const lim = Math.max(1, Math.min(500, Number(o.limit) || 200));
    return q(`SELECT id, name, branche, ort, plz, telefon, website, status, score, gesperrt, wiedervorlage, einwilligung, wichtig FROM firma
      ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY wichtig DESC, geaendert DESC LIMIT ${lim}`, ...p).map((r) => ({ ...r, gesperrt: !!r.gesperrt, einwilligung: !!r.einwilligung, wichtig: !!r.wichtig }));
  }
  function pipeline() {
    const zahlen: Record<string, number> = Object.fromEntries(STATUS.map((s) => [s, 0]));
    for (const r of q("SELECT status, COUNT(*) AS n FROM firma GROUP BY status")) zahlen[r.status] = Number(r.n);
    const spalten: Record<string, any[]> = {};
    for (const s of STATUS) spalten[s] = q("SELECT id, name, ort, score, wiedervorlage, gesperrt, wichtig FROM firma WHERE status = ? ORDER BY wichtig DESC, score DESC, geaendert DESC LIMIT 40", s)
      .map((r) => ({ ...r, gesperrt: !!r.gesperrt, wichtig: !!r.wichtig }));
    return { zahlen, spalten };
  }
  /** Firmen, die heute angerufen werden sollen: Anruf-Impulse und fällige Anruf-Wiedervorlagen (auch überfällige). */
  function heuteAnrufen(heute = tagAus(uhr())) {
    return q(`SELECT f.id, f.name, f.branche, f.ort, f.telefon, f.score, f.score_grund, f.einstieg, f.status, f.wichtig,
        (SELECT MIN(a.faellig) FROM aufgabe a WHERE a.firma_id = f.id AND a.erledigt = 0 AND a.art IN ('anruf','nachfassen','ablauf','rueckgewinnung') AND a.faellig <= ?) AS wiedervorlage
      FROM firma f WHERE f.gesperrt = 0 AND (f.status = 'anruf_impuls'
        OR EXISTS (SELECT 1 FROM aufgabe a WHERE a.firma_id = f.id AND a.erledigt = 0 AND a.art IN ('anruf','nachfassen','ablauf','rueckgewinnung') AND a.faellig <= ?))
      ORDER BY f.wichtig DESC, (wiedervorlage IS NOT NULL) DESC, f.score DESC LIMIT 100`, heute, heute).map((r) => ({ ...r, wichtig: !!r.wichtig }));
  }

  /* ---------- Aufgaben und Wiedervorlagen (Punkte 3, 5, 4, 9) ---------- */
  const aufgabeZeile = (a: any, heute: string) => a && ({ ...a, wichtig: !!a.wichtig, erledigt: !!a.erledigt, ueberfaellig: !a.erledigt && a.faellig < heute,
    titel: a.titel || AUFGABEN_ARTEN[a.art] || "Aufgabe" });
  /** Offene Aufgaben; wichtige zuerst, dann nach Fälligkeit. */
  function aufgaben(o: { offen?: boolean; firma_id?: number; bis?: string; zustaendig?: string; limit?: number } = {}) {
    const heute = tagAus(uhr());
    const w: string[] = [], p: unknown[] = [];
    if (o.offen !== false) w.push("a.erledigt = 0");
    if (o.firma_id) { w.push("a.firma_id = ?"); p.push(o.firma_id); }
    if (o.bis) { w.push("a.faellig <= ?"); p.push(o.bis); }
    if (o.zustaendig) { w.push("(a.zustaendig = ? OR a.zustaendig IS NULL)"); p.push(o.zustaendig); }
    const lim = Math.max(1, Math.min(500, Number(o.limit) || 300));
    return q(`SELECT a.*, f.name AS firma, f.telefon, f.ort, f.branche, f.wichtig AS firma_wichtig, f.gesperrt FROM aufgabe a JOIN firma f ON f.id = a.firma_id
      ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY (a.wichtig OR f.wichtig) DESC, a.faellig, a.id LIMIT ${lim}`, ...p)
      .map((a) => ({ ...aufgabeZeile(a, heute), firma_wichtig: !!a.firma_wichtig, gesperrt: !!a.gesperrt }));
  }
  /** Firma.wiedervorlage zeigt immer die nächste offene Aufgabe (für Listen und die alte Ansicht). */
  function wvSync(firmaId: number) {
    const r = eins("SELECT MIN(faellig) AS t FROM aufgabe WHERE firma_id = ? AND erledigt = 0", firmaId);
    q("UPDATE firma SET wiedervorlage = ? WHERE id = ?", r?.t ?? null, firmaId);
  }
  function aufgabeAnlegen(firmaId: number, d: any, durch: string) {
    if (!eins("SELECT id FROM firma WHERE id = ?", firmaId)) throw new Error("Firma nicht gefunden.");
    const faellig = istTag(d?.faellig) ? d.faellig : null;
    if (!faellig) throw new Error("Bitte ein Datum für die Wiedervorlage wählen.");
    const art = d.art in AUFGABEN_ARTEN ? d.art : "anruf";
    q(`INSERT INTO aufgabe (firma_id, art, titel, faellig, zustaendig, grund, wichtig, angebot_id, vertrag_id, durch, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      firmaId, art, txt(d.titel, 200), faellig, txt(d.zustaendig, 60), txt(d.grund, 500), wahr(d.wichtig) ? 1 : 0, Number(d.angebot_id) || null, Number(d.vertrag_id) || null, txt(durch, 60) || "Team", uhr());
    const id = neueId();
    wvSync(firmaId);
    return id;
  }
  /** Anruf-Wiedervorlage einer Firma neu setzen: offene Anruf-Wiedervorlagen werden ersetzt. null = keine. */
  function wiedervorlageSetzen(firmaId: number, tag: string | null, o: { durch?: string; zustaendig?: string; grund?: string; wichtig?: boolean } = {}) {
    q("UPDATE aufgabe SET erledigt = 1, erledigt_am = ?, erledigt_durch = ? WHERE firma_id = ? AND erledigt = 0 AND art = 'anruf'", tagAus(uhr()), txt(o.durch, 60) || "Team", firmaId);
    if (tag) aufgabeAnlegen(firmaId, { art: "anruf", faellig: tag, zustaendig: o.zustaendig, grund: o.grund, wichtig: o.wichtig }, o.durch || "Team");
    else wvSync(firmaId);
  }
  function aufgabeErledigen(id: number, durch: string, erledigt = true) {
    const a = eins("SELECT * FROM aufgabe WHERE id = ?", id);
    if (!a) throw new Error("Aufgabe nicht gefunden.");
    q("UPDATE aufgabe SET erledigt = ?, erledigt_am = ?, erledigt_durch = ? WHERE id = ?", erledigt ? 1 : 0, erledigt ? tagAus(uhr()) : null, erledigt ? txt(durch, 60) : null, id);
    wvSync(a.firma_id);
    return aufgabeZeile(eins("SELECT * FROM aufgabe WHERE id = ?", id), tagAus(uhr()));
  }
  /** Wiedervorlage mit wenigen Klicks: neues Datum, optional Grund, optional an jemand anderen übergeben. */
  function aufgabeVerschieben(id: number, d: any, durch: string) {
    const a = eins("SELECT * FROM aufgabe WHERE id = ?", id);
    if (!a) throw new Error("Aufgabe nicht gefunden.");
    const faellig = istTag(d?.faellig) ? d.faellig : null;
    if (!faellig) throw new Error("Bitte ein neues Datum wählen.");
    const an = d && "zustaendig" in d ? txt(d.zustaendig, 60) : a.zustaendig;
    const grund = txt(d?.grund, 500);
    q("UPDATE aufgabe SET faellig = ?, zustaendig = ?, grund = COALESCE(?, grund), verschoben = verschoben + 1 WHERE id = ?", faellig, an, grund, id);
    wvSync(a.firma_id);
    const uebergeben = an && an !== a.zustaendig && an !== durch;
    kontakt(a.firma_id, { kanal: "notiz", durch, ergebnis: `Wiedervorlage auf ${deTag(faellig)} verschoben${uebergeben ? `, übergeben an ${an}` : ""}`, notiz: grund, wiedervorlage: faellig });
    return aufgabeZeile(eins("SELECT * FROM aufgabe WHERE id = ?", id), tagAus(uhr()));
  }
  /** „Wichtig“ an Firma, Kontakt (Vorgang), Angebot oder Aufgabe (Punkt 2). */
  function wichtigSetzen(art: string, id: number, ja: boolean) {
    const t = ({ firma: "firma", kontakt: "kontakt", angebot: "angebot", aufgabe: "aufgabe" } as Record<string, string>)[art];
    if (!t) throw new Error("Unbekannte Art.");
    q(`UPDATE ${t} SET wichtig = ? WHERE id = ?`, ja ? 1 : 0, id);
    return { ok: true };
  }

  /* ---------- Ansprechpartner, Kontakte ---------- */
  function ansprechpartner(firmaId: number, d: any) {
    if (!eins("SELECT id FROM firma WHERE id = ?", firmaId)) throw new Error("Firma nicht gefunden.");
    const name = txt(d?.name, 120);
    if (!name) throw new Error("Bitte einen Namen eintragen.");
    q("INSERT INTO ansprechpartner (firma_id, name, rolle, telefon, email, notiz) VALUES (?, ?, ?, ?, ?, ?)", firmaId, name, txt(d.rolle, 80), txt(d.telefon, 60), txt(d.email, 200), txt(d.notiz, 1000));
    return neueId();
  }
  const ansprechpartnerLoeschen = (id: number) => { q("DELETE FROM ansprechpartner WHERE id = ?", id); };
  function kontakt(firmaId: number, k: any) {
    const kanal = KANAELE.includes(k?.kanal) ? k.kanal : "notiz";
    const aus = (liste: Record<string, string>, v: unknown) => (typeof v === "string" && v in liste ? v : null);
    q(`INSERT INTO kontakt (firma_id, zeitpunkt, kanal, richtung, durch, ergebnis, notiz, einwilligung, naechster_schritt, wiedervorlage, wichtig, code, entscheider, bedarf, zeitrahmen, verlustgrund, angebot_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      firmaId, Number(k.zeitpunkt) || uhr(), kanal, k.richtung === "ein" ? "ein" : k.richtung === "aus" ? "aus" : null, txt(k.durch, 60) || "Team",
      txt(k.ergebnis, 300), txt(k.notiz, 4000), k.einwilligung ? 1 : 0, txt(k.naechster_schritt, 300), istTag(k.wiedervorlage) ? k.wiedervorlage : null,
      wahr(k.wichtig) ? 1 : 0, txt(k.code, 30), aus(QUALI.entscheider, k.entscheider), aus(QUALI.bedarf, k.bedarf), aus(QUALI.zeitrahmen, k.zeitrahmen),
      aus(VERLUSTGRUENDE, k.verlustgrund), Number(k.angebot_id) || null);
    return neueId();
  }

  /* ---------- Anruf erfassen (W4), Sperre, Einwilligung ---------- */
  function anrufErfassen(id: number, d: any, durch: string) {
    const f = eins("SELECT id, status, gesperrt FROM firma WHERE id = ?", id);
    if (!f) throw new Error("Firma nicht gefunden.");
    const ergebnis = ERGEBNISSE.includes(d?.ergebnis) ? d.ergebnis : null;
    if (!ergebnis) throw new Error("Bitte ein Ergebnis wählen.");
    const heute = tagAus(uhr());
    const notiz = txt(d.notiz, 4000);
    let status = f.status === "anruf_impuls" || f.status === "neu" || f.status === "bewertet" ? "angerufen" : f.status;
    let wv: string | null = istTag(d.wiedervorlage) ? d.wiedervorlage : null;
    const einwilligung = !!d.einwilligung && ergebnis === "infos_mail";
    const texte: Record<string, string> = {
      nicht_erreicht: "Nicht erreicht", rueckruf: "Rückruf vereinbart", infos_mail: "Infos per Mail erwünscht",
      termin: "Termin vereinbart", kein_interesse: "Kein Interesse", widerspruch: "Widerspruch: keine weiteren Kontakte",
    };
    if (ergebnis === "nicht_erreicht") wv = wv || plusWerktage(heute, 2);
    if (ergebnis === "rueckruf") wv = wv || plusWerktage(heute, 1);
    if (ergebnis === "infos_mail") { if (einwilligung) status = "infos_mail"; wv = wv || plusWerktage(heute, 5); }
    if (ergebnis === "termin") { status = "termin"; }
    if (ergebnis === "kein_interesse") { status = "kein_interesse"; wv = null; }
    const verlust = (ergebnis === "kein_interesse" || ergebnis === "widerspruch") && d.verlustgrund in VERLUSTGRUENDE ? d.verlustgrund : null;
    if (ergebnis === "kein_interesse" && !verlust) throw new Error("Bitte einen Verlustgrund wählen.");
    // Qualifizierung: nur gesetzte Werte überschreiben den Stand an der Firma
    const quali: Record<string, string | null> = {};
    for (const k of ["entscheider", "bedarf", "zeitrahmen"] as const) quali[k] = typeof d[k] === "string" && d[k] in QUALI[k] ? d[k] : null;
    q(`UPDATE firma SET status = ?, entscheider = COALESCE(?, entscheider), bedarf = COALESCE(?, bedarf), zeitrahmen = COALESCE(?, zeitrahmen),
       verlustgrund = COALESCE(?, verlustgrund), geaendert = ? WHERE id = ?`, status, quali.entscheider, quali.bedarf, quali.zeitrahmen, verlust, uhr(), id);
    // Der Anruf erledigt fällige Anruf-Aufgaben (Wiedervorlage, Nachfassen, Rückgewinnung) dieser Firma
    q(`UPDATE aufgabe SET erledigt = 1, erledigt_am = ?, erledigt_durch = ? WHERE firma_id = ? AND erledigt = 0 AND art IN ('anruf','nachfassen','ablauf','rueckgewinnung')
       AND (faellig <= ? OR id = ? OR art = 'anruf')`, heute, durch, id, heute, Number(d.aufgabe_id) || 0);
    if (ergebnis === "kein_interesse") q("UPDATE aufgabe SET erledigt = 1, erledigt_am = ?, erledigt_durch = ? WHERE firma_id = ? AND erledigt = 0 AND art IN ('anruf','nachfassen','ablauf','rueckgewinnung')", heute, durch, id);
    if (wv) aufgabeAnlegen(id, { art: "anruf", faellig: wv, zustaendig: d.zustaendig, grund: txt(d.naechster_schritt, 300) || (ergebnis === "rueckruf" ? "Rückruf vereinbart" : ergebnis === "nicht_erreicht" ? "Nicht erreicht" : null) }, durch);
    else wvSync(id);
    if (einwilligung) einwilligungSetzen(id, true, `Telefonat am ${heute} durch ${durch}${notiz ? ": " + notiz.slice(0, 200) : ""}`, durch, false);
    const qText = [quali.entscheider && QUALI.entscheider[quali.entscheider as "ja"], quali.bedarf && QUALI.bedarf[quali.bedarf as "hoch"], quali.zeitrahmen && "Zeitrahmen: " + QUALI.zeitrahmen[quali.zeitrahmen as "sofort"],
      verlust && "Verlustgrund: " + VERLUSTGRUENDE[verlust]].filter(Boolean).join(" · ");
    kontakt(id, { kanal: "anruf", richtung: "aus", durch, ergebnis: texte[ergebnis] + (qText ? ` (${qText})` : ""), notiz, einwilligung, wiedervorlage: wv, naechster_schritt: txt(d.naechster_schritt, 300),
      code: ergebnis, ...quali, verlustgrund: verlust, wichtig: d.wichtig });
    if (ergebnis === "widerspruch") sperren(id, "Widerspruch im Telefonat", durch);
    return { status, wiedervorlage: wv, einwilligung, infomail: einwilligung };
  }
  function sperren(id: number, grund: string, durch: string) {
    q("UPDATE firma SET gesperrt = 1, gesperrt_grund = ?, gesperrt_datum = ?, wiedervorlage = NULL, status = CASE WHEN status IN ('kunde','beendet') THEN status ELSE 'kein_interesse' END, geaendert = ? WHERE id = ?",
      txt(grund, 300) || "Gesperrt", tagAus(uhr()), uhr(), id);
    q("UPDATE aufgabe SET erledigt = 1, erledigt_am = ?, erledigt_durch = ? WHERE firma_id = ? AND erledigt = 0 AND art != 'einrichtung'", tagAus(uhr()), txt(durch, 60), id);
    wvSync(id);
    kontakt(id, { kanal: "notiz", durch, ergebnis: "Gesperrt: keine Anrufe und keine Mails mehr", notiz: txt(grund, 300) });
  }
  function entsperren(id: number, durch: string) {
    q("UPDATE firma SET gesperrt = 0, gesperrt_grund = NULL, gesperrt_datum = NULL, geaendert = ? WHERE id = ?", uhr(), id);
    kontakt(id, { kanal: "notiz", durch, ergebnis: "Sperre aufgehoben" });
  }
  function einwilligungSetzen(id: number, ja: boolean, nachweis: string, durch: string, eintragen = true) {
    if (ja) q("UPDATE firma SET einwilligung = 1, einwilligung_datum = ?, einwilligung_nachweis = ?, geaendert = ? WHERE id = ?", tagAus(uhr()), txt(nachweis, 500), uhr(), id);
    else q("UPDATE firma SET einwilligung = 0, einwilligung_datum = NULL, einwilligung_nachweis = NULL, geaendert = ? WHERE id = ?", uhr(), id);
    if (eintragen) kontakt(id, { kanal: "notiz", durch, ergebnis: ja ? "Einwilligung E-Mail erteilt" : "Einwilligung E-Mail zurückgezogen", notiz: txt(nachweis, 500), einwilligung: ja });
  }
  /** Für den Versand einer Info-Mail: harte Prüfung (W5). */
  function infomailErlaubt(id: number): { ok: true; firma: any } | { ok: false; grund: string } {
    const f = firmaZeile(eins("SELECT * FROM firma WHERE id = ?", id));
    if (!f) return { ok: false, grund: "Firma nicht gefunden." };
    if (f.gesperrt) return { ok: false, grund: "Die Firma ist gesperrt." };
    if (!f.einwilligung) return { ok: false, grund: "Keine Einwilligung für E-Mails eingetragen." };
    const ap = eins("SELECT name, email FROM ansprechpartner WHERE firma_id = ? AND email IS NOT NULL ORDER BY id LIMIT 1", id);
    const an = ap?.email || f.email;
    if (!an) return { ok: false, grund: "Keine E-Mail-Adresse hinterlegt." };
    return { ok: true, firma: { ...f, an, ansprechpartner: ap?.name || null } };
  }
  function infomailVermerken(id: number, durch: string, betreff: string) {
    const wv = plusWerktage(tagAus(uhr()), 5);
    q("UPDATE firma SET status = CASE WHEN status IN ('kunde','beendet','termin','angebot') THEN status ELSE 'infos_mail' END, geaendert = ? WHERE id = ?", uhr(), id);
    wiedervorlageSetzen(id, wv, { durch, grund: "Nach Info-Mail nachfragen" });
    kontakt(id, { kanal: "email", richtung: "aus", durch, ergebnis: "Info-Mail verschickt", notiz: betreff, wiedervorlage: wv });
  }

  /* ---------- Dokumente (Kundenakte) ---------- */
  const TEIL = 1_000_000;
  function dokumentAblegen(meta: { id: string; firma_id: number; vertrag_id?: number | null; titel: string; typ: string; name: string; mime: string; datum?: string }, daten: ArrayBuffer) {
    if (!eins("SELECT id FROM firma WHERE id = ?", meta.firma_id)) throw new Error("Firma nicht gefunden.");
    const typ = ["angebot", "vertrag", "protokoll", "notiz", "sonstiges"].includes(meta.typ) ? meta.typ : "sonstiges";
    q("INSERT INTO dokument (id, firma_id, vertrag_id, titel, typ, name, mime, groesse, datum, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      meta.id, meta.firma_id, meta.vertrag_id || null, txt(meta.titel, 200) || txt(meta.name, 200) || "Dokument", typ, txt(meta.name, 200) || "datei",
      txt(meta.mime, 100) || "application/octet-stream", daten.byteLength, istTag(meta.datum) ? meta.datum : tagAus(uhr()), uhr());
    for (let i = 0, nr = 0; i < daten.byteLength; i += TEIL, nr++) q("INSERT INTO dokteil (id, nr, daten) VALUES (?, ?, ?)", meta.id, nr, daten.slice(i, i + TEIL));
  }
  function dokument(id: string): { meta: any; daten: ArrayBuffer } | null {
    const m = eins("SELECT * FROM dokument WHERE id = ?", id);
    if (!m) return null;
    const teile = q("SELECT daten FROM dokteil WHERE id = ? ORDER BY nr", id).map((r) => new Uint8Array(r.daten));
    const out = new Uint8Array(teile.reduce((n, t) => n + t.byteLength, 0));
    let pos = 0; for (const t of teile) { out.set(t, pos); pos += t.byteLength; }
    return { meta: m, daten: out.buffer };
  }
  const dokumentLoeschen = (id: string) => { q("DELETE FROM dokteil WHERE id = ?", id); q("DELETE FROM dokument WHERE id = ?", id); };

  /* ---------- Produkte ---------- */
  const laufzeitZeile = (l: any) => ({ ...l, name: laufzeitName(l.monate), kuendigungsfrist: l.kuendigungsfrist || fristText(l.monate, l.frist_monate) });
  const produkte = () => q("SELECT * FROM produkt ORDER BY aktiv DESC, name").map((p) => ({ ...p, aktiv: !!p.aktiv,
    laufzeiten: q("SELECT * FROM laufzeit WHERE produkt_id = ? ORDER BY reihe, monate", p.id).map(laufzeitZeile) }));
  /** Produkt mit mehreren Laufzeiten; jede Laufzeit hat eigene Anschluss- und Monatsgebühr (Punkt 1). */
  function produktSpeichern(d: any) {
    const name = txt(d?.name, 120);
    if (!name) throw new Error("Bitte einen Produktnamen eintragen.");
    const roh = Array.isArray(d.laufzeiten) ? d.laufzeiten : [{ monate: 0, frist_monate: 1, einmal: d.einmal, monatlich: d.monatlich }];
    const laufzeiten = roh.slice(0, 10).map((l: any, i: number) => {
      const monate = Math.max(0, Math.min(120, Math.round(Number(l?.monate) || 0)));
      const frist = Math.max(0, Math.min(24, Math.round(Number(l?.frist_monate ?? 1))));
      return { id: Number(l?.id) || null, monate, frist, text: txt(l?.kuendigungsfrist, 100), einmal: cent(l?.einmal), monat: cent(l?.monatlich), reihe: i };
    });
    if (!laufzeiten.length) throw new Error("Bitte mindestens eine Laufzeit anlegen.");
    if (new Set(laufzeiten.map((l: any) => l.monate)).size !== laufzeiten.length) throw new Error("Jede Laufzeit nur einmal pro Produkt.");
    const erste = laufzeiten[0];
    const werte = [name, txt(d.beschreibung, 1000), erste.einmal, erste.monat, txt(d.leistung, 200), d.aktiv === false || d.aktiv === "false" ? 0 : 1];
    let pid = Number(d.id) || 0;
    if (pid) q("UPDATE produkt SET name = ?, beschreibung = ?, einmal_ct = ?, monat_ct = ?, leistung = ?, aktiv = ? WHERE id = ?", ...werte, pid);
    else { q("INSERT INTO produkt (name, beschreibung, einmal_ct, monat_ct, leistung, aktiv) VALUES (?, ?, ?, ?, ?, ?)", ...werte); pid = neueId(); }
    // Laufzeiten abgleichen: vorhandene IDs ändern (Angebote verweisen darauf), fehlende löschen, neue anlegen
    const behalten: number[] = [];
    for (const l of laufzeiten) {
      if (l.id && eins("SELECT id FROM laufzeit WHERE id = ? AND produkt_id = ?", l.id, pid)) {
        q("UPDATE laufzeit SET monate = ?, frist_monate = ?, kuendigungsfrist = ?, einmal_ct = ?, monat_ct = ?, reihe = ? WHERE id = ?", l.monate, l.frist, l.text, l.einmal, l.monat, l.reihe, l.id);
        behalten.push(l.id);
      } else {
        q("INSERT INTO laufzeit (produkt_id, monate, frist_monate, kuendigungsfrist, einmal_ct, monat_ct, reihe) VALUES (?, ?, ?, ?, ?, ?, ?)", pid, l.monate, l.frist, l.text, l.einmal, l.monat, l.reihe);
        behalten.push(neueId());
      }
    }
    q(`DELETE FROM laufzeit WHERE produkt_id = ? AND id NOT IN (${behalten.map(() => "?").join(",")})`, pid, ...behalten);
    return pid;
  }
  /** Produkt + Laufzeit für Angebot oder Vertrag nachschlagen. */
  function produktLaufzeit(produktId: unknown, laufzeitId: unknown) {
    const l = eins("SELECT l.*, p.name AS produkt FROM laufzeit l JOIN produkt p ON p.id = l.produkt_id WHERE l.id = ? AND (? IS NULL OR l.produkt_id = ?)", Number(laufzeitId) || 0, Number(produktId) || null, Number(produktId) || null);
    return l ? laufzeitZeile(l) : null;
  }

  /* ---------- Angebote (Punkte 1, 5, 6) ---------- */
  const angebotZeile = (a: any, heute: string) => a && ({ ...a, wichtig: !!a.wichtig,
    abgelaufen: a.status === "offen" && a.gueltig_bis < heute, laeuft_ab: a.status === "offen" && a.gueltig_bis >= heute && a.gueltig_bis <= plusTage(heute, 5) });
  function angebotAnlegen(firmaId: number, d: any, durch: string) {
    if (!eins("SELECT id FROM firma WHERE id = ?", firmaId)) throw new Error("Firma nicht gefunden.");
    const l = produktLaufzeit(d?.produkt_id, d?.laufzeit_id);
    if (!l) throw new Error("Bitte Produkt und Laufzeit wählen.");
    const e = einstellungen();
    const datum = istTag(d.datum) ? d.datum : tagAus(uhr());
    const gueltig = istTag(d.gueltig_bis) && d.gueltig_bis >= datum ? d.gueltig_bis : plusTage(datum, e.angebot_gueltig_tage || 30);
    const jahr = datum.slice(0, 4);
    const n = Number(eins("SELECT COUNT(*) AS n FROM angebot WHERE nummer LIKE ?", `A-${jahr}-%`).n) + 1;
    const nummer = `A-${jahr}-${String(n).padStart(3, "0")}`;
    q(`INSERT INTO angebot (firma_id, nummer, produkt_id, laufzeit_id, produkt, laufzeit, monate, frist_monate, kuendigungsfrist, einmal_ct, monat_ct, datum, gueltig_bis, wichtig, notiz, durch, erstellt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, firmaId, nummer, l.produkt_id, l.id, l.produkt, l.name, l.monate, l.frist_monate, l.kuendigungsfrist,
      l.einmal_ct, l.monat_ct, datum, gueltig, wahr(d.wichtig) ? 1 : 0, txt(d.notiz, 2000), txt(durch, 60), uhr());
    const id = neueId();
    q("UPDATE firma SET status = CASE WHEN status IN ('kunde','beendet') THEN status ELSE 'angebot' END, geaendert = ? WHERE id = ?", uhr(), firmaId);
    kontakt(firmaId, { kanal: "notiz", durch, ergebnis: `Angebot ${nummer} verschickt`, notiz: `${l.produkt}, ${l.name}: ${(l.einmal_ct / 100).toFixed(2).replace(".", ",")} € Anschluss + ${(l.monat_ct / 100).toFixed(2).replace(".", ",")} € monatlich`, angebot_id: id });
    // Automatisch nachfassen (Punkt 5) und Hinweis kurz vor Ablauf
    const zust = txt(d.zustaendig, 60) || txt(durch, 60);
    if (e.nachfassen_tage > 0) aufgabeAnlegen(firmaId, { art: "nachfassen", titel: `Angebot ${nummer} nachfassen`, faellig: plusWerktage(datum, e.nachfassen_tage), angebot_id: id, zustaendig: zust }, "System");
    if (e.nachfassen2_tage > 0) aufgabeAnlegen(firmaId, { art: "nachfassen", titel: `Angebot ${nummer} noch einmal nachfassen`, faellig: plusWerktage(datum, e.nachfassen_tage + e.nachfassen2_tage), angebot_id: id, zustaendig: zust }, "System");
    const hinweis = plusTage(gueltig, -3);
    aufgabeAnlegen(firmaId, { art: "ablauf", titel: `Angebot ${nummer} läuft am ${deTag(gueltig)} ab`, faellig: hinweis > datum ? hinweis : datum, angebot_id: id, zustaendig: zust }, "System");
    return { id, nummer };
  }
  function angebote(o: { offen?: boolean } = {}) {
    const heute = tagAus(uhr());
    return q(`SELECT a.*, f.name AS firma, f.wichtig AS firma_wichtig FROM angebot a JOIN firma f ON f.id = a.firma_id ${o.offen ? "WHERE a.status = 'offen'" : ""}
      ORDER BY (a.wichtig OR f.wichtig) DESC, (a.status = 'offen') DESC, a.gueltig_bis, a.id DESC LIMIT 500`).map((a) => ({ ...angebotZeile(a, heute), firma_wichtig: !!a.firma_wichtig }));
  }
  /** Angebot angenommen → Vertrag mit Laufzeit und Kündigungsfrist; abgelehnt → Verlustgrund (Punkt 6). */
  function angebotEntscheiden(id: number, d: any, durch: string) {
    const a = eins("SELECT * FROM angebot WHERE id = ?", id);
    if (!a) throw new Error("Angebot nicht gefunden.");
    if (a.status !== "offen") throw new Error("Über das Angebot wurde schon entschieden.");
    const heute = tagAus(uhr());
    const schliessen = () => q("UPDATE aufgabe SET erledigt = 1, erledigt_am = ?, erledigt_durch = ? WHERE angebot_id = ? AND erledigt = 0", heute, txt(durch, 60), id);
    if (d?.status === "abgelehnt") {
      const grund = d.verlustgrund in VERLUSTGRUENDE ? d.verlustgrund : null;
      if (!grund) throw new Error("Bitte einen Verlustgrund wählen.");
      q("UPDATE angebot SET status = 'abgelehnt', verlustgrund = ?, entschieden_am = ? WHERE id = ?", grund, heute, id);
      schliessen(); wvSync(a.firma_id);
      const offen = Number(eins("SELECT COUNT(*) AS n FROM angebot WHERE firma_id = ? AND status = 'offen'", a.firma_id).n);
      q("UPDATE firma SET verlustgrund = ?, status = CASE WHEN status = 'angebot' AND ? = 0 THEN 'kein_interesse' ELSE status END, geaendert = ? WHERE id = ?", grund, offen, uhr(), a.firma_id);
      kontakt(a.firma_id, { kanal: "notiz", durch, ergebnis: `Angebot ${a.nummer} abgelehnt (${VERLUSTGRUENDE[grund]})`, notiz: txt(d.notiz, 1000), verlustgrund: grund, angebot_id: id });
      return { status: "abgelehnt" };
    }
    if (d?.status !== "angenommen") throw new Error("Bitte „angenommen“ oder „abgelehnt“ wählen.");
    const v = vertragAnlegen(a.firma_id, { beginn: istTag(d.beginn) ? d.beginn : heute, produkt: a.produkt, laufzeit: a.laufzeit, mindestlaufzeit: a.monate, frist_monate: a.frist_monate,
      kuendigungsfrist: a.kuendigungsfrist, einmal_ct: a.einmal_ct, monat_ct: a.monat_ct, angebot_id: id, unterlagen: d.unterlagen }, durch);
    q("UPDATE angebot SET status = 'angenommen', entschieden_am = ?, vertrag_id = ? WHERE id = ?", heute, v.id, id);
    schliessen(); wvSync(a.firma_id);
    return { status: "angenommen", vertrag: v };
  }

  /* ---------- Verträge und Zahlungen (W8, W9, W10) ---------- */
  /** Vertrag mit Zusatzangaben: Unterlagen-Checkliste, Einrichtungsstand, Fristen. */
  function vertragZeile(v: any, heute = tagAus(uhr())) {
    if (!v) return v;
    const unterlagen = Object.fromEntries(Object.keys(UNTERLAGEN).map((k) => [k, v["u_" + k] || null]));
    const onboarding = Object.fromEntries(Object.keys(ONBOARDING).map((k) => [k, v["ob_" + k] || null]));
    const fehlend = Object.keys(UNTERLAGEN).filter((k) => !unterlagen[k]);
    const ob = Object.keys(ONBOARDING).filter((k) => onboarding[k]).length;
    return { ...v, unterlagen, unterlagen_fehlen: fehlend, onboarding, onboarding_stand: ob === 3 ? "Live" : ob === 0 ? "Einrichtung offen" : `${ONBOARDING[Object.keys(ONBOARDING)[ob]]} offen`,
      fristen: v.status === "aktiv" ? fristen(v, heute) : null };
  }
  function vertragAnlegen(firmaId: number, d: any, durch: string) {
    if (!eins("SELECT id FROM firma WHERE id = ?", firmaId)) throw new Error("Firma nicht gefunden.");
    const beginn = istTag(d?.beginn) ? d.beginn : null;
    if (!beginn) throw new Error("Bitte das Beginn-Datum eintragen.");
    // Produkt + Laufzeit gewählt: Gebühren, Laufzeit und Kündigungsfrist kommen von dort
    const l = d.laufzeit_id ? produktLaufzeit(d.produkt_id, d.laufzeit_id) : null;
    const jahr = beginn.slice(0, 4);
    const n = Number(eins("SELECT COUNT(*) AS n FROM vertrag WHERE nummer LIKE ?", `V-${jahr}-%`).n) + 1;
    const nummer = `V-${jahr}-${String(n).padStart(3, "0")}`;
    const einmal = l ? l.einmal_ct : "einmal_ct" in d ? Math.max(0, Math.round(Number(d.einmal_ct) || 0)) : cent(d.einmal);
    const monat = l ? l.monat_ct : "monat_ct" in d ? Math.max(0, Math.round(Number(d.monat_ct) || 0)) : cent(d.monatlich);
    const monate = l ? l.monate : Math.max(0, Math.round(Number(d.mindestlaufzeit) || 0));
    const fristM = l ? l.frist_monate : d.frist_monate === undefined || d.frist_monate === "" ? (monate ? 1 : null) : Math.max(0, Math.round(Number(d.frist_monate) || 0));
    const fristT = l ? l.kuendigungsfrist : txt(d.kuendigungsfrist, 100) || (fristM !== null ? fristText(monate, fristM) : null);
    const produkt = l ? l.produkt : txt(d.produkt, 200);
    const u = d.unterlagen || {};
    const heute = tagAus(uhr());
    const uWert = (k: string) => (wahr(u[k]) ? heute : null);
    q(`INSERT INTO vertrag (firma_id, nummer, produkt, beginn, mindestlaufzeit, kuendigungsfrist, ende, status, einmal_ct, monat_ct, notiz, erstellt,
         laufzeit, frist_monate, angebot_id, u_vertrag, u_avv, u_sepa)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'unterlagen', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, firmaId, nummer, produkt, beginn, monate || null, fristT, einmal, monat, txt(d.notiz, 2000), uhr(),
      l ? l.name : txt(d.laufzeit, 60) || laufzeitName(monate), fristM, Number(d.angebot_id) || null, uWert("vertrag"), uWert("avv"), uWert("sepa"));
    const id = neueId();
    q("UPDATE firma SET status = CASE WHEN status IN ('kunde') THEN status ELSE 'angebot' END, geaendert = ? WHERE id = ?", uhr(), firmaId);
    kontakt(firmaId, { kanal: "notiz", durch, ergebnis: `Vertrag ${nummer} abgeschlossen`, notiz: `${produkt || ""}${monate ? `, ${monate} Monate` : ""} ab ${beginn}`.trim() });
    // Übergabe an die Technik (Punkt 9)
    const e = einstellungen();
    aufgabeAnlegen(firmaId, { art: "einrichtung", titel: `Einrichtung für ${nummer}: einrichten, testen, live schalten`, faellig: heute, vertrag_id: id, zustaendig: e.technik }, "System");
    const aktiv = vertragPruefen(id, durch);
    return { id, nummer, status: aktiv ? "aktiv" : "unterlagen" };
  }
  /** Erst „aktiv“, wenn Vertrag, AVV und SEPA-Mandat vorliegen (Punkt 8). Dann Zahlungsposten anlegen. */
  function vertragPruefen(id: number, durch: string) {
    const v = eins("SELECT * FROM vertrag WHERE id = ?", id);
    if (!v || v.status !== "unterlagen") return v?.status === "aktiv";
    if (!v.u_vertrag || !v.u_avv || !v.u_sepa) return false;
    q("UPDATE vertrag SET status = 'aktiv' WHERE id = ?", id);
    if (v.einmal_ct > 0) q("INSERT OR IGNORE INTO zahlung (vertrag_id, firma_id, art, leistungsmonat, betrag_ct, faellig) VALUES (?, ?, 'einrichtung', ?, ?, ?)", id, v.firma_id, monatVon(v.beginn), v.einmal_ct, plusTage(v.beginn, 14));
    q("UPDATE firma SET status = 'kunde', geaendert = ? WHERE id = ?", uhr(), v.firma_id);
    q("UPDATE aufgabe SET erledigt = 1, erledigt_am = ?, erledigt_durch = ? WHERE firma_id = ? AND erledigt = 0 AND art IN ('anruf','nachfassen','ablauf')", tagAus(uhr()), txt(durch, 60), v.firma_id);
    wvSync(v.firma_id);
    kontakt(v.firma_id, { kanal: "notiz", durch, ergebnis: `Vertrag ${v.nummer} aktiv: Unterlagen vollständig` });
    monatsposten();
    return true;
  }
  function unterlageSetzen(id: number, art: string, ja: boolean, durch: string) {
    if (!(art in UNTERLAGEN)) throw new Error("Unbekannte Unterlage.");
    const v = eins("SELECT * FROM vertrag WHERE id = ?", id);
    if (!v) throw new Error("Vertrag nicht gefunden.");
    q(`UPDATE vertrag SET u_${art} = ? WHERE id = ?`, ja ? tagAus(uhr()) : null, id);
    kontakt(v.firma_id, { kanal: "notiz", durch, ergebnis: `${v.nummer}: ${UNTERLAGEN[art]} ${ja ? "liegt vor" : "fehlt wieder"}` });
    vertragPruefen(id, durch);
    return vertragZeile(eins("SELECT * FROM vertrag WHERE id = ?", id));
  }
  function onboardingSetzen(id: number, schritt: string, ja: boolean, durch: string) {
    if (!(schritt in ONBOARDING)) throw new Error("Unbekannter Schritt.");
    const v = eins("SELECT * FROM vertrag WHERE id = ?", id);
    if (!v) throw new Error("Vertrag nicht gefunden.");
    q(`UPDATE vertrag SET ob_${schritt} = ? WHERE id = ?`, ja ? tagAus(uhr()) : null, id);
    const n = eins("SELECT * FROM vertrag WHERE id = ?", id);
    const fertig = n.ob_einrichtung && n.ob_test && n.ob_golive;
    q("UPDATE aufgabe SET erledigt = ?, erledigt_am = ?, erledigt_durch = ? WHERE vertrag_id = ? AND art = 'einrichtung'", fertig ? 1 : 0, fertig ? tagAus(uhr()) : null, fertig ? txt(durch, 60) : null, id);
    wvSync(v.firma_id);
    kontakt(v.firma_id, { kanal: "notiz", durch, ergebnis: `${v.nummer}: ${ONBOARDING[schritt]} ${ja ? "erledigt" : "zurückgesetzt"}${fertig ? " – Kunde ist live" : ""}` });
    return vertragZeile(n);
  }
  /** Fristen-Wächter (Punkt 4): rechtzeitig vor dem letzten Kündigungstag eine wichtige Aufgabe anlegen. */
  function fristenPruefen(heute = tagAus(uhr())) {
    const e = einstellungen();
    const neu: any[] = [];
    for (const v of q("SELECT v.*, f.name AS firma FROM vertrag v JOIN firma f ON f.id = v.firma_id WHERE v.status = 'aktiv' AND v.mindestlaufzeit > 0")) {
      const fr = fristen(v, heute);
      if (!fr || fr.kuendigen_bis > plusTage(heute, e.frist_vorlauf_tage) || v.frist_erinnert === fr.kuendigen_bis) continue;
      q("UPDATE vertrag SET frist_erinnert = ? WHERE id = ?", fr.kuendigen_bis, v.id);
      aufgabeAnlegen(v.firma_id, { art: "frist", wichtig: true, vertrag_id: v.id, faellig: heute,
        titel: `${v.nummer}: kündbar bis ${deTag(fr.kuendigen_bis)}, Laufzeit endet ${deTag(fr.laufzeit_ende)} – Kunde anrufen, Verlängerung sichern`,
        zustaendig: e.team[0] }, "Fristen-Wächter");
      neu.push({ ...v, ...fr });
    }
    return neu;
  }
  function vertragAendern(id: number, d: any, durch: string) {
    const v = eins("SELECT * FROM vertrag WHERE id = ?", id);
    if (!v) throw new Error("Vertrag nicht gefunden.");
    if (d?.status === "aktiv" && v.status === "unterlagen") throw new Error("Der Vertrag wird erst aktiv, wenn alle Unterlagen abgehakt sind.");
    const status = ["aktiv", "gekuendigt", "beendet"].includes(d?.status) ? d.status : v.status;
    const ende = d && "ende" in d ? (istTag(d.ende) ? d.ende : null) : v.ende;
    if (status === "gekuendigt" && !ende) throw new Error("Bitte das Vertragsende eintragen.");
    q("UPDATE vertrag SET status = ?, ende = ?, produkt = ?, kuendigungsfrist = ?, notiz = ?, monat_ct = ? WHERE id = ?",
      status, status === "aktiv" ? ende : ende || tagAus(uhr()), d && "produkt" in d ? txt(d.produkt, 200) : v.produkt, d && "kuendigungsfrist" in d ? txt(d.kuendigungsfrist, 100) : v.kuendigungsfrist,
      d && "notiz" in d ? txt(d.notiz, 2000) : v.notiz, d && "monatlich" in d ? cent(d.monatlich) : v.monat_ct, id);
    const grund = typeof d?.verlustgrund === "string" && d.verlustgrund in VERLUSTGRUENDE ? d.verlustgrund : null;
    if (status !== v.status) kontakt(v.firma_id, { kanal: "notiz", durch, ergebnis: `Vertrag ${v.nummer}: ${status === "gekuendigt" ? `gekündigt zum ${deTag(ende)}` : status === "beendet" ? "beendet" : "wieder aktiv"}${grund ? ` (${VERLUSTGRUENDE[grund]})` : ""}`, verlustgrund: grund });
    if (grund) q("UPDATE firma SET verlustgrund = ? WHERE id = ?", grund, v.firma_id);
    // Bei Kündigung: Rückgewinnungsanruf (Punkt 4)
    if (status === "gekuendigt" && v.status !== "gekuendigt")
      aufgabeAnlegen(v.firma_id, { art: "rueckgewinnung", wichtig: true, vertrag_id: id, faellig: plusWerktage(tagAus(uhr()), 1), zustaendig: einstellungen().team[0],
        titel: `Rückgewinnung: ${v.nummer} gekündigt zum ${deTag(ende)} – Gründe erfragen, Angebot machen` }, "Fristen-Wächter");
    const aktive = Number(eins("SELECT COUNT(*) AS n FROM vertrag WHERE firma_id = ? AND (status = 'aktiv' OR (status = 'gekuendigt' AND ende >= ?))", v.firma_id, tagAus(uhr())).n);
    q("UPDATE firma SET status = ?, geaendert = ? WHERE id = ? AND status IN ('kunde','beendet')", aktive ? "kunde" : "beendet", uhr(), v.firma_id);
    return eins("SELECT * FROM vertrag WHERE id = ?", id);
  }
  /** Legt fehlende Monatsposten an (idempotent, läuft bei jedem Zeitplan-Durchlauf). */
  function monatsposten(heute = tagAus(uhr())) {
    const bis = monatVon(heute);
    let neu = 0;
    for (const v of q("SELECT * FROM vertrag WHERE monat_ct > 0 AND status IN ('aktiv','gekuendigt')")) {
      const letzter = v.ende ? (monatVon(v.ende) < bis ? monatVon(v.ende) : bis) : bis;
      for (let m = monatVon(v.beginn), i = 0; m <= letzter && i < 240; m = monatPlus(m, 1), i++) {
        const faellig = plusTage(m + "-01", 14);
        const r = q("INSERT OR IGNORE INTO zahlung (vertrag_id, firma_id, art, leistungsmonat, betrag_ct, faellig) VALUES (?, ?, 'monatlich', ?, ?, ?) RETURNING id", v.id, v.firma_id, m, v.monat_ct, faellig < v.beginn ? v.beginn : faellig);
        neu += r.length;
      }
    }
    return neu;
  }
  function vertraege(o: { laufend?: boolean } = {}) {
    const heute = tagAus(uhr());
    const w = o.laufend === undefined ? "" : o.laufend ? "WHERE v.status IN ('aktiv','unterlagen') OR (v.status = 'gekuendigt' AND (v.ende IS NULL OR v.ende >= ?))" : "WHERE v.status = 'beendet' OR (v.status = 'gekuendigt' AND v.ende < ?)";
    return q(`SELECT v.*, f.name AS firma, f.wichtig AS firma_wichtig FROM vertrag v JOIN firma f ON f.id = v.firma_id ${w} ORDER BY f.wichtig DESC, v.beginn DESC`, ...(w ? [heute] : []))
      .map((v) => ({ ...vertragZeile(v, heute), firma_wichtig: !!v.firma_wichtig }));
  }
  function zahlungen(o: { offen?: boolean; firma_id?: number } = {}) {
    const heute = tagAus(uhr());
    const w: string[] = [], p: unknown[] = [heute];
    if (o.offen) w.push("z.bezahlt = 0");
    if (o.firma_id) { w.push("z.firma_id = ?"); p.push(o.firma_id); }
    return q(`SELECT z.*, f.name AS firma, f.wichtig AS firma_wichtig, v.nummer AS vertrag, CASE WHEN z.bezahlt = 1 THEN 'bezahlt' WHEN z.faellig < ? THEN 'ueberfaellig' ELSE 'offen' END AS zahlstatus
      FROM zahlung z JOIN firma f ON f.id = z.firma_id JOIN vertrag v ON v.id = z.vertrag_id ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY z.bezahlt, f.wichtig DESC, z.faellig ${o.offen ? "ASC" : "DESC"} LIMIT 500`, ...p).map((z) => ({ ...z, bezahlt: !!z.bezahlt, firma_wichtig: !!z.firma_wichtig }));
  }
  function zahlungBezahlt(id: number, bezahlt: boolean, datum?: string, rechnungsnummer?: string) {
    if (!eins("SELECT id FROM zahlung WHERE id = ?", id)) throw new Error("Zahlung nicht gefunden.");
    q("UPDATE zahlung SET bezahlt = ?, bezahlt_am = ?, rechnungsnummer = COALESCE(?, rechnungsnummer) WHERE id = ?", bezahlt ? 1 : 0, bezahlt ? (istTag(datum) ? datum : tagAus(uhr())) : null, txt(rechnungsnummer, 60), id);
  }
  /** Posten mehr als 7 Tage über Fälligkeit, für die noch nicht erinnert wurde (W10). */
  function ueberfaelligMelden(heute = tagAus(uhr())) {
    const grenze = plusTage(heute, -7);
    const liste = q(`SELECT z.*, f.name AS firma, v.nummer AS vertrag FROM zahlung z JOIN firma f ON f.id = z.firma_id JOIN vertrag v ON v.id = z.vertrag_id
      WHERE z.bezahlt = 0 AND z.erinnert = 0 AND z.faellig < ? ORDER BY z.faellig`, grenze);
    for (const z of liste) q("UPDATE zahlung SET erinnert = 1 WHERE id = ?", z.id);
    return liste;
  }

  /* ---------- Akquise-Bot: Ablage der Ergebnisse ---------- */
  /** Nächste Kombination aus Branche und Region (reihum). */
  function naechsteSuche(): { branche: string; region: string } | null {
    const e = einstellungen();
    if (!e.zielbranchen.length || !e.zielregionen.length) return null;
    const n = e.zielbranchen.length * e.zielregionen.length;
    const i = (Number(zustand("suche_zeiger")) || 0) % n;
    zustand("suche_zeiger", (i + 1) % n);
    return { branche: e.zielbranchen[i % e.zielbranchen.length], region: e.zielregionen[Math.floor(i / e.zielbranchen.length) % e.zielregionen.length] };
  }
  function istGesperrt(d: any): boolean {
    const id = doppelt(d);
    return !!(id && eins("SELECT gesperrt FROM firma WHERE id = ?", id)?.gesperrt);
  }
  /** Wartende Firmen, solche mit Website zuerst (die kann die KI am besten einschätzen). */
  const zuBewerten = (n = 2) => q("SELECT * FROM firma WHERE status = 'neu' AND bewertet_am IS NULL AND gesperrt = 0 AND quelle = 'bot' ORDER BY (website IS NULL), id LIMIT ?", Math.max(1, Math.min(10, n))).map(firmaZeile);
  const wartend = () => Number(eins("SELECT COUNT(*) AS n FROM firma WHERE status = 'neu' AND bewertet_am IS NULL AND gesperrt = 0 AND quelle = 'bot'").n);
  /** Treffer einer Suche in einem Schritt übernehmen: Sperrliste und Dubletten prüfen, Neue anlegen. */
  function firmenUebernehmen(treffer: any[]) {
    let neu = 0, doppelt = 0, gesperrt = 0;
    for (const t of (Array.isArray(treffer) ? treffer : []).slice(0, 500)) {
      if (!t?.name) continue;
      if (istGesperrt(t)) { gesperrt++; continue; }
      try { const r = firmaAnlegen(t, "Bot", "bot"); if (r.neu) neu++; else doppelt++; } catch { /* unbrauchbarer Treffer */ }
    }
    return { neu, doppelt, gesperrt };
  }
  /** Was der Bot seit einem Zeitpunkt geschafft hat (für die Morgen-Mail). */
  function botStatistik(seit: number) {
    const z = (s: string, ...p: unknown[]) => Number(eins(s, ...p).n);
    return {
      gefunden: z("SELECT COUNT(*) AS n FROM firma WHERE quelle = 'bot' AND erstellt >= ?", seit),
      bewertet: z("SELECT COUNT(*) AS n FROM firma WHERE bewertet_am >= ?", seit),
      impulse: z("SELECT COUNT(*) AS n FROM firma WHERE status = 'anruf_impuls' AND bewertet_am >= ?", seit),
      wartend: wartend(),
      firmen: z("SELECT COUNT(*) AS n FROM firma"),
    };
  }
  function bewertungSpeichern(id: number, r: { score: number; begruendung: string; einstieg?: string; infos?: any; telefon?: string; email?: string; inhaber?: string; branche?: string }) {
    const f = eins("SELECT id, status, telefon, email, branche FROM firma WHERE id = ?", id);
    if (!f) return null;
    const schwelle = einstellungen().schwelle;
    const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    const status = f.status === "neu" || f.status === "bewertet" || f.status === "anruf_impuls" ? (score >= schwelle ? "anruf_impuls" : "bewertet") : f.status;
    const tel = f.telefon || txt(r.telefon, 60);
    q(`UPDATE firma SET score = ?, score_grund = ?, einstieg = ?, infos = ?, status = ?, bewertet_am = ?, telefon = ?, telefon_norm = ?, email = COALESCE(email, ?), geaendert = ? WHERE id = ?`,
      score, txt(r.begruendung, 1500), txt(r.einstieg, 500), r.infos ? JSON.stringify(r.infos).slice(0, 4000) : null, status, uhr(), tel, nurZiffern(tel) || null, txt(r.email, 200), uhr(), id);
    // Branche aus der Bewertung übernehmen, wenn bisher nur die grobe Kategorie aus OpenStreetMap drinsteht
    if (r.branche && (!f.branche || /\(|=/.test(f.branche))) q("UPDATE firma SET branche = ? WHERE id = ?", txt(r.branche, 100), id);
    if (r.inhaber && !eins("SELECT id FROM ansprechpartner WHERE firma_id = ?", id)) ansprechpartner(id, { name: r.inhaber, rolle: "Inhaber (laut Website)" });
    kontakt(id, { kanal: "recherche", durch: "Bot", ergebnis: `Bewertet: ${score} Punkte${status === "anruf_impuls" ? ", Anruf-Impuls" : ""}`, notiz: txt(r.begruendung, 1500) });
    return { score, status };
  }
  /** Beste Anruf-Impulse für heute plus fällige Wiedervorlagen (W3). Markiert sie als gemeldet.
   *  Ein zweiter Aufruf am selben Tag liefert nur Impulse, die seitdem neu dazugekommen sind. */
  function impulseFuerHeute(heute = tagAus(uhr())) {
    const n = einstellungen().impulse_pro_tag;
    const vorher = plusTage(heute, -7);
    const neu = q(`SELECT id, name, branche, ort, telefon, score, score_grund, einstieg FROM firma WHERE status = 'anruf_impuls' AND gesperrt = 0
      AND (impuls_am IS NULL OR impuls_am <= ?) ORDER BY wichtig DESC, score DESC LIMIT ?`, vorher, Math.max(1, n));
    const faellig = q(`SELECT f.id, f.name, f.branche, f.ort, f.telefon, f.score, a.faellig AS wiedervorlage, f.status, a.art, a.titel, a.zustaendig, a.grund, (a.wichtig OR f.wichtig) AS wichtig
      FROM aufgabe a JOIN firma f ON f.id = a.firma_id WHERE a.erledigt = 0 AND a.faellig <= ? AND f.gesperrt = 0
      ORDER BY (a.wichtig OR f.wichtig) DESC, a.faellig LIMIT 50`, heute).map((r) => ({ ...r, titel: r.titel || AUFGABEN_ARTEN[r.art], wichtig: !!r.wichtig }));
    for (const f of neu) { q("UPDATE firma SET impuls_am = ? WHERE id = ?", heute, f.id); kontakt(f.id, { kanal: "notiz", durch: "Bot", ergebnis: "Als Anruf-Impuls gemeldet" }); }
    return { neu, faellig };
  }
  /** Löschfrist: nie kontaktierte Leads unter der Schwelle nach 6 Monaten löschen. Gesperrte bleiben (Sperrliste). */
  function aufraeumen(jetzt = uhr()) {
    const grenze = jetzt - 183 * TAG;
    const alt = q(`SELECT id FROM firma WHERE quelle = 'bot' AND gesperrt = 0 AND status IN ('neu','bewertet') AND erstellt < ?
      AND NOT EXISTS (SELECT 1 FROM kontakt k WHERE k.firma_id = firma.id AND k.kanal IN ('anruf','email','termin','brief'))`, grenze);
    for (const r of alt) firmaLoeschen(r.id);
    q("DELETE FROM login WHERE ablauf < ?", jetzt);
    q("DELETE FROM sitzung WHERE ablauf < ?", jetzt);
    q("DELETE FROM zaehler WHERE bis < ?", jetzt);
    return alt.length;
  }

  /* ---------- Tagescockpit (Punkt 7) ---------- */
  function cockpit(o: { zustaendig?: string } = {}, heute = tagAus(uhr())) {
    const offen = aufgaben({ offen: true, bis: plusTage(heute, 0), zustaendig: o.zustaendig || undefined }).filter((a) => !a.gesperrt);
    const mitImpuls = new Set(offen.map((a) => a.firma_id));
    const impulse = q(`SELECT id, name, branche, ort, telefon, score, score_grund, einstieg, wichtig FROM firma WHERE status = 'anruf_impuls' AND gesperrt = 0
      ORDER BY wichtig DESC, score DESC LIMIT 50`).filter((f) => !mitImpuls.has(f.id)).map((f) => ({ ...f, wichtig: !!f.wichtig }));
    const angeboteOffen = angebote({ offen: true });
    const laufend = vertraege({ laufend: true });
    const zOffen = zahlungen({ offen: true });
    const wichtigeFirmen = q(`SELECT id, name, ort, telefon, status, wiedervorlage FROM firma WHERE wichtig = 1 AND gesperrt = 0 ORDER BY geaendert DESC LIMIT 30`);
    const wichtigeVorgaenge = q(`SELECT k.*, f.name AS firma FROM kontakt k JOIN firma f ON f.id = k.firma_id WHERE k.wichtig = 1 AND k.zeitpunkt >= ? ORDER BY k.zeitpunkt DESC LIMIT 20`, uhr() - 30 * TAG);
    return {
      heute,
      faellig: offen.filter((a) => a.faellig === heute),
      ueberfaellig: offen.filter((a) => a.faellig < heute),
      impulse,
      wichtig: { firmen: wichtigeFirmen, vorgaenge: wichtigeVorgaenge, aufgaben: aufgaben({ offen: true }).filter((a) => a.wichtig && a.faellig > heute).slice(0, 20) },
      angebote: angeboteOffen,
      vertraege: { anzahl: laufend.filter((v) => v.status !== "unterlagen").length, monat_ct: laufend.filter((v) => v.status !== "unterlagen").reduce((n, v) => n + v.monat_ct, 0),
        offen: laufend.filter((v) => v.status === "unterlagen" || v.onboarding_stand !== "Live" || (v.fristen && v.fristen.kuendigen_bis <= plusTage(heute, einstellungen().frist_vorlauf_tage))) },
      zahlungen: { offen_ct: zOffen.reduce((n, z) => n + z.betrag_ct, 0), ueberfaellig: zOffen.filter((z) => z.zahlstatus === "ueberfaellig"), anzahl: zOffen.length },
    };
  }

  /* ---------- Wochenbericht (Punkt 11) ---------- */
  function wochenbericht(montag: string) {
    const von = mitternacht(montag), bis = mitternacht(plusTage(montag, 7)), letzter = plusTage(montag, 6);
    const z = (s: string, ...p: unknown[]) => Number(eins(s, ...p).n) || 0;
    const anrufCodes = ERGEBNISSE.map((e) => `'${e}'`).join(",");
    const verlust: Record<string, number> = {};
    for (const r of q(`SELECT verlustgrund AS g, COUNT(*) AS n FROM kontakt WHERE verlustgrund IS NOT NULL AND zeitpunkt >= ? AND zeitpunkt < ? GROUP BY verlustgrund`, von, bis)) verlust[r.g] = Number(r.n);
    for (const r of q(`SELECT verlustgrund AS g, COUNT(*) AS n FROM angebot WHERE verlustgrund IS NOT NULL AND entschieden_am >= ? AND entschieden_am <= ? GROUP BY verlustgrund`, montag, letzter)) verlust[r.g] = (verlust[r.g] || 0) + Number(r.n);
    return {
      montag, bis: letzter,
      anrufe: z(`SELECT COUNT(*) AS n FROM kontakt WHERE kanal = 'anruf' AND code IN (${anrufCodes}) AND zeitpunkt >= ? AND zeitpunkt < ?`, von, bis),
      erreicht: z(`SELECT COUNT(*) AS n FROM kontakt WHERE kanal = 'anruf' AND code IN (${anrufCodes}) AND code != 'nicht_erreicht' AND zeitpunkt >= ? AND zeitpunkt < ?`, von, bis),
      termine: z(`SELECT COUNT(*) AS n FROM kontakt WHERE (code = 'termin' OR (kanal = 'termin' AND code IS NULL)) AND zeitpunkt >= ? AND zeitpunkt < ?`, von, bis),
      angebote: z("SELECT COUNT(*) AS n FROM angebot WHERE erstellt >= ? AND erstellt < ?", von, bis),
      abschluesse: z("SELECT COUNT(*) AS n FROM vertrag WHERE erstellt >= ? AND erstellt < ?", von, bis),
      neu_mrr_ct: z("SELECT COALESCE(SUM(monat_ct), 0) AS n FROM vertrag WHERE erstellt >= ? AND erstellt < ?", von, bis),
      mrr_ct: z("SELECT COALESCE(SUM(monat_ct), 0) AS n FROM vertrag WHERE status != 'unterlagen' AND beginn <= ? AND (ende IS NULL OR ende >= ?)", letzter, letzter),
      pro_person: q(`SELECT durch, COUNT(*) AS anrufe, SUM(code = 'termin') AS termine FROM kontakt WHERE kanal = 'anruf' AND code IN (${anrufCodes}) AND zeitpunkt >= ? AND zeitpunkt < ? GROUP BY durch ORDER BY anrufe DESC`, von, bis)
        .map((r) => ({ durch: r.durch, anrufe: Number(r.anrufe), termine: Number(r.termine) || 0 })),
      verlust,
    };
  }
  /** Die letzten Wochen, neueste zuerst. */
  const wochenberichte = (n = 8, heute = tagAus(uhr())) => Array.from({ length: Math.max(1, Math.min(52, n)) }, (_, i) => wochenbericht(plusTage(montagVon(heute), -7 * i)));

  /* ---------- Dublettenwarnung (Punkt 12) ---------- */
  const RECHTSFORMEN = /\b(gmbh|mbh|ug|haftungsbeschränkt|kg|ohg|gbr|ag|e\.?\s?k\.?|e\.?\s?v\.?|inh\.?|inhaber|co|und|&)\b/g;
  const normName = (s: unknown) => String(s ?? "").toLowerCase().replace(/&/g, " und ").replace(/[.,'"„“()\-–/+]/g, " ").replace(RECHTSFORMEN, " ").replace(/\s+/g, " ").trim();
  /** Mögliche Dubletten beim Anlegen: gleiche Website/Nummer/Name+PLZ (sicher) oder sehr ähnlicher Name (vielleicht). */
  function dubletten(d: any, ausser = 0) {
    const out = new Map<number, { grund: string; sicher: boolean }>();
    const sicher = doppelt(d, ausser);
    if (sicher) out.set(sicher, { grund: "gleiche Website, Telefonnummer oder Name mit PLZ", sicher: true });
    const n = normName(d?.name);
    const wort = n.split(" ").filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
    if (wort) for (const r of q("SELECT id, name, plz, ort FROM firma WHERE lower(name) LIKE ? AND id != ? LIMIT 80", `%${wort}%`, ausser)) {
      if (out.has(r.id)) continue;
      const m = normName(r.name);
      if (m === n || (n.length >= 6 && (m.includes(n) || n.includes(m)) && m.length >= 4)) out.set(r.id, { grund: d.ort && r.ort && String(d.ort).toLowerCase() === String(r.ort).toLowerCase() ? "ähnlicher Name im selben Ort" : "ähnlicher Name", sicher: false });
    }
    return [...out].slice(0, 6).map(([id, x]) => ({ ...eins("SELECT id, name, branche, plz, ort, telefon, status FROM firma WHERE id = ?", id), ...x }));
  }

  /* ---------- Gesprächsleitfäden je Branche (Punkt 13) ---------- */
  const leitfaeden = () => q("SELECT * FROM leitfaden ORDER BY (name = 'Allgemein') DESC, name");
  function leitfadenSpeichern(d: any) {
    const name = txt(d?.name, 80);
    if (!name) throw new Error("Bitte einen Namen (Branche) eintragen.");
    const w = [name, txt(d.stichworte, 300), txt(d.einstieg, 4000), txt(d.fragen, 4000), txt(d.einwaende, 6000), uhr()];
    if (Number(d.id)) { q("UPDATE leitfaden SET name = ?, stichworte = ?, einstieg = ?, fragen = ?, einwaende = ?, geaendert = ? WHERE id = ?", ...w, Number(d.id)); return Number(d.id); }
    q("INSERT INTO leitfaden (name, stichworte, einstieg, fragen, einwaende, geaendert) VALUES (?, ?, ?, ?, ?, ?)", ...w);
    return neueId();
  }
  const leitfadenLoeschen = (id: number) => { q("DELETE FROM leitfaden WHERE id = ? AND name != 'Allgemein'", id); };
  /** Passender Leitfaden zur Branche einer Firma: Stichwort oder Name kommt in der Branche vor, sonst „Allgemein“. */
  function leitfadenFuer(branche: unknown) {
    const b = String(branche ?? "").toLowerCase();
    const alle = leitfaeden();
    if (b) for (const l of alle) {
      if (l.name === "Allgemein") continue;
      const worte = [l.name, ...String(l.stichworte || "").split(",")].map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 3);
      if (worte.some((w) => b.includes(w) || w.includes(b))) return l;
    }
    return alle.find((l) => l.name === "Allgemein") || alle[0] || null;
  }

  /* ---------- Anmeldung ---------- */
  const loginMerken = (hash: string, email: string, ablauf: number) => { q("INSERT OR REPLACE INTO login (hash, email, ablauf) VALUES (?, ?, ?)", hash, email, ablauf); };
  function loginEinloesen(hash: string): string | null {
    const r = eins("SELECT email FROM login WHERE hash = ? AND ablauf > ?", hash, uhr());
    q("DELETE FROM login WHERE hash = ?", hash);
    return r ? r.email : null;
  }
  const sitzungAnlegen = (hash: string, email: string, ablauf: number) => { q("INSERT OR REPLACE INTO sitzung (hash, email, ablauf) VALUES (?, ?, ?)", hash, email, ablauf); };
  const sitzung = (hash: string): string | null => eins("SELECT email FROM sitzung WHERE hash = ? AND ablauf > ?", hash, uhr())?.email ?? null;
  const sitzungLoeschen = (hash: string) => { q("DELETE FROM sitzung WHERE hash = ?", hash); };
  /** Zähler gegen Missbrauch: true = erlaubt (und gezählt). */
  function zaehle(k: string, max: number, fensterMs: number) {
    const jetzt = uhr();
    const r = eins("SELECT n, bis FROM zaehler WHERE k = ?", k);
    if (!r || r.bis < jetzt) { q("INSERT OR REPLACE INTO zaehler (k, n, bis) VALUES (?, 1, ?)", k, jetzt + fensterMs); return true; }
    if (r.n >= max) return false;
    q("UPDATE zaehler SET n = n + 1 WHERE k = ?", k);
    return true;
  }

  /* ---------- Übersicht ---------- */
  function start() {
    const heute = tagAus(uhr());
    const z = (s: string, ...p: unknown[]) => Number(eins(s, ...p).n);
    return {
      heute,
      anrufen: heuteAnrufen(heute).length,
      firmen: z("SELECT COUNT(*) AS n FROM firma"),
      kunden: z("SELECT COUNT(*) AS n FROM firma WHERE status = 'kunde'"),
      offen_ct: z("SELECT COALESCE(SUM(betrag_ct), 0) AS n FROM zahlung WHERE bezahlt = 0"),
      ueberfaellig: z("SELECT COUNT(*) AS n FROM zahlung WHERE bezahlt = 0 AND faellig < ?", heute),
      monat_ct: z("SELECT COALESCE(SUM(monat_ct), 0) AS n FROM vertrag WHERE status = 'aktiv' OR (status = 'gekuendigt' AND ende >= ?)", heute),
      bot: { letzte_suche: zustand("letzte_suche"), letzte_impulse: zustand("impulse_tag"), suchmodus: einstellungen().suchmodus, bw: zustand("bw_fortschritt"), ki_heute: zustand("ki_zaehler"), neu_heute: z("SELECT COUNT(*) AS n FROM firma WHERE quelle = 'bot' AND erstellt >= ?", Date.parse(heute + "T00:00:00Z") - 2 * 3600_000), wartend: z("SELECT COUNT(*) AS n FROM firma WHERE status = 'neu' AND bewertet_am IS NULL AND quelle = 'bot'") },
    };
  }

  return {
    einstellungen, einstellungenSetzen, zustand,
    doppelt, firmaAnlegen, firmaAendern, firmaLoeschen, firma, firmen, pipeline, heuteAnrufen,
    ansprechpartner, ansprechpartnerLoeschen, kontakt, anrufErfassen, sperren, entsperren, einwilligungSetzen, infomailErlaubt, infomailVermerken,
    dokumentAblegen, dokument, dokumentLoeschen,
    produkte, produktSpeichern, vertragAnlegen, vertragAendern, monatsposten, vertraege, zahlungen, zahlungBezahlt, ueberfaelligMelden,
    aufgaben, aufgabeAnlegen, aufgabeErledigen, aufgabeVerschieben, wiedervorlageSetzen, wichtigSetzen,
    angebotAnlegen, angebote, angebotEntscheiden, unterlageSetzen, onboardingSetzen, fristenPruefen,
    cockpit, wochenbericht, wochenberichte, dubletten, leitfaeden, leitfadenSpeichern, leitfadenLoeschen, leitfadenFuer,
    naechsteSuche, istGesperrt, zuBewerten, wartend, firmenUebernehmen, botStatistik, bewertungSpeichern, impulseFuerHeute, aufraeumen,
    loginMerken, loginEinloesen, sitzungAnlegen, sitzung, sitzungLoeschen, zaehle, start,
  };
}
export type CrmKern = ReturnType<typeof crmKern>;
