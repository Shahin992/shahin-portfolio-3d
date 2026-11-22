/* Core UI — progressive enhancement only; every page works without JS. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Theme toggle (initial theme set inline in <head> to avoid a flash) */
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) {
    var syncTheme = function () {
      var dark = root.getAttribute("data-theme") === "dark";
      themeBtn.setAttribute("aria-pressed", String(dark));
      themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    syncTheme();
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      syncTheme();
    });
  }

  /* Mobile navigation */
  var navBtn = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (navBtn && nav) {
    var setOpen = function (open) {
      nav.classList.toggle("is-open", open);
      navBtn.setAttribute("aria-expanded", String(open));
      navBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
    };
    navBtn.addEventListener("click", function () { setOpen(navBtn.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); navBtn.focus(); } });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    window.matchMedia("(min-width: 921px)").addEventListener("change", function (m) { if (m.matches) setOpen(false); });
  }

  /* Reveal on scroll + count-up numbers */
  var countUp = function (el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
    if (reduceMotion || isNaN(target)) { el.textContent = el.getAttribute("data-count"); return; }
    var start = null, dur = 1600;
    var step = function (t) {
      if (!start) start = t;
      var p = Math.min((t - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (target * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  var revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        entry.target.querySelectorAll("[data-count]").forEach(countUp);
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* Live Dhaka clock */
  var clocks = document.querySelectorAll("[data-clock]");
  if (clocks.length) {
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false });
    var tick = function () { var t = fmt.format(new Date()); clocks.forEach(function (c) { c.textContent = t; }); };
    tick();
    setInterval(tick, 15000);
  }

  /* 3D tilt on the portrait */
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  document.querySelectorAll("[data-tilt]").forEach(function (fig) {
    var frame = fig.querySelector(".portrait-frame");
    if (!frame || reduceMotion || !finePointer) return;
    fig.addEventListener("pointermove", function (e) {
      var r = fig.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.transform = "rotateY(" + (x * 12).toFixed(2) + "deg) rotateX(" + (-y * 12).toFixed(2) + "deg) translateZ(0)";
      frame.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(1) + "%");
      frame.style.setProperty("--gy", ((y + 0.5) * 100).toFixed(1) + "%");
    });
    fig.addEventListener("pointerleave", function () { frame.style.transform = ""; });
  });

  /* Copy-to-clipboard */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    if (!navigator.clipboard) return;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var label = btn.querySelector("span");
      navigator.clipboard.writeText(btn.getAttribute("data-copy")).then(function () {
        btn.setAttribute("data-copied", "true");
        if (label) {
          var prev = label.textContent;
          label.textContent = "Copied";
          setTimeout(function () { label.textContent = prev; btn.removeAttribute("data-copied"); }, 1800);
        }
      }).catch(function () {});
    });
  });

  /* ---------- Motion layer (skipped entirely for reduced motion) ---------- */
  if (!reduceMotion) {
    // Scroll progress bar
    var bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);

    // Scroll-linked 3D: screenshots and diagrams swing flat as they arrive
    var tiltEls = [].slice.call(document.querySelectorAll(".shot-browser, .arch > svg, .gallery .frame, .workshot .frame"));
    tiltEls.forEach(function (el) { el.classList.add("scroll-3d"); });

    // Marquee reacts to scroll velocity (speeds up, reverses when scrolling up)
    var track = document.querySelector(".marquee-track");
    var lastY = window.scrollY, vel = 0, queued = false;
    var marqueeAnim = function () { return track && track.getAnimations ? track.getAnimations()[0] : null; };
    var frame = function () {
      queued = false;
      var y = window.scrollY, vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ")";
      tiltEls.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) return;
        el.style.setProperty("--p", Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.7))).toFixed(3));
      });
      vel = vel * 0.85 + (y - lastY) * 0.15;
      lastY = y;
      var an = marqueeAnim();
      if (an) an.playbackRate = Math.abs(vel) > 0.05 ? Math.max(-5, Math.min(6, 1 + vel * 0.12)) : 1;
      if (Math.abs(vel) > 0.05) queue();
    };
    var queue = function () { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    frame();

    if (finePointer) {
      // 3D tilt cards with a moving glare
      document.querySelectorAll(".metric, .numbered li, .col-item, .feature, .ramp-card, .pcard, .svc").forEach(function (el) {
        var max = el.classList.contains("feature") ? 2.2 : 6;
        el.classList.add("tilt-card");
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transition = "transform .2s ease-out";
          el.style.transform = "perspective(1000px) rotateX(" + (-y * max).toFixed(2) + "deg) rotateY(" + (x * max).toFixed(2) + "deg)";
          el.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(1) + "%");
          el.style.setProperty("--gy", ((y + 0.5) * 100).toFixed(1) + "%");
        });
        el.addEventListener("pointerleave", function () {
          el.style.transition = "transform .8s cubic-bezier(.22,1,.36,1)";
          el.style.transform = "";
        });
      });
      // Magnetic buttons
      document.querySelectorAll(".btn, .icon-btn").forEach(function (el) {
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect();
          el.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.2).toFixed(1) + "px," +
            ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + "px)";
        });
        el.addEventListener("pointerleave", function () { el.style.transform = ""; });
      });
    }
  }

  /* Pause SVG (SMIL) diagram animations for reduced motion */
  if (reduceMotion) document.querySelectorAll("svg.animated").forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
})();
