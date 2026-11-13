// Nur lokal zum Ansehen (npm run beispiel): Server mit einem Beispielkunden im Arbeitsspeicher.
// Admin: http://localhost:8799/admin (tom@test.de) · Kunden-Zugang: http://localhost:8799/k/maler-mueller/verwalten (info@maler-mueller.de)
// Die Anmelde-Codes stehen in der Konsole.
process.env.LLM_PROVIDER = "demo"; process.env.SESSION_SECRET = "dev"; process.env.ADMIN_LOGIN = "tom@test.de";
const { serve } = await import("@hono/node-server");
const { app } = await import("../src/app.ts");
const { neuerSpeicher, beispiel, anlegen } = await import("./kunden-hilfe.ts");
const s = await neuerSpeicher();
const k = beispiel("maler-mueller", "maler", { zugang: { aktiv: true } });
k.wissen.leistungen[0].preis = 290; k.wissen.leistungen[0].ab = true; k.wissen.leistungen[1].preis = 180;
await anlegen(s, k);
// Farbproben: derselbe Betrieb mit kräftigen Firmenfarben, um das Design zu prüfen
for (const [id, farbe, name] of [["gelb", "#ffd400", "Gelb"], ["gruen", "#2e9e5b", "Grün"], ["hell", "#f2f2f2", "Hellgrau"]] as const) {
  const f = beispiel("farbe-" + id, "maler", { stammdaten: { firmenname: "Farbprobe " + name, email: "test@farbprobe.de" }, aussehen: { primaerfarbe: farbe, botName: "Lena" } });
  f.wissen.leistungen[0].preis = 290; f.wissen.leistungen[0].ab = true;
  await anlegen(s, f);
}
serve({ fetch: app.fetch, port: 8799 }, () => console.log("bereit"));
