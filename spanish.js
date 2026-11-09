// Spells Spanish in katakana, so the Japanese voice reads it with her accent.
const ROWS = {
  '': ['ア', 'イ', 'ウ', 'エ', 'オ'],
  k: ['カ', 'キ', 'ク', 'ケ', 'コ'],
  s: ['サ', 'シ', 'ス', 'セ', 'ソ'],
  t: ['タ', 'ティ', 'トゥ', 'テ', 'ト'],
  n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
  h: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
  m: ['マ', 'ミ', 'ム', 'メ', 'モ'],
  y: ['ヤ', 'イ', 'ユ', 'イェ', 'ヨ'],
  r: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  g: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
  d: ['ダ', 'ディ', 'ドゥ', 'デ', 'ド'],
  b: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
  p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
  f: ['ファ', 'フィ', 'フ', 'フェ', 'フォ'],
  C: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'],
  ñ: ['ニャ', 'ニ', 'ニュ', 'ニェ', 'ニョ'],
}
const VOWELS = 'aiueo'
const FINAL = { n: 'ン', m: 'ン', t: 'ト', d: 'ド' }
const SOUND = /([kstnhmyrgdbpfCñ]?)([aiueo])(')?|([kstnhmrgdbpfC])|([.!?…]+)|([,;:]+)|(\s+)/g

function toSounds(text) {
  return text
    .toLowerCase()
    .replace(/[áéíóú]/g, v => `${'aeiou'['áéíóú'.indexOf(v)]}'`)
    .replace(/ü/g, 'u')
    .replace(/ch/g, 'C')
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/g(?=[ei])/g, 'J')
    .replace(/gu(?=[ei])/g, 'g')
    .replace(/c(?=[ei])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/h/g, '')
    .replace(/[jJ]/g, 'h')
    .replace(/v/g, 'b')
    .replace(/ll/g, 'y')
    .replace(/l/g, 'r')
    .replace(/rr/g, 'r')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'u')
    .replace(/y(?![aiueo])/g, 'i')
}

function spanishToKatakana(text) {
  return toSounds(text).replace(SOUND, (_, consonant, vowel, stress, coda, stop, pause, space) => {
    if (vowel) return ROWS[consonant][VOWELS.indexOf(vowel)] + (stress ? 'ー' : '')
    if (coda) return FINAL[coda] ?? ROWS[coda][2]
    if (stop) return '。'
    if (pause) return '、'
    return space ? ' ' : ''
  }).replace(/[^゠-ヿ、。 ]/g, '').trim()
}

module.exports = { spanishToKatakana }
