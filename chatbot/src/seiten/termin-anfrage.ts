// Seiten für Termin-Bot und Anfrage-Chat eines Kunden:
//   /k/<kunde>/termin    Termin in drei Schritten selbst buchen (und über den Link aus der Mail absagen)
//   /k/<kunde>/anfrage   Anliegen schildern; bei Gefahr erscheint sofort der feste Sicherheitshinweis
// Bewusst einfache Seiten ohne Framework. Alle Regeln (freie Zeiten, Dringlichkeit) rechnet der Server.
import type { Kunde } from "../kunde/schema.ts";
import { rahmen, esc, json } from "./bewerben.ts";

const CSS = `<style>
.ta{max-width:680px;margin:0 auto;padding:8px var(--gutter) 30px}
.ta-karte{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;margin-top:16px}
.ta-karte h2{margin-bottom:12px}
.ta-wahl{display:grid;gap:10px}
.ta-wahl button{display:block;width:100%;text-align:left;background:var(--surface);border:1.5px solid var(--line-strong);border-radius:var(--r);padding:14px 16px;cursor:pointer}
.ta-wahl button:hover,.ta-wahl button[aria-pressed=true]{border-color:var(--gold)}
.ta-wahl button[aria-pressed=true]{background:var(--gold-soft)}
.ta-wahl b{display:block}.ta-wahl span{color:var(--slate);font-size:14.5px}
.ta-chips{display:flex;flex-wrap:wrap;gap:8px}
.ta-chips button{background:var(--surface);border:1.5px solid var(--line-strong);border-radius:99px;padding:9px 16px;cursor:pointer;min-height:44px}
.ta-chips button:hover{border-color:var(--gold)}
.ta-chips button[aria-pressed=true]{background:var(--gold);border-color:var(--gold);color:var(--gold-ink)}
.ta-tag{border-top:1px solid var(--line);padding:12px 0}.ta-tag:first-child{border-top:0}
.ta-tag h3{font-size:15px;margin-bottom:8px}.ta-tag p{color:var(--faint);margin:0;font-size:14.5px}
.ta-feld{display:block;margin-bottom:14px}.ta-feld>span{display:block;font-weight:650;margin-bottom:4px}
.ta-feld input,.ta-feld textarea{width:100%;border:1.5px solid var(--line-strong);border-radius:var(--r-sm);padding:11px 12px;background:var(--surface);min-height:46px}
.ta-feld textarea{min-height:110px;resize:vertical}
.ta-zwei{display:grid;gap:0 12px}@media(min-width:560px){.ta-zwei{grid-template-columns:1fr 1fr}}
.ta-haken{display:flex;gap:10px;align-items:flex-start;margin:4px 0 16px;font-size:14.5px}.ta-haken input{width:20px;height:20px;flex:none;margin-top:2px}
.ta-fehler{color:var(--err);margin:0 0 12px;font-weight:600}
.ta-hinweis{border:2px solid var(--err);border-radius:var(--r);padding:14px 16px;margin:0 0 14px;background:var(--surface)}
.ta-hinweis b{color:var(--err);display:block;margin-bottom:4px}
.ta-ok{border-left:4px solid var(--ok)}
.ta-daten{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0 0 14px}.ta-daten dt{color:var(--faint)}.ta-daten dd{margin:0}
.ta-zeile{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
[hidden]{display:none!important}
</style>`;

// Gemeinsame Helfer der beiden Seiten (läuft im Browser)
const JS_HELFER = `
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = JSON.parse($('#daten').textContent);
async function rufe(pfad, body) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(D.api + pfad, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal });
    return await r.json();
  } catch (e) { return { ok: false, fehler: 'Keine Verbindung. Bitte noch einmal versuchen.' }; }
  finally { clearTimeout(t); }
}
const zeig = (id, an) => { $(id).hidden = !an; if (an) $(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
`;

const kopf = (k: Kunde, klein: string, titel: string, text: string) =>
  `<div class="page-head"><div class="wrap" style="max-width:680px"><span class="eyebrow">${esc(klein)}</span><h1>${esc(titel)}</h1><p class="lead">${esc(text)}</p></div></div>`;
const einwilligung = (k: Kunde, wofuer: string) =>
  `<label class="ta-haken"><input type="checkbox" id="ok"><span>${esc(k.stammdaten.firmenname)} darf meine Angaben ${esc(wofuer)} speichern.${k.rechtliches.datenschutzUrl ? ` <a class="textlink" href="${esc(k.rechtliches.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>` : ""}</span></label>`;

export function terminSeite(k: Kunde, api: string): string {
  const t = k.module.terminBot, s = k.stammdaten;
  const daten = { api, name: s.firmenname, telefon: s.telefon, termine: t.termine.map((x) => ({ id: x.id, name: x.name, kurz: x.kurz, ort: x.ort })) };
  return rahmen(k, `Termin bei ${s.firmenname}`, `${CSS}${kopf(k, "Termin", `Termin bei ${s.firmenname}`, "Wählen Sie, worum es geht, und suchen Sie sich eine freie Zeit aus. Der Termin steht sofort fest.")}
<main class="ta">
  <section class="ta-karte" id="absage" hidden><h2>Termin absagen</h2><p id="absageText"></p><p class="ta-fehler" id="absageFehler" role="alert"></p><div class="ta-zeile"><button class="btn btn-primary" id="absageKnopf">Ja, Termin absagen</button><a class="btn btn-ghost" href="?">Doch nicht</a></div></section>
  <section class="ta-karte" id="s1"><h2>1. Worum geht es?</h2><div class="ta-wahl" id="arten"></div></section>
  <section class="ta-karte" id="s2" hidden><h2>2. Wann passt es?</h2><div id="tage" aria-live="polite"></div><p style="margin:12px 0 0"><button class="btn btn-ghost btn-sm" id="mehr" hidden>Spätere Tage zeigen</button></p></section>
  <section class="ta-karte" id="s3" hidden><h2>3. Ihre Angaben</h2><p id="gewaehlt" style="font-weight:650"></p>
    <form id="form" novalidate>
      <label class="ta-feld"><span>Name</span><input id="name" autocomplete="name" maxlength="80"></label>
      <div class="ta-zwei"><label class="ta-feld"><span>Telefon</span><input id="telefon" type="tel" autocomplete="tel" maxlength="40"></label><label class="ta-feld"><span>E-Mail (für die Bestätigung)</span><input id="email" type="email" autocomplete="email" maxlength="100"></label></div>
      <div id="adresse" hidden><label class="ta-feld"><span>Straße und Hausnummer</span><input id="strasse" autocomplete="street-address" maxlength="100"></label>
        <div class="ta-zwei"><label class="ta-feld"><span>PLZ</span><input id="plz" inputmode="numeric" autocomplete="postal-code" maxlength="5"></label><label class="ta-feld"><span>Ort</span><input id="ort" autocomplete="address-level2" maxlength="60"></label></div></div>
      <label class="ta-feld"><span>Möchten Sie uns noch etwas mitteilen? (freiwillig)</span><textarea id="notiz" maxlength="500"></textarea></label>
      ${einwilligung(k, "für diesen Termin")}
      <p class="ta-fehler" id="fehler" role="alert"></p><button class="btn btn-primary" id="buchen">Termin fest buchen</button>
    </form></section>
  <section class="ta-karte ta-ok" id="fertig" hidden><h2>Ihr Termin steht</h2><dl class="ta-daten" id="fertigDaten"></dl><p id="fertigText"></p></section>
</main>
<script type="application/json" id="daten">${json(daten)}</script>
<script>${JS_HELFER}
const S = { art: null, von: null, datum: null, zeit: null, geladen: 0 };
const WT = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const schoen = d => { const [y, m, t] = d.split('-'); return t + '.' + m + '.'; };
$('#arten').innerHTML = D.termine.map(t => '<button type="button" data-art="' + esc(t.id) + '" aria-pressed="false"><b>' + esc(t.name) + '</b><span>' + esc(t.kurz) + (t.ort === 'kunde' ? ' · bei Ihnen vor Ort' : t.ort === 'telefon' ? ' · am Telefon' : '') + '</span></button>').join('');
async function ladeTage(mehr) {
  if (!mehr) { $('#tage').innerHTML = '<p>Freie Zeiten werden geladen …</p>'; S.von = null; S.geladen = 0; }
  const r = await rufe('/api/termin/zeiten?termin=' + encodeURIComponent(S.art.id) + '&tage=14' + (S.von ? '&von=' + S.von : ''));
  if (!r.ok) { $('#tage').innerHTML = '<p class="ta-fehler">' + esc(r.fehler || 'Die freien Zeiten konnten nicht geladen werden.') + '</p>' + (D.telefon ? '<p>Rufen Sie uns gern an: ' + esc(D.telefon) + '</p>' : ''); $('#mehr').hidden = true; return; }
  const offen = r.tage.filter(t => t.slots.length);
  const html = offen.map(t => '<div class="ta-tag"><h3>' + WT[t.wd] + ', ' + schoen(t.datum) + '</h3><div class="ta-chips">' + t.slots.map(z => '<button type="button" data-datum="' + t.datum + '" data-zeit="' + z + '" aria-pressed="false">' + z + ' Uhr</button>').join('') + '</div></div>').join('');
  if (!mehr) $('#tage').innerHTML = html || '<p>In den nächsten zwei Wochen ist nichts mehr frei.</p>'; else $('#tage').insertAdjacentHTML('beforeend', html || '<div class="ta-tag"><p>In diesen zwei Wochen ist nichts frei.</p></div>');
  S.geladen++;
  const letzter = r.tage.length ? r.tage[r.tage.length - 1].datum : null;
  // Nächster Abschnitt beginnt am Tag nach dem letzten gezeigten; nach sechs Wochen ist Schluss
  if (letzter) { const d = new Date(letzter + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); S.von = d.toISOString().slice(0, 10); }
  $('#mehr').hidden = !letzter || r.tage.length < 14 || S.geladen >= 3;
}
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-art]'), z = e.target.closest('[data-zeit]');
  if (a) {
    S.art = D.termine.find(t => t.id === a.dataset.art);
    document.querySelectorAll('[data-art]').forEach(x => x.setAttribute('aria-pressed', String(x === a)));
    zeig('#s3', false); zeig('#fertig', false); zeig('#s2', true); ladeTage(false);
  }
  if (z) {
    S.datum = z.dataset.datum; S.zeit = z.dataset.zeit;
    document.querySelectorAll('[data-zeit]').forEach(x => x.setAttribute('aria-pressed', String(x === z)));
    $('#gewaehlt').textContent = S.art.name + ' am ' + schoen(S.datum) + ' um ' + S.zeit + ' Uhr';
    $('#adresse').hidden = S.art.ort !== 'kunde'; $('#fehler').textContent = '';
    zeig('#s3', true);
  }
  if (e.target.id === 'mehr') ladeTage(true);
});
$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $(id).value.trim(), f = $('#fehler'), knopf = $('#buchen');
  if (!v('#name')) { f.textContent = 'Bitte den Namen eintragen.'; return; }
  if (!v('#telefon') && !v('#email')) { f.textContent = 'Bitte Telefon oder E-Mail eintragen.'; return; }
  if (!$('#ok').checked) { f.textContent = 'Bitte das Häkchen zur Speicherung setzen.'; return; }
  knopf.disabled = true; knopf.textContent = 'Wird gebucht …'; f.textContent = '';
  const r = await rufe('/api/termin/buchen', { termin: S.art.id, datum: S.datum, zeit: S.zeit, name: v('#name'), telefon: v('#telefon'), email: v('#email'), adresse: { strasse: v('#strasse'), plz: v('#plz'), ort: v('#ort') }, notiz: v('#notiz'), einwilligung: true });
  knopf.disabled = false; knopf.textContent = 'Termin fest buchen';
  if (!r.ok) { f.textContent = r.fehler || 'Das hat nicht geklappt.'; if (r.belegt) { zeig('#s3', false); ladeTage(false); zeig('#s2', true); } return; }
  $('#fertigDaten').innerHTML = '<dt>Termin</dt><dd>' + esc(S.art.name) + '</dd><dt>Wann</dt><dd>' + esc(r.wann) + '</dd><dt>Wo</dt><dd>' + esc(r.ort) + '</dd>';
  $('#fertigText').textContent = r.test ? 'Vorschau: Im Test wird nichts in den Kalender eingetragen und nichts verschickt.' : (r.mailAnKunde ? 'Die Bestätigung mit Kalender-Datei und Link zum Absagen ist unterwegs an ' + v('#email') + '.' : 'Bitte notieren Sie sich den Termin.' + (D.telefon ? ' Wenn Sie doch nicht können: ' + D.telefon : ''));
  ['#s1', '#s2', '#s3'].forEach(x => zeig(x, false)); zeig('#fertig', true);
});
// Link aus der Bestätigungs-Mail: erst zeigen, um welchen Termin es geht, dann auf Klick absagen
const absage = new URLSearchParams(location.search).get('absagen');
if (absage) (async () => {
  ['#s1'].forEach(x => zeig(x, false)); zeig('#absage', true);
  const r = await rufe('/api/termin/absagen', { token: absage, nurZeigen: true });
  if (!r.ok) { $('#absageText').textContent = ''; $('#absageFehler').textContent = r.fehler || 'Dieser Link ist ungültig.'; $('#absageKnopf').hidden = true; return; }
  $('#absageText').textContent = 'Möchten Sie diesen Termin absagen? ' + r.was;
  $('#absageKnopf').onclick = async () => {
    $('#absageKnopf').disabled = true;
    const x = await rufe('/api/termin/absagen', { token: absage });
    if (!x.ok) { $('#absageFehler').textContent = x.fehler || 'Das hat nicht geklappt.'; $('#absageKnopf').disabled = false; return; }
    $('#absage').innerHTML = '<h2>Termin abgesagt</h2><p>' + esc(x.was) + ' ist abgesagt.</p><p><a class="btn btn-primary" href="?">Neuen Termin buchen</a></p>';
  };
})();
</script>`);
}

export function anfrageSeite(k: Kunde, api: string): string {
  const a = k.module.anfrageChat, s = k.stammdaten;
  const kategorien = a.kategorien.length ? a.kategorien : ["Allgemeine Anfrage"];
  // Die Regeln stehen auch in der Seite, damit der Hinweis schon beim Tippen erscheint.
  // Maßgeblich bleibt die Prüfung auf dem Server.
  const daten = { api, telefon: s.telefon, regeln: a.sicherheitsregeln.map((r) => ({ w: r.stichworte, a: r.antwort, d: r.dringlichkeit })) };
  return rahmen(k, `Anfrage an ${s.firmenname}`, `${CSS}${kopf(k, "Anfrage", `Anfrage an ${s.firmenname}`, "Beschreiben Sie kurz Ihr Anliegen. Wir melden uns persönlich bei Ihnen.")}
<main class="ta">
  <form class="ta-karte" id="form" novalidate>
    <h2>Worum geht es?</h2><div class="ta-chips" id="kat" role="group" aria-label="Anliegen">${kategorien.map((x) => `<button type="button" data-kat="${esc(x)}" aria-pressed="false">${esc(x)}</button>`).join("")}</div>
    <label class="ta-feld" style="margin-top:16px"><span>Was ist los? Was soll gemacht werden?</span><textarea id="beschreibung" maxlength="1500"></textarea></label>
    <div id="hinweis" class="ta-hinweis" role="alert" hidden></div>
    <label class="ta-feld"><span>Name</span><input id="name" autocomplete="name" maxlength="80"></label>
    <div class="ta-zwei"><label class="ta-feld"><span>Telefon</span><input id="telefon" type="tel" autocomplete="tel" maxlength="40"></label><label class="ta-feld"><span>E-Mail</span><input id="email" type="email" autocomplete="email" maxlength="100"></label></div>
    <label class="ta-feld"><span>Adresse, falls wir vorbeikommen sollen (freiwillig)</span><input id="adresse" autocomplete="street-address" maxlength="160"></label>
    ${einwilligung(k, "zur Bearbeitung dieser Anfrage")}
    <p class="ta-fehler" id="fehler" role="alert"></p><button class="btn btn-primary" id="senden">Anfrage senden</button>
    <p style="font-size:13px;color:var(--faint);margin:12px 0 0">Ein KI-Assistent sortiert die Anfrage nach Dringlichkeit vor. Gelesen und beantwortet wird sie von einem Menschen.</p>
  </form>
  <section class="ta-karte ta-ok" id="fertig" hidden><h2>Ihre Anfrage ist angekommen</h2><div id="fertigHinweis"></div><p id="fertigText"></p></section>
</main>
<script type="application/json" id="daten">${json(daten)}</script>
<script>${JS_HELFER}
let kat = '';
const norm = x => x.toLowerCase().replace(/ß/g, 'ss').replace(/\\s+/g, ' ');
function hinweise(text) { const t = norm(text), out = []; let notfall = false; for (const r of D.regeln) { if (!r.w.some(w => t.includes(norm(w)))) continue; if (r.d === 'notfall') notfall = true; if (r.a && !out.includes(r.a)) out.push(r.a); } return { out, notfall }; }
function zeigeHinweis() {
  const h = hinweise(kat + ' ' + $('#beschreibung').value), el = $('#hinweis');
  el.hidden = !h.out.length;
  el.innerHTML = h.out.length ? '<b>Wichtig, bitte zuerst:</b>' + h.out.map(esc).join('<br>') + (h.notfall && D.telefon ? '<br>Rufen Sie uns bei einem Notfall bitte direkt an: <a class="textlink" href="tel:' + esc(D.telefon.replace(/[^+\\d]/g, '')) + '">' + esc(D.telefon) + '</a>' : '') : '';
}
$('#kat').addEventListener('click', e => { const b = e.target.closest('[data-kat]'); if (!b) return; kat = b.dataset.kat; document.querySelectorAll('[data-kat]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); zeigeHinweis(); });
$('#beschreibung').addEventListener('input', zeigeHinweis);
$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $(id).value.trim(), f = $('#fehler'), knopf = $('#senden');
  if (!v('#beschreibung')) { f.textContent = 'Bitte kurz beschreiben, worum es geht.'; return; }
  if (!v('#name') || (!v('#telefon') && !v('#email'))) { f.textContent = 'Bitte Name und Telefon oder E-Mail eintragen.'; return; }
  if (!$('#ok').checked) { f.textContent = 'Bitte das Häkchen zur Speicherung setzen.'; return; }
  knopf.disabled = true; knopf.textContent = 'Wird gesendet …'; f.textContent = '';
  const r = await rufe('/api/anliegen', { kategorie: kat, beschreibung: v('#beschreibung'), name: v('#name'), telefon: v('#telefon'), email: v('#email'), adresse: v('#adresse'), einwilligung: true });
  knopf.disabled = false; knopf.textContent = 'Anfrage senden';
  if (!r.ok) { f.textContent = r.fehler || 'Das hat nicht geklappt.'; return; }
  $('#fertigHinweis').innerHTML = (r.hinweise || []).length ? '<div class="ta-hinweis"><b>Wichtig, bitte zuerst:</b>' + r.hinweise.map(esc).join('<br>') + '</div>' : '';
  $('#fertigText').textContent = (r.test ? 'Vorschau (Einstufung: ' + r.dringlichkeit + '). Im Test wird nichts gespeichert und nichts verschickt. ' : '') + (r.dringlichkeit === 'notfall' ? 'Wir haben Ihre Anfrage als Notfall markiert. Bitte rufen Sie uns zusätzlich direkt an' + (r.telefon ? ': ' + r.telefon : '') + '. Eine Anfrage über die Website ersetzt im Notfall keinen Anruf.' : r.dringlichkeit === 'dringend' ? 'Wir haben Ihre Anfrage als dringend markiert und melden uns so schnell wie möglich.' : 'Wir melden uns persönlich bei Ihnen.');
  zeig('#form', false); zeig('#fertig', true);
});
</script>`);
}
