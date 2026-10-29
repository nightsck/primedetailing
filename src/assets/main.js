// Prime Detailing – kleine Helfer, ohne Bibliotheken
(function () {
  "use strict";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // Jahr im Footer
  var y = $("#year"); if (y) y.textContent = new Date().getFullYear();

  // Mobile-Menü
  var menuBtn = $(".menu-btn"), mobileNav = $("#mobile-nav");
  if (menuBtn && mobileNav) {
    var setMenu = function (open) {
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      mobileNav.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    };
    menuBtn.addEventListener("click", function () { setMenu(menuBtn.getAttribute("aria-expanded") !== "true"); });
    $$("a", mobileNav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !mobileNav.hidden) { setMenu(false); menuBtn.focus(); } });
  }

  // Preis-Tabs (Pfeiltasten wie bei echten Tabs)
  var tabs = $$('[role="tab"]');
  var selectTab = function (tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      var p = document.getElementById(t.getAttribute("aria-controls"));
      if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t); });
    t.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") n = tabs[0];
      if (e.key === "End") n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); selectTab(n, true); }
    });
  });

  // "Anfragen"-Buttons tragen das Paket ins Formular
  var pkgSelect = $("#f-pkg");
  $$("[data-pkg]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!pkgSelect) return;
      var want = b.getAttribute("data-pkg");
      var opt = $$("option", pkgSelect).filter(function (o) { return o.textContent.trim() === want; })[0];
      if (opt) pkgSelect.value = opt.value || opt.textContent;
      setTimeout(function () { var n = $("#f-name"); if (n) n.focus({ preventScroll: true }); }, 450);
    });
  });

  // Formular-Prüfung mit verständlichen Fehlern
  $$("form[novalidate]").forEach(function (form) {
    var status = $(".form-status", form);
    var check = function (el) {
      var field = el.closest(".field"); if (!field) return true;
      var ok = el.type === "checkbox" ? (!el.required || el.checked) : el.checkValidity();
      if (el.type === "radio") ok = !el.required || !!form.querySelector('input[name="' + el.name + '"]:checked');
      field.classList.toggle("invalid", !ok);
      el.setAttribute("aria-invalid", String(!ok));
      return ok;
    };
    $$("input, select, textarea", form).forEach(function (el) {
      if (el.type === "hidden" || el.classList.contains("hp")) return;
      el.addEventListener("blur", function () { if (el.closest(".field.invalid")) check(el); });
      el.addEventListener("change", function () { if (el.closest(".field.invalid")) check(el); });
    });
    form.addEventListener("submit", function (e) {
      var first = null;
      $$("input, select, textarea", form).forEach(function (el) {
        if (el.type === "hidden" || el.classList.contains("hp")) return;
        if (!check(el) && !first) first = el;
      });
      if (first) {
        e.preventDefault();
        if (status) { status.textContent = "Bitte prüfen Sie die markierten Felder."; status.className = "form-status err"; }
        first.focus();
        return;
      }
      var btn = $('button[type="submit"]', form);
      var btnText = btn ? btn.firstChild.textContent : "";
      if (btn) { btn.disabled = true; btn.firstChild.textContent = "Wird gesendet … "; }

      // Versand im Hintergrund (Web3Forms). Klappt das nicht innerhalb von
      // 15 Sekunden, bekommt der Kunde den WhatsApp-Weg mit fertigem Text –
      // statt einer Fehlerseite. Ohne JavaScript greift der normale POST.
      if (!window.fetch || !window.FormData || !form.action) return;
      e.preventDefault();
      var fd = new FormData(form);
      var data = {};
      fd.forEach(function (v, k) { data[k] = v; });
      var weiter = (form.querySelector('input[name="redirect"]') || {}).value || "/danke/";
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
      fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) { return r.json(); }).then(function (j) {
        clearTimeout(timer);
        if (!(j && (j.success === true || j.success === "true"))) throw new Error("fehlgeschlagen");
        location.href = weiter;
      }).catch(function () {
        clearTimeout(timer);
        if (btn) { btn.disabled = false; btn.firstChild.textContent = btnText; }
        var skip = { access_key: 1, subject: 1, from_name: 1, redirect: 1, botcheck: 1, Datenschutz: 1 };
        var zeilen = ["Hallo Prime Detailing, über die Website hat das Senden nicht geklappt, deshalb hier per WhatsApp:"];
        Object.keys(data).forEach(function (k) { if (!skip[k] && String(data[k]).trim()) zeilen.push(k + ": " + data[k]); });
        var wa = form.getAttribute("data-whatsapp");
        if (status) {
          status.className = "form-status err";
          status.innerHTML = "";
          status.appendChild(document.createTextNode("Das Senden klappt gerade nicht. Damit nichts verloren geht, schicken Sie uns Ihre Nachricht einfach direkt – sie ist schon ausgefüllt: "));
          if (wa) {
            var a = document.createElement("a");
            a.className = "textlink";
            a.target = "_blank"; a.rel = "noopener";
            a.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(zeilen.join("\n"));
            a.textContent = "Per WhatsApp senden";
            status.appendChild(a);
          }
        }
      });
    });
  });

  // Einblenden beim Scrollen
  var rev = $$(".reveal");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    rev.forEach(function (el) { io.observe(el); });
  } else { rev.forEach(function (el) { el.classList.add("in"); }); }

  // Vorher/Nachher-Regler
  var ba = $(".ba"), range = ba && $('input[type="range"]', ba);
  if (range) range.addEventListener("input", function () { ba.style.setProperty("--pos", range.value + "%"); });

  // Preisrechner
  var calc = $("#calc");
  if (calc) {
    var fmt = function (n) { return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; };
    var pkg = $("#c-pkg", calc), lines = $("#calc-lines"), total = $("#calc-total"), abEl = $("#calc-ab");
    var wa = $("#calc-wa"), toForm = $("#calc-form");
    var state = {};
    var update = function () {
      var o = pkg.options[pkg.selectedIndex];
      var items = [{ name: o.getAttribute("data-name"), preis: parseFloat(o.getAttribute("data-preis")) }];
      var ab = o.getAttribute("data-ab") === "true";
      var size = calc.querySelector('input[name="c-size"]:checked');
      if (size) {
        var auf = parseFloat(size.getAttribute("data-aufschlag")) || 0;
        items.push({ name: size.value, preis: auf, info: auf ? null : "inklusive" });
      }
      $$('input[name="c-extra"]:checked', calc).forEach(function (x) {
        items.push({ name: x.value, preis: parseFloat(x.getAttribute("data-preis")) || 0 });
        if (x.getAttribute("data-ab") === "true") ab = true;
      });
      var sum = items.reduce(function (a, b) { return a + b.preis; }, 0);
      lines.innerHTML = "";
      items.forEach(function (it, i) {
        var li = document.createElement("li");
        var a = document.createElement("span"); a.textContent = it.name;
        var b = document.createElement("span"); b.textContent = it.info || ((i ? "+ " : "") + fmt(it.preis));
        li.appendChild(a); li.appendChild(b); lines.appendChild(li);
      });
      total.textContent = fmt(sum);
      abEl.hidden = !ab;
      state = { paket: o.value, size: size ? size.value : "", extras: items.slice(size ? 2 : 1).map(function (x) { return x.name; }), sum: (ab ? "ab " : "") + fmt(sum) };
      var text = "Hallo Prime Detailing, ich interessiere mich für: " + state.paket +
        (state.size ? ", Fahrzeug: " + state.size : "") +
        (state.extras.length ? ", Extras: " + state.extras.join(", ") : "") +
        ". Richtpreis laut Rechner: " + state.sum + ". Wann hätten Sie einen Termin frei?";
      wa.href = "https://wa.me/" + wa.getAttribute("data-wa") + "?text=" + encodeURIComponent(text);
    };
    calc.addEventListener("change", update);
    update();
    toForm.addEventListener("click", function () {
      var sel = $("#f-pkg"), msg = $("#f-msg");
      if (sel) { var opt = $$("option", sel).filter(function (x) { return x.textContent.trim() === state.paket; })[0]; if (opt) sel.value = opt.value || opt.textContent; }
      if (msg && !msg.value.trim()) {
        msg.value = (state.size ? "Fahrzeug: " + state.size + "\n" : "") +
          (state.extras.length ? "Extras: " + state.extras.join(", ") + "\n" : "") +
          "Richtpreis laut Rechner: " + state.sum + "\n\nWunschtermin: ";
      }
      setTimeout(function () { var n = $("#f-name"); if (n) n.focus({ preventScroll: true }); }, 450);
    });
  }
})();
