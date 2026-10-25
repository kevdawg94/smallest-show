# Smallest Show

Tonight at America's independent cinemas, on your iPhone home screen: what's playing, what's sold out, a
tap to tickets. It's a widget for [Scriptable](https://apps.apple.com/us/app/scriptable/id1405459188),
named for *The Smallest Show on Earth* (1957), where a young couple inherit a run-down cinema between
two railway bridges.

**Install:** [kevdawg94.github.io/smallest-show](https://kevdawg94.github.io/smallest-show/). Get
Scriptable, tap *Add to Scriptable*, run the script once to pick your city and the theaters you go to,
then add a large Scriptable widget to the home screen.

## What's here

- `widget/SmallestShow.js` is the script. Installed copies check `docs/version.json` once a day and
  update themselves; there's nothing to paste again.
- `docs/` is the install page (GitHub Pages), the one-tap `SmallestShow.scriptable` and `version.json`.
- The `feeds` branch is what the widget reads: `index.json` (the cities and their theaters) and one
  `<theater id>.json` per theater with the next seven days of shows. Times are each theater's own
  local time. The listings are rebuilt every three hours from 9 am to 9 pm Pacific, and the branch
  holds only the latest: it is replaced on every rebuild.

## License

The code is MIT-licensed; see `LICENSE`. The showtimes belong to the theaters: the feeds are read from
each theater's own public listings and come as-is, with no promise that they're complete or current.
Check the theater's site before you go.

This repo is published automatically; a change made here directly is overwritten by the next publish.
