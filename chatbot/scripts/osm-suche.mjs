// Läuft in GitHub Actions (.github/workflows/osm-suche.yml): holt beim CRM das nächste
// Gebiet in Baden-Württemberg, fragt OpenStreetMap ab und liefert die Treffer zurück.
// Warum hier und nicht im Cloudflare-Worker: overpass-api.de nimmt keine Anfragen von
// Cloudflare an. Anmeldung beim CRM ohne Passwort über die OIDC-Kennung von GitHub.
const BASIS = process.env.CRM_URL || "https://primedetailing-chat.tom-schindler999.workers.dev";
const AUD = "primedetailing-crm";
const MAX_GEBIETE = Number(process.env.MAX_GEBIETE || 4);

async function kennung() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tok = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tok) throw new Error("Keine GitHub-Kennung (id-token: write fehlt?)");
  const r = await fetch(`${url}&audience=${AUD}`, { headers: { Authorization: `bearer ${tok}` } });
  if (!r.ok) throw new Error(`GitHub-Kennung: ${r.status}`);
  return (await r.json()).value;
}
async function crm(pfad, daten) {
  const r = await fetch(BASIS + pfad, { method: "POST", headers: { Authorization: `Bearer ${await kennung()}`, "Content-Type": "application/json" }, body: JSON.stringify(daten), signal: AbortSignal.timeout(120_000) });
  const j = await r.json().catch(() => ({ ok: false, fehler: `HTTP ${r.status}` }));
  if (!r.ok || !j.ok) throw new Error(`CRM ${pfad}: ${j.fehler || r.status}`);
  return j;
}
async function overpass(server, abfrage) {
  const fehler = [];
  for (const s of server) {
    try {
      const r = await fetch(s, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ki-vertrieb-crm/1.0 (GitHub Actions)" }, body: "data=" + encodeURIComponent(abfrage), signal: AbortSignal.timeout(150_000) });
      if (!r.ok) { fehler.push(`${new URL(s).hostname} ${r.status}`); continue; }
      const j = await r.json();
      if (Array.isArray(j.elements)) return j.elements;
      fehler.push(`${new URL(s).hostname} ohne Daten`);
    } catch (e) { fehler.push(`${new URL(s).hostname} ${e.name === "TimeoutError" ? "Zeitüberschreitung" : e.message}`); }
  }
  throw new Error("OpenStreetMap nicht erreichbar: " + fehler.join("; "));
}

for (let i = 0; i < MAX_GEBIETE; i++) {
  const a = await crm("/api/crm/osm/aufgabe", {});
  if (!a.kachel) { console.log("Nichts zu tun:", a.grund); break; }
  const t0 = Date.now();
  let elemente;
  try { elemente = await overpass(a.server, a.abfrage); }
  catch (e) { await crm("/api/crm/osm/ergebnis", { kachel: a.kachel, fehler: e.message }); console.log("Fehler:", e.message); break; }
  // Nur das Nötige schicken
  const schlank = elemente.map((e) => ({ type: e.type, id: e.id, tags: e.tags }));
  const r = await crm("/api/crm/osm/ergebnis", { kachel: a.kachel, elements: schlank });
  console.log(`Gebiet ${a.kachel.join(",")}: ${r.bericht.treffer} Treffer, ${r.bericht.neu} neu, ${r.bericht.doppelt} doppelt${r.bericht.voll ? ", geviertelt" : ""} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
