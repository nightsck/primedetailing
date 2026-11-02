// Bewerber-Chat auf primedetailing.eu/jobs/.
// Ablauf per Knopfdruck, freie Fragen beantwortet die KI (/api/jobs/frage).
// Die KI bewertet niemanden und sieht weder Angaben noch Unterlagen.
// Unterlagen gehen an den Chat-Server (/api/jobs/datei), die Bewerbung selbst
// per Web3Forms an support@ – mit Download-Links zu den Unterlagen.
// Kein Speichern im Browser, keine Cookies, kein Tracking.
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#jbApp');
if (!app) return;
const D = JSON.parse($('#jbDaten').textContent);
const API = (D.api || '').replace(/\/+$/, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kb = n => n >= 1048576 ? (n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
let toastT;
function toast(t) { const el = $('#jbToast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3800); }
function mitFrist(url, opt, ms) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  return fetch(url, Object.assign({ signal: ctl.signal }, opt)).finally(() => clearTimeout(tm));
}

/* ---------- Fragen (Auswahl je Stelle im CMS) ---------- */
const OPT = {
  erfahrung: { text: 'Hast du schon Erfahrung mit Autopflege oder Aufbereitung?', label: 'Erfahrung', opts: [['ja, beruflich', 'Ja, beruflich'], ['privat, am eigenen Auto', 'Privat, am eigenen Auto'], ['noch keine', 'Noch keine, will es lernen']] },
  fuehrerschein: { text: 'Hast du einen Führerschein Klasse B?', label: 'Führerschein B', opts: [['ja', 'Ja'], ['in Arbeit', 'Bin gerade dabei'], ['nein', 'Nein']] },
  wochenende: { text: 'Kannst du auch am Wochenende?', label: 'Wochenende', opts: [['ja, gerne', 'Ja, gerne'], ['manchmal', 'Manchmal'], ['eher nicht', 'Eher nicht']] },
  stunden: { text: 'Wie viele Stunden pro Woche ungefähr?', label: 'Stunden pro Woche', opts: [['bis 5', 'Bis 5'], ['5 bis 10', '5 bis 10'], ['mehr als 10', 'Mehr als 10']] },
  start: { text: 'Ab wann könntest du anfangen?', label: 'Anfangen', opts: [['sofort', 'Sofort'], ['in etwa einem Monat', 'In etwa einem Monat'], ['später, nach Absprache', 'Später, nach Absprache']] },
  praktikum_art: { text: 'Was für ein Praktikum suchst du?', label: 'Praktikum', opts: [['Schulpraktikum', 'Schulpraktikum'], ['Pflichtpraktikum (Ausbildung/Studium)', 'Für Ausbildung oder Studium'], ['freiwillig', 'Freiwillig, zum Reinschnuppern']] },
  zeitraum: { text: 'Wann soll das Praktikum sein?', label: 'Zeitraum', opts: [['in den nächsten Ferien', 'In den nächsten Ferien'], ['in den nächsten 3 Monaten', 'In den nächsten 3 Monaten'], ['später, nach Absprache', 'Später, nach Absprache']] }
};
const STELLEN = (D.stellen || []).map(s => Object.assign({}, s, { fragen: (s.fragen || []).filter(f => OPT[f]) }));
const ERREICHBAR = ['vormittags', 'nachmittags', 'ab 17 Uhr', 'egal'];
const MAX_DATEIEN = 5, MAX_GROESSE = 10 * 1048576;
const SCHRITTE = ['Stelle', 'Ein paar Fragen', 'Über dich', 'Kontakt', 'Prüfen und abschicken'];

/* ---------- Zustand ---------- */
const S = { log: [], step: '', pos: 0, plan: [], a: {}, dateien: [], busy: false, zurPruefung: false, fragen: [], ki: null, verlauf: [], entwurf: null };
const stelle = () => STELLEN.find(s => s.id === S.a.stelle);
const bot = (text, o = {}) => { const m = Object.assign({ from: 'bot', text }, o); S.log.push(m); return m; };
const user = text => { S.log.push({ from: 'user', text }); };
const ch = (label, act, val) => ({ label, act, val: val == null ? '' : val });
function schliesseOffene() { S.log.forEach(m => { if ((m.chips || m.card) && !m.done) m.used = true; }); }

function plane() {
  const st = stelle();
  S.plan = ['stelle', ...(st ? st.fragen : []), 'ueber', 'kontakt', 'unterlagen', 'pruefen'];
}
function schrittNr(step) {
  if (step === 'stelle') return 1;
  if (OPT[step]) return 2;
  if (step === 'ueber') return 3;
  if (step === 'kontakt') return 4;
  return 5;
}
function zeigeFortschritt() {
  const fertig = S.step === 'fertig', n = fertig ? 5 : schrittNr(S.step);
  $('#jbBar').style.width = (fertig ? 100 : (n - 1) / 5 * 100 + 6) + '%';
  $('#jbStep').textContent = fertig ? 'Fertig · Bewerbung abgeschickt' : `Schritt ${n} von 5 · ${SCHRITTE[n - 1]}`;
  $('#jbText').placeholder = S.step === 'ueber' ? 'Ein, zwei Sätze über dich' : 'Frag einfach, z. B. nach Arbeitszeiten';
}

/* ---------- Ablauf ---------- */
function start() {
  S.log = []; S.a = {}; S.entwurf = null; S.dateien = []; S.pos = 0; S.busy = false; S.zurPruefung = false; S.fragen = []; S.verlauf = [];
  plane();
  bot(`Hi! Schön, dass du bei ${D.name} mitmachen willst. Bewerben dauert hier etwa drei Minuten, ohne Anschreiben. Ich bin ein Assistent mit KI und beantworte dir zwischendurch gern Fragen. Deine Bewerbung lesen wir selbst.`);
  frage('stelle');
}
function zurueckChip() { return S.pos > 0 && S.step !== 'pruefen' ? [ch('Zurück', 'zurueck')] : []; }
function dateiChips() {
  const laedt = S.dateien.some(d => d.status === 'laedt');
  return [ch(S.dateien.length ? 'Noch eine Datei' : 'Dateien auswählen', 'datei'), ch(laedt ? 'Weiter (lädt noch)' : S.dateien.length ? 'Weiter' : 'Ohne Unterlagen weiter', 'unterlagen-weiter')].concat(zurueckChip());
}
function frage(step) {
  S.step = step; S.pos = S.plan.indexOf(step);
  if (step === 'stelle') {
    bot('Für welche Stelle möchtest du dich bewerben?', { chips: STELLEN.map(s => ch(s.name, 'stelle', s.id)), hint: STELLEN.map(s => `${s.name}: ${s.umfang}`) });
  } else if (OPT[step]) {
    const o = OPT[step];
    bot(o.text, { chips: o.opts.map(x => ch(x[1], step, x[0])).concat(zurueckChip()) });
  } else if (step === 'ueber') {
    bot('Magst du noch kurz was über dich erzählen? Zum Beispiel, was du gerade machst oder warum dich Autopflege interessiert. Schreib es einfach unten rein. Ist freiwillig.', { chips: [ch('Überspringen', 'ueber', '')].concat(zurueckChip()) });
    setTimeout(() => $('#jbText').focus({ preventScroll: true }), 50);
  } else if (step === 'kontakt') {
    bot('Wie erreichen wir dich? Telefon oder E-Mail reicht.', { card: 'kontakt', chips: zurueckChip() });
  } else if (step === 'unterlagen') {
    bot(`Willst du Unterlagen anhängen? Lebenslauf, Zeugnisse oder ein Anschreiben, als PDF, Word-Datei oder Handyfoto. Ist freiwillig, bis zu ${MAX_DATEIEN} Dateien.`, { card: 'dateien', chips: dateiChips() });
  } else if (step === 'pruefen') {
    bot('Fast geschafft. Schau nochmal drüber, du kannst alles ändern.', { card: 'pruefen' });
  }
  zeigeFortschritt(); render();
}
function weiter() {
  if (S.zurPruefung && S.step !== 'stelle') { S.zurPruefung = false; frage('pruefen'); return; }
  frage(S.plan[S.plan.indexOf(S.step) + 1]);
}

function aktion(act, val, idx) {
  const m = S.log[idx]; if (!m || m.used || S.busy) return;
  const chip = (m.chips || []).find(c => c.act === act && String(c.val) === String(val));
  if (act === 'datei') { $('#jbFiles').click(); return; }
  if (act === 'entfernen') { S.dateien.splice(Number(val), 1); m.chips = dateiChips(); render(); return; }
  if (act === 'zurueck') { m.used = true; user('Zurück'); frage(S.plan[Math.max(0, S.pos - 1)]); return; }
  if (act === 'aendern') {
    const row = zeilen().find(r => r[2] === val);
    m.used = true; S.zurPruefung = val !== 'stelle';
    user('Ändern: ' + (val === 'kontakt' ? 'Kontakt' : row ? row[0] : val)); frage(val); return;
  }
  if (act === 'neu') { m.used = true; start(); return; }
  if (act === 'nochmal') { m.used = true; frage('pruefen'); return; }
  m.used = true;
  if (act === 'stelle') {
    const alt = S.a.stelle; S.a.stelle = val; user(chip ? chip.label : (stelle() || {}).name || val);
    if (alt && alt !== val) { S.a = { stelle: val, ueber: S.a.ueber, name: S.a.name, telefon: S.a.telefon, email: S.a.email, erreichbar: S.a.erreichbar }; S.zurPruefung = false; }
    plane(); S.step = 'stelle'; weiter(); return;
  }
  if (OPT[act]) { S.a[act] = val; user(chip ? chip.label : val); weiter(); return; }
  if (act === 'ueber') { S.a.ueber = ''; user('Überspringen'); weiter(); return; }
  if (act === 'unterlagen-weiter') { const n = S.dateien.length; user(n ? `${n} ${n === 1 ? 'Datei' : 'Dateien'} angehängt` : 'Ohne Unterlagen weiter'); weiter(); return; }
}

/* ---------- Freie Eingabe: „Über dich“ oder Frage an die KI ---------- */
function offeneChipsNeu() {
  const offen = [...S.log].reverse().find(m => (m.chips || m.card) && !m.used);
  if (!offen) return;
  offen.used = true;
  frage(S.step);
}
async function eingabe(t) {
  t = t.trim().slice(0, 400); if (!t || S.busy) return;
  if (S.step === 'fertig') { schliesseOffene(); user(t); await kiFrage(t); render(); return; }
  if (S.step === 'ueber' && !/\?\s*$/.test(t)) {
    S.a.ueber = ((S.a.ueber ? S.a.ueber + ' ' : '') + t).slice(0, 600); user(t);
    const m = [...S.log].reverse().find(x => x.chips && !x.used); if (m) m.used = true;
    bot('Danke, hab ich notiert.'); weiter(); return;
  }
  user(t); S.fragen.push(t.slice(0, 200));
  await kiFrage(t);
  offeneChipsNeu();
}
async function kiFrage(t) {
  S.busy = true; const warte = bot('', { typing: true }); render();
  let text = null;
  if (API && S.ki !== false) {
    try {
      const r = await mitFrist(API + '/api/jobs/frage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nachricht: t, stelle: S.a.stelle || '', verlauf: S.verlauf.slice(-6) }) }, 15000);
      const j = await r.json().catch(() => null);
      if (j && j.demo) S.ki = false;
      else if (j && j.text) { text = j.text; if (!j.limit) S.ki = true; }
    } catch (e) { /* feste Antwort */ }
  }
  if (!text) text = lokaleAntwort(t);
  S.verlauf.push({ role: 'user', content: t }, { role: 'assistant', content: text });
  S.log.splice(S.log.indexOf(warte), 1);
  bot(text); S.busy = false; render();
}
function lokaleAntwort(t) {
  const s = t.toLowerCase(), st = stelle();
  if (/gehalt|lohn|verdien|geld|bezahl|stundenlohn/.test(s)) return 'Das hängt von der Stelle ab. Das besprechen wir offen mit dir im ersten Gespräch.';
  if (/arbeitszeit|uhrzeit|wann arbeit|samstag|wochenende|stunden/.test(s) && D.zeiten) return D.zeiten;
  if (/lebenslauf|zeugnis|anschreiben|unterlagen|dokument/.test(s)) return 'Brauchst du nicht unbedingt. Wenn du magst, kannst du gleich Lebenslauf oder Zeugnisse anhängen, auch als Handyfoto.';
  if (/wo |adresse|anfahrt|standort|wo seid|werkstatt/.test(s)) return `Wir sind mobil unterwegs und arbeiten direkt beim Kunden, in ${D.gebiet || 'der Region'}.`;
  if (/\bki\b|bot|mensch|computer/.test(s)) return 'Ich bin ein Assistent mit KI. Deine Bewerbung lesen wir selbst, ich bewerte und sortiere niemanden.';
  if (/wie lange|wann melde|antwort|rückmeld|dauert|wie geht/.test(s) && D.ablauf) return D.ablauf;
  if (/bietet|vorteil|benefits|was gibt/.test(s) && D.bietet) return D.bietet;
  if (/daten|lösch|datenschutz/.test(s)) return 'Deine Angaben bekommen nur wir. Sie werden nach 6 Monaten gelöscht, auf Wunsch auch früher.';
  if (st && /stelle|aufgabe|was mach|tätigkeit/.test(s)) return `${st.name}: ${st.text}`;
  return 'Gute Frage. Das beantworten wir dir am besten persönlich im Gespräch.';
}

/* ---------- Kontakt prüfen ---------- */
function kontaktAbsenden(form, idx) {
  const name = form.querySelector('[name=name]').value.trim().slice(0, 80);
  const telefon = form.querySelector('[name=telefon]').value.trim().slice(0, 40);
  const email = form.querySelector('[name=email]').value.trim().slice(0, 80);
  const erreichbar = (form.querySelector('[name=erreichbar]:checked') || {}).value || '';
  const err = form.querySelector('.jb-err');
  const telOk = !telefon || telefon.replace(/\D/g, '').length >= 6;
  const mailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!name) { err.textContent = 'Bitte deinen Namen eintragen.'; form.querySelector('[name=name]').focus(); return; }
  if (!telefon && !email) { err.textContent = 'Bitte Telefon oder E-Mail eintragen, damit wir uns melden können.'; form.querySelector('[name=telefon]').focus(); return; }
  if (!telOk) { err.textContent = 'Die Telefonnummer sieht zu kurz aus.'; form.querySelector('[name=telefon]').focus(); return; }
  if (!mailOk) { err.textContent = 'Die E-Mail-Adresse sieht nicht vollständig aus.'; form.querySelector('[name=email]').focus(); return; }
  Object.assign(S.a, { name, telefon, email, erreichbar }); S.entwurf = null;
  const m = S.log[idx]; if (m) { m.used = true; m.summary = [name, telefon, email, erreichbar && 'erreichbar ' + erreichbar].filter(Boolean).join(' · '); }
  weiter();
}

/* ---------- Unterlagen: gleich beim Auswählen hochladen ---------- */
function hochladen(d) {
  const fd = new FormData(); fd.append('datei', d.file, d.name);
  d.p = mitFrist(API + '/api/jobs/datei', { method: 'POST', body: fd }, 60000)
    .then(r => r.json().catch(() => ({ ok: false })))
    .then(j => { if (j && j.ok) { d.status = 'ok'; d.id = j.id; d.name = j.name; } else { d.status = 'fehler'; d.fehler = (j && j.text) || 'Hochladen hat nicht geklappt.'; } })
    .catch(() => { d.status = 'fehler'; d.fehler = 'Hochladen hat nicht geklappt. Prüf bitte deine Verbindung.'; })
    .finally(() => { d.file = null; const m = [...S.log].reverse().find(x => x.card === 'dateien' && !x.used); if (m) m.chips = dateiChips(); render(); });
}
$('#jbFiles').addEventListener('change', e => {
  const files = Array.from(e.target.files || []); e.target.value = '';
  if (!files.length) return;
  const erlaubt = f => /\.(pdf|jpe?g|png|heic|heif|docx)$/i.test(f.name) || /^(application\/pdf|image\/(jpeg|png|heic|heif))$/.test(f.type);
  const fehler = [];
  for (const f of files) {
    if (S.dateien.length >= MAX_DATEIEN) { fehler.push(`Mehr als ${MAX_DATEIEN} Dateien gehen nicht.`); break; }
    if (!erlaubt(f)) { fehler.push(`${f.name}: nur PDF, Word oder Fotos.`); continue; }
    if (f.size > MAX_GROESSE) { fehler.push(`${f.name}: größer als 10 MB.`); continue; }
    if (S.dateien.some(d => d.original === f.name && d.groesse === f.size)) continue;
    const d = { name: f.name.slice(0, 80), original: f.name, groesse: f.size, status: 'laedt', file: f };
    S.dateien.push(d);
    if (API) hochladen(d); else { d.status = 'fehler'; d.fehler = 'Hochladen geht gerade nicht.'; }
  }
  const m = [...S.log].reverse().find(x => x.card === 'dateien' && !x.used);
  if (m) { m.fehler = fehler.join(' '); m.chips = dateiChips(); }
  render();
});

/* ---------- Abschicken ---------- */
function mailFelder(links, linkFehler) {
  const a = S.a, st = stelle(), f = {};
  f['Stelle'] = st ? st.name : '–';
  f['Name'] = a.name; f['Telefon'] = a.telefon || '–'; f['E-Mail'] = a.email || '–'; f['Erreichbar'] = a.erreichbar || 'keine Angabe';
  if (st) for (const k of st.fragen) f[OPT[k].label] = (OPT[k].opts.find(x => x[0] === a[k]) || [a[k] || '–'])[0];
  f['Über mich'] = a.ueber || '–';
  const hoch = S.dateien.filter(d => d.status === 'ok').length;
  f['Unterlagen'] = links.length
    ? links.map(l => `${l.name} (${kb(l.groesse)}): ${l.url}`).join('\n') + '\n(Die Links funktionieren 6 Monate, dann werden die Dateien automatisch gelöscht.)'
    : hoch && linkFehler ? `${hoch} Datei(en) hochgeladen, aber die Links konnten nicht erstellt werden. Bitte beim Bewerber nachfragen.` : 'keine';
  if (S.fragen.length) f['Fragen an den Assistenten'] = S.fragen.join(' | ').slice(0, 500);
  return f;
}
function klartext(f) {
  return ['Hallo Prime Detailing, über die Website hat das Senden nicht geklappt. Hier meine Bewerbung:', ''].concat(Object.keys(f).filter(k => k !== 'Unterlagen' && k !== 'Fragen an den Assistenten').map(k => `${k}: ${f[k]}`)).join('\n');
}
async function abschicken(form, idx) {
  const ok = form.querySelector('[name=ok]').checked, err = form.querySelector('.jb-err');
  if (!ok) { err.textContent = 'Bitte kurz zustimmen, dass wir deine Angaben für die Bewerbung speichern dürfen.'; return; }
  const m = S.log[idx];
  S.busy = true; if (m) m.sending = true; render();

  await Promise.all(S.dateien.map(d => d.p).filter(Boolean));
  const ids = S.dateien.filter(d => d.status === 'ok').map(d => d.id);
  let links = [], linkFehler = false;
  if (ids.length) {
    try {
      const r = await mitFrist(API + '/api/jobs/absenden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateien: ids }) }, 15000);
      const j = await r.json(); if (j && j.ok) links = j.dateien || []; else linkFehler = true;
    } catch (e) { linkFehler = true; }
  }
  const felder = mailFelder(links, linkFehler);
  const st = stelle();
  let gesendet = false;
  try {
    const daten = Object.assign({ access_key: D.web3forms, subject: `Bewerbung: ${st ? st.name : 'Initiativ'} – ${S.a.name}`, from_name: 'Bewerber-Chat primedetailing.eu' }, S.a.email ? { replyto: S.a.email } : {}, felder);
    const r = await mitFrist('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(daten) }, 20000);
    const j = await r.json();
    gesendet = !!(j && (j.success === true || j.success === 'true'));
  } catch (e) { /* unten */ }

  S.busy = false; if (m) { m.sending = false; m.used = true; }
  if (!gesendet) {
    user('Bewerbung abschicken');
    bot('Das Senden hat gerade nicht geklappt. Damit nichts verloren geht, schick uns deine Bewerbung einfach direkt, sie ist schon ausgefüllt.', { card: 'fehler', text2: klartext(felder), chips: [ch('Nochmal versuchen', 'nochmal')] });
    render(); return;
  }
  user('Bewerbung abschicken');
  S.step = 'fertig';
  bot(`Danke, ${S.a.name.split(' ')[0]}! Deine Bewerbung ist bei uns angekommen.`, { card: 'fertig' });
  bot('Wenn du noch eine Frage hast, schreib sie einfach unten rein.');
  zeigeFortschritt(); render();
}

/* ---------- Anzeige ---------- */
function zeilen() {
  const a = S.a, st = stelle(), z = [];
  z.push(['Stelle', st ? st.name : '–', 'stelle']);
  if (st) for (const k of st.fragen) { const o = OPT[k]; z.push([o.label, (o.opts.find(x => x[0] === a[k]) || [0, a[k] || '–'])[1], k]); }
  z.push(['Über dich', a.ueber || 'nichts angegeben', 'ueber']);
  z.push(['Name', a.name || '–', 'kontakt']);
  z.push(['Telefon', a.telefon || '–', 'kontakt']);
  z.push(['E-Mail', a.email || '–', 'kontakt']);
  z.push(['Erreichbar', a.erreichbar || 'keine Angabe', 'kontakt']);
  const ok = S.dateien.filter(d => d.status !== 'fehler');
  z.push(['Unterlagen', ok.length ? ok.map(d => d.name).join(', ') : 'keine', 'unterlagen']);
  return z;
}
const ICON_DATEI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>';
function karte(m, i) {
  if (m.card === 'kontakt') {
    if (m.used) return `<div class="jb-card"><div class="jb-note">Kontakt</div><div>${esc(m.summary || '')}</div></div>`;
    const a = Object.assign({}, S.a, S.entwurf || {});
    return `<form class="jb-card" data-kontakt="${i}" novalidate>
      <label>Vor- und Nachname<input type="text" name="name" autocomplete="name" value="${esc(a.name || '')}" placeholder="z. B. Alex Muster"></label>
      <label>Telefon<input type="tel" name="telefon" autocomplete="tel" inputmode="tel" value="${esc(a.telefon || '')}" placeholder="z. B. 0170 1234567"></label>
      <label>E-Mail<input type="email" name="email" autocomplete="email" inputmode="email" value="${esc(a.email || '')}" placeholder="z. B. alex@example.org"></label>
      <fieldset class="jb-pills"><legend>Wann erreichen wir dich am besten? (freiwillig)</legend>
        ${ERREICHBAR.map(v => `<label><input type="radio" name="erreichbar" value="${esc(v)}" ${a.erreichbar === v ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}
      </fieldset>
      <div class="jb-err" role="alert"></div>
      <button class="btn btn-primary btn-sm" type="submit">Weiter</button>
    </form>`;
  }
  if (m.card === 'dateien') {
    if (!S.dateien.length && !m.fehler) return '';
    return `<div class="jb-card jb-files">${S.dateien.map((d, k) => `<div class="jb-file${d.status === 'fehler' ? ' bad' : ''}">${ICON_DATEI}<span>${esc(d.name)}</span><small>${d.status === 'laedt' ? 'lädt …' : d.status === 'fehler' ? esc(d.fehler) : esc(kb(d.groesse))}</small>${m.used ? '' : `<button type="button" class="jb-link" data-act="entfernen" data-val="${k}" data-idx="${i}" aria-label="${esc(d.name)} entfernen">Entfernen</button>`}</div>`).join('')}
      ${m.fehler ? `<div class="jb-err" role="alert">${esc(m.fehler)}</div>` : ''}
      <div class="jb-note">PDF, Word oder Foto, bis 10 MB pro Datei. Nur wir können die Dateien öffnen.</div></div>`;
  }
  if (m.card === 'pruefen') {
    const z = zeilen();
    const tab = `<dl class="jb-check">${z.map(([k, v, step]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd>${step && !m.used && !m.sending ? `<button type="button" class="jb-link" data-act="aendern" data-val="${esc(step)}" data-idx="${i}" aria-label="${esc(k)} ändern">Ändern</button>` : ''}</div>`).join('')}</dl>`;
    if (m.used) return `<div class="jb-card">${tab}</div>`;
    return `<form class="jb-card" data-pruefen="${i}" novalidate>${tab}
      <label class="jb-checkbox"><input type="checkbox" name="ok" ${m.sending ? 'checked disabled' : ''}><span>${esc(D.name)} darf meine Angaben und Unterlagen für diese Bewerbung speichern. Sie werden nach 6 Monaten gelöscht, auf Wunsch früher. <a href="/datenschutz/#bewerbungen" target="_blank" rel="noopener">Datenschutz</a></span></label>
      <div class="jb-err" role="alert"></div>
      <button class="btn btn-primary btn-sm" type="submit" ${m.sending ? 'disabled' : ''}>${m.sending ? 'Wird gesendet …' : 'Bewerbung abschicken'}</button>
    </form>`;
  }
  if (m.card === 'fertig') {
    return `<div class="jb-card jb-done"><b>So geht es weiter</b><p>${esc(D.ablauf)}</p>
      <div class="jb-note">Eine Bewertung durch die KI gibt es nicht. Deine Bewerbung lesen wir selbst.</div></div>`;
  }
  if (m.card === 'fehler') {
    const wa = D.whatsapp ? `https://wa.me/${D.whatsapp}?text=${encodeURIComponent(m.text2)}` : '';
    const mail = `mailto:${D.email}?subject=${encodeURIComponent('Bewerbung über die Website')}&body=${encodeURIComponent(m.text2)}`;
    return `<div class="jb-card"><div class="jb-row">${wa ? `<a class="btn btn-primary btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">Per WhatsApp senden</a>` : ''}<a class="btn btn-ghost btn-sm" href="${esc(mail)}">Per E-Mail senden</a></div>
      <div class="jb-note">Unterlagen kannst du dann einfach an die Nachricht hängen.</div></div>`;
  }
  return '';
}
function render() {
  const log = $('#jbLog');
  const f = log.querySelector('form[data-kontakt]');
  if (f) S.entwurf = { name: f.querySelector('[name=name]').value, telefon: f.querySelector('[name=telefon]').value, email: f.querySelector('[name=email]').value, erreichbar: (f.querySelector('[name=erreichbar]:checked') || {}).value || S.a.erreichbar };
  log.innerHTML = S.log.map((m, i) => {
    let inner = '';
    if (m.typing) inner = '<div class="jb-bubble"><span class="jb-typing" aria-label="schreibt"><i></i><i></i><i></i></span></div>';
    else if (m.text) inner = `<div class="jb-bubble">${esc(m.text)}</div>`;
    if (m.hint && !m.used) inner += `<ul class="jb-hint">${m.hint.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`;
    if (m.card) inner += karte(m, i);
    if (m.chips && m.chips.length && !(m.used && m.card === 'kontakt')) inner += `<div class="jb-chips">${m.chips.map(c => `<button type="button" class="jb-chip${c.act === 'zurueck' ? ' quiet' : ''}" data-act="${esc(c.act)}" data-val="${esc(c.val)}" data-idx="${i}" ${m.used || S.busy ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
    return `<div class="jb-msg ${m.from}">${inner}</div>`;
  }).join('');
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/* ---------- Ereignisse ---------- */
$('#jbLog').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  aktion(b.dataset.act, b.dataset.val, Number(b.dataset.idx));
});
$('#jbLog').addEventListener('submit', e => {
  const k = e.target.closest('form[data-kontakt]'), p = e.target.closest('form[data-pruefen]');
  if (k) { e.preventDefault(); kontaktAbsenden(k, Number(k.dataset.kontakt)); }
  if (p) { e.preventDefault(); if (!S.busy) abschicken(p, Number(p.dataset.pruefen)); }
});
$('#jbForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#jbText'); const t = i.value; i.value = ''; eingabe(t); });
let neuArmed = 0;
$('#jbRestart').addEventListener('click', () => {
  if (S.busy) return;
  if (S.step !== 'stelle' && S.step !== 'fertig' && Date.now() - neuArmed > 4000) { neuArmed = Date.now(); toast('Nochmal tippen, um von vorn anzufangen. Deine Angaben gehen dabei verloren.'); return; }
  start();
});
// „Bewerben“ bei einer Stelle in der Liste daneben
document.addEventListener('click', e => {
  const b = e.target.closest('[data-stelle]'); if (!b) return;
  e.preventDefault();
  app.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (S.step !== 'stelle') { if (S.a.stelle !== b.dataset.stelle) toast('Du bist schon mitten in einer Bewerbung. Mit dem Pfeil oben rechts fängst du neu an.'); return; }
  const m = [...S.log].reverse().find(x => x.chips && !x.used);
  if (m) aktion('stelle', b.dataset.stelle, S.log.indexOf(m));
});

/* ---------- Start ---------- */
start();
const q = new URLSearchParams(location.search).get('stelle');
if (q && STELLEN.some(s => s.id === q)) { const m = [...S.log].reverse().find(x => x.chips && !x.used); if (m) aktion('stelle', q, S.log.indexOf(m)); }
})();
