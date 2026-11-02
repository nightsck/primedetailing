// Bettet die CRM-Seiten (src/crm/*.html) als Text in src/crm/seite.ts ein,
// damit sie auf Cloudflare Workers ohne Dateisystem ausgeliefert werden.
// Nach jeder Änderung an einer der HTML-Dateien: node scripts/crm-seite.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src", "crm");
const lies = (n) => JSON.stringify(readFileSync(join(dir, n), "utf8"));
writeFileSync(join(dir, "seite.ts"),
  "// Automatisch erzeugt aus src/crm/*.html mit `node scripts/crm-seite.mjs`. Nicht von Hand ändern.\n" +
  `export const CRM_SEITE: string = ${lies("seite.html")};\n` +
  `export const ANMELDE_SEITE: string = ${lies("anmelden.html")};\n` +
  `export const ABMELDE_SEITE: string = ${lies("abmeldung.html")};\n`);
console.log("src/crm/seite.ts erzeugt");
