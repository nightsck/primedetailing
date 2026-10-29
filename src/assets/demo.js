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
    id: String(id), createdAt: String(d.createdAt || ''), kanal: String(d.kanal || 'Website'), status: ['neu', 'angebot', 'gewonnen', 'verloren'].includes(d.status) ? d.status : 'neu',
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
const AKEY = 'af-demo-anfragen-v1';
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
  $('#dotAi').classList.toggle('on', S.ai);
  $('#stAi').textContent = !S.ready ? 'KI wird geladen …' : S.ai ? (S.canImages ? 'KI an, mit Fotoauswertung' : 'KI an') : 'KI aus: Demo-Antworten';
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
  C.log = []; C.turns = []; C.ctx = { kanal, fotos: [], voll: [] }; C.busy = false;
  const hi = kanal === 'Anruf-SMS'
    ? 'Hallo! Sie hatten gerade bei uns angerufen, wir waren leider im Einsatz. Ich bin der digitale Assistent von Muster Fahrzeugpflege und nehme Ihr Anliegen gleich auf. Worum geht es?'
    : 'Hallo! Ich bin der digitale Assistent von Muster Fahrzeugpflege. Ich bin eine KI, ein Mensch aus dem Team prüft jede Anfrage. Wobei kann ich helfen?';
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

function act(a, v, idx) {
  const m = C.log[idx];
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
  user(t); C.turns.push({ role: 'user', content: t }); renderLog();
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
  bot(`Danke, ${name.split(' ')[0]}! Ihre Anfrage ist beim Team. Das Angebot kommt in der Regel bis zum nächsten Vormittag.`, { chips: [{ label: 'Neue Anfrage starten', act: 'neu' }] });
  C.step = 'fertig'; renderLog();
  await saveRequest(r);
  toast('Neue Anfrage ist jetzt in der Chef-Ansicht (Tab 3).');
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
    return `<div class="svc"><b>${esc(s.name)}</b><span>${esc(s.kurz)}</span><span>ab <span class="from num">${euro(from)}</span></span></div>`;
  }).join('');
}

/* ---------- Anruf ---------- */
let callTimers = [];
function phone(state) {
  const scr = $('#phoneScreen');
  const ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  if (state === 'idle') scr.innerHTML = `<div class="call"><div class="sub">Kunde will anrufen bei</div><div class="who">Muster Fahrzeugpflege</div><div class="sub">07720 000000 (Beispiel)</div><div class="ring">${ICON}</div><div class="sub" style="margin-top:12px">Tippen Sie rechts auf „Anruf simulieren“.</div></div>`;
  if (state === 'ring') scr.innerHTML = `<div class="call"><div class="sub">Anruf …</div><div class="who">Muster Fahrzeugpflege</div><div class="sub">Es klingelt, der Chef liegt unterm Auto</div><div class="ring pulse">${ICON}</div></div>`;
  if (state === 'missed') scr.innerHTML = `<div class="call"><div class="sub">Niemand nimmt ab</div><div class="who">Muster Fahrzeugpflege</div><div class="ring miss">${ICON}</div></div>`;
  if (state === 'sms') scr.innerHTML = `<div class="sms-head">SMS · gerade eben</div><div class="sms"><b>Muster Fahrzeugpflege:</b> Hallo, wir sind gerade beim Kunden und konnten nicht rangehen. Beschreiben Sie Ihr Anliegen hier in einer Minute, gern mit Fotos: <span class="link">muster-fahrzeugpflege.de/anfrage</span></div><button class="btn primary" type="button" id="smsOpen" style="align-self:flex-start">Link öffnen</button><div class="sms-head">Die SMS ging 5 Sekunden nach dem verpassten Anruf raus.</div>`;
}
function startCall() {
  callTimers.forEach(clearTimeout); callTimers = [];
  const d = new Date(); $('#phoneClock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  phone('ring');
  callTimers.push(setTimeout(() => phone('missed'), 2600));
  callTimers.push(setTimeout(() => phone('sms'), 4200));
}
$('#callStart').addEventListener('click', startCall);
$('#callReset').addEventListener('click', () => { callTimers.forEach(clearTimeout); phone('idle'); });
$('#phoneScreen').addEventListener('click', e => { if (e.target.closest('#smsOpen')) { startChat('Anruf-SMS'); go('kunde'); toast('Der Kunde ist jetzt im Assistenten, Kanal: Anruf-SMS.'); } });

/* ---------- Chef ---------- */
const STATUS = { neu: 'Neu', angebot: 'Angebot raus', gewonnen: 'Bestätigt', verloren: 'Abgesagt' };
function filtered() { const all = allRequests(); return S.filter === 'alle' ? all : all.filter(r => r.status === S.filter); }
function within30(r) { const t = Date.parse(r.createdAt); return !isNaN(t) && Date.now() - t < 30 * 864e5; }
function renderKpis() {
  const rs = allRequests().filter(within30);
  const ah = rs.filter(r => afterHours(r.createdAt)).length;
  const sms = rs.filter(r => r.kanal === 'Anruf-SMS').length;
  const raus = rs.filter(r => r.angebot && r.status !== 'neu');
  const wert = raus.reduce((s, r) => s + r.angebot.summe, 0);
  const best = raus.filter(r => r.status === 'gewonnen').reduce((s, r) => s + r.angebot.summe, 0);
  const kpi = (v, l, cls = '', sub = '') => `<div class="kpi ${cls}"><span class="v">${esc(v)}</span><span class="l">${esc(l)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;
  $('#kpis').innerHTML = kpi(rs.length, 'Anfragen') + kpi(ah, 'außerhalb der Öffnungszeiten') + kpi(sms, 'über den Anruf-Retter') + kpi(raus.length, 'Angebote raus')
    + kpi(euro(wert), 'Wert verschickter Angebote', 'hl', `davon vom Kunden bestätigt: ${euro(best)}`);
}
function renderFilters() {
  const all = allRequests(); const n = s => s === 'alle' ? all.length : all.filter(r => r.status === s).length;
  $('#filters').innerHTML = ['alle', 'neu', 'angebot', 'gewonnen', 'verloren'].map(s => `<button type="button" class="filter" data-filter="${s}" aria-pressed="${S.filter === s}">${s === 'alle' ? 'Alle' : STATUS[s]} · ${n(s)}</button>`).join('');
}
function priceText(r) {
  if (r.angebot) return euro(r.angebot.summe);
  if (!r.preis) return '';
  if (r.preis.besichtigung) return 'Besichtigung';
  return `ca. ${euro(r.preis.min).replace('\u00a0€', '')} bis ${euro(r.preis.max)}`;
}
function renderList() {
  const rs = filtered();
  if (!rs.length) {
    $('#reqList').innerHTML = `<div class="empty"><h3>${allRequests().length ? 'Keine Anfragen mit diesem Status' : 'Noch keine Anfragen'}</h3><p>Stellen Sie in der Kundensicht eine Anfrage, sie erscheint hier sofort. Oder legen Sie eine Beispiel-Anfrage an.</p></div>`;
    return;
  }
  $('#reqList').innerHTML = rs.map(r => `<button type="button" class="req" data-id="${esc(r.id)}" aria-current="${S.selected === r.id}">
      <div class="req-top"><span class="pill st-${r.status}">${STATUS[r.status]}</span>${r.beispiel ? '<span class="pill tag">Beispiel</span>' : ''}<span class="req-time">${esc(fmtTime(r.createdAt))}</span></div>
      <div class="req-name">${esc(r.kunde.name)}</div>
      <div class="req-meta">${esc(svc(r.leistung).name)}${r.fahrzeug ? ' · ' + esc(kl(r.fahrzeug).name) : ''} · ${esc(r.kanal)}${afterHours(r.createdAt) ? ' · nach Feierabend' : ''}</div>
      <div class="req-bottom"><span class="req-price num">${esc(priceText(r))}</span><span class="req-thumbs">${r.fotos.slice(0, 3).map(u => `<img src="${esc(u)}" alt="">`).join('')}</span></div>
    </button>`).join('');
}
function draftFor(r) {
  if (!S.drafts[r.id]) {
    const base = r.angebot ? r.angebot.positionen : (r.preis && r.preis.positionen.length ? r.preis.positionen : [{ text: 'Besichtigung und Kostenvoranschlag vor Ort', betrag: 0 }]);
    S.drafts[r.id] = base.map(p => ({ text: p.text, betrag: p.betrag }));
  }
  return S.drafts[r.id];
}
function factsHtml(r) {
  const a = r.angaben || {}; const rows = [];
  rows.push(['Leistung', svc(r.leistung).name]);
  if (r.fahrzeug) rows.push(['Fahrzeug', kl(r.fahrzeug).name + (r.modell ? ` (${r.modell})` : '')]);
  if (a.verschmutzung) rows.push(['Verschmutzung', VLABEL[a.verschmutzung] || a.verschmutzung]);
  if (r.leistung === 'innen') rows.push(['Tierhaare / Flecken', `${a.tierhaare ? 'ja' : 'nein'} / ${a.flecken ? 'ja' : 'nein'}`]);
  if (r.leistung === 'smart' && a.kratzerGroesse) rows.push(['Schaden', `${a.kratzerAnzahl || 1} × ${GLABEL[a.kratzerGroesse] || a.kratzerGroesse}`]);
  rows.push(['Terminwunsch', r.termin || 'keiner']);
  rows.push(['Bewertung erlaubt', r.bewertungOk ? 'ja' : 'nein']);
  if (r.preis && !r.preis.besichtigung) rows.push(['Richtwert im Chat', `ca. ${r.preis.min} bis ${r.preis.max} €`]);
  return `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
function docHtml(r) {
  const a = r.angebot;
  return `<div class="doc" aria-label="Angebot">
    <div class="doc-head"><div><div class="doc-firm">Muster Fahrzeugpflege</div><div class="doc-small">${esc(PROFIL.adresse)}</div></div><div class="doc-small" style="text-align:right">Angebot ${esc(a.nr)}<br>${esc(fmtDate(a.datum))}</div></div>
    <div><b>An:</b> ${esc(r.kunde.name)} · ${esc(r.kunde.kontakt)}</div>
    <table>${a.positionen.map(p => `<tr><td>${esc(p.text)}</td><td>${euro(p.betrag)}</td></tr>`).join('')}<tr class="total"><td>Gesamt</td><td>${euro(a.summe)}</td></tr></table>
    <div class="doc-small">Endpreise. Gültig 14 Tage. Der Preis kann sich nach Sichtung des Fahrzeugs ändern, das besprechen wir vorher mit Ihnen.${r.termin && r.termin !== 'flexibel' ? ' Terminwunsch: ' + esc(r.termin) + '.' : ''}</div>
  </div>`;
}
function renderDetail(force) {
  const r = allRequests().find(x => x.id === S.selected);
  const box = $('#reqDetail');
  if (!r) { S.detailKey = ''; box.innerHTML = allRequests().length ? '<div class="empty"><h3>Anfrage auswählen</h3><p>Links eine Anfrage antippen, um Fotos, Angaben und den Angebotsentwurf zu sehen.</p></div>' : ''; return; }
  const key = JSON.stringify(r);
  if (!force && key === S.detailKey) return;
  S.detailKey = key;
  const ki = r.ki;
  let offer = '';
  if (r.status === 'neu') {
    const d = draftFor(r);
    offer = `<div class="offer" id="offer">${d.map((p, i) => `<div class="offer-row"><input type="text" data-i="${i}" data-f="text" value="${esc(p.text)}" aria-label="Position ${i + 1}"><input type="number" class="amt" data-i="${i}" data-f="betrag" value="${esc(p.betrag)}" min="0" step="5" aria-label="Betrag Position ${i + 1} in Euro"><button type="button" class="x" data-del="${i}" aria-label="Position entfernen">×</button></div>`).join('')}
      <div class="offer-foot"><button type="button" class="btn ghost" id="addPos">+ Position</button><span>Summe <span class="offer-sum" id="draftSum">${euro(d.reduce((s, p) => s + (Number(p.betrag) || 0), 0))}</span></span></div></div>
      <div class="actions"><button type="button" class="btn primary" id="approve">Freigeben und senden</button><button type="button" class="btn ghost" id="lose">Absage</button></div>`;
  } else if (r.angebot) {
    offer = docHtml(r) + `<div class="actions" style="margin-top:10px">${r.status === 'angebot' ? '<button type="button" class="btn primary" id="kundenlink">Als Kunde ansehen</button>' : ''}<button type="button" class="btn" id="pdf">Drucken / PDF</button>${r.status === 'angebot' ? '<button type="button" class="btn ghost" id="win">Kunde hat zugesagt</button><button type="button" class="btn ghost" id="lose">Absage</button>' : ''}${r.status === 'verloren' ? '<button type="button" class="btn ghost" id="reopen">Wieder öffnen</button>' : ''}</div>${r.status === 'gewonnen' ? `<p class="note" style="margin-top:8px">${r.bestaetigtVon === 'kunde' ? 'Der Kunde hat das Angebot selbst per Klick angenommen.' : 'Vom Chef als zugesagt markiert.'}</p>` : ''}`;
  } else {
    offer = `<p class="note">Kein Angebot gesendet.</p><div class="actions"><button type="button" class="btn ghost" id="reopen">Wieder öffnen</button></div>`;
  }
  box.innerHTML = `<div class="detail">
    <div class="d-head"><div class="req-top"><span class="pill st-${r.status}">${STATUS[r.status]}</span>${r.beispiel ? '<span class="pill tag">Beispiel</span>' : ''}${afterHours(r.createdAt) ? '<span class="pill tag">außerhalb der Öffnungszeiten</span>' : ''}</div>
      <h3>${esc(r.kunde.name)}</h3>
      <div class="d-sub"><span>${esc(r.kunde.kontakt)}</span><span>·</span><span>${esc(r.kanal)}</span><span>·</span><span>${esc(fmtTime(r.createdAt))}</span></div></div>
    ${r.fotos.length ? `<div class="sec"><h4>Fotos</h4><div class="d-photos">${r.fotos.map(u => `<img src="${esc(u)}" alt="Foto vom Kunden">`).join('')}</div></div>` : ''}
    ${ki ? `<div class="sec"><h4>KI-Einschätzung</h4><div class="ki"><div>${esc(ki.kurz || 'Keine Beschreibung.')}</div><div class="hint">Nur ein Hinweis. Der Preis kommt aus der Preisliste, entscheiden tut der Chef.</div></div></div>` : ''}
    <div class="sec"><h4>Angaben</h4>${factsHtml(r)}</div>
    ${r.verlauf.length ? `<details class="verlauf"><summary>Chatverlauf (${r.verlauf.length} Nachrichten)</summary><div class="verlauf-list">${r.verlauf.map(v => `<div><b>${esc(v.von)}:</b> ${esc(v.text)}</div>`).join('')}</div></details>` : ''}
    <div class="sec"><h4>${r.status === 'neu' ? 'Angebotsentwurf' : 'Angebot'}</h4>${offer}</div>
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
$('#reqDetail').addEventListener('input', e => {
  const t = e.target; if (!t.dataset || t.dataset.i == null) return;
  const d = S.drafts[S.selected]; if (!d) return;
  const p = d[Number(t.dataset.i)]; if (!p) return;
  if (t.dataset.f === 'text') p.text = t.value; else p.betrag = Math.max(0, Number(t.value) || 0);
  const sum = d.reduce((s, q) => s + (Number(q.betrag) || 0), 0); const el = $('#draftSum'); if (el) el.textContent = euro(sum);
});
$('#reqDetail').addEventListener('click', async e => {
  const r = allRequests().find(x => x.id === S.selected); if (!r) return;
  const del = e.target.closest('[data-del]');
  if (del) { const d = S.drafts[r.id]; d.splice(Number(del.dataset.del), 1); renderDetail(true); return; }
  if (e.target.closest('#addPos')) { draftFor(r).push({ text: 'Weitere Leistung', betrag: 0 }); renderDetail(true); const ins = $('#offer').querySelectorAll('input[data-f="text"]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } return; }
  if (e.target.closest('#approve')) {
    const pos = draftFor(r).filter(p => p.text.trim()).map(p => ({ text: p.text.trim().slice(0, 160), betrag: Math.round(Number(p.betrag) || 0) }));
    if (!pos.length) { toast('Das Angebot braucht mindestens eine Position.'); return; }
    const now = new Date().toISOString();
    const angebot = { positionen: pos, summe: pos.reduce((s, p) => s + p.betrag, 0), nr: `AN-${new Date().getFullYear()}-${r.id.slice(-4).toUpperCase()}`, datum: now };
    delete S.drafts[r.id];
    await patchRequest(r.id, { status: 'angebot', angebot, sentAt: now });
    toast('Angebot freigegeben. Im echten Betrieb geht es jetzt per E-Mail an den Kunden. Tippen Sie auf „Als Kunde ansehen“.');
    return;
  }
  if (e.target.closest('#win')) { await patchRequest(r.id, { status: 'gewonnen', wonAt: new Date().toISOString(), bestaetigtVon: 'chef' }); toast('Als bestätigt markiert.'); return; }
  if (e.target.closest('#kundenlink')) { openOffer(r); return; }
  if (e.target.closest('#lose')) { await patchRequest(r.id, { status: 'verloren' }); return; }
  if (e.target.closest('#reopen')) { await patchRequest(r.id, { status: r.angebot ? 'angebot' : 'neu' }); return; }
  if (e.target.closest('#pdf')) { printOffer(r); return; }
});

function printOffer(r) {
  if (!r.angebot) return;
  $('#printArea').innerHTML = docHtml(r);
  try { window.print(); } catch (e) { toast('Drucken ist hier nicht möglich.'); }
}
let offerId = null;
function renderOfferModal() {
  const r = allRequests().find(x => x.id === offerId); if (!r || !r.angebot) return;
  const done = r.status === 'gewonnen';
  $('#offerModalBody').innerHTML = `<p>Hallo ${esc(r.kunde.name.split(' ')[0])}, vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot:</p>${docHtml(r)}
    ${done ? '<div class="accepted" role="status">Angebot angenommen. Das Team meldet sich wegen des Termins.</div>'
      : '<div class="actions"><button type="button" class="btn primary" id="acceptOffer">Angebot annehmen</button><button type="button" class="btn ghost" id="offerLater">Später entscheiden</button></div><p class="note" style="font-size:12.5px;color:var(--muted)">Klickt der Kunde auf „Angebot annehmen“, zählt der Auftrag automatisch als bestätigt. Der Chef muss nichts nachtragen.</p>'}`;
}
function openOffer(r) {
  offerId = r.id; renderOfferModal();
  const d = $('#offerModal');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
function closeOffer() { const d = $('#offerModal'); if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
$('#offerClose').addEventListener('click', closeOffer);
$('#offerModal').addEventListener('click', async e => {
  if (e.target === $('#offerModal')) { closeOffer(); return; }
  if (e.target.closest('#offerLater')) { closeOffer(); return; }
  if (e.target.closest('#acceptOffer') && offerId) {
    await patchRequest(offerId, { status: 'gewonnen', wonAt: new Date().toISOString(), bestaetigtVon: 'kunde' });
    renderOfferModal(); toast('Angenommen. Die Kennzahlen oben sind schon aktualisiert.');
  }
});

const BEISPIELE = [
  { name: 'Laura M. (Beispiel)', kontakt: '0170 0000001', leistung: 'innen', fahrzeug: 'kompakt', modell: 'VW Golf', angaben: { verschmutzung: 'stark', tierhaare: true, flecken: false }, kanal: 'Website', stunde: 21, minute: 40, tagZurueck: 1, kurz: 'Innenraum eines Kompaktwagens mit vielen Hundehaaren auf der Rückbank und Krümeln im Fußraum.', status: 'neu' },
  { name: 'Kemal Y. (Beispiel)', kontakt: 'kemal@example.org', leistung: 'smart', fahrzeug: '', modell: '', angaben: { kratzerGroesse: 'klein', kratzerAnzahl: 2 }, kanal: 'Anruf-SMS', stunde: 12, minute: 15, tagZurueck: 3, kurz: 'Zwei kurze Kratzer an der hinteren Stoßstange, Lack an einer Stelle bis zur Grundierung.', status: 'angebot' },
  { name: 'Petra S. (Beispiel)', kontakt: '0151 0000002', leistung: 'keramik', fahrzeug: 'suv', modell: 'Skoda Kodiaq', angaben: {}, kanal: 'Website', stunde: 19, minute: 5, tagZurueck: 6, kurz: 'Dunkles SUV mit leichten Waschkratzern im Lack, sonst in gutem Zustand.', status: 'gewonnen' }
];
function beispielAnfrage(b, status) {
  const d = new Date(); d.setDate(d.getDate() - b.tagZurueck); d.setHours(b.stunde, b.minute, 0, 0);
  const ctx = Object.assign({ leistung: b.leistung, fahrzeug: b.fahrzeug }, b.angaben);
  const preis = berechne(ctx);
  const r = {
    id: uid(), createdAt: d.toISOString(), kanal: b.kanal, status: 'neu', beispiel: true,
    kunde: { name: b.name, kontakt: b.kontakt }, leistung: b.leistung, fahrzeug: b.fahrzeug || null, modell: b.modell,
    angaben: Object.assign({ verschmutzung: null, tierhaare: false, flecken: false, kratzerGroesse: null, kratzerAnzahl: null }, b.angaben),
    ki: { kurz: b.kurz }, fotos: [], preis, termin: nextSlots()[1] || '', bewertungOk: true,
    verlauf: [{ von: 'Kunde', text: `Anfrage für ${svc(b.leistung).name}` }, { von: 'Assistent', text: 'Richtwert genannt, Termin angefragt.' }]
  };
  if (status !== 'neu') {
    const am = new Date(d.getTime() + 15 * 3600e3).toISOString();
    r.angebot = { positionen: preis.positionen.map(p => ({ text: p.text, betrag: p.betrag })), summe: preis.summe || 0, nr: `AN-${d.getFullYear()}-${r.id.slice(-4).toUpperCase()}`, datum: am };
    r.sentAt = am; r.status = status;
    if (status === 'gewonnen') { r.wonAt = am; r.bestaetigtVon = 'kunde'; }
  }
  return normalize(r.id, r);
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
  const knopf = '<button class="btn ghost danger" type="button" id="clearAll">Demo zurücksetzen</button>';
  if (e.target.closest('#clearAll')) { $('#clearWrap').innerHTML = '<span class="confirm">Eigene Anfragen löschen und Beispiele wiederherstellen? <button class="btn danger" type="button" id="clearYes">Ja, zurücksetzen</button><button class="btn ghost" type="button" id="clearNo">Abbrechen</button></span>'; return; }
  if (e.target.closest('#clearNo')) { $('#clearWrap').innerHTML = knopf; return; }
  if (e.target.closest('#clearYes')) {
    S.mem = beispielSatz(); store();
    S.selected = null; S.drafts = {};
    $('#clearWrap').innerHTML = knopf;
    renderChef(true); toast('Demo zurückgesetzt.');
  }
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
const VIEWS = ['kunde', 'anruf', 'chef', 'preise'];
function go(v, push = true) {
  if (!VIEWS.includes(v)) v = 'kunde';
  VIEWS.forEach(x => { document.getElementById('v-' + x).hidden = x !== v; document.getElementById('tab-' + x).setAttribute('aria-selected', String(x === v)); });
  if (push && location.hash !== '#' + v) { try { history.replaceState(null, '', '#' + v); } catch (e) { location.hash = v; } }
  if (v === 'chef') renderChef(true);
  window.scrollTo(0, 0);
}
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); });
window.addEventListener('hashchange', () => go(location.hash.slice(1), false));

/* ---------- boot ---------- */
loadStore(); renderServices(); renderPrices(); phone('idle'); startChat('Website'); renderStatus(); renderChef();
go(location.hash.slice(1) || 'kunde', false);
initKi();
})();
