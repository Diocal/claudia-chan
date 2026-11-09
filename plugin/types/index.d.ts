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
  level: number
  affection: number
}

declare module 'claude-code' {
  interface PluginState {
    'claudia-chan': { heart: Heart; isBlinking: boolean }
  }
}
