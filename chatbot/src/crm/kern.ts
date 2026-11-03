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

export const STANDARD_EINSTELLUNGEN = {
  bot_aktiv: true,
  /** "bw" = ganz Baden-Württemberg, alle Firmen mit Website oder E-Mail; "branchen" = nur Zielbranchen in Zielregionen */
  suchmodus: "bw",
  /** Höchstens so viele KI-Bewertungen pro Tag (Kostenbremse, ca. 0,05 Cent pro Bewertung) */
  ki_pro_tag: 150,
  zielbranchen: ["autowerkstatt", "fahrzeugpflege"],
  zielregionen: ["Stuttgart", "Karlsruhe", "Mannheim", "Freiburg im Breisgau", "Heilbronn", "Ulm"],
  schwelle: 70,
  impulse_pro_tag: 10,
  impulse_an: "kifuermeinenbetrieb@gmail.com",
  neue_pro_lauf: 40,
  infomail_betreff: "Ihre Infos zu KI für Ihren Betrieb",
  infomail_text: "Guten Tag {ansprechpartner},\n\nvielen Dank für das nette Telefonat. Wie besprochen schicke ich Ihnen hier die Infos.\n\nWir richten für Betriebe wie {firma} digitale Helfer ein, die Anfragen annehmen, wenn niemand ans Telefon kann: einen Chat auf der Website, Online-Terminbuchung und eine automatische Rückmeldung bei verpassten Anrufen. Eine Vorführung sehen Sie hier: https://primedetailing.eu/demo/\n\nWenn Sie Fragen haben, antworten Sie einfach auf diese Mail.\n\nViele Grüße",
  impressum: "",
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
export const istTag = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"));
const monatVon = (tag: string) => tag.slice(0, 7);
const monatPlus = (monat: string, n: number) => { const [j, m] = monat.split("-").map(Number); const d = new Date(Date.UTC(j, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const cent = (eur: unknown) => { const n = Number(String(eur ?? "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const txt = (s: unknown, max = 500) => (s === null || s === undefined ? null : String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) || null);
export const nurZiffern = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^0049/, "0").replace(/^49/, "0");
export function domainVon(url: unknown): string | null {
  const s = String(url ?? "").trim();
  if (!s) return null;
  try { return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase() || null; } catch { return null; }
}

const FIRMA_FELDER = ["name", "branche", "strasse", "plz", "ort", "bundesland", "telefon", "website", "email", "notiz", "zustaendig", "wiedervorlage", "status"] as const;

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
  ]) sql.exec(s);

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
      if (!(k in (d || {}))) continue;
      let v: unknown = txt(d[k], k === "notiz" ? 4000 : 300);
      if (k === "name" && !v) throw new Error("Der Firmenname darf nicht leer sein.");
      if (k === "status" && !STATUS.includes(v as any)) continue;
      if (k === "wiedervorlage" && v && !istTag(v)) continue;
      sets.push(`${k} = ?`); werte.push(v);
      if (k === "telefon") { sets.push("telefon_norm = ?"); werte.push(nurZiffern(v) || null); }
      if (k === "website") { sets.push("domain = ?"); werte.push(domainVon(v)); }
    }
    if (sets.length) q(`UPDATE firma SET ${sets.join(", ")}, geaendert = ? WHERE id = ?`, ...werte, uhr(), id);
    return firma(id);
  }
  function firmaLoeschen(id: number) {
    for (const d of q("SELECT id FROM dokument WHERE firma_id = ?", id)) q("DELETE FROM dokteil WHERE id = ?", d.id);
    for (const t of ["dokument", "ansprechpartner", "kontakt", "zahlung", "vertrag"]) q(`DELETE FROM ${t} WHERE firma_id = ?`, id);
    q("DELETE FROM firma WHERE id = ?", id);
  }
  const firmaZeile = (r: any) => r && ({ ...r, infos: r.infos ? JSON.parse(r.infos) : null, einwilligung: !!r.einwilligung, gesperrt: !!r.gesperrt });
  function firma(id: number) {
    const f = firmaZeile(eins("SELECT * FROM firma WHERE id = ?", id));
    if (!f) return null;
    return {
      ...f,
      ansprechpartner: q("SELECT * FROM ansprechpartner WHERE firma_id = ? ORDER BY id", id),
      kontakte: q("SELECT * FROM kontakt WHERE firma_id = ? ORDER BY zeitpunkt DESC, id DESC LIMIT 200", id).map((k) => ({ ...k, einwilligung: !!k.einwilligung })),
      dokumente: q("SELECT id, vertrag_id, titel, typ, name, mime, groesse, datum, erstellt FROM dokument WHERE firma_id = ? ORDER BY erstellt DESC", id),
      vertraege: q("SELECT * FROM vertrag WHERE firma_id = ? ORDER BY beginn DESC", id),
      zahlungen: zahlungen({ firma_id: id }),
    };
  }
  function firmen(o: { q?: string; status?: string; limit?: number } = {}) {
    const w: string[] = [], p: unknown[] = [];
    if (o.status && STATUS.includes(o.status as any)) { w.push("status = ?"); p.push(o.status); }
    if (o.q) { w.push("(name LIKE ? OR ort LIKE ? OR plz LIKE ? OR telefon LIKE ? OR domain LIKE ?)"); const s = `%${String(o.q).slice(0, 80)}%`; p.push(s, s, s, s, s); }
    const lim = Math.max(1, Math.min(500, Number(o.limit) || 200));
    return q(`SELECT id, name, branche, ort, plz, telefon, website, status, score, gesperrt, wiedervorlage, einwilligung FROM firma
      ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY geaendert DESC LIMIT ${lim}`, ...p).map((r) => ({ ...r, gesperrt: !!r.gesperrt, einwilligung: !!r.einwilligung }));
  }
  function pipeline() {
    const zahlen: Record<string, number> = Object.fromEntries(STATUS.map((s) => [s, 0]));
    for (const r of q("SELECT status, COUNT(*) AS n FROM firma GROUP BY status")) zahlen[r.status] = Number(r.n);
    const spalten: Record<string, any[]> = {};
    for (const s of STATUS) spalten[s] = q("SELECT id, name, ort, score, wiedervorlage, gesperrt FROM firma WHERE status = ? ORDER BY score DESC, geaendert DESC LIMIT 40", s)
      .map((r) => ({ ...r, gesperrt: !!r.gesperrt }));
    return { zahlen, spalten };
  }
  function heuteAnrufen(heute = tagAus(uhr())) {
    return q(`SELECT id, name, branche, ort, telefon, score, score_grund, einstieg, status, wiedervorlage FROM firma
      WHERE gesperrt = 0 AND (status = 'anruf_impuls' OR (wiedervorlage IS NOT NULL AND wiedervorlage <= ? AND status NOT IN ('kunde','beendet','kein_interesse')))
      ORDER BY (wiedervorlage IS NOT NULL AND wiedervorlage <= ?) DESC, score DESC LIMIT 100`, heute, heute);
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
    q(`INSERT INTO kontakt (firma_id, zeitpunkt, kanal, richtung, durch, ergebnis, notiz, einwilligung, naechster_schritt, wiedervorlage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      firmaId, Number(k.zeitpunkt) || uhr(), kanal, k.richtung === "ein" ? "ein" : k.richtung === "aus" ? "aus" : null, txt(k.durch, 60) || "Team",
      txt(k.ergebnis, 300), txt(k.notiz, 4000), k.einwilligung ? 1 : 0, txt(k.naechster_schritt, 300), istTag(k.wiedervorlage) ? k.wiedervorlage : null);
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
    q("UPDATE firma SET status = ?, wiedervorlage = ?, geaendert = ? WHERE id = ?", status, wv, uhr(), id);
    if (einwilligung) einwilligungSetzen(id, true, `Telefonat am ${heute} durch ${durch}${notiz ? ": " + notiz.slice(0, 200) : ""}`, durch, false);
    kontakt(id, { kanal: "anruf", richtung: "aus", durch, ergebnis: texte[ergebnis], notiz, einwilligung, wiedervorlage: wv, naechster_schritt: txt(d.naechster_schritt, 300) });
    if (ergebnis === "widerspruch") sperren(id, "Widerspruch im Telefonat", durch);
    return { status, wiedervorlage: wv, einwilligung, infomail: einwilligung };
  }
  function sperren(id: number, grund: string, durch: string) {
    q("UPDATE firma SET gesperrt = 1, gesperrt_grund = ?, gesperrt_datum = ?, wiedervorlage = NULL, status = CASE WHEN status IN ('kunde','beendet') THEN status ELSE 'kein_interesse' END, geaendert = ? WHERE id = ?",
      txt(grund, 300) || "Gesperrt", tagAus(uhr()), uhr(), id);
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
    q("UPDATE firma SET status = CASE WHEN status IN ('kunde','beendet','termin','angebot') THEN status ELSE 'infos_mail' END, wiedervorlage = ?, geaendert = ? WHERE id = ?", wv, uhr(), id);
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
  const produkte = () => q("SELECT * FROM produkt ORDER BY aktiv DESC, name").map((p) => ({ ...p, aktiv: !!p.aktiv }));
  function produktSpeichern(d: any) {
    const name = txt(d?.name, 120);
    if (!name) throw new Error("Bitte einen Produktnamen eintragen.");
    const werte = [name, txt(d.beschreibung, 1000), cent(d.einmal), cent(d.monatlich), txt(d.leistung, 200), d.aktiv === false || d.aktiv === "false" ? 0 : 1];
    if (d.id) { q("UPDATE produkt SET name = ?, beschreibung = ?, einmal_ct = ?, monat_ct = ?, leistung = ?, aktiv = ? WHERE id = ?", ...werte, Number(d.id)); return Number(d.id); }
    q("INSERT INTO produkt (name, beschreibung, einmal_ct, monat_ct, leistung, aktiv) VALUES (?, ?, ?, ?, ?, ?)", ...werte);
    return neueId();
  }

  /* ---------- Verträge und Zahlungen (W8, W9, W10) ---------- */
  function vertragAnlegen(firmaId: number, d: any, durch: string) {
    if (!eins("SELECT id FROM firma WHERE id = ?", firmaId)) throw new Error("Firma nicht gefunden.");
    const beginn = istTag(d?.beginn) ? d.beginn : null;
    if (!beginn) throw new Error("Bitte das Beginn-Datum eintragen.");
    const jahr = beginn.slice(0, 4);
    const n = Number(eins("SELECT COUNT(*) AS n FROM vertrag WHERE nummer LIKE ?", `V-${jahr}-%`).n) + 1;
    const nummer = `V-${jahr}-${String(n).padStart(3, "0")}`;
    const einmal = cent(d.einmal), monat = cent(d.monatlich);
    q(`INSERT INTO vertrag (firma_id, nummer, produkt, beginn, mindestlaufzeit, kuendigungsfrist, ende, status, einmal_ct, monat_ct, notiz, erstellt)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'aktiv', ?, ?, ?, ?)`, firmaId, nummer, txt(d.produkt, 200), beginn, Number(d.mindestlaufzeit) || null, txt(d.kuendigungsfrist, 100), einmal, monat, txt(d.notiz, 2000), uhr());
    const id = neueId();
    if (einmal > 0) q("INSERT OR IGNORE INTO zahlung (vertrag_id, firma_id, art, leistungsmonat, betrag_ct, faellig) VALUES (?, ?, 'einrichtung', ?, ?, ?)", id, firmaId, monatVon(beginn), einmal, plusTage(beginn, 14));
    q("UPDATE firma SET status = 'kunde', wiedervorlage = NULL, geaendert = ? WHERE id = ?", uhr(), firmaId);
    kontakt(firmaId, { kanal: "notiz", durch, ergebnis: `Vertrag ${nummer} angelegt`, notiz: `${d.produkt || ""} ab ${beginn}`.trim() });
    monatsposten();
    return { id, nummer };
  }
  function vertragAendern(id: number, d: any, durch: string) {
    const v = eins("SELECT * FROM vertrag WHERE id = ?", id);
    if (!v) throw new Error("Vertrag nicht gefunden.");
    const status = ["aktiv", "gekuendigt", "beendet"].includes(d?.status) ? d.status : v.status;
    const ende = d && "ende" in d ? (istTag(d.ende) ? d.ende : null) : v.ende;
    if (status === "gekuendigt" && !ende) throw new Error("Bitte das Vertragsende eintragen.");
    q("UPDATE vertrag SET status = ?, ende = ?, produkt = ?, kuendigungsfrist = ?, notiz = ?, monat_ct = ? WHERE id = ?",
      status, status === "aktiv" ? ende : ende || tagAus(uhr()), d && "produkt" in d ? txt(d.produkt, 200) : v.produkt, d && "kuendigungsfrist" in d ? txt(d.kuendigungsfrist, 100) : v.kuendigungsfrist,
      d && "notiz" in d ? txt(d.notiz, 2000) : v.notiz, d && "monatlich" in d ? cent(d.monatlich) : v.monat_ct, id);
    if (status !== v.status) kontakt(v.firma_id, { kanal: "notiz", durch, ergebnis: `Vertrag ${v.nummer}: ${status === "gekuendigt" ? `gekündigt zum ${ende}` : status === "beendet" ? "beendet" : "wieder aktiv"}` });
    const aktive = Number(eins("SELECT COUNT(*) AS n FROM vertrag WHERE firma_id = ? AND (status = 'aktiv' OR (status = 'gekuendigt' AND ende >= ?))", v.firma_id, tagAus(uhr())).n);
    q("UPDATE firma SET status = ?, geaendert = ? WHERE id = ? AND status IN ('kunde','beendet')", aktive ? "kunde" : "beendet", uhr(), v.firma_id);
    return eins("SELECT * FROM vertrag WHERE id = ?", id);
  }
  /** Legt fehlende Monatsposten an (idempotent, läuft bei jedem Zeitplan-Durchlauf). */
  function monatsposten(heute = tagAus(uhr())) {
    const bis = monatVon(heute);
    let neu = 0;
    for (const v of q("SELECT * FROM vertrag WHERE monat_ct > 0 AND status != 'beendet'")) {
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
    const w = o.laufend === undefined ? "" : o.laufend ? "WHERE v.status = 'aktiv' OR (v.status = 'gekuendigt' AND (v.ende IS NULL OR v.ende >= ?))" : "WHERE v.status = 'beendet' OR (v.status = 'gekuendigt' AND v.ende < ?)";
    return q(`SELECT v.*, f.name AS firma FROM vertrag v JOIN firma f ON f.id = v.firma_id ${w} ORDER BY v.beginn DESC`, ...(w ? [heute] : []));
  }
  function zahlungen(o: { offen?: boolean; firma_id?: number } = {}) {
    const heute = tagAus(uhr());
    const w: string[] = [], p: unknown[] = [heute];
    if (o.offen) w.push("z.bezahlt = 0");
    if (o.firma_id) { w.push("z.firma_id = ?"); p.push(o.firma_id); }
    return q(`SELECT z.*, f.name AS firma, v.nummer AS vertrag, CASE WHEN z.bezahlt = 1 THEN 'bezahlt' WHEN z.faellig < ? THEN 'ueberfaellig' ELSE 'offen' END AS zahlstatus
      FROM zahlung z JOIN firma f ON f.id = z.firma_id JOIN vertrag v ON v.id = z.vertrag_id ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY z.bezahlt, z.faellig ${o.offen ? "ASC" : "DESC"} LIMIT 500`, ...p).map((z) => ({ ...z, bezahlt: !!z.bezahlt }));
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
      AND (impuls_am IS NULL OR impuls_am <= ?) ORDER BY score DESC LIMIT ?`, vorher, Math.max(1, n));
    const faellig = q(`SELECT id, name, branche, ort, telefon, score, wiedervorlage, status FROM firma WHERE gesperrt = 0 AND wiedervorlage IS NOT NULL AND wiedervorlage <= ?
      AND status NOT IN ('kunde','beendet','kein_interesse') ORDER BY wiedervorlage LIMIT 50`, heute);
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
    naechsteSuche, istGesperrt, zuBewerten, wartend, firmenUebernehmen, botStatistik, bewertungSpeichern, impulseFuerHeute, aufraeumen,
    loginMerken, loginEinloesen, sitzungAnlegen, sitzung, sitzungLoeschen, zaehle, start,
  };
}
export type CrmKern = ReturnType<typeof crmKern>;
