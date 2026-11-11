// Alle Bots eines Kunden unter /k/<kunde>/…
//
//   GET  /k/<kunde>/widget.js            Chat-Fenster für die Website des Kunden
//   GET  /k/<kunde>/api/config           Einstellungen fürs Chat-Fenster
//   POST /k/<kunde>/api/chat             Kunden-Chat
//   POST /k/<kunde>/api/anfrage          Anfrage aus dem Kunden-Chat
//   GET  /k/<kunde>/bewerben             Bewerber-Chat als eigene Seite (Link, QR-Code)
//   POST /k/<kunde>/api/jobs/frage       Frage eines Bewerbers an die KI
//   POST /k/<kunde>/api/jobs/datei       Unterlage hochladen
//   POST /k/<kunde>/api/jobs/bewerbung   Bewerbung abschicken (speichern + Mail an den Betrieb)
//   GET  /k/<kunde>/api/jobs/datei/:id   Unterlage herunterladen (Link aus der Mail)
//
// Ablauf jeder Anfrage: Kunde laden → ist er in Betrieb? → darf diese Website
// das? → Modul eingeschaltet? → dann läuft die Bot-Logik im Kontext dieses Kunden.
import type { Hono } from "hono";
import { aktuell, mitKunde, standardKunde, type Laufzeit } from "./kontext.ts";
import { STANDARD_KUNDE } from "./config.ts";
import { speicherVon, speicherDa } from "./speicher/schnittstelle.ts";
import type { Kunde } from "./kunde/schema.ts";
import { laufzeitVon, bewerberBetriebVon, erlaubteHerkunft, betriebsStatus } from "./kunde/umwandeln.ts";
import { beantworteFrage, systemFuer } from "./bewerber.ts";
import { dateiTyp, sichererName } from "./jobs.ts";
import { pruefeLimit } from "./limits.ts";
import { festeAntwort } from "./guard.ts";
import { sendeMail, gueltigeMail } from "./mail.ts";
import { WIDGET_JS } from "./daten.generated.ts";
import { bewerbenSeite, kundenStartseite } from "./seiten/bewerben.ts";

type Geladen = { kunde: Kunde; laufzeit: Laufzeit };
const zwischenspeicher = new Map<string, { bis: number; g: Geladen | null }>();
/** Nach dem Veröffentlichen im Admin-Panel: sofort neu laden statt bis zu 30 Sekunden zu warten. */
export function vergissKunde(id?: string) { if (id) zwischenspeicher.delete(id); else zwischenspeicher.clear(); }

/** Lädt die veröffentlichte Konfiguration eines Kunden (30 Sekunden zwischengespeichert). */
export async function ladeKunde(c: any, id: string): Promise<Geladen | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(id) || !speicherDa(c)) return null;
  const z = zwischenspeicher.get(id);
  if (z && z.bis > Date.now()) return z.g;
  const e = await speicherVon(c).kundeLesen(id);
  const g = e?.veroeffentlicht ? { kunde: e.veroeffentlicht, laufzeit: laufzeitVon(e.veroeffentlicht, standardKunde().config.llm) } : null;
  if (zwischenspeicher.size > 500) zwischenspeicher.clear();
  zwischenspeicher.set(id, { bis: Date.now() + 30_000, g });
  return g;
}

/** Aufgabe nach der Antwort weiterlaufen lassen (Zählen, Aufräumen), ohne den Besucher warten zu lassen. */
function nebenbei(c: any, p: Promise<unknown>) {
  const sicher = p.catch((e) => console.error("[nebenbei]", e?.message || e));
  try { c.executionCtx.waitUntil(sicher); } catch { /* unter Node läuft es einfach weiter */ }
}

/** Zählt ein Ereignis für die Auswertung des aktuellen Kunden. */
export function zaehleEreignis(c: any, art: string) {
  const l = aktuell();
  if (l.test || l.kundeId === "demo" || !speicherDa(c)) return;
  nebenbei(c, speicherVon(c).zaehle(l.kundeId, art));
}

/** Ist das Monatsbudget des aktuellen Kunden aufgebraucht? (Standard-Kunde: keine Monatsgrenze, wie bisher.) */
export async function monatVoll(c: any): Promise<boolean> {
  const l = aktuell();
  const max = l.config.limits?.monatsbudgetNachrichten;
  if (!max || l.test || l.kundeId === STANDARD_KUNDE || !speicherDa(c)) return false;
  try { return (await speicherVon(c).summeMonat(l.kundeId, "chat")) >= max; }
  catch (e: any) { console.error("[monatsbudget]", e?.message || e); return false; }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const kurz = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);
const empfaenger = (k: Kunde, art: "anfragen" | "bewerbungen" | "termine") => (k.benachrichtigungen[art].length ? k.benachrichtigungen[art] : [k.stammdaten.email]);

/** Mail an den Betrieb als einfache Tabelle. Gibt zurück, ob mindestens eine Mail rausging. */
async function mailAnBetrieb(c: any, k: Kunde, an: string[], betreff: string, titel: string, felder: [string, string][], antwortAn?: string): Promise<boolean> {
  const text = [titel, "", ...felder.map(([a, b]) => `${a}: ${b}`)].join("\n");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1f2a37"><h2 style="font-size:18px;margin:0 0 12px">${esc(titel)}</h2><table style="border-collapse:collapse">${felder.map(([a, b]) => `<tr><td style="padding:4px 14px 4px 0;color:#667;vertical-align:top;white-space:nowrap">${esc(a)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(b)}</td></tr>`).join("")}</table><p style="color:#889;font-size:12px;margin-top:18px">Gesendet vom KI-Assistenten auf Ihrer Website · ki-für-meinen-betrieb.de</p></div>`;
  let ok = false;
  for (const adresse of an) ok = (await sendeMail(c, { an: adresse, betreff, text, html, antwortAn, absenderName: `${k.stammdaten.firmenname} · Website-Assistent` })) || ok;
  return ok;
}

/** Anfrage aus dem Kunden-Chat: speichern (Chef-Übersicht) und per Mail an den Betrieb. */
export async function neueAnfrage(c: any, k: Kunde, a: { name: string; kontakt: string; objekt: string; leistung: string; wunschtermin: string; notiz: string; verlauf: string }) {
  const label = k.module.kundenChat.objektLabel || "Worum geht es?";
  const felder: [string, string][] = [["Name", a.name], ["Kontakt", a.kontakt], [label, a.objekt || "-"], ["Leistung", a.leistung || "-"], ["Wunschtermin", a.wunschtermin || "-"], ["Notiz", a.notiz || "-"], ["Gesprächsverlauf", a.verlauf || "(nicht übermittelt)"]];
  let gespeichert = false;
  try {
    await speicherVon(c).vorgangAnlegen(k.id, { art: "anfrage", titel: `${a.leistung || "Anfrage"} – ${a.name}`, daten: { ...a }, tage: k.rechtliches.aufbewahrungTage });
    gespeichert = true;
    zaehleEreignis(c, "anfrage");
  } catch (e: any) { console.error("[anfrage-speichern]", e?.message || e); }
  const gemailt = await mailAnBetrieb(c, k, empfaenger(k, "anfragen"), `Chat-Anfrage: ${a.leistung || "Allgemein"} – ${a.name}`, `Neue Anfrage über den Website-Chat von ${k.stammdaten.firmenname}`, felder, a.kontakt.includes("@") && gueltigeMail(a.kontakt) ? a.kontakt : undefined);
  // Angekommen ist die Anfrage, wenn sie gespeichert ODER gemailt wurde
  if (!gespeichert && !gemailt) return { ok: false, fehler: "Senden fehlgeschlagen. Bitte direkt beim Betrieb melden." };
  return { ok: true, formsubmit: null };
}

const ID = /^[a-f0-9]{64}$/;
const neueId = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export function kundenRouten(app: Hono, alt: { chatRoute: any; anfrageRoute: any; configRoute: any }) {
  // --- Türsteher für alles unter /k/<kunde>/ ---
  app.use("/k/:kunde/*", async (c: any, next) => {
    const g = await ladeKunde(c, c.req.param("kunde"));
    const api = c.req.path.includes("/api/");
    if (!g) return api ? c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404) : c.text("Diese Seite gibt es nicht.", 404);

    // Nur die Website des Kunden darf die Schnittstellen aus dem Browser aufrufen (CORS).
    // Unsere eigenen Seiten (/k/<kunde>/bewerben) und Downloads sind immer erlaubt.
    const herkunft = c.req.header("origin") || "";
    const eigene = new URL(c.req.url).origin;
    if (herkunft && herkunft !== eigene) {
      if (!erlaubteHerkunft(g.kunde).includes(herkunft)) return c.json({ ok: false, fehler: "Diese Website ist für den Chat nicht freigeschaltet." }, 403);
      c.header("Access-Control-Allow-Origin", herkunft);
      c.header("Vary", "Origin");
      if (c.req.method === "OPTIONS") {
        c.header("Access-Control-Allow-Methods", "GET, POST");
        c.header("Access-Control-Allow-Headers", "Content-Type");
        c.header("Access-Control-Max-Age", "86400");
        return c.body(null, 204);
      }
    }

    const st = betriebsStatus(g.kunde);
    if (!st.an) {
      // Bots aus: Das Chat-Fenster erscheint gar nicht erst, Seiten zeigen einen Hinweis
      if (c.req.path.endsWith("/widget.js")) return c.body("/* Chat ist ausgeschaltet */", 200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
      return api ? c.json({ ok: false, fehler: "Der Assistent ist gerade nicht verfügbar." }, 403) : c.text("Diese Seite ist gerade nicht verfügbar.", 403);
    }
    c.set("kunde", g.kunde);
    return mitKunde(g.laufzeit, () => next());
  });

  const braucht = (modul: "kundenChat" | "bewerberChat") => async (c: any, next: any) => {
    if (!(c.get("kunde") as Kunde).module[modul].aktiv) return c.json({ ok: false, fehler: "Dieses Modul ist nicht eingeschaltet." }, 404);
    return next();
  };

  // --- Kunden-Chat (dieselbe Logik wie /api/chat, nur im Kontext dieses Kunden) ---
  app.get("/k/:kunde/api/config", braucht("kundenChat"), alt.configRoute);
  app.post("/k/:kunde/api/chat", braucht("kundenChat"), alt.chatRoute);
  app.post("/k/:kunde/api/anfrage", braucht("kundenChat"), alt.anfrageRoute);
  app.get("/k/:kunde/widget.js", (c: any) => {
    const k = c.get("kunde") as Kunde;
    if (!k.module.kundenChat.aktiv) return c.body("/* Kunden-Chat ist nicht eingeschaltet */", 200, { "Content-Type": "application/javascript; charset=utf-8" });
    const basis = `${new URL(c.req.url).origin}/k/${k.id}`;
    return c.body(kundenWidget(aktuell().config.design, basis), 200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" });
  });

  // --- Seiten ---
  app.get("/k/:kunde", (c: any) => c.redirect(`/k/${c.req.param("kunde")}/`));
  app.get("/k/:kunde/", (c: any) => c.html(kundenStartseite(c.get("kunde"), new URL(c.req.url).origin)));
  app.get("/k/:kunde/bewerben", (c: any) => {
    const k = c.get("kunde") as Kunde;
    if (!bewerberBetriebVon(k)) return c.text("Gerade nehmen wir hier keine Bewerbungen an.", 404);
    zaehleEreignis(c, "bewerben-aufruf");
    return c.html(bewerbenSeite(k, new URL(c.req.url).origin), 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  });

  // --- Bewerber-Chat ---
  app.post("/k/:kunde/api/jobs/frage", braucht("bewerberChat"), (c: any) => beantworteFrage(c, (b) => {
    const betrieb = bewerberBetriebVon(c.get("kunde"));
    if (!betrieb) return null;
    zaehleEreignis(c, "bewerber-frage");
    return systemFuer(betrieb, betrieb.stellen[b.stelle] ? String(b.stelle) : "", false);
  }, (n) => festeAntwort(n, (c.get("kunde") as Kunde).module.bewerberChat.festeAntworten)));

  app.post("/k/:kunde/api/jobs/datei", braucht("bewerberChat"), async (c: any) => {
    const k = c.get("kunde") as Kunde;
    const max = k.module.bewerberChat.maxDateiMb * 1048576;
    const zuGross = { ok: false, text: `Die Datei ist größer als ${k.module.bewerberChat.maxDateiMb} MB. Mach am besten ein Foto oder ein kleineres PDF.` };
    if (Number(c.req.header("content-length") || 0) > max + 64_000) return c.json(zuGross, 413);
    if (await pruefeLimit(c, "datei")) return c.json({ ok: false, text: "Gerade kamen zu viele Dateien. Versuch es in ein paar Minuten nochmal." }, 429);
    let datei: File | null = null;
    try { const f = (await c.req.formData()).get("datei"); if (f && typeof f !== "string") datei = f as File; } catch { /* kaputtes Formular */ }
    if (!datei || !datei.size) return c.json({ ok: false, text: "Das Hochladen hat nicht geklappt. Versuch es bitte nochmal." }, 400);
    if (datei.size > max) return c.json(zuGross, 413);
    const daten = await datei.arrayBuffer();
    const art = dateiTyp(new Uint8Array(daten.slice(0, 16)), datei.name);
    if (!art) return c.json({ ok: false, text: "Das geht leider nicht. Bitte nur PDF, Word oder Fotos (JPG, PNG, HEIC)." }, 415);
    const meta = { id: neueId(), name: sichererName(datei.name, art.endung), typ: art.typ, groesse: daten.byteLength };
    try { await speicherVon(c).dateiAblegen(k.id, meta, daten); }
    catch (e: any) { console.error("[bewerber-datei]", e?.message || e); return c.json({ ok: false, text: "Das Hochladen hat nicht geklappt. Versuch es bitte nochmal." }, 502); }
    return c.json({ ok: true, id: meta.id, name: meta.name, groesse: meta.groesse });
  });

  // Die Seite ruft zuerst „absenden“ auf (Links zu den Unterlagen) und schickt dann die Bewerbung.
  app.post("/k/:kunde/api/jobs/absenden", braucht("bewerberChat"), async (c: any) => {
    const k = c.get("kunde") as Kunde;
    const b: any = await c.req.json().catch(() => ({}));
    const ids = dateiIds(b.dateien);
    try {
      const gefunden = ids.length ? await speicherVon(c).dateienBehalten(k.id, ids, k.rechtliches.aufbewahrungTage) : [];
      const basis = new URL(c.req.url).origin;
      return c.json({ ok: true, dateien: gefunden.map((m) => ({ name: m.name, groesse: m.groesse, url: `${basis}/k/${k.id}/api/jobs/datei/${m.id}` })) });
    } catch (e: any) { console.error("[bewerber-absenden]", e?.message || e); return c.json({ ok: false }, 502); }
  });

  app.post("/k/:kunde/api/jobs/bewerbung", braucht("bewerberChat"), async (c: any) => {
    if (Number(c.req.header("content-length") || 0) > 30_000) return c.json({ ok: false }, 413);
    const k = c.get("kunde") as Kunde;
    const b: any = await c.req.json().catch(() => ({}));
    const name = kurz(b.name, 100), telefon = kurz(b.telefon, 40), email = kurz(b.email, 120);
    if (!name || (!telefon && !email)) return c.json({ ok: false, fehler: "Name und Telefon oder E-Mail fehlen." }, 400);
    if (b.einwilligung !== true) return c.json({ ok: false, fehler: "Bitte der Speicherung zustimmen." }, 400);
    if (await pruefeLimit(c, "anfrage")) return c.json({ ok: false, fehler: "Zu viele Bewerbungen in kurzer Zeit. Bitte später nochmal versuchen." }, 429);
    const betrieb = bewerberBetriebVon(k);
    const stelle = betrieb?.stellen[String(b.stelle)]?.name || "Initiativbewerbung";
    // Nur einfache Text-Felder übernehmen (Antworten auf die Fragen im Chat); „Unterlagen“ bauen wir selbst
    const felder: [string, string][] = Object.entries(b.felder && typeof b.felder === "object" ? b.felder : {})
      .filter(([f]) => f !== "Unterlagen").slice(0, 20).map(([f, w]) => [kurz(f, 40), kurz(w, 600)]);
    const sp = speicherVon(c);
    const basis = new URL(c.req.url).origin;
    let gespeichert = false, dateien: { name: string; groesse: number; url: string }[] = [];
    try {
      dateien = (await sp.dateienBehalten(k.id, dateiIds(b.dateien), k.rechtliches.aufbewahrungTage)).map((m) => ({ name: m.name, groesse: m.groesse, url: `${basis}/k/${k.id}/api/jobs/datei/${m.id}` }));
      await sp.vorgangAnlegen(k.id, { art: "bewerbung", titel: `${stelle} – ${name}`, daten: { stelle, name, telefon, email, felder: Object.fromEntries(felder), dateien }, tage: k.rechtliches.aufbewahrungTage });
      gespeichert = true;
      zaehleEreignis(c, "bewerbung");
    } catch (e: any) { console.error("[bewerbung-speichern]", e?.message || e); }
    const monate = Math.max(1, Math.round(k.rechtliches.aufbewahrungTage / 30));
    const mailFelder: [string, string][] = [...felder, ["Unterlagen", dateien.length ? dateien.map((d) => `${d.name}: ${d.url}`).join("\n") + `\n(Die Links funktionieren ${monate} Monate, dann werden die Dateien automatisch gelöscht.)` : "keine"]];
    const gemailt = await mailAnBetrieb(c, k, empfaenger(k, "bewerbungen"), `Bewerbung: ${stelle} – ${name}`, `Neue Bewerbung bei ${k.stammdaten.firmenname}`, mailFelder, gueltigeMail(email) ? email : undefined);
    if (!gespeichert && !gemailt) return c.json({ ok: false, fehler: "Senden fehlgeschlagen." }, 502);
    return c.json({ ok: true });
  });

  app.get("/k/:kunde/api/jobs/datei/:id", async (c: any) => {
    const k = c.get("kunde") as Kunde, id = c.req.param("id");
    const nichtDa = () => c.text("Diese Datei gibt es nicht mehr. Unterlagen werden nach Ablauf der Frist automatisch gelöscht.", 404, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    if (!ID.test(id)) return nichtDa();
    const d = await speicherVon(c).dateiHolen(k.id, id).catch(() => null);
    if (!d) return nichtDa();
    const ascii = d.meta.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
    return c.body(d.daten, 200, {
      "Content-Type": d.meta.typ, "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.meta.name)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
    });
  });
}

const dateiIds = (roh: unknown): string[] => [...new Set((Array.isArray(roh) ? roh : []).map(String).filter((x) => ID.test(x)))].slice(0, 5);

/** Chat-Fenster-Skript eines Kunden: Farben und Server-Adresse sind schon eingesetzt. */
export function kundenWidget(design: any, api: string): string {
  // WIDGET_JS enthält die Voreinstellung des Standard-Kunden; hier durch die des Kunden ersetzen
  const anfang = WIDGET_JS.indexOf("const V = "), ende = WIDGET_JS.indexOf(" || { design: {}, maskottchen: null };");
  if (anfang < 0 || ende < 0) return WIDGET_JS;
  return WIDGET_JS.slice(0, anfang) + "const V = " + JSON.stringify({ design, maskottchen: null, api }).replace(/</g, "\\u003c") + WIDGET_JS.slice(ende);
}
