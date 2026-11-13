// Öffnungszeiten aus dem Freitext lesen – und im Zweifel lieber nichts behaupten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { leseZeiten, istOffen } from "../src/oeffnungszeiten.ts";

const offenAm = (text: string, tag: number, minute: number) => {
  const z = leseZeiten(text);
  return z && istOffen(z, tag, minute);
};

test("Übliche Schreibweisen werden verstanden", () => {
  assert.deepEqual(leseZeiten("Mo–Fr 7–16 Uhr"), [0, 1, 2, 3, 4].map((tag) => ({ tag, von: 420, bis: 960 })));
  assert.equal(offenAm("Mo–Fr 7–16 Uhr", 0, 8 * 60), true, "Montag 8 Uhr offen");
  assert.equal(offenAm("Mo–Fr 7–16 Uhr", 0, 16 * 60), false, "Montag 16 Uhr zu");
  assert.equal(offenAm("Mo–Fr 7–16 Uhr", 5, 10 * 60), false, "Samstag zu");
  assert.equal(offenAm("Mo-Do 8-17 Uhr, Fr 8-13 Uhr", 4, 14 * 60), false, "Freitag nachmittags zu");
  assert.equal(offenAm("Mo-Do 8-17 Uhr, Fr 8-13 Uhr", 4, 12 * 60), true);
  assert.equal(offenAm("Di–Fr 9–18 Uhr, Sa 9–14 Uhr", 5, 10 * 60), true, "Samstagvormittag offen");
  assert.equal(offenAm("Di–Fr 9–18 Uhr, Sa 9–14 Uhr", 0, 10 * 60), false, "Montag Ruhetag");
  assert.equal(offenAm("Mo–Fr 8:30–12:30 Uhr", 1, 12 * 60 + 15), true);
  assert.equal(offenAm("Mo–Fr 8:30–12:30 Uhr", 1, 12 * 60 + 45), false);
  assert.equal(offenAm("Montag bis Freitag 9 bis 18 Uhr", 2, 10 * 60), true);
  // Woche über das Wochenende hinweg: „Sa–So“
  assert.equal(offenAm("Sa–So 10–16 Uhr", 6, 11 * 60), true);
  assert.equal(offenAm("Sa–So 10–16 Uhr", 0, 11 * 60), false);
});

test("Unklare Angaben ergeben keinen Hinweis", () => {
  for (const murks of ["", "nach Absprache", "Termine nach Vereinbarung", "rund um die Uhr", "wechselnd, siehe Website",
    "Mo–Fr 7–16 Uhr, im Sommer auch bis 18", "Mo 25–30 Uhr", "Mo 16–7 Uhr", "wir sind oft da", "x".repeat(320)]) {
    assert.equal(leseZeiten(murks), null, murks);
  }
});

test("Der Chat-Knopf richtet sich nach den Öffnungszeiten", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(new URL("../public/widget.js", import.meta.url), "utf8");
  const von = quelle.indexOf("/** Datum in deutscher Zeit"), bis = quelle.indexOf("class WebsiteChat");
  assert.ok(von > 0 && bis > von, "Knopf-Logik im Chat-Fenster gefunden");

  const text = (zeiten: unknown, jetzt: string, eigener = "", anrede = "sie", feiertage: unknown[] = []) => {
    const V = { design: { zeiten, launcherText: eigener, anrede, feiertage } };
    const bau = new Function("V", "Date", quelle.slice(von, bis) + "; return knopfText(V.design.launcherText);");
    const fest = new Date(jetzt);
    class FesteZeit extends Date {
      constructor(...a: any[]) { super(...(a.length ? a : [fest.getTime()]) as []); }
      static now() { return fest.getTime(); }
    }
    return bau(V, FesteZeit);
  };
  const MoFr = leseZeiten("Mo–Fr 7–16 Uhr");
  // 2026-11-16 ist ein Montag
  assert.match(text(MoFr, "2026-11-16T09:00:00+01:00"), /Fragen\? Chat starten/);
  assert.match(text(MoFr, "2026-11-16T21:30:00+01:00"), /Gerade niemand da\? Schreiben Sie uns/);
  assert.match(text(MoFr, "2026-11-21T10:00:00+01:00"), /Gerade niemand da/, "Samstag");
  assert.match(text(MoFr, "2026-11-16T21:30:00+01:00", "", "du"), /Schreib uns/);
  // Eigener Text gewinnt immer
  assert.equal(text(MoFr, "2026-11-16T21:30:00+01:00", "Jetzt anfragen"), "Jetzt anfragen");
  // Ohne verlässliche Zeiten keine Behauptung
  assert.match(text(null, "2026-11-16T21:30:00+01:00"), /Fragen\? Chat starten/);
  assert.match(text([], "2026-11-16T21:30:00+01:00"), /Fragen\? Chat starten/);

  // Feiertag: Der Knopf sagt es und lädt zum Schreiben ein – auch mitten in der Öffnungszeit.
  const weihnachten = [{ d: "2026-12-25", n: "1. Weihnachtstag" }, { d: "2026-12-26", n: "2. Weihnachtstag" }];
  assert.match(text(MoFr, "2026-12-25T10:00:00+01:00", "", "sie", weihnachten), /Heute ist Feiertag – schreiben Sie uns/);
  assert.match(text(MoFr, "2026-12-25T10:00:00+01:00", "", "du", weihnachten), /Heute ist Feiertag – schreib uns/);
  assert.equal(text(MoFr, "2026-12-25T10:00:00+01:00", "Jetzt anfragen", "sie", weihnachten), "Jetzt anfragen", "eigener Text gewinnt auch am Feiertag");
  // Tag davor ist ein normaler Donnerstag
  assert.match(text(MoFr, "2026-12-24T10:00:00+01:00", "", "sie", weihnachten), /Fragen\? Chat starten/);
});
