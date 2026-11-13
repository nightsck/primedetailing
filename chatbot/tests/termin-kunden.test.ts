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
const { kommendeFeiertage } = await import("../src/feiertage.ts");
// @ts-ignore
const { freieZeiten, zeitpunkt, plusTage } = await import("../../src/assets/betriebe.js");

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

test("Feiertage: der Tag wird als geschlossen angezeigt und die Buchung abgelehnt – auch ohne die Anzeige", async () => {
  const s = await neuerSpeicher(); _reset(); testKalender();
  await anlegen(s, maler());
  await anlegen(s, beispiel("sachsen-maler", "maler", {
    stammdaten: { firmenname: "Maler Sachsen", email: "info@sachsen-maler.de", brancheText: "Malerbetrieb", oeffnungszeiten: "Mo–Fr 7–16 Uhr", bundesland: "sn" },
    rechtliches: { datenschutzUrl: "https://www.sachsen-maler.de/datenschutz" },
    module: { kundenChat: { aktiv: true }, terminBot: { aktiv: true, kalenderId: "sn@group.calendar.google.com", vorlaufStunden: 0 } } }));
  const heute = new Date().toISOString().slice(0, 10);

  // Nächster bundesweiter Feiertag, der auf einen Werktag Mo–Fr fällt (da ist der Maler offen).
  const feier = kommendeFeiertage(heute, "", 12).find((f) => { const d = new Date(f.datum + "T12:00:00Z").getUTCDay(); return d >= 1 && d <= 5; })!;
  assert.ok(feier, "es gibt einen kommenden Feiertag an einem Werktag");

  const z: any = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${feier.datum}&tage=1`)).json();
  assert.equal(z.tage[0].offen, false, "Feiertag ist zu");
  assert.deepEqual(z.tage[0].slots, []);
  assert.equal(z.tage[0].feiertag, feier.name, "der Grund steht dabei");

  // Buchung über die API: auch ein alter Tab oder ein gebastelter Aufruf kommt nicht durch.
  const r = await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: feier.datum });
  assert.equal(r.status, 400);
  assert.match(((await r.json()) as any).fehler, new RegExp(feier.name));

  // Landesfeiertag: gilt nur im eigenen Bundesland. Buß- und Bettag ist nur in Sachsen frei.
  const bub = kommendeFeiertage(heute, "sn", 24).find((f) => f.name.startsWith("Buß"))!;
  assert.ok(bub, "Buß- und Bettag liegt in den nächsten zwei Jahren");
  assert.equal((await post("/k/sachsen-maler/api/termin/buchen", { ...BUCHUNG, datum: bub.datum }, "4.4.4.9")).status, 400, "in Sachsen zu");
  const andernorts = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${bub.datum}&tage=1`)).json() as any;
  assert.equal(andernorts.tage[0].feiertag, undefined, "woanders ein normaler Arbeitstag");
  _setKalender(null);
});

test("Ohne Google Kalender: der Bot verwaltet die Zeiten selbst (Outlook, Apple, Papier)", async () => {
  const s = await neuerSpeicher(); _reset(); _setKalender(null);
  // Termin-Bot an, aber keine Kalender-ID
  await anlegen(s, beispiel("maler-mueller", "maler", { module: { kundenChat: { aktiv: true },
    terminBot: { aktiv: true, kalenderId: "", vorlaufStunden: 0, tageVoraus: 60 } } }));
  const mo = naechsterMontag();

  let z: any = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${mo}&tage=1`)).json();
  assert.ok(z.ok && z.tage[0].slots.includes("09:00"), "freie Zeiten auch ohne Google");

  const r: any = await (await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo })).json();
  assert.equal(r.ok, true);
  // Der Block liegt in unserem Speicher und die Zeit ist danach weg
  const bloecke = await s.terminBelegt("maler-mueller", Date.now(), Date.now() + 90 * 86_400_000);
  assert.equal(bloecke.length, 1);
  assert.match(bloecke[0].titel, /Farbberatung – Eva Beispiel/);
  z = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${mo}&tage=1`)).json();
  assert.ok(!z.tage[0].slots.includes("09:00"), "gebuchte Zeit ist weg");
  assert.equal((await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo, name: "Zweiter" }, "4.4.4.6")).status, 409, "keine Doppelbuchung");
  // In der Chef-Übersicht steht der Termin wie immer
  assert.equal((await s.vorgaenge("maler-mueller", { art: "termin" })).length, 1);
  // Nur der eigene Kunde kommt an den Block: ein zweiter Kunde sieht nichts
  assert.deepEqual(await s.terminBelegt("elektro-schmidt", Date.now(), Date.now() + 90 * 86_400_000), []);
  // Absagen gibt die Zeit wieder frei
  assert.equal((await post("/k/maler-mueller/api/termin/absagen", { token: r.token })).status, 200);
  assert.deepEqual(await s.terminBelegt("maler-mueller", Date.now(), Date.now() + 90 * 86_400_000), []);
  z = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${mo}&tage=1`)).json();
  assert.ok(z.tage[0].slots.includes("09:00"), "wieder frei");
});

test("Anfrage statt Buchung: der Betrieb bestätigt, erst dann steht der Termin", async () => {
  const s = await neuerSpeicher(); _reset(); const kal = testKalender();
  await anlegen(s, maler({ bestaetigen: true, bestaetigenStunden: 48 }));
  const mo = naechsterMontag();
  const KAL = "maler@group.calendar.google.com";

  // Die Seite fragt an statt zu buchen
  const seite = await (await app.request(`${B}/k/maler-mueller/termin`)).text();
  assert.match(seite, /Termin anfragen/);
  assert.match(seite, /bestätigen den Termin per E-Mail/);

  const r: any = await (await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo })).json();
  assert.equal(r.ok, true);
  assert.equal(r.angefragt, true, "keine Zusage");
  assert.equal((kal.get(KAL) || []).length, 0, "noch nichts im Kalender");

  // Die Zeit ist vorgemerkt: niemand kann sie ein zweites Mal anfragen
  const vor = await s.vormerkungen("maler-mueller", Date.now(), Date.now() + 90 * 86_400_000);
  assert.equal(vor.length, 1);
  let z: any = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${mo}&tage=1`)).json();
  assert.ok(!z.tage[0].slots.includes("09:00"), "vorgemerkte Zeit ist weg");
  assert.equal((await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: mo, name: "Zweiter" }, "4.4.4.7")).status, 409);
  // In der Chef-Übersicht steht die Anfrage als solche
  const v = await s.vorgaenge("maler-mueller", { art: "termin" });
  assert.equal(v[0].status, "angefragt");
  assert.match(v[0].titel, /^Angefragt: Farbberatung/);

  // Der Entscheid-Link: fremde Kunden und kaputte Links kommen nicht durch
  const { entscheidToken, absageToken } = await import("../src/termin.ts");
  const token = await entscheidToken({ b: "maler-mueller", v: vor[0].id });
  await anlegen(s, beispiel("elektro-schmidt", "elektro", { module: { kundenChat: { aktiv: true }, terminBot: { aktiv: true, kalenderId: "elektro@group.calendar.google.com" } } }));
  assert.equal((await post("/k/elektro-schmidt/api/termin/entscheiden", { token })).status, 400, "fremder Kunde");
  assert.equal((await post("/k/maler-mueller/api/termin/entscheiden", { token: token + "x" })).status, 400, "veränderter Link");
  // Ein Absage-Link kann keine Anfrage bestätigen (eigener Schlüssel je Zweck)
  const fremd = await absageToken({ b: "maler-mueller", e: vor[0].id, s: Date.now() + 86_400_000 });
  assert.equal((await post("/k/maler-mueller/api/termin/entscheiden", { token: fremd })).status, 400, "falscher Zweck");

  // Erst zeigen (damit kein Mail-Scanner bestätigt), dann bestätigen
  const zeigen: any = await (await post("/k/maler-mueller/api/termin/entscheiden", { token, nurZeigen: true })).json();
  assert.equal(zeigen.anfrage.name, "Eva Beispiel");
  assert.match(zeigen.anfrage.wann, /Montag/);
  assert.equal((kal.get(KAL) || []).length, 0, "Ansehen trägt nichts ein");

  const ja: any = await (await post("/k/maler-mueller/api/termin/entscheiden", { token, entscheidung: "ja" })).json();
  assert.equal(ja.entscheidung, "ja");
  assert.equal(kal.get(KAL)!.length, 1, "jetzt steht er im Kalender");
  assert.equal(kal.get(KAL)![0].titel, "Farbberatung – Eva Beispiel");
  assert.equal((await s.vorgaenge("maler-mueller", { art: "termin" }))[0].status, "bestätigt");
  assert.deepEqual(await s.vormerkungen("maler-mueller", Date.now(), Date.now() + 90 * 86_400_000), [], "Vormerkung ist aufgelöst");
  // Zweimal bestätigen geht nicht
  assert.equal((await post("/k/maler-mueller/api/termin/entscheiden", { token, entscheidung: "ja" })).status, 410);

  // Ablehnen gibt die Zeit wieder frei
  const di = plusTage(mo, 2);
  const r2: any = await (await post("/k/maler-mueller/api/termin/buchen", { ...BUCHUNG, datum: di, zeit: "10:00", name: "Zweite Anfrage" }, "4.4.4.8")).json();
  assert.equal(r2.angefragt, true);
  const vor2 = await s.vormerkungen("maler-mueller", Date.now(), Date.now() + 90 * 86_400_000);
  assert.equal(vor2.length, 1);
  const nein: any = await (await post("/k/maler-mueller/api/termin/entscheiden", { token: await entscheidToken({ b: "maler-mueller", v: vor2[0].id }), entscheidung: "nein" })).json();
  assert.equal(nein.entscheidung, "nein");
  assert.equal(kal.get(KAL)!.length, 1, "nichts dazugekommen");
  assert.deepEqual(await s.vormerkungen("maler-mueller", Date.now(), Date.now() + 90 * 86_400_000), []);
  z = await (await app.request(`${B}/k/maler-mueller/api/termin/zeiten?termin=farbberatung&von=${di}&tage=1`)).json();
  assert.ok(z.tage[0].slots.includes("10:00"), "wieder frei");
  assert.equal((await s.vorgaenge("maler-mueller", { art: "termin" }))[0].status, "abgelehnt");
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
