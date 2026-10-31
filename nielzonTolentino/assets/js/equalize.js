/* cards in a section share the tallest card's height, so grids read as one even block
   across rows; css alone can only equalize within a single row */
(function () {
  "use strict";
  // carousel cards already share a height through the flex track, and their offset lefts
  // would defeat the single-column check below on phones
  var GROUPS = ["#work .box.style1", "#portfolio .col-4 > .box.style2"];

  function equalize() {
    GROUPS.forEach(function (sel) {
      var boxes = Array.prototype.slice.call(document.querySelectorAll(sel));
      boxes.forEach(function (b) { b.style.minHeight = ""; });
      // a single stacked column (phones) gains nothing but empty space from equal heights
      var tops = boxes.map(function (b) { return b.getBoundingClientRect().left; });
      if (new Set(tops).size < 2) return;
      var max = Math.max.apply(null, boxes.map(function (b) { return b.offsetHeight; }));
      boxes.forEach(function (b) { b.style.minHeight = max + "px"; });
    });
  }

  var t;
  function later() { clearTimeout(t); t = setTimeout(equalize, 120); }
  window.addEventListener("load", equalize);
  window.addEventListener("resize", later);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(equalize);
  document.addEventListener("DOMContentLoaded", equalize);
})();
