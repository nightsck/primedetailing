// Termin-Bot der Vorführseite (/demo/termin/).
// Kunde wählt Terminart, Tag und Uhrzeit selbst, der Bot fragt nur, was fehlt.
// Mit verbundenem Google Kalender kommen freie Zeiten und Buchung vom Server
// (/api/demo/termin/…). Ohne Kalender rechnet die Seite selbst und speichert
// nur in diesem Browser. Freie Fragen beantwortet die KI (/api/demo/betrieb-frage).
import { BETRIEBE, terminArt, terminZeitraum, freieZeiten, verstehWunsch, heute, plusTage, wochentag } from './betriebe.js';

/* ---------- Hilfen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const API = (document.body.dataset.api || '').replace(/\/+$/, '');
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const tagKurz = d => `${WD[wochentag(d)]} ${+d.slice(8)}.${+d.slice(5, 7)}.`;
const tagLang = d => `${WDL[wochentag(d)]}, ${+d.slice(8)}. ${MON[+d.slice(5, 7) - 1]}`;
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3800); }
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher */ } }
};
async function rufe(pfad, body, ms = 15000) {
  if (!API) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + pfad, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal });
    const j = await r.json().catch(() => null);
    return j ? Object.assign({ _status: r.status }, j) : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

/* ---------- Speicher (gemeinsam mit /demo, Tab „Chef“) ---------- */
const TKEY = 'af-demo-termine-v1', ZKEY = 'af-demo-zaehler-v1', DKEY = 'af-demo-termin-betrieb';
const liste = () => { try { const a = JSON.parse(ls.get(TKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const speichereListe = l => ls.set(TKEY, JSON.stringify(l.slice(0, 200)));
function zaehle(k) {
  let z = { zahl: {}, zeit: {} };
  try { const o = JSON.parse(ls.get(ZKEY) || 'null'); if (o && typeof o === 'object') z = { zahl: o.zahl || {}, zeit: o.zeit || {} }; } catch (e) { /* neu */ }
  z.zahl[k] = (z.zahl[k] || 0) + 1; ls.set(ZKEY, JSON.stringify(z));
}
// Ohne Kalender: Buchungen aus diesem Browser gelten als belegt
const lokalBelegt = id => liste().filter(t => t.betrieb === id && !t.abgesagt && !t.kalender).map(t => ({ start: t.start, ende: t.ende }));

/* ---------- Zustand ---------- */
const S = { betrieb: 'fahrzeug', log: [], step: '', a: {}, busy: false, verlauf: [], kalender: null, kalFehler: false, ki: null,
  woche: '', tage: [], tag: '', teil: '', laedt: false, gezaehlt: false, zurPruefung: false, buchung: null, entwurf: null };
const B = () => BETRIEBE[S.betrieb];
const art = () => terminArt(B(), S.a.termin);
const vorOrt = () => { const t = art(); return !!t && t.ort === 'kunde'; };
const bot = (text, o = {}) => { const m = Object.assign({ from: 'bot', text }, o); S.log.push(m); return m; };
const user = text => { S.log.push({ from: 'user', text }); };
const ch = (label, act, val) => ({ label, act, val: val == null ? '' : val });
function schliesseOffene() { S.log.forEach(m => { if ((m.chips || m.card) && !m.used) m.used = true; }); }

function plan() { return ['termin', 'zeit', ...(vorOrt() ? ['adresse'] : []), 'kontakt', 'pruefen']; }
const NAMEN = { termin: 'Was', zeit: 'Wann', adresse: 'Wo', kontakt: 'Kontakt', pruefen: 'Prüfen und buchen' };
function zeigeFortschritt() {
  const p = plan(); const fertig = S.step === 'fertig';
  const n = fertig ? p.length : Math.max(1, p.indexOf(S.step) + 1);
  $('#tmBar').style.width = (fertig ? 100 : (n - 1) / p.length * 100 + 6) + '%';
  $('#tmStep').textContent = fertig ? 'Fertig · Termin gebucht' : `Schritt ${n} von ${p.length} · ${NAMEN[S.step] || ''}`;
  $('#tmText').placeholder = S.step === 'zeit' ? 'Oder schreiben Sie z. B. „Dienstag nachmittag“' : 'Frage stellen, z. B. wie lange es dauert';
}
function status() {
  const el = $('#tmState'); if (!el) return;
  el.textContent = S.kalender === true ? 'Verbunden mit dem Kalender des Betriebs' : S.kalender === false ? 'Vorführung ohne Kalender: Termine bleiben in diesem Browser' : '';
}

/* ---------- Ablauf ---------- */
function start(neu = true) {
  Object.assign(S, { log: [], a: {}, busy: false, verlauf: [], woche: '', tage: [], tag: '', teil: '', gezaehlt: false, zurPruefung: false, buchung: null, entwurf: null });
  const b = B();
  bot(`Guten Tag! Hier buchen Sie Ihren Termin bei ${b.name} direkt, ohne Anruf. Ich bin ein Assistent mit KI und beantworte zwischendurch gern Ihre Fragen.`);
  const vorgabe = new URLSearchParams(location.search).get('termin');
  if (neu && vorgabe && terminArt(b, vorgabe)) { S.a.termin = vorgabe; user(art().name); frage('zeit'); }
  else frage('termin');
  if (neu) zaehle('termin_offen');
}
function zurueckChip() { const p = plan(); return p.indexOf(S.step) > 0 ? [ch('Zurück', 'zurueck')] : []; }
function frage(step) {
  S.step = step;
  if (step === 'termin') {
    bot('Wofür möchten Sie einen Termin?', { chips: B().termine.map(t => ch(t.name, 'termin', t.id)), hint: B().termine.map(t => `${t.name}: ${t.kurz}`) });
  } else if (step === 'zeit') {
    const t = art();
    bot(t.ganztag ? `Wann möchten Sie das Auto bringen? ${t.kurz}.` : `Wann passt es Ihnen? Tippen Sie auf einen Tag und eine Uhrzeit.${t.ort === 'kunde' ? ' Die Fahrzeit zu Ihnen ist schon eingeplant.' : ''}`, { card: 'zeit', chips: zurueckChip() });
    if (!S.tage.length || S.tageFuer !== S.betrieb + '/' + S.a.termin) ladeWoche(S.a.datum && S.a.datum >= heute() ? S.a.datum : heute(), { waehle: S.a.datum || 'erster' });
  } else if (step === 'adresse') {
    bot('Wo sollen wir hinkommen?', { card: 'adresse', chips: zurueckChip() });
  } else if (step === 'kontakt') {
    bot(art().ort === 'telefon' ? 'Unter welcher Nummer erreichen wir Sie?' : 'Wie erreichen wir Sie, falls etwas dazwischenkommt?', { card: 'kontakt', chips: zurueckChip() });
  } else if (step === 'pruefen') {
    bot('Bitte kurz prüfen. Sie können alles noch ändern.', { card: 'pruefen', chips: zurueckChip() });
  }
  zeigeFortschritt(); render();
}
function weiter() {
  if (S.zurPruefung) { S.zurPruefung = false; frage('pruefen'); return; }
  const p = plan(); frage(p[p.indexOf(S.step) + 1] || 'pruefen');
}
function zaehleStart() { if (!S.gezaehlt) { S.gezaehlt = true; zaehle('termin_start'); } }

/* ---------- Freie Zeiten laden ---------- */
async function ladeWoche(von, { waehle = '' } = {}) {
  const b = B(), t = art(); if (!t) return;
  const h = heute();
  if (von < h) von = h;
  const grenze = plusTage(h, b.horizont);
  if (von > grenze) von = grenze;
  S.woche = von; S.laedt = true; S.tageFuer = b.id + '/' + t.id; render();
  let tage = null;
  if (API && S.kalender !== false) {
    const r = await rufe(`/api/demo/termin/zeiten?betrieb=${encodeURIComponent(b.id)}&termin=${encodeURIComponent(t.id)}&von=${von}&tage=7`);
    if (r && r.ok && r.kalender && Array.isArray(r.tage)) { tage = r.tage; S.kalender = true; }
    else if (r && r.ok && r.kalender === false) S.kalender = false;
    else if (!S.kalFehler) { S.kalFehler = true; S.kalender = false; bot('Der Kalender des Betriebs ist gerade nicht erreichbar. Ich zeige Ihnen die Zeiten im Vorführmodus, die Buchung bleibt dann in diesem Browser.'); }
  } else if (!API) S.kalender = false;
  if (!tage) tage = freieZeiten(b, t.id, { von, tage: 7, belegt: lokalBelegt(b.id) });
  // Seite inzwischen gewechselt? Dann verwerfen.
  if (S.tageFuer !== b.id + '/' + t.id || S.woche !== von) return;
  S.tage = tage; S.laedt = false; status();
  const mitSlots = tage.filter(x => x.slots.length);
  if (waehle === 'erster') S.tag = (mitSlots[0] || {}).datum || '';
  else if (waehle && tage.some(x => x.datum === waehle)) S.tag = waehle;
  else if (!tage.some(x => x.datum === S.tag)) S.tag = (mitSlots[0] || {}).datum || '';
  render();
  return tage;
}
// Sucht ab einem Tag (höchstens bis zum Ende des Buchungszeitraums) den ersten Tag mit freien Zeiten
async function naechsterFreier(ab, teil = '') {
  let von = ab;
  for (let i = 0; i < 6; i++) {
    const tage = await ladeWoche(von, { waehle: von });
    if (!tage) return null;
    const hit = tage.find(x => x.datum >= ab && passend(x.slots, teil).length);
    if (hit) { S.tag = hit.datum; render(); return hit.datum; }
    von = plusTage(von, 7);
    if (von > plusTage(heute(), B().horizont)) break;
  }
  return null;
}
const passend = (slots, teil, ab = null) => slots.filter(z => {
  const m = +z.slice(0, 2) * 60 + +z.slice(3);
  if (ab !== null && m < ab) return false;
  return !teil || (teil === 'vormittag' ? m < 720 : m >= 720);
});

/* ---------- Aktionen ---------- */
function aktion(act, val, idx) {
  const m = S.log[idx]; if (!m || S.busy) return;
  if (m.used && !['woche', 'tag', 'teil'].includes(act)) return;
  const chip = (m.chips || []).find(c => c.act === act && String(c.val) === String(val));
  if (act === 'woche') { ladeWoche(plusTage(S.woche, Number(val) * 7), { waehle: 'erster' }); return; }
  if (act === 'tag') { S.tag = val; render(); return; }
  if (act === 'teil') { S.teil = S.teil === val ? '' : val; render(); return; }
  if (act === 'zurueck') {
    m.used = true; user('Zurück');
    const p = plan(); frage(p[Math.max(0, p.indexOf(S.step) - 1)]); return;
  }
  if (act === 'aendern') { m.used = true; S.zurPruefung = !['termin'].includes(val); user('Ändern: ' + (NAMEN[val] || val)); frage(val); return; }
  if (act === 'neu') { m.used = true; start(false); return; }
  if (act === 'chef') { location.href = '/demo/#termine'; return; }
  if (act === 'ics') { icsLaden(); return; }
  if (act === 'absagen') { absagen(m); return; }
  if (act === 'absagen-ja') { absagenJa(m); return; }
  m.used = true;
  if (act === 'termin') {
    const alt = S.a.termin; S.a.termin = val; user(chip ? chip.label : val); zaehleStart();
    if (alt !== val) { S.tage = []; S.a.datum = ''; S.a.zeit = ''; S.zurPruefung = false; S.teil = ''; }
    frage('zeit'); return;
  }
  if (act === 'zeit') {
    const [d, z] = String(val).split('|'); S.a.datum = d; S.a.zeit = z;
    const t = art(); user(t.ganztag ? `${tagLang(d)}, bringen um ${z} Uhr` : `${tagLang(d)}, ${z} Uhr`); zaehleStart();
    weiter(); return;
  }
}

/* ---------- Formulare ---------- */
const feld = (f, n) => (f.querySelector(`[name=${n}]`) || {}).value || '';
function adresseAbsenden(f, idx) {
  const strasse = feld(f, 'strasse').trim().slice(0, 100), plz = feld(f, 'plz').trim(), ort = feld(f, 'ort').trim().slice(0, 60);
  const err = f.querySelector('.err');
  if (!strasse) { err.textContent = 'Bitte Straße und Hausnummer eintragen.'; f.querySelector('[name=strasse]').focus(); return; }
  if (!/^\d{5}$/.test(plz)) { err.textContent = 'Die Postleitzahl hat 5 Ziffern.'; f.querySelector('[name=plz]').focus(); return; }
  if (!ort) { err.textContent = 'Bitte den Ort eintragen.'; f.querySelector('[name=ort]').focus(); return; }
  S.a.adresse = { strasse, plz, ort }; S.entwurf = null;
  const m = S.log[idx]; if (m) { m.used = true; m.summary = `${strasse}, ${plz} ${ort}`; }
  weiter();
}
function kontaktAbsenden(f, idx) {
  const name = feld(f, 'name').trim().slice(0, 80), telefon = feld(f, 'telefon').trim().slice(0, 40), email = feld(f, 'email').trim().slice(0, 100);
  const notiz = feld(f, 'notiz').trim().slice(0, 500), details = feld(f, 'details').trim().slice(0, 120);
  const err = f.querySelector('.err');
  const mussTel = art().ort === 'telefon';
  if (!name) { err.textContent = 'Bitte Ihren Namen eintragen.'; f.querySelector('[name=name]').focus(); return; }
  if (mussTel && !telefon) { err.textContent = 'Für den Rückruf brauchen wir Ihre Telefonnummer.'; f.querySelector('[name=telefon]').focus(); return; }
  if (!telefon && !email) { err.textContent = 'Bitte Telefon oder E-Mail eintragen.'; f.querySelector('[name=telefon]').focus(); return; }
  if (telefon && telefon.replace(/\D/g, '').length < 6) { err.textContent = 'Die Telefonnummer sieht zu kurz aus.'; f.querySelector('[name=telefon]').focus(); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Die E-Mail-Adresse sieht nicht vollständig aus.'; f.querySelector('[name=email]').focus(); return; }
  Object.assign(S.a, { name, telefon, email, notiz, details }); S.entwurf = null;
  const m = S.log[idx]; if (m) { m.used = true; m.summary = [name, telefon, email].filter(Boolean).join(' · '); }
  weiter();
}

/* ---------- Buchen ---------- */
function zeitText(a = S.a) {
  const t = terminArt(B(), a.termin); if (!t || !a.datum) return '–';
  const z = terminZeitraum(B(), t.id, a.datum, a.zeit); if (!z) return '–';
  if (t.ganztag) return `${tagLang(a.datum)}, bringen um ${z.zeit} Uhr${t.ganztag > 1 ? `, fertig nach ${t.ganztag} Arbeitstagen` : ', abholen am Abend'}`;
  const ende = new Date(z.ende); const bis = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(ende);
  return `${tagLang(a.datum)}, ${z.zeit}–${bis} Uhr`;
}
function ortText(a = S.a) {
  const t = terminArt(B(), a.termin); if (!t) return '';
  if (t.ort === 'kunde') return a.adresse ? `Bei Ihnen: ${a.adresse.strasse}, ${a.adresse.plz} ${a.adresse.ort}` : 'Bei Ihnen';
  if (t.ort === 'telefon') return `Wir rufen Sie an${a.telefon ? ': ' + a.telefon : ''}`;
  return `${B().name}, ${B().adresse}`;
}
async function buchen(f, idx) {
  const err = f.querySelector('.err');
  if (!f.querySelector('[name=ok]').checked) { err.textContent = 'Bitte kurz zustimmen, dass der Betrieb Ihre Angaben für den Termin speichern darf.'; return; }
  const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Wird gebucht …';
  S.busy = true;
  const a = S.a, b = B(), t = art();
  const z = terminZeitraum(b, t.id, a.datum, a.zeit);
  // Ohne Kalender: noch frei in diesem Browser?
  const body = { betrieb: b.id, termin: t.id, datum: a.datum, zeit: a.zeit, name: a.name, telefon: a.telefon, email: a.email, adresse: a.adresse || null, notiz: a.notiz, details: a.details, einwilligung: true };
  let r = S.kalender === false || !API ? null : await rufe('/api/demo/termin/buchen', body, 20000);
  S.busy = false;
  if (r && r.belegt) {
    btn.disabled = false; btn.textContent = 'Termin buchen';
    const m = S.log[idx]; if (m) m.used = true;
    bot('Diese Zeit hat sich gerade jemand anderes geschnappt. Bitte wählen Sie eine andere.');
    S.tage = []; S.a.zeit = ''; frage('zeit'); return;
  }
  if (r && !r.ok) {
    btn.disabled = false; btn.textContent = 'Termin buchen';
    err.textContent = r.fehler || 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
    if (r.fehler && /Kalender/.test(r.fehler)) { S.kalender = false; status(); err.textContent += ' Tippen Sie noch einmal auf „Termin buchen“, dann wird er in der Vorführung nur in diesem Browser gespeichert.'; }
    return;
  }
  const imKalender = !!(r && r.ok && r.kalender);
  if (!imKalender) {
    const frei = freieZeiten(b, t.id, { von: a.datum, tage: 1, belegt: lokalBelegt(b.id) })[0];
    if (!frei || !frei.slots.includes(z.zeit)) {
      btn.disabled = false; btn.textContent = 'Termin buchen';
      const m = S.log[idx]; if (m) m.used = true;
      bot('Diese Zeit ist inzwischen nicht mehr frei. Bitte wählen Sie eine andere.'); S.tage = []; frage('zeit'); return;
    }
    if (S.kalender !== false) { S.kalender = false; status(); }
  }
  const eintrag = {
    id: uid(), createdAt: new Date().toISOString(), betrieb: b.id, betriebName: b.name, termin: t.id, terminName: t.name, ort: t.ort,
    datum: a.datum, zeit: z.zeit, start: z.start, ende: z.ende, zeitText: zeitText(), ortText: ortText(),
    name: a.name, telefon: a.telefon || '', email: a.email || '', adresse: a.adresse || null, notiz: a.notiz || '', details: a.details || '',
    kalender: imKalender, token: imKalender ? r.token : '', abgesagt: false
  };
  const l = liste(); l.unshift(eintrag); speichereListe(l);
  S.buchung = eintrag; zaehle('termin');
  const m = S.log[idx]; if (m) m.used = true;
  user('Termin buchen');
  S.step = 'fertig';
  bot(`Danke, ${a.name.split(' ')[0]}! Ihr Termin steht.`, { card: 'fertig' });
  bot('Haben Sie noch eine Frage? Schreiben Sie sie einfach unten rein.', { chips: [ch('Neuen Termin buchen', 'neu'), ch('So sieht es der Betrieb', 'chef')] });
  zeigeFortschritt(); render();
  toast(imKalender ? 'Gebucht. Der Termin steht jetzt im Kalender des Betriebs.' : 'Gebucht. Unter „So sieht es der Betrieb“ sehen Sie, was ankommt.');
}
function absagen(m) { m.frageAbsage = true; render(); }
async function absagenJa(m) {
  const t = S.buchung; if (!t || t.abgesagt) return;
  S.busy = true; render();
  if (t.kalender && t.token) {
    const r = await rufe('/api/demo/termin/absagen', { token: t.token });
    if (!r || !r.ok) { S.busy = false; m.frageAbsage = false; render(); toast((r && r.fehler) || 'Absagen hat nicht geklappt. Bitte rufen Sie kurz an.'); return; }
  }
  S.busy = false;
  t.abgesagt = true;
  const l = liste(); const x = l.find(y => y.id === t.id); if (x) { x.abgesagt = true; speichereListe(l); }
  m.frageAbsage = false; render();
  bot('Ihr Termin ist abgesagt. Möchten Sie einen neuen buchen?', { chips: [ch('Neuen Termin buchen', 'neu')] }); render();
}
function icsLaden() {
  const t = S.buchung; if (!t) return;
  const f = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const txt = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Auftragsfaenger//Termin-Bot//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${t.id}@termin-bot`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(t.start)}`, `DTEND:${f(t.ende)}`,
    `SUMMARY:${txt(t.terminName + ' bei ' + t.betriebName)}`, `LOCATION:${txt(t.ortText)}`, `DESCRIPTION:${txt('Gebucht über den Termin-Bot. ' + t.betriebName + ', ' + B().zeitenText)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Erinnerung', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'termin.ics'; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- Freie Eingabe ---------- */
async function eingabe(t) {
  t = t.trim().slice(0, 400); if (!t || S.busy) return;
  // Im Schritt „Wann“: Wunschtermin verstehen
  if (S.step === 'zeit') {
    const w = verstehWunsch(t);
    if (w) {
      user(t); zaehleStart();
      S.teil = w.teil || ''; S.ab = w.ab;
      const ziel = w.datum || S.tag || heute();
      const h = heute(), grenze = plusTage(h, B().horizont);
      S.busy = true; render();
      let text;
      try {
        const teilT = S.teil === 'vormittag' ? ' vormittags' : S.teil === 'nachmittag' ? ' nachmittags' : '';
        if (w.datum && w.datum < h) { await naechsterFreier(h, S.teil); text = 'Der Tag ist schon vorbei. Hier sind die nächsten freien Zeiten.'; }
        else if (w.datum && w.datum > grenze) { await naechsterFreier(plusTage(grenze, -6), S.teil); text = `Online buchen geht bis ${tagLang(grenze)}. Für später rufen Sie uns gern an.`; }
        else {
          const tage = await ladeWoche(ziel, { waehle: ziel });
          const tag = (tage || []).find(x => x.datum === ziel);
          if (tag && passend(tag.slots, S.teil, w.ab).length) { S.tag = ziel; text = `${tagLang(ziel)}${teilT}: Tippen Sie auf eine Uhrzeit.`; }
          else {
            const naechster = await naechsterFreier(plusTage(ziel, tag && !tag.offen ? 0 : 1), S.teil);
            text = (tag && !tag.offen ? `${tagLang(ziel)} ist geschlossen.` : `${tagLang(ziel)}${teilT} ist leider nichts mehr frei.`)
              + (naechster ? ` Der nächste freie Termin${teilT} ist am ${tagLang(naechster)}.` : ' Rufen Sie uns gern an.');
          }
        }
      } finally { S.busy = false; S.ab = null; }
      // Den Kalender direkt unter der Antwort zeigen
      S.log.forEach(m => { if (m.card === 'zeit' && !m.used) m.used = true; });
      bot(text, { card: 'zeit', chips: zurueckChip() });
      render(); return;
    }
  }
  schliesseOffeneNicht();
  user(t);
  await kiFrage(t);
  neuZeigen();
}
function schliesseOffeneNicht() { /* offene Karten bleiben stehen, Eingaben darin gehen nicht verloren */ }
function neuZeigen() {
  // Nach einer Antwort den aktuellen Schritt wieder unten zeigen
  if (S.step === 'fertig') { render(); return; }
  const offen = [...S.log].reverse().find(m => (m.chips || m.card) && !m.used);
  if (offen && S.log.indexOf(offen) === S.log.length - 1) { render(); return; }
  if (offen) offen.used = true;
  frage(S.step);
}
async function kiFrage(t) {
  S.busy = true; const warte = bot('', { typing: true }); render();
  let text = null;
  if (API && S.ki !== false) {
    const r = await rufe('/api/demo/betrieb-frage', { nachricht: t, betrieb: S.betrieb, seite: 'termin', kontext: { termin: art() ? art().name : '' }, verlauf: S.verlauf.slice(-6) });
    if (r && r.demo) S.ki = false;
    else if (r && r.text) { text = r.text; if (!r.limit) S.ki = true; }
  }
  if (!text) text = lokaleAntwort(t);
  S.verlauf.push({ role: 'user', content: t }, { role: 'assistant', content: text });
  S.log.splice(S.log.indexOf(warte), 1);
  bot(text); S.busy = false; kiStatus(); render();
}
function lokaleAntwort(t) {
  const s = t.toLowerCase(), b = B(), a = art();
  if (/kost|preis|teuer|euro|€/.test(s)) return 'Preise nennt Ihnen das Team gern persönlich, bei Arbeiten vor Ort nach der Besichtigung.';
  if (/absag|verschieb|stornier|kann ich nicht/.test(s)) return 'Nach der Buchung bekommen Sie einen Knopf zum Absagen. Verschieben geht, indem Sie absagen und neu buchen, oder kurz anrufen.';
  if (/öffnungs|geöffnet|offen|wann (habt|haben|seid|sind)/.test(s)) return `Wir sind ${b.zeitenText} für Sie da.`;
  if (/adresse|wo (seid|sind|finde)|anfahrt|standort/.test(s)) return `Sie finden uns hier: ${b.adresse} (Beispieladresse).`;
  if (/wie lange|dauer|dauert/.test(s)) return a ? `${a.name}: ${a.kurz}.` : b.termine.map(x => `${x.name}: ${x.kurz}`).join('. ') + '.';
  if (/kommt ihr|fahrt ihr|umkreis|gebiet|auch nach/.test(s)) return b.gebiet + '.';
  if (/mensch|bot|ki\b|roboter|echt/.test(s)) return 'Ich bin ein Assistent mit KI. Ihren Termin sieht sofort ein Mensch aus dem Team.';
  if (/brand|funken|rauch|schmor/.test(s)) return 'Bitte zuerst die Sicherung ausschalten und nichts anfassen. Bei Feuer oder Rauch sofort 112 anrufen. Für einen Notfall rufen Sie uns bitte direkt an statt zu buchen.';
  return 'Das klärt das Team gern persönlich mit Ihnen. Den Termin können Sie trotzdem schon buchen.';
}
function kiStatus() { /* Status zeigt den Kalender, die KI fällt still auf feste Antworten zurück */ }

/* ---------- Anzeige ---------- */
function zeilen() {
  const a = S.a, t = art(), z = [];
  z.push(['Termin', t ? t.name : '–', 'termin']);
  z.push(['Wann', zeitText(), 'zeit']);
  z.push(['Wo', ortText(), t && t.ort === 'kunde' ? 'adresse' : null]);
  z.push(['Name', a.name || '–', 'kontakt']);
  if (a.telefon) z.push(['Telefon', a.telefon, 'kontakt']);
  if (a.email) z.push(['E-Mail', a.email, 'kontakt']);
  if (a.details) z.push([S.betrieb === 'fahrzeug' ? 'Fahrzeug' : 'Worum geht es', a.details, 'kontakt']);
  if (a.notiz) z.push(['Notiz', a.notiz, 'kontakt']);
  return z;
}
function zeitKarte(m, i) {
  if (m.used) return S.a.datum && S.a.zeit ? '' : '';
  const b = B(), t = art(); if (!t) return '';
  const h = heute(), grenze = plusTage(h, b.horizont);
  const kopf = `<div class="tm-week"><button type="button" class="tm-nav" data-act="woche" data-val="-1" data-idx="${i}" ${S.woche <= h || S.laedt ? 'disabled' : ''} aria-label="Frühere Tage">‹</button>
    <span>${S.woche ? `${tagKurz(S.woche)} bis ${tagKurz(plusTage(S.woche, 6))}` : ''}</span>
    <button type="button" class="tm-nav" data-act="woche" data-val="1" data-idx="${i}" ${plusTage(S.woche, 7) > grenze || S.laedt ? 'disabled' : ''} aria-label="Spätere Tage">›</button></div>`;
  if (S.laedt && !S.tage.length) return `<div class="card tm-pick">${kopf}<div class="tm-load">Freie Zeiten werden geladen …</div></div>`;
  const tage = `<div class="tm-days" role="group" aria-label="Tag wählen">${S.tage.map(x => {
    const n = x.slots.length;
    return `<button type="button" class="tm-day" data-act="tag" data-val="${x.datum}" data-idx="${i}" aria-pressed="${x.datum === S.tag}" ${n ? '' : 'data-leer="1"'}>
      <span class="tm-wd">${WD[x.wd]}</span><b>${+x.datum.slice(8)}.${+x.datum.slice(5, 7)}.</b><small>${!x.offen ? 'zu' : n ? (t.ganztag ? 'frei' : n + ' frei') : x.datum === heute() ? '–' : 'voll'}</small></button>`;
  }).join('')}</div>`;
  const tag = S.tage.find(x => x.datum === S.tag);
  let slots = '';
  if (!S.tage.some(x => x.slots.length)) slots = `<div class="tm-leer">In diesen Tagen ist nichts mehr frei. <button type="button" class="bw-x" data-act="woche" data-val="1" data-idx="${i}">Spätere Tage ansehen</button></div>`;
  else if (!tag) slots = '<div class="tm-leer">Bitte einen Tag wählen.</div>';
  else if (!tag.slots.length) slots = `<div class="tm-leer">${tag.offen ? 'An diesem Tag ist nichts mehr frei.' : 'An diesem Tag ist geschlossen.'}</div>`;
  else if (t.ganztag) slots = `<div class="tm-slots"><button type="button" class="tm-slot" data-act="zeit" data-val="${tag.datum}|${tag.slots[0]}" data-idx="${i}">Bringen um ${tag.slots[0]} Uhr</button></div>`;
  else {
    const vm = tag.slots.filter(z => z < '12:00'), nm = tag.slots.filter(z => z >= '12:00');
    const gruppe = (titel, key, liste) => liste.length ? `<div class="tm-group${S.teil && S.teil !== key ? ' tm-dim' : ''}"><div class="tm-gt">${titel}</div><div class="tm-slots">${liste.map(z => `<button type="button" class="tm-slot" data-act="zeit" data-val="${tag.datum}|${z}" data-idx="${i}">${z}</button>`).join('')}</div></div>` : '';
    slots = gruppe('Vormittag', 'vormittag', vm) + gruppe('Nachmittag', 'nachmittag', nm);
  }
  return `<div class="card tm-pick${S.laedt ? ' tm-busy' : ''}">${kopf}${tage}<div class="tm-dayname">${tag ? esc(tagLang(tag.datum)) : ''}</div>${slots}
    <div class="note">${S.kalender === true ? 'Live aus dem Kalender des Betriebs.' : 'Vorführung: Zeiten nach Öffnungszeiten, Ihre Buchungen in diesem Browser zählen als belegt.'}</div></div>`;
}
function karte(m, i) {
  if (m.card === 'zeit') return zeitKarte(m, i);
  if (m.card === 'adresse') {
    if (m.used) return `<div class="card"><div class="note">Adresse</div><div>${esc(m.summary || '')}</div></div>`;
    const a = Object.assign({}, S.a.adresse || {}, S.entwurf || {});
    return `<form class="card" data-form="adresse" data-idx="${i}" novalidate>
      <label>Straße und Hausnummer<input type="text" name="strasse" autocomplete="street-address" value="${esc(a.strasse || '')}" placeholder="z. B. Lindenweg 4"></label>
      <div class="tm-row"><label>PLZ<input type="text" name="plz" inputmode="numeric" autocomplete="postal-code" maxlength="5" value="${esc(a.plz || '')}" placeholder="78000"></label>
      <label>Ort<input type="text" name="ort" autocomplete="address-level2" value="${esc(a.ort || '')}" placeholder="Musterstadt"></label></div>
      <div class="note">${esc(B().gebiet)}.</div>
      <div class="err" role="alert"></div>
      <button class="btn primary" type="submit">Weiter</button></form>`;
  }
  if (m.card === 'kontakt') {
    if (m.used) return `<div class="card"><div class="note">Kontakt</div><div>${esc(m.summary || '')}</div></div>`;
    const a = Object.assign({}, S.a, S.entwurf || {});
    const fz = S.betrieb === 'fahrzeug';
    return `<form class="card" data-form="kontakt" data-idx="${i}" novalidate>
      <label>Vor- und Nachname<input type="text" name="name" autocomplete="name" value="${esc(a.name || '')}" placeholder="z. B. Alex Muster"></label>
      <label>Telefon<input type="tel" name="telefon" autocomplete="tel" inputmode="tel" value="${esc(a.telefon || '')}" placeholder="z. B. 0170 1234567"></label>
      <label>E-Mail <small>(für die Bestätigung)</small><input type="email" name="email" autocomplete="email" inputmode="email" value="${esc(a.email || '')}" placeholder="z. B. alex@example.org"></label>
      <label>${fz ? 'Fahrzeug <small>(freiwillig)</small>' : 'Worum geht es? <small>(freiwillig)</small>'}<input type="text" name="details" value="${esc(a.details || '')}" placeholder="${fz ? 'z. B. VW Golf, schwarz' : S.betrieb === 'maler' ? 'z. B. Wohnzimmer und Flur streichen' : 'z. B. Sicherung fliegt im Bad raus'}" maxlength="120"></label>
      <label>Notiz <small>(freiwillig)</small><input type="text" name="notiz" value="${esc(a.notiz || '')}" placeholder="${S.betrieb === 'fahrzeug' ? 'z. B. Schlüssel liegt im Briefkasten' : 'z. B. Bitte hinten klingeln'}" maxlength="500"></label>
      <div class="err" role="alert"></div>
      <button class="btn primary" type="submit">Weiter</button></form>`;
  }
  if (m.card === 'pruefen') {
    const z = zeilen();
    const tab = `<dl class="bw-check">${z.map(([k, v, step]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd>${step && !m.used ? `<button type="button" class="bw-edit" data-act="aendern" data-val="${esc(step)}" data-idx="${i}" aria-label="${esc(k)} ändern">Ändern</button>` : ''}</div>`).join('')}</dl>`;
    if (m.used) return `<div class="card">${tab}</div>`;
    return `<form class="card" data-form="pruefen" data-idx="${i}" novalidate>${tab}
      <label class="check"><input type="checkbox" name="ok"><span>${esc(B().name)} darf meine Angaben für diesen Termin speichern. <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutz</a></span></label>
      <div class="err" role="alert"></div>
      <button class="btn primary" type="submit">Termin buchen</button>
      <div class="note">${S.kalender === true ? 'Vorführung mit echtem Kalender: Bitte keine echten Daten eingeben.' : 'Vorführung: Es wird nichts verschickt, alles bleibt in diesem Browser.'}</div></form>`;
  }
  if (m.card === 'fertig') {
    const t = S.buchung; if (!t) return '';
    if (t.abgesagt) return `<div class="card tm-done tm-abgesagt"><b>Abgesagt</b><div>${esc(t.terminName)} · ${esc(t.zeitText)}</div></div>`;
    return `<div class="card tm-done"><div class="tm-ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><b>${esc(t.terminName)}</b></div>
      <dl class="bw-check"><div><dt>Wann</dt><dd>${esc(t.zeitText)}</dd></div><div><dt>Wo</dt><dd>${esc(t.ortText)}</dd></div></dl>
      <div class="note">${t.kalender ? 'Der Termin steht jetzt im Kalender des Betriebs.' : 'Vorführung: Der Termin ist nur in diesem Browser gespeichert.'} ${t.email ? 'Eine Bestätigung per E-Mail wäre im echten Betrieb schon unterwegs.' : ''}</div>
      ${m.frageAbsage ? `<div class="tm-confirm">Termin wirklich absagen? <button type="button" class="btn danger" data-act="absagen-ja" data-idx="${i}" ${S.busy ? 'disabled' : ''}>Ja, absagen</button></div>` : ''}
      <div class="chips"><button type="button" class="chip" data-act="ics" data-idx="${i}">In meinen Kalender</button><button type="button" class="chip bw-zurueck" data-act="absagen" data-idx="${i}" ${m.frageAbsage ? 'disabled' : ''}>Termin absagen</button></div></div>`;
  }
  return '';
}
function render() {
  const log = $('#tmLog');
  const f = log.querySelector('form[data-form="kontakt"], form[data-form="adresse"]');
  if (f) { const e = {}; f.querySelectorAll('input[name]').forEach(x => { e[x.name] = x.value; }); S.entwurf = e; }
  const scrollen = !log.querySelector('.tm-pick') || S.renderScroll !== false;
  log.innerHTML = S.log.map((m, i) => {
    let inner = '';
    if (m.typing) inner = '<div class="bubble"><span class="typing" aria-label="schreibt"><i></i><i></i><i></i></span></div>';
    else if (m.text) inner = `<div class="bubble">${esc(m.text)}</div>`;
    if (m.hint && !m.used) inner += `<ul class="bw-hint">${m.hint.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`;
    if (m.card) inner += karte(m, i);
    if (m.chips && m.chips.length && !m.used) inner += `<div class="chips">${m.chips.map(c => `<button type="button" class="chip${c.act === 'zurueck' ? ' bw-zurueck' : ''}" data-act="${esc(c.act)}" data-val="${esc(c.val)}" data-idx="${i}" ${S.busy ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
    return inner ? `<div class="msg ${m.from}${m.card === 'zeit' ? ' tm-wide' : ''}">${inner}</div>` : '';
  }).join('');
  if (scrollen) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/* ---------- Ereignisse ---------- */
$('#tmLog').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  // Tag wählen oder blättern soll die Ansicht nicht nach unten springen lassen
  S.renderScroll = !['tag', 'woche', 'teil'].includes(b.dataset.act);
  aktion(b.dataset.act, b.dataset.val, Number(b.dataset.idx));
  S.renderScroll = true;
});
$('#tmLog').addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const idx = Number(f.dataset.idx);
  if (f.dataset.form === 'adresse') adresseAbsenden(f, idx);
  if (f.dataset.form === 'kontakt') kontaktAbsenden(f, idx);
  if (f.dataset.form === 'pruefen') buchen(f, idx);
});
$('#tmForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#tmText'); const t = i.value; i.value = ''; eingabe(t); });
let neuArmed = 0;
function confirmNeu() {
  if (Date.now() - neuArmed < 4000) return true;
  neuArmed = Date.now(); toast('Nochmal tippen, um von vorn anzufangen. Ihre Angaben gehen dabei verloren.'); return false;
}
const unterwegs = () => !['termin', 'fertig'].includes(S.step) || S.a.termin;
$('#tmRestart').addEventListener('click', () => { if (S.step !== 'fertig' && unterwegs() && !confirmNeu()) return; start(false); });
function setzeBetrieb(id, neu) {
  if (!BETRIEBE[id]) id = 'fahrzeug';
  S.betrieb = id; ls.set(DKEY, id);
  const b = B(); const app = $('#tmApp');
  app.style.setProperty('--mf-brand', b.farbe); app.style.setProperty('--mf-brand-2', b.farbe2);
  $('#tmName').textContent = b.name; $('#tmLogo').textContent = b.logo;
  document.querySelectorAll('.bw-b').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.betrieb === id)));
  try { const u = new URL(location.href); u.searchParams.set('betrieb', id); if (!neu) u.searchParams.delete('termin'); history.replaceState(null, '', u); } catch (e) { /* egal */ }
  S.tage = []; S.tageFuer = '';
  start(neu);
}
document.querySelector('.bw-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-betrieb]'); if (!b || b.dataset.betrieb === S.betrieb) return;
  if (S.step !== 'fertig' && S.a.termin && !confirmNeu()) return;
  setzeBetrieb(b.dataset.betrieb, false);
});

/* ---------- Start ---------- */
const setH = () => document.documentElement.style.setProperty('--toph', $('.bw-top').offsetHeight + 'px');
setH(); window.addEventListener('resize', setH);
const q = new URLSearchParams(location.search).get('betrieb');
setzeBetrieb(q || ls.get(DKEY) || 'fahrzeug', true);
// Kalender schon vorab prüfen, damit der Hinweis unten stimmt
if (API) rufe(`/api/demo/termin/zeiten?betrieb=${S.betrieb}&termin=${B().termine[0].id}&tage=1`).then(r => { if (r && r.ok && S.kalender === null) { S.kalender = !!r.kalender; status(); render(); } });
else { S.kalender = false; status(); }
