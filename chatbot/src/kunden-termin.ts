// Termin-Bot und Anfrage-Chat für Kunden.
//
//   GET  /k/<kunde>/termin                 Seite: Termin selbst buchen (Link, QR-Code)
//   GET  /k/<kunde>/api/termin/zeiten      freie Zeiten aus dem Google-Kalender des Kunden
//   POST /k/<kunde>/api/termin/buchen      prüfen, in den Kalender eintragen, Mails, Chef-Übersicht
//   POST /k/<kunde>/api/termin/absagen     Termin über den Link aus der Bestätigung absagen
//   GET  /k/<kunde>/anfrage                Seite: Anliegen schildern
//   POST /k/<kunde>/api/anliegen           Anfrage einstufen, speichern, Mail an den Betrieb
//
// Beim Termin-Bot rechnet nur der Code (keine KI): freie Zeiten, Puffer, Vorlauf.
// Beim Anfrage-Chat gelten zuerst die festen Sicherheitsregeln aus der
// Konfiguration; die KI darf die Dringlichkeit nur erhöhen, nie senken.
import type { Hono } from "hono";
// @ts-ignore – gemeinsame Rechenregeln mit der Website (reines JavaScript)
import { terminArt, terminZeitraum, freieZeiten, istDatum, plusTage, zeitpunkt, isoBerlin, hoeher, TZ } from "../../src/assets/betriebe.js";
import { feiertagAm } from "./feiertage.ts";
import type { Kunde } from "./kunde/schema.ts";
import { terminBetriebVon, pruefeSicherheitsregeln } from "./kunde/umwandeln.ts";
import { kalenderMitId, eigenerKalender, absageToken, leseAbsageToken, entscheidToken, leseEntscheidToken, wannText, icsDatei } from "./termin.ts";
import { AUSWERTUNG_ANWEISUNG, leseAuswertung } from "./betrieb.ts";
import { kurzeAnfrage } from "./llm.ts";
import { istInjection } from "./guard.ts";
import { pruefeLimit } from "./limits.ts";
import { sendeMail, gueltigeMail, type Mail } from "./mail.ts";
import { speicherVon } from "./speicher/schnittstelle.ts";
import { aktuell } from "./kontext.ts";
import { zaehleEreignis } from "./kunden-routen.ts";
import { terminSeite, anfrageSeite } from "./seiten/termin-anfrage.ts";

const kurz = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const tabelle = (z: [string, string][]) => `<table style="border-collapse:collapse;margin:10px 0">${z.map(([a, b]) => `<tr><td style="padding:4px 14px 4px 0;color:#667;vertical-align:top;white-space:nowrap">${esc(a)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(b)}</td></tr>`).join("")}</table>`;
const mailRahmen = (farbe: string, kopf: string, inhalt: string) => `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;color:#1f2a37;font-size:15px;line-height:1.5"><div style="background:${farbe};color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700">${esc(kopf)}</div><div style="border:1px solid #e1e4e6;border-top:0;border-radius:0 0 10px 10px;padding:18px">${inhalt}</div></div>`;
const an = (k: Kunde, art: "anfragen" | "termine") => (k.benachrichtigungen[art].length ? k.benachrichtigungen[art] : [k.stammdaten.email]);
const TEXT = {
  belegt: "Diese Zeit ist gerade weg. Bitte eine andere wählen.",
  kalender: "Der Kalender ist gerade nicht erreichbar. Bitte später noch einmal versuchen oder direkt beim Betrieb melden.",
  fehler: "Das hat nicht geklappt. Bitte noch einmal versuchen.",
  anfrageWeg: "Diese Anfrage ist nicht mehr offen – sie wurde schon entschieden oder ist abgelaufen.",
};

/**
 * Der Kalender dieses Kunden: der freigegebene Google Kalender, sonst unser eigener.
 * Ohne Kalender-ID verwaltet der Bot die Zeiten selbst – so läuft der Termin-Bot
 * auch bei Betrieben mit Outlook, Apple oder ganz ohne digitalen Kalender.
 */
function terminKalender(c: any, k: Kunde) {
  const id = k.module.terminBot.kalenderId;
  return id ? kalenderMitId(c, id) : eigenerKalender(speicherVon(c), k.id, Math.max(60, k.rechtliches.aufbewahrungTage));
}

/**
 * Belegte Zeiten: was im Kalender steht, plus die Vormerkungen aus offenen
 * Terminanfragen. Sonst könnten zwei Leute dieselbe Zeit anfragen.
 */
async function mitVormerkungen(c: any, k: Kunde, kal: { belegt(von: number, bis: number): Promise<{ start: number; ende: number }[]> }, von: number, bis: number) {
  const belegt = await kal.belegt(von, bis);
  if (!k.module.terminBot.bestaetigen) return belegt;
  const vor = await speicherVon(c).vormerkungen(k.id, von, bis).catch((e: any) => { console.error("[vormerkungen]", e?.message || e); return []; });
  return [...belegt, ...vor.map((v) => ({ start: v.start, ende: v.ende }))];
}

/**
 * Prüft die Angaben einer Buchung. `b` = Betrieb aus terminBetriebVon.
 * `land` = Bundesland für die Feiertage: An Feiertagen wird nicht gebucht, auch wenn
 * jemand die Anzeige umgeht (alter Browser-Tab, direkter Aufruf).
 */
export function pruefeTerminAngaben(betrieb: any, e: any, land?: string): { ok: true; d: any } | { ok: false; fehler: string } {
  const t = terminArt(betrieb, e?.termin);
  if (!t) return { ok: false, fehler: "Unbekannte Terminart." };
  if (!istDatum(e.datum)) return { ok: false, fehler: "Datum fehlt." };
  const feier = feiertagAm(e.datum, land as any);
  if (feier) return { ok: false, fehler: `An diesem Tag ist ${feier} – da haben wir geschlossen. Bitte einen anderen Tag wählen.` };
  const name = kurz(e.name, 80), telefon = kurz(e.telefon, 40), email = kurz(e.email, 100).toLowerCase();
  if (!name) return { ok: false, fehler: "Bitte den Namen eintragen." };
  if (!telefon && !email) return { ok: false, fehler: "Bitte Telefon oder E-Mail eintragen." };
  if (telefon && telefon.replace(/\D/g, "").length < 6) return { ok: false, fehler: "Die Telefonnummer sieht zu kurz aus." };
  if (email && !gueltigeMail(email)) return { ok: false, fehler: "Die E-Mail-Adresse sieht nicht vollständig aus." };
  if (t.ort === "telefon" && !telefon) return { ok: false, fehler: "Für den Rückruf bitte die Telefonnummer eintragen." };
  const a = e.adresse || {};
  const adresse = { strasse: kurz(a.strasse, 100), plz: kurz(a.plz, 5), ort: kurz(a.ort, 60) };
  if (t.ort === "kunde" && (!adresse.strasse || !/^\d{5}$/.test(adresse.plz) || !adresse.ort)) return { ok: false, fehler: "Bitte die Adresse für den Termin vor Ort eintragen." };
  if (e.einwilligung !== true) return { ok: false, fehler: "Bitte der Speicherung für den Termin zustimmen." };
  const z = terminZeitraum(betrieb, t.id, e.datum, e.zeit);
  if (!z) return { ok: false, fehler: "Diese Uhrzeit gibt es nicht." };
  const ort = t.ort === "kunde" ? `${adresse.strasse}, ${adresse.plz} ${adresse.ort}` : t.ort === "telefon" ? `Rückruf unter ${telefon}` : `${betrieb.name}${betrieb.adresse ? ", " + betrieb.adresse : ""}`;
  return { ok: true, d: { t, z, datum: e.datum, name, telefon, email, adresse, ort, notiz: kurz(e.notiz, 500) } };
}

/**
 * Mails im Modus „Anfrage statt Buchung“. Wichtig: Der Kunde bekommt hier keine
 * Zusage, sondern nur die Bestätigung, dass seine Anfrage angekommen ist.
 */
function anfrageMails(k: Kunde, betrieb: any, d: any, link: string): Mail[] {
  const wann = wannText(d.t, d.z), farbe = k.aussehen.primaerfarbe;
  const stunden = k.module.terminBot.bestaetigenStunden;
  const fuerBetrieb: [string, string][] = [["Termin", d.t.name], ["Wunschzeit", wann], ["Wo", d.ort], ["Name", d.name]];
  if (d.telefon) fuerBetrieb.push(["Telefon", d.telefon]);
  if (d.email) fuerBetrieb.push(["E-Mail", d.email]);
  if (d.notiz) fuerBetrieb.push(["Notiz", d.notiz]);
  const kontakt = [k.stammdaten.telefon, k.stammdaten.email].filter(Boolean).join(" · ");
  const schluss = `Die Zeit ist ${stunden} Stunden für diese Anfrage vorgemerkt. Ohne Antwort wird sie wieder frei.`;
  const mails: Mail[] = an(k, "termine").map((adresse) => ({
    an: adresse, absenderName: `${betrieb.name} · Termin-Bot`, antwortAn: d.email || undefined,
    betreff: `Terminanfrage: ${d.t.name} – ${d.name}, ${wann}`,
    text: ["Neue Terminanfrage über den Termin-Bot:", "", ...fuerBetrieb.map(([a, b]) => `${a}: ${b}`), "",
      "Bitte im Kalender nachsehen und hier entscheiden:", link, "", schluss].join("\n"),
    html: mailRahmen("#1b1d1f", `Terminanfrage: ${d.t.name}`, `${tabelle(fuerBetrieb)}<p style="margin:0 0 14px">Bitte im Kalender nachsehen und dann entscheiden:</p><p style="margin:0 0 14px"><a href="${esc(link)}" style="background:${esc(farbe)};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block;font-weight:700">Anfrage ansehen und entscheiden</a></p><p style="margin:0;color:#667;font-size:13px">${esc(schluss)}${d.email ? " Mit „Antworten“ schreiben Sie direkt dem Kunden." : ""}</p>`),
  }));
  if (d.email) mails.push({
    an: d.email, anName: d.name, absenderName: betrieb.name, antwortAn: k.stammdaten.email,
    betreff: `Ihre Terminanfrage bei ${betrieb.name}: ${wann}`,
    text: [`Guten Tag ${d.name},`, "", `Ihre Anfrage ist angekommen. ${betrieb.name} sieht im Kalender nach und bestätigt den Termin per E-Mail – noch steht er nicht fest.`, "",
      ...[["Termin", d.t.name], ["Wunschzeit", wann], ["Wo", d.ort]].map(([a, b]) => `${a}: ${b}`), "", `${betrieb.name} · ${kontakt}`].join("\n"),
    html: mailRahmen(farbe, "Ihre Anfrage ist angekommen", `<p style="margin:0 0 4px">Guten Tag ${esc(d.name)},</p><p style="margin:0">${esc(betrieb.name)} sieht im Kalender nach und bestätigt den Termin per E-Mail. <b>Noch steht er nicht fest.</b></p>${tabelle([["Termin", d.t.name], ["Wunschzeit", wann], ["Wo", d.ort]])}<p style="margin:0;color:#667;font-size:13px">${esc(betrieb.name)} · ${esc(kontakt)}</p>`),
  });
  return mails;
}

/** Mail an den Kunden, wenn der Betrieb die Wunschzeit nicht bestätigen kann. */
function absageAnKunden(k: Kunde, betrieb: any, v: any, wann: string, neuLink: string): Mail | null {
  if (!v.daten.email) return null;
  const kontakt = [k.stammdaten.telefon, k.stammdaten.email].filter(Boolean).join(" · ");
  return {
    an: String(v.daten.email), anName: String(v.daten.name || ""), absenderName: betrieb.name, antwortAn: k.stammdaten.email,
    betreff: `Terminanfrage bei ${betrieb.name}: ${wann} geht leider nicht`,
    text: [`Guten Tag ${v.daten.name || ""},`, "", `leider ist ${wann} bei uns nicht frei. Eine andere Zeit finden Sie hier: ${neuLink}`, "", `${betrieb.name} · ${kontakt}`].join("\n"),
    html: mailRahmen(k.aussehen.primaerfarbe, "Die Wunschzeit ist leider nicht frei", `<p style="margin:0 0 4px">Guten Tag ${esc(v.daten.name || "")},</p><p style="margin:0 0 12px">leider ist <b>${esc(wann)}</b> bei uns nicht frei.</p><p style="margin:0 0 14px"><a href="${esc(neuLink)}">Andere Zeit aussuchen</a></p><p style="margin:0;color:#667;font-size:13px">${esc(betrieb.name)} · ${esc(kontakt)}</p>`),
  };
}

function terminMails(k: Kunde, betrieb: any, d: any, eventId: string, absageLink: string): Mail[] {
  const wann = wannText(d.t, d.z), farbe = k.aussehen.primaerfarbe;
  const anhang = [{ name: "termin.ics", inhalt: icsDatei({ uid: eventId, start: d.z.start, ende: d.z.ende, titel: `${d.t.name} bei ${betrieb.name}`, ort: d.ort, text: `${d.t.name} bei ${betrieb.name}` }) }];
  const fuerKunde: [string, string][] = [["Termin", d.t.name], ["Wann", wann], ["Wo", d.ort]];
  if (d.notiz) fuerKunde.push(["Ihre Notiz", d.notiz]);
  const fuerBetrieb: [string, string][] = [["Termin", d.t.name], ["Wann", wann], ["Wo", d.ort], ["Name", d.name]];
  if (d.telefon) fuerBetrieb.push(["Telefon", d.telefon]);
  if (d.email) fuerBetrieb.push(["E-Mail", d.email]);
  if (d.notiz) fuerBetrieb.push(["Notiz", d.notiz]);
  const kontakt = [k.stammdaten.telefon, k.stammdaten.email].filter(Boolean).join(" · ");
  const mails: Mail[] = an(k, "termine").map((adresse) => ({
    an: adresse, absenderName: `${betrieb.name} · Termin-Bot`, antwortAn: d.email || undefined, betreff: `Neuer Termin: ${d.t.name} – ${d.name}, ${wann}`,
    text: ["Neuer Termin über den Termin-Bot:", "", ...fuerBetrieb.map(([a, b]) => `${a}: ${b}`), "", "Der Termin steht schon im Kalender."].join("\n"),
    html: mailRahmen("#1b1d1f", `Neuer Termin: ${d.t.name}`, `${tabelle(fuerBetrieb)}<p style="margin:0;color:#667;font-size:13px">Der Termin steht schon im Kalender.${d.email ? " Mit „Antworten“ schreiben Sie direkt dem Kunden." : ""}</p>`), anhang,
  }));
  if (d.email) mails.push({
    an: d.email, anName: d.name, absenderName: betrieb.name, antwortAn: k.stammdaten.email, betreff: `Ihr Termin bei ${betrieb.name}: ${wann}`,
    text: [`Guten Tag ${d.name},`, "", `Ihr Termin bei ${betrieb.name} steht.`, "", ...fuerKunde.map(([a, b]) => `${a}: ${b}`), "", "Den Termin finden Sie auch im Anhang, zum Übernehmen in Ihren Kalender.", `Sie können nicht? Hier absagen: ${absageLink}`, "", `${betrieb.name} · ${kontakt}`].join("\n"),
    html: mailRahmen(farbe, `Ihr Termin bei ${betrieb.name}`, `<p style="margin:0 0 4px">Guten Tag ${esc(d.name)},</p><p style="margin:0">Ihr Termin steht.</p>${tabelle(fuerKunde)}<p style="margin:0 0 12px">Im Anhang finden Sie den Termin zum Übernehmen in Ihren Kalender.</p><p style="margin:0 0 14px"><a href="${esc(absageLink)}">Sie können nicht? Termin absagen</a></p><p style="margin:0;color:#667;font-size:13px">${esc(betrieb.name)} · ${esc(kontakt)}</p>`), anhang,
  });
  return mails;
}

/** Anliegen einstufen: erst feste Regeln, dann (wenn möglich) die KI – nie unter die Regeln. */
export async function stufeEin(k: Kunde, kategorie: string, beschreibung: string) {
  const regel = pruefeSicherheitsregeln(k, `${kategorie}\n${beschreibung}`);
  const nurRegel = { dringlichkeit: regel.dringlichkeit, hinweise: regel.hinweise, grund: "", zusammenfassung: "", rueckfragen: [] as string[] };
  if (!beschreibung || istInjection(beschreibung)) return nurRegel;
  try {
    const text = await kurzeAnfrage({
      system: `Du hilfst "${k.stammdaten.firmenname}" (${k.stammdaten.brancheText}), eingehende Anfragen zu sortieren, und antwortest ausschließlich mit JSON.`,
      messages: [{ role: "user", content: `${AUSWERTUNG_ANWEISUNG}\n\n<anfrage>\nAnliegen: ${kategorie}\nBeschreibung des Kunden: ${beschreibung}\n</anfrage>` }],
      maxTokens: 350,
    });
    const ki = text ? leseAuswertung(text, regel.dringlichkeit) : null;
    return ki ? { ...ki, dringlichkeit: hoeher(ki.dringlichkeit, regel.dringlichkeit), hinweise: regel.hinweise } : nurRegel;
  } catch (e: any) { console.error("[anliegen-ki]", e?.status || "", e?.message || e); return nurRegel; }
}
const DRINGLICH = { notfall: "Notfall", dringend: "Dringend", normal: "Normal" } as const;

/**
 * `wurzel` = Adress-Anfang, unter dem die Routen liegen. Für Kunden "/k/:kunde"; das
 * Admin-Panel hängt dieselben Routen für die Vorschau noch einmal unter seine Test-Adresse
 * (`vorher` lädt dort den Entwurf).
 */
export function terminAnfrageRouten(app: Hono, wurzel = "/k/:kunde", vorher: any[] = []) {
  const braucht = (modul: "terminBot" | "anfrageChat") => async (c: any, next: any) => {
    if (!(c.get("kunde") as Kunde).module[modul].aktiv) return c.req.path.includes("/api/") ? c.json({ ok: false, fehler: "Dieses Modul ist nicht eingeschaltet." }, 404) : c.text("Diese Seite gibt es nicht.", 404);
    return next();
  };
  // Adresse, unter der Seite und Schnittstellen dieses Kunden liegen (ohne /termin, /anfrage, /api/…)
  const basisVon = (c: any) => { const u = new URL(c.req.url); return u.origin + u.pathname.replace(/\/(termin|anfrage|api\/.*)$/, ""); };

  /* ---------- Termin-Bot ---------- */
  app.get(`${wurzel}/termin`, ...vorher, braucht("terminBot"), (c: any) => {
    const k = c.get("kunde") as Kunde;
    if (!terminBetriebVon(k)) return c.text("Online-Termine sind gerade nicht möglich.", 404);
    zaehleEreignis(c, "termin-aufruf");
    return c.html(terminSeite(k, basisVon(c)), 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  });

  app.get(`${wurzel}/api/termin/zeiten`, ...vorher, braucht("terminBot"), async (c: any) => {
    const k = c.get("kunde") as Kunde, betrieb = terminBetriebVon(k), q = c.req.query();
    const t = betrieb && terminArt(betrieb, q.termin);
    if (!betrieb || !t) return c.json({ ok: false, fehler: "Unbekannte Terminart." }, 400);
    const kal = terminKalender(c, k);
    if (!kal) return c.json({ ok: false, fehler: TEXT.kalender }, 503);
    const von = istDatum(q.von) ? q.von : undefined;
    const tage = Math.max(1, Math.min(21, Number(q.tage) || 14));
    const ab = von || new Date().toISOString().slice(0, 10);
    try {
      const belegt = await mitVormerkungen(c, k, kal, zeitpunkt(plusTage(ab, -1), 0), zeitpunkt(plusTage(ab, tage + 4), 0));
      return c.json({ ok: true, tage: freieZeiten(betrieb, t.id, { von, tage, belegt, feiertag: (d: string) => feiertagAm(d, k.stammdaten.bundesland) }) });
    } catch (e: any) { console.error("[termin-zeiten]", e?.message || e); return c.json({ ok: false, fehler: TEXT.kalender }, 502); }
  });

  app.post(`${wurzel}/api/termin/buchen`, ...vorher, braucht("terminBot"), async (c: any) => {
    if (Number(c.req.header("content-length") || 0) > 8_000) return c.json({ ok: false, fehler: TEXT.fehler }, 413);
    const k = c.get("kunde") as Kunde, betrieb = terminBetriebVon(k);
    if (!betrieb) return c.json({ ok: false, fehler: TEXT.fehler }, 404);
    const p = pruefeTerminAngaben(betrieb, await c.req.json().catch(() => ({})), k.stammdaten.bundesland);
    if (!p.ok) return c.json({ ok: false, fehler: p.fehler }, 400);
    const d = p.d;
    // Vorschau im Admin-Panel: alles geprüft, aber nichts eintragen und nichts verschicken
    if (aktuell().test) return c.json({ ok: true, test: true, wann: wannText(d.t, d.z), ort: d.ort });
    const sperre = await pruefeLimit(c, "anfrage");
    if (sperre) return c.json({ ok: false, fehler: sperre }, 429);
    const kal = terminKalender(c, k);
    if (!kal) return c.json({ ok: false, fehler: TEXT.kalender }, 503);
    const t = k.module.terminBot;
    try {
      // Kurz vor dem Eintragen noch einmal prüfen: Ist die Zeit wirklich noch frei?
      const belegt = await mitVormerkungen(c, k, kal, d.z.blockVon - 86_400_000, d.z.blockBis + 86_400_000);
      const frei = freieZeiten(betrieb, d.t.id, { von: d.datum, tage: 1, belegt })[0];
      if (!frei || !frei.slots.includes(d.z.zeit)) return c.json({ ok: false, belegt: true, fehler: TEXT.belegt }, 409);

      // Modus „Anfrage statt Buchung“: nichts zusagen, erst den Betrieb fragen.
      if (t.bestaetigen) {
        const wann = wannText(d.t, d.z);
        const sp = speicherVon(c);
        const vorgang = await sp.vorgangAnlegen(k.id, { art: "termin", status: "angefragt", titel: `Angefragt: ${d.t.name} – ${d.name}, ${wann}`, daten: { terminart: d.t.name, wann, ort: d.ort, name: d.name, telefon: d.telefon, email: d.email, notiz: d.notiz }, tage: k.rechtliches.aufbewahrungTage })
          .catch((e: any) => { console.error("[anfrage-speichern]", e?.message || e); return ""; });
        const vId = await sp.vormerkungAnlegen(k.id, { start: d.z.start, ende: d.z.ende, stunden: t.bestaetigenStunden,
          daten: { termin: d.t.id, datum: d.datum, zeit: d.z.zeit, name: d.name, telefon: d.telefon, email: d.email, adresse: d.adresse, notiz: d.notiz, vorgang } });
        const link = `${basisVon(c)}/termin?anfrage=${encodeURIComponent(await entscheidToken({ b: k.id, v: vId }))}`;
        zaehleEreignis(c, "termin-anfrage");
        const gemailt = await Promise.all(anfrageMails(k, betrieb, d, link).map((m) => sendeMail(c, m)));
        return c.json({ ok: true, angefragt: true, wann, ort: d.ort, bisStunden: t.bestaetigenStunden, mailAnKunde: !!d.email && gemailt[gemailt.length - 1] });
      }
      const text = [`${d.t.name} · gebucht über den Termin-Bot`, `Name: ${d.name}`, d.telefon && `Telefon: ${d.telefon}`, d.email && `E-Mail: ${d.email}`, d.t.ort === "kunde" && `Adresse: ${d.ort}`, d.notiz && `Notiz vom Kunden: ${d.notiz}`].filter(Boolean).join("\n");
      const id = await kal.eintragen({ titel: `${d.t.name} – ${d.name}`.slice(0, 120), text, ort: d.ort, start: d.z.start, ende: d.z.ende, privat: { quelle: "termin-bot", kunde: k.id, termin: d.t.id } });
      const token = await absageToken({ b: k.id, e: id, s: d.z.start, t: d.t.id, n: d.name.slice(0, 40), m: d.email || undefined });
      const absageLink = `${basisVon(c)}/termin?absagen=${encodeURIComponent(token)}`;
      const wann = wannText(d.t, d.z);
      await speicherVon(c).vorgangAnlegen(k.id, { art: "termin", titel: `${d.t.name} – ${d.name}, ${wann}`, daten: { terminart: d.t.name, wann, ort: d.ort, name: d.name, telefon: d.telefon, email: d.email, notiz: d.notiz }, tage: k.rechtliches.aufbewahrungTage })
        .catch((e: any) => console.error("[termin-speichern]", e?.message || e));
      zaehleEreignis(c, "termin");
      const gemailt = await Promise.all(terminMails(k, betrieb, d, id, absageLink).map((m) => sendeMail(c, m)));
      return c.json({ ok: true, wann, ort: d.ort, start: isoBerlin(d.z.start), ende: isoBerlin(d.z.ende), token, mailAnKunde: !!d.email && gemailt[gemailt.length - 1] });
    } catch (e: any) { console.error("[termin-buchen]", e?.message || e); return c.json({ ok: false, fehler: TEXT.kalender }, 502); }
  });

  // Der Betrieb entscheidet über eine Terminanfrage. Der Link aus der Mail zeigt
  // erst nur die Anfrage (nurZeigen) – damit kein Mail-Scanner versehentlich bestätigt.
  app.post(`${wurzel}/api/termin/entscheiden`, ...vorher, braucht("terminBot"), async (c: any) => {
    const k = c.get("kunde") as Kunde, betrieb = terminBetriebVon(k);
    const b: any = await c.req.json().catch(() => ({}));
    const tok = await leseEntscheidToken(b.token);
    if (!betrieb || !tok || tok.b !== k.id) return c.json({ ok: false, fehler: "Dieser Link ist ungültig." }, 400);
    const sp = speicherVon(c);
    const v = await sp.vormerkungLesen(k.id, tok.v);
    if (!v) return c.json({ ok: false, fehler: TEXT.anfrageWeg }, 410);
    const art = terminArt(betrieb, v.daten.termin);
    const wann = art ? wannText(art, { start: v.start, ende: v.ende }) : "";
    const uebersicht = { terminart: art ? art.name : "Termin", wann, name: String(v.daten.name || ""), telefon: String(v.daten.telefon || ""), email: String(v.daten.email || ""), notiz: String(v.daten.notiz || "") };
    if (b.nurZeigen) return c.json({ ok: true, anfrage: uebersicht });
    if (aktuell().test) return c.json({ ok: true, test: true, anfrage: uebersicht });

    const neuLink = `${basisVon(c)}/termin`;
    // Abgelehnt: Vormerkung weg, Zeit wieder frei, Kunde bekommt Bescheid.
    if (b.entscheidung !== "ja") {
      await sp.vormerkungLoeschen(k.id, tok.v);
      if (v.daten.vorgang) await sp.vorgangStatus(k.id, String(v.daten.vorgang), "abgelehnt").catch(() => false);
      const mail = absageAnKunden(k, betrieb, v, wann, neuLink);
      if (mail) await sendeMail(c, mail);
      return c.json({ ok: true, entscheidung: "nein", anfrage: uebersicht });
    }

    // Bestätigt: jetzt erst in den Kalender, dann die Zusage an den Kunden.
    const p = pruefeTerminAngaben(betrieb, { ...v.daten, adresse: v.daten.adresse || {}, einwilligung: true }, k.stammdaten.bundesland);
    if (!p.ok) return c.json({ ok: false, fehler: p.fehler }, 400);
    const d = p.d;
    const kal = terminKalender(c, k);
    if (!kal) return c.json({ ok: false, fehler: TEXT.kalender }, 503);
    try {
      const text = [`${d.t.name} · bestätigte Terminanfrage`, `Name: ${d.name}`, d.telefon && `Telefon: ${d.telefon}`, d.email && `E-Mail: ${d.email}`, d.t.ort === "kunde" && `Adresse: ${d.ort}`, d.notiz && `Notiz vom Kunden: ${d.notiz}`].filter(Boolean).join("\n");
      const id = await kal.eintragen({ titel: `${d.t.name} – ${d.name}`.slice(0, 120), text, ort: d.ort, start: d.z.start, ende: d.z.ende, privat: { quelle: "termin-bot", kunde: k.id, termin: d.t.id } });
      // Erst wenn der Termin wirklich steht, geben wir die Vormerkung frei.
      await sp.vormerkungLoeschen(k.id, tok.v);
      if (v.daten.vorgang) await sp.vorgangStatus(k.id, String(v.daten.vorgang), "bestätigt").catch(() => false);
      zaehleEreignis(c, "termin");
      const absageLink = `${basisVon(c)}/termin?absagen=${encodeURIComponent(await absageToken({ b: k.id, e: id, s: d.z.start, t: d.t.id, n: d.name.slice(0, 40), m: d.email || undefined }))}`;
      await Promise.all(terminMails(k, betrieb, d, id, absageLink).map((m) => sendeMail(c, m)));
      return c.json({ ok: true, entscheidung: "ja", anfrage: uebersicht });
    } catch (e: any) { console.error("[termin-entscheiden]", e?.message || e); return c.json({ ok: false, fehler: TEXT.kalender }, 502); }
  });

  app.post(`${wurzel}/api/termin/absagen`, ...vorher, braucht("terminBot"), async (c: any) => {
    const k = c.get("kunde") as Kunde;
    const b: any = await c.req.json().catch(() => ({}));
    const t = await leseAbsageToken(b.token);
    // Der Link gilt nur für den Kunden, bei dem gebucht wurde
    if (!t || t.b !== k.id) return c.json({ ok: false, fehler: "Dieser Link ist ungültig." }, 400);
    if (t.s < Date.now()) return c.json({ ok: false, fehler: "Der Termin liegt schon in der Vergangenheit." }, 400);
    const betrieb = terminBetriebVon(k), art = betrieb && terminArt(betrieb, t.t || "");
    const was = `${art ? art.name : "Termin"} am ${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(t.s))} Uhr`;
    if (b.nurZeigen) return c.json({ ok: true, was });
    if (aktuell().test) return c.json({ ok: true, test: true, was });
    const kal = terminKalender(c, k);
    if (!kal) return c.json({ ok: false, fehler: TEXT.kalender }, 503);
    try {
      await kal.loeschen(t.e);
      zaehleEreignis(c, "termin-absage");
      await Promise.all([
        ...an(k, "termine").map((adresse) => sendeMail(c, { an: adresse, absenderName: `${k.stammdaten.firmenname} · Termin-Bot`, antwortAn: t.m, betreff: `Abgesagt: ${was}${t.n ? " – " + t.n : ""}`,
          text: `Der Kunde hat abgesagt: ${was}${t.n ? ` (${t.n})` : ""}. Der Termin ist aus dem Kalender gelöscht.`,
          html: mailRahmen("#1b1d1f", "Termin abgesagt", `<p style="margin:0">Der Kunde hat abgesagt: <b>${esc(was)}</b>${t.n ? ` (${esc(t.n)})` : ""}.</p><p style="margin:8px 0 0">Der Termin ist aus dem Kalender gelöscht.</p>`) })),
        t.m ? sendeMail(c, { an: t.m, anName: t.n, absenderName: k.stammdaten.firmenname, betreff: `Abgesagt: Ihr Termin bei ${k.stammdaten.firmenname}`,
          text: `Guten Tag${t.n ? " " + t.n : ""},\n\nIhr Termin (${was}) ist abgesagt. Einen neuen Termin buchen Sie hier: ${basisVon(c)}/termin`,
          html: mailRahmen(k.aussehen.primaerfarbe, "Termin abgesagt", `<p style="margin:0 0 8px">Guten Tag${t.n ? " " + esc(t.n) : ""},</p><p style="margin:0 0 12px">Ihr Termin (${esc(was)}) ist abgesagt.</p><p style="margin:0"><a href="${basisVon(c)}/termin">Neuen Termin buchen</a></p>`) }) : false,
      ]);
      return c.json({ ok: true, was });
    } catch (e: any) { console.error("[termin-absagen]", e?.message || e); return c.json({ ok: false, fehler: TEXT.fehler }, 502); }
  });

  /* ---------- Anfrage-Chat ---------- */
  app.get(`${wurzel}/anfrage`, ...vorher, braucht("anfrageChat"), (c: any) => {
    const k = c.get("kunde") as Kunde;
    zaehleEreignis(c, "anfrage-aufruf");
    return c.html(anfrageSeite(k, basisVon(c)), 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  });

  app.post(`${wurzel}/api/anliegen`, ...vorher, braucht("anfrageChat"), async (c: any) => {
    if (Number(c.req.header("content-length") || 0) > 20_000) return c.json({ ok: false, fehler: TEXT.fehler }, 413);
    const k = c.get("kunde") as Kunde;
    const b: any = await c.req.json().catch(() => ({}));
    const kategorie = kurz(b.kategorie, 80) || "Allgemein", beschreibung = kurz(b.beschreibung, 1500);
    const name = kurz(b.name, 80), telefon = kurz(b.telefon, 40), email = kurz(b.email, 100).toLowerCase(), adresse = kurz(b.adresse, 160);
    if (!beschreibung) return c.json({ ok: false, fehler: "Bitte kurz beschreiben, worum es geht." }, 400);
    if (!name || (!telefon && !email)) return c.json({ ok: false, fehler: "Bitte Name und Telefon oder E-Mail eintragen." }, 400);
    if (email && !gueltigeMail(email)) return c.json({ ok: false, fehler: "Die E-Mail-Adresse sieht nicht vollständig aus." }, 400);
    if (b.einwilligung !== true) return c.json({ ok: false, fehler: "Bitte der Verarbeitung zustimmen." }, 400);
    const test = !!aktuell().test;
    if (!test) { const sperre = await pruefeLimit(c, "anfrage"); if (sperre) return c.json({ ok: false, fehler: sperre }, 429); }
    const e = await stufeEin(k, kategorie, beschreibung);
    const antwort = { ok: true, dringlichkeit: e.dringlichkeit, hinweise: e.hinweise, zusammenfassung: e.zusammenfassung, telefon: k.stammdaten.telefon };
    if (test) return c.json({ ...antwort, test: true });
    const felder: [string, string][] = [["Dringlichkeit", DRINGLICH[e.dringlichkeit as keyof typeof DRINGLICH] + (e.grund ? ` (${e.grund})` : "")], ["Anliegen", kategorie], ["Beschreibung", beschreibung], ["Name", name]];
    if (telefon) felder.push(["Telefon", telefon]);
    if (email) felder.push(["E-Mail", email]);
    if (adresse) felder.push(["Adresse", adresse]);
    if (e.rueckfragen.length) felder.push(["Rückfragen fürs Gespräch", e.rueckfragen.join("\n")]);
    let gespeichert = false;
    try {
      await speicherVon(c).vorgangAnlegen(k.id, { art: "anfrage", dringlichkeit: e.dringlichkeit, titel: `${e.dringlichkeit === "normal" ? "" : DRINGLICH[e.dringlichkeit as keyof typeof DRINGLICH].toUpperCase() + ": "}${kategorie} – ${name}`,
        daten: { dringlichkeit: DRINGLICH[e.dringlichkeit as keyof typeof DRINGLICH], anliegen: kategorie, beschreibung, name, telefon, email, adresse, rueckfragen: e.rueckfragen.join(" | ") }, tage: k.rechtliches.aufbewahrungTage });
      gespeichert = true; zaehleEreignis(c, "anfrage");
    } catch (x: any) { console.error("[anliegen-speichern]", x?.message || x); }
    // Notfälle gehen zusätzlich an die Notfall-Empfänger
    const empfaenger = [...new Set([...an(k, "anfragen"), ...(e.dringlichkeit === "notfall" ? k.benachrichtigungen.notfall : [])])];
    const vorne = e.dringlichkeit === "notfall" ? "NOTFALL: " : e.dringlichkeit === "dringend" ? "Dringend: " : "";
    const farbe = e.dringlichkeit === "notfall" ? "#b3261e" : e.dringlichkeit === "dringend" ? "#b26a00" : "#1b1d1f";
    const gemailt = (await Promise.all(empfaenger.map((adresse) => sendeMail(c, { an: adresse, absenderName: `${k.stammdaten.firmenname} · Website-Assistent`, antwortAn: email || undefined, betreff: `${vorne}${kategorie} – ${name}`,
      text: [`${vorne}Neue Anfrage über die Website`, "", ...felder.map(([a2, b2]) => `${a2}: ${b2}`)].join("\n"), html: mailRahmen(farbe, `${vorne}Neue Anfrage`, tabelle(felder)) })))).some(Boolean);
    if (!gespeichert && !gemailt) return c.json({ ok: false, fehler: "Senden fehlgeschlagen. Bitte direkt beim Betrieb melden." }, 502);
    return c.json(antwort);
  });
}
