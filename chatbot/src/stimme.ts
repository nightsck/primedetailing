// Telefon-Bot (Sprach-KI, z. B. ElevenLabs Agents): Werkzeuge, die der Sprach-Agent
// während des Gesprächs aufruft. Gleicher Kalender, gleiche Öffnungszeiten und
// gleiche Bestätigungsmails wie der Termin-Bot auf der Website (termin.ts).
//
//   POST /api/stimme/info       Betrieb, Öffnungszeiten, Terminarten, heutiges Datum
//   POST /api/stimme/zeiten     freie Zeiten, auch aus einem Wunsch wie „Dienstag nachmittag“
//   POST /api/stimme/buchen     Termin eintragen (nur mit Zustimmung des Anrufers)
//   POST /api/stimme/rueckruf   Rückrufwunsch per Mail an den Betrieb
//
// Antworten sind kurz und enthalten immer ein Feld "sagen": ein Satz, den der
// Agent dem Anrufer so oder ähnlich sagen kann. Die KI rechnet keine Zeiten selbst.
//
// Einstellungen (Cloudflare → Worker → Variablen):
//   STIMME_SCHLUESSEL   Secret: langes Zufallswort. Der Agent schickt es im Kopf
//                       „x-stimme-schluessel“ mit. Fehlt es, sind die Werkzeuge aus.
//   STIMME_BETRIEB      welcher Beispielbetrieb (fahrzeug, maler, elektro), Standard fahrzeug
// Der Kalender kommt wie beim Termin-Bot aus GOOGLE_SA_JSON + TERMIN_KALENDER(_<BETRIEB>).
import type { Hono } from "hono";
// @ts-ignore – gemeinsame Datei mit der Website (reines JavaScript)
import { BETRIEBE, terminArt, freieZeiten, istDatum, plusTage, zeitpunkt, heute as heuteVon, verstehWunsch, minuten, TZ } from "../../src/assets/betriebe.js";
import { kalenderFuer, pruefeBuchung, eintrag, verschicke, terminMails, wannText, absageToken } from "./termin.ts";
import { sendeMail, mailAktiv, gueltigeMail } from "./mail.ts";

const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();
const kurz = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const enc = new TextEncoder();

/** Schlüssel vergleichen, ohne dass die Laufzeit etwas verrät. */
export async function schluesselOk(c: any, mitgeschickt: unknown): Promise<boolean | "aus"> {
  const soll = wert(c, "STIMME_SCHLUESSEL");
  if (soll.length < 16) return "aus";
  const [a, b] = await Promise.all([soll, String(mitgeschickt ?? "")].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function betriebVon(c: any, b: unknown) {
  return (BETRIEBE as any)[String(b || "")] || (BETRIEBE as any)[wert(c, "STIMME_BETRIEB")] || (BETRIEBE as any).fahrzeug;
}
const tagLang = (datum: string) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(datum + "T12:00:00Z"));
const uhrText = (zeit: string) => zeit.replace(/^0/, "").replace(/:00$/, "") + " Uhr";
/** „9 Uhr, 10:30 Uhr oder 14 Uhr“ */
const liste = (xs: string[]) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " oder " + xs[xs.length - 1];

/** Höchstens n Zeiten, gleichmäßig über den Tag verteilt (am Telefon will niemand 17 Zeiten hören). */
export function verteilt(slots: string[], n = 3): string[] {
  if (slots.length <= n) return slots;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(slots[Math.round((i * (slots.length - 1)) / (n - 1))]);
  return [...new Set(out)];
}

/**
 * Freie Zeiten passend zum Wunsch. Gibt bis zu `tage` Tage mit je bis zu 3 Zeiten zurück.
 * `belegt` kommt aus dem Kalender (oder leer ohne Kalender).
 */
export function vorschlaege(b: any, terminId: string, o: { wunsch?: string; datum?: string; belegt?: { start: number; ende: number }[]; jetzt?: number; tage?: number }) {
  const jetzt = o.jetzt ?? Date.now();
  const w = o.wunsch ? verstehWunsch(o.wunsch, jetzt) : null;
  const ab = istDatum(o.datum) ? o.datum! : w?.datum || heuteVon(jetzt);
  const teil = w?.teil || null, abMin = w?.ab ?? null;
  const passt = (z: string) => {
    const m = minuten(z);
    if (teil === "vormittag" && m >= 720) return false;
    if (teil === "nachmittag" && m < 720) return false;
    if (abMin !== null && m < abMin - 60) return false;
    return true;
  };
  const roh = freieZeiten(b, terminId, { von: ab, tage: 21, belegt: o.belegt || [], jetzt });
  const tage: { datum: string; tag: string; zeiten: string[] }[] = [];
  for (const t of roh) {
    const z = t.slots.filter(passt);
    if (!z.length) continue;
    // Uhrzeit-Wunsch: die nächstgelegenen Zeiten zuerst
    const auswahl = abMin !== null ? z.sort((x: string, y: string) => Math.abs(minuten(x) - abMin) - Math.abs(minuten(y) - abMin)).slice(0, 3).sort() : verteilt(z, 3);
    tage.push({ datum: t.datum, tag: tagLang(t.datum), zeiten: auswahl });
    if (tage.length >= (o.tage || 2)) break;
  }
  return { gewuenscht: w ? { datum: w.datum, teil: w.teil } : null, tage };
}

const sagenZeiten = (t: { tag: string; zeiten: string[] }[], gewuenschtAm: string | null) => {
  if (!t.length) return "In den nächsten drei Wochen ist dafür leider nichts mehr frei. Ich nehme gern einen Rückrufwunsch auf.";
  const erst = t[0];
  const anders = gewuenschtAm && erst.zeiten.length && t[0].tag !== tagLang(gewuenschtAm) ? `Am ${tagLang(gewuenschtAm)} ist leider nichts mehr frei. ` : "";
  return `${anders}Frei wäre ${t.map((x) => `am ${x.tag} um ${liste(x.zeiten.map(uhrText))}`).join(", oder ")}. Was passt Ihnen?`;
};

export function stimmeRouten(app: Hono) {
  const geschuetzt = (h: (c: any, b: any) => Promise<Response>) => async (c: any) => {
    const ok = await schluesselOk(c, c.req.header("x-stimme-schluessel"));
    if (ok === "aus") return c.json({ ok: false, fehler: "Telefon-Bot ist nicht eingerichtet (STIMME_SCHLUESSEL fehlt)." }, 503);
    if (!ok) return c.json({ ok: false, fehler: "Nicht erlaubt." }, 401);
    if (Number(c.req.header("content-length") || 0) > 8_000) return c.json({ ok: false, fehler: "zu groß" }, 413);
    const b: any = await c.req.json().catch(() => ({}));
    try { return await h(c, b || {}); }
    catch (e: any) {
      console.error("[stimme]", e?.message || e);
      return c.json({ ok: false, fehler: "technik", sagen: "Da hakt gerade etwas bei uns. Ich nehme Ihren Wunsch auf und wir rufen Sie zurück." }, 200);
    }
  };

  app.post("/api/stimme/info", geschuetzt(async (c, b) => {
    const bt = betriebVon(c, b.betrieb);
    const h = heuteVon();
    return c.json({ ok: true, heute: h, heute_text: tagLang(h), betrieb: { id: bt.id, name: bt.name, art: bt.art, adresse: bt.adresse, oeffnungszeiten: bt.zeitenText, gebiet: bt.gebiet || null,
      terminarten: bt.termine.map((t: any) => ({ id: t.id, name: t.name, beschreibung: t.kurz, ort: t.ort === "kunde" ? "beim Kunden vor Ort" : t.ort === "telefon" ? "telefonisch" : "im Betrieb" })) },
      kalender: !!kalenderFuer(c, bt.id) });
  }));

  app.post("/api/stimme/zeiten", geschuetzt(async (c, b) => {
    const bt = betriebVon(c, b.betrieb);
    const t = terminArt(bt, b.termin);
    if (!t) return c.json({ ok: false, fehler: "terminart", terminarten: bt.termine.map((x: any) => x.id), sagen: "Worum geht es denn genau?" });
    const kal = kalenderFuer(c, bt.id);
    const h = heuteVon();
    const belegt = kal ? await kal.belegt(zeitpunkt(plusTage(h, -1), 0), zeitpunkt(plusTage(h, 30), 0)) : [];
    const v = vorschlaege(bt, t.id, { wunsch: kurz(b.wunsch, 120), datum: b.datum, belegt });
    return c.json({ ok: true, termin: t.name, ...v, sagen: sagenZeiten(v.tage, v.gewuenscht?.datum || (istDatum(b.datum) ? b.datum : null)) });
  }));

  app.post("/api/stimme/buchen", geschuetzt(async (c, b) => {
    const bt = betriebVon(c, b.betrieb);
    const zeit = /^\d{1,2}$/.test(String(b.zeit || "").trim()) ? `${b.zeit}:00` : String(b.zeit || "").trim().replace(".", ":");
    const p = pruefeBuchung({ betrieb: bt.id, termin: b.termin, datum: b.datum, zeit: /^\d:/.test(zeit) ? "0" + zeit : zeit, name: b.name, telefon: b.telefon, email: b.email,
      adresse: { strasse: b.strasse, plz: b.plz, ort: b.ort }, details: b.anliegen, notiz: kurz(b.notiz, 300) || "Am Telefon gebucht (Sprach-KI)", einwilligung: b.einwilligung === true || b.einwilligung === "true" });
    if (!p.ok) return c.json({ ok: false, fehler: p.fehler, sagen: p.fehler.replace("Bitte der Speicherung für den Termin zustimmen.", "Darf ich Ihren Namen und Ihre Nummer für den Termin speichern?").replace(/eintragen/g, "nennen") });
    const d = p.d;
    const ev = eintrag(d, "Telefon-Bot");
    const kal = kalenderFuer(c, bt.id);
    let id = "", token = "";
    if (kal) {
      const belegt = await kal.belegt(d.z.blockVon - 86_400_000, d.z.blockBis + 86_400_000);
      const frei = freieZeiten(d.betrieb, d.t.id, { von: d.datum, tage: 1, belegt })[0];
      if (!frei || !frei.slots.includes(d.z.zeit)) {
        const v = vorschlaege(bt, d.t.id, { datum: d.datum, belegt });
        return c.json({ ok: false, belegt: true, ...v, sagen: "Die Zeit ist leider gerade vergeben. " + sagenZeiten(v.tage, null) });
      }
      id = await kal.eintragen(ev);
      token = await absageToken({ b: bt.id, e: id, s: d.z.start, t: d.t.id, n: d.name.slice(0, 40), m: d.email || undefined });
    }
    const mail = mailAktiv(c) ? await verschicke(c, terminMails(c, d, { id, token, ort: ev.ort })) : null;
    console.log(`[stimme] gebucht ${bt.id}/${d.t.id} ${d.datum} ${d.z.zeit}${kal ? "" : " (ohne Kalender, nur Mail)"}`);
    const wann = wannText(d.t, d.z);
    return c.json({ ok: true, kalender: !!kal, wann, mail_an_kunde: !!mail?.kunde,
      sagen: `Ihr Termin steht: ${d.t.name} am ${wann}.${mail?.kunde ? " Die Bestätigung kommt gleich per E-Mail." : ""}` });
  }));

  app.post("/api/stimme/rueckruf", geschuetzt(async (c, b) => {
    const bt = betriebVon(c, b.betrieb);
    const name = kurz(b.name, 80), telefon = kurz(b.telefon, 40), anliegen = kurz(b.anliegen, 600);
    if (!telefon || telefon.replace(/\D/g, "").length < 6) return c.json({ ok: false, fehler: "telefon", sagen: "Unter welcher Nummer erreichen wir Sie am besten?" });
    const an = [wert(c, "ANRUF_MAIL_BETRIEB_" + bt.id.toUpperCase()), wert(c, "ANRUF_MAIL_BETRIEB"), wert(c, "TERMIN_MAIL_BETRIEB_" + bt.id.toUpperCase()), wert(c, "TERMIN_MAIL_BETRIEB")].find((x) => x && gueltigeMail(x));
    const dringend = b.dringend === true || b.dringend === "true";
    const zeilen = [`Name: ${name || "nicht genannt"}`, `Telefon: ${telefon}`, `Anliegen: ${anliegen || "nicht genannt"}`, b.wann ? `Erreichbar: ${kurz(b.wann, 120)}` : ""].filter(Boolean);
    const ok = an ? await sendeMail(c, { an, absenderName: "Telefon-Bot", betreff: `${dringend ? "DRINGEND: " : ""}Rückruf erbeten: ${name || telefon}`,
      text: ["Am Telefon hat jemand um Rückruf gebeten (aufgenommen von der Sprach-KI):", "", ...zeilen].join("\n"),
      html: `<p>Am Telefon hat jemand um Rückruf gebeten (aufgenommen von der Sprach-KI):</p><p>${zeilen.map((z) => z.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!))).join("<br>")}</p>` }) : false;
    console.log(`[stimme] Rückruf ${bt.id}${ok ? "" : " (Mail nicht verschickt)"}`);
    return c.json({ ok: true, mail: ok, sagen: `Danke${name ? ", " + name : ""}. Wir rufen Sie ${dringend ? "so schnell wie möglich" : "zeitnah"} zurück.` });
  }));
}
