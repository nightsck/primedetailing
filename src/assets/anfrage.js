// Anfrage-Chat der Vorführseite (/demo/anfrage/) für Fahrzeugpflege, Maler und Elektro.
// Ablauf per Knopfdruck, dazu KI für freie Fragen (/api/demo/betrieb-frage) und für
// Dringlichkeit und Zusammenfassung (/api/demo/anfrage-auswerten). Feste Regeln gehen
// vor: Brandgeruch oder austretendes Wasser sind immer Notfall, mit Sicherheitshinweis.
// Gespeichert wird nur in diesem Browser, in derselben Liste wie /demo (Tab „Chef“).
import { BETRIEBE, FRAGEN, schaetzeDringlichkeit, sicherheitshinweis, hoeher, terminArt } from './betriebe.js';

/* ---------- Hilfen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const API = (document.body.dataset.api || '').replace(/\/+$/, '');
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3800); }
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};
async function rufe(pfad, body, ms = 20000) {
  if (!API) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    return await r.json().catch(() => null);
  } catch (e) { return null; } finally { clearTimeout(t); }
}
const TEL = '07720 000000';

/* ---------- Speicher (gemeinsam mit /demo) ---------- */
const AKEY = 'af-demo-anfragen-v2', ZKEY = 'af-demo-zaehler-v1', DKEY = 'af-demo-anfrage-betrieb';
function zaehle(k) {
  let z = { zahl: {}, zeit: {} };
  try { const o = JSON.parse(ls.get(ZKEY) || 'null'); if (o && typeof o === 'object') z = { zahl: o.zahl || {}, zeit: o.zeit || {} }; } catch (e) { /* neu */ }
  z.zahl[k] = (z.zahl[k] || 0) + 1;
  if (k === 'anfrage') { const h = new Date().getHours(); const f = h >= 6 && h < 12 ? 'morgens' : h >= 12 && h < 17 ? 'mittags' : h >= 17 && h < 22 ? 'abends' : 'nachts'; z.zeit[f] = (z.zeit[f] || 0) + 1; }
  ls.set(ZKEY, JSON.stringify(z));
}
function speichere(r) {
  let list = [];
  try { const a = JSON.parse(ls.get(AKEY) || 'null'); if (Array.isArray(a)) list = a; } catch (e) { /* neu */ }
  list.unshift(r);
  if (!ls.set(AKEY, JSON.stringify(list.slice(0, 100)))) { r.fotos = []; list[0] = r; ls.set(AKEY, JSON.stringify(list.slice(0, 60))); }
}

/* ---------- Zustand ---------- */
const S = { betrieb: 'fahrzeug', log: [], step: '', a: {}, fotos: [], busy: false, verlauf: [], ki: null, fragen: [], gezaehlt: false, zurPruefung: false, auswertung: null, entwurf: null, warnung: '' };
const B = () => BETRIEBE[S.betrieb];
const anl = () => B().anliegen.find(x => x.id === S.a.anliegen);
const bot = (text, o = {}) => { const m = Object.assign({ from: 'bot', text }, o); S.log.push(m); return m; };
const user = text => { S.log.push({ from: 'user', text }); };
const ch = (label, act, val) => ({ label, act, val: val == null ? '' : val });

function plan() {
  const a = anl();
  return ['anliegen', ...(a ? a.fragen : []), 'beschreibung', ...(B().ortFragen ? ['ort'] : []), 'zusammenfassung', 'wunsch', 'kontakt', 'pruefen'];
}
// Fortschritt in fünf Abschnitten, egal wie viele Fragen ein Anliegen hat
const ABSCHNITT = s => s === 'anliegen' ? 1 : FRAGEN[s] ? 2 : ['beschreibung', 'ort'].includes(s) ? 3 : ['zusammenfassung', 'wunsch'].includes(s) ? 4 : 5;
const ABSCHNITTE = ['Worum geht es', 'Ein paar Fragen', 'Beschreibung', 'Wie weiter', 'Kontakt und absenden'];
function zeigeFortschritt() {
  const fertig = S.step === 'fertig'; const n = fertig ? 5 : ABSCHNITT(S.step);
  $('#afBar').style.width = (fertig ? 100 : (n - 1) / 5 * 100 + 6) + '%';
  $('#afStep').textContent = fertig ? 'Fertig · Anfrage abgeschickt' : `Schritt ${n} von 5 · ${ABSCHNITTE[n - 1]}`;
  $('#afText').placeholder = S.step === 'beschreibung' ? 'Beschreiben Sie es in eigenen Worten' : FRAGEN[S.step] ? 'Antwort tippen oder Frage stellen' : 'Frage stellen, z. B. wann Sie Zeit haben';
}
function kiStatus() { const el = $('#afState'); if (el) el.textContent = S.ki === false ? 'Vorführmodus: feste Antworten' : ''; }

/* ---------- Ablauf ---------- */
function start(neu = true) {
  Object.assign(S, { log: [], a: {}, fotos: [], busy: false, verlauf: [], fragen: [], gezaehlt: false, zurPruefung: false, auswertung: null, entwurf: null, warnung: '' });
  bot(`Guten Tag! Ich nehme Ihre Anfrage für ${B().name} auf. Das dauert etwa zwei Minuten. Ich bin ein Assistent mit KI, Ihre Anfrage liest danach ein Mensch aus dem Team.`);
  frage('anliegen');
  if (neu) zaehle('anf_offen');
}
const zurueckChip = () => plan().indexOf(S.step) > 0 ? [ch('Zurück', 'zurueck')] : [];
function frage(step) {
  S.step = step;
  if (step === 'anliegen') bot('Worum geht es?', { chips: B().anliegen.map(a => ch(a.name, 'anliegen', a.id)) });
  else if (FRAGEN[step]) { const f = FRAGEN[step]; bot(f.text, { chips: f.opts.map(o => ch(o, 'antwort', o)).concat(zurueckChip()) }); }
  else if (step === 'beschreibung') {
    bot(S.a.beschreibung ? 'Was möchten Sie ergänzen? Schreiben Sie es einfach unten rein.' : 'Beschreiben Sie kurz in eigenen Worten, worum es geht. Fotos helfen dem Team sehr.', { card: 'fotos', chips: [ch('Fotos anhängen', 'fotos'), ch(S.a.beschreibung || S.fotos.length ? 'Weiter' : 'Überspringen', 'beschreibung-weiter')].concat(zurueckChip()) });
    setTimeout(() => $('#afText').focus({ preventScroll: true }), 50);
  }
  else if (step === 'ort') bot('Wo soll gearbeitet werden? Postleitzahl und Ort reichen.', { card: 'ort', chips: zurueckChip() });
  else if (step === 'zusammenfassung') { zusammenfassen(); return; }
  else if (step === 'wunsch') {
    const t = terminArt(B(), B().terminVorschlag);
    bot('Wie soll es weitergehen?', { chips: [ch('Rückruf', 'wunsch', 'Rückruf'), ch('Angebot per E-Mail', 'wunsch', 'Angebot per E-Mail'), ch(`${t.name} online buchen`, 'wunsch', 'termin')].concat(zurueckChip()) });
  }
  else if (step === 'kontakt') bot(S.a.wunsch === 'Rückruf' ? 'Unter welcher Nummer erreichen wir Sie, und wann passt es am besten?' : 'Wie erreichen wir Sie?', { card: 'kontakt', chips: zurueckChip() });
  else if (step === 'pruefen') bot('Bitte kurz prüfen. Sie können alles noch ändern.', { card: 'pruefen', chips: zurueckChip() });
  zeigeFortschritt(); render();
}
function weiter() {
  if (S.zurPruefung) {
    // Nach einer Änderung an Anliegen, Fragen oder Beschreibung neu zusammenfassen
    if (S.neuBewerten && !['zusammenfassung', 'wunsch', 'kontakt'].includes(S.step)) { S.neuBewerten = false; frage('zusammenfassung'); return; }
    S.zurPruefung = false; frage('pruefen'); return;
  }
  const p = plan(); frage(p[p.indexOf(S.step) + 1] || 'pruefen');
}
function zaehleStart() { if (!S.gezaehlt) { S.gezaehlt = true; zaehle('anf_start'); } }

/* ---------- KI: Zusammenfassung und Dringlichkeit ---------- */
function angabenListe() {
  const a = anl(); if (!a) return [];
  return a.fragen.filter(f => S.a[f]).map(f => [FRAGEN[f].label, S.a[f]]);
}
function lokaleZusammenfassung() {
  const a = anl(); const teile = angabenListe().map(([, v]) => v);
  return `Sie möchten: ${a ? a.name : 'eine Anfrage'}${teile.length ? ' (' + teile.join(', ') + ')' : ''}.${S.a.beschreibung ? ' ' + S.a.beschreibung.slice(0, 200) : ''}${S.a.ort ? ' Ort: ' + S.a.ort + '.' : ''}`;
}
async function zusammenfassen() {
  S.step = 'zusammenfassung'; zeigeFortschritt();
  S.busy = true; const warte = bot('', { typing: true }); render();
  const a = anl();
  const text = [a ? a.name : '', ...angabenListe().map(x => x.join(': ')), S.a.beschreibung || ''].join('\n');
  const regel = schaetzeDringlichkeit(text);
  let erg = null;
  const r = S.ki === false ? null : await rufe('/api/demo/anfrage-auswerten', { betrieb: S.betrieb, anliegen: a ? a.name : '', angaben: angabenListe(), beschreibung: S.a.beschreibung || '' });
  if (r && r.demo) S.ki = false; else if (r && r.ok && r.ergebnis) { erg = r.ergebnis; if (!r.limit) S.ki = true; }
  S.log.splice(S.log.indexOf(warte), 1); S.busy = false; kiStatus();
  S.auswertung = {
    dringlichkeit: hoeher(erg && erg.dringlichkeit || 'normal', regel),
    grund: erg && erg.grund || '',
    zusammenfassung: erg && erg.zusammenfassung || lokaleZusammenfassung(),
    rueckfragen: erg && Array.isArray(erg.rueckfragen) ? erg.rueckfragen.slice(0, 2) : [],
    ki: !!(erg && erg.zusammenfassung)
  };
  const d = S.auswertung.dringlichkeit;
  bot('So habe ich Ihr Anliegen verstanden:', { card: 'verstanden' });
  if (d === 'notfall') bot(`Das klingt nach einem Notfall. Ich markiere Ihre Anfrage, damit das Team sie als Erstes sieht. Am schnellsten geht es, wenn Sie direkt anrufen: ${TEL} (Beispielnummer).`);
  else if (d === 'dringend') bot('Ich markiere Ihre Anfrage als dringend, damit das Team sie früh sieht.');
  bot('Stimmt das so?', { chips: [ch('Ja, stimmt', 'stimmt'), ch('Etwas ergänzen', 'ergaenzen')].concat(zurueckChip()) });
  render();
}

/* ---------- Aktionen ---------- */
function aktion(act, val, idx) {
  const m = S.log[idx]; if (!m || m.used || S.busy) return;
  const chip = (m.chips || []).find(c => c.act === act && String(c.val) === String(val));
  if (act === 'fotos') { $('#afFotos').click(); return; }
  if (act === 'foto-weg') { S.fotos.splice(Number(val), 1); aktualisiereFotoChips(m); render(); return; }
  if (act === 'zurueck') {
    m.used = true; user('Zurück');
    const p = plan(); let z = p[Math.max(0, p.indexOf(S.step) - 1)];
    if (z === 'zusammenfassung') z = p[p.indexOf(z) - 1];   // nicht nochmal zusammenfassen
    frage(z); return;
  }
  if (act === 'aendern') {
    m.used = true; S.zurPruefung = true; S.neuBewerten = val !== 'kontakt' && val !== 'wunsch';
    user('Ändern: ' + ((FRAGEN[val] && FRAGEN[val].label) || { anliegen: 'Anliegen', beschreibung: 'Beschreibung', ort: 'Ort', wunsch: 'Wie weiter', kontakt: 'Kontakt' }[val] || val));
    if (val === 'anliegen') { S.zurPruefung = false; S.neuBewerten = false; }
    frage(val); return;
  }
  if (act === 'neu') { m.used = true; start(true); return; }
  if (act === 'chef') { location.href = '/demo/#chef'; return; }
  if (act === 'termin-link') { location.href = `/demo/termin/?betrieb=${S.betrieb}&termin=${B().terminVorschlag}`; return; }
  m.used = true;
  if (act === 'anliegen') {
    const alt = S.a.anliegen; S.a.anliegen = val; user(chip ? chip.label : val); zaehleStart();
    if (alt && alt !== val) { for (const k of Object.keys(FRAGEN)) delete S.a[k]; S.zurPruefung = false; }
    S.step = 'anliegen'; weiter(); return;
  }
  if (act === 'antwort') { setzeAntwort(val); return; }
  if (act === 'beschreibung-weiter') { user(S.a.beschreibung || S.fotos.length ? 'Weiter' : 'Überspringen'); weiter(); return; }
  if (act === 'stimmt') { user('Ja, stimmt'); weiter(); return; }
  if (act === 'ergaenzen') { user('Etwas ergänzen'); S.zurPruefung = true; S.neuBewerten = true; frage('beschreibung'); return; }
  if (act === 'wunsch') { S.a.wunsch = val === 'termin' ? 'Termin online buchen' : val; user(chip ? chip.label : val); weiter(); return; }
}
function setzeAntwort(text) {
  const step = S.step; S.a[step] = text; user(text); zaehleStart();
  const hinweis = sicherheitshinweis(S.betrieb, text);
  if (hinweis) { S.warnung = hinweis; bot('', { card: 'warnung', text: hinweis }); }
  weiter();
}

/* ---------- Fotos ---------- */
function loadImage(src) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; }); }
async function vorschau(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, 480 / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7);
  } finally { URL.revokeObjectURL(url); }
}
function aktualisiereFotoChips(m) {
  if (!m) return;
  m.chips = [ch(S.fotos.length ? (S.fotos.length < 3 ? 'Noch ein Foto' : 'Fotos ändern') : 'Fotos anhängen', 'fotos'), ch(S.a.beschreibung || S.fotos.length ? 'Weiter' : 'Überspringen', 'beschreibung-weiter')].concat(zurueckChip());
}
$('#afFotos').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []).filter(f => f.type && f.type.startsWith('image/')); e.target.value = '';
  if (!files.length) return;
  const m = [...S.log].reverse().find(x => x.card === 'fotos' && !x.used);
  if (S.fotos.length >= 3) S.fotos = [];
  for (const f of files) { if (S.fotos.length >= 3) break; try { S.fotos.push(await vorschau(f)); } catch (x) { toast('Ein Foto konnte nicht gelesen werden. Bitte JPG oder PNG nehmen.'); } }
  zaehleStart(); aktualisiereFotoChips(m); render();
});

/* ---------- Formulare ---------- */
const feld = (f, n) => ((f.querySelector(`[name=${n}]`) || {}).value || '').trim();
function ortAbsenden(f, idx) {
  const plz = feld(f, 'plz'), ort = feld(f, 'ort').slice(0, 60), err = f.querySelector('.err');
  if (!/^\d{5}$/.test(plz)) { err.textContent = 'Die Postleitzahl hat 5 Ziffern.'; f.querySelector('[name=plz]').focus(); return; }
  if (!ort) { err.textContent = 'Bitte den Ort eintragen.'; f.querySelector('[name=ort]').focus(); return; }
  S.a.ort = `${plz} ${ort}`; S.a.plz = plz; S.a.ortName = ort; S.entwurf = null;
  const m = S.log[idx]; if (m) { m.used = true; m.summary = S.a.ort; }
  weiter();
}
function kontaktAbsenden(f, idx) {
  const name = feld(f, 'name').slice(0, 80), telefon = feld(f, 'telefon').slice(0, 40), email = feld(f, 'email').slice(0, 100);
  const erreichbar = (f.querySelector('[name=erreichbar]:checked') || {}).value || '';
  const err = f.querySelector('.err');
  if (!name) { err.textContent = 'Bitte Ihren Namen eintragen.'; f.querySelector('[name=name]').focus(); return; }
  if (S.a.wunsch === 'Rückruf' && !telefon) { err.textContent = 'Für den Rückruf brauchen wir Ihre Telefonnummer.'; f.querySelector('[name=telefon]').focus(); return; }
  if (S.a.wunsch === 'Angebot per E-Mail' && !email) { err.textContent = 'Für das Angebot brauchen wir Ihre E-Mail-Adresse.'; f.querySelector('[name=email]').focus(); return; }
  if (!telefon && !email) { err.textContent = 'Bitte Telefon oder E-Mail eintragen.'; f.querySelector('[name=telefon]').focus(); return; }
  if (telefon && telefon.replace(/\D/g, '').length < 6) { err.textContent = 'Die Telefonnummer sieht zu kurz aus.'; f.querySelector('[name=telefon]').focus(); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Die E-Mail-Adresse sieht nicht vollständig aus.'; f.querySelector('[name=email]').focus(); return; }
  Object.assign(S.a, { name, telefon, email, erreichbar }); S.entwurf = null;
  const m = S.log[idx]; if (m) { m.used = true; m.summary = [name, telefon, email, erreichbar && 'erreichbar ' + erreichbar].filter(Boolean).join(' · '); }
  weiter();
}
function absenden(f, idx) {
  const err = f.querySelector('.err');
  if (!f.querySelector('[name=ok]').checked) { err.textContent = 'Bitte kurz zustimmen, dass der Betrieb Ihre Angaben für die Anfrage speichern darf.'; return; }
  const a = S.a, b = B(), x = S.auswertung || { dringlichkeit: 'normal', zusammenfassung: lokaleZusammenfassung(), rueckfragen: [] };
  const r = {
    id: uid(), createdAt: new Date().toISOString(), kanal: 'Website', status: 'neu', beispiel: false, quelle: 'anfrage',
    kunde: { name: a.name, kontakt: a.telefon || a.email }, telefon: a.telefon || '', email: a.email || '', erreichbar: a.erreichbar || '',
    branche: b.id, betriebName: b.name, anliegen: anl() ? anl().name : '', liste: angabenListe(), beschreibung: a.beschreibung || '', ort: a.ort || '',
    dringlichkeit: x.dringlichkeit, zusammenfassung: x.zusammenfassung, rueckfragen: x.rueckfragen, kiZusammenfassung: !!x.ki, wunsch: a.wunsch || '',
    fotos: S.fotos.slice(0, 3), leistung: '', fahrzeug: null, preis: null, termin: a.wunsch === 'Termin online buchen' ? 'bucht online' : '',
    verlauf: S.log.filter(m => m.text && !m.typing && m.card !== 'warnung').map(m => ({ von: m.from === 'bot' ? 'Assistent' : 'Kunde', text: String(m.text).slice(0, 600) })).slice(-30)
  };
  const m = S.log[idx]; if (m) m.used = true;
  speichere(r); zaehle('anfrage'); zaehle('anf_fertig');
  user('Anfrage absenden');
  S.step = 'fertig';
  bot(`Danke, ${a.name.split(' ')[0]}! Ihre Anfrage ist bei ${b.name} angekommen.`, { card: 'fertig' });
  bot('Haben Sie noch eine Frage? Schreiben Sie sie einfach unten rein.', { chips: (a.wunsch === 'Termin online buchen' ? [ch('Jetzt Termin buchen', 'termin-link')] : []).concat([ch('Neue Anfrage', 'neu'), ch('So sieht es der Betrieb', 'chef')]) });
  zeigeFortschritt(); render();
  toast('Abgeschickt. Unter „So sieht es der Betrieb“ sehen Sie, was ankommt.');
}

/* ---------- Freie Eingabe ---------- */
const istFrage = t => /\?\s*$/.test(t) || /^(wie|was|wann|wo|wer|warum|wieso|kann|können|könnt|gibt|habt|haben sie|macht|machen|kommt|kommen|ist|sind|bietet|bieten)\b/i.test(t);
async function eingabe(t) {
  t = t.trim().slice(0, 600); if (!t || S.busy) return;
  if (S.step === 'beschreibung' && !istFrage(t)) {
    S.a.beschreibung = ((S.a.beschreibung ? S.a.beschreibung + ' ' : '') + t).slice(0, 1200); user(t); zaehleStart();
    const hinweis = sicherheitshinweis(S.betrieb, t);
    if (hinweis && hinweis !== S.warnung) { S.warnung = hinweis; bot('', { card: 'warnung', text: hinweis }); }
    const m = [...S.log].reverse().find(x => x.card === 'fotos' && !x.used);
    if (m) { m.used = true; }
    bot('Danke, hab ich notiert. Möchten Sie noch Fotos anhängen?', { card: 'fotos', chips: [] });
    aktualisiereFotoChips(S.log[S.log.length - 1]); render(); return;
  }
  if (FRAGEN[S.step] && !istFrage(t) && t.length <= 80) {
    const m = [...S.log].reverse().find(x => x.chips && !x.used); if (m) m.used = true;
    setzeAntwort(t); return;
  }
  user(t); S.fragen.push(t.slice(0, 200));
  await kiFrage(t);
  neuZeigen();
}
function neuZeigen() {
  if (S.step === 'fertig') { render(); return; }
  const offen = [...S.log].reverse().find(m => (m.chips || m.card) && !m.used);
  if (offen && S.log.indexOf(offen) === S.log.length - 1) { render(); return; }
  if (S.step === 'zusammenfassung') { bot('Stimmt die Zusammenfassung oben so?', { chips: [ch('Ja, stimmt', 'stimmt'), ch('Etwas ergänzen', 'ergaenzen')] }); if (offen) offen.used = true; render(); return; }
  if (offen) offen.used = true;
  frage(S.step);
}
async function kiFrage(t) {
  S.busy = true; const warte = bot('', { typing: true }); render();
  let text = null;
  if (S.ki !== false) {
    const r = await rufe('/api/demo/betrieb-frage', { nachricht: t, betrieb: S.betrieb, seite: 'anfrage', kontext: { anliegen: anl() ? anl().name : '' }, verlauf: S.verlauf.slice(-6) }, 15000);
    if (r && r.demo) S.ki = false;
    else if (r && r.text) { text = r.text; if (!r.limit) S.ki = true; }
  }
  if (!text) text = lokaleAntwort(t);
  S.verlauf.push({ role: 'user', content: t }, { role: 'assistant', content: text });
  S.log.splice(S.log.indexOf(warte), 1);
  bot(text); S.busy = false; kiStatus(); render();
}
function lokaleAntwort(t) {
  const s = t.toLowerCase(), b = B();
  const h = sicherheitshinweis(S.betrieb, t); if (h) return h + ' Rufen Sie uns bei einem Notfall bitte direkt an: ' + TEL + ' (Beispielnummer).';
  if (/kost|preis|teuer|euro|€|angebot/.test(s)) return 'Den Preis nennt Ihnen das Team im Angebot, bei Arbeiten vor Ort meist nach einer kurzen Besichtigung.';
  if (/öffnungs|geöffnet|offen|erreichbar|wann (habt|haben|seid|sind)/.test(s)) return `Wir sind ${b.zeitenText} für Sie da.`;
  if (/adresse|wo (seid|sind|finde)|standort/.test(s)) return `Sie finden uns hier: ${b.adresse} (Beispieladresse).`;
  if (/kommt ihr|kommen sie|umkreis|gebiet|auch nach|fahrt/.test(s)) return b.gebiet + '.';
  if (/wann|wie schnell|wie lange|zeit|termin/.test(s)) return 'Das Team meldet sich in der Regel am selben oder nächsten Werktag. Einen Termin können Sie am Ende auch direkt online buchen.';
  if (/mensch|bot|ki\b|roboter|echt/.test(s)) return 'Ich bin ein Assistent mit KI. Jede Anfrage liest ein Mensch aus dem Team.';
  if (/foto|bild/.test(s)) return 'Fotos können Sie gleich bei der Beschreibung anhängen, bis zu drei Stück.';
  return 'Das klärt das Team gern persönlich mit Ihnen.';
}

/* ---------- Anzeige ---------- */
function zeilen() {
  const a = S.a, z = [];
  z.push(['Anliegen', anl() ? anl().name : '–', 'anliegen']);
  for (const [lbl, v] of angabenListe()) z.push([lbl, v, (anl().fragen.find(f => FRAGEN[f].label === lbl))]);
  z.push(['Beschreibung', a.beschreibung || 'keine', 'beschreibung']);
  z.push(['Fotos', S.fotos.length ? S.fotos.length + (S.fotos.length === 1 ? ' Foto' : ' Fotos') : 'keine', 'beschreibung']);
  if (B().ortFragen) z.push(['Ort', a.ort || '–', 'ort']);
  z.push(['Wie weiter', a.wunsch || '–', 'wunsch']);
  z.push(['Name', a.name || '–', 'kontakt']);
  if (a.telefon) z.push(['Telefon', a.telefon, 'kontakt']);
  if (a.email) z.push(['E-Mail', a.email, 'kontakt']);
  if (a.erreichbar) z.push(['Erreichbar', a.erreichbar, 'kontakt']);
  return z;
}
const DLABEL = { notfall: 'Notfall', dringend: 'Dringend', normal: 'Normal' };
function karte(m, i) {
  if (m.card === 'warnung') return `<div class="card af-warn" role="alert"><b>Wichtig</b><div>${esc(m.text)}</div><a class="btn af-call" href="tel:${TEL.replace(/\s/g, '')}">Anrufen ${TEL}</a><div class="note">Beispielnummer der Vorführung.</div></div>`;
  if (m.card === 'fotos') {
    if (!S.fotos.length || m.used) return m.used && S.fotos.length && m === [...S.log].reverse().find(x => x.card === 'fotos') ? `<div class="af-photos">${S.fotos.map(u => `<img src="${esc(u)}" alt="Ihr Foto">`).join('')}</div>` : '';
    return `<div class="af-photos">${S.fotos.map((u, k) => `<span class="af-ph"><img src="${esc(u)}" alt="Ihr Foto ${k + 1}"><button type="button" class="af-ph-x" data-act="foto-weg" data-val="${k}" data-idx="${i}" aria-label="Foto ${k + 1} entfernen">×</button></span>`).join('')}</div>`;
  }
  if (m.card === 'verstanden') {
    const x = S.auswertung || {};
    return `<div class="card af-sum"><div>${esc(x.zusammenfassung || '')}</div>
      <div class="af-tags"><span class="af-d af-d-${esc(x.dringlichkeit || 'normal')}">${esc(DLABEL[x.dringlichkeit] || 'Normal')}</span>${S.fotos.length ? `<span class="af-tag">${S.fotos.length} ${S.fotos.length === 1 ? 'Foto' : 'Fotos'}</span>` : ''}${S.a.ort ? `<span class="af-tag">${esc(S.a.ort)}</span>` : ''}</div></div>`;
  }
  if (m.card === 'ort') {
    if (m.used) return `<div class="card"><div class="note">Ort</div><div>${esc(m.summary || '')}</div></div>`;
    const e = Object.assign({ plz: S.a.plz || '', ort: S.a.ortName || '' }, S.entwurf || {});
    return `<form class="card" data-form="ort" data-idx="${i}" novalidate>
      <div class="tm-row"><label>PLZ<input type="text" name="plz" inputmode="numeric" autocomplete="postal-code" maxlength="5" value="${esc(e.plz)}" placeholder="78000"></label>
      <label>Ort<input type="text" name="ort" autocomplete="address-level2" value="${esc(e.ort)}" placeholder="Musterstadt"></label></div>
      <div class="note">${esc(B().gebiet)}. Die genaue Adresse klärt das Team später.</div>
      <div class="err" role="alert"></div><button class="btn primary" type="submit">Weiter</button></form>`;
  }
  if (m.card === 'kontakt') {
    if (m.used) return `<div class="card"><div class="note">Kontakt</div><div>${esc(m.summary || '')}</div></div>`;
    const a = Object.assign({}, S.a, S.entwurf || {});
    return `<form class="card" data-form="kontakt" data-idx="${i}" novalidate>
      <label>Vor- und Nachname<input type="text" name="name" autocomplete="name" value="${esc(a.name || '')}" placeholder="z. B. Alex Muster"></label>
      <label>Telefon${S.a.wunsch === 'Angebot per E-Mail' ? ' <small>(freiwillig)</small>' : ''}<input type="tel" name="telefon" autocomplete="tel" inputmode="tel" value="${esc(a.telefon || '')}" placeholder="z. B. 0170 1234567"></label>
      <label>E-Mail${S.a.wunsch === 'Rückruf' ? ' <small>(freiwillig)</small>' : ''}<input type="email" name="email" autocomplete="email" inputmode="email" value="${esc(a.email || '')}" placeholder="z. B. alex@example.org"></label>
      ${S.a.wunsch === 'Rückruf' ? `<fieldset class="bw-pills"><legend>Wann erreichen wir Sie am besten? (freiwillig)</legend>
        ${['vormittags', 'nachmittags', 'ab 17 Uhr', 'egal'].map(v => `<label><input type="radio" name="erreichbar" value="${esc(v)}" ${a.erreichbar === v ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</fieldset>` : ''}
      <div class="err" role="alert"></div><button class="btn primary" type="submit">Weiter</button></form>`;
  }
  if (m.card === 'pruefen') {
    const z = zeilen();
    const tab = `<dl class="bw-check">${z.map(([k, v, step]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd>${step && !m.used ? `<button type="button" class="bw-edit" data-act="aendern" data-val="${esc(step)}" data-idx="${i}" aria-label="${esc(k)} ändern">Ändern</button>` : ''}</div>`).join('')}</dl>`;
    if (m.used) return `<div class="card">${tab}</div>`;
    return `<form class="card" data-form="pruefen" data-idx="${i}" novalidate>${tab}
      <label class="check"><input type="checkbox" name="ok"><span>${esc(B().name)} darf meine Angaben und Fotos für diese Anfrage speichern. <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutz</a></span></label>
      <div class="err" role="alert"></div><button class="btn primary" type="submit">Anfrage absenden</button>
      <div class="note">Vorführung: Es wird nichts verschickt, alles bleibt in diesem Browser. Bitte keine echten Daten eingeben.</div></form>`;
  }
  if (m.card === 'fertig') {
    const d = (S.auswertung || {}).dringlichkeit;
    const w = S.a.wunsch;
    return `<div class="card bw-done"><b>So geht es weiter</b><ol>
      <li>${d === 'notfall' ? 'Ihre Anfrage ist als Notfall markiert und steht beim Team ganz oben.' : 'Das Team sieht Ihre Anfrage sofort, mit allen Angaben und Fotos.'}</li>
      <li>${w === 'Rückruf' ? `Sie bekommen einen Rückruf${S.a.erreichbar && S.a.erreichbar !== 'egal' ? `, möglichst ${esc(S.a.erreichbar)}` : ''}.` : w === 'Angebot per E-Mail' ? 'Sie bekommen das Angebot per E-Mail. Fehlt etwas, meldet sich das Team kurz.' : `Buchen Sie jetzt noch Ihren Termin: ${esc(terminArt(B(), B().terminVorschlag).name)}.`}</li></ol>
      <div class="note">Notfall? Bitte direkt anrufen: ${TEL} (Beispielnummer).</div></div>`;
  }
  return '';
}
function render() {
  const log = $('#afLog');
  const f = log.querySelector('form[data-form="kontakt"], form[data-form="ort"]');
  if (f) { const e = {}; f.querySelectorAll('input[name]').forEach(x => { if (x.type !== 'radio' || x.checked) e[x.name] = x.value; }); S.entwurf = e; }
  log.innerHTML = S.log.map((m, i) => {
    let inner = '';
    if (m.typing) inner = '<div class="bubble"><span class="typing" aria-label="schreibt"><i></i><i></i><i></i></span></div>';
    else if (m.text && m.card !== 'warnung') inner = `<div class="bubble">${esc(m.text)}</div>`;
    if (m.card) inner += karte(m, i);
    if (m.chips && m.chips.length && !m.used) inner += `<div class="chips">${m.chips.map(c => `<button type="button" class="chip${c.act === 'zurueck' ? ' bw-zurueck' : ''}" data-act="${esc(c.act)}" data-val="${esc(c.val)}" data-idx="${i}" ${S.busy ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
    return inner ? `<div class="msg ${m.from}">${inner}</div>` : '';
  }).join('');
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/* ---------- Ereignisse ---------- */
$('#afLog').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  aktion(b.dataset.act, b.dataset.val, Number(b.dataset.idx));
});
$('#afLog').addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault(); const idx = Number(f.dataset.idx);
  if (f.dataset.form === 'ort') ortAbsenden(f, idx);
  if (f.dataset.form === 'kontakt') kontaktAbsenden(f, idx);
  if (f.dataset.form === 'pruefen') absenden(f, idx);
});
$('#afForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#afText'); const t = i.value; i.value = ''; eingabe(t); });
let neuArmed = 0;
function confirmNeu() {
  if (Date.now() - neuArmed < 4000) return true;
  neuArmed = Date.now(); toast('Nochmal tippen, um von vorn anzufangen. Ihre Angaben gehen dabei verloren.'); return false;
}
$('#afRestart').addEventListener('click', () => { if (S.step !== 'fertig' && S.a.anliegen && !confirmNeu()) return; start(false); });
function setzeBetrieb(id, neu) {
  if (!BETRIEBE[id]) id = 'fahrzeug';
  S.betrieb = id; ls.set(DKEY, id);
  const b = B(); const app = $('#afApp');
  app.style.setProperty('--mf-brand', b.farbe); app.style.setProperty('--mf-brand-2', b.farbe2);
  $('#afName').textContent = b.name; $('#afLogo').textContent = b.logo;
  document.querySelectorAll('.bw-b').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.betrieb === id)));
  try { const u = new URL(location.href); u.searchParams.set('betrieb', id); history.replaceState(null, '', u); } catch (e) { /* egal */ }
  start(neu);
}
document.querySelector('.bw-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-betrieb]'); if (!b || b.dataset.betrieb === S.betrieb) return;
  if (S.step !== 'fertig' && S.a.anliegen && !confirmNeu()) return;
  setzeBetrieb(b.dataset.betrieb, false);
});

/* ---------- Start ---------- */
const setH = () => document.documentElement.style.setProperty('--toph', $('.bw-top').offsetHeight + 'px');
setH(); window.addEventListener('resize', setH);
setzeBetrieb(new URLSearchParams(location.search).get('betrieb') || ls.get(DKEY) || 'maler', true);
kiStatus();
