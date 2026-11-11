// Admin-Panel: Übersicht und Einstellungen aller Kunden (nur für uns).
//
//   GET  /admin                              die Oberfläche (eine HTML-Seite)
//   POST /admin/api/anmelden | einloesen | abmelden
//   GET  /admin/api/start                    Kundenliste, Vorlagen, Feld-Erklärungen, Stand des Servers
//   POST /admin/api/kunden                   neuen Kunden anlegen (aus Branchen-Vorlage)
//   GET/PUT/DELETE /admin/api/kunden/:id     lesen, Entwurf speichern, löschen
//   POST …/:id/veroeffentlichen | verwerfen | wiederherstellen | testmail
//   GET  …/:id/vorgaenge  …/auswertung  …/qr  …/export
//   POST …/:id/test/chat  …/test/bewerber    Test-Chat mit dem ENTWURF (geht nicht live)
//
// Entwurf und Veröffentlicht: Speichern ändert nur den Entwurf. Die Bots beim
// Kunden benutzen immer die zuletzt veröffentlichte Fassung.
import type { Hono } from "hono";
import qrcode from "qrcode-generator";
import { speicherVon, speicherDa } from "../speicher/schnittstelle.ts";
import { pruefeKunde, feldHilfen, PAKETE, STATUS, MODUL_NAMEN, NOCH_NICHT, type Kunde } from "../kunde/schema.ts";
import { VORLAGEN, ausVorlage } from "../kunde/vorlagen.ts";
import { laufzeitVon, bewerberBetriebVon } from "../kunde/umwandeln.ts";
import { mitKunde, standardKunde, aktuell } from "../kontext.ts";
import { beantworteFrage, systemFuer } from "../bewerber.ts";
import { vergissKunde, kundenWidget } from "../kunden-routen.ts";
import { bewerbenSeite, testSeite } from "../seiten/bewerben.ts";
import { sendeMail } from "../mail.ts";
import { pruefeLimit } from "../limits.ts";
import { ADMIN_HTML } from "../daten.generated.ts";
import { angemeldet, schickeCode, loeseEin, ABMELDE_COOKIE } from "./anmeldung.ts";
import { pruefeEinrichtung, ampel, serverStand } from "./check.ts";

// Anmeldeversuche pro Besucher: 10 pro Minute, 20 pro Stunde, 30 pro Tag (der Zähler „datei“ hat genau diese Grenzen).
// Einen 6-stelligen Code kann man damit nicht durchprobieren.
const LOGIN_LIMIT = "datei" as const;

// IDs, die nicht vergeben werden dürfen (haben eine feste Bedeutung)
const GESPERRT = new Set(["prime-detailing", "demo", "admin", "api", "crm", "test"]);

export function einbau(k: Kunde, basis: string) {
  const b = `${basis}/k/${k.id}`;
  return {
    seite: `${b}/`,
    kundenChat: k.module.kundenChat.aktiv ? { code: `<script src="${b}/widget.js" defer></script>`, wo: "Auf der Website des Kunden direkt vor </body> einfügen (in jeder Seite, auf der der Chat erscheinen soll)." } : null,
    bewerberChat: bewerberBetriebVon(k) ? {
      link: `${b}/bewerben`,
      stellen: k.module.bewerberChat.stellen.map((s) => ({ name: s.name, link: `${b}/bewerben?stelle=${s.id}` })),
      knopf: `<a href="${b}/bewerben" target="_blank" rel="noopener">Jetzt in 3 Minuten bewerben</a>`,
      wo: "Link für Stellenanzeige, Instagram-Profil, Google-Unternehmensprofil und WhatsApp-Status. QR-Code für Firmenwagen, Bauzaun, Aushang.",
    } : null,
  };
}

export function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 10, margin: 20, scalable: true });
}

export function adminRouten(app: Hono, alt: { chatRoute: any; configRoute: any }) {
  app.get("/admin", (c) => c.html(ADMIN_HTML, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" }));

  // --- Anmeldung (ohne Sitzung erreichbar) ---
  app.post("/admin/api/anmelden", async (c: any) => {
    if (!speicherDa(c)) return c.json({ ok: false, fehler: "Der Speicher ist auf diesem Server noch nicht eingerichtet (siehe BETRIEB.md)." }, 503);
    if (await pruefeLimit(c, LOGIN_LIMIT)) return c.json({ ok: false, fehler: "Zu viele Versuche. Bitte in ein paar Minuten nochmal." }, 429);
    const b: any = await c.req.json().catch(() => ({}));
    await schickeCode(c, b.email);
    return c.json({ ok: true });
  });
  app.post("/admin/api/einloesen", async (c: any) => {
    if (await pruefeLimit(c, LOGIN_LIMIT)) return c.json({ ok: false, fehler: "Zu viele Versuche. Bitte in ein paar Minuten nochmal." }, 429);
    const cookie = await loeseEin(c, await c.req.json().catch(() => ({})));
    if (!cookie) return c.json({ ok: false, fehler: "Der Code stimmt nicht oder ist abgelaufen. Bitte einen neuen anfordern." }, 401);
    c.header("Set-Cookie", cookie);
    return c.json({ ok: true });
  });
  app.post("/admin/api/abmelden", (c: any) => { c.header("Set-Cookie", ABMELDE_COOKIE); return c.json({ ok: true }); });

  // --- Ab hier nur angemeldet. Schreibende Aufrufe brauchen zusätzlich den Kopf „X-Admin“
  //     (den kann eine fremde Website nicht mitschicken – Schutz vor untergeschobenen Klicks). ---
  app.use("/admin/api/*", async (c: any, next) => {
    if (/\/admin\/api\/(anmelden|einloesen|abmelden)$/.test(c.req.path)) return next();
    const wer = await angemeldet(c);
    if (!wer) return c.json({ ok: false, fehler: "Bitte anmelden." }, 401);
    // (Die Test-Vorschau ist ausgenommen: Sie ändert nichts, und Chat-Fenster und Bewerber-Seite schicken den Kopf nicht mit.)
    if (c.req.method !== "GET" && c.req.header("x-admin") !== "1" && !c.req.path.includes("/test/api/")) return c.json({ ok: false, fehler: "Ungültiger Aufruf." }, 403);
    c.set("wer", wer);
    c.header("Cache-Control", "no-store");
    return next();
  });

  const basisVon = (c: any) => new URL(c.req.url).origin;
  const zeile = async (c: any, id: string) => {
    const e = await speicherVon(c).kundeLesen(id);
    if (!e) return null;
    const punkte = pruefeEinrichtung(c, e.entwurf, { live: !!e.veroeffentlicht, offen: e.offen });
    return { e, punkte };
  };

  app.get("/admin/api/start", async (c: any) => {
    const sp = speicherVon(c);
    const kunden = [];
    for (const k of await sp.kundenListe()) {
      const z = await zeile(c, k.id);
      kunden.push({ ...k, ampel: z ? ampel(z.punkte) : "rot", rot: z ? z.punkte.filter((p) => p.farbe === "rot").length : 0 });
    }
    const std = standardKunde().config;
    return c.json({
      ok: true, ich: c.get("wer"), kunden,
      eingebaut: [{ id: "prime-detailing", firmenname: std.betrieb.name, hinweis: "Kunde Nr. 1. Wird über das Website-CMS und chatbot/config/bot.config.json gepflegt und läuft über die alten Adressen (/api/chat, /api/jobs)." }],
      vorlagen: Object.entries(VORLAGEN).map(([id, v]) => ({ id, name: v.name })),
      pakete: Object.entries(PAKETE).map(([id, p]) => ({ id, name: p.name, module: p.module })),
      status: STATUS, modulNamen: MODUL_NAMEN, nochNicht: NOCH_NICHT, hilfen: feldHilfen(), server: serverStand(c), basis: basisVon(c),
    });
  });

  app.post("/admin/api/kunden", async (c: any) => {
    const b: any = await c.req.json().catch(() => ({}));
    const roh = b.kunde && typeof b.kunde === "object" ? b.kunde : {};
    // Neuer Kunde: Branchen-Vorlage als Grundlage, die Angaben aus dem Assistenten gewinnen
    const r = pruefeKunde(b.import ? roh : ausVorlage(String(roh.stammdaten?.branche || "handwerk"), roh));
    if (!r.ok) return c.json({ ok: false, fehler: r.fehler }, 400);
    if (GESPERRT.has(r.kunde.id)) return c.json({ ok: false, fehler: [{ feld: "id", text: "Diese Kunden-ID ist reserviert. Bitte eine andere wählen." }] }, 400);
    if (await speicherVon(c).kundeLesen(r.kunde.id)) return c.json({ ok: false, fehler: [{ feld: "id", text: "Diese Kunden-ID gibt es schon." }] }, 409);
    await speicherVon(c).kundeSpeichern(r.kunde, c.get("wer"));
    return c.json({ ok: true, id: r.kunde.id });
  });

  app.get("/admin/api/vorlage/:branche", (c: any) => c.json({ ok: true, werte: ausVorlage(c.req.param("branche"), {}) }));

  app.get("/admin/api/kunden/:id", async (c: any) => {
    const z = await zeile(c, c.req.param("id"));
    if (!z) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    return c.json({
      ok: true, kunde: z.e.entwurf, live: !!z.e.veroeffentlicht, offen: z.e.offen, geaendert: z.e.geaendert, geaendertVon: z.e.geaendertVon,
      check: z.punkte, ampel: ampel(z.punkte), versionen: await speicherVon(c).versionen(z.e.id),
      einbau: einbau(z.e.veroeffentlicht || z.e.entwurf, basisVon(c)),
    });
  });

  app.put("/admin/api/kunden/:id", async (c: any) => {
    const id = c.req.param("id"), sp = speicherVon(c);
    if (!(await sp.kundeLesen(id))) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    const b: any = await c.req.json().catch(() => ({}));
    const r = pruefeKunde({ ...(b.kunde || {}), id }); // die ID lässt sich nicht ändern
    if (!r.ok) return c.json({ ok: false, fehler: r.fehler }, 400);
    await sp.kundeSpeichern(r.kunde, c.get("wer"));
    return c.json({ ok: true });
  });

  app.post("/admin/api/kunden/:id/veroeffentlichen", async (c: any) => {
    const z = await zeile(c, c.req.param("id"));
    if (!z) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    // Rote Punkte am Kunden selbst verhindern das Veröffentlichen (Server-Punkte nicht: die betreffen alle)
    const rot = z.punkte.filter((p) => p.farbe === "rot" && p.reiter);
    const b: any = await c.req.json().catch(() => ({}));
    const abschalten = ["pausiert", "gekuendigt"].includes(z.e.entwurf.status);
    if (rot.length && !abschalten && !b.trotzdem) return c.json({ ok: false, fehler: "Vor dem Veröffentlichen bitte beheben: " + rot.map((p) => p.titel).join("; "), rot }, 400);
    await speicherVon(c).kundeVeroeffentlichen(z.e.id, c.get("wer"));
    vergissKunde(z.e.id);
    return c.json({ ok: true });
  });

  app.post("/admin/api/kunden/:id/verwerfen", async (c: any) => {
    const sp = speicherVon(c), e = await sp.kundeLesen(c.req.param("id"));
    if (!e?.veroeffentlicht) return c.json({ ok: false, fehler: "Es gibt noch keine veröffentlichte Fassung." }, 400);
    await sp.kundeSpeichern(e.veroeffentlicht, c.get("wer"));
    return c.json({ ok: true });
  });

  app.post("/admin/api/kunden/:id/wiederherstellen", async (c: any) => {
    const sp = speicherVon(c), id = c.req.param("id");
    const b: any = await c.req.json().catch(() => ({}));
    const alt = await sp.versionLesen(id, Number(b.nr));
    if (!alt) return c.json({ ok: false, fehler: "Diese Fassung gibt es nicht mehr." }, 404);
    // Alte Fassungen können aus einer früheren Programmversion stammen: neu prüfen und Standardwerte auffüllen
    const r = pruefeKunde({ ...alt, id });
    if (!r.ok) return c.json({ ok: false, fehler: "Die alte Fassung passt nicht mehr zum aktuellen Stand.", details: r.fehler }, 400);
    await sp.kundeSpeichern(r.kunde, c.get("wer"));
    return c.json({ ok: true });
  });

  app.delete("/admin/api/kunden/:id", async (c: any) => {
    const sp = speicherVon(c), e = await sp.kundeLesen(c.req.param("id"));
    if (!e) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    const b: any = await c.req.json().catch(() => ({}));
    if (String(b.bestaetigung || "").trim() !== e.id) return c.json({ ok: false, fehler: "Zum Löschen bitte die Kunden-ID genau eintippen." }, 400);
    await sp.kundeLoeschen(e.id);
    vergissKunde(e.id);
    return c.json({ ok: true });
  });

  // --- Chef-Übersicht und Auswertung ---
  app.get("/admin/api/kunden/:id/vorgaenge", async (c: any) => c.json({ ok: true, vorgaenge: await speicherVon(c).vorgaenge(c.req.param("id"), { limit: 300 }) }));
  app.post("/admin/api/kunden/:id/vorgaenge/:vid", async (c: any) => {
    const b: any = await c.req.json().catch(() => ({})), sp = speicherVon(c);
    if (b.loeschen === true) { await sp.vorgangLoeschen(c.req.param("id"), c.req.param("vid")); return c.json({ ok: true }); }
    return c.json({ ok: await sp.vorgangStatus(c.req.param("id"), c.req.param("vid"), String(b.status || "neu")) });
  });
  app.get("/admin/api/kunden/:id/auswertung", async (c: any) => {
    const tage = Math.min(90, Math.max(7, Number(c.req.query("tage")) || 30));
    return c.json({ ok: true, tage, zeilen: await speicherVon(c).auswertung(c.req.param("id"), tage) });
  });

  // --- Einbau: QR-Code und Export ---
  app.get("/admin/api/kunden/:id/qr", async (c: any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.text("Nicht gefunden", 404);
    const stelle = String(c.req.query("stelle") || "").replace(/[^a-z0-9-]/g, "");
    const ziel = `${basisVon(c)}/k/${e.id}/bewerben${stelle ? "?stelle=" + stelle : ""}`;
    return c.body(qrSvg(ziel), 200, { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": `inline; filename="qr-bewerben-${e.id}${stelle ? "-" + stelle : ""}.svg"` });
  });
  app.get("/admin/api/kunden/:id/export", async (c: any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.text("Nicht gefunden", 404);
    return c.body(JSON.stringify(e.entwurf, null, 2), 200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="kunde-${e.id}.json"` });
  });

  app.post("/admin/api/kunden/:id/testmail", async (c: any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    const k = e.entwurf, b = k.benachrichtigungen;
    const an = [...new Set([...b.anfragen, ...b.bewerbungen, ...(b.anfragen.length && b.bewerbungen.length ? [] : [k.stammdaten.email])])];
    const ergebnis = [];
    for (const adresse of an) {
      ergebnis.push({ an: adresse, ok: await sendeMail(c, { an: adresse, betreff: `Test: Mails vom Website-Assistenten von ${k.stammdaten.firmenname}`, absenderName: `${k.stammdaten.firmenname} · Website-Assistent`,
        text: "Das ist eine Test-Mail. Wenn sie ankommt, erreichen Sie Anfragen und Bewerbungen aus dem Website-Assistenten unter dieser Adresse. Bitte auch im Spam-Ordner nachsehen und den Absender als sicher markieren.",
        html: "<p>Das ist eine <b>Test-Mail</b>.</p><p>Wenn sie ankommt, erreichen Sie Anfragen und Bewerbungen aus dem Website-Assistenten unter dieser Adresse. Bitte auch im Spam-Ordner nachsehen und den Absender als sicher markieren.</p>" }) });
    }
    return c.json({ ok: ergebnis.some((x) => x.ok), ergebnis });
  });

  // --- Test-Chat mit dem Entwurf: zählt nichts, speichert nichts, verschickt nichts ---
  const mitEntwurf = async (c: any, fn: (k: Kunde) => any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    return mitKunde(laufzeitVon(e.entwurf, standardKunde().config.llm, { test: true }), () => fn(e.entwurf));
  };
  // Unter …/test/ liegen dieselben Adressen wie beim echten Kunden (…/api/chat, …/api/jobs/frage),
  // damit Chat-Fenster und Bewerber-Seite unverändert als Vorschau laufen.
  const T = "/admin/api/kunden/:id/test";
  const testBasis = (c: any) => `${basisVon(c)}/admin/api/kunden/${c.req.param("id")}/test`;
  const rahmenErlaubt = { "X-Frame-Options": "SAMEORIGIN", "Cache-Control": "no-store" };
  app.get(`${T}/seite`, (c: any) => mitEntwurf(c, (k) => c.html(testSeite(k, `${testBasis(c)}/widget.js`), 200, rahmenErlaubt)));
  app.get(`${T}/widget.js`, (c: any) => mitEntwurf(c, () => c.body(kundenWidget(aktuell().config.design, testBasis(c)), 200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" })));
  app.get(`${T}/api/config`, (c: any) => mitEntwurf(c, () => alt.configRoute(c)));
  app.post(`${T}/api/chat`, (c: any) => mitEntwurf(c, () => alt.chatRoute(c)));
  app.post(`${T}/api/anfrage`, (c: any) => c.json({ ok: true, formsubmit: null, test: true }));
  const mitBewerber = (k: Kunde): Kunde => ({ ...k, module: { ...k.module, bewerberChat: { ...k.module.bewerberChat, aktiv: true } } });
  app.get(`${T}/bewerben`, (c: any) => mitEntwurf(c, (k) => {
    const kb = mitBewerber(k);
    return bewerberBetriebVon(kb) ? c.html(bewerbenSeite(kb, basisVon(c), testBasis(c)), 200, rahmenErlaubt) : c.html("<p style='font-family:system-ui;padding:24px'>Noch keine Stelle angelegt (Reiter „Module“).</p>", 200, rahmenErlaubt);
  }));
  app.post(`${T}/api/jobs/frage`, (c: any) => mitEntwurf(c, (k) => beantworteFrage(c, (b) => {
    const betrieb = bewerberBetriebVon(mitBewerber(k));
    return betrieb ? systemFuer(betrieb, betrieb.stellen[b.stelle] ? String(b.stelle) : "", false) : null;
  })));
  // Im Test werden Unterlagen und Bewerbungen angenommen, aber sofort verworfen
  app.post(`${T}/api/jobs/datei`, async (c: any) => {
    let name = "Unterlage", groesse = 0;
    try { const f = (await c.req.formData()).get("datei"); if (f && typeof f !== "string") { name = (f as File).name; groesse = (f as File).size; } } catch { /* egal */ }
    return c.json({ ok: true, id: "0".repeat(64), name, groesse });
  });
  app.post(`${T}/api/jobs/absenden`, (c: any) => c.json({ ok: true, dateien: [] }));
  app.post(`${T}/api/jobs/bewerbung`, (c: any) => c.json({ ok: true, test: true }));
}
