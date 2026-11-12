// Live-Selbsttest: führt den Selbsttest aus dem Admin-Panel (Reiter „Testen“)
// für eine oder mehrere Branchen-Vorlagen mit der ECHTEN KI aus – ohne Server,
// ohne Anmeldung. Jede Branche kostet wenige Cent.
//
// Aufruf:
//   npm run selbsttest                      → nur Vorlage „fahrzeugpflege“
//   npm run selbsttest -- maler elektro     → bestimmte Branchen
//   npm run selbsttest -- alle              → alle Branchen-Vorlagen
//
// Ergebnis: Ausgabe im Terminal + tests/selbsttest-ergebnis.json
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config.ts";
import { VORLAGEN } from "../src/kunde/vorlagen.ts";
import { laufzeitVon } from "../src/kunde/umwandeln.ts";
import { mitKunde, standardKunde } from "../src/kontext.ts";
import { selbsttest, type Ergebnis } from "../src/admin/selbsttest.ts";
import { beispiel } from "./kunden-hilfe.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

if (env.provider === "anthropic" && !env.anthropicKey) {
  console.log("Kein ANTHROPIC_API_KEY gesetzt – der Selbsttest braucht die echte KI.\nKey in .env eintragen und erneut starten.");
  process.exit(0);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const branchen = args.includes("alle") ? Object.keys(VORLAGEN) : args.length ? args : ["fahrzeugpflege"];
for (const b of branchen) if (!VORLAGEN[b]) { console.error(`Unbekannte Branche: ${b}\nMöglich: ${Object.keys(VORLAGEN).join(", ")} oder „alle“`); process.exit(1); }

const alle: { branche: string; ergebnisse: Ergebnis[] }[] = [];
let fehlerGesamt = 0, lesenGesamt = 0, okGesamt = 0;

for (const branche of branchen) {
  const kunde = beispiel(`selbsttest-${branche}`, branche, { stammdaten: { firmenname: `Testbetrieb ${VORLAGEN[branche].name}`, email: "test@example.de" } });
  console.log(`\n━━ ${VORLAGEN[branche].name} (${branche}) ━━`);
  const r = await mitKunde(laufzeitVon(kunde, standardKunde().config.llm, { test: true }), () => selbsttest(kunde));
  if (r.ohneKi) { console.log("Läuft ohne KI (Demo-Modus) – der Selbsttest braucht die echte KI."); continue; }
  for (const e of r.ergebnisse) {
    const z = e.urteil === "ok" ? "✓" : e.urteil === "fehler" ? "✗ FEHLER" : "◌ lesen";
    console.log(`${z}  [${e.gruppe}] ${e.frage}\n     → ${e.antwort.slice(0, 140).replace(/\n/g, " ")}\n     ${e.hinweis}`);
    if (e.urteil === "fehler") fehlerGesamt++; else if (e.urteil === "lesen") lesenGesamt++; else okGesamt++;
  }
  alle.push({ branche, ergebnisse: r.ergebnisse });
}

console.log(`\nGesamt: ${okGesamt} ok · ${lesenGesamt} bitte lesen · ${fehlerGesamt} Fehler`);
writeFileSync(join(ROOT, "tests/selbsttest-ergebnis.json"), JSON.stringify({ datum: new Date().toISOString(), modell: standardKunde().config.llm?.modell, branchen: alle }, null, 2));
console.log("Details: tests/selbsttest-ergebnis.json");
process.exit(fehlerGesamt ? 1 : 0);
