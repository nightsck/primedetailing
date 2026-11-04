// Vertriebs-CRM: Bot-Bausteine, Anmeldung, geschützte Schnittstelle, Info-Mail nur mit Einwilligung,
// Abmeldelink, Kundenakte, kompletter Bot-Durchlauf (OpenStreetMap, Website, KI, Mail simuliert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { testSql } from "./crm-hilfe.ts";
process.env.SESSION_SECRET = "test-geheimnis";
const { crmKern } = await import("../src/crm/kern.ts");
const B = await import("../src/crm/bot.ts");
const R = await import("../src/crm/routen.ts");

/* ---------- Mini-App statt Hono (Routen mit :parametern) ---------- */
function miniApp() {
  const routen: { m: string; re: RegExp; namen: string[]; h: Function }[] = [];
  const reg = (m: string) => (pfad: string, h: Function) => {
    const namen: string[] = [];
    const re = new RegExp("^" + pfad.replace(/:(\w+)/g, (_, n) => { namen.push(n); return "([^/]+)"; }) + "$");
    routen.push({ m, re, namen, h });
  };
  const app: any = { get: reg("GET"), post: reg("POST"), put: reg("PUT"), delete: reg("DELETE"), use: () => {} };
  app.anfrage = async (m: string, url: string, o: { body?: any; header?: Record<string, string>; env: any }) => {
    const u = new URL(url, "https://crm.test");
    const r = routen.find((x) => x.m === m && x.re.test(u.pathname));
    if (!r) return new Response("404", { status: 404 });
    const treffer = u.pathname.match(r.re)!;
    const params = Object.fromEntries(r.namen.map((n, i) => [n, decodeURIComponent(treffer[i + 1])]));
    const header = Object.fromEntries(Object.entries(o.header || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const roh = o.body instanceof Uint8Array ? o.body : o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body);
    const c = {
      env: o.env,
      req: {
        url: u.href, method: m, header: (k: string) => header[k.toLowerCase()] ?? (k.toLowerCase() === "content-length" && roh ? String(typeof roh === "string" ? Buffer.byteLength(roh) : roh.byteLength) : undefined),
        param: (k: string) => params[k], query: (k: string) => u.searchParams.get(k) ?? undefined,
        json: async () => JSON.parse(String(roh)), text: async () => String(roh ?? ""), arrayBuffer: async () => (roh instanceof Uint8Array ? roh.buffer.slice(roh.byteOffset, roh.byteOffset + roh.byteLength) : new TextEncoder().encode(String(roh ?? "")).buffer),
      },
      json: (d: any, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json", ...h } }),
      body: (d: any, status = 200, h: Record<string, string> = {}) => new Response(d, { status, headers: h }),
    };
    return r.h(c);
  };
  return app;
}

/* ---------- simuliertes Internet ---------- */
type Aufruf = { url: string; body: any };
function netz(antworten: { overpass?: any; seiten?: Record<string, string>; ki?: any; overpassAus?: string[] }) {
  const aufrufe: Aufruf[] = [];
  const f = (async (url: string, o: any = {}) => {
    const body = typeof o.body === "string" && o.body.startsWith("{") ? JSON.parse(o.body) : o.body;
    aufrufe.push({ url: String(url), body });
    if (String(url).startsWith("https://api.brevo.com")) return new Response("{}", { status: 201 });
    if (B.OVERPASS.includes(String(url))) {
      if (antworten.overpassAus?.some((h) => String(url).includes(h))) return new Response("down", { status: 521 });
      return Response.json(antworten.overpass || { elements: [] });
    }
    if (String(url).startsWith("https://api.anthropic.com")) return Response.json({ content: [{ type: "text", text: JSON.stringify(antworten.ki || { score: 80, begruendung: "Passt gut", einstieg: "Hallo" }) }] });
    const seite = antworten.seiten?.[String(url)];
    if (seite !== undefined) return new Response(seite, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("nicht da", { status: 404 });
  }) as any;
  return { f, aufrufe, mails: () => aufrufe.filter((a) => a.url.startsWith("https://api.brevo.com")).map((a) => a.body) };
}

const ENV = (kern: any, extra: Record<string, string> = {}) => ({ CRM_KERN: kern, MAIL_ABSENDER: "termine@primedetailing.eu", BREVO_API_KEY: "test", ...extra });

/* ---------- Bausteine ---------- */
const ALLE = { vertrag: true, avv: true, sepa: true };

test("OpenStreetMap: Abfrage mit Region und Branche, Treffer lesen", () => {
  const q = B.overpassAbfrage("sanitaer", 'Stutt"gart]', 30)!;
  assert.match(q, /area\["boundary"="administrative"\]\["name"="Stuttgart"\]/, "Sonderzeichen entfernt");
  assert.match(q, /nwr\["craft"="plumber"\]\["name"\]\(area\.a\);/);
  assert.match(q, /nwr\["craft"="hvac"\]/);
  assert.match(q, /out center tags 30;/);
  assert.equal(B.overpassAbfrage("gibtsnicht", "Ulm"), null);
  const t = B.osmTreffer({ elements: [
    { type: "node", id: 1, tags: { name: "KFZ Müller", "addr:street": "Hauptstr.", "addr:housenumber": "5", "addr:postcode": "70173", "addr:city": "Stuttgart", phone: "0711 1", website: "kfz-mueller.de" } },
    { type: "way", id: 2, tags: { amenity: "car_wash" } },
  ] }, "autowerkstatt");
  assert.equal(t.length, 1, "ohne Namen weggelassen");
  assert.deepEqual(t[0], { name: "KFZ Müller", branche: "Autowerkstatt", strasse: "Hauptstr. 5", plz: "70173", ort: "Stuttgart", telefon: "0711 1", website: "kfz-mueller.de", email: null, quelle_id: "osm:node/1" });
});

test("Website: Text ohne Skripte, Umlaute, Impressum-Link", () => {
  const html = `<html><head><style>x{}</style><script>alert(1)</script></head><body><h1>Autoh&auml;user &amp; Co</h1><p>Termin&nbsp;vereinbaren</p><a href="/kontakt">Kontakt</a> <a href="/rechtliches/impressum.html">Impressum</a></body></html>`;
  const t = B.htmlZuText(html);
  assert.ok(t.includes("Autohäuser & Co"));
  assert.ok(!t.includes("alert"));
  assert.equal(B.impressumLink(html, "https://muster.de/start"), "https://muster.de/rechtliches/impressum.html");
  assert.equal(B.impressumLink(`<a href="/legal">Impressum</a>`, "https://m.de/"), "https://m.de/legal");
  assert.equal(B.impressumLink(`<a href="javascript:alert(1)">Impressum</a>`, "https://m.de/"), null);
});

test("Regeln ohne KI: keine Online-Buchung und Stellenanzeige zählen, Chat und Buchung mindern", () => {
  const gut = B.regelBewertung({ telefon: "1", branche: "Autowerkstatt" }, { start: "Wir suchen Bürokraft für Empfang und Telefon", html: "" });
  const schlecht = B.regelBewertung({ telefon: null, branche: "Friseur" }, { start: "Jetzt online Termin buchen. Live-Chat", html: "" });
  assert.ok(gut.score >= 80, String(gut.score));
  assert.ok(schlecht.score <= 20, String(schlecht.score));
  assert.match(gut.begruendung, /keine Online-Terminbuchung/);
  assert.equal(B.kiJson('Hier: {"score": 77, "begruendung": "x"} Ende').score, 77);
  assert.equal(B.kiJson("kein json"), null);
});

/* ---------- Anmeldung ---------- */
async function anmelden(app: any, env: any, n: ReturnType<typeof netz>) {
  const vorher = n.mails().length;
  await app.anfrage("POST", "/api/crm/login", { env, body: { email: "KIfuermeinenbetrieb@gmail.com " } });
  const mail = n.mails()[vorher];
  const t = String(mail.textContent).match(/anmelden#([0-9a-f]{64})/)![1];
  const r = await app.anfrage("POST", "/api/crm/anmelden", { env, body: { t } });
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  return { "x-crm": "1", cookie };
}

test("Anmeldung: nur erlaubte Adresse bekommt einen Link, Link nur einmal, Cookie sicher", async () => {
  const kern = crmKern(testSql()); const n = netz({}); globalThis.fetch = n.f;
  const app = miniApp(); R.crmRouten(app); const env = ENV(kern);
  let r = await app.anfrage("POST", "/api/crm/login", { env, body: { email: "fremd@example.org" } });
  assert.equal((await r.json()).ok, true, "gleiche Antwort");
  assert.equal(n.mails().length, 0, "keine Mail an fremde Adressen");
  r = await app.anfrage("POST", "/api/crm/login", { env, body: { email: "kifuermeinenbetrieb@gmail.com" } });
  const mail = n.mails()[0];
  assert.equal(mail.to[0].email, "kifuermeinenbetrieb@gmail.com");
  const t = String(mail.textContent).match(/anmelden#([0-9a-f]{64})/)![1];
  r = await app.anfrage("POST", "/api/crm/anmelden", { env, body: { t } });
  const set = r.headers.get("set-cookie")!;
  assert.match(set, /crm_s=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  r = await app.anfrage("POST", "/api/crm/anmelden", { env, body: { t } });
  assert.equal(r.status, 400, "Link nur einmal");
  // geschützt: ohne Cookie 401, ohne x-crm bei POST 403
  r = await app.anfrage("GET", "/api/crm/start", { env });
  assert.equal(r.status, 401);
  const cookie = set.split(";")[0];
  r = await app.anfrage("GET", "/api/crm/start", { env, header: { cookie } });
  assert.equal(r.status, 200);
  r = await app.anfrage("POST", "/api/crm/firmen", { env, header: { cookie }, body: { name: "X" } });
  assert.equal(r.status, 403, "Schutz vor fremden Formularen");
  // Abmelden beendet die Sitzung
  await app.anfrage("POST", "/api/crm/abmelden", { env, header: { cookie } });
  r = await app.anfrage("GET", "/api/crm/start", { env, header: { cookie } });
  assert.equal(r.status, 401);
  // höchstens 5 Links pro Stunde
  for (let i = 0; i < 6; i++) await app.anfrage("POST", "/api/crm/login", { env, body: { email: "kifuermeinenbetrieb@gmail.com" } });
  assert.equal(n.mails().length, 5);
});

test("CRM-Ablauf: Firma anlegen, Anruf mit Einwilligung, Info-Mail erst mit Absender, Abmeldelink sperrt", async () => {
  const kern = crmKern(testSql()); const n = netz({}); globalThis.fetch = n.f;
  const app = miniApp(); R.crmRouten(app);
  let env: any = ENV(kern);
  const h = await anmelden(app, env, n);
  let r = await app.anfrage("POST", "/api/crm/firmen", { env, header: h, body: { name: "Werkstatt Info", email: "info@werkstatt.de", telefon: "0711 99" } });
  const { id } = await r.json();
  // ohne Einwilligung: keine Info-Mail
  r = await app.anfrage("POST", `/api/crm/firma/${id}/infomail`, { env: ENV(kern, { VERTRIEB_ABSENDER: "vertrieb@primedetailing.eu" }), header: h, body: {} });
  assert.equal(r.status, 400);
  assert.match((await r.json()).fehler, /Einwilligung/);
  r = await app.anfrage("POST", `/api/crm/firma/${id}/anruf`, { env, header: h, body: { ergebnis: "infos_mail", einwilligung: true, notiz: "Chef will Infos" } });
  assert.equal((await r.json()).infomail, true);
  // ohne Absender: ausgeschaltet
  r = await app.anfrage("POST", `/api/crm/firma/${id}/infomail`, { env, header: h, body: {} });
  assert.match((await r.json()).fehler, /Absender/);
  // mit Absender: geht raus, mit Impressum und Abmeldelink
  env = ENV(kern, { VERTRIEB_ABSENDER: "vertrieb@primedetailing.eu" });
  await app.anfrage("PUT", "/api/crm/einstellungen", { env, header: h, body: { impressum: "Muster GbR, Musterweg 1" } });
  const vorher = n.mails().length;
  r = await app.anfrage("POST", `/api/crm/firma/${id}/infomail`, { env, header: h, body: {} });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const m = n.mails()[vorher];
  assert.equal(m.sender.email, "vertrieb@primedetailing.eu");
  assert.equal(m.to[0].email, "info@werkstatt.de");
  assert.match(m.textContent, /Muster GbR, Musterweg 1/);
  const link = String(m.textContent).match(/crm\/abmeldung\?t=(\S+)/)![1];
  assert.equal(kern.firma(id)!.status, "infos_mail");
  // gefälschter Abmeldelink wird abgelehnt, echter sperrt
  r = await app.anfrage("POST", "/api/crm/abmeldung", { env, body: { t: `${id}.${"0".repeat(32)}` } });
  assert.equal(r.status, 400);
  r = await app.anfrage("POST", "/api/crm/abmeldung", { env, body: { t: link } });
  assert.equal(r.status, 200);
  assert.equal(kern.firma(id)!.gesperrt, true);
  r = await app.anfrage("POST", `/api/crm/firma/${id}/infomail`, { env, header: h, body: {} });
  assert.match((await r.json()).fehler, /gesperrt/);
});

test("Kundenakte: Upload und Download einer Datei, Grenze 10 MB", async () => {
  const kern = crmKern(testSql()); const n = netz({}); globalThis.fetch = n.f;
  const app = miniApp(); R.crmRouten(app); const env = ENV(kern);
  const h = await anmelden(app, env, n);
  const { id } = kern.firmaAnlegen({ name: "Akte" }, "Tom");
  const daten = new Uint8Array([1, 2, 3, 250]);
  let r = await app.anfrage("POST", `/api/crm/firma/${id}/dokument`, { env, header: { ...h, "content-type": "application/pdf", "x-name": encodeURIComponent("Angebot Müller.pdf"), "x-titel": encodeURIComponent("Angebot"), "x-typ": "angebot" }, body: daten });
  const did = (await r.json()).id;
  r = await app.anfrage("GET", `/api/crm/dokument/${did}`, { env, header: { cookie: h.cookie } });
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), daten);
  assert.match(r.headers.get("content-disposition")!, /filename\*=UTF-8''Angebot%20M%C3%BCller\.pdf/);
  r = await app.anfrage("POST", `/api/crm/firma/${id}/dokument`, { env, header: { ...h, "content-length": "20000000" }, body: daten });
  assert.equal(r.status, 400);
});

test("Bot-Durchlauf: Suche morgens, Bewertung mit KI, Anruf-Impulse werktags ab 8 Uhr per Mail", async () => {
  const kern = crmKern(testSql()); const env = ENV(kern, { ANTHROPIC_API_KEY: "sk-test" });
  kern.einstellungenSetzen({ suchmodus: "branchen", zielbranchen: ["autowerkstatt"], zielregionen: ["Stuttgart"], impulse_pro_tag: 5 });
  // gesperrte Firma darf nicht neu angelegt werden
  const alt = kern.firmaAnlegen({ name: "Gesperrt", website: "gesperrt.de" }, "Tom").id; kern.sperren(alt, "Widerspruch", "Tom");
  const n = netz({
    overpass: { elements: [
      { type: "node", id: 1, tags: { name: "KFZ Gut", phone: "0711 1", website: "https://kfz-gut.de" } },
      { type: "node", id: 2, tags: { name: "Ohne Website", phone: "0711 2" } },
      { type: "node", id: 3, tags: { name: "Gesperrt", website: "https://www.gesperrt.de" } },
    ] },
    seiten: { "https://kfz-gut.de": `<p>Werkstatt Gut</p><a href="/impressum">Impressum</a>`, "https://kfz-gut.de/impressum": "<p>Inhaber: Karl Gut</p>" },
    ki: { score: 88, begruendung: "Keine Online-Buchung, Telefon nur vormittags.", einstieg: "Guten Tag Herr Gut", inhaber: "Karl Gut", online_buchung: false, chat: false },
  });
  globalThis.fetch = n.f;
  // Dienstag, 3.11.2026, 5:50 Uhr: noch nichts suchen
  let b: any = await R.geplant(env, Date.parse("2026-11-03T04:50:00Z"), n.f);
  assert.equal(b.suche, undefined);
  // 6:10 Uhr: Suche + erste Bewertungen
  b = await R.geplant(env, Date.parse("2026-11-03T05:10:00Z"), n.f);
  assert.deepEqual(b.suche, { tag: "2026-11-03", modus: "branchen", branche: "autowerkstatt", region: "Stuttgart", treffer: 3, neu: 2, doppelt: 0, gesperrt: 1 });
  assert.equal(b.bewertet, 2);
  const gut = kern.firmen({ q: "KFZ Gut" })[0];
  assert.equal(gut.score, 88);
  assert.equal(gut.status, "anruf_impuls");
  assert.equal(kern.firma(gut.id)!.ansprechpartner[0].name, "Karl Gut");
  const ki = n.aufrufe.find((a) => a.url.includes("anthropic"))!;
  assert.match(ki.body.messages[0].content, /Inhaber: Karl Gut/, "Impressum wurde gelesen");
  assert.equal(ki.body.model, "claude-haiku-5-5");
  // zweiter Lauf am selben Morgen: keine zweite Suche
  b = await R.geplant(env, Date.parse("2026-11-03T05:20:00Z"), n.f);
  assert.equal(b.suche, undefined);
  assert.equal(n.mails().length, 0, "vor 8 Uhr keine Impulse");
  // 8:10 Uhr: Impulse-Mail
  b = await R.geplant(env, Date.parse("2026-11-03T07:10:00Z"), n.f);
  assert.ok(b.impulse.neu >= 1);
  const m = n.mails().at(-1);
  assert.equal(m.to[0].email, "kifuermeinenbetrieb@gmail.com");
  assert.match(m.subject, /Heute anrufen/);
  assert.match(m.htmlContent, /KFZ Gut/);
  assert.match(m.htmlContent, /crm#\/firma\/\d+/);
  b = await R.geplant(env, Date.parse("2026-11-03T07:20:00Z"), n.f);
  assert.equal(b.impulse, undefined, "nur einmal am Tag");
  // Samstag: keine Impulse
  const vorher = n.mails().length;
  await R.geplant(env, Date.parse("2026-11-07T08:10:00Z"), n.f);
  assert.equal(n.mails().length, vorher);
  // Notbremse und Bot aus
  assert.deepEqual(await R.geplant({ ...env, KILL_SWITCH: "1" }, Date.now(), n.f), { pausiert: true });
  kern.einstellungenSetzen({ bot_aktiv: false });
  assert.equal((await R.geplant(env, Date.parse("2026-11-04T05:10:00Z"), n.f) as any).bot, "aus");
});

test("Bot ohne KI-Schlüssel bewertet nach Regeln; KI-Fehler fällt auf Regeln zurück", async () => {
  const kern = crmKern(testSql());
  kern.einstellungenSetzen({ suchmodus: "branchen", zielbranchen: ["maler"], zielregionen: ["Ulm"] });
  const n = netz({ overpass: { elements: [{ type: "node", id: 9, tags: { name: "Maler Ulm", phone: "0731 1" } }] } });
  await R.geplant(ENV(kern), Date.parse("2026-11-03T05:10:00Z"), n.f);
  const f = kern.firmen({ q: "Maler Ulm" })[0];
  assert.ok(f.score != null);
  assert.equal(kern.firma(f.id)!.infos.methode, "regeln");
  assert.equal(n.aufrufe.filter((a) => a.url.includes("anthropic")).length, 0);
});

test("Zahlungserinnerung: überfällige Posten per Mail, nur einmal", async () => {
  const kern = crmKern(testSql(), () => Date.parse("2026-12-01T09:00:00Z"));
  const env = ENV(kern);
  const { id } = kern.firmaAnlegen({ name: "Zahler" }, "Tom");
  kern.vertragAnlegen(id, { beginn: "2026-10-01", einmal: "500", monatlich: "100", unterlagen: ALLE }, "Tom");
  kern.einstellungenSetzen({ bot_aktiv: false });
  const n = netz({}); globalThis.fetch = n.f;
  await R.geplant(env, Date.parse("2026-12-01T07:10:00Z"), n.f);
  const m = n.mails().find((x: any) => /überfällig/.test(x.subject));
  assert.ok(m, "Erinnerung verschickt");
  assert.match(m.textContent, /Zahler: 500,00/);
  const anzahl = n.mails().length;
  await R.geplant(env, Date.parse("2026-12-02T07:10:00Z"), n.f);
  assert.equal(n.mails().filter((x: any) => /überfällig/.test(x.subject)).length, 1, "nicht jeden Tag dieselben Posten");
  assert.ok(n.mails().length >= anzahl);
});

test("OpenStreetMap: fällt ein Server aus, wird der nächste gefragt", async () => {
  const n = netz({ overpass: { elements: [{ type: "node", id: 5, tags: { name: "Ersatz GmbH" } }] }, overpassAus: ["overpass-api.de"] });
  const t = await B.sucheFirmen(n.f, "maler", "Ulm");
  assert.equal(t[0].name, "Ersatz GmbH");
  assert.equal(n.aufrufe.filter((a) => B.OVERPASS.includes(a.url)).length, 2);
  const alle = netz({ overpassAus: B.OVERPASS.map((u) => new URL(u).hostname) });
  await assert.rejects(B.sucheFirmen(alle.f, "maler", "Ulm"), /nicht erreichbar: overpass-api\.de 521/);
});

test("Suche fehlgeschlagen: nach 30 Minuten neuer Versuch, nicht erst am nächsten Tag", async () => {
  const kern = crmKern(testSql()); const env = ENV(kern);
  kern.einstellungenSetzen({ suchmodus: "branchen", zielbranchen: ["maler"], zielregionen: ["Ulm"] });
  const aus = netz({ overpassAus: B.OVERPASS.map((u) => new URL(u).hostname) });
  let b: any = await R.geplant(env, Date.parse("2026-11-03T05:10:00Z"), aus.f);
  assert.match(b.suche.fehler, /nicht erreichbar/);
  const an = netz({ overpass: { elements: [{ type: "node", id: 7, tags: { name: "Maler Später" } }] } });
  b = await R.geplant(env, Date.parse("2026-11-03T05:30:00Z"), an.f);
  assert.equal(b.suche, undefined, "nicht schon nach 20 Minuten");
  b = await R.geplant(env, Date.parse("2026-11-03T05:45:00Z"), an.f);
  assert.equal(b.suche.neu, 1, "nach 35 Minuten geklappt");
  b = await R.geplant(env, Date.parse("2026-11-03T07:30:00Z"), an.f);
  assert.equal(b.suche, undefined, "danach für heute erledigt");
});

test("Von Hand bewerten: auch angelegte Firmen, Status springt auf Anruf-Impuls", async () => {
  const kern = crmKern(testSql()); const n = netz({ seiten: { "https://hand.de": "<p>Werkstatt</p>" }, ki: { score: 91, begruendung: "Sehr gut", einstieg: "Hallo" } }); globalThis.fetch = n.f;
  const app = miniApp(); R.crmRouten(app); const env = ENV(kern, { ANTHROPIC_API_KEY: "sk" });
  const h = await anmelden(app, env, n);
  const { id } = kern.firmaAnlegen({ name: "Hand GmbH", website: "https://hand.de" }, "Tom");
  const r = await app.anfrage("POST", `/api/crm/firma/${id}/bewerten`, { env, header: h, body: {} });
  const j = await r.json();
  assert.equal(j.score, 91);
  assert.equal(kern.firma(id)!.status, "anruf_impuls");
  kern.anrufErfassen(id, { ergebnis: "termin" }, "Tom");
  await app.anfrage("POST", `/api/crm/firma/${id}/bewerten`, { env, header: h, body: {} });
  assert.equal(kern.firma(id)!.status, "termin", "Neubewertung ändert keinen späteren Status");
});

test("KI-Antwort: Punkte als Text, JSON im Codeblock, unlesbare Antwort → Regeln mit Grund", async () => {
  assert.equal(B.kiJson('```json\n{"score": "64"}\n```').score, "64");
  const ok = netz({ ki: { score: "64", begruendung: "Mittel" } });
  const b = await B.kiBewertung(ok.f, "sk", "m", { name: "X" }, null);
  assert.equal(b.score, 64);
  const kaputt = { ...ok, f: (async (url: string) => String(url).includes("grund.de") ? new Response("<p>Grund GmbH</p>", { headers: { "content-type": "text/html" } }) : Response.json({ content: [{ text: "Tut mir leid" }], stop_reason: "end_turn" })) as any };
  await assert.rejects(B.kiBewertung(kaputt.f, "sk", "m", { name: "X" }, null), /unlesbar \(end_turn\): Tut mir leid/);
  const kern = crmKern(testSql());
  const { id } = kern.firmaAnlegen({ name: "Grund GmbH", website: "https://grund.de" }, "Tom");
  const ohneWeb = kern.firmaAnlegen({ name: "Ohne Web GmbH" }, "Tom").id;
  await R.bewerteFirma({ env: ENV(kern, { ANTHROPIC_API_KEY: "sk" }) }, kern.firma(ohneWeb), kaputt.f);
  assert.equal(kern.firma(ohneWeb)!.infos.ki_fehler, "keine Website", "ohne Website keine KI-Kosten");
  await R.bewerteFirma({ env: ENV(kern) }, kern.firma(id), ok.f);
  assert.match(kern.firma(id)!.infos.ki_fehler, /kein KI-Schlüssel/);
  await R.bewerteFirma({ env: ENV(kern, { ANTHROPIC_API_KEY: "sk" }) }, kern.firma(id), kaputt.f);
  assert.match(kern.firma(id)!.infos.ki_fehler, /unlesbar/);
});

test("KI-Antwort: erstes vollständiges Objekt, auch mit Text danach oder abgeschnittenem Rest", () => {
  assert.equal(B.kiJson('{"score": 70, "begruendung": "a } b \\" c"}\nNoch eine Erklärung {abgeschn').score, 70);
  assert.equal(B.kiJson('Vorweg {kaputt} und dann {"score": 12}').score, 12);
  assert.equal(B.kiJson('{"score": 40, "begruendung": "abgeschnitt'), null);
});

/* ---------- Ganz Baden-Württemberg ---------- */
test("BW-Kacheln: 460 Gebiete, Stuttgart zuerst, Viertel decken die Kachel ab, Abfrage ohne Ketten", () => {
  const k = B.bwKacheln();
  assert.equal(k.length, 460);
  assert.deepEqual(k[0], [48.7, 9.15, 48.8, 9.3]);
  assert.equal(new Set(k.map((x) => x.join())).size, 460, "keine doppelt");
  const v = B.vierteln([48.7, 9.15, 48.8, 9.3]);
  assert.deepEqual(v[0], [48.7, 9.15, 48.75, 9.225]);
  assert.deepEqual(v[3], [48.75, 9.225, 48.8, 9.3]);
  const q = B.bwAbfrage(k[0], 200);
  assert.match(q, /\[timeout:90\]\[bbox:48\.7,9\.15,48\.8,9\.3\]/);
  assert.match(q, /area\["ISO3166-2"="DE-BW"\]/);
  assert.match(q, /\[!"brand"\]/);
  assert.match(q, /website\|contact:website\|url\|email/);
  assert.match(q, /out center tags 200;/);
  assert.equal(B.brancheAusTags({ craft: "roofer", shop: "x" }), "Dachdecker");
  assert.equal(B.brancheAusTags({ shop: "toys" }), "Geschäft (toys)");
});

function bwNetz(proKachel: (bbox: string) => any[], extra: Partial<Parameters<typeof netz>[0]> = {}) {
  const basis = netz({ ki: { score: 80, begruendung: "Gut", einstieg: "Hallo", branche: "Physiotherapie" }, ...extra });
  const abfragen: string[] = [];
  const f = (async (url: string, o: any = {}) => {
    if (B.OVERPASS.includes(String(url))) {
      const q = decodeURIComponent(String(o.body).slice(5));
      abfragen.push(q);
      const bbox = q.match(/\[bbox:([^\]]+)\]/)![1];
      return Response.json({ elements: proKachel(bbox) });
    }
    return basis.f(url, o);
  }) as any;
  return { ...basis, f, abfragen };
}

test("BW-Suche: jede Runde eine Kachel, solange wenig wartet; volle Kachel wird geviertelt", async () => {
  const kern = crmKern(testSql()); const env = ENV(kern, { ANTHROPIC_API_KEY: "sk" });
  let id = 0;
  const voll = (bbox: string) => Array.from({ length: bbox === "48.7,9.15,48.8,9.3" ? 200 : 3 }, () => ({ type: "node", id: ++id, tags: { name: "Firma " + id, "healthcare": "physiotherapist", website: `https://f${id}.de`, phone: "0711 " + id } }));
  const n = bwNetz(voll);
  let b: any = await R.geplant(env, Date.parse("2026-11-03T05:10:00Z"), n.f);
  assert.equal(b.suche.treffer, 200);
  assert.equal(b.suche.neu, 200);
  assert.equal(b.suche.voll, true);
  assert.equal(kern.firmen({ q: "Firma 1" }).length > 0, true);
  assert.equal(kern.firma(1)!.branche === "Physiotherapie", true);
  // viele warten → keine neue Suche, nur Bewertung
  b = await R.geplant(env, Date.parse("2026-11-03T05:20:00Z"), n.f);
  assert.equal(b.suche, undefined);
  assert.equal(b.bewertet, 3);
  // Warteschlange leeren → nächste Suche nimmt zuerst ein Viertel der vollen Kachel
  for (const f of kern.zuBewerten(10)) kern.firmaLoeschen(f.id);
  while (kern.wartend() > 0) for (const f of kern.zuBewerten(10)) kern.firmaLoeschen(f.id);
  b = await R.geplant(env, Date.parse("2026-11-03T05:30:00Z"), n.f);
  assert.deepEqual(b.suche.kachel, [48.7, 9.15, 48.75, 9.225]);
  const fs = kern.zustand("bw_fortschritt");
  assert.equal(fs.zeiger, 1);
  assert.equal(fs.gesamt, 460);
  assert.equal(fs.offen_extra, 3);
  // nachts keine Suche
  for (const f of kern.zuBewerten(10)) kern.firmaLoeschen(f.id);
  b = await R.geplant(env, Date.parse("2026-11-03T22:10:00Z"), n.f);
  assert.equal(b.suche, undefined);
});

test("KI-Tagesgrenze: höchstens so viele Bewertungen wie eingestellt", async () => {
  const kern = crmKern(testSql()); const env = ENV(kern, { ANTHROPIC_API_KEY: "sk" });
  kern.einstellungenSetzen({ ki_pro_tag: 4 });
  let id = 0;
  const n = bwNetz(() => Array.from({ length: 20 }, () => ({ type: "node", id: ++id, tags: { name: "Laden " + id, shop: "bakery", website: `https://l${id}.de` } })));
  let b: any = await R.geplant(env, Date.parse("2026-11-03T05:10:00Z"), n.f);
  assert.equal(b.bewertet, 3);
  b = await R.geplant(env, Date.parse("2026-11-03T05:20:00Z"), n.f);
  assert.equal(b.bewertet, 1);
  b = await R.geplant(env, Date.parse("2026-11-03T05:30:00Z"), n.f);
  assert.equal(b.bewertet, "Tagesgrenze erreicht");
  b = await R.geplant(env, Date.parse("2026-11-04T05:10:00Z"), n.f);
  assert.equal(b.bewertet, 3, "am nächsten Tag geht es weiter");
});

test("Impuls-Mails: morgens immer (auch ohne Impulse, mit Bot-Stand), Nachtrag ab 14 Uhr nur mit neuen Impulsen, Knopf jederzeit", async () => {
  const kern = crmKern(testSql()); const env = ENV(kern);
  kern.einstellungenSetzen({ bot_aktiv: true, suchmodus: "branchen", zielbranchen: [], zielregionen: [] });
  const n = netz({}); globalThis.fetch = n.f;
  // Dienstag 8:10: keine Impulse → trotzdem Mail mit Stand
  await R.geplant(env, Date.parse("2026-11-03T07:10:00Z"), n.f);
  let m = n.mails().at(-1);
  assert.match(m.subject, /heute noch keine Anruf-Impulse/);
  assert.match(m.textContent, /Letzte 24 Stunden: 0 Firmen gefunden/);
  // tagsüber kommen zwei Impulse dazu
  for (const name of ["Später A", "Später B"]) { const { id } = kern.firmaAnlegen({ name, telefon: "0711 " + name.length + name.charCodeAt(7) }, "Bot", "bot"); kern.bewertungSpeichern(id, { score: 90, begruendung: "gut" }); }
  const vorher = n.mails().length;
  await R.geplant(env, Date.parse("2026-11-03T11:10:00Z"), n.f);
  assert.equal(n.mails().length, vorher, "um 12 Uhr noch kein Nachtrag");
  await R.geplant(env, Date.parse("2026-11-03T13:10:00Z"), n.f);
  m = n.mails().at(-1);
  assert.match(m.subject, /Nachtrag: 2 neue Anruf-Impulse/);
  assert.match(m.htmlContent, /Später A/);
  await R.geplant(env, Date.parse("2026-11-03T15:10:00Z"), n.f);
  assert.equal(n.mails().length, vorher + 1, "Nachtrag nur einmal");
  // Nachtrag ohne neue Impulse: keine Mail
  await R.geplant(env, Date.parse("2026-11-04T07:10:00Z"), n.f);
  const morgen = n.mails().length;
  await R.geplant(env, Date.parse("2026-11-04T13:10:00Z"), n.f);
  assert.equal(n.mails().length, morgen);
  // Knopf "jetzt": auch am Samstag
  const { id } = kern.firmaAnlegen({ name: "Samstag GmbH", telefon: "0711 777" }, "Bot", "bot"); kern.bewertungSpeichern(id, { score: 95, begruendung: "x" });
  const r = await R.impulseSenden({ env }, kern.einstellungen(), "jetzt", Date.parse("2026-11-07T09:00:00Z"));
  assert.equal(r.neu, 1);
  assert.equal(r.mail, true);
});

/* ---------- GitHub Actions als Sucher ---------- */
async function githubSchluessel(kid = "k1") {
  const paar = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk: any = await crypto.subtle.exportKey("jwk", paar.publicKey);
  const b64u = (b: Uint8Array | string) => Buffer.from(b).toString("base64url");
  const token = async (claims: Record<string, unknown>, k = kid) => {
    const kopf = b64u(JSON.stringify({ alg: "RS256", kid: k, typ: "JWT" }));
    const inhalt = b64u(JSON.stringify(claims));
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", paar.privateKey, new TextEncoder().encode(kopf + "." + inhalt)));
    return kopf + "." + inhalt + "." + b64u(sig);
  };
  const jwks = { keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] };
  return { token, jwks };
}
const jetztS = () => Math.floor(Date.now() / 1000);
const gueltig = () => ({ iss: "https://token.actions.githubusercontent.com", aud: "primedetailing-crm", exp: jetztS() + 300, nbf: jetztS() - 5,
  repository: "nightsck/primedetailing", ref: "refs/heads/main", workflow_ref: "nightsck/primedetailing/.github/workflows/osm-suche.yml@refs/heads/main", run_id: "42" });

test("GitHub-Kennung: echt und passend ja; fremdes Repo, Branch, Workflow, abgelaufen, gefälscht nein", async () => {
  const g = await githubSchluessel("gh-test-1");
  const f = (async (url: string) => { assert.equal(url, "https://token.actions.githubusercontent.com/.well-known/jwks"); return Response.json(g.jwks); }) as any;
  const c = { env: {} };
  assert.deepEqual(await R.githubLaufPruefen(c, "Bearer " + await g.token(gueltig()), f), { ok: true, lauf: "42" });
  const nein = async (aend: Record<string, unknown>, grund: RegExp) => {
    const r = await R.githubLaufPruefen(c, "Bearer " + await g.token({ ...gueltig(), ...aend }), f);
    assert.equal(r.ok, false); assert.match((r as any).grund, grund);
  };
  await nein({ repository: "boese/primedetailing", workflow_ref: "boese/primedetailing/.github/workflows/osm-suche.yml@refs/heads/main" }, /fremdes Repo/);
  await nein({ ref: "refs/pull/3/merge" }, /main-Zweig/);
  await nein({ workflow_ref: "nightsck/primedetailing/.github/workflows/anders.yml@refs/heads/main" }, /Workflow/);
  await nein({ exp: jetztS() - 1 }, /abgelaufen/);
  await nein({ aud: "andere" }, /Zielgruppe/);
  const fremd = await githubSchluessel("gh-test-1");
  assert.match(((await R.githubLaufPruefen(c, "Bearer " + await fremd.token(gueltig()), f)) as any).grund, /Signatur falsch/);
  assert.equal((await R.githubLaufPruefen(c, undefined, f)).ok, false);
  // neuer Schlüssel bei GitHub: wird nachgeladen
  const neu = await githubSchluessel("gh-test-2");
  const f2 = (async () => Response.json({ keys: [...g.jwks.keys, ...neu.jwks.keys] })) as any;
  assert.equal((await R.githubLaufPruefen(c, "Bearer " + await neu.token(gueltig(), "gh-test-2"), f2)).ok, true);
});

test("GitHub-Suche: Aufgabe holen, Ergebnis abliefern, Gebiet weiterschalten; ohne Kennung abgelehnt", async () => {
  const g = await githubSchluessel("gh-test-3");
  const kern = crmKern(testSql()); const env = ENV(kern);
  const echt = globalThis.fetch;
  globalThis.fetch = (async (url: string) => String(url).includes("token.actions") ? Response.json(g.jwks) : new Response("", { status: 404 })) as any;
  try {
    const app = miniApp(); R.crmRouten(app);
    const h = { authorization: "Bearer " + await g.token(gueltig(), "gh-test-3") };
    let r = await app.anfrage("POST", "/api/crm/osm/aufgabe", { env, body: {} });
    assert.equal(r.status, 401, "ohne Kennung");
    r = await app.anfrage("POST", "/api/crm/osm/aufgabe", { env, header: h, body: {} });
    const a = await r.json();
    assert.deepEqual(a.kachel, [48.7, 9.15, 48.8, 9.3]);
    assert.match(a.abfrage, /area\["ISO3166-2"="DE-BW"\]/);
    assert.ok(a.server.length >= 2);
    // falsches Gebiet → 409
    r = await app.anfrage("POST", "/api/crm/osm/ergebnis", { env, header: h, body: { kachel: [1, 2, 3, 4], elements: [] } });
    assert.equal(r.status, 409);
    const elements = [{ type: "node", id: 1, tags: { name: "Physio Mitte", healthcare: "physiotherapist", website: "https://physio.de" } }, { type: "node", id: 2, tags: { name: "Café Eck", amenity: "cafe", email: "a@b.de" } }];
    r = await app.anfrage("POST", "/api/crm/osm/ergebnis", { env, header: h, body: { kachel: a.kachel, elements } });
    const e = await r.json();
    assert.equal(e.bericht.neu, 2);
    assert.equal(kern.firmen({ q: "Physio" })[0].branche, "Physiotherapie");
    assert.equal(kern.zustand("bw_fortschritt").zeiger, 1);
    // nächste Aufgabe ist das nächste Gebiet
    r = await app.anfrage("POST", "/api/crm/osm/aufgabe", { env, header: h, body: {} });
    assert.notDeepEqual((await r.json()).kachel, a.kachel);
    // Server sucht dann 3 Stunden nicht selbst
    const n = netz({}); const b: any = await R.geplant(env, Date.now(), n.f);
    assert.equal(b.suche, undefined);
    // Bot aus → keine Aufgabe
    kern.einstellungenSetzen({ bot_aktiv: false });
    r = await app.anfrage("POST", "/api/crm/osm/aufgabe", { env, header: h, body: {} });
    assert.equal((await r.json()).kachel, null);
  } finally { globalThis.fetch = echt; }
});

test("Click-to-Call: Nummer international, sipgate-Aufruf, ohne sipgate Telefon-Link; Eintrag im Verlauf", async () => {
  assert.equal(R.e164("0711 123456"), "+49711123456");
  assert.equal(R.e164("abc"), null);
  assert.equal(R.e164("0049 711 1"), "+497111");
  const kern = crmKern(testSql()); const n = netz({});
  const aufrufe: any[] = [];
  globalThis.fetch = (async (url: string, o: any = {}) => { if (String(url).includes("sipgate")) { aufrufe.push({ url, o }); return new Response("", { status: 200 }); } return n.f(url, o); }) as any;
  const app = miniApp(); R.crmRouten(app);
  let env: any = ENV(kern);
  const h = await anmelden(app, env, n);
  const { id } = kern.firmaAnlegen({ name: "Ruf an", telefon: "0711 4711" }, "Tom");
  let r = await app.anfrage("POST", `/api/crm/firma/${id}/anrufen`, { env, header: h, body: {} });
  let j = await r.json();
  assert.deepEqual([j.sipgate, j.nummer], [false, "+497114711"]);
  env = ENV(kern, { SIPGATE_TOKEN_ID: "token-1", SIPGATE_TOKEN: "geheim", SIPGATE_GERAET: "e0" });
  r = await app.anfrage("POST", `/api/crm/firma/${id}/anrufen`, { env, header: h, body: {} });
  j = await r.json();
  assert.equal(j.sipgate, true);
  assert.equal(aufrufe[0].url, "https://api.sipgate.com/v2/sessions/calls");
  assert.deepEqual(JSON.parse(aufrufe[0].o.body), { deviceId: "e0", caller: "e0", callee: "+497114711" });
  assert.equal(kern.firma(id)!.kontakte.filter((k: any) => k.code === "gestartet").length, 2);
  assert.equal(kern.wochenbericht("2026-11-02").anrufe, 0, "gestartete Anrufe zählen nicht doppelt");
});
