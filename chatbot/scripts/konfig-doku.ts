// Erzeugt KONFIGURATION.md aus dem Schema (src/kunde/schema.ts), damit die
// Beschreibung der Felder nie veraltet. Aufruf: npm run doku
import { writeFileSync } from "node:fs";
import { feldHilfen, PAKETE, MODUL_NAMEN, NOCH_NICHT } from "../src/kunde/schema.ts";
import { VORLAGEN } from "../src/kunde/vorlagen.ts";

const BEREICHE: [string, string][] = [
  ["", "Vertrag"], ["stammdaten", "Stammdaten"], ["aussehen", "Aussehen"], ["ton", "Ton"], ["wissen", "Wissen"],
  ["module.kundenChat", "Modul Kunden-Chat"], ["module.bewerberChat", "Modul Bewerber-Chat"], ["module.terminBot", "Modul Termin-Bot (kommt bald)"],
  ["module.anfrageChat", "Modul Anfrage-Chat (kommt bald)"], ["module.anrufRetter", "Modul Anruf-Retter (kommt bald)"],
  ["benachrichtigungen", "Benachrichtigungen"], ["zugang", "Kunden-Zugang"], ["rechtliches", "Rechtliches"], ["technik", "Technik"],
];
const hilfen = Object.entries(feldHilfen());
const bereichVon = (pfad: string) => [...BEREICHE].reverse().find(([p]) => p && (pfad === p || pfad.startsWith(p + "."))) || BEREICHE[0];

let md = `# Kunden-Konfiguration: alle Felder

Diese Datei wird automatisch erzeugt (\`npm run doku\` in \`chatbot/\`). Nicht von Hand ändern.
Quelle ist \`chatbot/src/kunde/schema.ts\`. Dieselben Texte stehen im Admin-Panel unter jedem Feld.

Felder ohne Erklärung (z. B. Straße, PLZ, Telefon) sind selbsterklärend und hier nicht aufgeführt.
\`[]\` bedeutet: Davon kann es mehrere geben (eine Liste).

## Pakete

| Paket | Enthaltene Module |
|---|---|
${Object.values(PAKETE).map((p) => `| ${p.name} | ${p.module.map((m) => MODUL_NAMEN[m] + (NOCH_NICHT.includes(m) ? " (kommt bald)" : "")).join(", ")} |`).join("\n")}

## Branchen-Vorlagen

${Object.entries(VORLAGEN).map(([id, v]) => `\`${id}\` ${v.name}`).join(" · ")}
`;
for (const [praefix, titel] of BEREICHE) {
  const zeilen = hilfen.filter(([pfad]) => bereichVon(pfad)[0] === praefix);
  if (!zeilen.length) continue;
  md += `\n## ${titel}\n\n| Feld | Wofür ist das? |\n|---|---|\n${zeilen.map(([pfad, text]) => `| \`${pfad}\` | ${text.replace(/\|/g, "\\|")} |`).join("\n")}\n`;
}
writeFileSync(new URL("../KONFIGURATION.md", import.meta.url), md);
console.log(`KONFIGURATION.md geschrieben (${hilfen.length} Felder).`);
