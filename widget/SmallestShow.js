// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: film;
//
// Smallest Show — tonight at your independent cinemas.
//
// As a widget (large is the one to use; medium fits a few rows; small shows a count): the films
// playing tonight at the theaters you picked, each time a tap target that opens its ticket page,
// sold-out times greyed. Tap a theater's name for its website, the TONIGHT title for the full
// list in the app, where "Theaters" picks which ones to follow.
//
// Which theaters: the widget's parameter (long-press › Edit Widget › Parameter) as a comma list of
// ids, e.g. "elmwood,roxie"; otherwise the set picked in the app; otherwise the feed's default.
// The ids are in index.json on the feeds branch, rebuilt every three hours:
//   https://github.com/kevdawg94/smallest-show
//
// This was Marquee until 2026.10.25. A copy installed under that name keeps it (renaming a script
// unbinds its widgets), and the Keychain keys and cache files keep the marquee prefix, so an
// update changes nothing on the phone but the code.

const VERSION = "2026.10.29"; // YYYY.MM.DD[.n], later than the published one; package.py reads it
const BASE = "https://raw.githubusercontent.com/kevdawg94/smallest-show/feeds/";
const VERSION_URL = "https://raw.githubusercontent.com/kevdawg94/smallest-show/main/docs/version.json";
const PICKED_KEY = "marquee.theaters"; // Keychain: shared between the app and its widgets
const CITY_KEY = "marquee.city"; // the city the Theaters sheet opens on
const UPDATE_KEY = "marquee.updateCheck";
const GRACE_MIN = 20; // a show that started this many minutes ago still counts as tonight
const AFTERNOON = 12; // before this hour, "tonight" means the whole day
// Lines that fit at this type size: a theater's name is one, each film one. If the bottom of the
// large widget is clipped on your phone, lower LARGE; if there's a blank band, raise it.
const ROWS = {large: 20, medium: 6};
const MAX_FILMS = 4; // per theater, then "+N more" on its last line
const MAX_TIMES = 4; // chips per film, then "+N"

// ---------- data ----------

async function getJSON(name) { // a feed file by name, cached so the widget still draws offline
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), `marquee-${name}`);
  try {
    const req = new Request(`${BASE}${name}?t=${Math.floor(Date.now() / 300000)}`);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (!data || typeof data !== "object") throw new Error(`bad feed ${name}`);
    fm.writeString(path, JSON.stringify(data));
    return {data, offline: false};
  } catch (e) {
    if (fm.fileExists(path)) return {data: JSON.parse(fm.readString(path)), offline: true};
    throw e;
  }
}

function readPicked() {
  try { return Keychain.contains(PICKED_KEY) ? JSON.parse(Keychain.get(PICKED_KEY)) : null; } catch (e) { return null; }
}

function savePicked(ids) { Keychain.set(PICKED_KEY, JSON.stringify(ids)); }

// The cities that have theaters in the feed (a city in the catalog with none yet stays hidden).
function cities(index) {
  const counts = {};
  for (const t of index.theaters || []) if (t.city) counts[t.city] = (counts[t.city] || 0) + 1;
  return (index.cities || []).filter(c => counts[c.id]).map(c => ({...c, count: counts[c.id]}));
}

function readCity(index) {
  const ids = cities(index).map(c => c.id);
  try { const c = Keychain.contains(CITY_KEY) ? Keychain.get(CITY_KEY) : null; if (ids.includes(c)) return c; } catch (e) { /* none saved */ }
  return ids[0] || null;
}

function saveCity(id) { Keychain.set(CITY_KEY, id); }

// The theaters to show, in the catalog's order: the widget parameter, else the app's pick, else
// the catalog's default. Unknown ids are dropped; an empty result falls back a level.
function chooseIds(index, parameter) {
  const known = new Set(index.theaters.map(t => t.id));
  const order = ids => index.theaters.map(t => t.id).filter(id => ids.includes(id) && known.has(id));
  const fromParam = parameter ? order(parameter.split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean)) : [];
  if (fromParam.length) return fromParam;
  const picked = readPicked();
  if (Array.isArray(picked) && order(picked).length) return order(picked);
  return order(index.default || []);
}

async function loadAll(parameter) {
  const idx = await getJSON("index.json");
  const ids = chooseIds(idx.data, parameter);
  const feeds = await Promise.all(ids.map(id => getJSON(`${id}.json`).catch(() => null)));
  const theaters = feeds.filter(Boolean).map(f => f.data);
  const offline = idx.offline || feeds.some(f => f && f.offline);
  const generated = theaters.reduce((m, t) => (!m || t.generated_at > m ? t.generated_at : m), idx.data.generated_at);
  return {index: idx.data, ids, data: {generated_at: generated, theaters}, offline};
}

function parseAt(s) { // "YYYY-MM-DDTHH:MM" in the theaters' local time, read as the phone's
  const [d, t] = s.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return new Date(y, m - 1, day, h, min);
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; }

// The shows to list for a day: all of them for a day that isn't today, or for today before
// noon; from now on (less a grace period) otherwise.
function showsFor(theater, day, now) {
  const key = isoDay(day);
  const today = key === isoDay(now);
  const cutoff = today && now.getHours() >= AFTERNOON ? new Date(now.getTime() - GRACE_MIN * 60000) : null;
  const films = [];
  for (const f of theater.films || []) {
    const shows = (f.shows || []).filter(s => s.at.startsWith(key) && (!cutoff || parseAt(s.at) >= cutoff));
    if (shows.length) films.push({...f, shows});
  }
  return films.sort((a, b) => a.shows[0].at.localeCompare(b.shows[0].at)); // by the next show
}

// The same shows as one list in time order, for the table.
function showsInOrder(films) {
  return films.flatMap(f => f.shows.map(s => ({f, s}))).sort((a, b) => a.s.at.localeCompare(b.s.at));
}

// Tonight: today's remaining shows; past the last one, tomorrow's, labelled so.
function pickDay(data, now) {
  const today = addDays(now, 0);
  const anyLeft = data.theaters.some(t => showsFor(t, today, now).length);
  if (anyLeft || now.getHours() < 18) return {day: today, label: "Tonight"};
  return {day: addDays(now, 1), label: "Tomorrow"};
}

function fmtTime(s) {
  const d = parseAt(s);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
}

function fmtDay(d) {
  return d.toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"});
}

function fmtStamp(s, now) { // feed's "YYYY-MM-DDTHH:MM" -> "4:20pm" today, "Fri 4:20pm" otherwise
  if (!s) return "?";
  const d = parseAt(s);
  const t = fmtTime(s);
  return now && isoDay(d) === isoDay(now) ? t : `${d.toLocaleDateString("en-US", {weekday: "short"})} ${t}`;
}

// How many films each theater gets to show in `budget` lines: every theater with shows gets its
// name and first film, then extra films go round the theaters one at a time. When even one line
// per theater won't fit, the ones that fit are kept in order and the rest are counted in
// `overflow`, with a line reserved to say so (a widget can't scroll).
function allocate(perTheater, budget, withHeaders) {
  const per = withHeaders ? 2 : 1;
  const withShows = perTheater.map((x, i) => (x.films.length ? i : -1)).filter(i => i >= 0);
  let fit = withShows.length;
  if (fit * per > budget) fit = Math.max(0, Math.floor((budget - 1) / per));
  const overflow = withShows.length - fit;
  const counts = perTheater.map(() => 0);
  withShows.slice(0, fit).forEach(i => { counts[i] = 1; });
  let used = fit * per + (overflow ? 1 : 0);
  for (let more = true; more && used < budget;) {
    more = false;
    perTheater.forEach((x, i) => {
      if (used < budget && counts[i] && counts[i] < Math.min(x.films.length, MAX_FILMS)) {
        counts[i] += 1; used += 1; more = true;
      }
    });
  }
  return {counts, used, overflow};
}

function addOverflowLine(w, overflow, label) {
  const t = w.addText(`+${overflow} more theater${overflow === 1 ? "" : "s"} ${label.toLowerCase()} · open for all`);
  t.font = Font.systemFont(11);
  t.textColor = MUTED;
  t.url = URLScheme.forRunningScript();
}

// ---------- look ----------

const INK = Color.dynamic(new Color("#1c1b19"), new Color("#f2efe8"));
const MUTED = Color.dynamic(new Color("#8a8680"), new Color("#8f8b84"));
const FAINT = Color.dynamic(new Color("#b9b5ad"), new Color("#5c5955"));
const CHIP = Color.dynamic(new Color("#efe9df"), new Color("#2a2825"));
const CHIP_OUT = Color.dynamic(new Color("#f6f4f0"), new Color("#1f1e1c"));
const PAPER = Color.dynamic(new Color("#fbf8f2"), new Color("#141311"));
const ACCENT = new Color("#b4482b");

function addFilmRow(w, f, fallbackUrl, more, prefix) {
  const row = w.addStack();
  row.centerAlignContent();
  row.spacing = 4;
  if (prefix) {
    const p = row.addText(prefix);
    p.font = Font.systemFont(10);
    p.textColor = MUTED;
    p.lineLimit = 1;
  }
  const title = row.addText(f.title);
  title.font = Font.systemFont(11.5);
  title.textColor = INK;
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.75;
  if (f.url) title.url = f.url;
  row.addSpacer(4);
  const times = row.addStack();
  times.spacing = 3;
  times.centerAlignContent();
  const list = f.shows.slice(0, MAX_TIMES);
  for (const s of list) {
    const chip = times.addStack();
    chip.url = s.url;
    chip.setPadding(2, 5, 2, 5);
    chip.cornerRadius = 4;
    chip.backgroundColor = s.sold_out ? CHIP_OUT : CHIP;
    const tx = chip.addText(fmtTime(s.at));
    tx.font = s.sold_out ? Font.systemFont(10) : Font.mediumSystemFont(10);
    tx.textColor = s.sold_out ? FAINT : INK;
    tx.lineLimit = 1;
  }
  if (f.shows.length > list.length) {
    const t = times.addText(`+${f.shows.length - list.length}`);
    t.font = Font.systemFont(10);
    t.textColor = MUTED;
    t.url = f.url || fallbackUrl;
  }
  if (more) { // films this theater didn't get a line for
    const t = times.addText(`+${more} more`);
    t.font = Font.systemFont(10);
    t.textColor = MUTED;
    t.url = fallbackUrl;
  }
  w.addSpacer(2);
}

// What to say beside a theater's name when its listings aren't fresh.
function staleNote(t, now) {
  if (t.error) return "from " + fmtStamp(t.fetched_at, now);
  if (t.warning) return "fallback";
  return null;
}

function buildWidget(data, offline, family) {
  const now = new Date();
  const w = new ListWidget();
  w.backgroundColor = PAPER;
  w.setPadding(12, 14, 10, 14);
  w.url = URLScheme.forRunningScript();
  w.refreshAfterDate = new Date(now.getTime() + 30 * 60000);

  const {day, label} = pickDay(data, now);
  const perTheater = data.theaters.map(t => ({t, films: showsFor(t, day, now)}));
  const total = perTheater.reduce((n, x) => n + x.films.reduce((k, f) => k + f.shows.length, 0), 0);

  // header
  const head = w.addStack();
  head.centerAlignContent();
  const h1 = head.addText(label.toUpperCase());
  h1.font = Font.semiboldSystemFont(family === "small" ? 11 : 12);
  h1.textColor = ACCENT;
  head.addSpacer(6);
  const h2 = head.addText(fmtDay(day));
  h2.font = Font.systemFont(family === "small" ? 11 : 12);
  h2.textColor = MUTED;
  head.addSpacer();
  if (family !== "small") {
    const h3 = head.addText((offline ? "offline · " : "") + "updated " + fmtStamp(data.generated_at, now));
    h3.font = Font.systemFont(10);
    h3.textColor = FAINT;
    h3.rightAlignText();
  }

  if (!data.theaters.length) {
    w.addSpacer();
    const z = w.addText(`No theaters picked. Open ${Script.name()} and tap Theaters.`); // the name it has on this phone
    z.font = Font.systemFont(12);
    z.textColor = MUTED;
    w.addSpacer();
    return w;
  }

  if (family === "small") {
    w.addSpacer();
    const n = w.addText(String(total));
    n.font = Font.boldSystemFont(40);
    n.textColor = INK;
    const c = w.addText(total === 1 ? "show " + label.toLowerCase() : "shows " + label.toLowerCase());
    c.font = Font.systemFont(12);
    c.textColor = MUTED;
    w.addSpacer();
    const playing = perTheater.filter(x => x.films.length).map(x => x.t.name).join(" · ");
    const p = w.addText(playing || "nothing on");
    p.font = Font.systemFont(10);
    p.textColor = FAINT;
    p.lineLimit = 2;
    return w;
  }

  w.addSpacer(6);

  if (family === "medium") { // no theater headers: each line starts with the theater's name
    const {counts, overflow} = allocate(perTheater, ROWS.medium, false);
    perTheater.forEach(({t, films}, i) => {
      films.slice(0, counts[i]).forEach((f, j) => {
        const last = j === counts[i] - 1;
        addFilmRow(w, f, t.url, last && films.length > counts[i] ? films.length - counts[i] : 0, t.name);
      });
    });
    if (overflow) addOverflowLine(w, overflow, label);
    if (!total) {
      const z = w.addText("nothing " + label.toLowerCase());
      z.font = Font.systemFont(11);
      z.textColor = FAINT;
    }
    w.addSpacer();
    return w;
  }

  const {counts, used, overflow} = allocate(perTheater, ROWS.large, true);
  let spare = ROWS.large - used; // lines left for "nothing tonight" at the theaters with no shows
  perTheater.forEach(({t, films}, i) => {
    if (films.length && !counts[i]) return; // didn't fit; the overflow line counts it
    if (!films.length && spare <= 0) return;
    const name = w.addStack();
    name.url = t.url;
    name.centerAlignContent();
    const n = name.addText(t.name);
    n.font = Font.semiboldSystemFont(12);
    n.textColor = INK;
    const note = films.length ? staleNote(t, now) : "nothing " + label.toLowerCase();
    if (!films.length) spare -= 1;
    if (note) {
      name.addSpacer(6);
      const z = name.addText(note);
      z.font = Font.systemFont(10);
      z.textColor = FAINT;
    }
    w.addSpacer(1);
    films.slice(0, counts[i]).forEach((f, j) => {
      const last = j === counts[i] - 1;
      addFilmRow(w, f, t.url, last && films.length > counts[i] ? films.length - counts[i] : 0);
    });
    w.addSpacer(4);
  });
  if (overflow) addOverflowLine(w, overflow, label);
  w.addSpacer();
  return w;
}

// ---------- in the app ----------

// The states the index gives each city (the census's, the main one first), by name for the picker.
const STATE_NAMES = {AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"};
const stateName = s => STATE_NAMES[s] || s;

function words(...parts) { // lower case, accents and punctuation gone
  return parts.filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
}

// A theater's words for a search: its name, town, region, city and the city's states.
function theaterWords(th, city) {
  const states = (city && city.states) || [];
  return words(th.name, th.area, th.region, city && city.name, ...states, ...states.map(stateName));
}

// Whether every word typed starts one of these: "kirks" finds Kirksville, "grand lake" the Grand Lake.
function found(query, ws) { return words(query).every(q => ws.some(w => w.startsWith(q))); }

// Asks what to look for; resolves to the text typed, or null when cancelled or left empty.
async function askQuery(title) {
  const a = new Alert();
  a.title = title;
  a.message = "A theater's name, a town, a city or a state.";
  a.addTextField("Roxie, Kirksville, Oregon…", "");
  a.addAction("Search");
  a.addCancelAction("Cancel");
  if (await a.present() === -1) return null;
  return a.textFieldValue(0).trim() || null;
}

// Rows the sheets share. A row's tap closes its sheet unless it says otherwise (dismissOnSelect is
// Scriptable's, true by default), and closing the app's list ends the run, so every row that
// changes a sheet rather than finishing with it sets it false.
function sectionRow(title) {
  const r = new UITableRow();
  r.isHeader = true;
  r.height = 34;
  const c = r.addText(title.toUpperCase());
  c.titleFont = Font.semiboldSystemFont(12);
  c.titleColor = Color.gray();
  return r;
}

function actionRow(title, subtitle, onSelect) {
  const r = new UITableRow();
  r.height = 48;
  r.dismissOnSelect = false;
  const c = r.addText(title, subtitle);
  c.titleFont = Font.semiboldSystemFont(14);
  c.titleColor = ACCENT;
  c.subtitleFont = Font.systemFont(11);
  c.subtitleColor = Color.gray();
  r.onSelect = onSelect;
  return r;
}

function markedRow(mark, title, subtitle, height) { // a mark column, then the title over its subtitle
  const r = new UITableRow();
  r.height = height;
  const m = r.addText(mark);
  m.widthWeight = 10;
  m.titleFont = Font.semiboldSystemFont(17);
  m.titleColor = ACCENT;
  const c = r.addText(title, subtitle);
  c.widthWeight = 90;
  c.titleFont = Font.systemFont(height > 50 ? 15 : 16);
  c.subtitleFont = Font.systemFont(11);
  c.subtitleColor = Color.gray();
  return r;
}

// A list of cities to choose from; resolves to the chosen id (the current one if the sheet is
// just closed). Used on the first run and from the Theaters sheet's city row. It opens on yours
// (the current city and any in `mine`), then the states, each tapped open to its cities (a city
// across a state line is under each); a search finds a city by its name, a town or a theater in it.
async function chooseCity(index, current, mine = []) {
  const list = cities(index);
  if (list.length < 2) return list[0] ? list[0].id : null;
  const byState = {};
  for (const c of list) for (const s of c.states || []) (byState[s] = byState[s] || []).push(c);
  const states = Object.keys(byState).sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const open = new Set();
  let chosen = null, query = null;
  const table = new UITable();
  table.showSeparators = true;
  const city = (c, sub) => {
    const n = `${c.count} theater${c.count === 1 ? "" : "s"}`;
    const row = markedRow(c.id === current ? "✓" : "", c.name, sub || [(c.states || []).join(", "), n].filter(Boolean).join(" · "), 50);
    row.onSelect = () => { chosen = c.id; saveCity(c.id); }; // and the sheet closes: the choice is made
    table.addRow(row);
  };
  const render = () => {
    table.removeAllRows();
    const head = new UITableRow();
    head.isHeader = true;
    head.height = 50;
    const t = head.addText("Where do you go to the movies?", "Smallest Show lists independent cinemas in these cities. Switch any time from the Theaters sheet.");
    t.titleFont = Font.boldSystemFont(16);
    t.subtitleFont = Font.systemFont(11);
    t.subtitleColor = Color.gray();
    table.addRow(head);
    table.addRow(query
      ? actionRow(`Search: “${query}” ✕`, "Tap to clear.", () => { query = null; render(); })
      : actionRow("Search by town or theater ›", "Or find your city under its state below.",
        async () => { query = await askQuery("Find a city"); render(); }));
    if (query) {
      const hits = list.map(c => ({c, ths: index.theaters.filter(t => t.city === c.id && found(query, theaterWords(t, c)))}))
        .filter(x => x.ths.length);
      table.addRow(sectionRow(hits.length ? `${hits.length} cit${hits.length === 1 ? "y" : "ies"}` : "Nothing matches"));
      for (const {c, ths} of hits) city(c, ths.length === c.count ? null : ths.map(t => t.name).join(", "));
    } else {
      const yours = list.filter(c => c.id === current || mine.includes(c.id));
      if (yours.length) table.addRow(sectionRow("Yours"));
      yours.forEach(c => city(c));
      if (states.length) table.addRow(sectionRow("By state"));
      for (const s of states) {
        const n = byState[s].length;
        const row = markedRow(open.has(s) ? "▾" : "▸", stateName(s), `${n} cit${n === 1 ? "y" : "ies"}`, 44);
        row.dismissOnSelect = false;
        row.onSelect = () => { if (open.has(s)) open.delete(s); else open.add(s); render(); };
        table.addRow(row);
        if (open.has(s)) [...byState[s]].sort((a, b) => a.name.localeCompare(b.name)).forEach(c => city(c));
      }
      const rest = list.filter(c => !(c.states || []).length); // all of them, on an index from before states
      if (rest.length) table.addRow(sectionRow(states.length ? "Elsewhere" : "Cities"));
      rest.forEach(c => city(c));
    }
    table.reload();
  };
  render();
  await table.present(false);
  return chosen || current || list[0].id;
}

// The picker: one city's theaters by region, a check on the followed ones; a row at the top
// switches city, one under it searches every city, and the theaters followed in other cities
// come last (a followed set may span cities). Every tick is saved as it's made, and the sheet stays
// open until it's closed; resolves to the new list then.
async function pickTheaters(index, current) {
  const picked = new Set(current);
  const seen = new Set(current); // the followed elsewhere stay listed once unticked, to tick again
  const list = cities(index);
  const byId = Object.fromEntries(list.map(c => [c.id, c]));
  let city = readCity(index), query = null;
  const table = new UITable();
  table.showSeparators = true;
  const save = () => { const ids = index.theaters.map(t => t.id).filter(id => picked.has(id)); savePicked(ids); return ids; };
  const theater = (th, where) => {
    const on = picked.has(th.id);
    const sub = [where || th.area, th.films ? `${th.films} films this week` : "nothing listed",
                 th.error ? "not reachable" : th.warning ? "fallback" : null].filter(Boolean).join(" · ");
    const row = markedRow(on ? "✓" : "", th.name, sub, 52);
    row.dismissOnSelect = false; // the next tick, or another city: closing the sheet is what finishes
    row.onSelect = () => {
      if (on) picked.delete(th.id); else { picked.add(th.id); seen.add(th.id); }
      save();
      render();
    };
    table.addRow(row);
  };
  const render = () => {
    table.removeAllRows();
    const head = new UITableRow();
    head.isHeader = true;
    head.height = 50;
    const t = head.addText("Which theaters do you go to?", `Tap to follow or unfollow; the widget shows the ticked ones. Close the sheet when done. Smallest Show ${VERSION}`);
    t.titleFont = Font.boldSystemFont(16);
    t.subtitleFont = Font.systemFont(11);
    t.subtitleColor = Color.gray();
    table.addRow(head);
    if (list.length > 1) { // which city this sheet shows; tap to change
      const name = (byId[city] || list[0]).name;
      table.addRow(actionRow(`City: ${name} ›`, "Tap to switch city. Theaters you follow elsewhere stay followed.", async () => {
        const mine = [...new Set(index.theaters.filter(th => picked.has(th.id)).map(th => th.city))];
        city = await chooseCity(index, city, mine);
        query = null;
        render();
      }));
      table.addRow(query
        ? actionRow(`Search: “${query}” ✕`, `Tap to clear and go back to ${name}.`, () => { query = null; render(); })
        : actionRow("Search every city ›", "A theater's name, a town, a city or a state.",
          async () => { query = await askQuery("Find a theater"); render(); }));
    }
    if (query) {
      const hits = index.theaters.filter(th => found(query, theaterWords(th, byId[th.city])));
      table.addRow(sectionRow(hits.length ? `${hits.length} theater${hits.length === 1 ? "" : "s"}` : "Nothing matches"));
      let at = null;
      for (const th of hits.slice(0, 150)) {
        if (th.city !== at) { at = th.city; if (byId[at]) table.addRow(sectionRow(byId[at].name)); }
        theater(th);
      }
      if (hits.length > 150) table.addRow(sectionRow(`and ${hits.length - 150} more: add a word to narrow it`));
      table.reload();
      return;
    }
    let region = null;
    for (const th of index.theaters) {
      if (city && th.city && th.city !== city) continue;
      if (th.region && th.region !== region) { // the catalog comes grouped by region, alphabetical within
        region = th.region;
        table.addRow(sectionRow(region));
      }
      theater(th);
    }
    const elsewhere = index.theaters.filter(th => seen.has(th.id) && th.city && th.city !== city);
    if (elsewhere.length) table.addRow(sectionRow("Followed in other cities"));
    for (const th of elsewhere) theater(th, [th.area, byId[th.city] && byId[th.city].name].filter(Boolean).join(", "));
    table.reload();
  };
  render();
  await table.present(false);
  return save();
}

async function showTable(loaded) {
  const now = new Date();
  let {index, data, offline} = loaded;
  let {day, label} = pickDay(data, now);
  const table = new UITable();
  table.showSeparators = true;

  const render = () => {
    table.removeAllRows();
    const today = isoDay(day) === isoDay(now);
    const title = today ? label : fmtDay(day);

    const nav = new UITableRow();
    nav.isHeader = true;
    nav.height = 44;
    const back = nav.addButton("‹ earlier");
    back.widthWeight = 25;
    back.onTap = () => { day = addDays(day, -1); label = fmtDay(day); render(); };
    const mid = nav.addText(title, `${fmtDay(day)} · updated ${fmtStamp(data.generated_at, now)}${offline ? " (offline)" : ""}`);
    mid.widthWeight = 50;
    mid.centerAligned();
    mid.titleFont = Font.boldSystemFont(16);
    mid.subtitleFont = Font.systemFont(11);
    mid.subtitleColor = Color.gray();
    const fwd = nav.addButton("later ›");
    fwd.widthWeight = 25;
    fwd.rightAligned();
    fwd.onTap = () => { day = addDays(day, 1); label = fmtDay(day); render(); };
    table.addRow(nav);

    // The row people need to find: which theaters this list (and the widget) follows.
    const tools = new UITableRow();
    tools.height = 56;
    const names = data.theaters.map(t => t.name);
    const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
    const pick = tools.addText("Theaters ›", names.length ? `Following ${shown}. Tap to change.` : "Tap to pick the theaters you follow.");
    pick.widthWeight = 100;
    pick.titleFont = Font.semiboldSystemFont(15);
    pick.titleColor = ACCENT;
    pick.subtitleFont = Font.systemFont(12);
    pick.subtitleColor = Color.gray();
    tools.dismissOnSelect = false; // the list stays under the sheet: closing it would end the run
    tools.onSelect = async () => {
      await pickTheaters(index, data.theaters.map(t => t.id));
      const again = await loadAll(null);
      index = again.index; data = again.data; offline = again.offline;
      render();
    };
    table.addRow(tools);

    let any = false;
    for (const t of data.theaters) {
      const films = showsFor(t, day, now);
      const head = new UITableRow();
      head.isHeader = true;
      head.height = 40;
      const stale = staleNote(t, now);
      const name = head.addText(t.name, films.length ? [t.area, stale].filter(Boolean).join(" · ") : "nothing on");
      name.widthWeight = 80;
      name.titleFont = Font.semiboldSystemFont(15);
      name.subtitleFont = Font.systemFont(11);
      name.subtitleColor = Color.gray();
      const site = head.addButton("site ›");
      site.widthWeight = 20;
      site.rightAligned();
      site.onTap = () => Safari.open(t.url);
      table.addRow(head);

      for (const {f, s} of showsInOrder(films)) {
        any = true;
        const row = new UITableRow();
        row.height = 48;
        const time = row.addText(fmtTime(s.at));
        time.widthWeight = 18;
        time.titleFont = Font.mediumSystemFont(15);
        time.titleColor = s.sold_out ? Color.gray() : Color.dynamic(Color.black(), Color.white());
        const sub = [f.rating, f.runtime_min && `${f.runtime_min} min`, s.venue].filter(Boolean).join(" · ");
        const cell = row.addText(f.title, sub);
        cell.widthWeight = 62;
        cell.titleFont = Font.systemFont(15);
        cell.titleColor = s.sold_out ? Color.gray() : Color.dynamic(Color.black(), Color.white());
        cell.subtitleFont = Font.systemFont(11);
        cell.subtitleColor = Color.gray();
        const st = row.addText(s.sold_out ? "sold out" : "tickets ›");
        st.widthWeight = 20;
        st.rightAligned();
        st.titleFont = Font.systemFont(12);
        st.titleColor = s.sold_out ? Color.gray() : ACCENT;
        row.dismissOnSelect = false; // still here on the way back from the ticket page
        row.onSelect = () => Safari.open(s.url);
        table.addRow(row);
      }
    }
    if (!any) {
      const r = new UITableRow();
      r.height = 60;
      const c = r.addText(data.theaters.length ? "Nothing listed for this day yet." : "No theaters followed yet. Tap Theaters.");
      c.centerAligned();
      c.titleColor = Color.gray();
      table.addRow(r);
    }
    table.reload();
  };
  render();
  await table.present(false);
}

// ---------- keeping itself current ----------

// Once a day, if the repo publishes a newer version, write it over this script's own file (in
// Scriptable's iCloud or local documents, whichever this copy lives in). Nothing to paste again.
async function selfUpdate(force) {
  try {
    const last = Keychain.contains(UPDATE_KEY) ? Number(Keychain.get(UPDATE_KEY)) : 0;
    if (!force && Date.now() - last < 24 * 3600 * 1000) return null;
    Keychain.set(UPDATE_KEY, String(Date.now()));
    const info = await new Request(`${VERSION_URL}?t=${Date.now()}`).loadJSON();
    if (!info || !info.version || !info.script || info.version <= VERSION) return null;
    const src = await new Request(`${info.script}?t=${Date.now()}`).loadString();
    if (!src.includes(`const VERSION = "${info.version}";`) || !src.includes("Script.complete()")) return null;
    const managers = [];
    try { managers.push(FileManager.iCloud()); } catch (e) { /* iCloud Drive off for Scriptable */ }
    managers.push(FileManager.local());
    for (const fm of managers) {
      const path = fm.joinPath(fm.documentsDirectory(), `${Script.name()}.js`);
      if (fm.fileExists(path)) { fm.writeString(path, src); return info.version; }
    }
  } catch (e) {
    console.warn(`update check skipped: ${e}`);
  }
  return null;
}

// ---------- main ----------

async function main() {
  let loaded;
  try {
    loaded = await loadAll(config.runsInWidget ? args.widgetParameter : null);
  } catch (e) {
    if (config.runsInWidget) {
      const w = new ListWidget();
      w.backgroundColor = PAPER;
      const t = w.addText("Smallest Show can't load the listings.");
      t.textColor = MUTED;
      t.font = Font.systemFont(12);
      Script.setWidget(w);
    } else {
      const a = new Alert();
      a.title = "Couldn't load the listings";
      a.message = String(e);
      a.addAction("OK");
      await a.present();
    }
    return;
  }

  if (config.runsInWidget) {
    Script.setWidget(buildWidget(loaded.data, loaded.offline, config.widgetFamily || "large"));
    await selfUpdate(false); // after the widget is set, so a slow network never delays the draw
  } else if (args.widgetParameter === "preview") {
    await buildWidget(loaded.data, loaded.offline, "large").presentLarge();
  } else {
    const updated = await selfUpdate(true);
    if (updated) {
      const a = new Alert();
      a.title = `Smallest Show updated to ${updated}`;
      a.message = "The new version runs from the next time it opens.";
      a.addAction("OK");
      await a.present();
    }
    if (!Array.isArray(readPicked())) { // first run: the city, then its theaters, before anything else
      const city = await chooseCity(loaded.index, null);
      // ticked to start with: the default's theaters in that city, so a pick elsewhere doesn't carry them
      const here = new Set(loaded.index.theaters.filter(t => t.city === city).map(t => t.id));
      await pickTheaters(loaded.index, loaded.ids.filter(id => here.has(id)));
      loaded = await loadAll(null);
    }
    await showTable(loaded);
  }
}

await main();
Script.complete();
