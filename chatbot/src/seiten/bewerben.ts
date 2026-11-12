// Seiten, die wir für den Kunden bereitstellen (ohne dass er etwas einbauen muss):
//   /k/<kunde>/bewerben   Bewerber-Chat – Link für Stellenanzeige, Instagram, Google-Profil, QR-Code
//   /k/<kunde>/           kleine Übersicht mit Chat-Fenster zum Ausprobieren
// Der Bewerber-Chat ist dasselbe Skript wie auf primedetailing.eu/jobs/
// (src/assets/jobs.js), nur mit den Daten und Farben dieses Kunden.
import type { Kunde } from "../kunde/schema.ts";
import { bewerberBetriebVon } from "../kunde/umwandeln.ts";
import { JOBS_JS, JOBS_CSS } from "../daten.generated.ts";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
export const json = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

/** Ist die Farbe hell? Dann braucht sie dunkle Schrift (und umgekehrt). */
function hell(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

/** Farben der Seite aus der Firmenfarbe: heller Grund, Firmenfarbe für Knöpfe und Kopfzeile. */
function farben(k: Kunde): string {
  const p = k.aussehen.primaerfarbe, aufP = hell(p) ? "#16181c" : "#ffffff";
  // Als Textfarbe auf Weiß taugt die Firmenfarbe nur, wenn sie dunkel genug ist
  const text = hell(p) ? "#1f2a37" : p;
  return `:root{color-scheme:light;--paper:#f6f5f2;--surface:#ffffff;--mist:#efeeea;--mist-2:#eceae5;--ink:#1b1e23;--ink-2:#000000;--slate:#4d535c;--faint:#6b717a;
--line:#e2e0da;--line-strong:#cbc8c0;--gold:${p};--gold-hi:${p};--gold-deep:${text};--gold-ink:${aufP};--gold-soft:${p}1f;--err:#b3261e;--ok:#1f7a45;
--r:12px;--r-sm:9px;--r-lg:18px;--header-h:0px;--wrap:1080px;--gutter:20px;--font-display:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}`;
}

const BASIS_CSS = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}h1,h2,h3{font-family:var(--font-display);line-height:1.2;margin:0 0 .4em}h1{font-size:clamp(26px,5vw,38px)}h2{font-size:20px}h3{font-size:17px}
p{margin:0 0 1em}button,input,textarea{font:inherit;color:inherit}
.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding:0 var(--gutter)}
.page-head{padding:34px 0 6px}.eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:8px}
.lead{font-size:18px;color:var(--slate);max-width:60ch}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 22px;border-radius:var(--r);border:1.5px solid transparent;font-weight:650;text-decoration:none;cursor:pointer}
.btn svg{width:19px;height:19px;flex:none;fill:none;stroke:currentColor;stroke-width:2}
.btn-primary{background:var(--gold);color:var(--gold-ink)}.btn-primary:hover{filter:brightness(1.08)}
.btn-ghost{border-color:var(--line-strong);color:var(--ink);background:transparent}.btn-ghost:hover{border-color:var(--gold)}
.btn-sm{min-height:44px;padding:0 18px;font-size:15px}
.textlink{color:var(--gold-deep);text-decoration:underline;text-underline-offset:3px}
.fuss{padding:28px 0 40px;font-size:13px;color:var(--faint)}.fuss a{color:var(--faint)}
:focus-visible{outline:2px solid var(--gold-deep);outline-offset:2px}`;

// Fragen zum Antippen – allgemein formuliert, passend für jede Branche
const FRAGEN = {
  erfahrung: { text: "Hast du schon Erfahrung in dem Bereich?", label: "Erfahrung", opts: [["ja, beruflich", "Ja, beruflich"], ["etwas, privat oder nebenbei", "Etwas, privat oder nebenbei"], ["noch keine", "Noch keine"]] },
};

export function rahmen(k: Kunde, titel: string, inhalt: string): string {
  const r = k.rechtliches;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(titel)}</title><style>${farben(k)}${BASIS_CSS}${JOBS_CSS}</style></head><body>
${inhalt}
<footer class="fuss"><div class="wrap">${esc(k.stammdaten.firmenname)}${r.impressumUrl ? ` · <a href="${esc(r.impressumUrl)}" rel="noopener">Impressum</a>` : ""}${r.datenschutzUrl ? ` · <a href="${esc(r.datenschutzUrl)}" rel="noopener">Datenschutz</a>` : ""}${r.poweredBy ? " · Assistent: Powered by Claude (Anthropic)" : ""}</div></footer>
</body></html>`;
}

/** `api` = Adresse der Schnittstellen; im Test-Modus des Admin-Panels zeigt sie auf die Test-Schnittstellen. */
export function bewerbenSeite(k: Kunde, basis: string, api = `${basis}/k/${k.id}`): string {
  const b = bewerberBetriebVon(k)!, m = k.module.bewerberChat, s = k.stammdaten;
  const monate = Math.max(1, Math.round(k.rechtliches.aufbewahrungTage / 30));
  const stellen = [
    ...m.stellen.map((x) => ({ id: x.id, name: x.name, umfang: x.umfang, text: x.text, fragen: x.fragen })),
    ...(m.initiativ ? [{ id: "initiativ", name: "Initiativbewerbung", umfang: "nach Absprache", text: "Für alle, die keine passende Stelle sehen.", fragen: ["start"] }] : []),
  ];
  const daten = {
    name: s.firmenname, gebiet: s.einsatzgebiet, ort: b.adresse ? `Du findest uns hier: ${b.adresse}.` : "", api, versand: "server",
    whatsapp: s.whatsapp, email: s.email, zeiten: b.zeiten, bietet: b.bietet, ablauf: m.ablauf, stellen,
    fragen: FRAGEN, frist: `${monate} Monaten`, datenschutz: k.rechtliches.datenschutzUrl || "#",
  };
  const logo = k.aussehen.logoBuchstaben || s.firmenname.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return rahmen(k, `Jobs bei ${s.firmenname}`, `
<div class="page-head"><div class="wrap"><span class="eyebrow">Jobs</span><h1>Arbeiten bei ${esc(s.firmenname)}</h1>
<p class="lead">Bewirb dich in drei Minuten per Chat – ohne Anschreiben. Unterlagen kannst du mitschicken, musst du aber nicht.</p></div></div>
<section class="jb-section"><div class="wrap jb-grid">
  <section class="jb-app" id="jbApp" aria-label="Bewerbung per Chat">
    <div class="jb-head"><div class="jb-logo" aria-hidden="true">${esc(logo)}</div>
      <div class="jb-title"><b>Bewerbung bei ${esc(s.firmenname)}</b><span>Assistent mit KI · deine Bewerbung lesen wir selbst</span></div>
      <button class="jb-icon" type="button" id="jbRestart" title="Von vorn anfangen" aria-label="Bewerbung von vorn anfangen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg></button></div>
    <div class="jb-progress" aria-live="polite"><div class="jb-bar"><span id="jbBar"></span></div><p id="jbStep">Schritt 1 von 5 · Stelle</p></div>
    <div class="jb-log" id="jbLog" aria-live="polite"><noscript><div class="jb-msg bot"><div class="jb-bubble">Der Chat braucht JavaScript. Bewirb dich gern per E-Mail an <a class="textlink" href="mailto:${esc(s.email)}?subject=Bewerbung">${esc(s.email)}</a>.</div></div></noscript></div>
    <input type="file" id="jbFiles" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif,.docx" multiple hidden>
    <form class="jb-input" id="jbForm" autocomplete="off">
      <input type="text" id="jbText" placeholder="Frag einfach, z. B. nach Arbeitszeiten" aria-label="Nachricht oder Frage" maxlength="400" enterkeyhint="send">
      <button class="jb-send" type="submit" aria-label="Senden"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form>
    <p class="jb-foot">KI-Assistent, bewertet niemanden${k.rechtliches.datenschutzUrl ? ` · <a href="${esc(k.rechtliches.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>` : ""}</p>
  </section>
  <aside class="jb-side"><h2>Offene Stellen</h2><ul class="jb-jobs">
    ${stellen.map((x) => `<li><div><h3>${esc(x.name)}</h3><p class="jb-umfang">${esc(x.umfang)}</p><p>${esc(x.text)}</p></div><a class="btn btn-ghost btn-sm" href="?stelle=${esc(x.id)}" data-stelle="${esc(x.id)}">Bewerben</a></li>`).join("")}
  </ul><dl class="jb-facts">
    ${b.zeiten ? `<div><dt>Arbeitszeiten</dt><dd>${esc(b.zeiten)}</dd></div>` : ""}${m.bietet ? `<div><dt>Das bieten wir</dt><dd>${esc(m.bietet)}</dd></div>` : ""}${m.ablauf ? `<div><dt>Nach der Bewerbung</dt><dd>${esc(m.ablauf)}</dd></div>` : ""}
  </dl><p class="jb-small">Lieber anders? Schreib uns an <a class="textlink" href="mailto:${esc(s.email)}?subject=Bewerbung">${esc(s.email)}</a>${s.telefon ? ` oder ruf an: ${esc(s.telefon)}` : ""}.</p></aside>
</div></section>
<div class="jb-toast" id="jbToast" role="status" aria-live="polite"></div>
<script type="application/json" id="jbDaten">${json(daten)}</script><script>${JOBS_JS.replace(/<\/script/gi, "<\\/script")}</script>`);
}

export function kundenStartseite(k: Kunde, basis: string): string {
  const s = k.stammdaten, chat = k.module.kundenChat.aktiv, jobs = !!bewerberBetriebVon(k);
  return rahmen(k, `${s.firmenname} – Assistent`, `
<div class="page-head"><div class="wrap"><span class="eyebrow">${esc(s.brancheText)}</span><h1>${esc(s.firmenname)}</h1>
<p class="lead">${chat ? "Fragen zu Leistungen oder eine Anfrage? Der Chat unten rechts hilft sofort weiter." : "Hier finden Sie unsere digitalen Assistenten."}</p>
${k.id.startsWith("demo-") ? `<p><b>Beispielbetrieb für Vorführungen.</b> Firma, Preise und Stellen sind erfunden. <a href="${basis}/demos">Alle Branchen ansehen</a></p>` : ""}
<p>${k.module.terminBot.aktiv ? `<a class="btn btn-primary" href="${basis}/k/${k.id}/termin">Termin buchen</a> ` : ""}${k.module.anfrageChat.aktiv ? `<a class="btn btn-primary" href="${basis}/k/${k.id}/anfrage">Anfrage stellen</a> ` : ""}${jobs ? `<a class="btn ${k.module.terminBot.aktiv || k.module.anfrageChat.aktiv ? "btn-ghost" : "btn-primary"}" href="${basis}/k/${k.id}/bewerben">Jetzt bewerben</a> ` : ""}${s.website ? `<a class="btn btn-ghost" href="${esc(s.website)}" rel="noopener">Zur Website</a>` : ""}</p></div></div>
${chat ? `<script src="${basis}/k/${k.id}/widget.js" defer></script>` : ""}`);
}

/** Leere Seite nur mit dem Chat-Fenster – für die Vorschau im Admin-Panel. */
export function testSeite(k: Kunde, widgetUrl: string): string {
  return rahmen(k, "Test: Kunden-Chat", `<div class="page-head"><div class="wrap"><span class="eyebrow">Test mit dem Entwurf</span><h1>${esc(k.stammdaten.firmenname)}</h1>
<p class="lead">So sieht der Chat auf der Website aus. Unten ${k.aussehen.position === "links" ? "links" : "rechts"} auf den Knopf klicken. Im Test wird nichts gezählt, gespeichert oder verschickt.</p></div></div>
<script src="${esc(widgetUrl)}" defer></script>`);
}
