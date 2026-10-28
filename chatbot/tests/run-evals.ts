// Live-Test mit echter KI: schickt alle Fragen aus testset.json durch die
// komplette Gesprächslogik (inkl. Prüfungen) und bewertet die Antworten.
// Aufruf: ANTHROPIC_API_KEY=... npm run evals   (Demo ohne Key: --demo)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config.ts";
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
import { antworte } from "../src/llm.ts";
import { istInjection, INJECTION_ANTWORT, findeBetraege } from "../src/guard.ts";

const demo = process.argv.includes("--demo");
if (!demo && env.provider === "anthropic" && !env.anthropicKey) {
  console.log("Kein ANTHROPIC_API_KEY gesetzt. Live-Test übersprungen.\nMit Key: ANTHROPIC_API_KEY=sk-... npm run evals\nNur Ablauf testen: npm run evals -- --demo");
  process.exit(0);
}

type Fall = { id: string; frage: string; muss?: string[][]; darf_nicht?: string[]; ui?: string; kein_betrag?: boolean; kritisch?: boolean };
const { faelle } = JSON.parse(readFileSync(join(ROOT, "tests/testset.json"), "utf8")) as { faelle: Fall[] };

const ergebnisse = [];
for (const f of faelle) {
  const events: any[] = [];
  let antwort = "";
  if (istInjection(f.frage)) antwort = INJECTION_ANTWORT;
  else antwort = await antworte([{ role: "user", content: f.frage }], (e) => { events.push(e); });
  const lower = antwort.toLowerCase();
  const fehler: string[] = [];
  for (const gruppe of f.muss || []) if (!gruppe.some((s) => lower.includes(s.toLowerCase()))) fehler.push(`fehlt: ${gruppe.join(" | ")}`);
  for (const s of f.darf_nicht || []) if (lower.includes(s.toLowerCase())) fehler.push(`enthält: ${s}`);
  if (f.ui && !events.some((e) => e.type === "ui" && e.ui.typ === f.ui)) fehler.push(`UI fehlt: ${f.ui}`);
  if (f.kein_betrag && findeBetraege(antwort).length) fehler.push("nennt einen Betrag");
  const blockiert = events.find((e) => e.type === "blockiert");
  if (blockiert) fehler.push(`Sicherheitsprüfung griff (${blockiert.grund}: ${blockiert.detail})`);
  const ok = fehler.length === 0;
  ergebnisse.push({ id: f.id, kritisch: !!f.kritisch, ok, fehler, frage: f.frage, antwort });
  console.log(`${ok ? "✓" : "✗"} ${f.kritisch ? "[kritisch] " : ""}${f.id}${ok ? "" : "  → " + fehler.join("; ")}`);
}

const krit = ergebnisse.filter((e) => e.kritisch);
const kritOk = krit.filter((e) => e.ok).length;
const alleOk = ergebnisse.filter((e) => e.ok).length;
console.log(`\nKritisch: ${kritOk}/${krit.length}  ·  Gesamt: ${alleOk}/${ergebnisse.length}`);
writeFileSync(join(ROOT, "tests/eval-ergebnis.json"), JSON.stringify({ datum: new Date().toISOString(), modus: demo ? "demo" : env.provider, kritisch: `${kritOk}/${krit.length}`, gesamt: `${alleOk}/${ergebnisse.length}`, ergebnisse }, null, 2));
console.log("Details: tests/eval-ergebnis.json");
process.exit(kritOk === krit.length ? 0 : 1);
