// tally: file edits and answered turns as of the last turn's end (prev* as of
// the turn before, so a cheer can show what is new), and when that turn
// landed its answer (ms since the epoch).
// playing: the activity a person started with a band button, and when.
// isHidden: whether the person hid the pets with /pets.
// scene: what the pets act out while Claude works.
// storm: whether the last test run failed, and when that last changed.
// stats: the session's numbers for /wrapped.
// wrapped: the last /wrapped card and its text.
// poke: the pet the person last tapped on the band, and when (ms since the epoch).
// litter: the young the pets have had for subagents: which agent each is for,
// which pet it belongs to, when it was born and when it fell asleep (its
// agent finished), ms since the epoch.
declare module 'claude-code' {
  interface PluginState {
    pets: {
      tally: { edits: number; answers: number; prevEdits: number; prevAnswers: number; answeredAt: number }
      playing: { kind: 'feed' | 'play' | 'dance'; at: number } | null
      isHidden: boolean
      scene: 'think' | 'read' | 'edit' | 'run' | 'test' | 'web' | 'agent' | 'wait' | 'danger'
      storm: { isRaining: boolean; changedAt: number }
      stats: {
        startedAt: number
        calls: { read: number; edit: number; run: number; test: number; web: number; agent: number }
        testsPassed: number
        testsFailed: number
        files: string[]
        answers: number
        busyMs: number
        longestTurnMs: number
        guarded: number
      }
      wrapped: { svg: string; text: string } | null
      poke: { pet: 'chk' | 'bun' | 'cat' | 'dog'; at: number } | null
      litter: { kids: { id: string; parent: 'chk' | 'bun' | 'cat' | 'dog'; bornAt: number; sleptAt: number | null }[] }
    }
  }
}
