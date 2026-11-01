// Echter Bewerber-Chat auf primedetailing.eu/jobs/.
//
//   POST /api/jobs/frage          freie Frage eines Bewerbers → kurze Antwort der KI
//   POST /api/jobs/datei          eine Datei hochladen (Formularfeld "datei") → { id }
//   POST /api/jobs/absenden       { dateien: [id] } → Frist auf 6 Monate, Download-Links
//   GET  /api/jobs/datei/:id      Datei herunterladen (Link aus der Bewerbungs-Mail)
//
// Die Bewerbung selbst schickt der Browser per Web3Forms an support@ (wie das
// Kontaktformular). Die KI beantwortet nur Fragen, bewertet niemanden und sieht
// weder Angaben noch Unterlagen des Bewerbers. Stellen kommen aus dem
// Website-CMS (src/_data/jobs.yml → JOBS in daten.generated.ts).
import type { Hono } from "hono";
import { JOBS } from "./daten.generated.ts";
import { beantworteFrage, systemFuer, type Betrieb } from "./bewerber.ts";
import { pruefeLimit } from "./limits.ts";
import { ablageImSpeicher, type Ablage, type Meta } from "./ablage.ts";

export const MAX_DATEI = 10 * 1048576;
export const MAX_DATEIEN = 5;

type JobsDaten = { aktiv: boolean; name: string; gebiet: string; zeiten: string; bietet: string; ablauf: string; stellen: { id: string; name: string; umfang: string; text: string }[] } | null;

export function jobsBetrieb(j: JobsDaten = JOBS as JobsDaten): Betrieb | null {
  if (!j || !j.aktiv || !j.stellen.length) return null;
  return {
    name: j.name, art: "mobile Fahrzeugaufbereitung", zeiten: j.zeiten,
    adresse: `mobil, die Einsätze sind direkt beim Kunden in ${j.gebiet || "der Region"}`,
    bietet: j.bietet, ablauf: `${j.ablauf} Anschreiben und Lebenslauf sind freiwillig. Die Angaben werden nach 6 Monaten gelöscht oder früher auf Wunsch.`,
    stellen: Object.fromEntries(j.stellen.map((s) => [s.id, { name: s.name, umfang: s.umfang, text: s.text }])),
  };
}

/** Dateityp an den ersten Bytes erkennen (nicht am Namen). */
export function dateiTyp(kopf: Uint8Array, name: string): { typ: string; endung: string } | null {
  const ist = (o: number, ...b: number[]) => b.every((x, i) => kopf[o + i] === x);
  const txt = (o: number, n: number) => String.fromCharCode(...kopf.slice(o, o + n));
  if (ist(0, 0x25, 0x50, 0x44, 0x46)) return { typ: "application/pdf", endung: "pdf" };
  if (ist(0, 0xff, 0xd8, 0xff)) return { typ: "image/jpeg", endung: "jpg" };
  if (ist(0, 0x89, 0x50, 0x4e, 0x47)) return { typ: "image/png", endung: "png" };
  if (txt(4, 4) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(txt(8, 4))) return { typ: "image/heic", endung: "heic" };
  // Word (.docx) ist ein ZIP. Nur mit passender Endung, damit kein beliebiges ZIP durchgeht.
  if (ist(0, 0x50, 0x4b, 0x03, 0x04) && /\.docx$/i.test(name)) return { typ: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", endung: "docx" };
  return null;
}

/** Dateiname ohne Pfad und Sonderzeichen, mit passender Endung. */
export function sichererName(name: string, endung: string): string {
  const basis = String(name || "").split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "")
    .normalize("NFC").replace(/[\u0000-\u001f"<>|:*?]/g, "").replace(/\s+/g, " ").trim().slice(0, 70) || "Unterlage";
  return `${basis}.${endung}`;
}

const neueId = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
const ID = /^[a-f0-9]{64}$/;

let speicherAblage: Ablage | null = null;
function ablage(c: any): Ablage {
  const ns = c.env?.ABLAGE;
  if (ns?.idFromName) return ns.get(ns.idFromName("unterlagen")) as Ablage;
  return (speicherAblage ||= ablageImSpeicher()); // Node / Tests
}
/** Nur für Tests. */
export function _ablageZuruecksetzen() { speicherAblage = null; }

const T = {
  fehler: "Das Hochladen hat nicht geklappt. Versuch es bitte nochmal.",
  typ: "Das geht leider nicht. Bitte nur PDF, Word oder Fotos (JPG, PNG, HEIC).",
  gross: "Die Datei ist größer als 10 MB. Mach am besten ein Foto oder ein kleineres PDF.",
  aus: "Gerade nehmen wir keine Bewerbungen über die Website an.",
};

export function jobsRouten(app: Hono) {
  app.post("/api/jobs/frage", (c) => beantworteFrage(c, (b) => {
    const betrieb = jobsBetrieb();
    if (!betrieb) return null;
    return systemFuer(betrieb, betrieb.stellen[b.stelle] ? String(b.stelle) : "", false);
  }));

  app.post("/api/jobs/datei", async (c) => {
    if (!jobsBetrieb()) return c.json({ ok: false, text: T.aus }, 404);
    if (Number(c.req.header("content-length") || 0) > MAX_DATEI + 64_000) return c.json({ ok: false, text: T.gross }, 413);
    const sperre = await pruefeLimit(c, "datei");
    if (sperre) return c.json({ ok: false, text: "Gerade kamen zu viele Dateien. Versuch es in ein paar Minuten nochmal." }, 429);
    let datei: File | null = null;
    try { const f = (await c.req.formData()).get("datei"); if (f && typeof f !== "string") datei = f as File; } catch { /* kaputtes Formular */ }
    if (!datei || !datei.size) return c.json({ ok: false, text: T.fehler }, 400);
    if (datei.size > MAX_DATEI) return c.json({ ok: false, text: T.gross }, 413);
    const daten = await datei.arrayBuffer();
    const art = dateiTyp(new Uint8Array(daten.slice(0, 16)), datei.name);
    if (!art) return c.json({ ok: false, text: T.typ }, 415);
    const meta: Meta = { id: neueId(), name: sichererName(datei.name, art.endung), typ: art.typ, groesse: daten.byteLength };
    try { await ablage(c).ablegen(meta, daten); }
    catch (e: any) { console.error("[jobs-datei]", e?.message || e); return c.json({ ok: false, text: T.fehler }, 502); }
    return c.json({ ok: true, id: meta.id, name: meta.name, groesse: meta.groesse });
  });

  app.post("/api/jobs/absenden", async (c) => {
    if (Number(c.req.header("content-length") || 0) > 4_000) return c.json({ ok: false }, 413);
    const b: any = await c.req.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(b.dateien) ? b.dateien : []).map(String).filter((x: string) => ID.test(x)))].slice(0, MAX_DATEIEN) as string[];
    const sperre = await pruefeLimit(c, "anfrage");
    if (sperre) return c.json({ ok: false, text: sperre }, 429);
    let gefunden: Meta[] = [];
    try { if (ids.length) gefunden = await ablage(c).behalten(ids); }
    catch (e: any) { console.error("[jobs-absenden]", e?.message || e); return c.json({ ok: false }, 502); }
    const basis = new URL(c.req.url).origin;
    return c.json({ ok: true, dateien: gefunden.map((m) => ({ name: m.name, groesse: m.groesse, url: `${basis}/api/jobs/datei/${m.id}` })) });
  });

  app.get("/api/jobs/datei/:id", async (c) => {
    const id = c.req.param("id");
    const nichtDa = () => c.text("Diese Datei gibt es nicht mehr. Unterlagen werden 6 Monate nach der Bewerbung automatisch gelöscht.", 404, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    if (!ID.test(id)) return nichtDa();
    let d: Awaited<ReturnType<Ablage["holen"]>> = null;
    try { d = await ablage(c).holen(id); } catch (e: any) { console.error("[jobs-download]", e?.message || e); }
    if (!d) return nichtDa();
    const ascii = d.meta.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
    return c.body(d.daten, 200, {
      "Content-Type": d.meta.typ,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.meta.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
  });
}
