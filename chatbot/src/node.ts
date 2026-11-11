// Start unter Node (lokal oder eigener Server, z. B. Hetzner): npm start
// Kundendaten liegen in einer SQLite-Datei: DATEN_PFAD (Standard ./daten/kunden.sqlite).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { env } from "./config.ts";
import { nodeSpeicher } from "./speicher/node.ts";
import { setzeSpeicher } from "./speicher/schnittstelle.ts";

const pfad = process.env.DATEN_PFAD || "./daten/kunden.sqlite";
if (pfad !== ":memory:") mkdirSync(dirname(pfad), { recursive: true });
const speicher = await nodeSpeicher(pfad);
setzeSpeicher(speicher);
// Einmal am Tag alles löschen, dessen Frist abgelaufen ist (und einmal kurz nach dem Start)
const aufraeumen = () => speicher.aufraeumen().then((n) => n && console.log(`[aufraeumen] ${n} abgelaufene Einträge gelöscht`)).catch((e) => console.error("[aufraeumen]", e?.message || e));
setTimeout(aufraeumen, 10_000).unref();
setInterval(aufraeumen, 86_400_000).unref();

serve({ fetch: app.fetch, port: env.port }, (i) => {
  const modus = env.provider === "anthropic" && !env.anthropicKey ? "demo (kein ANTHROPIC_API_KEY)" : env.provider;
  console.log(`Chatbot läuft auf http://localhost:${i.port}  ·  Modus: ${modus}  ·  Kundendaten: ${pfad}  ·  Admin: http://localhost:${i.port}/admin`);
});
