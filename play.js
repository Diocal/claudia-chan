// Her mini-games as she shows them on her own window (index.html #gamecard and #field): the picker and
// the four games. The rules are in games.mjs; the app (main.js) keeps the results, speaks her lines
// and lets the game's part of the window take clicks. avatar.js lends her face, bubble and sounds.
import { GAMES, HANDS, HEARTS, NUMBER, createGuess, createHearts, gameLine, pickHand, reflexVerdict, reflexWait, rps } from '/games.mjs'

// Light skin tone, as she is.
const HAND_EMOJI = { piedra: '✊🏻', papel: '✋🏻', tijera: '✌🏻' }
const ICON = { ppt: '✊🏻', corazones: '💗', reflejos: '⚡', numero: '🔢' }
const COUNT_MS = 380 // between "piedra…", "papel…", "¡tijera!"
const TOSS_SIZE = 40

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const fill = (template, values) => String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')

// `her`: { act, texts(), say(line), face(name, seconds, hand), cue(sound), hearts(), pose(name, seconds), rest() }
export function createGames(her) {
  const root = document.getElementById('gamecard')
  // dev/poses.html has no games and no app to talk to.
  if (!root || !her.act) return { isOpen: () => false, handle() {} }

  const field = document.getElementById('field')
  const title = document.getElementById('gametitle')
  const menu = document.getElementById('gamemenu')
  const how = document.getElementById('gamehow')
  const body = document.getElementById('gamebody')
  const chip = document.getElementById('gamechip')
  let isOpen = false
  let stats = {}
  let seen = {}
  let personalidad
  let timers = []

  const texts = () => her.texts() ?? {}
  const line = (key, values) => gameLine(texts(), key, { personalidad, values })
  // Her bubble, and for the lines worth hearing her local voice (the app applies mute and quiet mode).
  function tell(text, aloud = false) {
    if (!text) return
    her.say(text)
    if (aloud) her.act('games-say', text)
  }
  const later = (run, ms) => timers.push(setTimeout(run, ms))
  const every = (run, ms) => timers.push(setInterval(run, ms))
  function stopTimers() {
    for (const id of timers) clearTimeout(id) // clears intervals too
    timers = []
  }

  // The app lets exactly this part of her window take clicks: the card, plus the field while hearts fly.
  function report() {
    if (!isOpen) return
    const card = root.getBoundingClientRect()
    const play = field.classList.contains('on') ? field.getBoundingClientRect() : card
    const left = Math.min(card.left, play.left)
    const top = Math.min(card.top, play.top)
    her.act('games-area', { x: left, y: top, width: Math.max(card.right, play.right) - left, height: Math.max(card.bottom, play.bottom) - top })
  }
  new ResizeObserver(report).observe(root)

  function showField(on) {
    field.classList.toggle('on', on)
    if (!on) field.replaceChildren()
    report()
  }

  function close() {
    if (!isOpen) return
    isOpen = false
    stopTimers()
    showField(false)
    root.classList.remove('on')
    her.act('games-area', null)
  }

  const SCREENS = { ppt, corazones, reflejos, numero }

  // The picker (no game) or one game. The first time a game is opened, one line says how it is played.
  function show(game) {
    stopTimers()
    showField(false)
    const names = texts().names ?? {}
    title.textContent = game ? `${ICON[game]} ${names[game] ?? game}` : `🎮 ${texts().pick ?? ''}`
    menu.hidden = !game
    how.hidden = !game || Boolean(seen[game])
    if (game && !seen[game]) {
      how.textContent = texts().how?.[game] ?? ''
      seen[game] = true
      her.act('games-seen', game)
    }
    if (game) SCREENS[game]()
    else body.replaceChildren(el('div', { className: 'list' }, ...GAMES.map(name => el('button', { textContent: `${ICON[name]} ${names[name] ?? name}`, onclick: () => show(name) }))))
  }

  const again = game => el('button', { className: 'main', textContent: texts().again ?? '↻', onclick: () => show(game) })

  // --- Piedra, papel o tijera: she counts, shows her hand (on the card and with her own arm), and the
  // score runs until you leave. A tie is played again and is not a result.
  function ppt() {
    const score = { me: 0, her: 0 }
    const stage = el('div', { className: 'stage', textContent: '✊🏻 ✋🏻 ✌🏻' })
    const tally = el('div', { className: 'stats' })
    const showTally = () => tally.replaceChildren(el('b', { textContent: fill(texts().score, score) }))
    const buttons = HANDS.map(hand => el('button', { textContent: HAND_EMOJI[hand], onclick: () => play(hand) }))
    const enable = on => buttons.forEach(button => { button.disabled = !on })

    function play(mine) {
      enable(false)
      stage.classList.add('small')
      const count = texts().ppt?.count ?? []
      count.forEach((word, i) => later(() => { stage.textContent = word }, i * COUNT_MS))
      later(() => {
        const hers = pickHand()
        const outcome = rps(mine, hers)
        stage.classList.remove('small')
        stage.textContent = `${HAND_EMOJI[mine]} · ${HAND_EMOJI[hers]}`
        if (outcome === 'win') score.me += 1
        if (outcome === 'lose') score.her += 1
        showTally()
        // She pouts when you win and beams when she does, her hand still up.
        her.face(outcome === 'win' ? 'triste' : outcome === 'lose' ? 'feliz' : 'sorprendida', 2.4, hers)
        her.cue(outcome === 'win' ? 'error' : outcome === 'lose' ? 'exito' : 'sorpresa')
        tell(line(`ppt.${outcome}`), true)
        if (outcome !== 'tie') her.act('games-result', { game: 'ppt', won: outcome === 'win' })
        later(() => enable(true), 700)
      }, count.length * COUNT_MS)
    }

    showTally()
    body.replaceChildren(stage, el('div', { className: 'row hands' }, ...buttons), tally)
  }

  // --- Atrapa los corazones: 30 s of hearts and stars drifting over her; click them before they fade.
  function corazones() {
    const clock = el('b')
    const points = el('b')
    const combo = el('span')
    const best = el('span', { textContent: fill(texts().best, { n: stats.bestHearts ?? 0 }) })
    const start = el('button', { className: 'main', textContent: texts().start ?? '▶', onclick: run })
    const showScore = (score, streak) => {
      points.textContent = fill(texts().points, { n: score })
      combo.textContent = streak > 1 ? fill(texts().combo, { n: streak }) : ''
    }
    clock.textContent = `⏱ ${HEARTS.seconds}`
    showScore(0, 0)
    body.replaceChildren(el('div', { className: 'stats' }, clock, points, combo, best), start)

    function run() {
      const game = createHearts()
      const startedAt = performance.now()
      start.remove()
      showField(true)
      tell(line('hearts.start'), true)

      function toss(item) {
        const { width, height } = field.getBoundingClientRect()
        const node = el('button', { className: 'toss', textContent: item.kind === 'star' ? '⭐' : '💗' })
        const left = item.x * (width - TOSS_SIZE)
        const top = item.y * (height - TOSS_SIZE)
        node.style.left = `${left}px`
        node.style.top = `${top}px`
        // The drift stops at the field's edges: past them her window lets clicks through to the app
        // underneath, and a heart nobody can catch would still count as missed.
        node.style.setProperty('--dx', `${Math.max(-left, Math.min(item.dx * width, width - TOSS_SIZE - left))}px`)
        node.style.setProperty('--dy', `${Math.max(-top, item.dy * height)}px`)
        node.style.animationDuration = `${item.life}s`
        // pointerdown, not click: a heart that moves must not need a steady hand.
        node.onpointerdown = event => {
          const got = game.grab(item.id)
          node.remove()
          if (!got) return
          const mark = el('span', { className: 'plus', textContent: `+${got.points}` })
          const box = field.getBoundingClientRect()
          mark.style.left = `${event.clientX - box.left}px`
          mark.style.top = `${event.clientY - box.top - 10}px`
          mark.onanimationend = () => mark.remove()
          field.append(mark)
          showScore(got.score, got.combo)
          if (got.event === 'streak') {
            her.face('feliz', 1.6)
            her.cue('exito')
            her.hearts()
            tell(line('hearts.streak', { n: got.combo }))
          } else her.cue('guino')
        }
        node.onanimationend = () => {
          const lost = game.fade(item.id)
          node.remove()
          if (!lost) return
          showScore(lost.score, lost.combo)
          if (lost.event) her.face(lost.event === 'miss' ? 'triste' : 'preocupada', 1.4)
          if (lost.event === 'miss') tell(line('hearts.miss'))
        }
        field.append(node)
      }

      every(() => {
        const t = (performance.now() - startedAt) / 1000
        clock.textContent = `⏱ ${Math.max(0, Math.ceil(HEARTS.seconds - t))}`
        game.toss(t).forEach(toss)
        if (!game.isOver(t)) return
        stopTimers()
        showField(false)
        const { score, won } = game.result()
        const isRecord = score > (stats.bestHearts ?? 0)
        her.face('feliz', 2.5)
        her.cue(isRecord ? 'exito' : 'listo')
        if (isRecord) her.pose('celebrate', 2)
        tell(line(isRecord ? 'hearts.record' : 'hearts.end', { n: score }), true)
        her.act('games-result', { game: 'corazones', won, score })
        if (isRecord) best.textContent = fill(texts().best, { n: score })
        body.append(again('corazones'))
      }, 100)
    }
  }

  // --- Reflejos: "espera…", then "¡ya!" when nobody expects it. The signal is the card turning pink and
  // a chime, not her voice: synthesized speech would arrive late and spoil the measure.
  function reflejos() {
    const pad = el('button', { className: 'pad', textContent: texts().start ?? '▶' })
    const bestText = () => (stats.bestReflexMs ? fill(texts().best, { n: fill(texts().ms, { n: stats.bestReflexMs }) }) : '')
    const best = el('span', { textContent: bestText() })
    let state = 'idle'
    let goAt = 0
    let lastMs = 0

    function wait() {
      stopTimers()
      state = 'wait'
      pad.className = 'pad wait'
      pad.textContent = texts().reflex?.wait ?? '…'
      tell(texts().reflex?.wait, true)
      later(() => {
        state = 'go'
        goAt = performance.now()
        pad.className = 'pad go'
        pad.textContent = texts().reflex?.go ?? '!'
        her.cue('listo')
      }, reflexWait() * 1000)
    }

    function early() {
      stopTimers()
      state = 'idle'
      goAt = performance.now()
      lastMs = 0
      pad.className = 'pad'
      pad.textContent = texts().again ?? '↻'
      her.face('guino', 1.8)
      tell(line('reflex.early'), true)
    }

    function stop() {
      const ms = Math.round(performance.now() - goAt)
      const verdict = reflexVerdict(ms)
      if (verdict === 'early') {
        early()
        return
      }
      state = 'idle'
      lastMs = ms
      const isRecord = !stats.bestReflexMs || ms < stats.bestReflexMs
      pad.className = 'pad'
      pad.textContent = `${fill(texts().ms, { n: ms })} · ${texts().again ?? '↻'}`
      // Quick hands surprise her; slow ones get a wink and a tease.
      her.face(verdict === 'fast' ? 'sorprendida' : verdict === 'ok' ? 'feliz' : 'guino', 2)
      tell(line(isRecord && verdict !== 'slow' ? 'reflex.record' : `reflex.${verdict}`), true)
      her.act('games-result', { game: 'reflejos', won: verdict === 'fast', ms })
      if (isRecord) best.textContent = fill(texts().best, { n: fill(texts().ms, { n: ms }) })
    }

    pad.onpointerdown = () => {
      if (state === 'wait') early()
      else if (state === 'go') stop()
      // A moment after a result, so a second click of the same burst does not start the next round.
      else if (performance.now() - goAt > lastMs + 400) wait()
    }
    body.replaceChildren(pad, el('div', { className: 'stats' }, best))
  }

  // --- Adivina el número: twenty buttons; each guess rules out the ones it cannot be any more.
  function numero() {
    const game = createGuess()
    const hint = el('b', { textContent: texts().number?.start ?? '' })
    const tries = el('span')
    const buttons = Array.from({ length: NUMBER.max }, (_, i) => el('button', { textContent: String(i + 1), onclick: () => guess(i + 1) }))

    function guess(n) {
      const got = game.guess(n)
      if (!got) return
      tries.textContent = fill(texts().tries, { n: got.tries })
      buttons.forEach((button, i) => { button.disabled = got.hint === 'right' || i + 1 < got.low || i + 1 > got.high })
      if (got.hint !== 'right') {
        hint.textContent = texts().number?.[got.hint] ?? ''
        tell(hint.textContent, true)
        return
      }
      buttons[n - 1].classList.add('hit')
      hint.textContent = `🎯 ${n}`
      // Found too soon and she pouts; after many tries she is the one gloating.
      her.face(got.verdict === 'quick' ? 'triste' : got.verdict === 'fair' ? 'feliz' : 'guino', 2.4)
      her.cue(got.won ? 'exito' : 'listo')
      tell(line(`number.${got.verdict}`, { n: got.tries }), true)
      her.act('games-result', { game: 'numero', won: got.won })
      body.append(again('numero'))
    }

    body.replaceChildren(el('div', { className: 'grid' }, ...buttons), el('div', { className: 'stats' }, hint, tries))
    tell(texts().number?.start)
  }

  menu.onclick = () => show(null)
  document.getElementById('gameclose').onclick = close
  // Only reaches us if her window has the keyboard, which it normally never does: ✕ and 🎮 close it.
  window.addEventListener('keydown', event => { if (event.key === 'Escape') close() })

  return {
    isOpen: () => isOpen,
    // { type: 'games', open?, game?, stats?, seen?, personalidad?, close?, done? } from the app.
    handle(event) {
      if (event.stats) stats = event.stats
      if (event.close) close()
      if (event.open) {
        seen = { ...event.seen }
        personalidad = event.personalidad
        isOpen = true
        root.classList.add('on')
        menu.title = texts().menu ?? ''
        document.getElementById('gameclose').title = texts().close ?? ''
        her.rest()
        show(GAMES.includes(event.game) ? event.game : null)
        report()
      }
      // Claude finished while you play: a small chip, not an interruption. A new prompt takes it away.
      if (event.done !== undefined) {
        chip.hidden = !event.done
        chip.textContent = texts().doneChip ?? '✔'
      }
    },
  }
}
