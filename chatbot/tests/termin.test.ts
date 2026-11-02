// Termin-Bot: freie Zeiten, Wunschtermin aus Text, Buchen/Absagen, Google-Anbindung.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
const { app } = await import("../src/app.ts");
const T = await import("../src/termin.ts");
// @ts-ignore
const K = await import("../../src/assets/betriebe.js");
const { BETRIEBE, freieZeiten, zeitpunkt, verstehWunsch, terminZeitraum, isoBerlin, heute } = K as any;

// Montag, 2. November 2026, 8:00 Uhr in Deutschland
const MO = Date.parse("2026-11-02T07:00:00Z");
const ms = (iso: string) => Date.parse(iso);

test("Zeitumstellung: 8 Uhr deutscher Zeit im Sommer und Winter", () => {
  assert.equal(new Date(zeitpunkt("2026-03-29", 480)).toISOString(), "2026-03-29T06:00:00.000Z");
  assert.equal(new Date(zeitpunkt("2026-03-28", 480)).toISOString(), "2026-03-28T07:00:00.000Z");
  assert.equal(new Date(zeitpunkt("2026-10-25", 480)).toISOString(), "2026-10-25T07:00:00.000Z");
  assert.equal(isoBerlin(ms("2026-07-01T10:30:00Z")), "2026-07-01T12:30:00+02:00");
  assert.equal(heute(ms("2026-11-02T23:30:00Z")), "2026-11-03");
});

test("Freie Zeiten: Öffnungszeiten, Vorlauf, Sonntag zu, Samstag kurz", () => {
  const tage = freieZeiten(BETRIEBE.fahrzeug, "aussen", { von: "2026-11-02", tage: 7, jetzt: MO });
  const mo = tage[0], di = tage[1], sa = tage[5], so = tage[6];
  assert.equal(mo.slots.length, 0, "heute nichts mehr wegen 14 Stunden Vorlauf");
  assert.equal(di.slots[0], "08:00");
  assert.equal(di.slots[di.slots.length - 1], "16:00");
  assert.equal(di.slots.length, 17);
  assert.deepEqual([sa.slots[0], sa.slots[sa.slots.length - 1]], ["09:00", "12:00"]);
  assert.equal(so.offen, false);
  assert.equal(so.slots.length, 0);
});

test("Freie Zeiten: belegte Zeit plus Puffer fällt weg", () => {
  const belegt = [{ start: zeitpunkt("2026-11-03", 600), ende: zeitpunkt("2026-11-03", 660) }]; // Di 10–11 Uhr
  const di = freieZeiten(BETRIEBE.fahrzeug, "aussen", { von: "2026-11-03", tage: 1, belegt, jetzt: MO })[0];
  for (const weg of ["09:00", "09:30", "10:00", "10:30"]) assert.ok(!di.slots.includes(weg), weg);
  for (const da of ["08:00", "08:30", "11:00"]) assert.ok(di.slots.includes(da), da);
});

test("Termin beim Kunden plant die Fahrzeit davor und danach ein", () => {
  const belegt = [{ start: zeitpunkt("2026-11-04", 600), ende: zeitpunkt("2026-11-04", 660) }]; // Mi 10–11
  const mi = freieZeiten(BETRIEBE.maler, "besichtigung", { von: "2026-11-04", tage: 1, belegt, jetzt: MO })[0];
  assert.ok(!mi.slots.includes("09:00"), "9:00–9:45 + 30 Min Fahrt + 15 Puffer stößt an 10 Uhr");
  assert.ok(mi.slots.includes("08:30"));
  assert.ok(!mi.slots.includes("11:00"), "direkt nach einem Termin braucht es Fahrzeit");
  assert.ok(mi.slots.includes("11:30"));
  assert.equal(mi.slots[mi.slots.length - 1], "14:00", "Besichtigungen nur bis 15 Uhr");
});

test("Ganztägige Termine: Keramik ab Samstag geht bis Montag, Sonntag wird übersprungen", () => {
  const z = terminZeitraum(BETRIEBE.fahrzeug, "keramik", "2026-11-07");
  assert.equal(new Date(z.start).toISOString(), "2026-11-07T08:00:00.000Z");
  assert.equal(new Date(z.ende).toISOString(), "2026-11-09T16:00:00.000Z");
  const belegt = [{ start: zeitpunkt("2026-11-09", 600), ende: zeitpunkt("2026-11-09", 630) }];
  const sa = freieZeiten(BETRIEBE.fahrzeug, "keramik", { von: "2026-11-07", tage: 1, belegt, jetzt: MO })[0];
  assert.deepEqual(sa.slots, []);
  assert.equal(terminZeitraum(BETRIEBE.fahrzeug, "keramik", "2026-11-08"), null, "sonntags kein Start");
});

test("Wunschtermin aus freiem Text", () => {
  assert.deepEqual(verstehWunsch("Dienstag nachmittag", MO), { datum: "2026-11-03", teil: "nachmittag", ab: null });
  assert.deepEqual(verstehWunsch("morgen früh", MO), { datum: "2026-11-03", teil: "vormittag", ab: null });
  assert.equal(verstehWunsch("Montag", MO).datum, "2026-11-09");
  assert.equal(verstehWunsch("nächste Woche", MO).datum, "2026-11-09");
  assert.equal(verstehWunsch("geht der 14.11.?", MO).datum, "2026-11-14");
  assert.equal(verstehWunsch("am 3.1.", MO).datum, "2027-01-03");
  assert.equal(verstehWunsch("übermorgen um 14 Uhr", MO).ab, 840);
  assert.equal(verstehWunsch("so schnell wie möglich", MO), null);
  assert.equal(verstehWunsch("Was kostet das?", MO), null);
});

/* ---------- Schnittstellen ---------- */
const json = (pfad: string, body: any, ip = "40.0.0.1") => app.request(pfad, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
const naechsterDienstag = () => { let d = heute(); for (let i = 1; i < 9; i++) { const x = new Date(Date.parse(d + "T12:00:00Z") + i * 864e5); if (x.getUTCDay() === 2) return x.toISOString().slice(0, 10); } return d; };
const gueltig = (extra: any = {}) => ({ betrieb: "fahrzeug", termin: "aussen", datum: naechsterDienstag(), zeit: "10:00", name: "Alex Test", telefon: "0170 1234567", einwilligung: true, ...extra });

test("Ohne Kalender: Zeiten und Buchen melden kalender:false", async () => {
  T._setKalender(null);
  const z = await (await app.request("/api/demo/termin/zeiten?betrieb=maler&termin=besichtigung")).json();
  assert.deepEqual(z, { ok: true, kalender: false });
  const b = await (await json("/api/demo/termin/buchen", gueltig(), "40.0.0.2")).json();
  assert.deepEqual(b, { ok: true, kalender: false });
  assert.equal((await app.request("/api/demo/termin/zeiten?betrieb=x&termin=y")).status, 400);
});

test("Buchen prüft die Eingaben", async () => {
  const fehler = async (x: any) => (await (await json("/api/demo/termin/buchen", gueltig(x), "40.0.0.3")).json()).fehler;
  assert.match(await fehler({ name: "" }), /Namen/);
  assert.match(await fehler({ telefon: "", email: "" }), /Telefon oder E-Mail/);
  assert.match(await fehler({ telefon: "12" }), /zu kurz/);
  assert.match(await fehler({ email: "a@b", telefon: "" }), /E-Mail/);
  assert.match(await fehler({ einwilligung: false }), /zustimmen/);
  assert.match(await fehler({ zeit: "25:00" }), /Uhrzeit/);
  assert.match(await fehler({ betrieb: "elektro", termin: "kundendienst" }), /Adresse/);
  assert.match(await fehler({ betrieb: "elektro", termin: "kundendienst", adresse: { strasse: "Weg 1", plz: "123", ort: "X" } }), /Adresse/);
});

function speicherKalender() {
  const events: any[] = [];
  const kal: any = {
    events,
    async belegt(von: number, bis: number) { return events.filter((e) => e.ende > von && e.start < bis).map((e) => ({ start: e.start, ende: e.ende })); },
    async eintragen(e: any) { const id = "ev" + events.length; events.push({ ...e, id }); return id; },
    async loeschen(id: string) { const i = events.findIndex((e) => e.id === id); if (i >= 0) events.splice(i, 1); },
  };
  return kal;
}

test("Mit Kalender: buchen, doppelt buchen geht nicht, absagen", async () => {
  const kal = speicherKalender();
  T._setKalender(() => kal);
  const z = await (await app.request(`/api/demo/termin/zeiten?betrieb=fahrzeug&termin=aussen&von=${naechsterDienstag()}&tage=1`)).json();
  assert.equal(z.kalender, true);
  assert.ok(z.tage[0].slots.includes("10:00"));

  const r = await (await json("/api/demo/termin/buchen", gueltig({ notiz: "Bitte\nklingeln" }), "40.0.0.4")).json();
  assert.equal(r.ok, true); assert.equal(r.kalender, true); assert.ok(r.token);
  assert.equal(kal.events.length, 1);
  assert.match(kal.events[0].titel, /^\[Demo\] Außenwäsche – Alex Test/);
  assert.match(kal.events[0].text, /Telefon: 0170 1234567/);
  assert.match(kal.events[0].text, /Notiz vom Kunden: Bitte klingeln/);

  const doppelt = await json("/api/demo/termin/buchen", gueltig({ zeit: "10:30" }), "40.0.0.5");
  assert.equal(doppelt.status, 409, "10:30 überschneidet sich mit 10:00 plus Puffer");

  const z2 = await (await app.request(`/api/demo/termin/zeiten?betrieb=fahrzeug&termin=aussen&von=${naechsterDienstag()}&tage=1`)).json();
  assert.ok(!z2.tage[0].slots.includes("10:00"));

  assert.equal((await json("/api/demo/termin/absagen", { token: r.token + "x" })).status, 400);
  const a = await (await json("/api/demo/termin/absagen", { token: r.token })).json();
  assert.equal(a.ok, true);
  assert.equal(kal.events.length, 0);
  T._setKalender(null);
});

test("Kalender nicht erreichbar: verständlicher Fehler statt Absturz", async () => {
  T._setKalender(() => ({ async belegt() { throw new Error("weg"); }, async eintragen() { return ""; }, async loeschen() {} }));
  const r = await app.request("/api/demo/termin/zeiten?betrieb=fahrzeug&termin=aussen");
  assert.equal(r.status, 502);
  assert.equal((await r.json()).fehler, "kalender");
  T._setKalender(null);
});

test("Google: Anmeldung per Dienstkonto, freie Zeiten lesen, Termin eintragen", async () => {
  const paar = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", paar.privateKey));
  const pem = "-----BEGIN PRIVATE KEY-----\n" + Buffer.from(der).toString("base64").match(/.{1,64}/g)!.join("\n") + "\n-----END PRIVATE KEY-----\n";
  const sa = T.leseDienstkonto(JSON.stringify({ type: "service_account", client_email: "bot@test.iam.gserviceaccount.com", private_key: pem }));
  assert.ok(sa);
  assert.equal(T.leseDienstkonto("{}"), null);
  assert.equal(T.leseDienstkonto("kaputt"), null);

  const aufrufe: any[] = [];
  const echtesFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url); aufrufe.push({ u, init });
    if (u.startsWith("https://oauth2.googleapis.com/token")) {
      const jwt = new URLSearchParams(String(init.body)).get("assertion")!;
      const [k, i, s] = jwt.split(".");
      const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", paar.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(k + "." + i));
      const inhalt = JSON.parse(Buffer.from(i, "base64url").toString());
      assert.ok(ok, "Signatur stimmt");
      assert.equal(inhalt.iss, "bot@test.iam.gserviceaccount.com");
      assert.equal(inhalt.scope, "https://www.googleapis.com/auth/calendar");
      return new Response(JSON.stringify({ access_token: "tok123", expires_in: 3600 }), { status: 200 });
    }
    assert.equal(init.headers.Authorization, "Bearer tok123");
    if (u.endsWith("/freeBusy")) {
      const b = JSON.parse(init.body);
      return new Response(JSON.stringify({ calendars: { [b.items[0].id]: { busy: [{ start: "2026-11-03T09:00:00Z", end: "2026-11-03T10:00:00Z" }] } } }), { status: 200 });
    }
    if (u.includes("/events")) {
      const b = JSON.parse(init.body);
      assert.equal(b.start.timeZone, "Europe/Berlin");
      assert.equal(b.start.dateTime, "2026-11-03T08:00:00+01:00");
      return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as any;
  try {
    const kal = T.googleKalender(sa!, "kal@group.calendar.google.com");
    const belegt = await kal.belegt(ms("2026-11-03T00:00:00Z"), ms("2026-11-04T00:00:00Z"));
    assert.deepEqual(belegt, [{ start: ms("2026-11-03T09:00:00Z"), ende: ms("2026-11-03T10:00:00Z") }]);
    const id = await kal.eintragen({ titel: "t", text: "x", ort: "o", start: zeitpunkt("2026-11-03", 480), ende: zeitpunkt("2026-11-03", 540), privat: {} });
    assert.equal(id, "abc");
    assert.equal(aufrufe.filter((a) => a.u.includes("oauth2")).length, 1, "Zugang wird wiederverwendet");
    assert.ok(aufrufe.some((a) => a.u.includes(encodeURIComponent("kal@group.calendar.google.com"))));
  } finally { globalThis.fetch = echtesFetch; }
});
