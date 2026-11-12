// Übersicht der Beispielbetriebe für Vorführungen (/demos).
// Öffentlich, aber nicht für Suchmaschinen. Zeigt nur veröffentlichte Kunden mit der ID „demo-<branche>“.
import { VORLAGEN } from "../kunde/vorlagen.ts";
import { DEMO_BETRIEBE } from "../kunde/demo-betriebe.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

export function demosSeite(demos: { id: string; firmenname: string; module: string[] }[], basis: string): string {
  const karten = demos.map((d) => {
    const branche = d.id.slice(5), v = VORLAGEN[branche], b = DEMO_BETRIEBE[branche];
    const k = `${basis}/k/${esc(d.id)}`;
    return `<article class="karte"><span class="eyebrow">${esc(v?.name || branche)}</span><h2>${esc(d.firmenname)}</h2>
      <p class="neben">${b ? `Assistent: ${esc(b.bot)}` : ""}</p>
      <p class="knoepfe">${d.module.includes("kundenChat") ? `<a class="btn haupt" href="${k}/">Kunden-Chat</a>` : ""}${d.module.includes("bewerberChat") ? `<a class="btn" href="${k}/bewerben">Bewerber-Chat</a>` : ""}</p></article>`;
  }).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Beispielbetriebe · ki-für-meinen-betrieb.de</title>
<style>
:root{color-scheme:dark;--grund:#0a0817;--abschnitt:#100d24;--karte:#171232;--linie:#2a2350;--knopf:#6b47a8;--akzent:#bba9f5;--h:#f3f0fb;--text:#cfc9e6;--neben:#9a93b8}
*{box-sizing:border-box}body{margin:0;background:var(--grund);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:0 18px}
header{background:var(--abschnitt);border-bottom:1px solid var(--linie);padding:34px 0 26px}
h1{color:var(--h);font-size:clamp(24px,4vw,34px);margin:0 0 8px;line-height:1.2}h2{color:var(--h);font-size:19px;margin:4px 0 2px}
p{margin:0 0 .8em}.neben{color:var(--neben);font-size:14.5px}
.eyebrow{color:var(--akzent);font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.raster{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));padding:22px 0 10px}
.karte{background:var(--karte);border:1px solid var(--linie);border-radius:14px;padding:18px}
.knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.btn{display:inline-flex;align-items:center;min-height:42px;padding:0 15px;border-radius:10px;border:1px solid var(--linie);color:var(--h);text-decoration:none;font-weight:600;font-size:15px}
.btn:hover{border-color:var(--akzent)}.btn.haupt{background:var(--knopf);border-color:var(--knopf)}
:focus-visible{outline:2px solid var(--akzent);outline-offset:2px}
footer{padding:18px 0 40px}
</style></head><body>
<header><div class="wrap"><span class="eyebrow">ki-für-meinen-betrieb.de</span><h1>So arbeitet der Assistent in Ihrer Branche</h1>
<p>Wählen Sie einen Beispielbetrieb und probieren Sie den Kunden-Chat oder den Bewerber-Chat aus.</p>
<p class="neben">Alle Betriebe, Preise und Stellen sind erfunden. Für Ihren Betrieb tragen wir Ihre eigenen Angaben ein.</p></div></header>
<main class="wrap">${demos.length ? `<div class="raster">${karten}</div>` : `<p style="padding:26px 0">Im Moment sind keine Beispielbetriebe eingerichtet.</p>`}</main>
<footer class="wrap"><p class="neben">Die Antworten kommen von einer KI (Claude von Anthropic). Sie nennt nur, was im Betrieb hinterlegt ist, und verweist sonst an das Team.</p></footer>
</body></html>`;
}
