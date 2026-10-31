/* steps the free-time carousel one card per click and greys out the arrow at either end */
(function () {
  "use strict";

  function init(track) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.carousel-btn[aria-controls="' + track.id + '"]'));

    function step() {
      var slide = track.querySelector(".carousel-slide");
      if (!slide) return track.clientWidth;
      return slide.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    }

    function update() {
      // a pixel of slack absorbs subpixel rounding at the scroll ends
      var max = track.scrollWidth - track.clientWidth - 1;
      buttons.forEach(function (b) {
        b.disabled = b.dataset.dir === "-1" ? track.scrollLeft <= 1 : track.scrollLeft >= max;
      });
    }

    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        track.scrollBy({ left: Number(b.dataset.dir) * step(), behavior: "smooth" });
      });
    });
    track.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      track.scrollBy({ left: (e.key === "ArrowLeft" ? -1 : 1) * step(), behavior: "smooth" });
    });
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll(".carousel-track[id]"), init);
  });
})();
