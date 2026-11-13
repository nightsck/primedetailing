// Farben aus der Firmenfarbe: immer lesbar, egal welche Farbe der Kunde wählt.
// Prüft außerdem, dass das Chat-Fenster (public/widget.js) genauso rechnet wie der Server
// (src/farben.ts) – die Rechnung steht dort doppelt, weil das Fenster eigenständig lädt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { palette, kontrast, hex } from "../src/farben.ts";

/** Dieselbe Funktion aus dem Chat-Fenster holen, ohne es zu laden. */
function paletteAusWidget(): (d: any) => any {
  const quelle = readFileSync(new URL("../public/widget.js", import.meta.url), "utf8");
  const von = quelle.indexOf("const hex = (c) =>"), bis = quelle.indexOf("const css = (d) =>");
  assert.ok(von > 0 && bis > von, "Farbrechnung im Chat-Fenster gefunden");
  return new Function(quelle.slice(von, bis) + "; return palette;")() as (d: any) => any;
}

const PROBEN = ["#1f2a37", "#000000", "#ffffff", "#f2f2f2", "#ffd400", "#2e9e5b", "#6b47a8", "#b3261e", "#e8e4d9", "#0a0817", "#00bcd4", "#ff6f00"];

test("Schrift auf der Firmenfarbe ist immer gut lesbar", () => {
  for (const farbe of PROBEN) {
    const c = palette({ primaer: farbe });
    const flaeche = hex(c.p)!, schrift = hex(c.pt)!;
    assert.ok(kontrast(flaeche, schrift) >= 4.5, `${farbe}: Schrift auf der Fläche nur ${kontrast(flaeche, schrift).toFixed(1)}:1`);
    // Die Fläche muss sich vom Fenstergrund abheben, sonst sieht man die eigene Nachricht nicht
    assert.ok(kontrast(flaeche, [246, 247, 249]) >= 1.25, `${farbe}: Fläche hebt sich kaum vom Grund ab`);
    // Als Schrift auf hellem Grund (Vorschläge, Links)
    assert.ok(kontrast(hex(c.pText)!, [252, 252, 253]) >= 4.4, `${farbe}: Firmenfarbe als Schrift zu blass`);
    // Ränder und Flächen müssen sichtbar bleiben
    assert.ok(kontrast(hex(c.p24)!, [255, 255, 255]) >= 1.12, `${farbe}: Rand kaum sichtbar`);
  }
});

test("Kräftige Farben bleiben erhalten, Grau- und Weißtöne werden für Flächen abgedunkelt", () => {
  assert.equal(palette({ primaer: "#ffd400" }).p, "#ffd400", "Gelb bleibt Gelb");
  assert.equal(palette({ primaer: "#ffd400" }).pt, "#11141a", "auf Gelb dunkle Schrift");
  assert.equal(palette({ primaer: "#1f2a37" }).p, "#1f2a37");
  assert.equal(palette({ primaer: "#1f2a37" }).pt, "#fff");
  assert.notEqual(palette({ primaer: "#ffffff" }).p, "#ffffff", "Weiß als Fläche wird abgedunkelt");
  assert.notEqual(palette({ primaer: "#f2f2f2" }).p, "#f2f2f2");
  // Unsinnige oder fehlende Angaben fallen auf den Standard zurück
  for (const murks of ["", "blau", "#12", "rgb(0,0,0)", "#xyzxyz"]) assert.equal(palette({ primaer: murks }).p, "#1f2a37", murks);
});

test("Server und Chat-Fenster rechnen gleich", () => {
  const imFenster = paletteAusWidget();
  for (const farbe of PROBEN) {
    const a = palette({ primaer: farbe, akzent: "#c99a2e" });
    const b = imFenster({ primaer: farbe, akzent: "#c99a2e" });
    assert.deepEqual({ ...b }, { ...a }, `${farbe}: public/widget.js rechnet anders als src/farben.ts`);
  }
});
