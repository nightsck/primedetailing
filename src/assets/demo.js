(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = n => Math.round(Number(n) || 0).toLocaleString('de-DE') + '\u00a0€';
const round5 = n => Math.round(n / 5) * 5;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = n => String(n).padStart(2, '0');
function fmtTime(iso) { const d = new Date(iso); if (isNaN(d)) return ''; return `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}., ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(iso) { const d = new Date(iso); if (isNaN(d)) return ''; return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function afterHours(iso) { const d = new Date(iso); if (isNaN(d)) return false; const day = d.getDay(), h = d.getHours() + d.getMinutes() / 60; if (day === 0) return true; if (day === 6) return !(h >= 9 && h < 13); return !(h >= 8 && h < 17); }
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3800); }

/* ---------- Zähler für die Auswertung ---------- */
// Beispielmonat eines Betriebs plus die eigenen Klicks in dieser Demo (nur in diesem Browser).
const ZKEY = 'af-demo-zaehler-v1';
const ZBASIS = { chat_offen: 148, chat_start: 61, anfrage: 23, anruf_verpasst: 19, sms_offen: 11, sms_anfrage: 7, bew_offen: 42, bew_start: 15, bewerbung: 9, unterlagen: 4 };
const ZEIT_BASIS = { morgens: 5, mittags: 8, abends: 12, nachts: 5 };
let Z = { zahl: {}, zeit: {} };
try { const raw = localStorage.getItem(ZKEY); if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') Z = { zahl: o.zahl || {}, zeit: o.zeit || {} }; } } catch (e) { /* ohne Speicher */ }
function zSave() { try { localStorage.setItem(ZKEY, JSON.stringify(Z)); } catch (e) { /* ignorieren */ } }
function zeitFenster(d = new Date()) { const h = d.getHours(); return h >= 6 && h < 12 ? 'morgens' : h >= 12 && h < 17 ? 'mittags' : h >= 17 && h < 22 ? 'abends' : 'nachts'; }
function zaehle(k) {
  Z.zahl[k] = (Z.zahl[k] || 0) + 1;
  if (k === 'anfrage' || k === 'sms_anfrage') { const f = zeitFenster(); Z.zeit[f] = (Z.zeit[f] || 0) + 1; }
  zSave();
  if (typeof renderAuswertung === 'function' && !document.getElementById('v-auswertung').hidden) renderAuswertung();
}

/* ---------- Betrieb & Preise ---------- */
const PROFIL = {
  name: 'Muster Fahrzeugpflege',
  zeiten: 'Mo–Fr 8–17 Uhr, Sa 9–13 Uhr',
  adresse: 'Musterstraße 1, 78000 Musterstadt (Beispieladresse)',
  dauer: 'Innenreinigung ca. 2–3 Stunden, Außenwäsche ca. 1 Stunde, Politur 1 Tag, Keramikversiegelung 1–2 Tage, Smart Repair ca. 1–2 Stunden je Stelle',
  extra: 'Hol- und Bringservice im Umkreis von 15 km auf Anfrage. Bezahlung bar, EC-Karte oder Überweisung.'
};
const SERVICES = [
  { id: 'innen', name: 'Innenreinigung', kurz: 'Sitze, Teppiche, Cockpit' },
  { id: 'aussen', name: 'Außenwäsche', kurz: 'Handwäsche mit Felgen' },
  { id: 'politur', name: 'Politur', kurz: 'Einstufig, mehr Glanz' },
  { id: 'keramik', name: 'Keramikversiegelung', kurz: 'Schutz für Jahre' },
  { id: 'smart', name: 'Smart Repair', kurz: 'Kratzer und kleine Dellen' }
];
const KLASSEN = [
  { id: 'klein', name: 'Kleinwagen', bsp: 'z. B. Polo, Corsa' },
  { id: 'kompakt', name: 'Kompakt / Mittelklasse', bsp: 'z. B. Golf, 3er' },
  { id: 'suv', name: 'SUV / Kombi', bsp: 'z. B. Tiguan, Passat Variant' },
  { id: 'transporter', name: 'Transporter / Van', bsp: 'z. B. T6, Sprinter' }
];
const svc = id => SERVICES.find(s => s.id === id) || { id, name: id || '–' };
const kl = id => KLASSEN.find(k => k.id === id) || { id, name: id || '–' };
const DEFAULT_PRICES = {
  klassen: {
    innen: { klein: 69, kompakt: 79, suv: 89, transporter: 109 },
    aussen: { klein: 49, kompakt: 59, suv: 69, transporter: 89 },
    politur: { klein: 249, kompakt: 299, suv: 349, transporter: 449 },
    keramik: { klein: 549, kompakt: 599, suv: 699, transporter: 849 }
  },
  zuschlag: { starkInnen: 30, extremInnen: 60, tierhaare: 25, flecken: 20, starkAussen: 15 },
  smart: { klein: 89, mittel: 149 }
};
const PKEY = 'af-demo-preise-v1';
function loadPrices() {
  const p = clone(DEFAULT_PRICES);
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const s = JSON.parse(raw);
      for (const a of Object.keys(p.klassen)) for (const k of Object.keys(p.klassen[a])) { const v = Number(s?.klassen?.[a]?.[k]); if (v >= 0) p.klassen[a][k] = v; }
      for (const k of Object.keys(p.zuschlag)) { const v = Number(s?.zuschlag?.[k]); if (v >= 0) p.zuschlag[k] = v; }
      for (const k of Object.keys(p.smart)) { const v = Number(s?.smart?.[k]); if (v >= 0) p.smart[k] = v; }
    }
  } catch (e) { /* storage unavailable */ }
  return p;
}
let PRICES = loadPrices();
function savePrices() { try { localStorage.setItem(PKEY, JSON.stringify(PRICES)); } catch (e) { /* ignore */ } }

const VLABEL = { leicht: 'leicht', normal: 'normal', stark: 'stark', extrem: 'sehr stark' };
const GLABEL = { klein: 'bis 5 cm', mittel: '5 bis 15 cm', gross: 'größer als 15 cm' };

function berechne(c) {
  const pos = [];
  if (c.leistung === 'smart') {
    const g = c.kratzerGroesse || 'klein';
    const n = Math.max(1, Math.min(9, Number(c.kratzerAnzahl) || 1));
    if (g === 'gross') return { positionen: [], summe: null, min: null, max: null, besichtigung: true };
    pos.push({ text: `Smart Repair, ${n} ${n === 1 ? 'Stelle' : 'Stellen'} ${GLABEL[g]}`, betrag: PRICES.smart[g] * n });
  } else {
    const k = c.fahrzeug || 'kompakt';
    pos.push({ text: `${svc(c.leistung).name}, ${kl(k).name}`, betrag: PRICES.klassen[c.leistung][k] });
    if (c.leistung === 'innen') {
      if (c.verschmutzung === 'stark') pos.push({ text: 'Zuschlag starke Verschmutzung', betrag: PRICES.zuschlag.starkInnen });
      if (c.verschmutzung === 'extrem') pos.push({ text: 'Zuschlag sehr starke Verschmutzung', betrag: PRICES.zuschlag.extremInnen });
      if (c.tierhaare) pos.push({ text: 'Tierhaarentfernung', betrag: PRICES.zuschlag.tierhaare });
      if (c.flecken) pos.push({ text: 'Fleckenbehandlung', betrag: PRICES.zuschlag.flecken });
    }
    if (c.leistung === 'aussen' && (c.verschmutzung === 'stark' || c.verschmutzung === 'extrem')) pos.push({ text: 'Zuschlag starke Verschmutzung', betrag: PRICES.zuschlag.starkAussen });
  }
  const summe = pos.reduce((s, p) => s + p.betrag, 0);
  return { positionen: pos, summe, min: round5(summe * 0.95), max: round5(summe * 1.1), besichtigung: false };
}

/* ---------- Zustand, KI-Schnittstelle, Speicher ---------- */
const API = (document.body.dataset.api || '').replace(/\/+$/, '');
const S = { mem: [], ai: false, canImages: false, ready: false, selected: null, filter: 'alle', drafts: {}, detailKey: '', confirmClear: false };
const allRequests = () => [...S.mem].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

function normalize(id, d) {
  d = d || {};
  const arr = v => Array.isArray(v) ? v : [];
  const pos = arr(d?.preis?.positionen).map(p => ({ text: String(p?.text || ''), betrag: Number(p?.betrag) || 0 }));
  const apos = arr(d?.angebot?.positionen).map(p => ({ text: String(p?.text || ''), betrag: Number(p?.betrag) || 0 }));
  return {
    id: String(id), createdAt: String(d.createdAt || ''), kanal: String(d.kanal || 'Website'), status: ['neu', 'bearbeitung', 'angebot', 'gewonnen', 'verloren'].includes(d.status) ? d.status : 'neu',
    beispiel: !!d.beispiel, kunde: { name: String(d?.kunde?.name || 'Unbekannt'), kontakt: String(d?.kunde?.kontakt || '') },
    leistung: String(d.leistung || ''), fahrzeug: d.fahrzeug ? String(d.fahrzeug) : '', modell: String(d.modell || ''),
    angaben: d.angaben && typeof d.angaben === 'object' ? d.angaben : {}, ki: d.ki && typeof d.ki === 'object' ? d.ki : null,
    fotos: arr(d.fotos).filter(u => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 3),
    preis: d.preis ? { positionen: pos, summe: d.preis.summe == null ? null : Number(d.preis.summe), min: Number(d.preis.min) || 0, max: Number(d.preis.max) || 0, besichtigung: !!d.preis.besichtigung } : null,
    termin: String(d.termin || ''), bewertungOk: !!d.bewertungOk,
    verlauf: arr(d.verlauf).slice(-40).map(v => ({ von: String(v?.von || ''), text: String(v?.text || '') })),
    angebot: d.angebot ? { positionen: apos, summe: Number(d.angebot.summe) || 0, nr: String(d.angebot.nr || ''), datum: String(d.angebot.datum || '') } : null,
    sentAt: String(d.sentAt || ''), wonAt: String(d.wonAt || ''), bestaetigtVon: String(d.bestaetigtVon || '')
  };
}

// Anfragen bleiben nur in diesem Browser (localStorage). Ohne Speicher: nur im Arbeitsspeicher.
const AKEY = 'af-demo-anfragen-v2';
function store() { try { localStorage.setItem(AKEY, JSON.stringify(S.mem)); } catch (e) { /* voll oder gesperrt: dann nur bis zum Neuladen */ } }
function loadStore() {
  let raw = null;
  try { raw = localStorage.getItem(AKEY); } catch (e) { raw = null; }
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) { S.mem = a.map(x => normalize(x && x.id || uid(), x)); return; } } catch (e) { /* kaputt: neu anlegen */ } }
  S.mem = beispielSatz(); store();
}

async function postJson(pfad, body, ms = 25000) {
  if (!API) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    return await r.json().catch(() => null);
  } catch (e) { return null; } finally { clearTimeout(t); }
}
async function initKi() {
  if (API) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(API + '/api/config', { signal: ctl.signal }); clearTimeout(t);
      const c = await r.json();
      S.ai = !c.demo; S.canImages = !c.demo && !!c.foto;
    } catch (e) { S.ai = false; }
  }
  S.ready = true; renderStatus();
}
function renderStatus() {
  const el = $('#aiState'); if (!el) return;
  el.textContent = S.ready && !S.ai ? 'Vorführmodus: feste Antworten' : '';
}

async function saveRequest(r) { S.mem.unshift(normalize(r.id, r)); store(); renderChef(); return true; }
async function patchRequest(id, patch) {
  const m = S.mem.find(x => x.id === id); if (!m) return;
  Object.assign(m, normalize(id, Object.assign(clone(m), patch))); store(); renderChef(true);
}
async function deleteRequest(id) { const i = S.mem.findIndex(x => x.id === id); if (i >= 0) { S.mem.splice(i, 1); store(); } }

/* ---------- photos ---------- */
function loadImage(src) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; }); }
function toCanvas(img, max) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
}
async function prepPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const thumb = toCanvas(img, 480).toDataURL('image/jpeg', 0.7);
    const full = toCanvas(img, 1024).toDataURL('image/jpeg', 0.82);
    return { thumb, full };
  } finally { URL.revokeObjectURL(url); }
}
async function shrinkThumbs(list, max, q) {
  const out = [];
  for (const u of list) { try { const img = await loadImage(u); out.push(toCanvas(img, max).toDataURL('image/jpeg', q)); } catch (e) { /* skip */ } }
  return out;
}

/* ---------- chat ---------- */
const C = { log: [], ctx: {}, step: 'start', turns: [], busy: false };
function bot(text, o = {}) { const m = Object.assign({ from: 'bot', text }, o); C.log.push(m); return m; }
function user(text, o = {}) { const m = Object.assign({ from: 'user', text }, o); C.log.push(m); return m; }
function useChips() { C.log.forEach(m => { if (m.chips) m.used = true; }); }

function startChat(kanal = 'Website') {
  C.log = []; C.turns = []; C.ctx = { kanal, fotos: [], voll: [] }; C.busy = false; C.gezaehlt = false;
  const hi = kanal === 'Anruf-SMS'
    ? 'Sie hatten gerade angerufen, wir waren leider im Einsatz. Worum geht es? Dann melden wir uns mit Preis und Termin.'
    : 'Guten Tag. Worum geht es? Wählen Sie eine Leistung, dann rechne ich Ihnen den Preis aus.';
  bot(hi, { chips: SERVICES.map(s => ({ label: s.name, act: 'leistung', val: s.id })).concat([{ label: 'Ich habe eine Frage', act: 'frage' }]) });
  C.step = 'leistung'; renderLog();
}

function askFahrzeug() {
  bot('Um welches Fahrzeug geht es? Sie können auch einfach das Modell schreiben.', { chips: KLASSEN.map(k => ({ label: k.name, act: 'fahrzeug', val: k.id })) });
  C.step = 'fahrzeug';
}
function askFotos() {
  const t = C.ctx.leistung === 'smart'
    ? 'Schicken Sie mir bitte 1 bis 3 Fotos der Stelle, am besten eins mit etwas Abstand und eins nah dran.'
    : `Schicken Sie mir gern 1 bis 3 Fotos${C.ctx.leistung === 'innen' ? ' vom Innenraum' : ' vom Fahrzeug'}. Dann kann ich den Aufwand besser einschätzen.`;
  bot(t, { chips: [{ label: 'Fotos auswählen', act: 'fotos' }, { label: 'Ohne Fotos weiter', act: 'ohne-fotos' }] });
  C.step = 'fotos';
}
function askDetails() {
  const l = C.ctx.leistung;
  if (l === 'innen' || l === 'aussen') {
    bot(`Wie stark ist ${l === 'innen' ? 'der Innenraum' : 'das Auto'} verschmutzt?`, { chips: ['leicht', 'normal', 'stark', 'extrem'].map(v => ({ label: VLABEL[v][0].toUpperCase() + VLABEL[v].slice(1), act: 'versch', val: v })) });
    C.step = 'details';
  } else if (l === 'smart') {
    bot('Wie groß ist die Stelle ungefähr?', { chips: [{ label: 'Bis 5 cm', act: 'groesse', val: 'klein' }, { label: '5 bis 15 cm', act: 'groesse', val: 'mittel' }, { label: 'Größer', act: 'groesse', val: 'gross' }] });
    C.step = 'details';
  } else { afterDetails(); }
}
function askExtras() {
  bot('Gibt es Tierhaare oder Flecken?', { chips: [{ label: 'Tierhaare', act: 'extra', val: 't' }, { label: 'Flecken', act: 'extra', val: 'f' }, { label: 'Beides', act: 'extra', val: 'tf' }, { label: 'Nichts davon', act: 'extra', val: '' }] });
  C.step = 'details';
}
function afterDetails() {
  const res = berechne(C.ctx); C.ctx.preis = res;
  if (res.besichtigung) {
    bot('Bei größeren Schäden muss sich das Team das Auto kurz ansehen. Ich frage dafür gern einen Termin an.', { chips: [{ label: 'Termin anfragen', act: 'termin-anfragen' }, { label: 'Ich habe noch eine Frage', act: 'noch-frage' }] });
  } else {
    bot('Hier ist Ihr Richtwert:', { card: { type: 'preis', data: res }, chips: [{ label: 'Termin anfragen', act: 'termin-anfragen' }, { label: 'Ich habe noch eine Frage', act: 'noch-frage' }] });
  }
  C.step = 'preis';
}
function nextSlots() {
  const out = []; const d = new Date(); d.setHours(0, 0, 0, 0);
  while (out.length < 4) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay(); if (wd === 0 || wd === 6) continue;
    const base = `${WD[wd]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
    out.push(base + ' vormittags'); if (out.length < 4) out.push(base + ' nachmittags');
  }
  return out;
}
function askTermin() {
  bot('Wann passt es Ihnen? Ich frage den Termin an, das Team bestätigt ihn.', { chips: nextSlots().map(s => ({ label: s, act: 'termin', val: s })).concat([{ label: 'Bin flexibel', act: 'termin', val: 'flexibel' }]) });
  C.step = 'termin';
}
function askKontakt() {
  bot('Fast geschafft. Wohin darf das Angebot gehen?', { card: { type: 'kontakt' } });
  C.step = 'kontakt';
}
function reprompt() {
  for (let i = C.log.length - 1; i >= 0; i--) {
    const m = C.log[i];
    if (m.chips && !m.used) {
      if (i === C.log.length - 1) return;
      m.used = true; bot('Möchten Sie weitermachen?', { chips: m.chips.map(c => Object.assign({}, c)) }); return;
    }
  }
}

function chatBegonnen() { if (!C.gezaehlt) { C.gezaehlt = true; if (C.ctx.kanal !== 'Anruf-SMS') zaehle('chat_start'); } }
function act(a, v, idx) {
  const m = C.log[idx];
  if (a !== 'neu' && a !== 'chef') chatBegonnen();
  if (a === 'fotos') { $('#photoInput').click(); return; }
  if (m) m.used = true;
  switch (a) {
    case 'leistung': C.ctx.leistung = v; user(svc(v).name); if (v === 'smart') askFotos(); else askFahrzeug(); break;
    case 'frage': user('Ich habe eine Frage'); bot('Gern, schreiben Sie Ihre Frage einfach unten ins Feld.', { chips: m ? m.chips.filter(c => c.act !== 'frage') : [] }); C.step = 'leistung'; break;
    case 'fahrzeug': C.ctx.fahrzeug = v; user(kl(v).name); askFotos(); break;
    case 'ohne-fotos': user('Ohne Fotos weiter'); askDetails(); break;
    case 'ki-ok': user('Ja, passt'); afterDetails(); break;
    case 'ki-korr': user('Korrigieren'); C.ctx.verschmutzung = null; C.ctx.tierhaare = false; C.ctx.flecken = false; askDetails(); break;
    case 'versch': C.ctx.verschmutzung = v; user(VLABEL[v][0].toUpperCase() + VLABEL[v].slice(1)); if (C.ctx.leistung === 'innen') askExtras(); else afterDetails(); break;
    case 'extra': C.ctx.tierhaare = v.includes('t'); C.ctx.flecken = v.includes('f'); user(v === 't' ? 'Tierhaare' : v === 'f' ? 'Flecken' : v === 'tf' ? 'Beides' : 'Nichts davon'); afterDetails(); break;
    case 'groesse': C.ctx.kratzerGroesse = v; user(GLABEL[v]); if (v === 'gross') afterDetails(); else { bot('Wie viele Stellen sind es?', { chips: ['1', '2', '3', '4'].map(n => ({ label: n === '4' ? '4 oder mehr' : n, act: 'anzahl', val: n })) }); C.step = 'details'; } break;
    case 'anzahl': C.ctx.kratzerAnzahl = Number(v); user(v === '4' ? '4 oder mehr' : v + (v === '1' ? ' Stelle' : ' Stellen')); afterDetails(); break;
    case 'termin-anfragen': user('Termin anfragen'); askTermin(); break;
    case 'noch-frage': user('Ich habe noch eine Frage'); bot('Schreiben Sie sie gern unten ins Feld.', { chips: [{ label: 'Termin anfragen', act: 'termin-anfragen' }] }); break;
    case 'termin': C.ctx.termin = v === 'flexibel' ? 'flexibel' : v; user(v === 'flexibel' ? 'Bin flexibel' : v); askKontakt(); break;
    case 'neu': startChat(C.ctx.kanal || 'Website'); return;
    case 'chef': closeChat(); go('chef'); return;
  }
  renderLog();
}

async function onPhotos(files) {
  const list = Array.from(files || []).filter(f => f && f.type && f.type.startsWith('image/')).slice(0, 3);
  if (!list.length) return;
  if (!C.ctx.leistung) { toast('Wählen Sie zuerst eine Leistung, dann die Fotos.'); return; }
  if (C.busy) return;
  C.busy = true;
  const prepped = [];
  for (const f of list) { try { prepped.push(await prepPhoto(f)); } catch (e) { toast('Ein Foto konnte nicht gelesen werden. Bitte JPG oder PNG nehmen.'); } }
  if (!prepped.length) { C.busy = false; return; }
  useChips();
  C.ctx.fotos = prepped.map(p => p.thumb); C.ctx.voll = prepped.map(p => p.full);
  user('', { photos: C.ctx.fotos }); renderLog();
  if (S.ai && S.canImages) { await analyze(); }
  else { bot('Danke für die Fotos! Sie landen in Ihrer Anfrage. Noch eine kurze Frage:'); askDetails(); renderLog(); }
  C.busy = false;
}

async function analyze() {
  const typing = bot('', { typing: 'Ich schaue mir die Fotos an' }); renderLog();
  const r = await postJson('/api/demo/foto', { bilder: C.ctx.voll || [], leistung: C.ctx.leistung }, 40000);
  C.log.splice(C.log.indexOf(typing), 1);
  if (r && r.ok && r.ergebnis) applyKi(r.ergebnis);
  else {
    if (r && r.demo) { S.ai = false; renderStatus(); }
    bot(r && r.limit && r.text ? r.text + ' Die Fotos kommen trotzdem mit in die Anfrage. Kurze Frage:' : 'Die Fotos konnte ich gerade nicht auswerten, sie kommen aber mit in die Anfrage. Kurze Frage stattdessen:');
    askDetails();
  }
  renderLog();
}
function applyKi(r) {
  r = r && typeof r === 'object' ? r : {};
  const pick = (v, ok) => ok.includes(v) ? v : null;
  if (r.passt_zum_thema === false) {
    bot('Auf den Fotos erkenne ich kein Fahrzeug. Das ist kein Problem, die Fotos kommen trotzdem mit. Kurze Frage:');
    C.ctx.ki = { kurz: String(r.kurz || 'Kein Fahrzeug erkennbar.').slice(0, 240), passt: false };
    askDetails(); return;
  }
  const ki = {
    kurz: String(r.kurz || '').slice(0, 240),
    fahrzeugklasse: pick(r.fahrzeugklasse, ['klein', 'kompakt', 'suv', 'transporter']),
    verschmutzung: pick(r.verschmutzung, ['leicht', 'normal', 'stark', 'extrem']),
    tierhaare: r.tierhaare === true, flecken: r.flecken === true,
    kratzer_anzahl: Math.max(0, Math.min(9, Math.round(Number(r.kratzer_anzahl) || 0))),
    kratzer_groesse: pick(r.kratzer_groesse, ['klein', 'mittel', 'gross'])
  };
  C.ctx.ki = ki;
  const l = C.ctx.leistung; const parts = [];
  if (l === 'smart') {
    if (!ki.kratzer_groesse) { bot((ki.kurz ? 'Ich sehe: ' + ki.kurz + ' ' : '') + 'Die Größe kann ich nicht sicher erkennen.'); askDetails(); return; }
    C.ctx.kratzerGroesse = ki.kratzer_groesse; C.ctx.kratzerAnzahl = Math.max(1, ki.kratzer_anzahl || 1);
    parts.push(`${C.ctx.kratzerAnzahl} ${C.ctx.kratzerAnzahl === 1 ? 'Stelle' : 'Stellen'}, ${GLABEL[C.ctx.kratzerGroesse]}`);
  } else {
    if (ki.fahrzeugklasse && ki.fahrzeugklasse !== C.ctx.fahrzeug) parts.push(`sieht eher nach ${kl(ki.fahrzeugklasse).name} aus, ich bleibe bei Ihrer Angabe`);
    if (l === 'innen' || l === 'aussen') {
      if (!ki.verschmutzung) { bot((ki.kurz ? 'Ich sehe: ' + ki.kurz + ' ' : '') + 'Die Verschmutzung kann ich nicht sicher einschätzen.'); askDetails(); return; }
      C.ctx.verschmutzung = ki.verschmutzung; parts.push('Verschmutzung ' + VLABEL[ki.verschmutzung]);
    }
    if (l === 'innen') { C.ctx.tierhaare = ki.tierhaare; C.ctx.flecken = ki.flecken; parts.push('Tierhaare ' + (ki.tierhaare ? 'ja' : 'nein')); parts.push('Flecken ' + (ki.flecken ? 'ja' : 'nein')); }
  }
  const txt = (ki.kurz ? 'Ich sehe: ' + ki.kurz + '\n' : '') + (parts.length ? 'Meine Einschätzung: ' + parts.join(', ') + '.\n' : '') + 'Stimmt das so?';
  bot(txt, { chips: [{ label: 'Ja, passt', act: 'ki-ok' }, { label: 'Korrigieren', act: 'ki-korr' }] });
  C.step = 'ki-check';
}
const KLASSEN_WORTE = [
  ['transporter', ['transporter', 't4', 't5', 't6', 't7', 'multivan', 'california', 'sprinter', 'vito', 'v-klasse', 'crafter', 'transit', 'ducato', 'vivaro', 'trafic', 'bus', 'van', 'wohnmobil', 'caddy']],
  ['suv', ['suv', 'kombi', 'variant', 'avant', 'touring', 'tiguan', 't-roc', 'touareg', 'x1', 'x3', 'x5', 'q2', 'q3', 'q5', 'q7', 'glc', 'gle', 'gla', 'kuga', 'sportage', 'tucson', 'kodiaq', 'karoq', 'ateca', 'formentor', 'xc40', 'xc60', 'xc90', 'qashqai', 'rav4', 'model y', 'id.4', 'id4', 'enyaq', 'passat', 'superb', 'mokka']],
  ['klein', ['kleinwagen', 'polo', 'corsa', 'fiesta', 'up', 'i10', 'i20', 'clio', 'yaris', 'fabia', 'c3', '208', 'micra', 'aygo', 'smart', 'mini', 'a1', 'ibiza', 'swift', 'zoe', 'sandero', 'picanto', 'twingo']],
  ['kompakt', ['kompakt', 'mittelklasse', 'limousine', 'golf', 'astra', 'focus', 'a3', 'a4', 'a5', '1er', '2er', '3er', '4er', 'c-klasse', 'a-klasse', 'octavia', 'leon', 'civic', 'corolla', 'megane', 'mégane', 'i30', 'ceed', '308', 'model 3', 'id.3', 'id3', 'scala', 'mazda3', 'auris']]
];
function guessKlasse(t) {
  const s = ' ' + t.toLowerCase().replace(/[,;!?()]/g, ' ') + ' ';
  for (const [k, words] of KLASSEN_WORTE) for (const w of words) { if (s.includes(' ' + w + ' ') || s.includes(' ' + w + '.') ) return k; }
  return null;
}

function faq(t) {
  const s = t.toLowerCase();
  if (/öffnungs|geöffnet|offen|uhrzeit|wann (habt|haben|seid|sind)/.test(s)) return `Wir sind ${PROFIL.zeiten} für Sie da.`;
  if (/adresse|anfahrt|standort|wo (seid|sind|finde)/.test(s)) return `Sie finden uns hier: ${PROFIL.adresse}.`;
  if (/wie lange|dauer|dauert/.test(s)) return `Ungefähr: ${PROFIL.dauer}.`;
  if (/hol|bring|abhol|zahl|bezahl|karte|bar/.test(s)) return PROFIL.extra;
  if (/mensch|bot|ki\b|roboter|echt/.test(s)) return 'Ich bin eine KI. Jede Anfrage wird von einem Menschen aus dem Team geprüft, bevor ein Angebot rausgeht.';
  if (/preis|kost|teuer|€|euro/.test(s)) return 'Den Preis rechne ich Ihnen anhand unserer Preisliste aus. Wählen Sie dazu einfach eine Leistung.';
  return 'Das kann ich Ihnen in dieser Demo nicht sicher beantworten. Das Team meldet sich dazu gern persönlich.';
}
async function answer(t) {
  let text = null;
  if (S.ai) {
    const m = bot('', { typing: 'Schreibt' }); renderLog();
    const p = C.ctx.preis;
    const r = await postJson('/api/demo/frage', {
      nachricht: t, verlauf: C.turns.slice(-9, -1), preise: PRICES,
      kontext: { leistung: C.ctx.leistung || '', fahrzeug: C.ctx.fahrzeug || '', min: p && !p.besichtigung ? p.min : 0, max: p && !p.besichtigung ? p.max : 0 }
    });
    if (r && r.demo) { S.ai = false; renderStatus(); }
    else if (r && r.text) text = r.text;
    C.log.splice(C.log.indexOf(m), 1);
  }
  if (!text) text = faq(t);
  bot(text); C.turns.push({ role: 'assistant', content: text });
}
async function onText(t) {
  t = t.trim(); if (!t || C.busy) return;
  C.busy = true;
  chatBegonnen(); user(t); C.turns.push({ role: 'user', content: t }); renderLog();
  try {
    if (C.step === 'fahrzeug') {
      const k = guessKlasse(t);
      if (k) { useChips(); C.ctx.fahrzeug = k; C.ctx.modell = t.slice(0, 60); bot(`Alles klar, ${t.slice(0, 60)} ordne ich als ${kl(k).name} ein.`); askFotos(); renderLog(); return; }
    }
    if (C.step === 'kontakt') { bot('Tragen Sie Ihre Kontaktdaten bitte oben ins Formular ein.'); renderLog(); return; }
    await answer(t);
    if (C.step !== 'fertig') reprompt();
    else bot('Möchten Sie noch eine Anfrage stellen?', { chips: [{ label: 'Neue Anfrage starten', act: 'neu' }] });
    renderLog();
  } finally { C.busy = false; }
}

async function submitKontakt(idx) {
  const name = $('#k-name').value.trim(); const kontakt = $('#k-kontakt').value.trim(); const bew = $('#k-bew').checked;
  const err = $('#k-err');
  if (!name || !kontakt) { err.textContent = 'Bitte Name und Telefon oder E-Mail eintragen.'; return; }
  if (!/@/.test(kontakt) && kontakt.replace(/\D/g, '').length < 6) { err.textContent = 'Bitte eine gültige Telefonnummer oder E-Mail eintragen.'; return; }
  const m = C.log[idx]; if (m) { m.used = true; m.summary = `${name} · ${kontakt}`; }
  const c = C.ctx;
  const r = {
    id: uid(), createdAt: new Date().toISOString(), kanal: c.kanal || 'Website', status: 'neu', beispiel: false,
    kunde: { name: name.slice(0, 80), kontakt: kontakt.slice(0, 120) }, leistung: c.leistung || '', fahrzeug: c.fahrzeug || null, modell: c.modell || '',
    angaben: { verschmutzung: c.verschmutzung || null, tierhaare: !!c.tierhaare, flecken: !!c.flecken, kratzerGroesse: c.kratzerGroesse || null, kratzerAnzahl: c.kratzerAnzahl || null },
    ki: c.ki || null, fotos: c.fotos || [], preis: c.preis || berechne(c), termin: c.termin || '', bewertungOk: bew,
    verlauf: C.log.filter(x => x.text && !x.typing).map(x => ({ von: x.from === 'bot' ? 'Assistent' : 'Kunde', text: x.text.slice(0, 600) })).slice(-30)
  };
  if (JSON.stringify(r).length > 230000) r.fotos = await shrinkThumbs(r.fotos, 320, 0.6);
  if (JSON.stringify(r).length > 230000) r.fotos = r.fotos.slice(0, 1);
  bot(`Danke, ${name.split(' ')[0]}! Ihre Anfrage ist beim Team. Das Angebot kommt in der Regel bis zum nächsten Vormittag.`, { chips: [{ label: 'So sieht es der Betrieb', act: 'chef' }, { label: 'Neue Anfrage starten', act: 'neu' }] });
  C.step = 'fertig'; renderLog();
  zaehle(r.kanal === 'Anruf-SMS' ? 'sms_anfrage' : 'anfrage');
  await saveRequest(r);
  toast('Angekommen. Tippen Sie auf „So sieht es der Betrieb“.');
}

function renderLog(scroll = true) {
  const log = $('#log');
  const html = C.log.map((m, i) => {
    let inner = '';
    if (m.typing) inner += `<div class="bubble"><span class="typing">${esc(m.typing)}<i></i><i></i><i></i></span></div>`;
    else if (m.text) inner += `<div class="bubble">${esc(m.text)}</div>`;
    if (m.photos && m.photos.length) inner += `<div class="photos">${m.photos.map(u => `<img src="${esc(u)}" alt="Foto des Kunden">`).join('')}</div>`;
    if (m.card && m.card.type === 'preis') {
      const d = m.card.data;
      inner += `<div class="card"><div class="lines">${d.positionen.map(p => `<div class="line"><span>${esc(p.text)}</span><span class="num">${euro(p.betrag)}</span></div>`).join('')}</div>
        <div><div class="note">Richtwert</div><div class="range num">ca. ${euro(d.min).replace('\u00a0€', '')} bis ${euro(d.max)}</div></div>
        <div class="note">Unverbindlich, aus der Preisliste des Betriebs gerechnet. Das Team prüft und schickt Ihnen das Angebot.</div></div>`;
    }
    if (m.card && m.card.type === 'kontakt') {
      if (m.used) inner += `<div class="card"><div class="note">Kontakt gesendet</div><div>${esc(m.summary || '')}</div></div>`;
      else inner += `<form class="card" data-kontakt="${i}" novalidate>
          <label for="k-name">Ihr Name<input type="text" id="k-name" autocomplete="name" placeholder="Vor- und Nachname"></label>
          <label for="k-kontakt">Telefon oder E-Mail<input type="text" id="k-kontakt" autocomplete="email" placeholder="z. B. 0170 1234567"></label>
          <label class="check" for="k-bew"><input type="checkbox" id="k-bew"> <span>Der Betrieb darf mich nach dem Auftrag um eine Bewertung bitten (freiwillig).</span></label>
          <div class="err" id="k-err" role="alert"></div>
          <button class="btn primary" type="submit">Anfrage absenden</button>
          <div class="note">Demo: Ihre Angaben bleiben nur in diesem Browser und werden nicht verschickt. Bitte keine echten Daten eingeben.</div>
        </form>`;
    }
    if (m.chips && m.chips.length) inner += `<div class="chips">${m.chips.map(c => `<button type="button" class="chip" data-act="${esc(c.act)}" data-val="${esc(c.val || '')}" data-idx="${i}" ${m.used ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
    return `<div class="msg ${m.from}">${inner}</div>`;
  }).join('');
  log.innerHTML = html;
  if (scroll) log.scrollTop = log.scrollHeight;
  else if (log.scrollHeight - log.scrollTop - log.clientHeight < 140) log.scrollTop = log.scrollHeight;
}

$('#log').addEventListener('click', e => {
  const b = e.target.closest('button.chip'); if (!b || b.disabled || C.busy) return;
  act(b.dataset.act, b.dataset.val, Number(b.dataset.idx));
});
$('#log').addEventListener('submit', e => {
  const f = e.target.closest('form[data-kontakt]'); if (!f) return;
  e.preventDefault(); submitKontakt(Number(f.dataset.kontakt));
});
$('#chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#chatText'); const t = i.value; i.value = ''; onText(t); });
$('#photoInput').addEventListener('change', e => { const f = e.target.files; onPhotos(f).finally(() => { e.target.value = ''; }); });
$('#chatRestart').addEventListener('click', () => { if (C.abort) try { C.abort.abort(); } catch (x) { /* ignore */ } startChat('Website'); });

/* ---------- site mock ---------- */
function renderServices() {
  $('#services').innerHTML = SERVICES.map(s => {
    const from = s.id === 'smart' ? PRICES.smart.klein : Math.min(...Object.values(PRICES.klassen[s.id]));
    return `<tr><td>${esc(s.name)}<small>${esc(s.kurz)}</small></td><td class="r">${euro(from)}</td></tr>`;
  }).join('');
}

/* ---------- Chatfenster auf der Beispiel-Website ---------- */
let chatStarted = false;
function openChat(kanal) {
  if (!kanal) zaehle('chat_offen');
  if (kanal) { startChat(kanal); chatStarted = true; }
  else if (!chatStarted) { startChat('Website'); chatStarted = true; }
  $('#chatPanel').hidden = false;
  if (window.matchMedia('(max-width: 640px)').matches) document.body.style.overflow = 'hidden';
  $('#chatLauncher').setAttribute('aria-expanded', 'true');
  renderLog();
  $('#chatClose').focus({ preventScroll: true });
}
function closeChat() {
  $('#chatPanel').hidden = true;
  document.body.style.overflow = '';
  const l = $('#chatLauncher'); l.setAttribute('aria-expanded', 'false'); l.focus({ preventScroll: true });
}
document.addEventListener('click', e => { if (e.target.closest('[data-open-chat]')) openChat(); });
$('#chatClose').addEventListener('click', closeChat);
$('#chatPanel').addEventListener('keydown', e => { if (e.key === 'Escape') closeChat(); });
$('#mfCall').addEventListener('click', () => { go('anruf'); toast('Niemand geht ran? Tippen Sie auf „Anruf abspielen“.'); });
$('#mfSite').addEventListener('click', e => {
  const a = e.target.closest('a[href^="#mf-"]'); if (!a) return;
  e.preventDefault();
  const t = document.getElementById(a.getAttribute('href').slice(1));
  if (t) $('#mfSite').scrollTo({ top: t.offsetTop - 8, behavior: 'smooth' });
});

/* ---------- Anruf ---------- */
let callTimers = [];
function phone(state) {
  const scr = $('#phoneScreen');
  const ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  if (state === 'idle') scr.innerHTML = `<div class="call"><div class="sub">Kunde will anrufen bei</div><div class="who">Muster Fahrzeugpflege</div><div class="sub">07720 000000 (Beispiel)</div><div class="ring">${ICON}</div><div class="sub" style="margin-top:12px">Tippen Sie auf „Anruf abspielen“.</div></div>`;
  if (state === 'ring') scr.innerHTML = `<div class="call"><div class="sub">Anruf …</div><div class="who">Muster Fahrzeugpflege</div><div class="sub">Es klingelt, der Chef liegt unterm Auto</div><div class="ring pulse">${ICON}</div></div>`;
  if (state === 'missed') scr.innerHTML = `<div class="call"><div class="sub">Niemand nimmt ab</div><div class="who">Muster Fahrzeugpflege</div><div class="ring miss">${ICON}</div></div>`;
  if (state === 'sms') scr.innerHTML = `<div class="sms-head">SMS · gerade eben</div><div class="sms"><b>Muster Fahrzeugpflege:</b> Wir sind gerade im Einsatz und konnten nicht rangehen. Beschreiben Sie Ihr Anliegen hier in einer Minute, gern mit Fotos: <span class="link">muster-fahrzeugpflege.de/anfrage</span></div><button class="btn primary" type="button" id="smsOpen" style="align-self:flex-start">Link öffnen</button><div class="sms-head">Die SMS ging 5 Sekunden nach dem verpassten Anruf raus.</div>`;
}
function startCall() {
  callTimers.forEach(clearTimeout); callTimers = [];
  const d = new Date(); $('#phoneClock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  phone('ring');
  callTimers.push(setTimeout(() => { phone('missed'); zaehle('anruf_verpasst'); }, 2600));
  callTimers.push(setTimeout(() => phone('sms'), 4200));
}
$('#callStart').addEventListener('click', startCall);
$('#callReset').addEventListener('click', () => { callTimers.forEach(clearTimeout); phone('idle'); });
$('#phoneScreen').addEventListener('click', e => { if (e.target.closest('#smsOpen')) { zaehle('sms_offen'); go('kunde'); openChat('Anruf-SMS'); toast('Der Anrufer ist jetzt im Chat. Kanal: Anruf-SMS.'); } });

/* ---------- Chef: Übersicht (Angebote schreibt das Büro wie gewohnt) ---------- */
const STATUS = { neu: 'Neu', bearbeitung: 'In Bearbeitung', angebot: 'Angebot geschrieben', gewonnen: 'Auftrag', verloren: 'Abgesagt' };
const STATUS_ORDER = ['neu', 'bearbeitung', 'angebot', 'gewonnen', 'verloren'];
function filtered() { const all = allRequests(); return S.filter === 'alle' ? all : all.filter(r => r.status === S.filter); }
function within30(r) { const t = Date.parse(r.createdAt); return !isNaN(t) && Date.now() - t < 30 * 864e5; }
const zahl = (x, eins, viele) => `<b>${x}</b> ${x === 1 ? eins : viele}`;
function renderKpis() {
  const rs = allRequests().filter(within30);
  const ah = rs.filter(r => afterHours(r.createdAt)).length;
  const sms = rs.filter(r => r.kanal === 'Anruf-SMS').length;
  const wert = rs.reduce((s, r) => s + (r.preis && !r.preis.besichtigung ? (r.preis.summe || 0) : 0), 0);
  const auftraege = rs.filter(r => r.status === 'gewonnen').length;
  $('#kpis').innerHTML = `${zahl(rs.length, 'Anfrage', 'Anfragen')}, davon ${zahl(ah, 'nach Feierabend', 'nach Feierabend')} und ${zahl(sms, 'über den Anruf-Retter', 'über den Anruf-Retter')}. `
    + `Richtwerte zusammen rund <mark class="num">${euro(wert)}</mark>, daraus ${auftraege === 1 ? 'wurde' : 'wurden'} bisher ${zahl(auftraege, 'Auftrag', 'Aufträge')}.`;
}
function renderFilters() {
  const all = allRequests(); const n = s => s === 'alle' ? all.length : all.filter(r => r.status === s).length;
  $('#filters').innerHTML = ['alle', ...STATUS_ORDER].map(s => `<button type="button" class="filter" data-filter="${s}" aria-pressed="${S.filter === s}">${s === 'alle' ? 'Alle' : STATUS[s]} · ${n(s)}</button>`).join('');
}
function priceText(r) {
  if (!r.preis) return '';
  if (r.preis.besichtigung) return 'Besichtigung';
  return `ca. ${euro(r.preis.min).replace(' €', '')} bis ${euro(r.preis.max)}`;
}
function renderList() {
  const rs = filtered();
  if (!rs.length) {
    $('#reqList').innerHTML = `<div class="empty"><h3>${allRequests().length ? 'Keine Anfragen mit diesem Status' : 'Noch keine Anfragen'}</h3><p>Stellen Sie unter „1 Kunde“ eine Anfrage, sie erscheint hier sofort.</p></div>`;
    return;
  }
  $('#reqList').innerHTML = rs.map(r => `<button type="button" class="req" data-id="${esc(r.id)}" aria-current="${S.selected === r.id}">
      <span class="req-name">${esc(r.kunde.name)}</span><span class="req-time">${esc(fmtTime(r.createdAt))}</span>
      <span class="req-meta">${esc(svc(r.leistung).name)}${r.fahrzeug ? ', ' + esc(kl(r.fahrzeug).name) : ''} · ${esc(r.kanal)}${afterHours(r.createdAt) ? ' · nach Feierabend' : ''}</span>
      <span class="req-bottom"><span class="state st-${r.status}">${STATUS[r.status]}</span><span class="req-price num">${esc(priceText(r))}</span></span>
    </button>`).join('');
}
function factRows(r) {
  const a = r.angaben || {}; const rows = [];
  rows.push(['Leistung', svc(r.leistung).name]);
  if (r.fahrzeug) rows.push(['Fahrzeug', kl(r.fahrzeug).name + (r.modell ? ` (${r.modell})` : '')]);
  if (a.verschmutzung) rows.push(['Verschmutzung', VLABEL[a.verschmutzung] || a.verschmutzung]);
  if (r.leistung === 'innen') rows.push(['Tierhaare / Flecken', `${a.tierhaare ? 'ja' : 'nein'} / ${a.flecken ? 'ja' : 'nein'}`]);
  if (r.leistung === 'smart' && a.kratzerGroesse) rows.push(['Schaden', `${a.kratzerAnzahl || 1} × ${GLABEL[a.kratzerGroesse] || a.kratzerGroesse}`]);
  rows.push(['Terminwunsch', r.termin || 'keiner']);
  if (r.preis && !r.preis.besichtigung) rows.push(['Richtwert im Chat', `ca. ${r.preis.min} bis ${r.preis.max} €`]);
  if (r.preis && r.preis.besichtigung) rows.push(['Richtwert im Chat', 'nur nach Besichtigung']);
  rows.push(['Bewertung erlaubt', r.bewertungOk ? 'ja' : 'nein']);
  return rows;
}
const factsHtml = rows => `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
function akteHtml(r) {
  return `<div class="doc" aria-label="Anfrage">
    <div class="doc-head"><div><div class="doc-firm">Anfrage von ${esc(r.kunde.name)}</div><div class="doc-small">${esc(r.kunde.kontakt)} · ${esc(r.kanal)} · ${esc(fmtTime(r.createdAt))}</div></div><div class="doc-small" style="text-align:right">Muster Fahrzeugpflege</div></div>
    <table>${factRows(r).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    ${r.ki && r.ki.kurz ? `<div class="doc-small">Einschätzung aus den Fotos: ${esc(r.ki.kurz)}</div>` : ''}
  </div>`;
}
function renderDetail(force) {
  const r = allRequests().find(x => x.id === S.selected);
  const box = $('#reqDetail');
  if (!r) { S.detailKey = ''; box.innerHTML = allRequests().length ? '<div class="empty"><h3>Anfrage auswählen</h3><p>Links eine Anfrage antippen, um Fotos, Angaben und Preisrahmen zu sehen.</p></div>' : ''; return; }
  const key = JSON.stringify(r);
  if (!force && key === S.detailKey) return;
  S.detailKey = key;
  const ki = r.ki;
  box.innerHTML = `<div class="detail">
    <div class="d-head"><div class="d-tags"><span class="state st-${r.status}">${STATUS[r.status]}</span>${afterHours(r.createdAt) ? '<span class="tagline">kam außerhalb der Öffnungszeiten</span>' : ''}${r.beispiel ? '<span class="tagline">Beispiel</span>' : ''}</div>
      <h3>${esc(r.kunde.name)}</h3>
      <div class="d-sub"><span>${esc(r.kunde.kontakt)}</span><span>·</span><span>${esc(r.kanal)}</span><span>·</span><span>${esc(fmtTime(r.createdAt))}</span></div></div>
    ${r.fotos.length ? `<div class="sec"><h4>Fotos</h4><div class="d-photos">${r.fotos.map(u => `<img src="${esc(u)}" alt="Foto vom Kunden">`).join('')}</div></div>` : ''}
    ${ki ? `<div class="sec"><h4>Einschätzung aus den Fotos</h4><div class="ki"><div>${esc(ki.kurz || 'Keine Beschreibung.')}</div><div class="hint">Nur ein Hinweis. Der Preisrahmen kommt aus Ihrer Preisliste.</div></div></div>` : ''}
    <div class="sec"><h4>Angaben</h4>${factsHtml(factRows(r))}</div>
    ${r.verlauf.length ? `<details class="verlauf"><summary>Chatverlauf (${r.verlauf.length} Nachrichten)</summary><div class="verlauf-list">${r.verlauf.map(v => `<div><b>${esc(v.von)}:</b> ${esc(v.text)}</div>`).join('')}</div></details>` : ''}
    <div class="sec"><h4>Wo steht die Anfrage?</h4>
      <div class="status-row" role="group" aria-label="Status setzen">${STATUS_ORDER.map(st => `<button type="button" class="filter" data-status="${st}" aria-pressed="${r.status === st}">${STATUS[st]}</button>`).join('')}</div>
      <p class="note">Das Angebot schreibt Ihr Büro wie gewohnt. Hier sieht jeder, wo die Anfrage gerade steht.</p>
      <div class="actions"><button type="button" class="btn" id="printAkte">Anfrage drucken</button></div>
    </div>
  </div>`;
}
function renderChef(forceDetail) {
  renderKpis(); renderFilters(); renderList(); renderDetail(forceDetail);
}
$('#filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; S.filter = b.dataset.filter; renderChef(); });
$('#reqList').addEventListener('click', e => {
  const b = e.target.closest('.req'); if (!b) return;
  S.selected = b.dataset.id; renderList(); renderDetail(true);
  if (window.matchMedia('(max-width: 960px)').matches) $('#reqDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#reqDetail').addEventListener('click', async e => {
  const r = allRequests().find(x => x.id === S.selected); if (!r) return;
  const st = e.target.closest('[data-status]');
  if (st) { await patchRequest(r.id, { status: st.dataset.status }); if (st.dataset.status === 'gewonnen') toast('Als Auftrag gezählt. Siehe die Zahlen oben.'); return; }
  if (e.target.closest('#printAkte')) { printDoc(akteHtml(r)); return; }
});
function printDoc(html) {
  $('#printArea').innerHTML = html;
  try { window.print(); } catch (e) { toast('Drucken ist hier nicht möglich.'); }
}

const BEISPIELE = [
  { name: 'Laura M. (Beispiel)', kontakt: '0170 0000001', leistung: 'innen', fahrzeug: 'kompakt', modell: 'VW Golf', angaben: { verschmutzung: 'stark', tierhaare: true, flecken: false }, kanal: 'Website', stunde: 21, minute: 40, tagZurueck: 1, kurz: 'Innenraum eines Kompaktwagens mit vielen Hundehaaren auf der Rückbank und Krümeln im Fußraum.', status: 'neu' },
  { name: 'Kemal Y. (Beispiel)', kontakt: 'kemal@example.org', leistung: 'smart', fahrzeug: '', modell: '', angaben: { kratzerGroesse: 'klein', kratzerAnzahl: 2 }, kanal: 'Anruf-SMS', stunde: 12, minute: 15, tagZurueck: 3, kurz: 'Zwei kurze Kratzer an der hinteren Stoßstange, Lack an einer Stelle bis zur Grundierung.', status: 'angebot' },
  { name: 'Petra S. (Beispiel)', kontakt: '0151 0000002', leistung: 'keramik', fahrzeug: 'suv', modell: 'Skoda Kodiaq', angaben: {}, kanal: 'Website', stunde: 19, minute: 5, tagZurueck: 6, kurz: 'Dunkles SUV mit leichten Waschkratzern im Lack, sonst in gutem Zustand.', status: 'gewonnen' }
];
function beispielAnfrage(b, status) {
  const d = new Date(); d.setDate(d.getDate() - b.tagZurueck); d.setHours(b.stunde, b.minute, 0, 0);
  const ctx = Object.assign({ leistung: b.leistung, fahrzeug: b.fahrzeug }, b.angaben);
  return normalize(uid(), {
    createdAt: d.toISOString(), kanal: b.kanal, status, beispiel: true,
    kunde: { name: b.name, kontakt: b.kontakt }, leistung: b.leistung, fahrzeug: b.fahrzeug || null, modell: b.modell,
    angaben: Object.assign({ verschmutzung: null, tierhaare: false, flecken: false, kratzerGroesse: null, kratzerAnzahl: null }, b.angaben),
    ki: { kurz: b.kurz }, fotos: [], preis: berechne(ctx), termin: nextSlots()[1] || '', bewertungOk: true,
    verlauf: [{ von: 'Kunde', text: `Anfrage für ${svc(b.leistung).name}` }, { von: 'Assistent', text: 'Richtwert genannt, Termin angefragt.' }]
  });
}
function beispielSatz() { return BEISPIELE.map(b => beispielAnfrage(b, b.status)); }
let beispielIdx = 0;
async function addExample() {
  const b = BEISPIELE[beispielIdx % BEISPIELE.length]; beispielIdx++;
  const r = beispielAnfrage(Object.assign({}, b, { tagZurueck: 0, stunde: 7, minute: 10 }), 'neu');
  await saveRequest(r); S.selected = r.id; renderChef(true);
  toast('Beispiel-Anfrage angelegt.');
}
$('#addExample').addEventListener('click', addExample);
$('#clearWrap').addEventListener('click', async e => {
  const knopf = '<button class="btn quiet danger" type="button" id="clearAll">Zurücksetzen</button>';
  if (e.target.closest('#clearAll')) { $('#clearWrap').innerHTML = '<span class="confirm">Eigene Anfragen löschen? <button class="btn danger" type="button" id="clearYes">Ja, zurücksetzen</button><button class="btn quiet" type="button" id="clearNo">Abbrechen</button></span>'; return; }
  if (e.target.closest('#clearNo')) { $('#clearWrap').innerHTML = knopf; return; }
  if (e.target.closest('#clearYes')) {
    S.mem = beispielSatz(); store();
    S.selected = null;
    $('#clearWrap').innerHTML = knopf;
    renderChef(true); toast('Zurückgesetzt.');
  }
});

/* ---------- Bewerber-Chat ---------- */
// Bewerbung in einer Minute per Chat, ohne Anschreiben. Die KI bewertet oder sortiert niemanden aus:
// das wäre nach der KI-Verordnung ein Hochrisiko-System. Alles bleibt in diesem Browser.
const JOBS = [
  { id: 'aufbereiter', name: 'Fahrzeugaufbereiter (m/w/d)', umfang: 'Vollzeit oder Teilzeit' },
  { id: 'aushilfe', name: 'Aushilfe samstags (m/w/d)', umfang: 'Minijob' },
  { id: 'ausbildung', name: 'Ausbildung Fahrzeuglackierer (m/w/d)', umfang: 'ab September' },
  { id: 'initiativ', name: 'Initiativ', umfang: 'egal' }
];
const job = id => JOBS.find(j => j.id === id) || { id, name: id || '–' };
const stelleVon = b => b.stelleName || job(b.job).name;
const BSTATUS = { neu: 'Neu', angerufen: 'Angerufen', probe: 'Probearbeiten', eingestellt: 'Eingestellt', absage: 'Absage' };
const BSTATUS_ORDER = ['neu', 'angerufen', 'probe', 'eingestellt', 'absage'];
const BKEY = 'af-demo-bewerbungen-v1';
const BW = { list: [], selected: null, detailKey: '' };
function bNormalize(d) {
  d = d || {}; const t = (v, n = 120) => String(v == null ? '' : v).slice(0, n);
  return { id: t(d.id || uid(), 40), createdAt: t(d.createdAt, 40), status: BSTATUS[d.status] ? d.status : 'neu', beispiel: !!d.beispiel,
    name: t(d.name, 80) || 'Unbekannt', kontakt: t(d.kontakt), erreichbar: t(d.erreichbar, 80), job: t(d.job, 20), erfahrung: t(d.erfahrung, 60),
    fuehrerschein: t(d.fuehrerschein, 20), umfang: t(d.umfang, 40), start: t(d.start, 40), frage: t(d.frage, 300),
    stelleName: t(d.stelleName, 90), betrieb: t(d.betrieb, 20), betriebName: t(d.betriebName, 60), telefon: t(d.telefon, 40), email: t(d.email, 80),
    abschluss: t(d.abschluss, 40), praktikum: t(d.praktikum, 40), ueber: t(d.ueber, 500), notiz: t(d.notiz, 1000),
    unterlagen: (Array.isArray(d.unterlagen) ? d.unterlagen : []).slice(0, 8).map(u => ({ name: t(u && u.name, 80), groesse: Math.max(0, Number(u && u.groesse) || 0) })) };
}
function bStore() { try { localStorage.setItem(BKEY, JSON.stringify(BW.list)); } catch (e) { /* nur bis zum Neuladen */ } }
function bBeispiele() {
  const at = (tage, h, m) => { const d = new Date(); d.setDate(d.getDate() - tage); d.setHours(h, m, 0, 0); return d.toISOString(); };
  return [
    { name: 'Dennis K. (Beispiel)', kontakt: '0160 0000003', erreichbar: 'ab 17 Uhr', job: 'aufbereiter', erfahrung: 'mehr als 2 Jahre', fuehrerschein: 'ja', umfang: 'Vollzeit', start: 'in einem Monat', createdAt: at(1, 22, 15), status: 'neu', beispiel: true, unterlagen: [{ name: 'Lebenslauf_Dennis.pdf', groesse: 188416 }, { name: 'Gesellenbrief.jpg', groesse: 961536 }] },
    { name: 'Sara B. (Beispiel)', kontakt: 'sara@example.org', erreichbar: 'vormittags', job: 'aushilfe', erfahrung: 'ein bisschen', fuehrerschein: 'ja', umfang: 'Minijob', start: 'sofort', createdAt: at(3, 20, 40), status: 'angerufen', beispiel: true },
    { name: 'Luca M. (Beispiel)', kontakt: '0152 0000004', erreichbar: 'nach der Schule', job: 'ausbildung', erfahrung: 'noch keine', fuehrerschein: 'nein', umfang: 'Vollzeit', start: 'ab September', createdAt: at(5, 16, 5), status: 'probe', beispiel: true }
  ].map(bNormalize);
}
function bLoad() {
  let raw = null; try { raw = localStorage.getItem(BKEY); } catch (e) { raw = null; }
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) { BW.list = a.map(bNormalize); return; } } catch (e) { /* neu anlegen */ } }
  BW.list = bBeispiele(); bStore();
}
const bAll = () => [...BW.list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

// Der Bewerber-Chat selbst läuft als eigene Seite: /demo/bewerben/ (assets/bewerben.js).
// Er speichert in dieselbe Liste (BKEY), hier sieht man, was beim Betrieb ankommt.
const kb = n => n >= 1048576 ? (n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
$('#jobSite').addEventListener('click', e => {
  const a = e.target.closest('a[href^="#job-"]'); if (!a) return;
  e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1));
  if (t) $('#jobSite').scrollTo({ top: t.offsetTop - 8, behavior: 'smooth' });
});


// Übersicht im Betrieb
const telVon = b => b.telefon || (!/@/.test(b.kontakt) ? b.kontakt : '');
const mailVon = b => b.email || (/@/.test(b.kontakt) ? b.kontakt : '');
function bRender(force) {
  const all = bAll(); const rs = all.filter(within30);
  const ah = rs.filter(b => afterHours(b.createdAt)).length;
  const probe = rs.filter(b => b.status === 'probe' || b.status === 'eingestellt').length;
  $('#bSum').innerHTML = `${zahl(rs.length, 'Bewerbung', 'Bewerbungen')} in den letzten 30 Tagen, davon ${zahl(ah, 'nach Feierabend', 'nach Feierabend')}. ${zahl(probe, 'Person', 'Leute')} zum Probearbeiten eingeladen.`;
  $('#bList').innerHTML = all.length ? all.map(b => `<button type="button" class="req" data-bid="${esc(b.id)}" aria-current="${BW.selected === b.id}">
      <span class="req-name">${esc(b.name)}</span><span class="req-time">${esc(fmtTime(b.createdAt))}</span>
      <span class="req-meta">${esc(stelleVon(b))}${b.betriebName && b.betrieb !== 'fahrzeug' ? ' · ' + esc(b.betriebName) : ''} · ${esc(b.umfang || '–')} · ab ${esc(b.start || '–')}${afterHours(b.createdAt) ? ' · nach Feierabend' : ''}</span>
      <span class="req-bottom"><span class="state bst-${b.status}">${BSTATUS[b.status]}</span><span class="req-price">${b.unterlagen.length ? esc(b.unterlagen.length + (b.unterlagen.length === 1 ? ' Datei' : ' Dateien')) : 'Kurzbewerbung'}</span></span>
    </button>`).join('') : '<div class="empty"><h3>Noch keine Bewerbungen</h3><p>Bewerben Sie sich oben einmal selbst.</p></div>';
  const b = all.find(x => x.id === BW.selected); const box = $('#bDetail');
  if (!b) { BW.detailKey = ''; box.innerHTML = all.length ? '<div class="empty"><h3>Bewerbung auswählen</h3><p>Links eine Bewerbung antippen.</p></div>' : ''; return; }
  const key = JSON.stringify(b); if (!force && key === BW.detailKey) return; BW.detailKey = key;
  const rows = [['Stelle', stelleVon(b)]];
  if (b.betriebName && b.betrieb !== 'fahrzeug') rows.push(['Betrieb', b.betriebName]);
  if (b.abschluss) rows.push(['Schulabschluss', b.abschluss]);
  if (b.praktikum) rows.push(['Praktikum', b.praktikum]);
  if (b.erfahrung) rows.push(['Erfahrung', b.erfahrung]);
  if (b.fuehrerschein) rows.push(['Führerschein Klasse B', b.fuehrerschein]);
  rows.push(['Umfang', b.umfang || '–'], ['Anfangen', b.start || '–'], ['Erreichbar', b.erreichbar || 'keine Angabe']);
  if (b.ueber) rows.push(['Über sich', b.ueber]);
  rows.push(['Unterlagen', b.unterlagen.length ? b.unterlagen.map(u => `${u.name} (${kb(u.groesse)})`).join(', ') : 'keine, nur Kurzbewerbung']);
  if (b.frage) rows.push(['Hat gefragt', b.frage]);
  box.innerHTML = `<div class="detail">
    <div class="d-head"><div class="d-tags"><span class="state bst-${b.status}">${BSTATUS[b.status]}</span>${afterHours(b.createdAt) ? '<span class="tagline">kam nach Feierabend</span>' : ''}${b.beispiel ? '<span class="tagline">Beispiel</span>' : ''}</div>
      <h3>${esc(b.name)}</h3>
      <div class="d-sub"><span>${esc(fmtTime(b.createdAt))}</span></div>
      <div class="actions">${telVon(b) ? `<a class="btn primary" href="tel:${esc(telVon(b).replace(/[^\d+]/g, ''))}">Anrufen ${esc(telVon(b))}</a>` : ''}${mailVon(b) ? `<a class="btn" href="mailto:${esc(mailVon(b))}">E-Mail an ${esc(mailVon(b))}</a>` : ''}</div></div>
    <div class="sec"><h4>Angaben</h4>${factsHtml(rows)}</div>
    <div class="sec"><h4>Wo steht die Bewerbung?</h4>
      <div class="status-row" role="group" aria-label="Status setzen">${BSTATUS_ORDER.map(st => `<button type="button" class="filter" data-bstatus="${st}" aria-pressed="${b.status === st}">${BSTATUS[st]}</button>`).join('')}</div>
      <p class="note">Ein Anruf reicht meistens. Bewerbung und Unterlagen werden nach 6 Monaten automatisch gelöscht. In der Demo wird nur der Dateiname gespeichert.</p>
    </div>
    <div class="sec"><h4><label for="bNotiz">Notiz fürs Team</label></h4>
      <textarea id="bNotiz" class="b-notiz" rows="3" maxlength="1000" placeholder="z. B. Montag 10 Uhr zum Kennenlernen eingeladen">${esc(b.notiz)}</textarea>
      <p class="note">Sehen nur Sie und Ihr Team, nicht der Bewerber.</p>
    </div>
  </div>`;
}
$('#bList').addEventListener('click', e => {
  const r = e.target.closest('.req[data-bid]'); if (!r) return; BW.selected = r.dataset.bid; bRender(true);
  if (window.matchMedia('(max-width: 960px)').matches) $('#bDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#bDetail').addEventListener('click', e => {
  const st = e.target.closest('[data-bstatus]'); if (!st) return;
  const b = BW.list.find(x => x.id === BW.selected); if (!b) return;
  b.status = st.dataset.bstatus; bStore(); bRender(true);
});
$('#bDetail').addEventListener('input', e => {
  if (e.target.id !== 'bNotiz') return;
  const b = BW.list.find(x => x.id === BW.selected); if (!b) return;
  b.notiz = e.target.value.slice(0, 1000); BW.detailKey = JSON.stringify(b); bStore();
});
// Neue Bewerbung in einem anderen Tab (/demo/bewerben/) gleich anzeigen
window.addEventListener('storage', e => { if (e.key === BKEY) { bLoad(); bRender(true); } });
$('#bResetWrap').addEventListener('click', e => {
  const knopf = '<button class="btn quiet danger" type="button" id="bReset">Zurücksetzen</button>';
  if (e.target.closest('#bReset')) { $('#bResetWrap').innerHTML = '<span class="confirm">Eigene Bewerbungen löschen? <button class="btn danger" type="button" id="bResetYes">Ja, zurücksetzen</button><button class="btn quiet" type="button" id="bResetNo">Abbrechen</button></span>'; return; }
  if (e.target.closest('#bResetNo')) { $('#bResetWrap').innerHTML = knopf; return; }
  if (e.target.closest('#bResetYes')) { BW.list = bBeispiele(); BW.selected = null; bStore(); $('#bResetWrap').innerHTML = knopf; bRender(true); toast('Zurückgesetzt.'); }
});

/* ---------- Auswertung ---------- */
const ZEIT_LABEL = { morgens: '6 bis 12 Uhr', mittags: '12 bis 17 Uhr', abends: '17 bis 22 Uhr', nachts: '22 bis 6 Uhr' };
const zWert = k => (ZBASIS[k] || 0) + (Z.zahl[k] || 0);
const prozent = (a, b) => b ? Math.round(a / b * 100) + ' %' : '';
function balken(rows, opts = {}) {
  const max = Math.max(1, ...rows.map(r => r.wert));
  return `<div class="bars">${rows.map((r, i) => {
    const eigen = r.eigen ? `<span class="eigen">+${r.eigen} von Ihnen</span>` : '';
    const anteil = opts.quote && i > 0 ? `<span class="quote">${prozent(r.wert, rows[0].wert)}</span>` : '';
    return `<div class="bar-row" title="${esc(r.label)}: ${r.wert}${opts.quote && i > 0 ? ' (' + prozent(r.wert, rows[0].wert) + ' von ' + esc(rows[0].label) + ')' : ''}">
      <span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, r.wert / max * 100).toFixed(1)}%"></span></span>
      <span class="bar-val num">${r.wert}${anteil}${eigen}</span></div>`;
  }).join('')}</div>`;
}
const zr = (label, k) => ({ label, wert: zWert(k), eigen: Z.zahl[k] || 0 });
function renderAuswertung() {
  const anfragen = zWert('anfrage') + zWert('sms_anfrage');
  const zeit = Object.keys(ZEIT_LABEL).map(k => ({ label: ZEIT_LABEL[k], wert: (ZEIT_BASIS[k] || 0) + (Z.zeit[k] || 0), eigen: Z.zeit[k] || 0 }));
  const feierabend = zeit[2].wert + zeit[3].wert;
  $('#aSum').innerHTML = `Der Chat wurde <b>${zWert('chat_offen')}</b>-mal geöffnet. Insgesamt kamen <b>${anfragen}</b> Anfragen rein, <mark class="num">${feierabend} davon nach Feierabend</mark>. Über den Anruf-Retter kamen <b>${zWert('sms_anfrage')}</b> Anfragen, die sonst verloren gewesen wären. Dazu <b>${zWert('bewerbung')}</b> Bewerbungen.`;
  $('#aFunnels').innerHTML = [
    ['Website-Chat', balken([zr('Chat geöffnet', 'chat_offen'), zr('Gespräch begonnen', 'chat_start'), zr('Anfrage abgeschickt', 'anfrage')], { quote: true })],
    ['Anruf-Retter', balken([zr('Anruf verpasst', 'anruf_verpasst'), zr('Link aus der SMS geöffnet', 'sms_offen'), zr('Anfrage abgeschickt', 'sms_anfrage')], { quote: true })],
    ['Bewerber-Chat', balken([zr('Chat geöffnet', 'bew_offen'), zr('Bewerbung begonnen', 'bew_start'), zr('Bewerbung abgeschickt', 'bewerbung'), zr('mit Unterlagen', 'unterlagen')], { quote: true })],
    ['Wann Anfragen reinkommen', balken(zeit)]
  ].map(([t, html]) => `<div class="a-block"><h3>${esc(t)}</h3>${html}</div>`).join('');
}
$('#aResetWrap').addEventListener('click', e => {
  const knopf = '<button class="btn quiet danger" type="button" id="aReset">Eigene Klicks zurücksetzen</button>';
  if (e.target.closest('#aReset')) { $('#aResetWrap').innerHTML = '<span class="confirm">Eigene Klicks löschen? <button class="btn danger" type="button" id="aResetYes">Ja</button><button class="btn quiet" type="button" id="aResetNo">Abbrechen</button></span>'; return; }
  if (e.target.closest('#aResetNo')) { $('#aResetWrap').innerHTML = knopf; return; }
  if (e.target.closest('#aResetYes')) { Z = { zahl: {}, zeit: {} }; zSave(); $('#aResetWrap').innerHTML = knopf; renderAuswertung(); toast('Zurückgesetzt.'); }
});

/* ---------- Preisliste ---------- */
function renderPrices() {
  $('#priceTable').innerHTML = `<thead><tr><th>Leistung</th>${KLASSEN.map(k => `<th>${esc(k.name)}</th>`).join('')}</tr></thead><tbody>${SERVICES.filter(s => s.id !== 'smart').map(s => `<tr><td><b>${esc(s.name)}</b></td>${KLASSEN.map(k => `<td><input type="number" min="0" step="1" id="p-${s.id}-${k.id}" data-path="klassen.${s.id}.${k.id}" value="${PRICES.klassen[s.id][k.id]}" aria-label="${esc(s.name)} ${esc(k.name)} in Euro"> €</td>`).join('')}</tr>`).join('')}</tbody>`;
  const z = PRICES.zuschlag;
  const field = (id, path, label, v) => `<label for="${id}">${esc(label)}<span><input type="number" min="0" step="1" id="${id}" data-path="${path}" value="${v}"> €</span></label>`;
  $('#priceExtras').innerHTML = `
    <div class="price-box"><h3>Zuschläge Innenreinigung</h3>${field('z-si', 'zuschlag.starkInnen', 'Starke Verschmutzung', z.starkInnen)}${field('z-ei', 'zuschlag.extremInnen', 'Sehr starke Verschmutzung', z.extremInnen)}${field('z-th', 'zuschlag.tierhaare', 'Tierhaare', z.tierhaare)}${field('z-fl', 'zuschlag.flecken', 'Flecken', z.flecken)}</div>
    <div class="price-box"><h3>Weitere Zuschläge</h3>${field('z-sa', 'zuschlag.starkAussen', 'Außenwäsche, starke Verschmutzung', z.starkAussen)}</div>
    <div class="price-box"><h3>Smart Repair je Stelle</h3>${field('s-kl', 'smart.klein', 'Bis 5 cm', PRICES.smart.klein)}${field('s-mi', 'smart.mittel', '5 bis 15 cm', PRICES.smart.mittel)}<span class="note" style="font-size:12.5px;color:var(--muted)">Größer: nur nach Besichtigung.</span></div>`;
}
document.getElementById('v-preise').addEventListener('input', e => {
  const t = e.target; if (!t.dataset || !t.dataset.path) return;
  const v = Math.max(0, Math.round(Number(t.value) || 0)); const [a, b, c] = t.dataset.path.split('.');
  if (c) PRICES[a][b][c] = v; else PRICES[a][b] = v;
  savePrices(); renderServices();
});
$('#priceReset').addEventListener('click', () => { PRICES = clone(DEFAULT_PRICES); savePrices(); renderPrices(); renderServices(); toast('Beispielpreise wiederhergestellt.'); });

/* ---------- routing ---------- */
const VIEWS = ['kunde', 'anruf', 'chef', 'bewerber', 'auswertung', 'preise'];
function go(v, push = true) {
  if (!VIEWS.includes(v)) v = 'kunde';
  VIEWS.forEach(x => { document.getElementById('v-' + x).hidden = x !== v; document.getElementById('tab-' + x).setAttribute('aria-selected', String(x === v)); });
  if (push && location.hash !== '#' + v) { try { history.replaceState(null, '', '#' + v); } catch (e) { location.hash = v; } }
  if (v === 'chef') renderChef(true);
  if (v === 'bewerber') bRender(true);
  if (v === 'auswertung') renderAuswertung();
  window.scrollTo(0, 0);
}
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); });
window.addEventListener('hashchange', () => go(location.hash.slice(1), false));

/* ---------- boot ---------- */
loadStore(); bLoad(); renderServices(); renderPrices(); phone('idle'); startChat('Website'); renderStatus(); renderChef();
go(location.hash.slice(1) || 'kunde', false);
initKi();
})();
