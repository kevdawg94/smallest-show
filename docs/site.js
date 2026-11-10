// Smallest Show: the little every page shares. Motion on this site is lights coming on and nothing else.
// SS.sputter(els) brings a row of bulbs (or letters) on the way a tired sign comes on: each one stutters a few
// times at its own pace, then holds. It returns the milliseconds until the last has caught, so a caller can
// time what follows. A visit's first page gets the full start; later pages (html.warm, set in the head) and
// anyone who has asked for less motion get the lights already on.
window.SS = (() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const warm = document.documentElement.classList.contains("warm");
  function sputter(els, { longest = 2600, force = false, wait = 0 } = {}) {
    if (still || (warm && !force)) return 0;
    let end = 0;
    for (const el of els) {
      const n = 2 + Math.floor(Math.random() * 5);
      const offs = Array.from({ length: n * 2 }, () => 0.04 + Math.random() * 0.9).sort((a, b) => a - b);
      const frames = [{ opacity: 0.1, offset: 0, easing: "step-end" }];
      offs.forEach((o, k) => frames.push({ opacity: k % 2 ? 0.1 : (Math.random() < 0.6 ? 1 : 0.5), offset: o, easing: "step-end" }));
      frames.push({ opacity: 1, offset: 1 });
      const duration = longest * (0.3 + Math.random() * 0.7), delay = wait + Math.random() * longest * 0.22;
      el.animate(frames, { duration, delay, fill: "backwards" });
      end = Math.max(end, duration + delay);
    }
    return end;
  }
  // One loose bulb: a brief flicker every so often, never while the tab is hidden
  function loose(el, { every = 9000 } = {}) {
    if (still) return;
    (function tick() {
      setTimeout(() => {
        if (document.visibilityState === "visible") el.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 240 + Math.random() * 200, easing: "steps(5, end)" });
        tick();
      }, every * (0.5 + Math.random()));
    })();
  }
  // The bulb rules, run like a tired sign. As a row comes into view the whole row tries once and drops, then each
  // bulb stutters on in its own time (a shorter version on the pages after a visit's first). After that it never
  // quite settles, on three clocks: every second or two one bulb goes dark for a moment; every several seconds a
  // run of neighbours sputters; and a couple of times a minute the whole row browns out and recovers. Each is big
  // enough to notice from the corner of the eye and none repeats on a beat. Never while the tab is hidden or the
  // row is off screen. The row is filled wide enough for any window, and each event picks from the bulbs on
  // screen at that moment, so a resized window is still a full, live row.
  // Every keyframe holds its value until the next (step-end): a bulb is on or off, never fading between.
  const hold = (el, stops, duration, delay = 0) =>
    el.animate(stops.map(([offset, opacity]) => ({ offset, opacity, easing: "step-end" })), { duration, delay, fill: "backwards" });
  const dark = el => hold(el, [[0, 0.1], [0.45, 1], [0.6, 0.3], [0.78, 1], [1, 1]], 380 + Math.random() * 300);
  function rules() {
    const pitch = 16;
    // A sign is one rule, or the footer's four taken as one frame (top, right side down, bottom leftward, left
    // side up): one start and one set of clocks for the whole frame, so four rules don't flicker four times
    // as often as one, a run of bulbs can turn a corner, and a brown-out dims all four sides together.
    const frames = [...document.querySelectorAll(".colophon")].map(f => ["top", "right", "bottom", "left"].map(s => f.querySelector(":scope > .bulbs." + s)).filter(Boolean));
    const framed = new Set(frames.flat());
    const signs = [...frames.filter(f => f.length), ...[...document.querySelectorAll(".bulbs")].filter(r => !framed.has(r)).map(r => [r])];
    for (const sign of signs) {
      // each rule holds as many bulbs as fit its length (a row's width, a column's height); when it resizes only
      // the difference is added or taken from its end, so nothing already lit or sputtering is rebuilt
      const fill = row => {
        const n = Math.max(2, Math.round((row.classList.contains("col") ? row.clientHeight : row.clientWidth) / pitch));
        while (row.children.length < n) row.append(document.createElement("i"));
        while (row.children.length > n) row.lastElementChild.remove();
      };
      for (const row of sign) { fill(row); if ("ResizeObserver" in window) new ResizeObserver(() => fill(row)).observe(row); }
      if (still) continue;
      const backward = row => row.classList.contains("bottom") || row.classList.contains("left");
      const shown = () => sign.flatMap(row => backward(row) ? [...row.children].reverse() : [...row.children]);
      const inView = () => sign.some(row => { const r = row.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      const every = (lo, hi, act) => (function tick() { setTimeout(() => { if (document.visibilityState === "visible" && inView()) act(shown()); tick(); }, lo + Math.random() * (hi - lo)); })();
      const restless = () => {
        every(1000, 2500, bulbs => dark(bulbs[Math.floor(Math.random() * bulbs.length)]));
        every(4000, 8000, bulbs => { const at = Math.floor(Math.random() * bulbs.length); sputter(bulbs.slice(at, at + 4 + Math.floor(Math.random() * 7)), { longest: 1400, force: true }); });
        every(20000, 35000, bulbs => { for (const b of bulbs) hold(b, [[0, 0.3], [0.3, 0.8], [0.55, 0.3], [0.8, 1], [1, 1]], 620, Math.random() * 60); });
      };
      const on = () => {
        const bulbs = shown(), brief = warm;
        const end = sputter(bulbs, { longest: brief ? 900 : 2600, force: true, wait: brief ? 380 : 700 });
        // the false start: the sign tries once, nearly makes it, and drops
        for (const b of bulbs) hold(b, [[0, 0.1], [0.08, 0.9], [0.45, 0.6], [0.55, 0.85], [0.75, 0.1], [1, 0.1]], brief ? 300 : 480);
        setTimeout(restless, end);
      };
      // a sign on screen at load starts at once, so it is never seen fully lit before it "comes on"; the footer's
      // frame starts as its top rule comes into view
      if (inView() || !("IntersectionObserver" in window)) { on(); continue; }
      new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { io.disconnect(); on(); } }).observe(sign[0]);
    }
  }
  // The masthead's light and dark switch (the head's script holds the choice and announces "themechange")
  for (const b of document.querySelectorAll(".mode")) b.addEventListener("click", () => window.__theme && window.__theme.toggle());
  rules();
  return { still, warm, sputter, loose };
})();
