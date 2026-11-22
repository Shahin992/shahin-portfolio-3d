/* Google Analytics 4 (G-T25P76EM9N), on the live site only.
   Consent Mode v2: analytics cookies stay off for visitors in the EEA, UK and Switzerland until they accept
   in the banner; elsewhere analytics is on. Ads storage is always off (there are no ads on this site).
   Anyone can change their choice with the footer's "Cookie settings" link. Details: /privacy */
(function () {
  "use strict";
  var ID = "G-T25P76EM9N";
  var KEY = "analytics-consent"; // "granted" | "denied", remembered in this browser
  var ASK = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
             "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"];

  if (location.hostname !== "shahinkhan.online") return; // never count localhost, previews or Wi-Fi tests

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  var noAds = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  gtag("consent", "default", merge(noAds, { analytics_storage: "denied", region: ASK }));
  gtag("consent", "default", merge(noAds, { analytics_storage: "granted" }));

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (saved === "granted" || saved === "denied") gtag("consent", "update", { analytics_storage: saved });

  gtag("js", new Date());
  gtag("config", ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 34128000 // about 13 months, instead of the default 2 years
  });
  var tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
  document.head.appendChild(tag);

  // ---- Consent banner ----
  var banner = null;
  function choose(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* storage blocked: applies to this page only */ }
    gtag("consent", "update", { analytics_storage: value });
    close();
  }
  function close() {
    if (!banner) return;
    banner.classList.remove("is-open");
    var b = banner;
    banner = null;
    setTimeout(function () { b.remove(); }, 400);
  }
  function open(focus) {
    if (banner) return;
    banner = document.createElement("section");
    banner.className = "consent";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookie choice");
    banner.innerHTML =
      '<p><strong>Analytics cookies?</strong> I use Google Analytics to see which pages people read. ' +
      'No ads, no selling data. <a href="/privacy">Privacy</a></p>' +
      '<div class="consent-actions"><button type="button" class="btn btn-line" data-choice="denied">Reject</button>' +
      '<button type="button" class="btn btn-ink" data-choice="granted">Accept</button></div>';
    banner.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-choice]");
      if (btn) choose(btn.getAttribute("data-choice"));
    });
    document.body.appendChild(banner);
    requestAnimationFrame(function () { banner && banner.classList.add("is-open"); });
    if (focus) banner.querySelector("[data-choice='granted']").focus();
  }

  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    // Footer "Cookie settings" links are hidden until analytics actually runs
    document.querySelectorAll("[data-consent-open]").forEach(function (el) {
      el.hidden = false;
      el.addEventListener("click", function () { open(true); });
    });
    if (saved) return;
    // Ask only where the law requires a choice first. Cloudflare's /cdn-cgi/trace gives the visitor's country
    // from this same site, so nothing extra is sent to a third party.
    fetch("/cdn-cgi/trace", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) {
        var m = /^loc=([A-Z]{2})$/m.exec(t);
        if (m && ASK.indexOf(m[1]) !== -1) open(false);
      })
      .catch(function () { /* no country: the regional default above already keeps cookies off in the EEA/UK/CH */ });
  });
})();
