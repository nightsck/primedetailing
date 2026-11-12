// Termin-Bot der Vorführseite (primedetailing.eu/demo/termin/).
//
//   GET  /api/demo/termin/zeiten   freie Zeiten aus dem echten Kalender
//   POST /api/demo/termin/buchen   Termin prüfen und in den Kalender eintragen
//   POST /api/demo/termin/absagen  selbst gebuchten Termin wieder löschen
//
// Kalender: Google Kalender über ein Dienstkonto (Service Account). Ohne Zugang
// antworten die Schnittstellen mit {kalender:false}; dann rechnet die Seite die
// freien Zeiten selbst und speichert Buchungen nur im Browser (Vorführmodus).
//
// Einrichtung (einmalig, siehe CLOUDFLARE.md → „Termin-Bot“):
//   npx wrangler secret put GOOGLE_SA_JSON          Inhalt der JSON-Schlüsseldatei
//   TERMIN_KALENDER = "…@group.calendar.google.com"  (wrangler.toml oder Dashboard)
//   optional je Betrieb: TERMIN_KALENDER_FAHRZEUG / _MALER / _ELEKTRO
//
// Die KI ist hier nicht beteiligt: Zeiten und Buchung rechnet nur der Code.
import type { Hono } from "hono";
// @ts-ignore – gemeinsame Datei mit der Website (reines JavaScript)
import { BETRIEBE, terminArt, terminZeitraum, freieZeiten, istDatum, plusTage, zeitpunkt, isoBerlin, TZ } from "../../src/assets/betriebe.js";
import { pruefeLimit } from "./limits.ts";
import { env } from "./config.ts";
import { sendeMail, mailAktiv, gueltigeMail, type Mail } from "./mail.ts";

export type Belegt = { start: number; ende: number };
export interface Kalender {
  belegt(von: number, bis: number): Promise<Belegt[]>;
  eintragen(e: { titel: string; text: string; ort: string; start: number; ende: number; privat: Record<string, string> }): Promise<string>;
  loeschen(id: string): Promise<void>;
}

const kurz = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();

/* ---------- Google Kalender ---------- */
const enc = new TextEncoder();
const b64u = (b: Uint8Array | string) => {
  const u = typeof b === "string" ? enc.encode(b) : b;
  let s = ""; for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

type Dienstkonto = { client_email: string; private_key: string };
export function leseDienstkonto(json: string): Dienstkonto | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    if (typeof o?.client_email === "string" && typeof o?.private_key === "string" && o.private_key.includes("PRIVATE KEY")) return { client_email: o.client_email, private_key: o.private_key };
  } catch { /* unbrauchbar */ }
  return null;
}

let zugang: { token: string; bis: number; email: string } | null = null;
async function googleToken(sa: Dienstkonto): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  if (zugang && zugang.email === sa.client_email && zugang.bis > jetzt + 60) return zugang.token;
  const der = unb64u(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_"));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const kopf = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: jetzt, exp: jetzt + 3600 }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(kopf + "." + inhalt)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${kopf}.${inhalt}.${b64u(sig)}` }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google-Anmeldung fehlgeschlagen (${r.status} ${j.error || ""})`);
  zugang = { token: j.access_token, bis: jetzt + Number(j.expires_in || 3600), email: sa.client_email };
  return zugang.token;
}

const cache = new Map<string, { bis: number; belegt: Belegt[] }>();
export function googleKalender(sa: Dienstkonto, id: string): Kalender {
  const api = "https://www.googleapis.com/calendar/v3";
  const rufe = async (pfad: string, init: RequestInit = {}) => {
    const r = await fetch(api + pfad, { ...init, headers: { Authorization: `Bearer ${await googleToken(sa)}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    return r;
  };
  return {
    async belegt(von, bis) {
      const k = `${id}|${von}|${bis}`; const c = cache.get(k);
      if (c && c.bis > Date.now()) return c.belegt;
      const r = await rufe("/freeBusy", { method: "POST", body: JSON.stringify({ timeMin: new Date(von).toISOString(), timeMax: new Date(bis).toISOString(), timeZone: TZ, items: [{ id }] }) });
      const j: any = await r.json().catch(() => ({}));
      const cal = j?.calendars?.[id];
      if (!r.ok || !cal || (cal.errors && cal.errors.length)) throw new Error(`Kalender nicht lesbar (${r.status} ${cal?.errors?.[0]?.reason || j?.error?.message || ""})`);
      const belegt = (cal.busy || []).map((x: any) => ({ start: Date.parse(x.start), ende: Date.parse(x.end) })).filter((x: Belegt) => x.ende > x.start);
      if (cache.size > 200) cache.clear();
      cache.set(k, { bis: Date.now() + 20_000, belegt });
      return belegt;
    },
    async eintragen(e) {
      const r = await rufe(`/calendars/${encodeURIComponent(id)}/events`, { method: "POST", body: JSON.stringify({
        summary: e.titel, description: e.text, location: e.ort,
        start: { dateTime: isoBerlin(e.start), timeZone: TZ }, end: { dateTime: isoBerlin(e.ende), timeZone: TZ },
        extendedProperties: { private: e.privat }, transparency: "opaque",
      }) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(`Eintragen fehlgeschlagen (${r.status} ${j?.error?.message || ""})`);
      cache.clear();
      return String(j.id);
    },
    async loeschen(eventId) {
      const r = await rufe(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Löschen fehlgeschlagen (${r.status})`);
      cache.clear();
    },
  };
}

let testKalender: ((betrieb: string) => Kalender | null) | null = null;
/** Nur für Tests: eigenen Kalender setzen (null = wieder echte Einstellungen). */
export function _setKalender(f: typeof testKalender) { testKalender = f; cache.clear(); }

export function kalenderFuer(c: any, betrieb: string): Kalender | null {
  if (testKalender) return testKalender(betrieb);
  const sa = leseDienstkonto(wert(c, "GOOGLE_SA_JSON"));
  const id = wert(c, "TERMIN_KALENDER_" + betrieb.toUpperCase()) || wert(c, "TERMIN_KALENDER");
  return sa && id ? googleKalender(sa, id) : null;
}

/** Kalender eines Kunden: ein Dienstkonto für alle (GOOGLE_SA_JSON), die Kalender-ID kommt aus seiner Konfiguration. */
export function kalenderMitId(c: any, kalenderId: string): Kalender | null {
  if (testKalender) return testKalender(kalenderId);
  const sa = leseDienstkonto(wert(c, "GOOGLE_SA_JSON"));
  return sa && kalenderId ? googleKalender(sa, kalenderId) : null;
}
/** E-Mail-Adresse des Dienstkontos – für diese Adresse gibt der Kunde seinen Kalender frei. */
export const dienstkontoMail = (c: any): string => leseDienstkonto(wert(c, "GOOGLE_SA_JSON"))?.client_email || "";

/* ---------- Absage-Schlüssel (nur wer gebucht hat, kann löschen) ---------- */
let hmac: CryptoKey | null = null;
async function hmacKey() {
  if (hmac) return hmac;
  const geheim = env.sessionSecret || "termin|" + [...crypto.getRandomValues(new Uint8Array(24))].join(",");
  hmac = await crypto.subtle.importKey("raw", enc.encode("termin-absage|" + geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return hmac;
}
type AbsageDaten = { b: string; e: string; s: number; t?: string; n?: string; m?: string };
export async function absageToken(daten: AbsageDaten) {
  const body = b64u(JSON.stringify(daten));
  return body + "." + b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body))));
}
export async function leseAbsageToken(token: unknown): Promise<AbsageDaten | null> {
  if (typeof token !== "string" || token.length > 900 || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), unb64u(sig), enc.encode(body)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return typeof d?.b === "string" && typeof d?.e === "string" && typeof d?.s === "number" ? d : null;
  } catch { return null; }
}

/* ---------- Eingaben prüfen ---------- */
export function pruefeBuchung(b: any): { ok: true; d: any } | { ok: false; fehler: string } {
  const betrieb = (BETRIEBE as any)[b?.betrieb];
  if (!betrieb) return { ok: false, fehler: "Unbekannter Betrieb." };
  const t = terminArt(betrieb, b.termin);
  if (!t) return { ok: false, fehler: "Unbekannte Terminart." };
  if (!istDatum(b.datum)) return { ok: false, fehler: "Datum fehlt." };
  const name = kurz(b.name, 80), telefon = kurz(b.telefon, 40), email = kurz(b.email, 100);
  if (!name) return { ok: false, fehler: "Bitte den Namen eintragen." };
  if (!telefon && !email) return { ok: false, fehler: "Bitte Telefon oder E-Mail eintragen." };
  if (telefon && telefon.replace(/\D/g, "").length < 6) return { ok: false, fehler: "Die Telefonnummer sieht zu kurz aus." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, fehler: "Die E-Mail-Adresse sieht nicht vollständig aus." };
  const a = b.adresse || {};
  const adresse = { strasse: kurz(a.strasse, 100), plz: kurz(a.plz, 5), ort: kurz(a.ort, 60) };
  if (t.ort === "kunde" && (!adresse.strasse || !/^\d{5}$/.test(adresse.plz) || !adresse.ort)) return { ok: false, fehler: "Bitte die Adresse für den Termin vor Ort eintragen." };
  if (b.einwilligung !== true) return { ok: false, fehler: "Bitte der Speicherung für den Termin zustimmen." };
  const z = terminZeitraum(betrieb, t.id, b.datum, b.zeit);
  if (!z) return { ok: false, fehler: "Diese Uhrzeit gibt es nicht." };
  return { ok: true, d: { betrieb, t, z, datum: b.datum, name, telefon, email, adresse, notiz: kurz(b.notiz, 500), details: kurz(b.details, 300) } };
}

export function eintrag(d: any, quelle = "Termin-Bot") {
  const { betrieb, t, z } = d;
  const ort = t.ort === "kunde" ? `${d.adresse.strasse}, ${d.adresse.plz} ${d.adresse.ort}` : t.ort === "telefon" ? `Rückruf: ${d.telefon || d.email}` : `${betrieb.name}, ${betrieb.adresse}`;
  const demo = process.env.TERMIN_DEMO !== "0";
  const text = [
    `${t.name} · gebucht über den ${quelle}${demo ? " (Vorführung)" : ""}`,
    `Name: ${d.name}`, d.telefon && `Telefon: ${d.telefon}`, d.email && `E-Mail: ${d.email}`,
    t.ort === "kunde" && `Adresse: ${ort}`, d.details && `Angaben: ${d.details}`, d.notiz && `Notiz vom Kunden: ${d.notiz}`,
    t.ort === "kunde" && betrieb.fahrt ? `Fahrzeit eingeplant: ${betrieb.fahrt} Min. davor und danach` : "",
  ].filter(Boolean).join("\n");
  return { titel: `${demo ? "[Demo] " : ""}${t.name} – ${d.name}`.slice(0, 120), text, ort, start: z.start, ende: z.ende, privat: { quelle: quelle === "Termin-Bot" ? "termin-bot" : "telefon-bot", betrieb: betrieb.id, termin: t.id } };
}

/* ---------- Bestätigung per E-Mail ---------- */
const escH = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const uhr = (ms: number) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const tagText = (ms: number) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
export function wannText(t: any, z: { start: number; ende: number }) {
  if (t.ganztag) return `${tagText(z.start)}, bringen um ${uhr(z.start)} Uhr${t.ganztag > 1 ? `, fertig nach ${t.ganztag} Arbeitstagen` : ", abholen am Abend"}`;
  return `${tagText(z.start)}, ${uhr(z.start)}–${uhr(z.ende)} Uhr`;
}
const icsZeit = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
export function icsDatei(o: { uid: string; start: number; ende: number; titel: string; ort: string; text: string }) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Auftragsfaenger//Termin-Bot//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${o.uid}@termin-bot`, `DTSTAMP:${icsZeit(Date.now())}`, `DTSTART:${icsZeit(o.start)}`, `DTEND:${icsZeit(o.ende)}`,
    `SUMMARY:${icsText(o.titel)}`, `LOCATION:${icsText(o.ort)}`, `DESCRIPTION:${icsText(o.text)}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Erinnerung", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
const zeilenHtml = (zeilen: [string, string][]) => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0">${zeilen.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5A6A73;vertical-align:top">${escH(k)}</td><td style="padding:4px 0">${escH(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`;
const rahmen = (farbe: string, kopf: string, inhalt: string) => `<!doctype html><html lang="de"><body style="margin:0;background:#F4F2EE;font-family:Arial,Helvetica,sans-serif;color:#16222A">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E1E4E6">
<div style="background:${farbe};color:#FFFFFF;padding:16px 20px;font-size:17px;font-weight:bold">${escH(kopf)}</div>
<div style="padding:20px;font-size:15px;line-height:1.5">${inhalt}</div></div></div></body></html>`;
const empfaengerBetrieb = (c: any, id: string) => [wert(c, "TERMIN_MAIL_BETRIEB_" + id.toUpperCase()), wert(c, "TERMIN_MAIL_BETRIEB")].find((x) => x && gueltigeMail(x)) || "";
const seite = (c: any) => wert(c, "TERMIN_SEITE") || "https://primedetailing.eu/demo/termin/";

export function terminMails(c: any, d: any, o: { id: string; token: string; ort: string }): { kunde: Mail | null; betrieb: Mail | null } {
  const { betrieb: b, t, z } = d;
  const wann = wannText(t, z);
  const demo = process.env.TERMIN_DEMO !== "0";
  const anhang = [{ name: "termin.ics", inhalt: icsDatei({ uid: o.id || `${b.id}-${z.start}`, start: z.start, ende: z.ende, titel: `${t.name} bei ${b.name}`, ort: o.ort, text: `${t.name} bei ${b.name}. Kontakt: ${b.adresse}` }) }];
  const absagen = o.token ? `${seite(c)}?betrieb=${b.id}&absagen=${encodeURIComponent(o.token)}` : "";
  const kundeZeilen: [string, string][] = [["Termin", t.name], ["Wann", wann], ["Wo", o.ort]];
  if (d.details) kundeZeilen.push([b.id === "fahrzeug" ? "Fahrzeug" : "Worum es geht", d.details]);
  if (d.notiz) kundeZeilen.push(["Ihre Notiz", d.notiz]);
  const kunde: Mail | null = d.email ? {
    an: d.email, anName: d.name, absenderName: b.name, betreff: `Ihr Termin bei ${b.name}: ${wann}`,
    text: [`Guten Tag ${d.name},`, "", `Ihr Termin bei ${b.name} steht.`, "", ...kundeZeilen.map(([k, v]) => `${k}: ${v}`), "",
      "Den Termin finden Sie auch im Anhang, zum Übernehmen in Ihren Kalender.",
      absagen ? `Sie können nicht? Hier absagen: ${absagen}` : `Sie können nicht? Bitte kurz Bescheid geben.`, "",
      `${b.name} · ${b.adresse} · ${b.zeitenText}`, demo ? "\n(Vorführung des Termin-Bots, erfundener Beispielbetrieb.)" : ""].join("\n"),
    html: rahmen(b.farbe, `Ihr Termin bei ${b.name}`, `<p style="margin:0 0 4px">Guten Tag ${escH(d.name)},</p><p style="margin:0">Ihr Termin steht.</p>${zeilenHtml(kundeZeilen)}
      <p style="margin:0 0 12px">Im Anhang finden Sie den Termin zum Übernehmen in Ihren Kalender.</p>
      ${absagen ? `<p style="margin:0 0 16px"><a href="${escH(absagen)}" style="color:${b.farbe}">Sie können nicht? Termin absagen</a></p>` : ""}
      <p style="margin:0;color:#5A6A73;font-size:13px">${escH(b.name)} · ${escH(b.adresse)} · ${escH(b.zeitenText)}${demo ? "<br>Vorführung des Termin-Bots, erfundener Beispielbetrieb." : ""}</p>`),
    anhang,
  } : null;
  const an = empfaengerBetrieb(c, b.id);
  const betriebZeilen: [string, string][] = [["Termin", t.name], ["Wann", wann], ["Wo", o.ort], ["Name", d.name]];
  if (d.telefon) betriebZeilen.push(["Telefon", d.telefon]);
  if (d.email) betriebZeilen.push(["E-Mail", d.email]);
  if (d.details) betriebZeilen.push([b.id === "fahrzeug" ? "Fahrzeug" : "Worum es geht", d.details]);
  if (d.notiz) betriebZeilen.push(["Notiz", d.notiz]);
  const betriebMail: Mail | null = an ? {
    an, absenderName: "Termin-Bot", antwortAn: d.email || undefined, betreff: `${demo ? "[Demo] " : ""}Neuer Termin: ${t.name} – ${d.name}, ${wann}`,
    text: ["Neuer Termin über den Termin-Bot:", "", ...betriebZeilen.map(([k, v]) => `${k}: ${v}`), "",
      o.id ? "Der Termin steht schon im Kalender." : "Kein Kalender verbunden: Termin bitte selbst eintragen (Anhang).",
      d.email ? "Mit „Antworten“ schreiben Sie direkt dem Kunden." : ""].join("\n"),
    html: rahmen("#1B1D1F", `Neuer Termin: ${t.name}`, `${zeilenHtml(betriebZeilen)}
      <p style="margin:0;color:#5A6A73;font-size:13px">${o.id ? "Der Termin steht schon im Kalender." : "Kein Kalender verbunden: Termin bitte selbst eintragen (Anhang)."}${d.email ? " Mit „Antworten“ schreiben Sie direkt dem Kunden." : ""}</p>`),
    anhang,
  } : null;
  return { kunde, betrieb: betriebMail };
}
export async function verschicke(c: any, mails: { kunde: Mail | null; betrieb: Mail | null }) {
  const [k, b] = await Promise.all([mails.kunde ? sendeMail(c, mails.kunde) : false, mails.betrieb ? sendeMail(c, mails.betrieb) : false]);
  return { kunde: k, betrieb: b };
}

const TEXT = {
  belegt: "Diese Zeit ist gerade weg. Bitte eine andere wählen.",
  kalender: "Der Kalender ist gerade nicht erreichbar.",
  fehler: "Das hat nicht geklappt. Bitte noch einmal versuchen.",
};

export function terminRouten(app: Hono) {
  app.get("/api/demo/termin/zeiten", async (c) => {
    const q = c.req.query();
    const betrieb = (BETRIEBE as any)[q.betrieb || ""];
    const t = betrieb && terminArt(betrieb, q.termin);
    if (!betrieb || !t) return c.json({ ok: false, fehler: "unbekannt" }, 400);
    const kal = kalenderFuer(c, betrieb.id);
    if (!kal) return c.json({ ok: true, kalender: false });
    const von = istDatum(q.von) ? q.von : undefined;
    const tage = Math.max(1, Math.min(21, Number(q.tage) || 14));
    const ab = von || new Date().toISOString().slice(0, 10);
    try {
      const belegt = await kal.belegt(zeitpunkt(plusTage(ab, -1), 0), zeitpunkt(plusTage(ab, tage + 4), 0));
      return c.json({ ok: true, kalender: true, tage: freieZeiten(betrieb, t.id, { von, tage, belegt }) });
    } catch (e: any) {
      console.error("[termin-zeiten]", e?.message || e);
      return c.json({ ok: false, kalender: true, fehler: "kalender", text: TEXT.kalender }, 502);
    }
  });

  app.post("/api/demo/termin/buchen", async (c) => {
    if (Number(c.req.header("content-length") || 0) > 8_000) return c.json({ ok: false, fehler: TEXT.fehler }, 413);
    const b: any = await c.req.json().catch(() => ({}));
    const p = pruefeBuchung(b);
    if (!p.ok) return c.json({ ok: false, fehler: p.fehler }, 400);
    const sperre = await pruefeLimit(c, "anfrage");
    if (sperre) return c.json({ ok: false, limit: true, fehler: sperre }, 429);
    const d = p.d;
    const kal = kalenderFuer(c, d.betrieb.id);
    const ev = eintrag(d);
    if (!kal) {
      // Ohne Kalender: Bestätigung trotzdem per Mail, wenn eingerichtet
      const mail = mailAktiv(c) ? await verschicke(c, terminMails(c, d, { id: "", token: "", ort: ev.ort })) : undefined;
      return c.json({ ok: true, kalender: false, ...(mail ? { mail } : {}) });
    }
    try {
      // Kurz vor dem Eintragen noch einmal prüfen: Ist die Zeit wirklich noch frei?
      const belegt = await kal.belegt(d.z.blockVon - 86_400_000, d.z.blockBis + 86_400_000);
      const frei = freieZeiten(d.betrieb, d.t.id, { von: d.datum, tage: 1, belegt })[0];
      if (!frei || !frei.slots.includes(d.z.zeit)) return c.json({ ok: false, belegt: true, fehler: TEXT.belegt }, 409);
      const id = await kal.eintragen(ev);
      console.log(`[termin] ${d.betrieb.id}/${d.t.id} ${d.datum} ${d.z.zeit}`);
      const token = await absageToken({ b: d.betrieb.id, e: id, s: d.z.start, t: d.t.id, n: d.name.slice(0, 40), m: d.email || undefined });
      const mail = mailAktiv(c) ? await verschicke(c, terminMails(c, d, { id, token, ort: ev.ort })) : undefined;
      return c.json({ ok: true, kalender: true, id, token, start: isoBerlin(d.z.start), ende: isoBerlin(d.z.ende), ...(mail ? { mail } : {}) });
    } catch (e: any) {
      console.error("[termin-buchen]", e?.message || e);
      return c.json({ ok: false, kalender: true, fehler: TEXT.kalender }, 502);
    }
  });

  app.post("/api/demo/termin/absagen", async (c) => {
    const b: any = await c.req.json().catch(() => ({}));
    const t = await leseAbsageToken(b.token);
    if (!t) return c.json({ ok: false, fehler: "Ungültiger Link." }, 400);
    if (t.s < Date.now()) return c.json({ ok: false, fehler: "Der Termin liegt schon in der Vergangenheit." }, 400);
    const kal = kalenderFuer(c, t.b);
    if (!kal) return c.json({ ok: false, fehler: TEXT.kalender }, 503);
    try {
      await kal.loeschen(t.e);
      if (mailAktiv(c)) {
        const b = (BETRIEBE as any)[t.b], art = b && terminArt(b, t.t || "");
        const was = `${art ? art.name : "Termin"} am ${tagText(t.s)} um ${uhr(t.s)} Uhr`;
        const an = b ? empfaengerBetrieb(c, b.id) : "";
        const demo = process.env.TERMIN_DEMO !== "0";
        await Promise.all([
          an ? sendeMail(c, { an, absenderName: "Termin-Bot", antwortAn: t.m, betreff: `${demo ? "[Demo] " : ""}Abgesagt: ${was}${t.n ? " – " + t.n : ""}`,
            text: `Der Kunde hat abgesagt: ${was}${t.n ? ` (${t.n})` : ""}. Der Termin ist aus dem Kalender gelöscht.`,
            html: rahmen("#1B1D1F", "Termin abgesagt", `<p style="margin:0">Der Kunde hat abgesagt: <b>${escH(was)}</b>${t.n ? ` (${escH(t.n)})` : ""}.</p><p style="margin:8px 0 0">Der Termin ist aus dem Kalender gelöscht.</p>`) }) : false,
          t.m && b ? sendeMail(c, { an: t.m, anName: t.n, absenderName: b.name, betreff: `Abgesagt: Ihr Termin bei ${b.name}`,
            text: `Guten Tag${t.n ? " " + t.n : ""},\n\nIhr Termin (${was}) ist abgesagt. Einen neuen Termin buchen Sie hier: ${seite(c)}?betrieb=${b.id}`,
            html: rahmen(b.farbe, `Termin abgesagt`, `<p style="margin:0 0 8px">Guten Tag${t.n ? " " + escH(t.n) : ""},</p><p style="margin:0 0 12px">Ihr Termin (${escH(was)}) ist abgesagt.</p><p style="margin:0"><a href="${escH(seite(c) + "?betrieb=" + b.id)}" style="color:${b.farbe}">Neuen Termin buchen</a></p>`) }) : false,
        ]);
      }
      return c.json({ ok: true });
    }
    catch (e: any) { console.error("[termin-absagen]", e?.message || e); return c.json({ ok: false, fehler: TEXT.fehler }, 502); }
  });
}
