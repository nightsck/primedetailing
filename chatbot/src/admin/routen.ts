// Admin-Panel: Übersicht und Einstellungen aller Kunden (nur für uns).
//
//   GET  /admin                              die Oberfläche (eine HTML-Seite)
//   POST /admin/api/anmelden | einloesen | abmelden
//   GET  /admin/api/start                    Kundenliste, Vorlagen, Feld-Erklärungen, Stand des Servers
//   POST /admin/api/kunden                   neuen Kunden anlegen (aus Branchen-Vorlage)
//   GET/PUT/DELETE /admin/api/kunden/:id     lesen, Entwurf speichern, löschen
//   POST …/:id/veroeffentlichen | verwerfen | wiederherstellen | testmail
//   POST …/:id/preiswunsch                   Preise aus dem Kunden-Zugang freigeben oder ablehnen
//   GET  …/:id/vorgaenge  …/auswertung  …/qr  …/export
//   POST …/:id/test/chat  …/test/bewerber    Test-Chat mit dem ENTWURF (geht nicht live)
//
// Entwurf und Veröffentlicht: Speichern ändert nur den Entwurf. Die Bots beim
// Kunden benutzen immer die zuletzt veröffentlichte Fassung.
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import qrcode from "qrcode-generator";
import { speicherVon, speicherDa } from "../speicher/schnittstelle.ts";
import { pruefeKunde, feldHilfen, PAKETE, STATUS, MODUL_NAMEN, NOCH_NICHT, type Kunde } from "../kunde/schema.ts";
import { VORLAGEN, ausVorlage } from "../kunde/vorlagen.ts";
import { laufzeitVon, bewerberBetriebVon } from "../kunde/umwandeln.ts";
import { mitKunde, standardKunde, aktuell } from "../kontext.ts";
import { beantworteFrage, systemFuer } from "../bewerber.ts";
import { vergissKunde, kundenWidget } from "../kunden-routen.ts";
import { bewerbenSeite, testSeite } from "../seiten/bewerben.ts";
import { terminAnfrageRouten } from "../kunden-termin.ts";
import { terminBetriebVon } from "../kunde/umwandeln.ts";
import { kalenderMitId, dienstkontoMail } from "../termin.ts";
import { sendeMail } from "../mail.ts";
import { pruefeLimit } from "../limits.ts";
import { festeAntwort } from "../guard.ts";
import { selbsttest } from "./selbsttest.ts";
import { ADMIN_HTML } from "../daten.generated.ts";
import { angemeldet, schickeCode, loeseEin, ABMELDE_COOKIE } from "./anmeldung.ts";
import { pruefeEinrichtung, ampel, serverStand } from "./check.ts";
import { seitenKoepfe, mitNonce, zufallsToken, eigeneHerkunft } from "../sicherheit.ts";
import { speichereLive } from "../zugang/routen.ts";
import { entscheideWuensche } from "../zugang/aenderung.ts";
import { zugangsAdressen } from "../zugang/anmeldung.ts";

// Anmeldeversuche pro Besucher: 6 pro Minute, 15 pro Stunde, 30 pro Tag (limits.ts).
// Einen 6-stelligen Code kann man damit nicht durchprobieren.
const LOGIN_LIMIT = "login" as const;

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
    terminBot: terminBetriebVon(k) ? { link: `${b}/termin`, knopf: `<a href="${b}/termin" target="_blank" rel="noopener">Termin online buchen</a>`, wo: "Link für Website, Google-Unternehmensprofil, Instagram, E-Mail-Signatur. QR-Code für Visitenkarte, Rechnung, Schaufenster." } : null,
    zugang: k.zugang?.aktiv ? { link: `${b}/verwalten`, adressen: zugangsAdressen(k) } : null,
    anfrageChat: k.module.anfrageChat.aktiv ? { link: `${b}/anfrage`, knopf: `<a href="${b}/anfrage" target="_blank" rel="noopener">Anfrage stellen</a>`, wo: "Link für Website („Kontakt“), Google-Unternehmensprofil und als Ziel für die SMS des Anruf-Retters." } : null,
  };
}

export function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 10, margin: 20, scalable: true });
}

export function adminRouten(app: Hono, alt: { chatRoute: any; configRoute: any }) {
  // Die Seite selbst: Der Browser führt nur unser eigenes Skript aus und lädt nichts von fremden Servern (sicherheit.ts)
  app.get("/admin", (c) => { const nonce = zufallsToken(16); return c.html(mitNonce(ADMIN_HTML, nonce), 200, seitenKoepfe(nonce, { rahmenSelbst: true })); });
  app.use("/admin/api/*", bodyLimit({ maxSize: 1_000_000, onError: (c) => c.json({ ok: false, fehler: "Zu viele Daten auf einmal." }, 413) }));

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
    // Schreibende Aufrufe nur von unserer eigenen Seite (die Test-Vorschau läuft im Rahmen derselben Seite)
    if (c.req.method !== "GET" && !eigeneHerkunft(c)) return c.json({ ok: false, fehler: "Ungültiger Aufruf." }, 403);
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
      status: STATUS, modulNamen: MODUL_NAMEN, nochNicht: NOCH_NICHT, hilfen: feldHilfen(), server: { ...serverStand(c), kalenderKonto: dienstkontoMail(c) }, basis: basisVon(c),
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
      // Preise aus dem Kunden-Zugang, die auf Freigabe warten (aus der Live-Fassung)
      preiswuensche: (z.e.veroeffentlicht?.wissen.leistungen || []).filter((l) => l.wunsch).map((l) => ({ name: l.name, preis: l.preis, ab: l.ab, wunsch: l.wunsch })),
    });
  });

  app.put("/admin/api/kunden/:id", async (c: any) => {
    const id = c.req.param("id"), sp = speicherVon(c);
    const vorher = await sp.kundeLesen(id);
    if (!vorher) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    const b: any = await c.req.json().catch(() => ({}));
    // Hat inzwischen jemand anders gespeichert (z. B. der Kunde über seinen Zugang)? Dann nicht blind überschreiben.
    if (typeof b.stand === "number" && b.stand !== vorher.geaendert) return c.json({ ok: false, fehler: `Inzwischen wurde dieser Kunde an anderer Stelle geändert (${vorher.geaendertVon || "unbekannt"}). Bitte die Seite neu laden und die Änderung noch einmal eintragen.` }, 409);
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

  // Preise, die der Kunde über seinen Zugang eingetragen hat: übernehmen (gehen sofort live) oder ablehnen
  app.post("/admin/api/kunden/:id/preiswunsch", async (c: any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e?.veroeffentlicht) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht oder er ist noch nicht veröffentlicht." }, 404);
    const b: any = await c.req.json().catch(() => ({}));
    const r = entscheideWuensche(e.veroeffentlicht, b.annehmen === true);
    if (!r.anzahl) return c.json({ ok: false, fehler: "Es wartet kein Preis auf Freigabe." }, 400);
    const p = pruefeKunde({ ...r.kunde, id: e.id });
    if (!p.ok) return c.json({ ok: false, fehler: "Die Preise konnten nicht übernommen werden.", details: p.fehler }, 400);
    await speichereLive(c, e, p.kunde, c.get("wer"));
    return c.json({ ok: true, anzahl: r.anzahl, angenommen: b.annehmen === true });
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
    const seite = ["bewerben", "termin", "anfrage"].includes(c.req.query("seite")) ? c.req.query("seite") : "bewerben";
    const ziel = `${basisVon(c)}/k/${e.id}/${seite}${seite === "bewerben" && stelle ? "?stelle=" + stelle : ""}`;
    return c.body(qrSvg(ziel), 200, { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": `inline; filename="qr-${seite}-${e.id}${stelle ? "-" + stelle : ""}.svg"` });
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

  // Kalender wirklich abfragen: Stimmt die Kalender-ID und ist der Kalender für unser Dienstkonto freigegeben?
  app.post("/admin/api/kunden/:id/kalendertest", async (c: any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    const konto = dienstkontoMail(c), id = e.entwurf.module.terminBot.kalenderId;
    if (!konto) return c.json({ ok: false, fehler: "Am Server fehlt das Google-Dienstkonto (GOOGLE_SA_JSON). Siehe SECRETS.md." });
    if (!id) return c.json({ ok: false, fehler: "Es ist noch keine Kalender-ID eingetragen (vorher speichern)." });
    try {
      const belegt = await kalenderMitId(c, id)!.belegt(Date.now(), Date.now() + 7 * 86_400_000);
      return c.json({ ok: true, text: `Der Kalender ist erreichbar. In den nächsten 7 Tagen stehen ${belegt.length} belegte Zeiten drin.` });
    } catch (x: any) {
      return c.json({ ok: false, fehler: `Der Kalender ist nicht erreichbar. Meist fehlt die Freigabe: In Google Kalender → Einstellungen des Kalenders → „Für bestimmte Personen freigeben“ → ${konto} mit „Änderungen an Terminen vornehmen“ eintragen. (Meldung: ${String(x?.message || x).slice(0, 160)})` });
    }
  });

  // --- Test-Chat mit dem Entwurf: zählt nichts, speichert nichts, verschickt nichts ---
  const mitEntwurf = async (c: any, fn: (k: Kunde) => any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    return mitKunde(laufzeitVon(e.entwurf, standardKunde().config.llm, { test: true }), () => fn(e.entwurf));
  };
  // Selbsttest: stellt dem Kunden-Chat mit dem Entwurf die typischen Fangfragen und prüft die Antworten
  app.post("/admin/api/kunden/:id/selbsttest", (c: any) => mitEntwurf(c, async (k) => {
    if (!k.module.kundenChat.aktiv) return c.json({ ok: false, fehler: "Der Selbsttest prüft den Kunden-Chat. Der ist bei diesem Kunden nicht eingeschaltet." });
    return c.json({ ok: true, ...(await selbsttest(k)) });
  }));

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
  }, (n) => festeAntwort(n, k.module.bewerberChat.festeAntworten))));
  // Im Test werden Unterlagen und Bewerbungen angenommen, aber sofort verworfen
  app.post(`${T}/api/jobs/datei`, async (c: any) => {
    let name = "Unterlage", groesse = 0;
    try { const f = (await c.req.formData()).get("datei"); if (f && typeof f !== "string") { name = (f as File).name; groesse = (f as File).size; } } catch { /* egal */ }
    return c.json({ ok: true, id: "0".repeat(64), name, groesse });
  });
  // Termin-Bot und Anfrage-Chat in der Vorschau: dieselben Routen wie beim Kunden, aber mit dem Entwurf
  // und im Test-Modus (nichts eintragen, speichern oder verschicken).
  terminAnfrageRouten(app, T, [async (c: any, next: any) => {
    const e = await speicherVon(c).kundeLesen(c.req.param("id"));
    if (!e) return c.json({ ok: false, fehler: "Diesen Kunden gibt es nicht." }, 404);
    c.set("kunde", e.entwurf);
    c.header("Cache-Control", "no-store");
    return mitKunde(laufzeitVon(e.entwurf, standardKunde().config.llm, { test: true }), () => next());
  }]);
  app.post(`${T}/api/jobs/absenden`, (c: any) => c.json({ ok: true, dateien: [] }));
  app.post(`${T}/api/jobs/bewerbung`, (c: any) => c.json({ ok: true, test: true }));
}
