// Gesetzliche Feiertage: bundesweit und je Bundesland.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ostern, feiertagAm, feiertage, kommendeFeiertage, LAENDER } from "../src/feiertage.ts";

test("Ostersonntag stimmt", () => {
  const erwartet: Record<number, string> = {
    2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28", 2028: "2028-04-16", 2030: "2030-04-21",
  };
  for (const [jahr, datum] of Object.entries(erwartet)) assert.equal(ostern(Number(jahr)).toISOString().slice(0, 10), datum, jahr);
});

test("Bundesweite Feiertage gelten überall", () => {
  // 2026: Karfreitag 3.4., Ostermontag 6.4., Himmelfahrt 14.5., Pfingstmontag 25.5.
  for (const [datum, name] of [["2026-01-01", "Neujahr"], ["2026-04-03", "Karfreitag"], ["2026-04-06", "Ostermontag"],
    ["2026-05-01", "Tag der Arbeit"], ["2026-05-14", "Christi Himmelfahrt"], ["2026-05-25", "Pfingstmontag"],
    ["2026-10-03", "Tag der Deutschen Einheit"], ["2026-12-25", "1. Weihnachtsfeiertag"], ["2026-12-26", "2. Weihnachtsfeiertag"]]) {
    assert.equal(feiertagAm(datum, ""), name, datum);
    assert.equal(feiertagAm(datum, "ni"), name, datum + " in Niedersachsen");
  }
  assert.equal(feiertagAm("2026-04-05", ""), null, "Ostersonntag ist kein bundesweiter Feiertag");
  assert.equal(feiertagAm("2026-11-20", "bw"), null, "normaler Freitag");
});

test("Feiertage je Bundesland", () => {
  // Baden-Württemberg (Toms Land): Drei Könige, Fronleichnam, Allerheiligen
  assert.equal(feiertagAm("2026-01-06", "bw"), "Heilige Drei Könige");
  assert.equal(feiertagAm("2026-06-04", "bw"), "Fronleichnam", "Ostern 5.4. + 60 Tage");
  assert.equal(feiertagAm("2026-11-01", "bw"), "Allerheiligen");
  // In Niedersachsen gilt davon keiner, dafür der Reformationstag
  for (const d of ["2026-01-06", "2026-06-04", "2026-11-01"]) assert.equal(feiertagAm(d, "ni"), null, d);
  assert.equal(feiertagAm("2026-10-31", "ni"), "Reformationstag");
  assert.equal(feiertagAm("2026-10-31", "bw"), null);
  // Buß- und Bettag nur in Sachsen: Mittwoch vor dem 23.11.
  assert.equal(feiertagAm("2026-11-18", "sn"), "Buß- und Bettag");
  assert.equal(feiertagAm("2026-11-18", "bw"), null);
  // Brandenburg hat Oster- und Pfingstsonntag
  assert.equal(feiertagAm("2026-04-05", "bb"), "Ostersonntag");
  // Jedes Bundesland ergibt eine sinnvolle Menge
  for (const land of Object.keys(LAENDER) as (keyof typeof LAENDER)[]) {
    const n = feiertage(2026, land).size;
    assert.ok(n >= 9 && n <= 14, `${land}: ${n} Feiertage`);
  }
});

test("Kommende Feiertage, auch über den Jahreswechsel", () => {
  const k = kommendeFeiertage("2026-12-20", "bw", 3);
  assert.deepEqual(k.map((f) => f.datum), ["2026-12-25", "2026-12-26", "2027-01-01"]);
  assert.equal(kommendeFeiertage("2026-12-20", "", 99).length > 9, true);
  assert.deepEqual(kommendeFeiertage("quatsch", "bw"), []);
  assert.equal(feiertagAm("1800-01-01", "bw"), null, "außerhalb des sinnvollen Bereichs");
});

test("Wissensbasis nennt das heutige Datum und die nächsten Feiertage – ohne zu behaupten, ob geöffnet ist", async () => {
  const { wissenVon, laufzeitVon } = await import("../src/kunde/umwandeln.ts");
  const { beispiel } = await import("./kunden-hilfe.ts");
  const bayer = beispiel("maler-bayern", "maler", {
    stammdaten: { firmenname: "Maler Bayern", email: "info@maler-bayern.de", brancheText: "Malerbetrieb", oeffnungszeiten: "Mo–Fr 7–16 Uhr", bundesland: "by" },
    rechtliches: { datenschutzUrl: "https://www.maler-bayern.de/datenschutz" },
  });
  const w = wissenVon(bayer);
  assert.match(w, /## Datum und Feiertage/);
  assert.match(w, /- Heute ist (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. \w+ \d{4}\./);
  assert.match(w, /An gesetzlichen Feiertagen werden keine Termine vergeben/);
  assert.match(w, /Ob der Betrieb an einem Feiertag geöffnet hat, steht hier nicht/, "keine erfundene Feiertagsöffnung");
  // Bundesweit und Bayern unterscheiden sich: Fronleichnam gibt es nur in Bayern & Co.
  const alle = [...Array(2)].map((_, i) => new Date().getFullYear() + i)
    .flatMap((j) => [...feiertage(j, "by")].map(([d, n]) => ({ d, n })));
  assert.ok(alle.some((f) => f.n === "Fronleichnam"), "Testdaten enthalten Fronleichnam");

  // Der Chat-Knopf bekommt die Liste mit – die Namen sind dieselben wie im Modul.
  const l = laufzeitVon(bayer);
  const liste = l.config.design.feiertage;
  assert.ok(Array.isArray(liste) && liste.length >= 8, "mindestens die nächsten acht Feiertage");
  for (const f of liste) {
    assert.match(f.d, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(f.n, feiertagAm(f.d, "by"), "Name passt zum Datum");
  }
  assert.deepEqual([...liste].sort((a: any, b: any) => a.d.localeCompare(b.d)), liste, "nach Datum sortiert");
});
