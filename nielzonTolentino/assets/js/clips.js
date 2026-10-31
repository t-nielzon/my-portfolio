/* card clips: the poster image is the baseline, a muted looping video is layered on top only when
   motion is welcome, and it only downloads and plays while its card is actually on screen */
(function () {
  "use strict";

  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  if (!("IntersectionObserver" in window) || (reduce && reduce.matches)) return;

  var PAUSE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor"/></svg>';
  var PLAY = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>';
  var clips = [];

  function setButton(c, playing) {
    c.button.innerHTML = playing ? PAUSE : PLAY;
    c.button.setAttribute("aria-label", (playing ? "Pause" : "Play") + " the " + c.label + " clip");
  }

  function play(c) {
    if (!c.loaded) { c.video.preload = "auto"; c.video.load(); c.loaded = true; }
    var p = c.video.play();
    // autoplay can still be refused (data saver, low power mode); the poster simply stays
    if (p && p.catch) p.catch(function () { setButton(c, false); });
  }

  function build(media) {
    var base = media.getAttribute("data-clip");
    var holder = media.querySelector("a") || media;
    var video = document.createElement("video");
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = "none";
    video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
    // the poster image beneath already carries the description, so the video stays out of the accessibility tree
    video.setAttribute("aria-hidden", "true"); video.tabIndex = -1;
    video.className = "card-clip";
    [["webm", "video/webm"], ["mp4", "video/mp4"]].forEach(function (s) {
      var src = document.createElement("source"); src.src = base + "." + s[0]; src.type = s[1]; video.appendChild(src);
    });
    holder.appendChild(video);

    var button = document.createElement("button");
    button.type = "button"; button.className = "clip-toggle";
    media.appendChild(button);

    var c = { media: media, video: video, button: button, label: media.getAttribute("data-clip-label") || "project", loaded: false, userPaused: false, visible: false };
    setButton(c, true);
    video.addEventListener("playing", function () { media.classList.add("is-playing"); setButton(c, true); });
    video.addEventListener("pause", function () { setButton(c, false); });
    button.addEventListener("click", function () {
      if (video.paused) { c.userPaused = false; play(c); } else { c.userPaused = true; video.pause(); }
    });
    clips.push(c);
    return c;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var c = e.target.__clip;
        // the first callback fires for any overlap, so require half the card before spending bandwidth
        c.visible = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (c.visible && !c.userPaused) play(c);
        else if (!c.visible && !c.video.paused) c.video.pause();
      });
    }, { threshold: 0.5 });

    Array.prototype.forEach.call(document.querySelectorAll(".card-media[data-clip]"), function (m) {
      m.__clip = build(m);
      io.observe(m);
    });

    // honour a reduced-motion switch made while the page is open
    if (reduce && reduce.addEventListener) reduce.addEventListener("change", function (e) {
      if (!e.matches) return;
      clips.forEach(function (c) { c.userPaused = true; c.video.pause(); c.media.classList.remove("is-playing"); });
    });
  });
})();
