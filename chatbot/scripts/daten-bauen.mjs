// Packt Konfiguration, Wissensbasis, Preisliste, Widget und Demo-Seite in ein
// TypeScript-Modul. So läuft derselbe Code unter Node und auf Cloudflare
// Workers (dort gibt es kein Dateisystem). Läuft automatisch vor start/test/deploy.
//
// Preise von der Website: Steht in config/bot.config.json ein Eintrag
// "preisQuelle" (Pfad zur preise.yml der Website), werden die Pakete und
// Preise bei jedem Bauen von dort übernommen und data/preise.json aktualisiert.
// So nennt der Bot immer dieselben Preise wie die Website bzw. das CMS.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const url = (p) => new URL("../" + p, import.meta.url);
const r = (p) => readFileSync(url(p), "utf8");

const config = JSON.parse(r("config/bot.config.json"));
let preise = JSON.parse(r("data/preise.json"));

const q = config.preisQuelle;
if (q?.preise && existsSync(url(q.preise))) {
  const yaml = (await import("js-yaml")).default;
  const web = yaml.load(r(q.preise));
  const rechner = q.rechner && existsSync(url(q.rechner)) ? yaml.load(r(q.rechner)) : null;
  const alt = new Map(preise.kategorien.flatMap((k) => k.pakete).map((p) => [p.name.toLowerCase(), p]));
  const slug = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const ids = new Set();
  const kategorien = (web.kategorien || []).map((k) => ({
    name: q.kategorieNamen?.[k.name] || k.name,
    pakete: (k.pakete || []).map((p) => {
      const name = [k.praefix, p.name].filter(Boolean).join(" ").trim();
      let id = alt.get(name.toLowerCase())?.id || slug(name);
      while (ids.has(id)) id += "-2";
      ids.add(id);
      const preis = p.preis === null || p.preis === undefined || p.preis === "" ? null : Number(p.preis);
      return {
        id, name, preis, ab: !!p.ab,
        ...(p.empfohlen ? { empfohlen: true } : {}),
        ...(p.beschreibung ? { beschreibung: String(p.beschreibung) } : {}),
        leistungen: (p.leistungen || []).map(String).filter((l) => !l.startsWith("## ")),
      };
    }),
  }));
  preise = { ...preise, kategorien };
  if (rechner?.groessen?.length && preise.aufschlaege) {
    const optionen = Object.fromEntries(rechner.groessen.map((g) => [g.name, Number(g.aufschlag) || 0]));
    preise.aufschlaege = { ...preise.aufschlaege, optionen, offen: Object.values(optionen).every((v) => v === 0) };
  }
  writeFileSync(url("data/preise.json"), JSON.stringify(preise, null, 2) + "\n");
  console.log(`Preise von der Website übernommen (${kategorien.reduce((n, k) => n + k.pakete.length, 0)} Pakete) → data/preise.json`);
}

const out = `// AUTOMATISCH ERZEUGT von scripts/daten-bauen.mjs – nicht von Hand ändern.
export const CONFIG = ${JSON.stringify(config, null, 2)};
export const PREISE = ${JSON.stringify(preise, null, 2)};
export const WISSEN = ${JSON.stringify(r("data/wissen.md"))};
export const WIDGET_JS = ${JSON.stringify(r("public/widget.js"))};
export const DEMO_HTML = ${JSON.stringify(r("public/demo.html"))};
`;
writeFileSync(url("src/daten.generated.ts"), out);
console.log("Daten gebaut → src/daten.generated.ts");
