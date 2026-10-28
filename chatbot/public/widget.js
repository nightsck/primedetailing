/* Website-Chat-Widget. Einbau: <script src="https://IHR-SERVER/widget.js" defer></script>
   Lädt Konfiguration und Chat erst, wenn der Besucher auf den Button klickt. */
(() => {
  if (customElements.get("website-chat")) return;
  const SCRIPT = document.currentScript;
  const API = (SCRIPT && SCRIPT.dataset.api) || (SCRIPT ? new URL(SCRIPT.src).origin : location.origin);

  // Beim Bauen eingesetzt (scripts/daten-bauen.mjs): Farben und Maskottchen,
  // damit der Button schon vor dem Klick richtig aussieht – ohne Serveranfrage.
  const V = /*VOREINSTELLUNG*/ null || { design: {}, maskottchen: null };
  const M = V.maskottchen;
  const ICON_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5h6l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" fill="currentColor"/></svg>';

  const css = (d) => `
  :host{all:initial;--p:${d.primaer||"#1f2a37"};--a:${d.akzent||"#c99a2e"};--bg:${d.hintergrund||"#fff"};--r:${d.radius||"14px"};
    --t:#1d232b;--m:#5b6573;--line:#e6e8ec;--soft:#f5f6f8;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--t)}
  *{box-sizing:border-box}
  .launch{position:fixed;${d.position==="links"?"left":"right"}:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;
    border:0;border-radius:999px;background:var(--p);color:#fff;padding:13px 18px;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;
    box-shadow:0 6px 20px rgba(16,24,40,.18)}
  .launch svg{width:20px;height:20px}
  .launch.mit-figur{background:${d.launcherHintergrund||"var(--p)"};color:${d.launcherTextfarbe||"#fff"};padding:5px 18px 5px 6px;border:2px solid var(--a)}
  .figur{display:grid;place-items:center;flex:none}
  .figur svg{width:100%;height:100%;overflow:visible}
  .launch .figur{width:44px;height:44px;transform-origin:50% 90%;animation:winken 7s ease-in-out 2s infinite}
  .launch:hover .figur{animation:huepf .6s ease-in-out}
  @keyframes winken{0%,84%,100%{transform:rotate(0)}87%{transform:rotate(-12deg)}90%{transform:rotate(10deg)}93%{transform:rotate(-7deg)}96%{transform:rotate(4deg)}}
  @keyframes huepf{0%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}70%{transform:translateY(1px)}}
  .figur .tuch{transform-origin:150px 135px;animation:wisch 1.2s ease-in-out infinite}
  .launch .figur .tuch{animation:none}
  @keyframes wisch{0%,100%{transform:rotate(0)}50%{transform:rotate(-18deg)}}
  .avatar{width:38px;height:38px;border-radius:50%;background:#eaf6fd;padding:3px}
  .teaser{position:fixed;${d.position==="links"?"left":"right"}:20px;bottom:86px;z-index:2147483000;max-width:240px;background:#fff;color:var(--t);
    border-radius:14px;padding:10px 32px 10px 13px;font-size:14px;box-shadow:0 10px 30px rgba(16,24,40,.2);animation:rein .35s ease-out}
  .teaser:after{content:"";position:absolute;${d.position==="links"?"left":"right"}:34px;bottom:-7px;width:14px;height:14px;background:#fff;transform:rotate(45deg)}
  .teaser button{position:absolute;top:4px;right:4px;border:0;background:none;color:var(--m);font-size:18px;line-height:1;cursor:pointer;padding:4px}
  .teaser[hidden]{display:none}
  @keyframes rein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .typing.figur-tippt{background:none;padding:0;gap:6px;align-items:center}
  .typing .figur{width:30px;height:30px;animation:huepf .9s ease-in-out infinite}
  .launch:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--a);outline-offset:2px}
  .panel{position:fixed;${d.position==="links"?"left":"right"}:20px;bottom:20px;z-index:2147483001;width:380px;max-width:calc(100vw - 32px);
    height:min(620px,calc(100vh - 40px));background:var(--bg);border:1px solid var(--line);border-radius:var(--r);
    box-shadow:0 18px 50px rgba(16,24,40,.22);display:flex;flex-direction:column;overflow:hidden}
  .panel[hidden],.launch[hidden]{display:none}
  header{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px;border-bottom:1px solid var(--line)}
  .who{flex:1;min-width:0}
  .who b{display:block;font-size:15px}
  .who span{font-size:12.5px;color:var(--m)}
  .badge{display:inline-block;font-size:11px;font-weight:600;color:var(--p);background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:1px}
  .x{border:0;background:transparent;color:var(--m);width:34px;height:34px;border-radius:8px;cursor:pointer;display:grid;place-items:center}
  .x:hover{background:var(--soft)} .x svg{width:20px;height:20px}
  .log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
  .msg{max-width:86%;padding:10px 13px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
  .bot{background:var(--soft);align-self:flex-start;border-top-left-radius:4px}
  .user{background:var(--p);color:#fff;align-self:flex-end;border-top-right-radius:4px}
  .msg ul{margin:4px 0;padding-left:18px} .msg li{margin:2px 0}
  .msg a{color:inherit}
  .note{font-size:12.5px;color:var(--m);background:#fff;border:1px dashed var(--line);border-radius:10px;padding:8px 11px;align-self:stretch}
  .typing{display:inline-flex;gap:4px;align-self:flex-start;padding:12px 14px;background:var(--soft);border-radius:12px}
  .typing i{width:6px;height:6px;border-radius:50%;background:var(--m);opacity:.4;animation:b 1s infinite}
  .typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
  @keyframes b{50%{opacity:1;transform:translateY(-2px)}}
  @media (prefers-reduced-motion:reduce){.typing i,.figur,.figur .tuch,.launch .figur,.typing .figur,.teaser{animation:none!important}.log{scroll-behavior:auto}}
  .chips{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start}
  .chip{border:1px solid var(--line);background:#fff;color:var(--t);border-radius:999px;padding:7px 12px;font:inherit;font-size:14px;cursor:pointer}
  .chip:hover{border-color:var(--p)}
  .card{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;align-self:stretch;display:grid;gap:8px}
  .card h4{margin:0;font-size:14.5px}
  .card label{font-size:12.5px;color:var(--m);display:grid;gap:3px}
  .card input,.card textarea{font:inherit;font-size:14px;color:var(--t);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;background:#fff}
  .card textarea{min-height:56px;resize:vertical}
  .consent{display:flex!important;grid-template-columns:none;gap:8px;align-items:flex-start}
  .consent input{width:auto;margin-top:3px}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .btn{border:0;border-radius:9px;padding:9px 13px;font:600 14px/1.2 inherit;font-family:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  .btn-p{background:var(--p);color:#fff} .btn-g{background:var(--soft);color:var(--t);border:1px solid var(--line)}
  .btn[disabled]{opacity:.6;cursor:default}
  .err{color:#b42318;font-size:12.5px;min-height:0}
  form.send{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line)}
  form.send textarea{flex:1;font:inherit;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:9px 11px;resize:none;height:42px;max-height:110px;color:var(--t)}
  form.send button{width:42px;height:42px;border:0;border-radius:10px;background:var(--p);color:#fff;cursor:pointer;display:grid;place-items:center;flex:none}
  form.send button svg{width:18px;height:18px}
  form.send button.cam{background:var(--soft);color:var(--t);border:1px solid var(--line)}
  form.send button.cam svg{width:20px;height:20px}
  .msg.user img{display:block;max-width:200px;max-height:220px;border-radius:8px;margin:-3px -5px 6px;object-fit:cover}
  .msg.user .cap:empty{display:none}
  .foot{font-size:11.5px;color:var(--m);text-align:center;padding:0 12px 9px}
  .foot a{color:var(--m)}
  @media (max-width:520px){
    .panel{left:0;right:0;bottom:0;top:0;width:100%;max-width:none;height:100%;border-radius:0;border:0}
    .launch{bottom:16px;${d.position==="links"?"left":"right"}:16px}
    form.send textarea{font-size:16px}
  }`;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };

  class WebsiteChat extends HTMLElement {
    connectedCallback() {
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `<style>${css(V.design || {})}</style>` + (M
        ? `<button class="launch mit-figur" part="launcher" aria-label="Chat mit ${esc(M.name)} öffnen"><span class="figur">${M.svg}</span><span>${esc((V.design || {}).launcherText || "Fragen? Chat starten")}</span></button>`
        : `<button class="launch" part="launcher" aria-label="Chat öffnen">${ICON_CHAT}<span>Fragen? Chat starten</span></button>`);
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
        <header>${M ? `<span class="figur avatar">${M.svg}</span>` : ""}<div class="who"><b>${esc(M ? M.name : (c.betrieb.name || c.betrieb.botName))}<span class="badge">KI-Assistent</span></b>
        <span>${M ? esc(c.betrieb.name) + " · antwortet sofort" : "Antwortet sofort · Team meldet sich persönlich"}</span></div>
        <button class="x" aria-label="Chat schließen">${ICON_X}</button></header>
        <div class="log" aria-live="polite"></div>
        <form class="send">${c.foto ? `<button type="button" class="cam" aria-label="Foto senden" title="${esc(c.foto.hinweis || "Foto senden")}">${ICON_CAM}</button><input type="file" accept="image/*" hidden>` : ""}<textarea rows="1" maxlength="${Number(c.maxZeichen) || 800}" placeholder="${this.du ? "Schreib" : "Schreiben Sie"} Ihre Frage …" aria-label="Nachricht"></textarea>
        <button type="submit" aria-label="Senden">${ICON_SEND}</button></form>
        <div class="foot">KI-Antworten können Fehler enthalten. ${c.betrieb.datenschutzUrl ? `<a href="${esc(c.betrieb.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>` : ""}</div>`;
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
      this.eingabe.addEventListener("input", () => { this.eingabe.style.height = "42px"; this.eingabe.style.height = Math.min(110, this.eingabe.scrollHeight) + "px"; });

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
      this.eingabe.value = ""; this.eingabe.style.height = "42px";
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
