/* Website-Chat-Widget. Einbau: <script src="https://IHR-SERVER/widget.js" defer></script>
   Lädt Konfiguration und Chat erst, wenn der Besucher auf den Button klickt. */
(() => {
  if (customElements.get("website-chat")) return;
  const SCRIPT = document.currentScript;
  const V = /*VOREINSTELLUNG*/ null || { design: {}, maskottchen: null };
  // Adresse des Chat-Servers: data-api am Script-Tag, sonst aus der Voreinstellung (Kunden-Widget), sonst Herkunft des Skripts
  const API = (SCRIPT && SCRIPT.dataset.api) || V.api || (SCRIPT ? new URL(SCRIPT.src).origin : location.origin);

  // Beim Bauen eingesetzt (scripts/daten-bauen.mjs): Farben und Maskottchen,
  // damit der Button schon vor dem Klick richtig aussieht – ohne Serveranfrage.

  const M = V.maskottchen;

  /**
   * Ist der Betrieb gerade besetzt? Entscheidet, was auf dem Knopf steht.
   * null = unbekannt (keine oder keine eindeutige Zeitangabe) → neutraler Text.
   * Gerechnet wird in deutscher Zeit, damit ein Besucher aus dem Ausland nichts Falsches sieht.
   */
  /** Datum in deutscher Zeit, als "2026-12-25". */
  const heuteDe = () => {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  };
  /** Name des heutigen Feiertags oder null. An Feiertagen vergibt niemand Termine. */
  const feiertagHeute = () => {
    const liste = (V.design || {}).feiertage;
    if (!Array.isArray(liste) || !liste.length) return null;
    try { const f = liste.find((e) => e && e.d === heuteDe()); return f ? f.n : null; } catch { return null; }
  };
  const jetztOffen = () => {
    try { if (feiertagHeute()) return false; } catch {}
    const z = (V.design || {}).zeiten;
    if (!Array.isArray(z) || !z.length) return null;
    try {
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
      const tag = (d.getDay() + 6) % 7, min = d.getHours() * 60 + d.getMinutes();
      return z.some((e) => e && e.tag === tag && min >= e.von && min < e.bis);
    } catch { return null; }
  };
  /** Beschriftung des Knopfs: außerhalb der Zeiten laden wir ausdrücklich zum Schreiben ein. */
  const knopfText = (eigener) => {
    if (eigener) return eigener;
    const du = (V.design || {}).anrede === "du";
    if (feiertagHeute()) return du ? "Heute ist Feiertag – schreib uns" : "Heute ist Feiertag – schreiben Sie uns";
    if (jetztOffen() === false) return du ? "Gerade niemand da? Schreib uns" : "Gerade niemand da? Schreiben Sie uns";
    return "Fragen? Chat starten";
  };
  const ICON_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5h6l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" fill="currentColor"/></svg>';

  // --- Farben: Die Firmenfarbe kann alles sein, von Hellgelb bis Schwarz. Daraus leiten wir
  // lesbare Partnerfarben ab, statt überall Weiß auf Firmenfarbe zu setzen.
  const hex = (c) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const kanal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const helligkeit = (rgb) => 0.2126 * kanal(rgb[0]) + 0.7152 * kanal(rgb[1]) + 0.0722 * kanal(rgb[2]);
  const kontrast = (a, b) => { const [h, d] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x); return (h + 0.05) / (d + 0.05); };
  const zuHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mischen = (a, b, t) => zuHex(a.map((v, i) => v + (b[i] - v) * t));
  /** Farben, die zur Firmenfarbe passen und immer lesbar bleiben. */
  const palette = (d) => {
    const p = hex(d.primaer) || [31, 42, 55], a = hex(d.akzent) || [201, 154, 46];
    const weiss = [255, 255, 255], schwarz = [17, 20, 24];
    // Schrift auf der Firmenfarbe: Weiß oder Dunkel, je nachdem was besser lesbar ist
    const auf = kontrast(p, weiss) >= kontrast(p, schwarz) ? "#fff" : "#11141a";
    // Firmenfarbe als Schriftfarbe auf hellem Grund: so lange abdunkeln, bis sie gut lesbar ist
    let text = p;
    for (let i = 0; i < 24 && kontrast(text, [252, 252, 253]) < 4.6; i++) text = text.map((v) => v * 0.9);
    // Flächen und Ränder aus der Firmenfarbe mischen. Ist sie selbst sehr hell (Gelb, Hellgrau),
    // nehmen wir die abgedunkelte Fassung – sonst wären Ränder und Vorschläge kaum zu sehen.
    const basis = helligkeit(p) > 0.5 ? text : p;
    // Flächenfarbe (Knopf, eigene Nachricht): Hebt sich die Firmenfarbe kaum vom Fenstergrund ab,
    // nehmen wir die abgedunkelte Fassung – sonst sieht der Besucher seine eigene Nachricht fast nicht.
    // Ein kräftiges Gelb hebt sich durch seine Farbigkeit ab, ein Hellgrau nicht: deshalb zählt beides.
    const grund = hex(d.hintergrund) || [246, 247, 249];
    const farbigkeit = (Math.max(...p) - Math.min(...p)) / (Math.max(...p) || 1);
    const flaeche = farbigkeit < 0.18 && kontrast(p, grund) < 1.6 ? text : p;
    const aufFlaeche = kontrast(flaeche, weiss) >= kontrast(flaeche, schwarz) ? "#fff" : "#11141a";
    return {
      p: zuHex(flaeche), pt: aufFlaeche, pText: zuHex(text),
      p06: mischen(weiss, basis, 0.07), p12: mischen(weiss, basis, 0.14), p24: mischen(weiss, basis, 0.28),
      a: d.akzent || "#c99a2e", aText: (() => { let t = a; for (let i = 0; i < 24 && kontrast(t, [252, 252, 253]) < 4.6; i++) t = t.map((v) => v * 0.9); return zuHex(t); })(),
    };
  };

  const css = (d) => {
    const c = palette(d);
    const links = d.position === "links";
    return `
  /* Grundlage: Das Fenster ist ein ruhiger Rahmen, die Firmenfarbe setzt Akzente.
     So sieht es mit jeder Kundenfarbe gut aus – auch mit Knallgelb oder Schwarz. */
  :host{all:initial;
    --p:${c.p};              /* Firmenfarbe */
    --pt:${c.pt};            /* Schrift auf der Firmenfarbe (automatisch lesbar) */
    --p-text:${c.pText};     /* Firmenfarbe als Schrift auf hellem Grund */
    --p-06:${c.p06};         /* Firmenfarbe als Fläche, sehr leicht */
    --p-12:${c.p12};
    --p-24:${c.p24};
    --a:${c.a};--a-text:${c.aText};
    --flaeche:${d.hintergrund || "#f6f7f9"};   /* Grund des Fensters */
    --karte:#fff;                               /* Blasen und Karten liegen darauf */
    --t:#13171d;--m:#5c6672;--line:#e3e6ea;--line-weich:#edeff2;
    --r:${d.radius || "18px"};--r-blase:16px;--r-karte:14px;--r-knopf:11px;
    --schatten:0 1px 2px rgba(16,24,40,.04),0 8px 24px -8px rgba(16,24,40,.12);
    --schatten-gross:0 2px 4px rgba(16,24,40,.04),0 24px 56px -12px rgba(16,24,40,.26);
    font:15.5px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--t);
    -webkit-font-smoothing:antialiased}
  *{box-sizing:border-box}

  /* --- Knopf unten in der Ecke --- */
  .launch{position:fixed;${links ? "left" : "right"}:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:9px;
    border:0;border-radius:999px;background:var(--p);color:var(--pt);padding:13px 20px 13px 17px;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;
    box-shadow:0 2px 6px rgba(16,24,40,.12),0 12px 28px -8px rgba(16,24,40,.3);
    transition:transform .18s cubic-bezier(.2,.8,.3,1),box-shadow .18s}
  .launch:hover{transform:translateY(-2px);box-shadow:0 3px 8px rgba(16,24,40,.14),0 18px 36px -10px rgba(16,24,40,.34)}
  .launch:active{transform:translateY(0)}
  .launch svg{width:20px;height:20px}
  .launch.mit-figur{background:${d.launcherHintergrund || "var(--p)"};color:${d.launcherTextfarbe || "var(--pt)"};padding:5px 20px 5px 6px}
  .figur{display:grid;place-items:center;flex:none}
  .figur svg{width:100%;height:100%;overflow:visible}
  .launch .figur{width:44px;height:44px;transform-origin:50% 90%;animation:winken 7s ease-in-out 2s infinite}
  .launch:hover .figur{animation:huepf .6s ease-in-out}
  @keyframes winken{0%,84%,100%{transform:rotate(0)}87%{transform:rotate(-12deg)}90%{transform:rotate(10deg)}93%{transform:rotate(-7deg)}96%{transform:rotate(4deg)}}
  @keyframes huepf{0%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}70%{transform:translateY(1px)}}
  .figur .tuch{transform-origin:150px 135px;animation:wisch 1.2s ease-in-out infinite}
  .launch .figur .tuch{animation:none}
  @keyframes wisch{0%,100%{transform:rotate(0)}50%{transform:rotate(-18deg)}}

  /* --- Kurzer Hinweis über dem Knopf --- */
  .teaser{position:fixed;${links ? "left" : "right"}:20px;bottom:88px;z-index:2147483000;max-width:250px;background:var(--karte);color:var(--t);
    border:1px solid var(--line-weich);border-radius:var(--r-karte);padding:11px 34px 11px 14px;font-size:14.5px;line-height:1.45;
    box-shadow:var(--schatten);animation:rein .3s cubic-bezier(.2,.8,.3,1)}
  .teaser:after{content:"";position:absolute;${links ? "left" : "right"}:34px;bottom:-6px;width:12px;height:12px;background:var(--karte);
    border-right:1px solid var(--line-weich);border-bottom:1px solid var(--line-weich);transform:rotate(45deg)}
  .teaser button{position:absolute;top:5px;right:5px;border:0;background:none;color:var(--m);font-size:17px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:7px}
  .teaser button:hover{background:var(--line-weich)}
  .teaser[hidden]{display:none}
  @keyframes rein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

  .launch:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--p-text);outline-offset:2px}
  input:focus-visible,textarea:focus-visible{outline:0}
  @supports not selector(:focus-visible){input:focus,textarea:focus{outline:0}}

  /* --- Fenster --- */
  .panel{position:fixed;${links ? "left" : "right"}:20px;bottom:20px;z-index:2147483001;width:396px;max-width:calc(100vw - 32px);
    height:min(640px,calc(100vh - 40px));background:var(--flaeche);border:1px solid var(--line);border-radius:var(--r);
    box-shadow:var(--schatten-gross);display:flex;flex-direction:column;overflow:hidden;
    animation:auf .24s cubic-bezier(.2,.8,.3,1)}
  @keyframes auf{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
  .panel[hidden],.launch[hidden]{display:none}

  /* --- Kopfzeile: wer antwortet hier --- */
  header{display:flex;align-items:center;gap:11px;padding:13px 12px 13px 15px;background:color-mix(in srgb,var(--karte) 86%,transparent);
    -webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);border-bottom:1px solid var(--line-weich);flex:none;position:relative;z-index:2}
  @supports not (backdrop-filter:blur(2px)){header{background:var(--karte)}}
  .avatar{width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;
    background:var(--p);color:var(--pt);font:600 16px/1 inherit;font-family:inherit;letter-spacing:.01em;overflow:hidden}
  .avatar.figur{background:var(--p-06);padding:3px}
  .who{flex:1;min-width:0}
  .who b{display:block;font-size:15.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .who .status{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--m);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .punkt{width:6px;height:6px;border-radius:50%;background:#2e9e5b;flex:none}
  .badge{display:inline-block;font-size:11.5px;font-weight:600;color:var(--p-text);background:var(--p-06);border-radius:6px;padding:2px 7px;margin-left:7px;vertical-align:1.5px;letter-spacing:.01em}
  .x{border:0;background:transparent;color:var(--m);width:36px;height:36px;border-radius:10px;cursor:pointer;display:grid;place-items:center;flex:none}
  .x:hover{background:var(--line-weich);color:var(--t)} .x svg{width:20px;height:20px}

  /* --- Verlauf --- */
  .log>:first-child{margin-top:auto}
  .log{flex:1;overflow-y:auto;padding:18px 16px 10px;display:flex;flex-direction:column;gap:11px;scroll-behavior:smooth;overscroll-behavior:contain}
  .log::-webkit-scrollbar{width:10px}
  .log::-webkit-scrollbar-thumb{background:#d6dae0;border-radius:99px;border:3px solid var(--flaeche)}
  .msg{max-width:88%;padding:11px 14px;font-variant-numeric:tabular-nums;border-radius:var(--r-blase);white-space:pre-wrap;word-wrap:break-word;animation:blase .22s cubic-bezier(.2,.8,.3,1)}
  @keyframes blase{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .bot{background:var(--karte);align-self:flex-start;border-bottom-left-radius:6px;border:1px solid var(--line-weich);box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .user{background:var(--p);color:var(--pt);align-self:flex-end;border-bottom-right-radius:6px}
  .msg ul{margin:5px 0;padding-left:19px} .msg li{margin:3px 0}
  .msg a{color:inherit;text-underline-offset:2px}
  .bot a{color:var(--p-text)}
  .note{font-size:12.5px;line-height:1.5;color:var(--m);background:var(--p-06);border-radius:var(--r-karte);padding:10px 13px;align-self:stretch}

  .typing{display:inline-flex;gap:5px;align-items:center;align-self:flex-start;padding:13px 15px;background:var(--karte);border:1px solid var(--line-weich);border-radius:var(--r-blase);border-bottom-left-radius:6px}
  .typing i{width:6px;height:6px;border-radius:50%;background:var(--m);opacity:.35;animation:b 1.2s infinite}
  .typing i:nth-child(2){animation-delay:.18s}.typing i:nth-child(3){animation-delay:.36s}
  @keyframes b{30%{opacity:.9;transform:translateY(-3px)}60%{opacity:.35;transform:none}}
  .typing.figur-tippt{background:none;border:0;padding:0 0 0 2px;gap:6px}
  .typing .figur{width:30px;height:30px;animation:huepf .9s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){
    .typing i,.figur,.figur .tuch,.launch .figur,.typing .figur,.teaser,.panel,.msg{animation:none!important}
    .launch{transition:none}.log{scroll-behavior:auto}}

  /* --- Vorschläge --- */
  .chips{display:flex;flex-wrap:wrap;gap:7px;align-self:flex-start;max-width:100%}
  .chip{border:1px solid var(--p-24);background:var(--karte);color:var(--p-text);border-radius:999px;padding:8px 14px;font:500 14.5px/1.3 inherit;font-family:inherit;cursor:pointer;
    transition:background .15s,border-color .15s}
  .chip:hover{background:var(--p-06);border-color:var(--p-text)}
  .chip:active{background:var(--p-12)}

  /* --- Preiskarte: der Betrag ist die Hauptsache, nicht eine Zahl im Satz --- */
  .card.preis{gap:0;padding:0;overflow:hidden}
  .card.preis>h4{padding:15px 16px 11px;background:var(--p-06);border-bottom:1px solid var(--line-weich)}
  .card.preis>.preis-hinweis:last-child{padding-bottom:14px}
  .preis-kopf{display:flex;align-items:baseline;gap:12px;padding:15px 16px 14px;background:var(--p-06);border-bottom:1px solid var(--line-weich)}
  .preis-name{flex:1;min-width:0;font-size:15px;font-weight:600;letter-spacing:-.01em;line-height:1.35}
  .preis-wert{display:flex;align-items:baseline;gap:5px;white-space:nowrap;font-variant-numeric:tabular-nums}
  .preis-wert b{font-size:23px;font-weight:650;letter-spacing:-.02em;color:var(--p-text)}
  .preis-ab{font-size:13px;color:var(--m)}
  .preis-teile{display:grid;font-size:14px;font-variant-numeric:tabular-nums}
  .preis-teile>div{display:flex;justify-content:space-between;gap:12px;padding:9px 16px;border-bottom:1px solid var(--line-weich)}
  .preis-teile>div:last-child{border-bottom:0}
  .preis-teile>div>span:first-child{color:var(--m);min-width:0}
  .preis-teile>div>span:last-child{white-space:nowrap;font-weight:550}
  .preis-teile.gross>div{padding:11px 16px;font-size:14.5px}
  .preis-teile.gross>div>span:first-child{color:var(--t)}
  .preis-teile .tipp>span:last-child{color:var(--p-text);font-weight:650}
  .marke{display:inline-block;font-style:normal;font-size:11px;font-weight:600;color:var(--p-text);background:var(--p-06);border-radius:5px;padding:1px 6px;margin-left:6px;vertical-align:1px}
  .preis-liste{margin:0;padding:12px 16px 2px;list-style:none;display:grid;gap:6px;font-size:14px;color:var(--m)}
  .preis-liste li{display:flex;gap:9px;align-items:flex-start;line-height:1.45}
  .preis-liste li:before{content:"";flex:none;width:15px;height:15px;margin-top:2px;border-radius:50%;background:var(--p-12);
    background-image:linear-gradient(transparent,transparent);box-shadow:inset 0 0 0 1px var(--p-24)}
  .preis-hinweis{margin:0;padding:11px 16px 0;font-size:12.5px;line-height:1.5;color:var(--m)}
  .card.preis .row{padding:13px 16px 15px}

  /* --- Karten (Anfrage, Kontakt) --- */
  .card{border:1px solid var(--line-weich);border-radius:var(--r-karte);padding:15px;background:var(--karte);align-self:stretch;display:grid;gap:11px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .card h4{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
  .card label{font-size:12.5px;color:var(--m);display:grid;gap:4px}
  .card input,.card textarea{font:inherit;font-size:15px;color:var(--t);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%;background:var(--karte);
    transition:border-color .15s,box-shadow .15s}
  .card input:focus,.card textarea:focus{outline:0;border-color:var(--p-text);box-shadow:0 0 0 3px var(--p-12)}
  .card textarea{min-height:60px;resize:vertical}
  .consent{display:flex!important;grid-template-columns:none;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.5}
  .consent input{width:auto;margin-top:2px;accent-color:var(--p)}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .btn{border:0;border-radius:var(--r-knopf);padding:10px 15px;font:600 14.5px/1.2 inherit;font-family:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;
    transition:filter .15s,background .15s}
  .btn-p{background:var(--p);color:var(--pt)} .btn-p:hover{filter:brightness(1.08)}
  .btn-g{background:var(--flaeche);color:var(--t);border:1px solid var(--line)} .btn-g:hover{background:var(--line-weich)}
  .btn[disabled]{opacity:.55;cursor:default;filter:none}
  .err{color:#b42318;font-size:12.5px;min-height:0}

  /* --- Eingabe: ein Feld, Knopf sitzt darin --- */
  form.send{display:flex;gap:8px;align-items:flex-end;padding:10px 12px 10px;background:color-mix(in srgb,var(--karte) 88%,transparent);
    -webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);border-top:1px solid var(--line-weich);flex:none;position:relative;z-index:2}
  @supports not (backdrop-filter:blur(2px)){form.send,.foot{background:var(--karte)}}
  form.send textarea{flex:1;font:inherit;font-size:15.5px;border:1px solid var(--line);border-radius:14px;padding:11px 13px;resize:none;height:44px;max-height:120px;color:var(--t);background:var(--flaeche);
    transition:border-color .15s,box-shadow .15s,background .15s}
  form.send textarea::placeholder{color:#8b949f}
  form.send textarea:focus{outline:0;background:var(--karte);border-color:var(--p-text);box-shadow:0 0 0 3px var(--p-12)}
  form.send button{width:44px;height:44px;border:0;border-radius:50%;background:var(--p);color:var(--pt);cursor:pointer;display:grid;place-items:center;flex:none;
    transition:filter .18s,opacity .18s,transform .18s cubic-bezier(.2,.8,.3,1)}
  form.send button[type=submit].leer{opacity:.4;transform:scale(.94)}
  form.send button:hover{filter:brightness(1.08)}
  form.send button svg{width:18px;height:18px;margin-left:-1px}
  form.send button.cam{background:var(--flaeche);color:var(--m);border:1px solid var(--line);border-radius:50%}
  form.send button.cam:hover{background:var(--line-weich);color:var(--t);filter:none}
  form.send button.cam svg{width:20px;height:20px;margin:0}
  .msg.user img{display:block;max-width:210px;max-height:230px;border-radius:10px;margin:-4px -6px 7px;object-fit:cover}
  .msg.user .cap:empty{display:none}
  .foot{font-size:11.5px;line-height:1.5;color:var(--m);text-align:center;padding:0 14px 10px;background:color-mix(in srgb,var(--karte) 88%,transparent);
    -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);position:relative;z-index:2}
  .foot a{color:var(--m);text-underline-offset:2px}

  @media (max-width:520px){
    .panel{left:0;right:0;bottom:0;top:0;width:100%;max-width:none;height:100%;height:100dvh;border-radius:0;border:0;animation:none}
    header{padding-top:max(13px,env(safe-area-inset-top))}
    .launch{bottom:max(16px,env(safe-area-inset-bottom));${links ? "left" : "right"}:16px}
    .log{padding:16px 14px 8px}
    .msg{max-width:92%}
    form.send{padding-bottom:max(10px,env(safe-area-inset-bottom))}
    form.send textarea{font-size:16px}
    .foot{padding-bottom:max(10px,env(safe-area-inset-bottom))}
  }`;
  };

  /** Oben steht, mit wem man spricht: der Name des Assistenten, wenn er einen eigenen hat – sonst der Betrieb. */
  const eigenerName = (c) => { const n = (c.betrieb.botName || "").trim(); return n && n.toLowerCase() !== "assistent" ? n : ""; };
  const kopfTitel = (c) => eigenerName(c) || (c.betrieb.name || "Assistent").trim() || "Assistent";
  const kopfUnter = (c, mitFigur) => {
    const firma = (c.betrieb.name || "").trim();
    return mitFigur || eigenerName(c) ? (firma || "Antwortet sofort") : "Antwortet sofort";
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };

  class WebsiteChat extends HTMLElement {
    connectedCallback() {
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `<style>${css(V.design || {})}</style>` + (M
        ? `<button class="launch mit-figur" part="launcher" aria-label="Chat mit ${esc(M.name)} öffnen"><span class="figur">${M.svg}</span><span>${esc(knopfText((V.design || {}).launcherText))}</span></button>`
        : `<button class="launch" part="launcher" aria-label="Chat öffnen">${ICON_CHAT}<span>${esc(knopfText((V.design || {}).launcherText))}</span></button>`);
      if (M && M.teaser && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.teaserTimer = setTimeout(() => {
          if (this.geladen) return;
          const tz = document.createElement("div"); tz.className = "teaser"; tz.setAttribute("role", "status");
          tz.innerHTML = `${esc(M.teaser)}<button type="button" aria-label="Hinweis schließen">×</button>`;
          tz.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); tz.remove(); });
          tz.addEventListener("click", () => { tz.remove(); this.oeffnen(); });
          this.root.appendChild(tz); this.teaserEl = tz;
          setTimeout(() => tz.remove(), 9000);
        }, 6000);
      }
      this.root.querySelector(".launch").addEventListener("click", () => this.oeffnen(), { once: false });
      this.geladen = false;
      this.verlauf = ss.get("wc_verlauf") || "";
    }

    async oeffnen() {
      clearTimeout(this.teaserTimer); if (this.teaserEl) this.teaserEl.remove();
      if (!this.geladen) {
        try { this.cfg = await (await fetch(API + "/api/config")).json(); }
        catch { this.cfg = null; }
        this.aufbauen();
        this.geladen = true;
      }
      this.root.querySelector(".launch").hidden = true;
      this.panel.hidden = false;
      this.eingabe.focus();
    }

    schliessen() {
      this.panel.hidden = true;
      const l = this.root.querySelector(".launch"); l.hidden = false; l.focus();
    }

    aufbauen() {
      const c = this.cfg || { betrieb: { botName: "Assistent" }, design: {}, start: { begruessung: "Der Chat ist gerade nicht erreichbar.", kiHinweis: "", buttons: [] }, ton: { anrede: "Sie" } };
      this.du = c.ton.anrede === "du";
      const style = this.root.querySelector("style");
      style.textContent = css({ ...(V.design || {}), ...(c.design || {}) });
      const p = document.createElement("section");
      p.className = "panel"; p.hidden = true;
      p.setAttribute("role", "dialog"); p.setAttribute("aria-label", c.betrieb.botName);
      p.innerHTML = `
        <header>${M ? `<span class="figur avatar">${M.svg}</span>` : `<span class="avatar" aria-hidden="true">${esc(kopfTitel(c)[0].toUpperCase())}</span>`}<div class="who"><b>${esc(M ? M.name : kopfTitel(c))}<span class="badge">KI-Assistent</span></b>
        <span class="status"><i class="punkt"></i>${esc(kopfUnter(c, !!M))}</span></div>
        <button class="x" aria-label="Chat schließen">${ICON_X}</button></header>
        <div class="log" aria-live="polite"></div>
        <form class="send">${c.foto ? `<button type="button" class="cam" aria-label="Foto senden" title="${esc(c.foto.hinweis || "Foto senden")}">${ICON_CAM}</button><input type="file" accept="image/*" hidden>` : ""}<textarea rows="1" maxlength="${Number(c.maxZeichen) || 800}" placeholder="${this.du ? "Schreib" : "Schreiben Sie"} Ihre Frage …" aria-label="Nachricht"></textarea>
        <button type="submit" aria-label="Senden">${ICON_SEND}</button></form>
        <div class="foot">KI-Antworten können Fehler enthalten. ${c.betrieb.datenschutzUrl ? `<a href="${esc(c.betrieb.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>` : ""}${c.poweredBy ? " · Powered by Claude (Anthropic)" : ""}</div>`;
      if (this.du) p.querySelector("textarea").placeholder = "Schreib deine Frage …";
      this.root.appendChild(p);
      this.panel = p;
      this.log = p.querySelector(".log");
      this.eingabe = p.querySelector("textarea");
      p.querySelector(".x").addEventListener("click", () => this.schliessen());
      p.addEventListener("keydown", (e) => { if (e.key === "Escape") this.schliessen(); });
      if (c.foto) {
        this.datei = p.querySelector('input[type="file"]');
        p.querySelector(".cam").addEventListener("click", () => this.fotoWaehlen());
        this.datei.addEventListener("change", () => { const f = this.datei.files && this.datei.files[0]; this.datei.value = ""; if (f) this.fotoSenden(f); });
      }
      this.fotos = 0;
      p.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); this.senden(this.eingabe.value); });
      this.eingabe.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.senden(this.eingabe.value); } });
      this.sendKnopf = p.querySelector('form.send button[type="submit"]');
      const knopfStand = () => this.sendKnopf.classList.toggle("leer", !this.eingabe.value.trim());
      knopfStand();
      this.eingabe.addEventListener("input", () => {
        this.eingabe.style.height = "44px";
        this.eingabe.style.height = Math.min(120, this.eingabe.scrollHeight) + "px";
        knopfStand();
      });
      this.nachSenden = knopfStand;

      this.botText(c.start.begruessung);
      if (c.start.kiHinweis) this.notiz(c.start.kiHinweis + (c.demo ? " (Demo-Modus ohne KI)" : ""));
      this.chips([...(c.foto ? [c.foto.button] : []), ...(c.start.buttons || [])]);
    }

    fotoWaehlen() {
      const f = this.cfg && this.cfg.foto;
      if (!f || this.busy) return;
      if (this.fotos >= f.max) { this.botText(this.du ? "Für diesen Chat sind genug Fotos da. Weitere schickst du uns gern per WhatsApp." : "Für diesen Chat sind genug Fotos da. Weitere schicken Sie uns gern per WhatsApp."); return; }
      if (!this.fotoHinweis && f.hinweis) { this.notiz(f.hinweis); this.fotoHinweis = true; }
      this.datei.click();
    }

    // Verkleinert das Foto im Browser (max. 1280 px, JPEG). Entfernt dabei auch
    // Standortdaten und andere Metadaten aus der Datei.
    async verkleinern(file) {
      let quelle;
      try { quelle = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch {
        quelle = await new Promise((ok, fail) => { const img = new Image(); img.onload = () => ok(img); img.onerror = fail; img.src = URL.createObjectURL(file); });
      }
      const w0 = quelle.width, h0 = quelle.height, s = Math.min(1, 1280 / Math.max(w0, h0));
      const cv = document.createElement("canvas"); cv.width = Math.round(w0 * s); cv.height = Math.round(h0 * s);
      cv.getContext("2d").drawImage(quelle, 0, 0, cv.width, cv.height);
      let url = cv.toDataURL("image/jpeg", 0.82);
      if (url.length > 1_800_000) url = cv.toDataURL("image/jpeg", 0.6);
      return url;
    }

    async fotoSenden(file) {
      if (this.busy) return;
      let url;
      try { url = await this.verkleinern(file); }
      catch { this.botText(this.du ? "Dieses Bildformat kann ich leider nicht öffnen. Versuch es mit einem normalen Foto (JPG/PNG)." : "Dieses Bildformat kann ich leider nicht öffnen. Bitte versuchen Sie es mit einem normalen Foto (JPG/PNG)."); return; }
      this.fotos++;
      this.senden(this.eingabe.value, url);
    }

    scroll() { this.log.scrollTop = this.log.scrollHeight; }

    render(el, text) {
      // Einfache, sichere Darstellung: Zeilen mit "- " werden zu Listen, Telefonnummern/E-Mails zu Links.
      const zeilen = esc(text).split("\n");
      let html = "", inList = false;
      for (const z of zeilen) {
        if (/^\s*[-•]\s+/.test(z)) { if (!inList) { html += "<ul>"; inList = true; } html += "<li>" + z.replace(/^\s*[-•]\s+/, "") + "</li>"; }
        else { if (inList) { html += "</ul>"; inList = false; } html += z + "\n"; }
      }
      if (inList) html += "</ul>";
      html = html.replace(/(\d) (€|EUR)/g, "$1&nbsp;$2").replace(/\bab (\d)/g, "ab&nbsp;$1").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/(\+49[\d\s]{8,16}\d)/g, (m) => `<a href="tel:${m.replace(/\s/g, "")}">${m}</a>`)
        .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>');
      el.innerHTML = html.replace(/\n+$/, "");
    }

    botText(t) { const d = document.createElement("div"); d.className = "msg bot"; this.render(d, t); this.log.appendChild(d); this.scroll(); return d; }
    notiz(t) { const d = document.createElement("div"); d.className = "note"; d.textContent = t; this.log.appendChild(d); this.scroll(); }

    chips(optionen) {
      if (!optionen.length) return;
      const w = document.createElement("div"); w.className = "chips";
      for (const o of optionen) {
        const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = o;
        const istFoto = this.cfg && this.cfg.foto && o === this.cfg.foto.button;
        b.addEventListener("click", () => { if (istFoto) return this.fotoWaehlen(); w.remove(); this.senden(o); });
        w.appendChild(b);
      }
      this.log.appendChild(w); this.scroll();
    }

    async senden(text, bild) {
      text = String(text || "").trim();
      if ((!text && !bild) || this.busy) return;
      this.busy = true;
      this.log.querySelectorAll(".chips").forEach((c) => c.remove());
      const u = document.createElement("div"); u.className = "msg user";
      if (bild) { const img = document.createElement("img"); img.onload = () => this.scroll(); img.src = bild; img.alt = "Ihr Foto"; u.appendChild(img); }
      const cap = document.createElement("div"); cap.className = "cap"; cap.textContent = text; u.appendChild(cap);
      this.log.appendChild(u);
      this.eingabe.value = ""; this.eingabe.style.height = "44px"; if (this.nachSenden) this.nachSenden();
      const typing = document.createElement("div"); typing.className = "typing" + (M ? " figur-tippt" : "");
      typing.innerHTML = (M ? `<span class="figur">${M.svg}</span>` : "") + "<i></i><i></i><i></i>";
      typing.setAttribute("aria-label", (M ? M.name : "Assistent") + " schreibt …");
      this.log.appendChild(typing); this.scroll();

      let bubble = null, voll = "";
      const uis = [];
      try {
        const res = await fetch(API + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nachricht: text, verlauf: this.verlauf, ...(bild ? { bild } : {}) }) });
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = (block.match(/^event: (.*)$/m) || [])[1];
            const data = JSON.parse((block.match(/^data: (.*)$/m) || [, "{}"])[1]);
            if (ev === "verlauf") { this.verlauf = data.token; ss.set("wc_verlauf", data.token); }
            else if (ev === "text") {
              if (!bubble) { typing.remove(); bubble = this.botText(""); }
              voll += data.text; this.render(bubble, voll); this.scroll();
            } else if (ev === "ui") uis.push(data);
          }
        }
      } catch {
        if (!bubble) { typing.remove(); bubble = this.botText(""); }
        voll += (voll ? "\n\n" : "") + "Die Verbindung ist gerade gestört.";
        this.render(bubble, voll); uis.push({ typ: "uebergabe" });
      }
      typing.remove();
      for (const ui of uis) this.zeigeUi(ui);
      this.busy = false;
      this.eingabe.focus();
    }

    zeigeUi(ui) {
      if (ui.typ === "buttons") return this.chips(ui.optionen || []);
      if (ui.typ === "uebergabe") return this.uebergabe();
      if (ui.typ === "anfrage_formular") return this.formular(ui.felder || {});
      if (ui.typ === "preis") return this.preiskarte(ui);
      if (ui.typ === "preisliste") return this.preisliste(ui);
    }

    /** Ein Preis, sichtbar statt im Fließtext: Leistung, Betrag, was dazugehört. */
    preiskarte(ui) {
      const d = document.createElement("div"); d.className = "card preis";
      const zusatz = (ui.zusatz || []).filter((z) => z && z.name);
      d.innerHTML = `<div class="preis-kopf"><div class="preis-name">${esc(ui.titel || "")}</div>
        <div class="preis-wert">${ui.ab ? '<span class="preis-ab">ab</span>' : ""}<b>${esc(ui.preis || "")}</b></div></div>
        ${zusatz.length ? `<div class="preis-teile">${[{ name: "Grundpreis", preis: ui.grundpreis }, ...zusatz].map((z) => `<div><span>${esc(z.name)}</span><span>${esc(z.preis || "")}</span></div>`).join("")}</div>` : ""}
        ${(ui.leistungen || []).length ? `<ul class="preis-liste">${ui.leistungen.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${ui.hinweis ? `<p class="preis-hinweis">${esc(ui.hinweis)}</p>` : ""}
        <div class="row"><button class="btn btn-p" type="button" data-f>Anfrage starten</button></div>`;
      d.querySelector("[data-f]").addEventListener("click", () => this.formular({}));
      this.log.appendChild(d); this.scroll();
    }

    /** Mehrere Leistungen zum Vergleichen. */
    preisliste(ui) {
      const d = document.createElement("div"); d.className = "card preis";
      d.innerHTML = `<h4>${esc(ui.titel || "Leistungen")}</h4>
        <div class="preis-teile gross">${(ui.zeilen || []).map((z) => `<div${z.empfohlen ? ' class="tipp"' : ""}><span>${esc(z.name)}${z.empfohlen ? ' <i class="marke">Empfehlung</i>' : ""}</span><span>${esc(z.preis)}</span></div>`).join("")}</div>
        <p class="preis-hinweis">Was genau dazugehört, sage ich Ihnen gern – fragen Sie einfach nach einer Leistung.</p>`;
      this.log.appendChild(d); this.scroll();
    }

    uebergabe() {
      if (this.log.querySelector(".card.handoff:last-child")) return;
      const b = (this.cfg && this.cfg.betrieb) || {};
      const d = document.createElement("div"); d.className = "card handoff";
      d.innerHTML = `<h4>Direkt mit dem Team sprechen</h4><div class="row">
        ${b.buchungsUrl ? `<a class="btn btn-p" target="_blank" rel="noopener" href="${esc(b.buchungsUrl)}">${esc(((this.cfg && this.cfg.formular) || {}).buchungsText || "Online-Termin buchen")}</a>` : ""}
        ${b.whatsapp ? `<a class="btn ${b.buchungsUrl ? "btn-g" : "btn-p"}" target="_blank" rel="noopener" href="https://wa.me/${esc(b.whatsapp)}">WhatsApp</a>` : ""}
        ${b.telefon ? `<a class="btn btn-g" href="tel:${esc(b.telefon.replace(/\s/g, ""))}">Anrufen</a>` : ""}
        <button class="btn btn-g" type="button" data-f>Anfrage schreiben</button></div>`;
      d.querySelector("[data-f]").addEventListener("click", () => this.formular({}));
      this.log.appendChild(d); this.scroll();
    }

    formular(f) {
      const du = this.du;
      const b = (this.cfg && this.cfg.betrieb) || {};
      const fo = (this.cfg && this.cfg.formular) || {};
      const d = document.createElement("form"); d.className = "card"; d.noValidate = true;
      const feld = (k, label, ph, req, area) => `<label>${label}${req ? " *" : ""}${area
        ? `<textarea name="${k}" placeholder="${esc(ph)}">${esc(f[k] || "")}</textarea>`
        : `<input name="${k}" value="${esc(f[k] || "")}" placeholder="${esc(ph)}" ${req ? "required" : ""}>`}</label>`;
      d.innerHTML = `<h4>Anfrage prüfen und senden</h4>
        ${feld("name", "Name", "Vor- und Nachname", true)}
        ${feld("kontakt", "Telefon oder E-Mail", "für die Rückmeldung", true)}
        ${feld("fahrzeug", fo.objektLabel || "Fahrzeug", fo.objektPlatzhalter || "z. B. VW Golf 8, Kombi")}
        ${feld("paket", "Gewünschtes Paket", "z. B. Kombi Comfort")}
        ${feld("wunschtermin", "Wunschtermin", "z. B. nächste Woche vormittags")}
        ${feld("notiz", "Notiz", "Ort, Besonderheiten …", false, true)}
        <label class="consent"><input type="checkbox" name="einwilligung"> <span>Ich bin einverstanden, dass meine Angaben und dieser Chat zur Bearbeitung der Anfrage an ${esc(b.name || "den Betrieb")} übermittelt werden.${b.datenschutzUrl ? ` <a href="${esc(b.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>` : ""}</span></label>
        <div class="err" role="alert"></div>
        <div class="row"><button class="btn btn-p" type="submit">Anfrage senden</button>${b.buchungsUrl ? `<a class="btn btn-g" target="_blank" rel="noopener" href="${esc(b.buchungsUrl)}">${esc(fo.buchungsText || "Online-Termin buchen")}</a>` : ""}</div>`;
      d.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(d));
        const err = d.querySelector(".err");
        if (!data.name || !data.kontakt) { err.textContent = "Bitte Name und Telefon oder E-Mail angeben."; return; }
        if (!data.einwilligung) { err.textContent = "Bitte das Häkchen beim Einverständnis setzen."; return; }
        const btn = d.querySelector("button"); btn.disabled = true; btn.textContent = "Wird gesendet …"; err.textContent = "";
        // Höchstens 15 Sekunden warten – danach Plan B statt endlosem „Wird gesendet …“
        const mitZeit = (url, opts, ms) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms); return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(t)); };
        const start = Date.now(), rest = () => Math.max(3000, 15000 - (Date.now() - start));
        try {
          const r = await (await mitZeit(API + "/api/anfrage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, einwilligung: true, verlauf: this.verlauf }) }, rest())).json();
          if (!r.ok) throw new Error(r.fehler || "");
          if (r.formsubmit) {
            const fs = await mitZeit(r.formsubmit.url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(r.formsubmit.daten) }, rest())
              .then((x) => x.json()).catch(() => ({}));
            if (!(fs.success === true || fs.success === "true")) throw new Error("");
          }
          d.innerHTML = `<h4>Danke, ${esc(data.name.split(" ")[0])}!</h4><div>Die Anfrage ist angekommen. Wir melden uns ${du ? "bei dir" : "bei Ihnen"} schnellstmöglich persönlich – der Termin ist erst fest, wenn wir ihn bestätigt haben.</div>`;
        } catch (x) {
          btn.disabled = false; btn.textContent = "Erneut senden";
          const text = [`Hallo ${b.name || ""}, ich möchte einen Termin anfragen.`, `Name: ${data.name}`, `Kontakt: ${data.kontakt}`,
            data.fahrzeug && `${fo.objektLabel || "Fahrzeug"}: ${data.fahrzeug}`, data.paket && `Paket: ${data.paket}`,
            data.wunschtermin && `Wunschtermin: ${data.wunschtermin}`, data.notiz && `Notiz: ${data.notiz}`].filter(Boolean).join("\n");
          const meldung = (x && x.message) || (du ? "Das Senden klappt gerade nicht. Damit nichts verloren geht, schick uns die Anfrage einfach direkt – sie ist schon ausgefüllt:" : "Das Senden klappt gerade nicht. Damit nichts verloren geht, schicken Sie uns die Anfrage einfach direkt – sie ist schon ausgefüllt:");
          err.innerHTML = `${esc(meldung)}<div class="row" style="margin-top:8px">${b.whatsapp ? `<a class="btn btn-p" target="_blank" rel="noopener" href="https://wa.me/${esc(b.whatsapp)}?text=${encodeURIComponent(text)}">Per WhatsApp senden</a>` : ""}${b.email ? `<a class="btn btn-g" href="mailto:${esc(b.email)}?subject=${encodeURIComponent("Terminanfrage")}&body=${encodeURIComponent(text)}">Per E-Mail</a>` : ""}${b.telefon ? `<a class="btn btn-g" href="tel:${esc(b.telefon.replace(/\s/g, ""))}">Anrufen</a>` : ""}</div>`;
        }
        this.scroll();
      });
      this.log.appendChild(d); this.scroll();
      const first = d.querySelector('input[name="name"]'); if (first && !first.value) first.focus();
    }
  }

  customElements.define("website-chat", WebsiteChat);
  const mount = () => { if (!document.querySelector("website-chat")) document.body.appendChild(document.createElement("website-chat")); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();
})();
