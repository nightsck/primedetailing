// Kunden-Zugang: Der Kunde ändert Kleinigkeiten selbst.
//
//   GET  /k/<kunde>/verwalten                 die Oberfläche (eine HTML-Seite, fürs Handy gebaut)
//   POST /k/<kunde>/verwalten/api/anmelden    Code per E-Mail anfordern
//   POST /k/<kunde>/verwalten/api/einloesen   Code eintippen → angemeldet
//   POST /k/<kunde>/verwalten/api/abmelden
//   GET  /k/<kunde>/verwalten/api/daten       die freigegebenen Felder
//   PUT  /k/<kunde>/verwalten/api/daten       speichern → sofort live (Preise erst nach Freigabe)
//
// Läuft hinter dem Türsteher aus kunden-routen.ts (Kunde geladen, in Betrieb).
// Eingeschaltet wird der Zugang pro Kunde im Admin-Panel (Stammdaten → Kunden-Zugang).
// Was geändert werden darf, steht in aenderung.ts; wie angemeldet wird, in anmeldung.ts.
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Kunde } from "../kunde/schema.ts";
import { pruefeKunde } from "../kunde/schema.ts";
import { speicherVon, type KundeEintrag } from "../speicher/schnittstelle.ts";
import { vergissKunde } from "../kunden-routen.ts";
import { pruefeLimit } from "../limits.ts";
import { sendeMail } from "../mail.ts";
import { erlaubteAdressen } from "../admin/anmeldung.ts";
import { eigeneHerkunft, seitenKoepfe, mitNonce, zufallsToken, sha } from "../sicherheit.ts";
import { VERWALTEN_HTML } from "../daten.generated.ts";
import { zugangAn, schickeKundenCode, loeseKundenCodeEin, kundeAngemeldet, abmeldeCookie } from "./anmeldung.ts";
import { sichtVon, wendeAn, inEntwurf } from "./aenderung.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
/** Fingerabdruck der freigegebenen Felder. Hat sich seit dem Laden etwas geändert, wird nicht blind überschrieben. */
export const standVon = async (live: Kunde) => (await sha(JSON.stringify(sichtVon(live)))).slice(0, 16);

/**
 * Macht `neuLive` zur Live-Fassung (mit Eintrag im Verlauf). Gab es daneben einen noch nicht
 * veröffentlichten Entwurf, bleibt er erhalten und bekommt nur die geänderten Felder dazu.
 */
export async function speichereLive(c: any, e: KundeEintrag, neuLive: Kunde, wer: string): Promise<void> {
  const sp = speicherVon(c);
  let entwurf: Kunde | null = null;
  if (e.offen) { const p = pruefeKunde(inEntwurf(e.entwurf, neuLive)); entwurf = p.ok ? p.kunde : e.entwurf; }
  await sp.kundeSpeichern(neuLive, wer);
  await sp.kundeVeroeffentlichen(e.id, wer);
  if (entwurf) await sp.kundeSpeichern(entwurf, e.geaendertVon || wer);
  vergissKunde(e.id);
}

/** Nach jeder Änderung: Mail an uns (mit allem, was geändert wurde) und zur Kontrolle an den Kunden. */
async function meldeAenderung(c: any, k: Kunde, wer: string, zeilen: string[], wartet: number) {
  const basis = new URL(c.req.url).origin, firma = k.stammdaten.firmenname;
  const liste = zeilen.map((z) => `- ${z}`).join("\n"), listeHtml = `<ul style="padding-left:18px">${zeilen.map((z) => `<li style="margin-bottom:4px">${esc(z)}</li>`).join("")}</ul>`;
  const rahmen = (inhalt: string) => `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1f2a37">${inhalt}</div>`;
  const admins = erlaubteAdressen(c);
  const preisText = wartet ? `\n\n${wartet} Preis(e) warten auf deine Freigabe: ${basis}/admin → Kunde „${k.id}“ → Übersicht.` : "";
  for (const an of admins) {
    await sendeMail(c, {
      an, absenderName: "Kunden-Bots", betreff: `${firma} hat etwas geändert${wartet ? ` – ${wartet} Preis(e) freigeben` : ""}`,
      text: `${wer} hat im Kunden-Zugang von ${firma} (${k.id}) geändert:\n\n${liste}\n\nDie Änderungen sind live.${preisText}\n\nNicht in Ordnung? Im Admin-Panel unter „Verlauf & Daten“ die Fassung davor zurückholen.`,
      html: rahmen(`<p><b>${esc(wer)}</b> hat im Kunden-Zugang von <b>${esc(firma)}</b> (${esc(k.id)}) geändert:</p>${listeHtml}<p>Die Änderungen sind live.${wartet ? ` <b>${wartet} Preis(e) warten auf deine Freigabe</b> (<a href="${basis}/admin">Admin-Panel</a> → Kunde → Übersicht).` : ""}</p><p style="color:#667;font-size:13px">Nicht in Ordnung? Im Admin-Panel unter „Verlauf &amp; Daten“ die Fassung davor zurückholen.</p>`),
    });
  }
  await sendeMail(c, {
    an: wer, absenderName: "ki-für-meinen-betrieb.de", antwortAn: admins[0], betreff: `Ihre Änderungen am Website-Assistenten sind gespeichert`,
    text: `Guten Tag,\n\nfolgende Änderungen für ${firma} wurden gerade gespeichert:\n\n${liste}\n\n${wartet ? "Neue Preise prüfen wir kurz und schalten sie dann frei. Bis dahin nennt der Assistent den bisherigen Preis.\n\n" : ""}Waren Sie das nicht? Dann antworten Sie bitte sofort auf diese Mail.`,
    html: rahmen(`<p>Guten Tag,</p><p>folgende Änderungen für <b>${esc(firma)}</b> wurden gerade gespeichert:</p>${listeHtml}${wartet ? "<p>Neue Preise prüfen wir kurz und schalten sie dann frei. Bis dahin nennt der Assistent den bisherigen Preis.</p>" : ""}<p style="color:#667;font-size:13px">Waren Sie das nicht? Dann antworten Sie bitte sofort auf diese Mail.</p>`),
  });
}

export function zugangRouten(app: Hono) {
  const P = "/k/:kunde/verwalten";
  const zuViele = { ok: false, fehler: "Zu viele Versuche. Bitte in ein paar Minuten noch einmal." };

  // --- Wache für alles unter …/verwalten ---
  const wache = async (c: any, next: any) => {
    const k = c.get("kunde") as Kunde, api = c.req.path.includes("/verwalten/api/");
    // Ausgeschaltet sieht genauso aus wie „gibt es nicht“
    if (!zugangAn(k)) return api ? c.json({ ok: false, fehler: "Diese Seite gibt es nicht." }, 404) : c.text("Diese Seite gibt es nicht.", 404);
    if (api) {
      // Nur unsere eigene Seite darf diese Schnittstellen aufrufen – auch die Website des Kunden nicht
      if (!eigeneHerkunft(c)) return c.json({ ok: false, fehler: "Ungültiger Aufruf." }, 403);
      if (c.req.method !== "GET" && c.req.header("x-verwalten") !== "1") return c.json({ ok: false, fehler: "Ungültiger Aufruf." }, 403);
      c.header("Cache-Control", "no-store");
      c.header("Cross-Origin-Resource-Policy", "same-origin");
    }
    return next();
  };
  app.use(P, wache);
  app.use(`${P}/*`, wache);
  app.use(`${P}/api/*`, bodyLimit({ maxSize: 200_000, onError: (c) => c.json({ ok: false, fehler: "Zu viele Daten auf einmal." }, 413) }));

  app.get(P, (c: any) => {
    const nonce = zufallsToken(16);
    return c.html(mitNonce(VERWALTEN_HTML, nonce), 200, seitenKoepfe(nonce));
  });
  app.get(`${P}/`, (c: any) => c.redirect(`/k/${c.req.param("kunde")}/verwalten`));

  // --- Anmeldung ---
  app.post(`${P}/api/anmelden`, async (c: any) => {
    if (await pruefeLimit(c, "login")) return c.json(zuViele, 429);
    const b: any = await c.req.json().catch(() => ({}));
    await schickeKundenCode(c, c.get("kunde"), b.email);
    return c.json({ ok: true });
  });
  app.post(`${P}/api/einloesen`, async (c: any) => {
    if (await pruefeLimit(c, "login")) return c.json(zuViele, 429);
    const b: any = await c.req.json().catch(() => ({}));
    const cookie = await loeseKundenCodeEin(c, c.get("kunde"), b.email, b.code);
    if (!cookie) return c.json({ ok: false, fehler: "Der Code stimmt nicht oder ist abgelaufen. Bitte einen neuen anfordern." }, 401);
    c.header("Set-Cookie", cookie);
    return c.json({ ok: true });
  });
  app.post(`${P}/api/abmelden`, (c: any) => { c.header("Set-Cookie", abmeldeCookie(c.get("kunde"))); return c.json({ ok: true }); });

  // --- Daten (nur angemeldet). Gelesen wird immer frisch aus dem Speicher, nicht aus dem Zwischenspeicher. ---
  const frisch = async (c: any): Promise<{ wer: string; e: KundeEintrag; live: Kunde } | Response> => {
    const k = c.get("kunde") as Kunde, wer = await kundeAngemeldet(c, k);
    if (!wer) return c.json({ ok: false, fehler: "Bitte anmelden.", firma: k.stammdaten.firmenname }, 401);
    const e = await speicherVon(c).kundeLesen(k.id);
    if (!e?.veroeffentlicht || !zugangAn(e.veroeffentlicht)) return c.json({ ok: false, fehler: "Diese Seite gibt es nicht." }, 404);
    return { wer, e, live: e.veroeffentlicht };
  };
  const antwort = async (wer: string, live: Kunde, mehr: Record<string, unknown> = {}) =>
    ({ ok: true, ich: wer, firma: live.stammdaten.firmenname, anrede: live.ton.anrede, stand: await standVon(live), daten: sichtVon(live), ...mehr });

  app.get(`${P}/api/daten`, async (c: any) => {
    const f = await frisch(c);
    return f instanceof Response ? f : c.json(await antwort(f.wer, f.live));
  });

  app.put(`${P}/api/daten`, async (c: any) => {
    const f = await frisch(c);
    if (f instanceof Response) return f;
    if (await pruefeLimit(c, "aendern")) return c.json({ ok: false, fehler: "Zu viele Änderungen in kurzer Zeit. Bitte gleich noch einmal versuchen." }, 429);
    const b: any = await c.req.json().catch(() => ({}));
    if (b.stand !== (await standVon(f.live))) return c.json({ ok: false, konflikt: true, fehler: "Die Daten wurden inzwischen an anderer Stelle geändert. Bitte die Seite neu laden und die Änderung noch einmal eintragen." }, 409);
    const r = wendeAn(f.live, b.daten);
    if (!r.ok) return c.json({ ok: false, fehler: r.fehler }, 400);
    if (!r.aenderungen.length) return c.json(await antwort(f.wer, f.live, { unveraendert: true }));
    await speichereLive(c, f.e, r.kunde, `Kunde: ${f.wer}`);
    try { await meldeAenderung(c, r.kunde, f.wer, r.aenderungen, r.wartet); } catch (x: any) { console.error("[kunden-zugang-mail]", x?.message || x); }
    return c.json(await antwort(f.wer, r.kunde, { gespeichert: r.aenderungen.length, wartet: r.wartet }));
  });
}
