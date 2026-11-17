// The widget's card, drawn on a page as Marquee.js draws it on the phone: the home page's showcase (public/index.html)
// and each city page (widget/citypages.py) use it, so the two never drift. Loaded before the page's own script.
window.SSCard = (() => {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // A theater's wall clock now, as the feeds write times: "2026-11-05T19:30"
  function wallAt(ms, tz) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  const wallNow = tz => wallAt(Date.now(), tz);
  const nextDay = day => new Date(Date.parse(day + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  // "19:30" as the widget writes it: 7:30pm, 4pm
  function clock(at) {
    let [hr, m] = at.slice(11, 16).split(":").map(Number);
    const ap = hr < 12 ? "am" : "pm";
    hr = hr % 12 || 12;
    return m ? `${hr}:${String(m).padStart(2, "0")}${ap}` : `${hr}${ap}`;
  }
  const fmtDay = day => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  // The feeds' stamp, a wall time where they're built, as the visitor's own clock: "4:20pm", "Fri 4:20pm"
  function stamp(wall, tz) {
    const guess = Date.parse(wall + ":00Z"), ms = guess - (Date.parse(wallAt(guess, tz) + ":00Z") - guess);
    const local = new Date(ms), mine = wallAt(ms, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const same = local.toDateString() === new Date().toDateString();
    return (same ? "" : local.toLocaleDateString("en-US", { weekday: "short" }) + " ") + clock(mine);
  }

  // A theater's films for the widget, by their next show: what's left of its today, or all of its
  // tomorrow's once its night is over
  function filmsFor(feed, ahead) {
    const now = wallNow(feed.tz || "America/New_York"), day = ahead ? nextDay(now.slice(0, 10)) : now.slice(0, 10);
    return (feed.films || [])
      .map(f => ({ f, shows: (f.shows || []).filter(s => s.at.slice(0, 10) === day && (ahead || s.at.slice(0, 16) >= now)) }))
      .filter(x => x.shows.length)
      .sort((a, b) => a.shows[0].at.localeCompare(b.shows[0].at));
  }

  // Lines each theater gets, as Marquee.js's allocate(): its name and first film, then one more film
  // each in turn while lines are left (fewer than the phone's twenty: the type here is a little larger)
  const LINES = 15, MAX_FILMS = 4, MAX_TIMES = 4;
  function allocate(list) {
    const counts = list.map(() => 1);
    let used = list.length * 2;
    for (let more = true; more && used < LINES;) {
      more = false;
      list.forEach((x, i) => {
        if (used < LINES && counts[i] < Math.min(x.films.length, MAX_FILMS)) { counts[i]++; used++; more = true; }
      });
    }
    return counts;
  }

  function house({ feed, films }, count) {
    const card = el("div", "w-house"), name = el("a", "w-name", feed.name);
    name.href = feed.url;
    card.append(name);
    films.slice(0, count).forEach(({ f, shows }, j) => {
      const row = el("div", "w-row"), title = el(f.url ? "a" : "span", "w-film", f.title), times = el("span", "w-times");
      if (f.url) title.href = f.url;
      for (const s of shows.slice(0, MAX_TIMES)) {
        let chip;
        if (s.sold_out) { chip = el("span", "chip out", clock(s.at)); chip.append(el("span", "vh", " sold out")); }
        else { chip = el("a", "chip", clock(s.at)); chip.href = s.url || f.url || feed.url; }
        times.append(chip);
      }
      if (shows.length > MAX_TIMES) times.append(el("span", "w-more", `+${shows.length - MAX_TIMES}`));
      row.append(title, times);
      const left = films.length - count;
      if (j === count - 1 && left > 0) row.append(el("span", "w-more", `+${left} more`));
      card.append(row);
    });
    return card;
  }

  // The card's day and its houses: root is the .widget, with its header's <b> and <span> and a .w-body
  function show(root, label, list, day) {
    const counts = allocate(list);
    root.querySelector("header b").textContent = label.toUpperCase();
    root.querySelector("header span").textContent = fmtDay(day);
    root.querySelector(".w-body").replaceChildren(...list.map((x, i) => house(x, counts[i])));
  }
  // Nothing tonight or tomorrow in the city: its theaters' names, each saying so, as the phone does
  function none(root, names, day) {
    root.querySelector("header b").textContent = "TONIGHT";
    root.querySelector("header span").textContent = fmtDay(day);
    root.querySelector(".w-body").replaceChildren(...names.slice(0, 4).map(name => {
      const card = el("div", "w-house"), line = el("span", "w-name", name);
      line.append(el("span", "w-note", "nothing tonight"));
      card.append(line);
      return card;
    }));
  }

  return { wallAt, wallNow, nextDay, clock, fmtDay, stamp, filmsFor, allocate, house, show, none };
})();
