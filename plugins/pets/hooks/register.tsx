import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { quoteOf, riskOf } from './guard'
import { moodOf } from './mood'
import { ACTIVITY_SECONDS, MAX_KIDS, MAX_SPROUTS, PET_HOMES, POKE_SECONDS, framesAt, petsAlt, petsScene, phaseAt } from './scene'
import type { Activity, Mode, PetId, Scene, SceneInput, Weather } from './scene'
import { wrappedCard, wrappedText } from './wrapped'

// The pets live in the band directly above the prompt input, drawn in
// starlight lines, and act out what Claude is doing: the cat reads, the bunny
// plants, the dog digs, the chick watches tests or flies ahead, the dog
// fetches for helper agents. They lean in when you are asked something, panic
// at risky commands (which wait for your OK in a dialog), and a rain cloud
// hangs over failing tests until they pass. The session grows the picture:
// edits sprout on the number line, answers light the constellation, and
// /wrapped draws the whole session as one card.
//
// The band redraws a fresh SVG only when its scene changes, so a running
// scene keeps its animations; the scene holds a beat after the last call so a
// burst of quick calls reads as one activity.

const CHEER_MS = 6000
const CLEARING_MS = 5000
const SCENE_HOLD_MS = 1600
// The desktop measures the band in cells of its code font; near enough.
const CELL_PX = 8
const MIN_WIDTH = 360
const MAX_WIDTH = 1400
const MAX_FILES = 300
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const ACTIVITIES: readonly { kind: Activity; label: string }[] = [
  { kind: 'feed', label: 'Feed' },
  { kind: 'play', label: 'Play' },
  { kind: 'dance', label: 'Dance' },
]
const STAT_KEYS = ['read', 'edit', 'run', 'test', 'web', 'agent'] as const
type StatKey = (typeof STAT_KEYS)[number]

const tally = atom({ plugin: 'pets', key: 'tally' } as const, {
  edits: 0,
  answers: 0,
  prevEdits: 0,
  prevAnswers: 0,
  answeredAt: 0,
})
const playing = atom({ plugin: 'pets', key: 'playing' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const scene = atom({ plugin: 'pets', key: 'scene' } as const, 'think')
const storm = atom({ plugin: 'pets', key: 'storm' } as const, { isRaining: false, changedAt: 0 })
const stats = atom({ plugin: 'pets', key: 'stats' } as const, {
  startedAt: 0,
  calls: { read: 0, edit: 0, run: 0, test: 0, web: 0, agent: 0 },
  testsPassed: 0,
  testsFailed: 0,
  files: [],
  answers: 0,
  busyMs: 0,
  longestTurnMs: 0,
  guarded: 0,
})
const wrapped = atom({ plugin: 'pets', key: 'wrapped' } as const, null)
const poke = atom({ plugin: 'pets', key: 'poke' } as const, null)
const litter = atom({ plugin: 'pets', key: 'litter' } as const, { kids: [] })

type Kid = { id: string; parent: PetId; bornAt: number; sleptAt: number | null }
// Which pet has the next young one: the dog first, since fetching for
// agents is its job, then the others.
const PARENTS: readonly PetId[] = ['dog', 'cat', 'bun', 'chk']

// A subagent's first step: a young one is born to the first pet without one,
// else in the place of the longest-asleep one; with every pet's awake,
// the agent goes without.
const born = (kids: readonly Kid[], id: string, now: number): readonly Kid[] => {
  if (kids.some(kid => kid.id === id)) return kids
  const taken = new Set(kids.map(kid => kid.parent))
  const free = PARENTS.find(parent => !taken.has(parent))
  if (free !== undefined) return [...kids, { id, parent: free, bornAt: now, sleptAt: null }]
  const asleep = kids.filter(kid => kid.sleptAt !== null).sort((a, b) => (a.sleptAt ?? 0) - (b.sleptAt ?? 0))[0]
  if (asleep === undefined) return kids
  return kids.map(kid => (kid === asleep ? { id, parent: kid.parent, bornAt: now, sleptAt: null } : kid))
}

// An agent's end: its young one falls asleep where it is.
const asleep = (kids: readonly Kid[], now: number, isDone: (kid: Kid) => boolean): readonly Kid[] =>
  kids.map(kid => (kid.sleptAt === null && isDone(kid) ? { ...kid, sleptAt: now } : kid))

type Tally = { edits: number; answers: number; prevEdits: number; prevAnswers: number }

// What the session has grown: sprouts for edits, stars for answers, and
// which of them arrived with the last turn so a cheer can show them arrive.
const growthOf = (t: Tally) => ({
  sprouts: t.edits,
  freshSprouts: Math.min(t.edits, MAX_SPROUTS) - Math.min(t.prevEdits, MAX_SPROUTS),
  stars: t.answers,
  isStarFresh: t.answers > t.prevAnswers,
})

const editedPathOf = (input: unknown) => {
  const args = input as { file_path?: unknown; notebook_path?: unknown }
  const path = args.file_path ?? args.notebook_path
  return typeof path === 'string' ? path : null
}

const stampOf = (ms: number) => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
}

// The module's own bookkeeping; a reload starts it over, which is harmless:
// the drawing's state lives in $.state.
// Edits since the last turn's end; committed to the tally when a turn ends,
// so the band redraws once per turn for them, not once per edit.
let pendingEdits = 0
// Calls in flight, oldest first, each with the scene it shows.
const inFlight = new Map<string, Scene>()
let isAskingPermission = false
// The session's permission mode, as the last prompt reported it. In
// bypassPermissions the person has said not to be asked, so the guard keeps
// the panic but never holds a call for its dialog.
let permissionMode = 'default'
// Bumped by every scene decision, so a drift back to thinking scheduled for
// an older decision never overrides a newer one.
let generation = 0
// The scene on the band and when it began, so a redraw of the same scene
// resumes its motion instead of restarting it.
let sceneKey = ''
let sceneStartedAt = 0
// The last scene drawn, and where its pets were when it ended: the next
// scene starts them from there.
let lastInput: SceneInput | null = null
let sceneFrom: SceneInput['from'] = {}

async function show($: EngineInterface, next: Scene) {
  if ((await read($, scene)) !== next) {
    await update($, scene, () => next)
  }
}

// The scene follows a pending permission prompt, else the newest call in
// flight; with nothing in flight it drifts back to thinking after a beat.
async function settle($: EngineInterface) {
  const mine = ++generation
  const newest = [...inFlight.values()].at(-1)
  if (isAskingPermission) return show($, 'wait')
  if (newest !== undefined) return show($, newest)
  $.clock.after(SCENE_HOLD_MS, () => {
    if (mine === generation) void show($, 'think')
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pets', description: 'Show or hide the pets above the prompt' })
    await $.command.register({ name: 'wrapped', description: 'Draw this session as one card: the pets, its stars and its numbers' })
    const now = await $.clock.now()
    await update($, stats, s => (s.startedAt > 0 ? s : { ...s, startedAt: now }))

    return next(e)
  })

  on('command.run', { command: 'pets' }, async $ => {
    await update($, isHidden, was => !was)

    return {
      text: (await read($, isHidden)) ? 'Pets are hidden. Run /pets to bring them back.' : 'Pets are back.',
    }
  })

  on('command.run', { command: 'wrapped' }, async $ => {
    const now = await $.clock.now()
    const s = await read($, stats)
    const svg = wrappedCard(s, now)
    const home = await $.env.get('HOME')
    let savedTo: string | null = null
    if (home !== undefined) {
      const path = `${home}/Downloads/claude-session-${stampOf(now)}.svg`
      try {
        await $.fs.write(path, svg)
        savedTo = `~${path.slice(home.length)}`
      } catch {
        savedTo = null
      }
    }
    const text = wrappedText(s, savedTo)
    await update($, wrapped, () => ({ svg, text }))

    return { text }
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    const risk = riskOf(e.tool, e)
    const isBypassing = permissionMode === 'bypassPermissions'
    if (risk !== null && !isBypassing) {
      inFlight.set(id, 'danger')
      await settle($)
      await update($, stats, s => ({ ...s, guarded: s.guarded + 1 }))
      let answer: string | null = null
      try {
        answer = await $.ui.ask(`The pets flagged this because ${risk}. Run \`${quoteOf(e.tool, e)}\`?`, {
          header: 'Pets guard',
          // Block first: an answer nobody gave (a dialog left to time out) must not run it.
          options: ['Block it', 'Run it'],
        })
      } catch {
        answer = null
      }
      if (answer !== 'Run it') {
        inFlight.delete(id)
        await settle($)
        return { deny: `The person did not approve this at the pets guard (${risk}). Ask them in chat before trying again.` }
      }
    }

    const mood = moodOf(e.tool, e)
    inFlight.set(id, risk !== null ? 'danger' : mood)
    await settle($)
    let ran
    try {
      ran = await next(e)
    } finally {
      inFlight.delete(id)
      isAskingPermission = false
      await settle($)
    }
    if (ran.deny !== undefined) return ran

    const isFailed = ran.isError === true
    const now = await $.clock.now()
    if (EDIT_TOOLS.has(e.tool) && !isFailed) pendingEdits += 1
    const key = (STAT_KEYS as readonly string[]).includes(mood) ? (mood as StatKey) : null
    const path = EDIT_TOOLS.has(e.tool) && !isFailed ? editedPathOf(e) : null
    await update($, stats, s => ({
      ...s,
      calls: key === null ? s.calls : { ...s.calls, [key]: s.calls[key] + 1 },
      files: path === null || s.files.includes(path) ? s.files : [...s.files, path].slice(-MAX_FILES),
      testsPassed: s.testsPassed + (mood === 'test' && !isFailed ? 1 : 0),
      testsFailed: s.testsFailed + (mood === 'test' && isFailed ? 1 : 0),
    }))
    if (mood === 'test') {
      await update($, storm, was =>
        isFailed ? { isRaining: true, changedAt: now } : was.isRaining ? { isRaining: false, changedAt: now } : was,
      )
    }

    return ran
  })

  // Every prompt reports the permission mode; keep the latest.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    permissionMode = e.permission_mode ?? permissionMode
    return next(e)
  })

  // A permission prompt holds the call until the person answers; the call's
  // end (or a denial) closes it.
  on('classic.PermissionRequest', async ($, e, next) => {
    isAskingPermission = true
    await settle($)
    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    isAskingPermission = false
    await settle($)
    return next(e)
  })

  // A press on a pet's star: that pet plays up for a few seconds.
  on('ui.press', async ($, e, next) => {
    if (e.plugin === $.plugin.name && e.element.startsWith('tap-')) {
      const pet = e.element.slice(4) as PetId
      const at = await $.clock.now()
      await update($, poke, () => ({ pet, at }))
    }
    return next(e)
  })

  // Each request a subagent makes: its young one is born on the first.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      const was = await read($, litter)
      const kids = born(was.kids, agentId, now)
      if (kids !== was.kids) await update($, litter, () => ({ kids: [...kids] }))
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      await update($, litter, was => ({ kids: [...asleep(was.kids, now, kid => kid.id === agentId)] }))
    }
    if (e.agentId === undefined) {
      const edits = pendingEdits
      const isAnswer = e.reason === 'answer'
      const now = await $.clock.now()
      pendingEdits = 0
      inFlight.clear()
      isAskingPermission = false
      generation += 1
      await update($, tally, t => ({
        edits: t.edits + edits,
        answers: t.answers + (isAnswer ? 1 : 0),
        prevEdits: t.edits,
        prevAnswers: t.answers,
        answeredAt: isAnswer ? now : t.answeredAt,
      }))
      await update($, stats, s => ({
        ...s,
        answers: s.answers + (isAnswer ? 1 : 0),
        busyMs: s.busyMs + e.durationMs,
        longestTurnMs: Math.max(s.longestTurnMs, e.durationMs),
      }))
      await show($, 'think')
      // No agent outlives the turn it was asked in; any young one still up
      // goes to sleep with it.
      await update($, litter, was => (was.kids.some(kid => kid.sleptAt === null) ? { kids: [...asleep(was.kids, now, () => true)] } : was))
    }

    return next(e)
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'wrapped' } }, async ($, e, next) => {
    const card = await read($, wrapped)
    const elements = $.ui.resolve(e)
    if (card === null || !('Svg' in elements)) {
      return next(e)
    }

    const { Box, Svg, Text } = elements
    return (
      <Box flexDirection="column" gap={1}>
        <Svg source={card.svg} alt={card.text} />
        <Text dimColor>{card.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const elements = $.ui.resolve(e)
    if (!('Svg' in elements)) {
      return next(e)
    }

    const { Box, Button, Svg } = elements
    const now = await $.clock.now()
    const t = await read($, tally)
    const p = await read($, playing)
    const s = await read($, storm)
    const k = await read($, poke)
    const l = await read($, litter)
    const activity = p !== null && now - p.at < ACTIVITY_SECONDS * 1000 ? p.kind : null
    const mode: Mode = e.props.isWorking ? 'working' : now - t.answeredAt < CHEER_MS ? 'cheer' : 'idle'
    const weather: Weather = s.isRaining ? 'rain' : now - s.changedAt < CLEARING_MS ? 'clearing' : 'clear'
    const input: { -readonly [K in keyof SceneInput]: SceneInput[K] } = {
      mode,
      scene: await read($, scene),
      activity,
      phase: phaseAt(new Date(now).getHours()),
      weather,
      width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(e.props.bodyColumns * CELL_PX))),
      ...growthOf(t),
      poke: k !== null && now - k.at < POKE_SECONDS * 1000 ? { pet: k.pet, agoSeconds: (now - k.at) / 1000 } : null,
      elapsedSeconds: 0,
      from: {},
      kids: l.kids.slice(0, MAX_KIDS).map(kid => ({
        parent: kid.parent,
        bornSecondsAgo: (now - kid.bornAt) / 1000,
        sleptSecondsAgo: kid.sleptAt === null ? null : (now - kid.sleptAt) / 1000,
      })),
    }
    const key = [mode, input.scene, activity, input.phase, weather, input.width, input.sprouts, input.freshSprouts, input.stars, input.isStarFresh].join('|')
    if (key !== sceneKey) {
      // Where the old scene's pets are at this moment is where the new one
      // picks them up; a width change relays out, so they start afresh.
      sceneFrom = lastInput !== null && lastInput.width === input.width ? framesAt(lastInput, (now - sceneStartedAt) / 1000) : {}
      sceneKey = key
      sceneStartedAt = now
    }
    input.elapsedSeconds = (now - sceneStartedAt) / 1000
    input.from = sceneFrom
    lastInput = input

    const start = async (kind: Activity) => {
      const at = await $.clock.now()
      await update($, playing, () => ({ kind, at }))
      $.clock.after(ACTIVITY_SECONDS * 1000 + 100, () => {
        void update($, playing, current => (current?.at === at ? null : current))
      })
    }

    // Other mods' bands (a cache meter, say) draw beneath the pets, in rows
    // under them, since the band holds one tree. With nothing beneath (a
    // test harness, a surface with no core drawing) there is no row.
    const beneath = await next(e).catch(() => undefined)

    return (
      <Box flexDirection="column">
        <Svg source={petsScene(input)} alt={petsAlt(input)} />
        {/* A dim star under each pet: its tap target. The desktop passes
            presses to Buttons, and to nothing else on the band. */}
        {(Object.keys(PET_HOMES) as PetId[]).map(pet => (
          <Box key={`at-${pet}`} position="absolute" top={2} left={Math.round(PET_HOMES[pet] * e.props.bodyColumns) - 1}>
            <Button key={`tap-${pet}`} label="✦" plain dimColor onPress={() => {}} />
          </Box>
        ))}
        <Box position="absolute" top={0} right={0} flexDirection="row" gap={1}>
          {ACTIVITIES.map(({ kind, label }) => (
            <Button key={kind} label={label} dimColor onPress={() => start(kind)} />
          ))}
        </Box>
        {beneath}
      </Box>
    )
  })
}
