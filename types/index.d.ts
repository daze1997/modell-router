export type Tier = 'klein' | 'standard' | 'komplex'
export type Stats = { klein: number; standard: number; komplex: number }

declare module 'claude-code' {
  interface PluginState {
    'modell-router': { stats: Shaped<Stats> }
  }
}
