// Termin-Bot und Anfrage-Chat für Kunden: freie Zeiten, Puffer, Buchung, Absage-Link,
// feste Sicherheitsregeln (immer stärker als die KI), Trennung der Kunden.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
const { app } = await import("../src/app.ts");
const { neuerSpeicher, beispiel, anlegen } = await import("./kunden-hilfe.ts");
const { _reset } = await import("../src/limits.ts");
const { _setKalender } = await import("../src/termin.ts");
const { _setClient } = await import("../src/llm.ts");
const { terminBetriebVon, leseZeitfenster, pruefeSicherheitsregeln } = await import("../src/kunde/umwandeln.ts");
const { stufeEin } = await import("../src/kunden-termin.ts");
// @ts-ignore
const { freieZeiten, zeitpunkt } = await import("../../src/assets/betriebe.js");

const B = "http://chat.test";
const post = (pfad: string, body: any, ip = "4.4.4.4") => app.request(B + pfad, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

/** Kalender im Arbeitsspeicher, einer je Kalender-ID. */
function testKalender() {
  const alle = new Map<string, { id: string; start: number; ende: number; titel: string }[]>();
  let nr = 0;
  _setKalender((kalenderId: string) => {
    if (!kalenderId) return null;
    const liste = alle.get(kalenderId) || []; alle.set(kalenderId, liste);
    return {
      belegt: async (von: number, bis: number) => liste.filter((e) => e.ende > von && e.start < bis).map((e) => ({ start: e.start, ende: e.ende })),
      eintragen: async (e: any) => { const id = "ev" + ++nr; liste.push({ id, start: e.start, ende: e.ende, titel: e.titel }); return id; },
      loeschen: async (id: string) => { const i = liste.findIndex((e) => e.id === id); if (i >= 0) liste.splice(i, 1); },
    };
  });
  return alle;
}
const maler = (extra: any = {}) => beispiel("maler-mueller", "maler", { module: { kundenChat: { aktiv: true }, bewerberChat: { aktiv: true }, anfrageChat: { aktiv: true },
  terminBot: { aktiv: true, kalenderId: "maler@group.calendar.google.com", vorlaufStunden: 0, tageVoraus: 60, ...extra } } });
/** Nächster Montag in mindestens zwei Tagen (damit Vorlauf und „heute“ keine Rolle spielen). */
function naechsterMontag() { const d = new Date(Date.now() + 2 * 86_400_000); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
const BUCHUNG = { termin: "farbberatung", zeit: "09:00", name: "Eva Beispiel", telefon: "0171 5550100", email: "eva@example.org", einwilligung: true };

test("Zeitfenster lesen und Betrieb für die Termin-Rechnung bauen", () => {
  assert.deepEqual(leseZeitfenster("8-12, 13:30-17"), [[480, 720], [810, 1020]]);
  assert.deepEqual(leseZeitfenster(""), []);
  assert.deepEqual(leseZeitfenster("17-8"), [], "Ende vor Anfang zählt nicht");
  const b = terminBetriebVon(maler({ zeiten: { mo: "8-12", di: "", mi: "", do: "", fr: "", sa: "", so: "" }, pufferMin: 15, fahrtMin: 30 }));
  assert.deepEqual(Object.keys(b.zeiten), ["1"]);
  assert.equal(b.puffer, 15); assert.equal(b.fahrt, 30);
  assert.equal(b.termine.find((t: any) => t.id === "besichtigung").dauer, 45);
  assert.equal(terminBetriebVon(maler({ aktiv: false })), null);
  assert.equal(terminBetriebVon(maler({ zeiten: { mo: "", di: "", mi: "", do: "", fr: "", sa: "", so: "" } })), null, "nie geöffnet = nicht buchbar");
});

test("Freie Zeiten: Öffnungszeit, Raster, Puffer nach belegten Terminen, Fahrzeit bei Terminen vor Ort", () => {
  const b = terminBetriebVon(maler({ zeiten: { mo: "8-12", di: "", mi: "", do: "", fr: "", sa: "", so: "" }, pufferMin: 15, fahrtMin: 30, rasterMin: 30 }));
  const mo = naechsterMontag(), jetzt = Date.now();
  const leer = freieZeiten(b, "farbberatung", { von: mo, tage: 1, belegt: [], jetzt })[0];
  assert.deepEqual(leer.slots, ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"], "45 Minuten müssen bis 12 Uhr fertig sein");
  // 9:00–9:45 ist belegt: davor muss der Termin samt 15 Minuten Puffer fertig sein
  const belegt = [{ start: zeitpunkt(mo, 540), ende: zeitpunkt(mo, 585) }];
  assert.deepEqual(freieZeiten(b, "farbberatung", { von: mo, tage: 1, belegt, jetzt })[0].slots, ["08:00", "10:00", "10:30", "11:00"]);
  // Termin beim Kunden: 30 Minuten Fahrt davor und danach
  assert.deepEqual(freieZeiten(b, "besichtigung", { von: mo, tage: 1, belegt, jetzt })[0].slots, ["10:30", "11:00"]);
  assert.equal(freieZeiten(b, "farbberatung", { von: mo, tage: 2, belegt: [], jetzt })[1].slots.length, 0, "Dienstag ist zu");
});

test("Buchen: steht im Kalender, in der Chef-Übersicht und ist danach belegt; Doppelbuchung wird abgelehnt", async () => {
  const s = await neuerSpeicher(); _reset(); const kal = testKalender();
  await anlegen(s, maler()); await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  const mo = naechsterMontag();
  const seite = await app.request(B + "/k/maler-mueller/termin");
  assert.equal(seite.status, 200);
  assert.match(await seite.text(), /"api":"http:\/\/chat\.test\/k\/maler-mueller"/);
  assert.equal((await app.request(B + "/k/elektro-schmidt/termin")).status, 404, "Modul aus");
  let z: any = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${mo}&tage=1`)).json();
  assert.ok(z.ok && z.tage[0].slots.includes("09:00"));

  assert.equal((await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo, einwilligung: false })).status, 400, "ohne Einwilligung");
  assert.equal((await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo, zeit: "03:00" })).status, 409, "außerhalb der Zeiten");
  assert.equal((await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, termin: "besichtigung", datum: mo })).status, 400, "vor Ort ohne Adresse");
  const r: any = await (await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo })).json();
  assert.equal(r.ok, true);
  assert.match(r.wann, /Montag/);
  const eintraege = kal.get("maler@group.calendar.google.com")!;
  assert.equal(eintraege.length, 1);
  assert.equal(eintraege[0].titel, "Farbberatung – Eva Beispiel", "kein [Demo] im Titel");
  const v = await s.vorgaenge("maler-mueller", { art: "termin" });
  assert.equal(v.length, 1);
  assert.match(v[0].titel, /^Farbberatung – Eva Beispiel, Montag/);
  assert.equal(await s.summeMonat("maler-mueller", "termin"), 1);

  z = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${mo}&tage=1`)).json();
  assert.ok(!z.tage[0].slots.includes("09:00"), "gebuchte Zeit ist weg");
  const doppelt = await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo, name: "Zweiter" }, "4.4.4.5");
  assert.equal(doppelt.status, 409);
  assert.equal(((await doppelt.json()) as any).belegt, true);

  // Absagen: erst ansehen, dann absagen; Link gilt nur beim eigenen Kunden
  await anlegen(s, beispiel("elektro-schmidt", "elektro", { module: { kundenChat: { aktiv: true }, terminBot: { aktiv: true, kalenderId: "elektro@group.calendar.google.com" } } }));
  assert.equal((await post("/k/elektro-schmidt/api/termin/absagen", { token: r.token })).status, 400, "fremder Kunde");
  assert.equal(kal.get("maler@group.calendar.google.com")!.length, 1);
  const zeigen: any = await (await post("/k/maler-mueller/api/termin/absagen", { token: r.token, nurZeigen: true })).json();
  assert.match(zeigen.was, /Farbberatung am Montag/);
  assert.equal(kal.get("maler@group.calendar.google.com")!.length, 1, "Ansehen sagt noch nicht ab");
  assert.equal((await post("/k/maler-mueller/api/termin/absagen", { token: r.token })).status, 200);
  assert.equal(kal.get("maler@group.calendar.google.com")!.length, 0);
  assert.equal((await post("/k/maler-mueller/api/termin/absagen", { token: r.token + "x" })).status, 400, "veränderter Link");
  _setKalender(null);
});

test("Ohne erreichbaren Kalender: klare Meldung statt falscher Zeiten", async () => {
  const s = await neuerSpeicher(); _reset(); _setKalender(() => ({ belegt: async () => { throw new Error("403"); }, eintragen: async () => "x", loeschen: async () => {} }));
  await anlegen(s, maler());
  const r = await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung`);
  assert.equal(r.status, 502);
  assert.match(((await r.json()) as any).fehler, /Kalender ist gerade nicht erreichbar/);
  _setKalender(null);
});

test("Sicherheitsregeln: feste Stichworte gelten immer, auch wenn die KI „normal“ sagt", async () => {
  const k = maler();
  assert.equal(pruefeSicherheitsregeln(k, "Bei uns im Keller: WASSER  TRITT AUS der Wand").dringlichkeit, "notfall");
  assert.match(pruefeSicherheitsregeln(k, "Rohrbruch im Bad").hinweise[0], /Haupthahn/);
  assert.equal(pruefeSicherheitsregeln(k, "Wohnzimmer streichen, 20 qm").dringlichkeit, "normal");
  // KI behauptet „normal“ → Regel gewinnt
  _setClient({ messages: { create: async () => ({ content: [{ type: "text", text: '{"dringlichkeit":"normal","grund":"nur Malerarbeiten","zusammenfassung":"Sie möchten eine Wand streichen lassen.","rueckfragen":[]}' }] }) } });
  const a = await stufeEin(k, "Schimmel oder Wasserschaden", "Rohrbruch, das Wasser läuft aus der Decke");
  assert.equal(a.dringlichkeit, "notfall");
  assert.ok(a.hinweise.length >= 1);
  // KI darf erhöhen
  _setClient({ messages: { create: async () => ({ content: [{ type: "text", text: '{"dringlichkeit":"dringend","grund":"Übergabe der Wohnung in drei Tagen","zusammenfassung":"","rueckfragen":["Wie viele Räume?"]}' }] }) } });
  const b = await stufeEin(k, "Räume streichen", "Die Wohnung muss bis Freitag fertig sein");
  assert.equal(b.dringlichkeit, "dringend");
  assert.deepEqual(b.rueckfragen, ["Wie viele Räume?"]);
  // KI fällt aus → Regel allein
  _setClient({ messages: { create: async () => { throw new Error("529"); } } });
  assert.equal((await stufeEin(k, "Fassade", "Es riecht nach Brand, Funken an der Steckdose")).dringlichkeit, "normal", "Maler-Vorlage hat keine Brand-Regel");
  assert.equal((await stufeEin(k, "Wasserschaden", "Wasser tritt aus")).dringlichkeit, "notfall");
  _setClient(null);
});

test("Anfrage-Chat über HTTP: Notfall landet markiert beim richtigen Kunden, Seite zeigt die Regeln", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, maler()); await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  const seite = await (await app.request(B + "/k/maler-mueller/anfrage")).text();
  assert.match(seite, /Schimmel oder Wasserschaden/);
  assert.match(seite, /Rohrbruch/, "Regeln stehen in der Seite, damit der Hinweis sofort erscheint");
  assert.equal((await app.request(B + "/k/elektro-schmidt/anfrage")).status, 404);
  assert.equal((await post("/k/maler-mueller/api/anliegen", { beschreibung: "x", name: "Eva", telefon: "0171 5550100" })).status, 400, "ohne Einwilligung");
  const r: any = await (await post("/k/maler-mueller/api/anliegen", { kategorie: "Schimmel oder Wasserschaden", beschreibung: "Rohrbruch im Keller, Wasser läuft", name: "Eva Beispiel", telefon: "0171 5550100", einwilligung: true })).json();
  assert.equal(r.ok, true);
  assert.equal(r.dringlichkeit, "notfall");
  assert.match(r.hinweise[0], /Haupthahn/);
  assert.equal(r.telefon, "07721 12345");
  const v = await s.vorgaenge("maler-mueller");
  assert.equal(v.length, 1);
  assert.equal(v[0].dringlichkeit, "notfall");
  assert.match(v[0].titel, /^NOTFALL: Schimmel oder Wasserschaden – Eva Beispiel$/);
  assert.equal((await s.vorgaenge("elektro-schmidt")).length, 0);
  const normal: any = await (await post("/k/maler-mueller/api/anliegen", { kategorie: "Räume streichen", beschreibung: "Zwei Zimmer weiß streichen", name: "Jan", email: "jan@example.org", einwilligung: true }, "4.4.4.6")).json();
  assert.equal(normal.dringlichkeit, "normal");
  assert.deepEqual(normal.hinweise, []);
});
