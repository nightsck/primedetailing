// Vertriebs-CRM: Web-Adressen, Anmeldung, Mails und der Zeitplan des Akquise-Bots.
//
//   /crm                     Oberfläche (nur nach Anmeldung nutzbar)
//   /api/crm/...             Schnittstelle der Oberfläche (Sitzungs-Cookie + Header x-crm)
//   /crm/abmeldung?t=...     öffentlicher Abmeldelink aus Info-Mails (setzt die Sperre)
//   geplant()                alle 10 Minuten (Cron in wrangler.toml)
//
// Anmeldung ohne Passwort: Link per Mail an eine erlaubte Adresse (CRM_LOGIN,
// Standard kifuermeinenbetrieb@gmail.com), 20 Minuten gültig, nur einmal nutzbar.
// Daten liegen im Durable Object CRM (SQLite), getrennt von allen Kunden-Bots.
import type { Hono } from "hono";
import { sendeMail, gueltigeMail } from "../mail.ts";
import { STATUS_TEXT, tagAus, type CrmKern } from "./kern.ts";
import { BRANCHEN, sucheFirmen, websiteLesen, kiBewertung, regelBewertung, bwKacheln, vierteln, sucheKachel, OVERPASS, type Kachel } from "./bot.ts";
import { CRM_SEITE, ANMELDE_SEITE, ABMELDE_SEITE } from "./seite.ts";

type Kern = { [K in keyof CrmKern]: (...a: Parameters<CrmKern[K]>) => Promise<ReturnType<CrmKern[K]>> };
const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();
const enc = new TextEncoder();
const STANDARD_URL = "https://primedetailing-chat.tom-schindler999.workers.dev";

/** Zugriff auf die Datenbank: in Tests direkt, auf Workers über das Durable Object. */
export function crm(c: any): Kern {
  const direkt = c?.env?.CRM_KERN;
  if (direkt) return new Proxy({}, { get: (_, n: string) => async (...a: unknown[]) => direkt[n](...a) }) as Kern;
  const ns = c.env.CRM;
  const stub = ns.get(ns.idFromName("crm"));
  return new Proxy({}, { get: (_, n: string) => (...a: unknown[]) => stub.op(n, a) }) as Kern;
}

/* ---------- kleine Helfer ---------- */
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const zufall = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
const geheim = (c: any) => wert(c, "SESSION_SECRET") || "abgeleitet|" + wert(c, "ANTHROPIC_API_KEY") || "crm";
async function signiere(c: any, text: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode("crm|" + geheim(c)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(text))).slice(0, 32);
}
export const abmeldeToken = async (c: any, firmaId: number) => `${firmaId}.${await signiere(c, "abmelden|" + firmaId)}`;
async function liesAbmeldeToken(c: any, t: unknown): Promise<number | null> {
  const m = String(t ?? "").match(/^(\d{1,9})\.([0-9a-f]{32})$/);
  if (!m) return null;
  return (await signiere(c, "abmelden|" + m[1])) === m[2] ? Number(m[1]) : null;
}
const erlaubteLogins = (c: any) => (wert(c, "CRM_LOGIN") || "kifuermeinenbetrieb@gmail.com").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
function nameVon(c: any, email: string) {
  for (const p of wert(c, "CRM_NAMEN").split(",")) { const [m, n] = p.split("="); if (m?.trim().toLowerCase() === email && n?.trim()) return n.trim().slice(0, 40); }
  return "Team";
}
const keks = (c: any, name: string) => (c.req.header("cookie") || "").split(";").map((s: string) => s.trim().split("=")).find(([k]: string[]) => k === name)?.[1] || "";
const basis = (c: any) => wert(c, "CRM_URL") || (c.req ? new URL(c.req.url).origin : STANDARD_URL);
const escH = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const eur = (ct: number) => (ct / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const rahmen = (kopf: string, inhalt: string) => `<!doctype html><html lang="de"><body style="margin:0;background:#F4F2EE;font-family:Arial,Helvetica,sans-serif;color:#1B1D1F">
<div style="max-width:640px;margin:0 auto;padding:24px 16px"><div style="background:#FFFFFF;border:1px solid #D9D5CE;border-radius:4px">
<div style="padding:16px 20px;border-bottom:3px solid #F2C200;font-size:17px;font-weight:bold">${escH(kopf)}</div>
<div style="padding:20px;font-size:15px;line-height:1.5">${inhalt}</div></div></div></body></html>`;

/* ---------- Anmeldung ---------- */
const SITZUNG_TAGE = 30;
async function angemeldet(c: any): Promise<{ email: string; name: string } | null> {
  const s = keks(c, "crm_s");
  if (!/^[0-9a-f]{64}$/.test(s)) return null;
  const email = await crm(c).sitzung(await sha(s));
  return email ? { email, name: nameVon(c, email) } : null;
}
type Handler = (c: any, nutzer: { email: string; name: string }) => Promise<Response> | Response;
function geschuetzt(h: Handler) {
  return async (c: any) => {
    const m = c.req.method;
    if (m !== "GET" && c.req.header("x-crm") !== "1") return c.json({ ok: false, fehler: "Ungültige Anfrage." }, 403);
    const n = await angemeldet(c);
    if (!n) return c.json({ ok: false, fehler: "Bitte anmelden.", anmelden: true }, 401);
    try { return await h(c, n); }
    catch (e: any) { return c.json({ ok: false, fehler: String(e?.message || e).slice(0, 300) }, 400); }
  };
}
const json = async (c: any) => { try { return await c.req.json(); } catch { return {}; } };
const id = (c: any) => { const n = Number(c.req.param("id")); if (!Number.isInteger(n) || n < 1) throw new Error("Ungültige ID."); return n; };

/* ---------- Mails ---------- */
export async function infomailSenden(c: any, firmaId: number, durch: string): Promise<{ ok: boolean; fehler?: string }> {
  const absender = wert(c, "VERTRIEB_ABSENDER");
  if (!absender) return { ok: false, fehler: "Kein Absender eingerichtet (Variable VERTRIEB_ABSENDER in Cloudflare)." };
  const k = crm(c);
  const p = await k.infomailErlaubt(firmaId);
  if (!p.ok) return { ok: false, fehler: p.grund };
  const e = await k.einstellungen();
  const f = p.firma;
  const text = e.infomail_text.replaceAll("{firma}", f.name).replaceAll("{ansprechpartner}", f.ansprechpartner || "").replace(/Guten Tag ,/g, "Guten Tag,");
  const link = `${basis(c)}/crm/abmeldung?t=${await abmeldeToken(c, firmaId)}`;
  const fuss = `${e.impressum ? "\n\n--\n" + e.impressum : ""}\n\nSie möchten keine Nachrichten mehr von uns? Abmelden: ${link}`;
  const html = rahmen(e.infomail_betreff, `${escH(text).replace(/\n/g, "<br>")}${e.impressum ? `<hr style="border:0;border-top:1px solid #D9D5CE;margin:20px 0"><p style="font-size:13px;color:#6B6F73;margin:0">${escH(e.impressum).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="font-size:13px;color:#6B6F73;margin:16px 0 0">Sie möchten keine Nachrichten mehr von uns? <a href="${escH(link)}" style="color:#6B6F73">Hier abmelden</a></p>`);
  const ok = await sendeMail({ env: { ...(c.env || {}), MAIL_ABSENDER: absender } }, { an: f.an, anName: f.ansprechpartner || undefined, absenderName: wert(c, "VERTRIEB_NAME") || "KI für meinen Betrieb", betreff: e.infomail_betreff, text: text + fuss, html });
  if (!ok) return { ok: false, fehler: "Mail konnte nicht verschickt werden." };
  await k.infomailVermerken(firmaId, durch, e.infomail_betreff);
  return { ok: true };
}

function impulseMail(url: string, i: { neu: any[]; faellig: any[] }, stand: string[] = [], art = "morgen", leer = false) {
  const zeile = (f: any, extra: string) => `<tr><td style="padding:10px 0;border-top:1px solid #E5E1DA;vertical-align:top">
    <a href="${escH(url)}/crm#/firma/${f.id}" style="color:#1B1D1F;font-weight:bold">${escH(f.name)}</a> <span style="color:#6B6F73">${escH([f.branche, f.ort].filter(Boolean).join(", "))}</span><br>
    ${f.telefon ? `<a href="tel:${escH(String(f.telefon).replace(/[^\d+]/g, ""))}" style="color:#1B1D1F">${escH(f.telefon)}</a>` : "keine Nummer"}${f.score != null ? ` · <b>${f.score}</b> Punkte` : ""}${extra}</td></tr>`;
  const neu = i.neu.map((f) => zeile(f, `${f.score_grund ? `<br><span style="color:#4A4E52">Warum: ${escH(f.score_grund)}</span>` : ""}${f.einstieg ? `<br><span style="color:#4A4E52">Einstieg: „${escH(f.einstieg)}“</span>` : ""}`)).join("");
  const fl = i.faellig.map((f) => zeile(f, ` · Wiedervorlage ${escH(f.wiedervorlage)} (${escH(STATUS_TEXT[f.status] || f.status)})`)).join("");
  return rahmen(art === "nachtrag" ? `Nachtrag: ${i.neu.length} neue Anruf-Impulse` : leer ? "Heute noch keine Anruf-Impulse" : `Heute anrufen: ${i.neu.length} neue, ${i.faellig.length} Wiedervorlagen`,
    `${leer ? `<p style="margin:0 0 12px">Heute gibt es noch niemanden anzurufen. Neue Impulse kommen als Nachtrag ab 14 Uhr.</p>` : ""}${i.neu.length ? `<p style="margin:0 0 4px;font-weight:bold">Neue Anruf-Impulse</p><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${neu}</table>` : ""}
     ${i.faellig.length ? `<p style="margin:20px 0 4px;font-weight:bold">Wiedervorlagen</p><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${fl}</table>` : ""}
     <p style="margin:20px 0 0"><a href="${escH(url)}/crm#/heute" style="display:inline-block;background:#1B1D1F;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:4px">CRM öffnen</a></p>
     ${stand.length ? `<p style="margin:20px 0 0;padding-top:12px;border-top:1px solid #E5E1DA;color:#4A4E52;font-size:14px">${stand.map(escH).join("<br>")}</p>` : ""}
     <p style="margin:12px 0 0;color:#6B6F73;font-size:13px">Nach jedem Telefonat im CRM „Anruf erfassen“. Werbe-Mails nur nach Einwilligung.</p>`);
}

/** Website lesen und bewerten (KI, sonst Regeln); speichert das Ergebnis in der Kundenakte. */
export async function bewerteFirma(c: any, firma: any, f: typeof fetch = fetch) {
  const schluessel = wert(c, "CRM_ANTHROPIC_API_KEY") || wert(c, "ANTHROPIC_API_KEY"), modell = wert(c, "CRM_MODELL") || "claude-haiku-5-5";
  const w = await websiteLesen(f, firma.website);
  let b = null, grund = "";
  if (!schluessel) grund = "kein KI-Schlüssel (ANTHROPIC_API_KEY) gefunden";
  else if (!w) grund = firma.website ? "Website nicht erreichbar" : "keine Website";
  else { try { b = await kiBewertung(f, schluessel, modell, firma, w); } catch (err: any) { grund = String(err?.message || err).slice(0, 300); console.error("[crm-ki]", grund); } }
  if (!b) { b = regelBewertung(firma, w); b.infos.ki_fehler = grund; }
  return crm(c).bewertungSpeichern(firma.id, b);
}

/* ---------- Zeitplan (alle 10 Minuten) ---------- */
// Stunde in deutscher Zeit als Zahl (formatToParts, weil "de-DE" sonst "06 Uhr" liefert)
const stundeBerlin = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).find((p) => p.type === "hour")?.value ?? 0);
const wochentagBerlin = (ms: number) => new Date(tagAus(ms) + "T12:00:00Z").getUTCDay();

export async function geplant(env: any, jetzt = Date.now(), f: typeof fetch = fetch) {
  const c = { env };
  if (wert(c, "KILL_SWITCH") === "1") return { pausiert: true };
  const k = crm(c);
  const e = await k.einstellungen();
  const heute = tagAus(jetzt), stunde = stundeBerlin(jetzt), wt = wochentagBerlin(jetzt);
  const url = wert(c, "CRM_URL") || STANDARD_URL;
  const bericht: Record<string, unknown> = {};

  // 1) Monatsposten, Erinnerungen, Aufräumen: einmal am Tag ab 7 Uhr
  if (stunde >= 7 && (await k.zustand("tag_erledigt")) !== heute) {
    await k.zustand("tag_erledigt", heute);
    bericht.monatsposten = await k.monatsposten(heute);
    const ueber = await k.ueberfaelligMelden(heute);
    if (ueber.length && gueltigeMail(e.impulse_an)) {
      await sendeMail(c, { an: e.impulse_an, absenderName: "KI-Vertrieb", betreff: `Zahlung überfällig: ${ueber.length} ${ueber.length === 1 ? "Posten" : "Posten"}`,
        text: ueber.map((z: any) => `${z.firma}: ${eur(z.betrag_ct)} (${z.art} ${z.leistungsmonat}), fällig seit ${z.faellig}`).join("\n") + `\n\n${url}/crm#/zahlungen`,
        html: rahmen("Zahlungen mehr als 7 Tage überfällig", `<ul style="padding-left:18px;margin:0">${ueber.map((z: any) => `<li>${escH(z.firma)}: <b>${eur(z.betrag_ct)}</b> (${escH(z.art)} ${escH(z.leistungsmonat)}), fällig seit ${escH(z.faellig)}</li>`).join("")}</ul>
          <p style="margin:16px 0 0"><a href="${url}/crm#/zahlungen" style="color:#1B1D1F">Offene Zahlungen ansehen</a></p>`) });
    }
    bericht.geloescht = await k.aufraeumen(jetzt);
  }
  if (!e.bot_aktiv) return { ...bericht, bot: "aus" };

  // 2) Neue Firmen suchen (W1)
  bericht.suche = await suchen(c, e, jetzt, heute, stunde, f);
  if (!bericht.suche) delete bericht.suche;

  // 3) Bewerten: bei jedem Durchlauf bis zu drei Firmen (W1 Website lesen + W2 Bewertung), mit Tagesgrenze
  const ki = (await k.zustand("ki_zaehler")) || {};
  let heuteBewertet = ki.tag === heute ? Number(ki.n) || 0 : 0;
  const frei = Math.max(0, Math.min(3, e.ki_pro_tag - heuteBewertet));
  if (frei > 0) {
    let bewertet = 0;
    for (const firma of await k.zuBewerten(frei)) { await bewerteFirma(c, firma, f); bewertet++; }
    if (bewertet) { heuteBewertet += bewertet; await k.zustand("ki_zaehler", { tag: heute, n: heuteBewertet }); bericht.bewertet = bewertet; }
  } else bericht.bewertet = "Tagesgrenze erreicht";

  // 4) Anruf-Impulse per Mail, werktags (W3): ab 8 Uhr immer (mit Bot-Stand), ab 14 Uhr Nachtrag, wenn neue dazugekommen sind
  if (wt >= 1 && wt <= 5) {
    if (stunde >= 8 && (await k.zustand("impulse_tag")) !== heute) {
      await k.zustand("impulse_tag", heute);
      bericht.impulse = await impulseSenden(c, e, "morgen", jetzt, heute);
    } else if (stunde >= 14 && (await k.zustand("impulse_nachtrag")) !== heute) {
      await k.zustand("impulse_nachtrag", heute);
      bericht.impulse = await impulseSenden(c, e, "nachtrag", jetzt, heute);
    }
  }
  return bericht;
}

/** Eine Suche, wenn gerade sinnvoll. Gibt einen kurzen Bericht zurück oder null. */
async function suchen(c: any, e: any, jetzt: number, heute: string, stunde: number, f: typeof fetch) {
  const k = crm(c);
  if (stunde < 6 || stunde >= 22) return null;
  // Nach einem Fehlschlag (OpenStreetMap überlastet) 30 Minuten Pause
  if (jetzt - (Number(await k.zustand("suche_fehlversuch")) || 0) < 30 * 60_000) return null;
  const startServer = Math.floor(jetzt / 600_000) % OVERPASS.length;

  if (e.suchmodus === "bw") {
    // Nur nachlegen, wenn nicht schon genug Firmen auf ihre Bewertung warten
    if ((await k.wartend()) >= 60) return null;
    const extra: Kachel[] = (await k.zustand("bw_extra")) || [];
    const fs = (await k.zustand("bw_fortschritt")) || { zeiger: 0, gesamt: 0, runde: 1 };
    const alle = bwKacheln();
    let kachel: Kachel | undefined = extra[0];
    let ausExtra = !!kachel;
    if (!kachel) {
      if (fs.zeiger >= alle.length) {
        // Einmal durch: nach 30 Tagen von vorn (neue Firmen, geänderte Daten)
        if (fs.fertig && jetzt - fs.fertig < 30 * 86_400_000) return null;
        fs.zeiger = 0; fs.runde = (fs.runde || 1) + 1; delete fs.fertig;
      }
      kachel = alle[fs.zeiger];
    }
    try {
      const { treffer, voll } = await sucheKachel(f, kachel, 200, startServer);
      const r = await k.firmenUebernehmen(treffer);
      if (ausExtra) extra.shift(); else fs.zeiger++;
      if (voll) extra.unshift(...vierteln(kachel));
      if (fs.zeiger >= alle.length && !extra.length) fs.fertig = jetzt;
      await k.zustand("bw_extra", extra.slice(0, 200));
      await k.zustand("bw_fortschritt", { ...fs, gesamt: alle.length, offen_extra: extra.length });
      const b = { tag: heute, modus: "bw", kachel, treffer: treffer.length, ...r, voll };
      await k.zustand("letzte_suche", b);
      return b;
    } catch (err: any) {
      await k.zustand("suche_fehlversuch", jetzt);
      const b = { tag: heute, modus: "bw", kachel, fehler: String(err?.message || err).slice(0, 300) };
      await k.zustand("letzte_suche", b);
      return b;
    }
  }

  // Modus "branchen": einmal am Tag die nächste Kombination aus Branche und Region
  if ((await k.zustand("suche_tag")) === heute) return null;
  const s = await k.naechsteSuche();
  if (!s) { await k.zustand("suche_tag", heute); return null; }
  try {
    const treffer = await sucheFirmen(f, s.branche, s.region, Math.max(5, e.neue_pro_lauf));
    const r = await k.firmenUebernehmen(treffer);
    await k.zustand("suche_tag", heute);
    const b = { tag: heute, modus: "branchen", ...s, treffer: treffer.length, ...r };
    await k.zustand("letzte_suche", b);
    return b;
  } catch (err: any) {
    await k.zustand("suche_fehlversuch", jetzt);
    const b = { tag: heute, modus: "branchen", ...s, fehler: String(err?.message || err).slice(0, 300) };
    await k.zustand("letzte_suche", b);
    return b;
  }
}

/** Mail mit Anruf-Impulsen. "morgen" geht immer raus (mit Bot-Stand), "nachtrag" nur bei neuen Impulsen. */
export async function impulseSenden(c: any, e: any, art: "morgen" | "nachtrag" | "jetzt", jetzt = Date.now(), heute = tagAus(jetzt)) {
  if (!gueltigeMail(e.impulse_an)) return { mail: false, grund: "keine gültige Empfänger-Adresse" };
  const k = crm(c);
  const i = await k.impulseFuerHeute(heute);
  if (art === "nachtrag") i.faellig = [];
  if (art === "nachtrag" && !i.neu.length) return { neu: 0, mail: false };
  const stat = await k.botStatistik(jetzt - 86_400_000);
  const url = wert(c, "CRM_URL") || STANDARD_URL;
  const letzte = await k.zustand("letzte_suche");
  const fs = await k.zustand("bw_fortschritt");
  const standText = [
    `Letzte 24 Stunden: ${stat.gefunden} Firmen gefunden, ${stat.bewertet} bewertet, ${stat.impulse} davon Anruf-Impulse. ${stat.wartend} warten auf Bewertung, ${stat.firmen} Firmen im CRM.`,
    fs?.gesamt ? `Baden-Württemberg: ${Math.min(fs.zeiger, fs.gesamt)} von ${fs.gesamt} Gebieten abgesucht${fs.runde > 1 ? ` (Runde ${fs.runde})` : ""}.` : "",
    letzte?.fehler ? `Letzte Suche fehlgeschlagen (OpenStreetMap): ${letzte.fehler}. Der Bot versucht es alle 30 Minuten wieder.` : "",
  ].filter(Boolean);
  const leer = !i.neu.length && !i.faellig.length;
  const betreff = art === "nachtrag" ? `Nachtrag: ${i.neu.length} neue Anruf-Impulse`
    : leer ? "Vertriebs-Bot: heute noch keine Anruf-Impulse" : `Heute anrufen: ${i.neu.length} neue, ${i.faellig.length} Wiedervorlagen`;
  const ok = await sendeMail(c, {
    an: e.impulse_an, absenderName: "KI-Vertrieb", betreff,
    text: [...i.neu.map((x: any) => `${x.name} (${x.score} Punkte) ${x.telefon || ""}: ${x.score_grund || ""}`), ...i.faellig.map((x: any) => `Wiedervorlage: ${x.name} ${x.telefon || ""}`),
      ...(leer ? ["Heute gibt es noch niemanden anzurufen. Neue Impulse kommen als Nachtrag ab 14 Uhr."] : []), "", ...standText, "", `${url}/crm#/heute`].join("\n"),
    html: impulseMail(url, i, standText, art, leer),
  });
  return { neu: i.neu.length, faellig: i.faellig.length, mail: ok };
}

/* ---------- Web-Adressen ---------- */
export function crmRouten(app: Hono) {
  const html = (c: any, s: string, status = 200) => c.body(s, status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" });
  app.get("/crm", (c) => html(c, CRM_SEITE));
  app.get("/crm/", (c) => html(c, CRM_SEITE));
  app.get("/crm/anmelden", (c) => html(c, ANMELDE_SEITE));
  app.get("/crm/abmeldung", (c) => html(c, ABMELDE_SEITE));

  // Anmelde-Link anfordern: Antwort immer gleich, damit niemand Adressen ausprobieren kann
  app.post("/api/crm/login", async (c) => {
    const b: any = await json(c);
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    const k = crm(c);
    if (erlaubteLogins(c).includes(email) && (await k.zaehle("login", 5, 3_600_000))) {
      const t = zufall();
      await k.loginMerken(await sha(t), email, Date.now() + 20 * 60_000);
      const link = `${basis(c)}/crm/anmelden#${t}`;
      await sendeMail(c, { an: email, absenderName: "KI-Vertrieb", betreff: "Ihr Anmelde-Link für das Vertriebs-CRM",
        text: `Hier anmelden (20 Minuten gültig, nur einmal nutzbar):\n${link}\n\nSie haben das nicht angefordert? Dann ignorieren Sie diese Mail.`,
        html: rahmen("Anmelden im Vertriebs-CRM", `<p style="margin:0 0 16px">Der Link ist 20 Minuten gültig und nur einmal nutzbar.</p>
          <p style="margin:0 0 16px"><a href="${escH(link)}" style="display:inline-block;background:#1B1D1F;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:4px">Jetzt anmelden</a></p>
          <p style="margin:0;color:#6B6F73;font-size:13px">Sie haben das nicht angefordert? Dann ignorieren Sie diese Mail.</p>`) });
    }
    return c.json({ ok: true });
  });
  // Link einlösen (der Token steht hinter # in der Adresse und kommt nur per POST an)
  app.post("/api/crm/anmelden", async (c) => {
    const b: any = await json(c);
    const t = String(b.t || "");
    if (!/^[0-9a-f]{64}$/.test(t)) return c.json({ ok: false, fehler: "Der Link ist ungültig." }, 400);
    const k = crm(c);
    const email = await k.loginEinloesen(await sha(t));
    if (!email) return c.json({ ok: false, fehler: "Der Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen anfordern." }, 400);
    const s = zufall();
    await k.sitzungAnlegen(await sha(s), email, Date.now() + SITZUNG_TAGE * 86_400_000);
    return c.json({ ok: true }, 200, { "Set-Cookie": `crm_s=${s}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SITZUNG_TAGE * 86400}` });
  });
  app.post("/api/crm/abmelden", async (c) => {
    const s = keks(c, "crm_s");
    if (/^[0-9a-f]{64}$/.test(s)) await crm(c).sitzungLoeschen(await sha(s));
    return c.json({ ok: true }, 200, { "Set-Cookie": "crm_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  });
  // Öffentlich: Abmeldung aus einer Info-Mail → Sperre
  app.post("/api/crm/abmeldung", async (c) => {
    const b: any = await json(c);
    const fid = await liesAbmeldeToken(c, b.t);
    if (!fid) return c.json({ ok: false, fehler: "Der Link ist ungültig." }, 400);
    const k = crm(c);
    const f = await k.firma(fid);
    if (f && !f.gesperrt) await k.sperren(fid, "Abmeldung über den Link in der Mail", "Abmeldelink");
    return c.json({ ok: true });
  });

  // ----- geschützt -----
  app.get("/api/crm/ich", geschuetzt(async (c, n) => c.json({ ok: true, ...n, absender: !!wert(c, "VERTRIEB_ABSENDER"), branchen: Object.fromEntries(Object.entries(BRANCHEN).map(([k, v]) => [k, v.name])), status: STATUS_TEXT })));
  app.get("/api/crm/start", geschuetzt(async (c) => c.json({ ok: true, ...(await crm(c).start()) })));
  app.get("/api/crm/heute", geschuetzt(async (c) => c.json({ ok: true, liste: await crm(c).heuteAnrufen() })));
  app.get("/api/crm/pipeline", geschuetzt(async (c) => c.json({ ok: true, ...(await crm(c).pipeline()) })));
  app.get("/api/crm/firmen", geschuetzt(async (c) => c.json({ ok: true, liste: await crm(c).firmen({ q: c.req.query("q") || "", status: c.req.query("status") || "" }) })));
  app.post("/api/crm/firmen", geschuetzt(async (c, n) => { const r = await crm(c).firmaAnlegen(await json(c), n.name); return c.json({ ok: true, ...r }); }));
  app.get("/api/crm/firma/:id", geschuetzt(async (c) => { const f = await crm(c).firma(id(c)); return f ? c.json({ ok: true, firma: f }) : c.json({ ok: false, fehler: "Nicht gefunden." }, 404); }));
  app.put("/api/crm/firma/:id", geschuetzt(async (c) => c.json({ ok: true, firma: await crm(c).firmaAendern(id(c), await json(c)) })));
  app.delete("/api/crm/firma/:id", geschuetzt(async (c) => { await crm(c).firmaLoeschen(id(c)); return c.json({ ok: true }); }));
  app.post("/api/crm/firma/:id/ansprechpartner", geschuetzt(async (c) => c.json({ ok: true, id: await crm(c).ansprechpartner(id(c), await json(c)) })));
  app.delete("/api/crm/ansprechpartner/:id", geschuetzt(async (c) => { await crm(c).ansprechpartnerLoeschen(id(c)); return c.json({ ok: true }); }));
  app.post("/api/crm/firma/:id/kontakt", geschuetzt(async (c, n) => { const b: any = await json(c); return c.json({ ok: true, id: await crm(c).kontakt(id(c), { ...b, durch: n.name, zeitpunkt: Date.now() }) }); }));
  app.post("/api/crm/firma/:id/anruf", geschuetzt(async (c, n) => c.json({ ok: true, ...(await crm(c).anrufErfassen(id(c), await json(c), n.name)) })));
  app.post("/api/crm/firma/:id/sperren", geschuetzt(async (c, n) => { const b: any = await json(c); await crm(c).sperren(id(c), b.grund || "Manuell gesperrt", n.name); return c.json({ ok: true }); }));
  app.post("/api/crm/firma/:id/entsperren", geschuetzt(async (c, n) => { await crm(c).entsperren(id(c), n.name); return c.json({ ok: true }); }));
  app.post("/api/crm/firma/:id/einwilligung", geschuetzt(async (c, n) => { const b: any = await json(c); if (b.ja && !String(b.nachweis || "").trim()) throw new Error("Bitte festhalten, wann und wie die Einwilligung erteilt wurde."); await crm(c).einwilligungSetzen(id(c), !!b.ja, String(b.nachweis || ""), n.name); return c.json({ ok: true }); }));
  app.post("/api/crm/firma/:id/bewerten", geschuetzt(async (c) => {
    const k = crm(c), f = await k.firma(id(c));
    if (!f) throw new Error("Firma nicht gefunden.");
    if (await k.zaehle("bewerten", 60, 3_600_000) === false) throw new Error("Bitte etwas später noch einmal.");
    return c.json({ ok: true, ...(await bewerteFirma(c, f)) });
  }));
  app.post("/api/crm/firma/:id/infomail", geschuetzt(async (c, n) => { const r = await infomailSenden(c, id(c), n.name); return c.json(r, r.ok ? 200 : 400); }));
  app.post("/api/crm/firma/:id/dokument", geschuetzt(async (c) => {
    const groesse = Number(c.req.header("content-length") || 0);
    if (groesse > 10_000_000) throw new Error("Die Datei ist größer als 10 MB.");
    const daten = await c.req.arrayBuffer();
    if (!daten.byteLength) throw new Error("Die Datei ist leer.");
    if (daten.byteLength > 10_000_000) throw new Error("Die Datei ist größer als 10 MB.");
    const dec = (k: string) => { try { return decodeURIComponent(c.req.header(k) || ""); } catch { return ""; } };
    const did = zufall().slice(0, 32);
    await crm(c).dokumentAblegen({ id: did, firma_id: id(c), vertrag_id: Number(c.req.header("x-vertrag")) || null, titel: dec("x-titel"), typ: dec("x-typ"), name: dec("x-name"), mime: (c.req.header("content-type") || "").slice(0, 100), datum: dec("x-datum") }, daten);
    return c.json({ ok: true, id: did });
  }));
  app.get("/api/crm/dokument/:did", geschuetzt(async (c) => {
    const d = await crm(c).dokument(String(c.req.param("did")).slice(0, 64));
    if (!d) return c.json({ ok: false, fehler: "Nicht gefunden." }, 404);
    const name = String(d.meta.name).replace(/[^\w.\- äöüÄÖÜß]/g, "_");
    return c.body(d.daten, 200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "X-Content-Type-Options": "nosniff" });
  }));
  app.delete("/api/crm/dokument/:did", geschuetzt(async (c) => { await crm(c).dokumentLoeschen(String(c.req.param("did")).slice(0, 64)); return c.json({ ok: true }); }));
  app.get("/api/crm/produkte", geschuetzt(async (c) => c.json({ ok: true, liste: await crm(c).produkte() })));
  app.post("/api/crm/produkte", geschuetzt(async (c) => c.json({ ok: true, id: await crm(c).produktSpeichern(await json(c)) })));
  app.get("/api/crm/vertraege", geschuetzt(async (c) => { const l = c.req.query("laufend"); return c.json({ ok: true, liste: await crm(c).vertraege(l === undefined ? {} : { laufend: l === "1" }) }); }));
  app.post("/api/crm/firma/:id/vertrag", geschuetzt(async (c, n) => c.json({ ok: true, ...(await crm(c).vertragAnlegen(id(c), await json(c), n.name)) })));
  app.put("/api/crm/vertrag/:id", geschuetzt(async (c, n) => c.json({ ok: true, vertrag: await crm(c).vertragAendern(id(c), await json(c), n.name) })));
  app.get("/api/crm/zahlungen", geschuetzt(async (c) => c.json({ ok: true, liste: await crm(c).zahlungen({ offen: c.req.query("offen") === "1" }) })));
  app.post("/api/crm/zahlung/:id", geschuetzt(async (c) => { const b: any = await json(c); await crm(c).zahlungBezahlt(id(c), !!b.bezahlt, b.datum, b.rechnungsnummer); return c.json({ ok: true }); }));
  app.get("/api/crm/einstellungen", geschuetzt(async (c) => c.json({ ok: true, einstellungen: await crm(c).einstellungen() })));
  app.put("/api/crm/einstellungen", geschuetzt(async (c) => c.json({ ok: true, einstellungen: await crm(c).einstellungenSetzen(await json(c)) })));
  // Bot jetzt einmal laufen lassen (sonst alle 10 Minuten automatisch)
  app.post("/api/crm/bot/jetzt", geschuetzt(async (c) => {
    const b: any = await json(c);
    const k = crm(c);
    if (b.impulse) return c.json({ ok: true, bericht: await impulseSenden(c, await k.einstellungen(), "jetzt") });
    if (b.suche) { await k.zustand("suche_tag", ""); await k.zustand("suche_fehlversuch", 0); }
    return c.json({ ok: true, bericht: await geplant(c.env) });
  }));
}
