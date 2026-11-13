// Farben aus der Firmenfarbe des Kunden ableiten – für alle Seiten und Bots.
//
// Die Firmenfarbe kann alles sein: fast schwarz, knallgelb, hellgrau. Daraus bauen wir
// Partnerfarben, die immer lesbar bleiben, statt überall Weiß auf Firmenfarbe zu setzen.
// Gerechnet wird mit dem Kontrastverhältnis nach WCAG.
//
// WICHTIG: Dieselbe Rechnung steht noch einmal in public/widget.js (Funktion `palette`),
// weil das Chat-Fenster als eigenständige Datei im Browser des Besuchers läuft und nichts
// importieren kann. Der Test „Farben: Server und Chat-Fenster rechnen gleich“ in
// tests/farben.test.ts vergleicht beide – ändert sich hier etwas, dort mit ändern.

export type Rgb = [number, number, number];

export function hex(c: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}
const kanal = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const helligkeit = (rgb: Rgb) => 0.2126 * kanal(rgb[0]) + 0.7152 * kanal(rgb[1]) + 0.0722 * kanal(rgb[2]);
export function kontrast(a: Rgb, b: Rgb): number {
  const [h, d] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x);
  return (h + 0.05) / (d + 0.05);
}
export const zuHex = (rgb: number[]) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mischen = (a: Rgb, b: Rgb, t: number) => zuHex(a.map((v, i) => v + (b[i] - v) * t));

export type Palette = {
  /** Firmenfarbe als Fläche (Knopf, eigene Nachricht). Bei Grau- und Weißtönen abgedunkelt. */
  p: string;
  /** Schrift auf dieser Fläche: Weiß oder Dunkel, je nachdem was besser lesbar ist. */
  pt: string;
  /** Firmenfarbe als Schrift auf hellem Grund – so weit abgedunkelt, dass sie gut lesbar ist. */
  pText: string;
  /** Firmenfarbe als Fläche, sehr leicht bis deutlich (Hintergründe, Ränder). */
  p06: string; p12: string; p24: string;
  a: string; aText: string;
};

/** Macht eine Farbe so lange dunkler, bis sie auf hellem Grund gut lesbar ist. */
function lesbarAufHell(c: Rgb): Rgb {
  let t: Rgb = c;
  for (let i = 0; i < 24 && kontrast(t, [252, 252, 253]) < 4.6; i++) t = t.map((v) => v * 0.9) as Rgb;
  return t;
}

export function palette(d: { primaer?: string; akzent?: string; hintergrund?: string }): Palette {
  const p = hex(d.primaer || "") || [31, 42, 55] as Rgb, a = hex(d.akzent || "") || [201, 154, 46] as Rgb;
  const weiss: Rgb = [255, 255, 255], schwarz: Rgb = [17, 20, 24];
  const text = lesbarAufHell(p);
  // Ein kräftiges Gelb hebt sich durch seine Farbigkeit ab, ein Hellgrau nicht: deshalb zählt beides.
  const grund = hex(d.hintergrund || "") || [246, 247, 249] as Rgb;
  const farbigkeit = (Math.max(...p) - Math.min(...p)) / (Math.max(...p) || 1);
  const flaeche = farbigkeit < 0.18 && kontrast(p, grund) < 1.6 ? text : p;
  const auf = kontrast(flaeche, weiss) >= kontrast(flaeche, schwarz) ? "#fff" : "#11141a";
  // Flächen und Ränder aus der Firmenfarbe mischen. Ist sie selbst sehr hell, nehmen wir die
  // abgedunkelte Fassung – sonst wären Ränder und Vorschläge kaum zu sehen.
  const basis = helligkeit(p) > 0.5 ? text : p;
  return {
    p: zuHex(flaeche), pt: auf, pText: zuHex(text),
    p06: mischen(weiss, basis, 0.07), p12: mischen(weiss, basis, 0.14), p24: mischen(weiss, basis, 0.28),
    a: d.akzent || "#c99a2e", aText: zuHex(lesbarAufHell(a)),
  };
}
