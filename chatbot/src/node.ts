// Start unter Node (lokal oder eigener Server): npm start
import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { env } from "./config.ts";

serve({ fetch: app.fetch, port: env.port }, (i) => {
  const modus = env.provider === "anthropic" && !env.anthropicKey ? "demo (kein ANTHROPIC_API_KEY)" : env.provider;
  console.log(`Chatbot läuft auf http://localhost:${i.port}  ·  Modus: ${modus}`);
});
