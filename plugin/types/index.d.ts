export type Heart = {
  isOn: boolean
  jealousy: number
  love: number
  line: string
  wasPetted: boolean
  tiredMinutes: number
  name: string
  days: number
  petCount: number
  personalidad: string
  voz: string
  idioma: string
  level: number
  affection: number
  muted: boolean
  // Quiet mode ("no molestar"): when it ends, epoch ms; 0 when off. Owned by the avatar, synced by the heartbeat.
  quietUntil: number
  // What she reads aloud of her replies: 'todo' | 'resumen' | 'burbuja'.
  lectura: string
  // A turn this long (seconds) is announced as a finished task. Owned by the avatar (config.longTask).
  longTask: number
}

declare module 'claude-code' {
  interface PluginState {
    'claudia-chan': { heart: Heart; isBlinking: boolean }
  }
}

// One line of her diary (store key 'diary').
export type Memory = {
  // When she wrote it down, epoch ms.
  at: number
  text: string
  // The calendar day it is about, 'YYYY-MM-DD' (an exam, a trip, a birthday).
  date?: string
  // Comes back every year on that month and day.
  yearly?: boolean
  // The local day she last brought it up (the day itself or the day before), so each notice is given once.
  said?: string
  // She already asked how it went.
  asked?: boolean
}
