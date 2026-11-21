// The hover toolbar's layout, shared by main.js (which decides where the window takes clicks) and the
// tests (which check it against index.html). Adding a button: add it to #tools in index.html, give it
// tools.<id> in every language of i18n.json, and raise TOOL_COUNT.
const TOOL_COUNT = 8
const TOP = 112 // #tools { top } in index.html
const SIZE = 38 // a round button
const GAP = 8 // between buttons
const PITCH = SIZE + GAP

// Window pixels the toolbar covers, with a few pixels of slack around the column of buttons so the
// cursor does not fall through between them (3 buttons: 148 high, as it was before).
// One column on purpose: it stays in the 54 px at the window's right edge, clear of the petting zone
// (pet.js HEAD ends at x = 290) and of her face, and the first-run labels have room to its left.
// Eight buttons end at y = 472 of the 560 px window, above the hint strips at the bottom.
function toolsRect(count, width) {
  return { x: width - 54, y: TOP - 6, width: 50, height: count * PITCH + 10 }
}

// Where the buttons themselves start and end, top to bottom.
function buttonSpan(count) {
  return { top: TOP, bottom: TOP + count * PITCH - GAP }
}

module.exports = { TOOL_COUNT, toolsRect, buttonSpan }
