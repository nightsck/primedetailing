// Bewerber-Chat der Vorführseite (/demo/bewerben/).
// Ablauf per Knopfdruck, freie Fragen beantwortet die KI (/api/demo/bewerber-frage).
// Die KI bewertet niemanden und sieht die Angaben des Bewerbers nicht.
// Gespeichert wird nur in diesem Browser, in derselben Liste wie /demo (Tab „4 Bewerber“).
(() => {
'use strict';

/* ---------- Hilfen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const API = (document.body.dataset.api || '').replace(/\/+$/, '');
const kb = n => n >= 1048576 ? (n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3800); }
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher */ } }
};

/* ---------- Beispielbetriebe (passt zu chatbot/src/bewerber.ts) ---------- */
const OPT = {
  erfahrung: { text: 'Hast du schon Erfahrung in dem Bereich?', label: 'Erfahrung', opts: [['mehr als 2 Jahre', 'Ja, mehr als 2 Jahre'], ['bis 2 Jahre', 'Ja, ein bisschen'], ['noch keine', 'Noch keine, aber ich lerne schnell']] },
  buero: { text: 'Hast du schon im Büro gearbeitet?', label: 'Erfahrung im Büro', opts: [['mehr als 2 Jahre', 'Ja, mehr als 2 Jahre'], ['bis 2 Jahre', 'Ja, ein bisschen'], ['noch keine', 'Noch nicht, will es aber lernen']] },
  abschluss: { text: 'Welchen Schulabschluss hast du, oder machst du gerade?', label: 'Schulabschluss', opts: [['Hauptschulabschluss', 'Hauptschulabschluss'], ['Mittlere Reife', 'Mittlere Reife'], ['Abitur oder Fachabitur', 'Abi oder Fachabi'], ['noch in der Schule', 'Bin noch in der Schule']] },
  praktikum: { text: 'Hast du schon mal ein Praktikum in dem Bereich gemacht?', label: 'Praktikum', opts: [['ja', 'Ja'], ['nein, aber Interesse', 'Nein, hätte aber Lust'], ['nein', 'Nein']] },
  fuehrerschein: { text: 'Hast du einen Führerschein Klasse B?', label: 'Führerschein B', opts: [['ja', 'Ja'], ['in Arbeit', 'Bin gerade dabei'], ['nein', 'Nein']] },
  umfang: { text: 'Wie viel möchtest du arbeiten?', label: 'Umfang', opts: [['Vollzeit', 'Vollzeit'], ['Teilzeit', 'Teilzeit'], ['Minijob', 'Minijob']] },
  start: { text: 'Ab wann könntest du anfangen?', label: 'Anfangen', opts: [['sofort', 'Sofort'], ['in einem Monat', 'In etwa einem Monat'], ['später', 'Später, nach Absprache']] },
  startAusbildung: { text: 'Wann möchtest du anfangen?', label: 'Anfangen', opts: [['September dieses Jahr', 'Diesen September'], ['nächstes Jahr', 'Nächstes Jahr'], ['erst Praktikum', 'Erst mal ein Praktikum']] }
};
const INITIATIV = { id: 'initiativ', name: 'Initiativbewerbung', info: 'Du siehst nichts Passendes? Dann einfach so.', fragen: ['erfahrung', 'fuehrerschein', 'umfang', 'start'] };
const BETRIEBE = {
  fahrzeug: {
    name: 'Muster Fahrzeugpflege', logo: 'F', farbe: '#0F4C5C', farbe2: '#E7F0F1', zeiten: 'Mo–Fr 8–17 Uhr, samstags nur nach Absprache', adresse: 'Musterstraße 1, 78000 Musterstadt',
    bietet: 'Einarbeitung durch erfahrene Kollegen, Arbeitskleidung und Werkzeug stellen wir, feste Arbeitszeiten.',
    stellen: [
      { id: 'aufbereiter', name: 'Fahrzeugaufbereiter (m/w/d)', info: 'Vollzeit oder Teilzeit', fragen: ['erfahrung', 'fuehrerschein', 'umfang', 'start'], umfang: ['Vollzeit', 'Teilzeit'] },
      { id: 'aushilfe', name: 'Aushilfe samstags (m/w/d)', info: 'Minijob', fragen: ['erfahrung', 'start'], fest: { umfang: 'Minijob' } },
      { id: 'ausbildung', name: 'Ausbildung Fahrzeuglackierer (m/w/d)', info: '3 Jahre, ab September', fragen: ['abschluss', 'praktikum', 'startAusbildung'], fest: { umfang: 'Ausbildung' } },
      INITIATIV
    ]
  },
  maler: {
    name: 'Malerbetrieb Muster', logo: 'M', farbe: '#7A3B1D', farbe2: '#F5ECE6', zeiten: 'Mo–Fr 7–16 Uhr', adresse: 'Pinselweg 3, 78000 Musterstadt',
    bietet: 'Firmenwagen zur Baustelle, Arbeitskleidung, Weiterbildung zum Vorarbeiter möglich.',
    stellen: [
      { id: 'geselle', name: 'Maler und Lackierer Geselle (m/w/d)', info: 'Vollzeit', fragen: ['erfahrung', 'fuehrerschein', 'start'], fest: { umfang: 'Vollzeit' } },
      { id: 'helfer', name: 'Helfer auf der Baustelle (m/w/d)', info: 'Vollzeit oder Teilzeit, Quereinsteiger willkommen', fragen: ['erfahrung', 'fuehrerschein', 'umfang', 'start'], umfang: ['Vollzeit', 'Teilzeit'] },
      { id: 'ausbildung', name: 'Ausbildung Maler und Lackierer (m/w/d)', info: '3 Jahre, ab September', fragen: ['abschluss', 'praktikum', 'startAusbildung'], fest: { umfang: 'Ausbildung' } },
      INITIATIV
    ]
  },
  elektro: {
    name: 'Muster Elektrotechnik', logo: 'E', farbe: '#1D3F8A', farbe2: '#E8EDF7', zeiten: 'Mo–Do 7–16 Uhr, Fr 7–12 Uhr', adresse: 'Stromstraße 5, 78000 Musterstadt',
    bietet: 'Eigenes Werkzeug und Firmenwagen, Schulungen bei Herstellern, Freitag ab Mittag frei.',
    stellen: [
      { id: 'elektroniker', name: 'Elektroniker für Energie- und Gebäudetechnik (m/w/d)', info: 'Vollzeit', fragen: ['erfahrung', 'fuehrerschein', 'start'], fest: { umfang: 'Vollzeit' } },
      { id: 'buero', name: 'Bürokraft (m/w/d)', info: 'Teilzeit, vormittags', fragen: ['buero', 'start'], fest: { umfang: 'Teilzeit' } },
      { id: 'ausbildung', name: 'Ausbildung Elektroniker (m/w/d)', info: '3,5 Jahre, ab September', fragen: ['abschluss', 'praktikum', 'startAusbildung'], fest: { umfang: 'Ausbildung' } },
      INITIATIV
    ]
  }
};
const ERREICHBAR = ['vormittags', 'nachmittags', 'ab 17 Uhr', 'egal'];
const MAX_DATEIEN = 5, MAX_GROESSE = 10 * 1048576;
const SCHRITTE = ['Stelle', 'Ein paar Fragen', 'Über dich', 'Kontakt', 'Prüfen und abschicken'];

/* ---------- Speicher (gemeinsam mit /demo) ---------- */
const BKEY = 'af-demo-bewerbungen-v1', ZKEY = 'af-demo-zaehler-v1', DKEY = 'af-demo-bewerben-betrieb';
function zaehle(k) {
  let z = { zahl: {}, zeit: {} };
  try { const o = JSON.parse(ls.get(ZKEY) || 'null'); if (o && typeof o === 'object') z = { zahl: o.zahl || {}, zeit: o.zeit || {} }; } catch (e) { /* neu */ }
  z.zahl[k] = (z.zahl[k] || 0) + 1; ls.set(ZKEY, JSON.stringify(z));
}
function speichere(b) {
  let list = null;
  try { const a = JSON.parse(ls.get(BKEY) || 'null'); if (Array.isArray(a)) list = a; } catch (e) { /* neu */ }
  // Fehlt die Liste noch, legt /demo beim nächsten Öffnen die Beispiele an. Dann gehen die eigenen nicht verloren:
  if (!list) list = [];
  list.unshift(b); ls.set(BKEY, JSON.stringify(list.slice(0, 200)));
}

/* ---------- Zustand ---------- */
const S = { betrieb: 'fahrzeug', log: [], step: '', pos: 0, plan: [], a: {}, dateien: [], busy: false, gezaehlt: false, zurPruefung: false, fragen: [], ki: null, verlauf: [] };
const B = () => BETRIEBE[S.betrieb];
const stelle = () => B().stellen.find(s => s.id === S.a.stelle);
const bot = (text, o = {}) => { const m = Object.assign({ from: 'bot', text }, o); S.log.push(m); return m; };
const user = text => { S.log.push({ from: 'user', text }); };
const ch = (label, act, val) => ({ label, act, val: val == null ? '' : val });
function schliesseOffene() { S.log.forEach(m => { if ((m.chips || m.card) && !m.done) m.used = true; }); }

// Ablaufplan: Stelle → Fragen der Stelle → Über dich → Kontakt → Unterlagen → Prüfen
function plane() {
  const st = stelle();
  const fr = st ? st.fragen.filter(f => !(st.fest && st.fest[f === 'startAusbildung' ? 'start' : f])) : [];
  S.plan = ['stelle', ...fr, 'ueber', 'kontakt', 'unterlagen', 'pruefen'];
}
function schrittNr(step) {
  if (step === 'stelle') return 1;
  if (OPT[step]) return 2;
  if (step === 'ueber') return 3;
  if (step === 'kontakt') return 4;
  return 5;
}
function zeigeFortschritt() {
  const n = S.step === 'fertig' ? 5 : schrittNr(S.step);
  $('#bwBar').style.width = (S.step === 'fertig' ? 100 : (n - 1) / 5 * 100 + 6) + '%';
  $('#bwStep').textContent = S.step === 'fertig' ? 'Fertig · Bewerbung abgeschickt' : `Schritt ${n} von 5 · ${SCHRITTE[n - 1]}`;
  const t = $('#bwText');
  t.placeholder = S.step === 'ueber' ? 'Ein, zwei Sätze über dich' : 'Frag einfach, z. B. nach Arbeitszeiten';
}

/* ---------- Ablauf ---------- */
function start(neu = true) {
  S.log = []; S.a = {}; S.entwurf = null; S.dateien = []; S.pos = 0; S.busy = false; S.gezaehlt = false; S.zurPruefung = false; S.fragen = []; S.verlauf = [];
  plane();
  bot(`Hi! Schön, dass du dich für ${B().name} interessierst. Bewerben dauert hier etwa drei Minuten, ohne Anschreiben. Ich bin ein Assistent mit KI und beantworte dir zwischendurch gern Fragen. Ob es passt, entscheidet ein Mensch aus dem Team.`);
  frage('stelle');
  if (neu) zaehle('bew_offen');
}
function zurueckChip() { return S.pos > 0 && S.step !== 'pruefen' ? [ch('Zurück', 'zurueck')] : []; }
function frage(step) {
  S.step = step; S.pos = S.plan.indexOf(step);
  if (step === 'stelle') {
    bot('Für welche Stelle möchtest du dich bewerben?', { chips: B().stellen.map(s => ch(s.name, 'stelle', s.id)), hint: B().stellen.map(s => `${s.name}: ${s.info}`) });
  } else if (OPT[step]) {
    const o = OPT[step]; const st = stelle();
    const opts = step === 'umfang' && st && st.umfang ? o.opts.filter(x => st.umfang.includes(x[0])) : o.opts;
    bot(o.text, { chips: opts.map(x => ch(x[1], step, x[0])).concat(zurueckChip()) });
  } else if (step === 'ueber') {
    bot('Magst du noch kurz was über dich erzählen? Zum Beispiel, was du bisher gemacht hast oder was dir Spaß macht. Schreib es einfach unten rein. Ist freiwillig.', { chips: [ch('Überspringen', 'ueber', '')].concat(zurueckChip()) });
    setTimeout(() => $('#bwText').focus({ preventScroll: true }), 50);
  } else if (step === 'kontakt') {
    bot('Wie erreicht dich das Team? Telefon oder E-Mail reicht.', { card: 'kontakt', chips: zurueckChip() });
  } else if (step === 'unterlagen') {
    bot(`Willst du Unterlagen anhängen? Lebenslauf, Zeugnisse oder ein Anschreiben, als PDF oder Handyfoto. Ist freiwillig, bis zu ${MAX_DATEIEN} Dateien.`, { card: 'dateien', chips: [ch('Dateien auswählen', 'datei'), ch(S.dateien.length ? 'Weiter' : 'Ohne Unterlagen weiter', 'unterlagen-weiter')].concat(zurueckChip()) });
  } else if (step === 'pruefen') {
    bot('Fast geschafft. Schau nochmal drüber, du kannst alles ändern.', { card: 'pruefen' });
  }
  zeigeFortschritt(); render();
}
function weiter() {
  if (S.zurPruefung && S.step !== 'stelle') { S.zurPruefung = false; frage('pruefen'); return; }
  frage(S.plan[S.plan.indexOf(S.step) + 1]);
}
function zaehleStart() { if (!S.gezaehlt) { S.gezaehlt = true; zaehle('bew_start'); } }

function aktion(act, val, idx) {
  const m = S.log[idx]; if (!m || m.used || S.busy) return;
  const chip = (m.chips || []).find(c => c.act === act && String(c.val) === String(val));
  if (act === 'datei') { $('#bwFiles').click(); return; }
  if (act === 'entfernen') { S.dateien.splice(Number(val), 1); render(); return; }
  if (act === 'zurueck') {
    m.used = true; user('Zurück');
    const vorher = S.plan[Math.max(0, S.pos - 1)];
    frage(vorher); return;
  }
  if (act === 'aendern') {
    const row = zeilen().find(r => r[2] === val);
    m.used = true; S.zurPruefung = val !== 'stelle';
    user('Ändern: ' + (val === 'kontakt' ? 'Kontakt' : row ? row[0] : val)); frage(val); return;
  }
  if (act === 'neu') { m.used = true; start(true); return; }
  if (act === 'betrieb') { location.href = '/demo/#bewerber'; return; }
  m.used = true;
  if (act === 'stelle') {
    const alt = S.a.stelle; S.a.stelle = val; user(chip ? chip.label : val); zaehleStart();
    if (alt && alt !== val) { const keep = { stelle: val, ueber: S.a.ueber, name: S.a.name, telefon: S.a.telefon, email: S.a.email, erreichbar: S.a.erreichbar }; S.a = keep; S.zurPruefung = false; }
    const st = stelle(); Object.assign(S.a, st.fest || {}); plane();
    S.step = 'stelle'; weiter(); return;
  }
  if (OPT[act]) { S.a[act === 'startAusbildung' ? 'start' : act] = val; user(chip ? chip.label : val); weiter(); return; }
  if (act === 'ueber') { S.a.ueber = ''; user('Überspringen'); weiter(); return; }
  if (act === 'unterlagen-weiter') { user(S.dateien.length ? `${S.dateien.length} ${S.dateien.length === 1 ? 'Datei' : 'Dateien'} angehängt` : 'Ohne Unterlagen weiter'); weiter(); return; }
}

/* ---------- Freie Eingabe: Antwort auf „Über dich“ oder Frage an die KI ---------- */
function offeneChipsNeu() {
  // nach einer Frage die Knöpfe des aktuellen Schritts wieder zeigen
  const offen = [...S.log].reverse().find(m => (m.chips || m.card) && !m.used);
  if (!offen) return;
  offen.used = true;
  frage(S.step);
}
async function eingabe(t) {
  t = t.trim().slice(0, 400); if (!t || S.busy) return;
  if (S.step === 'fertig') { schliesseOffene(); user(t); await kiFrage(t); bot('Willst du noch etwas?', { chips: [ch('Neue Bewerbung', 'neu'), ch('So sieht es der Betrieb', 'betrieb')] }); render(); return; }
  if (S.step === 'ueber' && !/\?\s*$/.test(t)) {
    S.a.ueber = ((S.a.ueber ? S.a.ueber + ' ' : '') + t).slice(0, 500); user(t); zaehleStart();
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
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(API + '/api/demo/bewerber-frage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ nachricht: t, betrieb: S.betrieb, stelle: S.a.stelle || '', verlauf: S.verlauf.slice(-6) }) });
      const j = await r.json().catch(() => null);
      if (j && j.demo) S.ki = false;
      else if (j && j.text) { text = j.text; if (!j.limit) S.ki = true; }
    } catch (e) { /* lokale Antwort */ } finally { clearTimeout(tm); }
  }
  if (!text) text = lokaleAntwort(t);
  S.verlauf.push({ role: 'user', content: t }, { role: 'assistant', content: text });
  S.log.splice(S.log.indexOf(warte), 1);
  bot(text); S.busy = false; status(); render();
}
function lokaleAntwort(t) {
  const s = t.toLowerCase(), b = B(), st = stelle();
  if (/gehalt|lohn|verdien|geld|bezahl|stundenlohn/.test(s)) return 'Das Gehalt hängt von Stelle und Erfahrung ab. Das bespricht das Team offen mit dir im ersten Gespräch.';
  if (/arbeitszeit|uhrzeit|wann arbeit|samstag|wochenende|schicht/.test(s)) return `Gearbeitet wird ${b.zeiten}.`;
  if (/lebenslauf|zeugnis|anschreiben|unterlagen|dokument/.test(s)) return 'Brauchst du nicht unbedingt. Wenn du magst, kannst du gleich Lebenslauf oder Zeugnisse anhängen, auch als Handyfoto.';
  if (/wo |adresse|anfahrt|standort|wo seid/.test(s)) return `Du findest uns hier: ${b.adresse} (Beispieladresse).`;
  if (/ki|bot|mensch|computer/.test(s)) return 'Ich bin ein Assistent mit KI. Jede Bewerbung liest ein Mensch aus dem Team, ich bewerte und sortiere niemanden.';
  if (/wie lange|wann melde|antwort|rückmeld|dauert/.test(s)) return 'Das Team meldet sich normalerweise innerhalb von zwei Werktagen, meistens per Telefon.';
  if (/bietet|vorteil|benefits|was gibt/.test(s)) return b.bietet;
  if (/daten|lösch|datenschutz/.test(s)) return 'Deine Angaben bekommt nur der Betrieb. Sie werden nach 6 Monaten gelöscht, auf Wunsch auch früher.';
  if (st && /stelle|aufgabe|was mach|tätigkeit/.test(s)) return `${st.name}: ${st.info}. Die Details erklärt dir das Team gern im Gespräch.`;
  return 'Gute Frage. Das beantwortet dir das Team am besten im Gespräch.';
}
function status() { const el = $('#bwState'); if (el) el.textContent = S.ki === false ? 'Vorführmodus: feste Antworten' : ''; }

/* ---------- Kontakt prüfen ---------- */
function kontaktAbsenden(form, idx) {
  const name = form.querySelector('[name=name]').value.trim().slice(0, 80);
  const telefon = form.querySelector('[name=telefon]').value.trim().slice(0, 40);
  const email = form.querySelector('[name=email]').value.trim().slice(0, 80);
  const erreichbar = (form.querySelector('[name=erreichbar]:checked') || {}).value || '';
  const err = form.querySelector('.err');
  const telOk = !telefon || telefon.replace(/\D/g, '').length >= 6;
  const mailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!name) { err.textContent = 'Bitte deinen Namen eintragen.'; form.querySelector('[name=name]').focus(); return; }
  if (!telefon && !email) { err.textContent = 'Bitte Telefon oder E-Mail eintragen, damit sich das Team melden kann.'; form.querySelector('[name=telefon]').focus(); return; }
  if (!telOk) { err.textContent = 'Die Telefonnummer sieht zu kurz aus.'; form.querySelector('[name=telefon]').focus(); return; }
  if (!mailOk) { err.textContent = 'Die E-Mail-Adresse sieht nicht vollständig aus.'; form.querySelector('[name=email]').focus(); return; }
  Object.assign(S.a, { name, telefon, email, erreichbar }); S.entwurf = null;
  const m = S.log[idx]; if (m) { m.used = true; m.summary = [name, telefon, email, erreichbar && 'erreichbar ' + erreichbar].filter(Boolean).join(' · '); }
  zaehleStart(); weiter();
}

/* ---------- Unterlagen ---------- */
$('#bwFiles').addEventListener('change', e => {
  const files = Array.from(e.target.files || []); e.target.value = '';
  if (!files.length) return;
  const erlaubt = f => /\.(pdf|jpe?g|png|heic|heif)$/i.test(f.name) || /^(application\/pdf|image\/(jpeg|png|heic|heif))$/.test(f.type);
  const fehler = [];
  for (const f of files) {
    if (S.dateien.length >= MAX_DATEIEN) { fehler.push(`Mehr als ${MAX_DATEIEN} Dateien gehen nicht.`); break; }
    if (!erlaubt(f)) { fehler.push(`${f.name}: nur PDF oder Fotos.`); continue; }
    if (f.size > MAX_GROESSE) { fehler.push(`${f.name}: größer als 10 MB.`); continue; }
    if (S.dateien.some(d => d.name === f.name && d.groesse === f.size)) continue;
    S.dateien.push({ name: f.name.slice(0, 80), groesse: f.size });
  }
  const m = [...S.log].reverse().find(x => x.card === 'dateien' && !x.used);
  if (m) { m.fehler = fehler.join(' '); m.chips = [ch(S.dateien.length ? 'Noch eine Datei' : 'Dateien auswählen', 'datei'), ch(S.dateien.length ? 'Weiter' : 'Ohne Unterlagen weiter', 'unterlagen-weiter')].concat(zurueckChip()); }
  render();
});

/* ---------- Abschicken ---------- */
function abschicken(form, idx) {
  const ok = form.querySelector('[name=ok]').checked, err = form.querySelector('.err');
  if (!ok) { err.textContent = 'Bitte kurz zustimmen, dass der Betrieb deine Angaben für die Bewerbung speichern darf.'; return; }
  const st = stelle(), a = S.a;
  const b = {
    id: uid(), createdAt: new Date().toISOString(), status: 'neu',
    betrieb: S.betrieb, betriebName: B().name, job: a.stelle, stelleName: st ? st.name : '',
    name: a.name, kontakt: a.telefon || a.email, telefon: a.telefon || '', email: a.email || '', erreichbar: a.erreichbar || '',
    erfahrung: a.erfahrung || a.buero || '', fuehrerschein: a.fuehrerschein || '', umfang: a.umfang || '', start: a.start || '',
    abschluss: a.abschluss || '', praktikum: a.praktikum || '', ueber: a.ueber || '', frage: S.fragen.join(' | ').slice(0, 300),
    unterlagen: S.dateien.slice(), quelle: 'bewerben'
  };
  const m = S.log[idx]; if (m) m.used = true;
  speichere(b); zaehle('bewerbung'); if (b.unterlagen.length) zaehle('unterlagen');
  user('Bewerbung abschicken');
  S.step = 'fertig';
  bot(`Danke, ${a.name.split(' ')[0]}! Deine Bewerbung ist bei ${B().name} angekommen.`, { card: 'fertig' });
  bot('Wenn du noch eine Frage hast, schreib sie einfach unten rein.', { chips: [ch('Neue Bewerbung', 'neu'), ch('So sieht es der Betrieb', 'betrieb')] });
  zeigeFortschritt(); render();
  toast('Bewerbung abgeschickt. Unter „So sieht es der Betrieb“ sehen Sie, was ankommt.');
}

/* ---------- Anzeige ---------- */
function zeilen() {
  const a = S.a, st = stelle(), z = [];
  z.push(['Stelle', st ? st.name : '–', 'stelle']);
  if (st) for (const f of st.fragen) {
    const key = f === 'startAusbildung' ? 'start' : f;
    if (st.fest && st.fest[key]) continue;
    const o = OPT[f]; const v = a[key]; const lbl = (o.opts.find(x => x[0] === v) || [v, v])[1];
    z.push([o.label, lbl || '–', f]);
  }
  if (st && st.fest && st.fest.umfang) z.push(['Umfang', st.fest.umfang, null]);
  z.push(['Über dich', a.ueber || 'nichts angegeben', 'ueber']);
  z.push(['Name', a.name || '–', 'kontakt']);
  z.push(['Telefon', a.telefon || '–', 'kontakt']);
  z.push(['E-Mail', a.email || '–', 'kontakt']);
  z.push(['Erreichbar', a.erreichbar || 'keine Angabe', 'kontakt']);
  z.push(['Unterlagen', S.dateien.length ? S.dateien.map(d => d.name).join(', ') : 'keine', 'unterlagen']);
  return z;
}
function karte(m, i) {
  if (m.card === 'kontakt') {
    if (m.used) return `<div class="card"><div class="note">Kontakt</div><div>${esc(m.summary || '')}</div></div>`;
    const a = Object.assign({}, S.a, S.entwurf || {});
    return `<form class="card" data-kontakt="${i}" novalidate>
      <label>Vor- und Nachname<input type="text" name="name" autocomplete="name" value="${esc(a.name || '')}" placeholder="z. B. Alex Muster"></label>
      <label>Telefon<input type="tel" name="telefon" autocomplete="tel" inputmode="tel" value="${esc(a.telefon || '')}" placeholder="z. B. 0170 1234567"></label>
      <label>E-Mail<input type="email" name="email" autocomplete="email" inputmode="email" value="${esc(a.email || '')}" placeholder="z. B. alex@example.org"></label>
      <fieldset class="bw-pills"><legend>Wann erreicht man dich am besten? (freiwillig)</legend>
        ${ERREICHBAR.map(v => `<label><input type="radio" name="erreichbar" value="${esc(v)}" ${a.erreichbar === v ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}
      </fieldset>
      <div class="err" role="alert"></div>
      <button class="btn primary" type="submit">Weiter</button>
    </form>`;
  }
  if (m.card === 'dateien') {
    if (!S.dateien.length && !m.fehler) return '';
    return `<div class="card bw-files">${S.dateien.map((d, k) => `<div class="bw-file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg><span>${esc(d.name)}</span><small>${esc(kb(d.groesse))}</small>${m.used ? '' : `<button type="button" class="bw-x" data-act="entfernen" data-val="${k}" data-idx="${i}" aria-label="${esc(d.name)} entfernen">Entfernen</button>`}</div>`).join('')}
      ${m.fehler ? `<div class="err" role="alert">${esc(m.fehler)}</div>` : ''}
      <div class="note">PDF oder Foto, bis 10 MB pro Datei. In der Vorführung wird nur der Dateiname gespeichert.</div></div>`;
  }
  if (m.card === 'pruefen') {
    const z = zeilen();
    const tab = `<dl class="bw-check">${z.map(([k, v, step]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd>${step && !m.used ? `<button type="button" class="bw-edit" data-act="aendern" data-val="${esc(step)}" data-idx="${i}" aria-label="${esc(k)} ändern">Ändern</button>` : ''}</div>`).join('')}</dl>`;
    if (m.used) return `<div class="card">${tab}</div>`;
    return `<form class="card" data-pruefen="${i}" novalidate>${tab}
      <label class="check"><input type="checkbox" name="ok"><span>${esc(B().name)} darf meine Angaben und Unterlagen für diese Bewerbung speichern. Sie werden nach 6 Monaten gelöscht, auf Wunsch früher. <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutz</a></span></label>
      <div class="err" role="alert"></div>
      <button class="btn primary" type="submit">Bewerbung abschicken</button>
      <div class="note">Vorführung: Es wird nichts verschickt, alles bleibt in diesem Browser.</div>
    </form>`;
  }
  if (m.card === 'fertig') {
    return `<div class="card bw-done"><b>So geht es weiter</b>
      <ol><li>Das Team meldet sich innerhalb von zwei Werktagen${S.a.erreichbar && S.a.erreichbar !== 'egal' ? `, möglichst ${esc(S.a.erreichbar)}` : ''}.</li><li>Kurzes Kennenlernen vor Ort.</li><li>Bei Interesse ein Tag Probearbeiten.</li></ol>
      <div class="note">Eine Bewertung durch die KI gibt es nicht. Deine Bewerbung liest ein Mensch.</div></div>`;
  }
  return '';
}
function render() {
  const log = $('#bwLog');
  // Was jemand ins Kontaktformular getippt, aber noch nicht abgeschickt hat, bleibt erhalten
  const f = log.querySelector('form[data-kontakt]');
  if (f) S.entwurf = { name: f.querySelector('[name=name]').value, telefon: f.querySelector('[name=telefon]').value, email: f.querySelector('[name=email]').value, erreichbar: (f.querySelector('[name=erreichbar]:checked') || {}).value || S.a.erreichbar };
  log.innerHTML = S.log.map((m, i) => {
    let inner = '';
    if (m.typing) inner = '<div class="bubble"><span class="typing" aria-label="schreibt"><i></i><i></i><i></i></span></div>';
    else if (m.text) inner = `<div class="bubble">${esc(m.text)}</div>`;
    if (m.hint && !m.used) inner += `<ul class="bw-hint">${m.hint.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`;
    if (m.card) inner += karte(m, i);
    if (m.chips && m.chips.length && !(m.used && m.card === 'kontakt')) inner += `<div class="chips">${m.chips.map(c => `<button type="button" class="chip${c.act === 'zurueck' ? ' bw-zurueck' : ''}" data-act="${esc(c.act)}" data-val="${esc(c.val)}" data-idx="${i}" ${m.used || S.busy ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
    return `<div class="msg ${m.from}">${inner}</div>`;
  }).join('');
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/* ---------- Ereignisse ---------- */
$('#bwLog').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  aktion(b.dataset.act, b.dataset.val, Number(b.dataset.idx));
});
$('#bwLog').addEventListener('submit', e => {
  const k = e.target.closest('form[data-kontakt]'), p = e.target.closest('form[data-pruefen]');
  if (k) { e.preventDefault(); kontaktAbsenden(k, Number(k.dataset.kontakt)); }
  if (p) { e.preventDefault(); abschicken(p, Number(p.dataset.pruefen)); }
});
$('#bwForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#bwText'); const t = i.value; i.value = ''; eingabe(t); });
$('#bwRestart').addEventListener('click', () => { if (S.step !== 'stelle' && S.step !== 'fertig' && !confirmNeu()) return; start(false); });
let neuArmed = 0;
function confirmNeu() {
  if (Date.now() - neuArmed < 4000) return true;
  neuArmed = Date.now(); toast('Nochmal tippen, um von vorn anzufangen. Deine Angaben gehen dabei verloren.'); return false;
}

function setzeBetrieb(id, neu) {
  if (!BETRIEBE[id]) id = 'fahrzeug';
  S.betrieb = id; ls.set(DKEY, id);
  const b = B(); const app = $('#bwApp');
  app.style.setProperty('--mf-brand', b.farbe); app.style.setProperty('--mf-brand-2', b.farbe2);
  $('#bwName').textContent = b.name; $('#bwLogo').textContent = b.logo;
  document.querySelectorAll('.bw-b').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.betrieb === id)));
  try { const u = new URL(location.href); u.searchParams.set('betrieb', id); history.replaceState(null, '', u); } catch (e) { /* egal */ }
  start(neu);
}
document.querySelector('.bw-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-betrieb]'); if (!b || b.dataset.betrieb === S.betrieb) return;
  if (S.step !== 'stelle' && S.step !== 'fertig' && !confirmNeu()) return;
  setzeBetrieb(b.dataset.betrieb, false);
});

/* ---------- Start ---------- */
const setH = () => document.documentElement.style.setProperty('--toph', $('.bw-top').offsetHeight + 'px');
setH(); window.addEventListener('resize', setH);
const q = new URLSearchParams(location.search).get('betrieb');
setzeBetrieb(q || ls.get(DKEY) || 'fahrzeug', true);
status();
})();
