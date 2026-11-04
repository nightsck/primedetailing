// Telefon-Bot (Sprach-KI): Schlüssel, freie Zeiten aus Wünschen, Buchen in den Kalender, Rückruf per Mail.
// Läuft ohne Fremdpakete (eigener Mini-Router statt Hono).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "test-geheimnis";
const S = await import("../src/stimme.ts");
const T = await import("../src/termin.ts");
// @ts-ignore
const { BETRIEBE, zeitpunkt } = (await import("../../src/assets/betriebe.js")) as any;

// Montag, 2. November 2026, 8:00 Uhr in Deutschland
const MO = Date.parse("2026-11-02T07:00:00Z");
const SCHLUESSEL = "s".repeat(32);

function miniApp() {
  const routen: { m: string; pfad: string; h: Function }[] = [];
  const app: any = { post: (pfad: string, h: Function) => routen.push({ m: "POST", pfad, h }), get: () => {} };
  app.rufe = async (pfad: string, body: any, env: any, schluessel = SCHLUESSEL) => {
    const r = routen.find((x) => x.pfad === pfad)!;
    const roh = JSON.stringify(body);
    const kopf: Record<string, string> = { "x-stimme-schluessel": schluessel, "content-length": String(roh.length) };
    const c = { env, req: { header: (k: string) => kopf[k.toLowerCase()], json: async () => JSON.parse(roh) },
      json: (d: any, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } }) };
    const antwort: Response = await r.h(c);
    return { status: antwort.status, j: await antwort.json() as any };
  };
  S.stimmeRouten(app);
  return app;
}
function testKalender() {
  const eintraege: any[] = [];
  const belegt: { start: number; ende: number }[] = [];
  const kal = {
    belegt: async () => [...belegt, ...eintraege.map((e) => ({ start: e.start, ende: e.ende }))],
    eintragen: async (e: any) => { eintraege.push(e); return "ev" + eintraege.length; },
    loeschen: async () => {},
  };
  return { kal, eintraege, belegt };
}

test("Schlüssel: ohne Einrichtung aus, falscher Schlüssel abgelehnt", async () => {
  const app = miniApp();
  assert.equal((await app.rufe("/api/stimme/info", {}, {})).status, 503);
  assert.equal((await app.rufe("/api/stimme/info", {}, { STIMME_SCHLUESSEL: SCHLUESSEL }, "falsch")).status, 401);
  const r = await app.rufe("/api/stimme/info", {}, { STIMME_SCHLUESSEL: SCHLUESSEL, STIMME_BETRIEB: "maler" });
  assert.equal(r.status, 200);
  assert.equal(r.j.betrieb.id, "maler");
  assert.ok(r.j.betrieb.terminarten.some((t: any) => t.id === "besichtigung" && t.ort === "beim Kunden vor Ort"));
});

test("Vorschläge: höchstens drei Zeiten je Tag, Wunsch Vormittag/Nachmittag/Uhrzeit, Belegtes fällt weg", () => {
  const b = BETRIEBE.fahrzeug;
  let v = S.vorschlaege(b, "aussen", { jetzt: MO });
  assert.equal(v.tage.length, 2);
  assert.equal(v.tage[0].datum, "2026-11-03", "heute wegen Vorlauf nichts mehr");
  assert.deepEqual(v.tage[0].zeiten, ["08:00", "12:00", "16:00"]);
  v = S.vorschlaege(b, "aussen", { wunsch: "Donnerstag nachmittag", jetzt: MO });
  assert.equal(v.tage[0].datum, "2026-11-05");
  assert.ok(v.tage[0].zeiten.every((z: string) => z >= "12:00"));
  v = S.vorschlaege(b, "aussen", { wunsch: "morgen gegen 10 Uhr", jetzt: MO });
  assert.deepEqual(v.tage[0].zeiten, ["09:30", "10:00", "10:30"]);
  const belegt = [{ start: zeitpunkt("2026-11-03", 480), ende: zeitpunkt("2026-11-03", 1020) }];
  v = S.vorschlaege(b, "aussen", { datum: "2026-11-03", belegt, jetzt: MO });
  assert.equal(v.tage[0].datum, "2026-11-04", "Dienstag ganz belegt → Mittwoch");
  assert.deepEqual(S.verteilt(["a", "b"], 3), ["a", "b"]);
});

test("Buchen: ohne Zustimmung nicht, dann Eintrag im Kalender, doppelt nicht", async () => {
  const k = testKalender();
  T._setKalender(() => k.kal as any);
  try {
    const app = miniApp();
    const env = { STIMME_SCHLUESSEL: SCHLUESSEL };
    const zeiten = await app.rufe("/api/stimme/zeiten", { termin: "aussen", wunsch: "nächste Woche Montag" }, env);
    assert.equal(zeiten.j.ok, true);
    assert.match(zeiten.j.sagen, /Frei wäre am Montag/);
    const tag = zeiten.j.tage[0];
    const daten = { termin: "aussen", datum: tag.datum, zeit: tag.zeiten[0], name: "Erika Muster", telefon: "+49 151 12345678", anliegen: "VW Golf, stark verschmutzt" };
    let r = await app.rufe("/api/stimme/buchen", daten, env);
    assert.equal(r.j.ok, false);
    assert.match(r.j.sagen, /speichern/);
    r = await app.rufe("/api/stimme/buchen", { ...daten, einwilligung: true }, env);
    assert.equal(r.j.ok, true, JSON.stringify(r.j));
    assert.match(r.j.sagen, /Ihr Termin steht: Außenwäsche am Montag/);
    assert.equal(k.eintraege.length, 1);
    assert.match(k.eintraege[0].text, /gebucht über den Telefon-Bot/);
    assert.equal(k.eintraege[0].privat.quelle, "telefon-bot");
    r = await app.rufe("/api/stimme/buchen", { ...daten, einwilligung: true }, env);
    assert.equal(r.j.belegt, true, "gleiche Zeit ist jetzt weg");
    assert.match(r.j.sagen, /vergeben/);
    // Uhrzeit wie gesprochen: „9“ → 09:00
    r = await app.rufe("/api/stimme/buchen", { ...daten, zeit: "9", einwilligung: true }, env);
    assert.equal(r.j.ok, true, JSON.stringify(r.j));
  } finally { T._setKalender(null); }
});

test("Rückruf: Nummer nötig, Mail an den Betrieb", async () => {
  const mails: any[] = [];
  const alt = globalThis.fetch;
  globalThis.fetch = (async (url: string, o: any) => { mails.push({ url, body: JSON.parse(o.body) }); return new Response("{}", { status: 201 }); }) as any;
  try {
    const app = miniApp();
    const env = { STIMME_SCHLUESSEL: SCHLUESSEL, BREVO_API_KEY: "x", MAIL_ABSENDER: "termine@primedetailing.eu", TERMIN_MAIL_BETRIEB: "support@primedetailing.eu" };
    let r = await app.rufe("/api/stimme/rueckruf", { name: "Max" }, env);
    assert.equal(r.j.ok, false);
    r = await app.rufe("/api/stimme/rueckruf", { name: "Max", telefon: "0711 123456", anliegen: "Delle in der Tür", dringend: true }, env);
    assert.equal(r.j.ok, true);
    assert.equal(r.j.mail, true);
    assert.match(mails[0].body.subject, /DRINGEND: Rückruf erbeten: Max/);
    assert.match(mails[0].body.textContent, /Delle in der Tür/);
  } finally { globalThis.fetch = alt; }
});
