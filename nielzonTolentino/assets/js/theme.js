/* light/dark toggle: follows the os until the visitor picks a side, then remembers it */
(function () {
  "use strict";
  var KEY = "theme-pref", mq = window.matchMedia("(prefers-color-scheme: dark)");
  // inline icons so the toggle never depends on an external icon font loading
  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>';

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current() { var p = saved(); return p === "light" || p === "dark" ? p : (mq.matches ? "dark" : "light"); }

  function apply() {
    var t = current();
    document.documentElement.setAttribute("data-theme", t);
    // images that have a dark render swap with the theme so they stay legible
    document.querySelectorAll("img[data-src-dark]").forEach(function (img) {
      if (!img.hasAttribute("data-src-light")) img.setAttribute("data-src-light", img.getAttribute("src"));
      var want = img.getAttribute(t === "dark" ? "data-src-dark" : "data-src-light");
      if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    });
    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      var next = t === "dark" ? "light" : "dark";
      btn.innerHTML = t === "dark" ? SUN : MOON;
      btn.setAttribute("aria-label", "Switch to " + next + " mode");
      btn.title = "Switch to " + next + " mode";
    }
  }

  // crossfade the whole page when supported, since image swaps can't be tweened;
  // otherwise fall back to briefly transitioning colors so the change isn't a hard cut
  function swap(fn) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return fn();
    if (document.startViewTransition) return document.startViewTransition(fn);
    var root = document.documentElement;
    root.classList.add("theme-anim");
    fn();
    setTimeout(function () { root.classList.remove("theme-anim"); }, 450);
  }

  apply();
  mq.addEventListener("change", function () { if (!saved()) swap(apply); });
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.getElementById("nav");
    if (nav && !nav.querySelector(".theme-toggle")) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "theme-toggle";
      b.addEventListener("click", function () {
        var flip = function () {
          try { localStorage.setItem(KEY, current() === "dark" ? "light" : "dark"); } catch (e) { /* storage blocked: follow the os */ }
          apply();
        };
        swap(flip);
      });
      nav.appendChild(b);
    }
    apply();
  });
})();
