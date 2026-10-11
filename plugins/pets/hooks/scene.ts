// The pets band as one self-contained SVG in the Zo midnight style: four
// jointed, line-drawn pets on a faint number line, a sky of star points, and
// a constellation the session draws one answer at a time. While Claude works
// the pets act out what it is doing; they panic at risky commands, lean in
// when you are asked something, and a rain cloud hangs over failing tests.
// Bodies move through their joints (rig.ts) and each pet's motions live in
// its own file; this file casts them per scene, stacks them per pet, and
// keeps every prop a pet touches on that pet's body. CSS animations only, so
// the drawing plays as an image: the caller names the scene and it plays
// from t = 0.

import { COLORS, at, book, flask, lantern, rainCloud, sparkle } from './art'
import type { Point } from './art'
import {
  RESTING_SECONDS,
  bunnyAlarmed,
  bunnyAsleep,
  bunnyBinky,
  bunnyCounting,
  bunnyEating,
  bunnyGoing,
  bunnyLooking,
  bunnyPeering,
  bunnyPlanting,
  bunnyPlayed,
  bunnyResting,
  bunnyRig,
  bunnyStill,
} from './bunny'
import {
  HUNT_SECONDS,
  READING_SECONDS,
  SITTING_SECONDS,
  catAsleep,
  catEating,
  catGoing,
  catHunt,
  catLookingAhead,
  catPeering,
  catPlayed,
  catReading,
  catRig,
  catSitting,
  catStartled,
  catStill,
} from './cat'
import {
  POTTERING_SECONDS,
  chickAsleep,
  chickBolting,
  chickEating,
  chickFlying,
  chickFollowing,
  chickGoing,
  chickHopping,
  chickLeaning,
  chickPeering,
  chickPlayed,
  chickPottering,
  chickRig,
  chickStill,
} from './chick'
import {
  CARRY,
  DIGGING_SECONDS,
  SNIFFING_SECONDS,
  STANDING_SECONDS,
  dogAsleep,
  dogDigging,
  dogEating,
  dogFrightened,
  dogGoing,
  dogLookingAhead,
  dogPeering,
  dogPlayed,
  dogRig,
  dogSniffing,
  dogStanding,
  dogStill,
  fetching,
} from './dog'
import type { Fetch } from './dog'
import type { Mood } from './mood'
import { paletteOf } from './palette'
import { drawRig, jumping, mixFrames, pathKeys, pointOn, smooth, span, track, v } from './rig'
import type { Frame, Rig, Timing, Vec } from './rig'

export type Mode = 'idle' | 'cheer' | 'working'
export type Activity = 'feed' | 'play' | 'dance'
export type Phase = 'day' | 'dusk' | 'night'
export type Weather = 'clear' | 'rain' | 'clearing'
// What the pets act out while Claude works: its mood, or a risky command.
export type Scene = Mood | 'danger'

export type SceneInput = {
  readonly mode: Mode
  readonly scene: Scene
  readonly activity: Activity | null
  readonly phase: Phase
  readonly weather: Weather
  // CSS pixels across the band; the drawing is 1:1, so lines stay crisp.
  readonly width: number
  // File edits this session: sprouts along the number line.
  readonly sprouts: number
  readonly freshSprouts: number
  // Answered turns this session: stars of the constellation.
  readonly stars: number
  readonly isStarFresh: boolean
  // A pet the person tapped, and how long ago: it plays up, whatever else
  // is on, for POKE_SECONDS from the tap.
  readonly poke: { readonly pet: PetId; readonly agoSeconds: number } | null
  // How long this scene has been on, so a redraw resumes every motion where
  // it was: the band is redrawn for many reasons (other mods, the app), and
  // the desktop restarts a drawing's animations on each.
  readonly elapsedSeconds: number
  // Where each pet was (its own frame: position along its facing, pose) when
  // this scene began, from the scene before; the pets carry on from there,
  // walking, hopping or running to wherever the new scene starts them.
  readonly from: Readonly<Partial<Record<PetId, Frame>>>
  // The pets' young, one per subagent: whose it is, how long ago it was born,
  // and how long ago its agent finished (it sleeps from then), or null while
  // the agent works. Times are from now, not the scene, since a young one
  // outlives scenes.
  readonly kids: readonly { readonly parent: PetId; readonly bornSecondsAgo: number; readonly sleptSecondsAgo: number | null }[]
}

export const MAX_KIDS = 4

// The input a scene is built from: the caller's, plus how long the pets'
// moves into this scene take, which every delay in it waits for, and how
// far the drawing has had to economise to fit the desktop's size limit.
type Scene_ = SceneInput & { readonly leadSeconds: number; readonly economy: number }

export const ACTIVITY_SECONDS = 12
export const MAX_SPROUTS = 8
export const SCENE_HEIGHT = 64

const GROUND = 56
const TICK = 32
// The star ball's radius: it rests with its centre this far above the ground.
const BALL = 2.6

export const phaseAt = (hour: number): Phase =>
  hour >= 19 || hour < 6 ? 'night' : hour >= 17 || hour < 7 ? 'dusk' : 'day'

// A winding asterism in the upper left; each answered turn lights one more.
export const CONSTELLATION: readonly Point[] = [
  [0.0, 0.7],
  [0.11, 0.42],
  [0.25, 0.55],
  [0.37, 0.22],
  [0.52, 0.34],
  [0.63, 0.06],
  [0.78, 0.26],
  [0.7, 0.6],
  [0.88, 0.78],
  [1.0, 0.48],
]
export const CONSTELLATION_SIZE = CONSTELLATION.length

export type PetId = 'chk' | 'bun' | 'cat' | 'dog'
// Also the drawing order, back to front.
const PET_IDS: readonly PetId[] = ['chk', 'bun', 'cat', 'dog']

type Layout = {
  readonly width: number
  readonly x: Readonly<Record<PetId, number>>
  readonly moon: number
  readonly ticks: readonly number[]
  readonly stars: readonly Point[]
}

// Where each pet lives, as a fraction of the band's width: spread out, so
// their walks and hops cover ground, the constellation's corner left clear.
const HOME: Readonly<Record<PetId, number>> = { chk: 0.3, bun: 0.37, cat: 0.66, dog: 0.8 }
export const PET_HOMES = HOME

const layoutFor = (width: number): Layout => {
  const f = (k: number) => Math.round(width * k)
  const left = width * 0.04
  const span = width * 0.23
  return {
    width,
    x: { chk: f(HOME.chk), bun: f(HOME.bun), cat: f(HOME.cat), dog: f(HOME.dog) },
    moon: f(0.33),
    ticks: Array.from({ length: Math.floor((width - 24) / TICK) + 1 }, (_, i) => 16 + i * TICK),
    stars: CONSTELLATION.map(([u, v]) => [Math.round(left + u * span), Math.round(7 + v * 27)] as const),
  }
}

// Deterministic scatter, so a redraw of the same scene is the same picture.
const scatter = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const f1 = (n: number) => String(Math.round(n * 10) / 10)

// An animation delay of `seconds` into the scene, as CSS: less the time the
// scene has already run, so a redraw picks the animation up mid-way.
const delayOf = (input: Scene_, seconds = 0) => `${f1(seconds + input.leadSeconds - input.elapsedSeconds)}s`

// ------------------------------------------------------------------- pets

type Motion = (t: number) => Frame

type PetSpec = {
  readonly rig: Rig
  readonly color: string
  // Pets are drawn facing right; these face the others from the right.
  readonly isFacingLeft: boolean
  // Standing, to jump and dance from; and asleep, to nap into.
  readonly still: Frame
  readonly asleep: Frame
  readonly jump: number
  // What it does when nothing is asked of it: a seamless loop.
  readonly potter: { readonly motion: Motion; readonly seconds: number }
  readonly settleSeconds: number
  // When it naps, by day; sooner as night comes.
  readonly napAt: number
}

const SPECS: Readonly<Record<PetId, PetSpec>> = {
  chk: {
    rig: chickRig, color: COLORS.starlight, isFacingLeft: false, still: chickStill(), asleep: chickAsleep(), jump: 9,
    potter: { motion: chickPottering, seconds: POTTERING_SECONDS }, settleSeconds: 1, napAt: 22,
  },
  bun: {
    rig: bunnyRig, color: COLORS.cyan, isFacingLeft: false, still: bunnyStill(), asleep: bunnyAsleep(), jump: 14,
    potter: { motion: bunnyResting, seconds: RESTING_SECONDS }, settleSeconds: 1.2, napAt: 27,
  },
  cat: {
    rig: catRig, color: COLORS.coral, isFacingLeft: true, still: catStill(), asleep: catAsleep(), jump: 12,
    potter: { motion: catSitting, seconds: SITTING_SECONDS }, settleSeconds: 1.4, napAt: 18,
  },
  dog: {
    rig: dogRig, color: COLORS.teal, isFacingLeft: true, still: dogStill(), asleep: dogAsleep(), jump: 12,
    potter: { motion: dogStanding, seconds: STANDING_SECONDS }, settleSeconds: 1.6, napAt: 32,
  },
}

// One motion a pet plays and how; a pet's plays stack, a later one winning
// while it runs. `name` names its keyframes.
type Play = Timing & { readonly name: string; readonly motion: Motion }

const loop = (name: string, motion: Motion, seconds: number, delay = 0): Play => ({ name, motion, seconds, delay, isLooping: true })
const once = (name: string, motion: Motion, seconds: number, delay = 0, fill = 'both'): Play => ({ name, motion, seconds, delay, isLooping: false, fill })

// A move into a held state (a lean, a turn to look): played once over
// `lead` s, then its continuation loops, so the pet stays alive in it. The
// motion must repeat every `period` s after `lead`.
const leadIn = (name: string, motion: Motion, lead: number, period: number): Play[] => [
  once(name, motion, lead),
  loop(`${name}On`, t => motion(lead + t), period, lead),
]

// Potter loops are long and run in every scene, so they take slightly
// coarser keys than a scene's own motion.
const POTTER_COARSENESS = 1.3
const POTTER_SAMPLES = 12
const potter = (id: PetId): Play[] => [{ ...loop(`${id}Potter`, SPECS[id].potter.motion, SPECS[id].potter.seconds), coarseness: POTTER_COARSENESS, samplesPerSecond: POTTER_SAMPLES }]
const pottering = (): Record<PetId, Play[]> => ({ chk: potter('chk'), bun: potter('bun'), cat: potter('cat'), dog: potter('dog') })

// The cheer after an answer: each pet goes up in turn.
const CHEER_SECONDS = 2.6
const cheerDelay = (id: PetId) => 0.8 + PET_IDS.indexOf(id) * 0.12

// From wherever it is, up to standing, a real jump (sink, spring, tuck the
// feet, land absorbing it), and back.
const cheering = (id: PetId): Motion => {
  const spec = SPECS[id]
  const awake = spec.potter.motion(0)
  const delay = cheerDelay(id)
  return t => {
    if (t < delay + 0.35) return mixFrames(awake, spec.still, smooth(span(t, delay, delay + 0.35)))
    if (t < delay + 1.05) return jumping(spec.still, span(t, delay + 0.35, delay + 1.05), spec.jump)
    return mixFrames(spec.still, awake, smooth(span(t, delay + 1.05, delay + 1.4)))
  }
}

// When a resting pet settles for its nap: a whole number of its potter
// loops in, so the loop is exactly at its start when the settle takes over.
const napLoops = (id: PetId, input: SceneInput) => {
  const spec = SPECS[id]
  const scale = input.phase === 'day' ? 1 : input.phase === 'dusk' ? 0.6 : 0.3
  return Math.max(1, Math.round((spec.napAt * scale) / spec.potter.seconds))
}
const napsAt = (id: PetId, input: SceneInput) => (input.mode === 'cheer' ? CHEER_SECONDS : 0) + napLoops(id, input) * SPECS[id].potter.seconds

// When a resting band is still: a while after the last pet has settled, every
// animation has run its course, and the drawing costs nothing more to show.
const QUIET_AFTER = 24
const quietAt = (input: SceneInput) => Math.max(...PET_IDS.map(id => napsAt(id, input) + SPECS[id].settleSeconds)) + QUIET_AFTER

// Runs of an animation of `seconds` starting at `delay` that end by `by`.
const runsUntil = (by: number, seconds: number, delay = 0) => Math.max(1, Math.ceil((by - delay) / seconds))

// Resting: pottering on a loop, then settling to sleep where it is; after a
// cheer the pottering starts once the jump is done.
const resting = (id: PetId, input: SceneInput): Play[] => {
  const spec = SPECS[id]
  const awake = spec.potter.motion(0)
  const plays: Play[] = []
  // Nothing plays under the cheer (the potter waits for it) or under the
  // settle (the potter has ended), so neither needs every bone's channel.
  if (input.mode === 'cheer') plays.push({ ...once(`${id}Cheer`, cheering(id), CHEER_SECONDS, 0, 'none'), samplesPerSecond: 12 })
  // The potter plays exactly until the settle takes over, then stops.
  plays.push({ ...loop(`${id}Potter`, spec.potter.motion, spec.potter.seconds, input.mode === 'cheer' ? CHEER_SECONDS : 0), count: napLoops(id, input), coarseness: POTTER_COARSENESS, samplesPerSecond: POTTER_SAMPLES })
  const settle = (t: number) => mixFrames(awake, spec.asleep, smooth(t / spec.settleSeconds))
  plays.push(once(`${id}Settle`, settle, spec.settleSeconds, napsAt(id, input), 'forwards'))
  return plays
}

// What a tapped pet does, over the top of whatever it was doing.
export const POKE_SECONDS = 3.2
const POKES: Readonly<Record<PetId, Motion>> = { chk: chickPlayed, bun: bunnyPlayed, cat: catPlayed, dog: dogPlayed }

// A little dance: a bounce on every beat, a sway every other.
const dancing = (id: PetId): Motion => t => {
  const jumped = jumping(SPECS[id].still, (t % 0.5) / 0.5, 3.5)
  return { ...jumped, bones: { ...jumped.bones, b: (jumped.bones.b ?? 0) + 6 * Math.sin(2 * Math.PI * t) } }
}

// The dog's fetches: for an agent it runs off the band's right edge for the
// star; in a game it watches a star fall, then runs for it.
const agentFetch = (layout: Layout) => fetching(layout.width - layout.x.dog + 40, 0.2)
const PLAY_DISTANCE = 130
const playFetch = () => fetching(PLAY_DISTANCE, 1.3)

// The bunny's count along the number line: three ticks out and back.
const COUNTING_SECONDS = 8.4

// Every pet's plays for the scene, a tapped pet's reaction on top of its own.
const playsFor = (input: SceneInput, layout: Layout): Readonly<Record<PetId, Play[]>> => {
  const plays = { ...scenePlays(input, layout) }
  if (input.poke !== null && input.poke.agoSeconds < POKE_SECONDS) {
    const { pet, agoSeconds } = input.poke
    // Started `agoSeconds` back, so a redraw mid-reaction picks it up there.
    plays[pet] = [...plays[pet], { ...once(`${pet}Poke`, POKES[pet], POKE_SECONDS, -agoSeconds, 'none'), keepsStill: true, samplesPerSecond: 12 }]
  }
  return plays
}

const scenePlays = (input: SceneInput, layout: Layout): Readonly<Record<PetId, Play[]>> => {
  if (input.activity === 'feed') {
    return {
      chk: [loop('chkEat', chickEating, 1.6)],
      bun: [loop('bunEat', bunnyEating, 1.4)],
      cat: [loop('catEat', catEating, 1.6)],
      dog: [loop('dogEat', dogEating, 1.5)],
    }
  }
  if (input.activity === 'play') {
    const fetch = playFetch()
    return {
      chk: [loop('chkHop', chickHopping, 0.45)],
      bun: [loop('bunBinky', bunnyBinky(1.3), 1.3)],
      cat: [loop('catHunt', catHunt, HUNT_SECONDS)],
      dog: [loop('dogPlay', fetch.motion, fetch.seconds)],
    }
  }
  if (input.activity === 'dance') {
    return {
      chk: [loop('chkDance', dancing('chk'), 1)],
      bun: [loop('bunDance', dancing('bun'), 1, -0.06)],
      cat: [loop('catDance', dancing('cat'), 1, -0.12)],
      dog: [loop('dogDance', dancing('dog'), 1, -0.18)],
    }
  }
  if (input.mode !== 'working') {
    return { chk: resting('chk', input), bun: resting('bun', input), cat: resting('cat', input), dog: resting('dog', input) }
  }
  switch (input.scene) {
    // Thinking: the bunny counts hops along the number line with the chick
    // hurrying after, the cat stalks and pounces at a firefly, the dog sniffs.
    case 'think':
      return {
        chk: [loop('chkRun', chickFollowing(TICK, COUNTING_SECONDS), COUNTING_SECONDS)],
        bun: [loop('bunHop', bunnyCounting(TICK, COUNTING_SECONDS), COUNTING_SECONDS)],
        cat: [loop('catHunt', catHunt, HUNT_SECONDS)],
        dog: [loop('dogSniff', dogSniffing, SNIFFING_SECONDS)],
      }
    case 'read':
      return { ...pottering(), cat: [loop('catRead', catReading, READING_SECONDS)] }
    case 'edit':
      return { ...pottering(), bun: [loop('bunPlant', bunnyPlanting(TICK, 5.4), 5.4)] }
    case 'run':
      return { ...pottering(), dog: [loop('dogDig', dogDigging, DIGGING_SECONDS)] }
    case 'test':
      return { ...pottering(), chk: [loop('chkPeer', chickPeering, 4.2)] }
    // Browsing: the chick flies up to look far ahead; the others turn to look.
    case 'web':
      return {
        chk: [loop('chkFly', chickFlying, 5.4)],
        bun: leadIn('bunLook', bunnyLooking, 0.9, 3),
        cat: leadIn('catLook', catLookingAhead, 0.6, 6),
        dog: leadIn('dogLook', dogLookingAhead, 0.6, 2.5),
      }
    case 'agent': {
      const fetch = agentFetch(layout)
      return { ...pottering(), dog: [loop('dogFetch', fetch.motion, fetch.seconds)] }
    }
    // Waiting on you: everyone leans in toward the prompt.
    case 'wait':
      return {
        chk: [once('chkLean', chickLeaning, 0.8)],
        bun: leadIn('bunPeer', bunnyPeering, 0.8, 2.4),
        cat: leadIn('catPeer', catPeering, 0.8, 2.4),
        dog: leadIn('dogPeer', dogPeering, 0.8, 2.5),
      }
    // A risky command: the chick bolts, the bunny freezes flat and thumps,
    // the cat arches and backs off, the dog cowers; then they shiver.
    case 'danger':
      return {
        chk: [once('chkBolt', chickBolting, 1.6)],
        bun: [once('bunAlarm', bunnyAlarmed, 1.6)],
        cat: [once('catStartle', catStartled, 1.4)],
        dog: [once('dogCower', dogFrightened, 1.5)],
      }
  }
}

// A pet at home on the ground, facing its way: travel (`-mv`) and facing
// (`-fc`) from its motions, and a wrapper (`-br`) for breathing and shivers.
const petMarkup = (id: PetId, layout: Layout, local: string) => {
  const spec = SPECS[id]
  const drawn = drawRig(spec.rig, paletteOf(spec.color))
  return {
    defs: drawn.defs,
    css: `${drawn.css}@media (prefers-color-scheme: light){${drawn.lightCss}}`,
    body: at(
      [layout.x[id], GROUND],
      `<g transform="scale(${spec.isFacingLeft ? -1 : 1} 1)"><g class="${id}-mv"><g class="${id}-fc"><g class="${id}-br">` +
        drawn.body +
        local +
        `</g></g></g></g>`,
    ),
  }
}

// Where a point on a pet's body is on the band, at a frame of its motion.
const onBand = (id: PetId, layout: Layout, frame: Frame, bone: string, point: Vec): Vec => {
  const p = pointOn(SPECS[id].rig, frame, bone, point)
  return v(layout.x[id] + (SPECS[id].isFacingLeft ? -p.x : p.x), GROUND + p.y)
}

// ---------------------------------------------------------------- the young

const KID_SCALE = 0.55
// Where a young one stands, from its parent's spot: in front of it.
const KID_AT: Readonly<Record<PetId, number>> = { chk: 20, bun: 24, cat: -24, dog: -27 }
const kidClass = (parent: PetId) => `kid-${parent}`

// A young one is its parent's rig drawn small beside it, in the same bone
// groups, so it copies every move its parent makes, learning the trade; its
// own wrapper carries its birth, and when it sleeps its bones get rules of
// their own that beat the parent's. Its size is a transform attribute, which
// an animated `scale` (its breathing) multiplies instead of replacing.
const kidMarkup = (parent: PetId, layout: Layout) => {
  const spec = SPECS[parent]
  const drawn = drawRig(spec.rig, paletteOf(spec.color))
  const cls = kidClass(parent)
  return at(
    [layout.x[parent] + KID_AT[parent], GROUND],
    `<g transform="scale(${spec.isFacingLeft ? -1 : 1} 1)"><g class="${cls}-in"><g class="${cls}" transform="scale(${KID_SCALE})"><g class="${cls}-mv"><g class="${cls}-fc">` +
      drawn.body +
      `</g></g></g></g></g>`,
  )
}

// The young ones' own animation: each is born with a pop and a burst of star
// points; one whose agent has finished settles down to sleep where it is,
// from whatever its parent was doing at that moment, and snores a while.
const KID_SETTLE = 1.3
const kidsCss = (input: Scene_, plays: Readonly<Record<PetId, Play[]>>) => {
  const css: string[] = []
  const animations = new Map<string, string[]>()
  for (const kid of input.kids) {
    const cls = kidClass(kid.parent)
    css.push(`.${cls}-in{animation:kidBorn .8s cubic-bezier(.3,1.6,.5,1) ${f1(-kid.bornSecondsAgo)}s both}`)
    for (const k of [0, 1, 2, 3, 4, 5]) {
      const a = (k / 6) * Math.PI * 2
      css.push(
        `.burst-${cls}.b${k}{animation:kb${k} 1s ease-out ${f1(0.2 - kid.bornSecondsAgo)}s both}` +
          `@keyframes kb${k}{0%{opacity:0;translate:0px 0px;scale:.3 .3}25%{opacity:1}100%{opacity:0;translate:${f1(Math.cos(a) * 11)}px ${f1(Math.sin(a) * 8 - 3)}px;scale:1 1}}`,
      )
    }
    if (kid.sleptSecondsAgo === null) continue
    // Scene time of the moment it fell asleep; before this scene, its parent
    // is taken as standing.
    const at = input.elapsedSeconds - kid.sleptSecondsAgo
    const spec = SPECS[kid.parent]
    const was = at >= 0 ? (frameAt(plays[kid.parent], at) ?? spec.still) : spec.still
    const settle = (t: number) => mixFrames({ ...was, x: 0, facing: 1 }, spec.asleep, smooth(t / KID_SETTLE))
    const tracked = track(spec.rig, `${cls}Settle`, settle, { seconds: KID_SETTLE, delay: -kid.sleptSecondsAgo, isLooping: false, fill: 'forwards', keepsStill: true, samplesPerSecond: 12 }, { move: `.${cls}-mv`, face: `.${cls}-fc` })
    css.push(tracked.keyframes)
    for (const [selector, animation] of tracked.entries) {
      const own = selector.startsWith(`.${cls}-`) ? selector : `.${cls} ${selector}`
      animations.set(own, [...(animations.get(own) ?? []), animation])
    }
    const settled = KID_SETTLE - kid.sleptSecondsAgo
    css.push(`.${cls}{animation:breathe 3.6s ease-in-out ${f1(settled)}s 8}`)
    for (const i of [0, 1, 2]) css.push(`.z-${cls}-${i}{animation:zfloat 3.3s ease-out ${f1(settled + 0.6 + i * 1.1)}s 3 backwards}`)
  }
  css.push([...animations].map(([selector, list]) => `${selector}{animation:${list.join(',')}}`).join(''))
  return css.join('')
}

const kidsExtras = (input: Scene_, layout: Layout) =>
  input.kids
    .map(kid => {
      const x = layout.x[kid.parent] + KID_AT[kid.parent]
      const cls = kidClass(kid.parent)
      return burst([x, GROUND - 10], cls) + (kid.sleptSecondsAgo !== null ? snores([x + (SPECS[kid.parent].isFacingLeft ? -8 : 4), GROUND - 14], cls) : '')
    })
    .join('')

// ------------------------------------------------------------- the star ball

const starBall = `<circle r="4.4" fill="${COLORS.gold}" fill-opacity=".18"/><circle r="2.4" fill="${COLORS.gold}"/>`

// Where the ball is through a fetch: arriving by `arrival` (or already where
// the dog takes it up), carried on the dog's head from `pick`, then dropped
// at `drop` with a small bounce.
const ballPath = (fetch: Fetch, layout: Layout, arrival: ((t: number) => Vec) | null) => {
  const carried = (t: number) => onBand('dog', layout, fetch.motion(t), 'h', CARRY)
  const taken = carried(fetch.pick)
  const released = carried(fetch.drop)
  const ground = GROUND - BALL
  return (t: number): Vec => {
    if (t < fetch.pick) return arrival === null ? taken : arrival(t)
    if (t < fetch.drop) return carried(t)
    const s = t - fetch.drop
    if (s < 0.25) return v(released.x - 2 * (s / 0.25), released.y + (ground - released.y) * (s / 0.25) ** 2)
    if (s < 0.5) return v(released.x - 2 - 2 * span(s, 0.25, 0.5), ground - 3 * Math.sin(Math.PI * span(s, 0.25, 0.5)))
    return v(released.x - 4, ground)
  }
}

// A star falling from the sky to land and settle at `to`: a drop, two
// bounces, still by 1.3 s.
const fallingStar = (to: Vec) => (t: number): Vec => {
  const ground = GROUND - BALL
  if (t < 0.6) return v(to.x - 34 + 26 * (t / 0.6), -10 + (ground + 10) * (t / 0.6) ** 2)
  if (t < 1) return v(to.x - 8 + 5 * span(t, 0.6, 1), ground - 8 * Math.sin(Math.PI * span(t, 0.6, 1)))
  if (t < 1.3) return v(to.x - 3 + 3 * span(t, 1, 1.3), ground - 3 * Math.sin(Math.PI * span(t, 1, 1.3)))
  return v(to.x, ground)
}

// The ball's markup and CSS: `cls-x` carries it along its path, `cls-y`
// shows it from `shownAt` and twinkles it out once the dog has set it down.
const ballOf = (input: Scene_, cls: string, fetch: Fetch, path: (t: number) => Vec, shownAt: number) => {
  const pct = (t: number) => f1((t / fetch.seconds) * 100)
  const out = fetch.seconds - 0.6
  return {
    markup: `<g class="${cls}-x"><g class="${cls}-y">${starBall}</g></g>`,
    css:
      pathKeys(`${cls}X`, fetch.seconds, path) +
      `@keyframes ${cls}Y{0%{opacity:${shownAt > 0 ? 0 : 1}}` +
      (shownAt > 0 ? `${pct(shownAt)}%{opacity:0}${pct(shownAt + 0.05)}%{opacity:1}` : '') +
      `${pct(out)}%{opacity:1;scale:1 1}${pct(out + 0.25)}%{opacity:1;scale:1.7 1.7}${pct(out + 0.5)}%,100%{opacity:0;scale:.3 .3}}` +
      `.${cls}-x{animation:${cls}X ${fetch.seconds}s linear ${delayOf(input)} infinite}.${cls}-y{animation:${cls}Y ${fetch.seconds}s linear ${delayOf(input)} infinite}`,
  }
}

// The star ball, when a scene has one: fetched by the dog off the band's
// edge for an agent, or fallen from the sky for a game.
const ballFor = (input: Scene_, layout: Layout) => {
  if (input.activity === 'play') {
    const fetch = playFetch()
    const landing = onBand('dog', layout, fetch.motion(fetch.pick), 'h', CARRY)
    return ballOf(input, 'ball', fetch, ballPath(fetch, layout, fallingStar(v(landing.x, GROUND - BALL))), 0)
  }
  if (input.mode === 'working' && input.activity === null && input.scene === 'agent') {
    const fetch = agentFetch(layout)
    return ballOf(input, 'fetch', fetch, ballPath(fetch, layout, null), fetch.pick)
  }
  return null
}

// --------------------------------------------------------------- props

// Star dust the dog kicks back between its legs while digging, in its frame.
const digDust =
  `<g class="dust-gate">` +
  at(
    [12, -1],
    [COLORS.gold, COLORS.teal, COLORS.starlight, COLORS.gold, COLORS.teal]
      .map((color, i) => `<g class="dust-x dust-${i}"><g class="dust-y dust-${i}">${sparkle([0, 0], 1.6 + (i % 2) * 0.6, color)}</g></g>`)
      .join(''),
  ) +
  `</g>`

// A sprout, drawn once in the defs with its base at the origin: the stem
// and two leaves. Each tick's sprout is a reference to it.
const leaf = (dx: number, dy: number) =>
  `<path d="M0,${-dy} C${dx * 2.6},${-dy - 0.8} ${dx * 3.6},${-dy - 3} ${dx * 3.4},${-dy - 4} C${dx * 1.6},${-dy - 3.6} ${dx * 0.4},${-dy - 2.2} 0,${-dy} Z" ` +
  `fill="${COLORS.teal}" fill-opacity=".35" stroke="${COLORS.teal}" stroke-width=".9"/>`
const SPROUT_DEF =
  `<g id="sprout"><path class="stem" pathLength="1" d="M0,-2 C0,-5 0.4,-7 0,-9.4" stroke="${COLORS.teal}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
  leaf(-1, 6.4) +
  leaf(1, 8) +
  `</g>`

// A sprout at `x` on the ground; `cls` animates it about its base.
const sproutMarkup = (x: number, cls: string) =>
  cls === 'sprout' ? `<use href="#sprout" x="${x}" y="${GROUND}"/>` : at([x, GROUND], `<g class="${cls}"><use href="#sprout"/></g>`)

const horizonMarkup = (input: SceneInput, layout: Layout) => {
  // The ticks are one path, except in a dance, where each bounces alone.
  const tick = (x: number) => `M${x},${GROUND - 2}V${GROUND + 2.4}`
  const ticks =
    `<g stroke="${COLORS.starlight}" stroke-opacity=".32" stroke-width="1" stroke-linecap="round">` +
    (input.activity === 'dance'
      ? layout.ticks.map((x, i) => `<path class="tick-${i}" d="${tick(x)}"/>`).join('')
      : `<path d="${layout.ticks.map(tick).join('')}"/>`) +
    `</g>`
  const grown = Math.min(input.sprouts, MAX_SPROUTS)
  const sprouts = layout.ticks
    .slice(0, grown)
    .map((x, i) => sproutMarkup(x, input.mode === 'cheer' && i >= grown - input.freshSprouts ? 'sprout-new' : 'sprout'))
    .join('')
  const glow = (cls: string, color: string) =>
    `<path class="${cls}" d="M${layout.width * 0.04},${GROUND + 0.5} H${layout.width * 0.96}" stroke="${color}" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>`
  const isWorking = input.mode === 'working' && input.activity === null
  return (
    `<path d="M0,${GROUND + 0.5} H${layout.width}" stroke="url(#horizon)" stroke-width="1"/>` +
    (isWorking && input.scene === 'wait' ? glow('glow-wait', COLORS.gold) : '') +
    (isWorking && input.scene === 'danger' ? glow('glow-danger', COLORS.coral) : '') +
    ticks +
    sprouts
  )
}

const skyMarkup = (input: SceneInput, layout: Layout) => {
  const parts: string[] = []
  const lit = Math.min(input.stars, CONSTELLATION_SIZE)
  const stars = layout.stars
  const newest = input.mode === 'cheer' && input.isStarFresh ? lit - 1 : -1
  stars.forEach((point, i) => {
    if (i > 0 && i < lit) {
      const [x0, y0] = stars[i - 1] as Point
      parts.push(
        `<path${i === newest ? ' class="link-new"' : ''} pathLength="1" d="M${x0},${y0} L${point[0]},${point[1]}" ` +
          `stroke="${COLORS.starlight}" stroke-opacity=".34" stroke-width=".8" fill="none"/>`,
      )
    }
  })
  stars.forEach((point, i) => {
    parts.push(
      i < lit
        ? sparkle(point, 2.2, COLORS.gold, i === newest ? 'cstar-new' : `cstar-${i % 3}`)
        : `<circle cx="${point[0]}" cy="${point[1]}" r=".7" fill="${COLORS.starlight}" fill-opacity=".18"/>`,
    )
  })
  const colors = [COLORS.teal, COLORS.gold, COLORS.coral, COLORS.starlight, COLORS.cyan]
  for (let i = 0; i < 9; i++) {
    const x = Math.round(layout.width * (0.36 + scatter(i, 1) * 0.6))
    const y = Math.round(5 + scatter(i, 2) * 24)
    parts.push(sparkle([x, y], 1 + scatter(i, 3) * 1.1, colors[i % colors.length] as string, `sky-${i % 4}`))
  }
  if (input.phase === 'day') {
    parts.push(
      at(
        [layout.moon, 15],
        `<circle r="4.6" fill="none" stroke="${COLORS.gold}" stroke-width="1.2"/><g class="rays">` +
          Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4
            const [x1, y1, x2, y2] = [Math.cos(a) * 7, Math.sin(a) * 7, Math.cos(a) * 9, Math.sin(a) * 9]
            return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}" stroke="${COLORS.gold}" stroke-width="1" stroke-linecap="round"/>`
          }).join('') +
          `</g>`,
      ),
    )
  } else {
    parts.push(
      at(
        [layout.moon, 15],
        `<path d="M2.6,-6 A6.4,6.4 0 1 0 2.6,6 A5,5 0 1 1 2.6,-6 Z" fill="${COLORS.starlight}" fill-opacity=".14" ` +
          `stroke="${COLORS.starlight}" stroke-width="1.1" stroke-linejoin="round"/>`,
      ),
    )
  }
  parts.push(`<g class="shoot"><path d="M0,0 L22,-8" stroke="url(#trail)" stroke-width="1.2" stroke-linecap="round"/>${sparkle([0, 0], 1.6, COLORS.starlight)}</g>`)
  return parts.join('')
}

const snores = (where: Point, id: string) =>
  at(
    where,
    [5.5, 7, 8.5]
      .map(
        (size, i) =>
          `<text class="z z-${id}-${i}" x="${i * 2.2}" y="0" font-size="${size}" ` +
          `font-family="ui-rounded, system-ui, sans-serif" font-weight="700" fill="${COLORS.starlight}">z</text>`,
      )
      .join(''),
  )

const burst = (where: Point, id: string) =>
  at(
    where,
    [COLORS.gold, COLORS.starlight, COLORS.gold, COLORS.teal, COLORS.gold, COLORS.coral]
      .map((color, i) => `<g class="burst burst-${id} b${i}">${sparkle([0, 0], 1.8, color)}</g>`)
      .join(''),
  )

const HEART = 'M0,2.6 C-4.4,-0.6 -4.2,-4.6 -1.9,-4.6 C-0.9,-4.6 -0.2,-4 0,-3.3 C0.2,-4 0.9,-4.6 1.9,-4.6 C4.2,-4.6 4.4,-0.6 0,2.6 Z'

const heart = (where: Point, cls: string) =>
  at(where, `<g class="lift ${cls}"><path d="${HEART}" fill="${COLORS.coral}" fill-opacity=".25" stroke="${COLORS.coral}" stroke-width="1"/></g>`)

const bowl = (where: Point, food: string) =>
  at(
    where,
    `<g class="bowl"><path d="M-6,-4 L6,-4 L4.6,0 L-4.6,0 Z" fill="${COLORS.cyan}" fill-opacity=".18" stroke="${COLORS.cyan}" stroke-width="1" stroke-linejoin="round"/>` +
      [-3, 0, 3].map(x => `<circle cx="${x}" cy="-5.2" r="1.1" fill="${food}"/>`).join('') +
      `</g>`,
  )

const note = (where: Point, i: number) =>
  at(
    where,
    `<g class="note note-${i}"><path d="M0,0 V-7 L4.4,-8.2 V-1.4" stroke="${COLORS.starlight}" stroke-width="1" fill="none"/>` +
      `<ellipse cx="-1.2" cy="0.2" rx="1.6" ry="1.2" fill="${COLORS.starlight}"/><ellipse cx="3.2" cy="-1.2" rx="1.6" ry="1.2" fill="${COLORS.starlight}"/></g>`,
  )

// Where the seedling comes up: just clear of the nose of the bunny digging
// one tick along, so its body never hides it.
const seedAt = (layout: Layout) => layout.x.bun + TICK + 20

const extrasMarkup = (input: SceneInput, layout: Layout) => {
  const x = layout.x
  const parts: string[] = []
  const isResting = input.mode !== 'working' && input.activity === null
  const scene = input.mode === 'working' && input.activity === null ? input.scene : null
  if (scene === 'think') parts.push(at([x.cat - 40, GROUND - 16], `<g class="firefly"><circle r="3.4" fill="${COLORS.gold}" fill-opacity=".2"/><circle r="1.3" fill="${COLORS.gold}"/></g>`))
  if (scene === 'read') parts.push(at([x.cat - 20, GROUND], book()), at([x.cat - 36, GROUND], lantern()))
  if (scene === 'edit') {
    parts.push(
      at([seedAt(layout), GROUND], `<g class="seedling"><use href="#sprout"/></g>`),
      at([seedAt(layout), GROUND - 8], `<g class="seed-spark-x"><g class="seed-spark-y">${sparkle([0, 0], 2.4, COLORS.gold)}</g></g>`),
    )
  }
  if (scene === 'test') parts.push(at([x.chk + 15, GROUND], flask()))
  if (scene === 'wait') parts.push(at([Math.round(layout.width * 0.52), 13], `<g class="wait-star">${sparkle([0, 0], 4.2, COLORS.gold)}</g>`))
  if (isResting) {
    parts.push(
      snores([x.chk + 6, GROUND - 16], 'chk'),
      snores([x.bun + 10, GROUND - 26], 'bun'),
      snores([x.cat - 22, GROUND - 22], 'cat'),
      snores([x.dog - 30, GROUND - 20], 'dog'),
    )
  }
  if (input.mode === 'cheer' && input.activity === null) {
    parts.push(
      burst([x.chk + 4, GROUND - 22], 'chk'),
      burst([x.bun + 8, GROUND - 34], 'bun'),
      burst([x.cat - 16, GROUND - 38], 'cat'),
      burst([x.dog - 18, GROUND - 40], 'dog'),
    )
  }
  if (input.activity === 'feed') {
    parts.push(
      bowl([x.chk + 11, GROUND], COLORS.gold),
      bowl([x.bun + 15, GROUND], COLORS.coral),
      bowl([x.cat - 22, GROUND], COLORS.cyan),
      bowl([x.dog - 30, GROUND], COLORS.starlight),
      heart([x.chk + 2, GROUND - 24], 'h0'),
      heart([x.bun + 6, GROUND - 42], 'h1'),
      heart([x.cat - 10, GROUND - 40], 'h2'),
      heart([x.dog - 16, GROUND - 42], 'h3'),
    )
  }
  if (input.activity === 'dance') PET_IDS.forEach((id, i) => parts.push(note([x[id] + 4, GROUND - 38], i)))
  if (input.poke !== null && input.poke.agoSeconds < POKE_SECONDS) {
    const px = x[input.poke.pet] + (SPECS[input.poke.pet].isFacingLeft ? -8 : 8)
    parts.push(heart([px - 6, GROUND - 40], 'pk0'), heart([px + 6, GROUND - 44], 'pk1'), heart([px, GROUND - 48], 'pk2'))
  }
  if (input.weather !== 'clear') {
    const cx = Math.round(layout.width * 0.52)
    parts.push(at([cx, 16], rainCloud()))
    if (input.weather === 'clearing') parts.push(at([cx, 14], `<g class="clear-burst">${sparkle([0, 0], 3.4, COLORS.gold)}</g>`))
  }
  return parts.join('')
}

// ------------------------------------------------------------- prop timing

const propCss = (input: Scene_, layout: Layout) => {
  const rules: string[] = []
  const scene = input.mode === 'working' && input.activity === null ? input.scene : null
  if (scene === 'think') {
    // The firefly hovers where the cat will land, and darts up and away just
    // as it leaves the ground (55% into the hunt), drifting back after.
    rules.push(
      `.firefly{animation:fireflyDart ${HUNT_SECONDS}s ease-in-out ${delayOf(input)} infinite}.firefly circle{animation:blink 1.2s ease-in-out infinite}` +
        `@keyframes fireflyDart{0%,100%{translate:0px 0px}18%{translate:3px -3px}36%{translate:-2px 1px}54%{translate:0px 0px}` +
        `62%{translate:-12px -18px}67%{translate:-9px -24px}82%{translate:-4px -10px}}`,
    )
  }
  if (scene === 'read') {
    rules.push(
      `.page{animation:pageTurn 2.6s ease-in-out infinite}@keyframes pageTurn{0%,62%{scale:1 1}74%,100%{scale:-1 1}}` +
        `.lamp-glow{animation:glow 1.8s ease-in-out infinite alternate}.flame{animation:flicker .4s ease-in-out infinite alternate}`,
    )
  }
  if (scene === 'edit') {
    // In step with the planting loop: digging to 44%, the seedling up, patted
    // at 64 to 70%, then its spark flies off to the garden.
    const target = layout.ticks[Math.min(input.sprouts, MAX_SPROUTS - 1)] ?? 16
    const dx = Math.round(target - seedAt(layout))
    rules.push(
      `.seedling{animation:seedGrow 5.4s linear ${delayOf(input)} infinite}@keyframes seedGrow{0%,43%{scale:0 0}48%{scale:1.2 1.2}52%,62%{scale:1 1}66%{scale:1.15 .8}70%{scale:1 1.25}74%{scale:1 1}78%,100%{scale:0 0}}` +
        `.seed-spark-x{animation:sparkX 5.4s ease-in-out ${delayOf(input)} infinite}@keyframes sparkX{0%,74%{translate:0px 0px}90%,100%{translate:${dx}px 0px}}` +
        `.seed-spark-y{animation:sparkY 5.4s linear ${delayOf(input)} infinite}@keyframes sparkY{0%,73%{translate:0px 0px;scale:0 0}74%{translate:0px -4px;scale:1 1}` +
        `82%{translate:0px -30px;scale:1.2 1.2}90%{translate:0px -2px;scale:.6 .6}92%,100%{translate:0px -2px;scale:0 0}}`,
    )
  }
  if (scene === 'run') {
    rules.push(
      `.dust-gate{animation:dustGate ${DIGGING_SECONDS}s linear ${delayOf(input)} infinite}@keyframes dustGate{0%,66%{opacity:1}69%,86%{opacity:0}89%,100%{opacity:1}}` +
        `.dust-x{animation:dustX .9s linear infinite}.dust-y{animation:dustY .9s linear infinite}` +
        [1, 2, 3, 4].map(i => `.dust-${i}{animation-delay:${(-i * 0.18).toFixed(2)}s}`).join(''),
    )
  }
  if (scene === 'test') rules.push([0, 1, 2].map(i => `.bubble-${i}{animation:bubble 1.4s ease-in ${(-i * 0.47).toFixed(2)}s infinite}`).join(''))
  if (scene === 'wait') rules.push(`.wait-star{animation:twinkle 1.1s ease-in-out infinite}.glow-wait{animation:glowLine 1.6s ease-in-out infinite alternate}`)
  if (scene === 'danger') {
    rules.push(`.glow-danger{animation:glowLine .7s ease-in-out infinite alternate}` + PET_IDS.map(id => `.${id}-br{animation:shiver .11s ease-in-out 1.4s infinite alternate}`).join(''))
  }
  if (input.activity === 'feed') {
    rules.push(`.bowl{animation:bowlIn ${ACTIVITY_SECONDS}s ease-out ${delayOf(input)} both}` + [0, 1, 2, 3].map(i => `.h${i}{animation:lift 1.8s ease-out ${delayOf(input, 8.4 + i * 0.25)} both}`).join(''))
  }
  if (input.activity === 'dance') {
    rules.push(
      layout.ticks.map((_, i) => `.tick-${i}{transform-box:fill-box;transform-origin:50% 100%;animation:eq .5s ease-in-out ${(-(i % 6) * 0.08).toFixed(2)}s infinite}`).join('') +
        [0, 1, 2, 3].map(i => `.note-${i}{animation:noteUp 2.4s ease-out ${(i * 0.6).toFixed(1)}s infinite backwards}`).join(''),
    )
  }
  if (input.mode !== 'working' && input.activity === null) {
    // Each pet breathes and snores once it has settled for its nap; then the
    // whole band falls still, stars included, so the renderer can rest too.
    const quiet = quietAt(input)
    PET_IDS.forEach(id => {
      const settled = napsAt(id, input) + SPECS[id].settleSeconds
      rules.push(`.${id}-br{animation:breathe 3.6s ease-in-out ${delayOf(input, settled)} ${runsUntil(quiet, 3.6, settled)}}`)
      for (const i of [0, 1, 2]) rules.push(`.z-${id}-${i}{animation:zfloat 3.3s ease-out ${delayOf(input, settled + 0.6 + i * 1.1)} ${runsUntil(quiet, 3.3, settled + 0.6 + i * 1.1)} backwards}`)
    })
    if (input.phase !== 'day' && input.mode !== 'cheer') rules.push(shootingStar(input.width, 'shoot', `17s linear ${delayOf(input, 6)} 1 both`))
    rules.push(
      [0, 1, 2].map(i => `.cstar-${i}{animation-iteration-count:${runsUntil(quiet, 3.2 + i * 0.4)}}`).join('') +
        [0, 1, 2, 3].map(i => `.sky-${i}{animation-iteration-count:${runsUntil(quiet, 2.4 + i * 0.6)}}`).join('') +
        `.rays{animation-iteration-count:1}.tip{animation-iteration-count:${runsUntil(quiet, 2.6)}}`,
    )
  }
  if (input.mode === 'cheer' && input.activity === null) {
    // A burst of star points as each pet leaves the ground.
    PET_IDS.forEach((id, i) => {
      for (const k of [0, 1, 2, 3, 4, 5]) {
        const a = (k / 6) * Math.PI * 2 + i
        rules.push(
          `.burst-${id}.b${k}{animation:burst${i}${k} 1.1s ease-out ${delayOf(input, cheerDelay(id) + 0.5)} both}` +
            `@keyframes burst${i}${k}{0%{opacity:0;translate:0px 0px;scale:.3 .3}25%{opacity:1}100%{opacity:0;translate:${f1(Math.cos(a) * 14)}px ${f1(Math.sin(a) * 10 - 4)}px;scale:1 1}}`,
        )
      }
    })
    rules.push(
      `.link-new{stroke-dasharray:1;animation:draw 1s ease-out ${delayOf(input, 1.6)} both}.cstar-new{animation:pop .7s ease-out ${delayOf(input, 2.4)} both,twinkle 3s ease-in-out ${delayOf(input, 3.2)} ${runsUntil(quietAt(input), 3, 3.2)}}` +
        `.sprout-new{animation:sprout .7s cubic-bezier(.3,1.6,.5,1) ${delayOf(input, 1.5)} both}.sprout-new .stem{stroke-dasharray:1;animation:draw .7s ease-out ${delayOf(input, 1.5)} both}` +
        shootingStar(input.width, 'shootOnce', `6s ease-out ${delayOf(input, 0.9)} both`),
    )
  }
  if (input.poke !== null && input.poke.agoSeconds < POKE_SECONDS) {
    const ago = input.poke.agoSeconds
    rules.push([0, 1, 2].map(i => `.pk${i}{animation:lift 1.8s ease-out ${f1(0.3 + i * 0.35 - ago)}s both}`).join(''))
  }
  if (input.weather === 'rain') {
    // Rain falls for as long as the band is awake; a resting band's rain stops
    // with everything else, the cloud staying put.
    const runs = input.mode !== 'working' && input.activity === null ? runsUntil(quietAt(input), 0.8) : 'infinite'
    const drifts = runs === 'infinite' ? 'infinite' : Math.ceil(Number(runs) / 8)
    rules.push(`.cloud-drift{animation:cloudDrift 7s ease-in-out ${drifts} alternate}` + [0, 1, 2, 3, 4].map(i => `.drop-${i}{animation:rain .8s linear ${(-i * 0.16).toFixed(2)}s ${runs}}`).join(''))
  }
  if (input.weather === 'clearing') rules.push(`.cloud-drift{animation:cloudLeave 1.8s ease-in ${delayOf(input, 0.3)} both}.drop{opacity:0}.clear-burst{animation:pop .6s ease-out ${delayOf(input, 1.2)} both,fadeOut .8s ease-in ${delayOf(input, 2)} forwards}`)
  return rules.join('')
}

const shootingStar = (width: number, name: string, timing: string) =>
  `.shoot{animation:${name} ${timing}}@keyframes ${name}{0%{opacity:0;translate:${Math.round(width * 0.92)}px 4px}3%{opacity:1}` +
  `12%,100%{opacity:0;translate:${Math.round(width * 0.58)}px 18px}}`

const KEYFRAMES =
  `@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@keyframes fadeOut{from{opacity:1}to{opacity:0}}` +
  `@keyframes pop{0%{opacity:0;scale:0 0}60%{opacity:1;scale:1.5 1.5}100%{opacity:1;scale:1 1}}` +
  `@keyframes twinkle{0%,100%{opacity:.35;scale:.75 .75}50%{opacity:1;scale:1.15 1.15}}@keyframes spin{to{rotate:360deg}}` +
  `@keyframes kidBorn{0%{opacity:0;scale:.2 .2}70%{opacity:1;scale:1.15 1.15}100%{opacity:1;scale:1 1}}` +
  `@keyframes breathe{0%,100%{scale:1 1}50%{scale:1.015 1.04}}@keyframes shiver{from{translate:-.5px 0px}to{translate:.5px 0px}}` +
  `@keyframes zfloat{0%{opacity:0;translate:0px 0px;scale:.5 .5}25%{opacity:.9}100%{opacity:0;translate:6px -14px;scale:1.1 1.1}}` +
  `@keyframes lift{0%{opacity:0;translate:0px 0px;scale:.4 .4}20%{opacity:1;translate:0px -3px;scale:1 1}100%{opacity:0;translate:0px -16px;scale:1 1}}` +
  `@keyframes sprout{0%{scale:0 0}70%{scale:1.25 1.25}100%{scale:1 1}}` +
  `@keyframes bowlIn{0%{opacity:0;scale:0 0}5%{opacity:1;scale:1.15 1.15}8%,88%{opacity:1;scale:1 1}96%,100%{opacity:0;scale:.6 .6}}` +
  `@keyframes eq{0%,100%{scale:1 1}50%{scale:1 2.6}}` +
  `@keyframes noteUp{0%{opacity:0;translate:0px 4px;rotate:-8deg}15%{opacity:1}100%{opacity:0;translate:7px -22px;rotate:10deg}}` +
  `@keyframes blink{0%,100%{opacity:.25}50%{opacity:1}}` +
  `@keyframes dustX{0%{translate:0px 0px;opacity:0}10%,75%{opacity:1}100%{translate:-40px 0px;opacity:0}}` +
  `@keyframes dustY{0%{translate:0px 0px;animation-timing-function:cubic-bezier(.2,.7,.4,1)}45%{translate:0px -13px;animation-timing-function:cubic-bezier(.6,0,.8,.3)}100%{translate:0px 0px}}` +
  `@keyframes glow{from{opacity:.45}to{opacity:.95}}@keyframes flicker{from{scale:1 1}to{scale:.85 1.15}}` +
  `@keyframes bubble{0%{translate:0px 0px;opacity:0}15%{opacity:1}100%{translate:0px -9px;opacity:0}}` +
  `@keyframes glowLine{from{opacity:.15}to{opacity:.85}}@keyframes rain{0%{translate:0px 0px;opacity:0}20%{opacity:1}100%{translate:0px 12px;opacity:0}}` +
  `@keyframes cloudDrift{from{translate:-5px 0px}to{translate:5px 0px}}@keyframes cloudLeave{0%{translate:0px 0px;opacity:1}100%{translate:90px 0px;opacity:0}}`

const BASE_RULES =
  `.z,.burst,.lift,.note,.shoot{opacity:0}` +
  [0, 1, 2].map(i => `.cstar-${i}{animation:twinkle ${(3.2 + i * 0.4).toFixed(1)}s ease-in-out ${(-i * 1.2).toFixed(1)}s infinite}`).join('') +
  [0, 1, 2, 3].map(i => `.sky-${i}{animation:twinkle ${(2.4 + i * 0.6).toFixed(1)}s ease-in-out ${(-i * 0.7).toFixed(1)}s infinite}`).join('') +
  `.rays{animation:spin 30s linear infinite}.tip{animation:twinkle 2.6s ease-in-out infinite}`

// On a light band the starlight strokes would vanish; ink them instead.
const LIGHT_THEME = `@media (prefers-color-scheme: light){[stroke="${COLORS.starlight}"]{stroke:#2C313C}[fill="${COLORS.starlight}"]{fill:#2C313C}}`

const DEFS =
  `<linearGradient id="horizon" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${COLORS.starlight}" stop-opacity="0"/>` +
  `<stop offset=".08" stop-color="${COLORS.starlight}" stop-opacity=".34"/><stop offset=".92" stop-color="${COLORS.starlight}" stop-opacity=".34"/>` +
  `<stop offset="1" stop-color="${COLORS.starlight}" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="trail" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${COLORS.starlight}" stop-opacity=".9"/>` +
  `<stop offset="1" stop-color="${COLORS.starlight}" stop-opacity="0"/></linearGradient>` +
  SPROUT_DEF +
  `<radialGradient id="lamp"><stop offset="0" stop-color="${COLORS.gold}" stop-opacity=".45"/><stop offset="1" stop-color="${COLORS.gold}" stop-opacity="0"/></radialGradient>`

// A pet's frame at `t` s into its plays, as the CSS resolves them: the last
// play active at `t` wins; a one-shot holds its ends as its fill says.
const frameAt = (plays: readonly Play[], t: number): Frame | undefined => {
  let frame: Frame | undefined
  for (const play of plays) {
    const delay = play.delay ?? 0
    const local = t - delay
    if (play.isLooping) {
      if (local < 0) continue
      if (play.count !== undefined && local >= play.count * play.seconds) continue
      frame = play.motion(local % play.seconds)
      continue
    }
    const fill = play.fill ?? 'both'
    const holdsStart = fill === 'both' || fill === 'backwards'
    const holdsEnd = fill === 'both' || fill === 'forwards'
    if (local < 0) {
      if (holdsStart) frame = play.motion(0)
    } else if (local < play.seconds) frame = play.motion(local)
    else if (holdsEnd) frame = play.motion(play.seconds)
  }
  return frame
}

// Where every pet is `t` s into a scene, for the scene that follows it.
export const framesAt = (input: SceneInput, t: number): Readonly<Record<PetId, Frame>> => {
  const layout = layoutFor(input.width)
  const plays = playsWithMoves(input, layout)
  const frames = {} as Record<PetId, Frame>
  for (const id of PET_IDS) frames[id] = frameAt(plays.plays[id], t) ?? SPECS[id].still
  return frames
}

// Each pet's way of covering ground between scenes, keeping its facing for
// a short way (`keep`) and turning to face a long one.
const GOING: Readonly<Record<PetId, (from: number, to: number, keep: number) => { seconds: number; facing: number; motion: Motion }>> = {
  chk: chickGoing,
  bun: bunnyGoing,
  cat: catGoing,
  dog: dogGoing,
}

// The pets' moves into a scene from where the last one left them: a blend
// out of the old pose, a walk, hop or run to where the new scene starts
// them when that is somewhere else, and a blend into its first pose. Every
// play of the scene then waits for the longest move.
const BLEND = 0.35
const playsWithMoves = (input: SceneInput, layout: Layout) => {
  const base = playsFor(input, layout)
  const moves: Partial<Record<PetId, Play>> = {}
  let lead = 0
  for (const id of PET_IDS) {
    const was = input.from[id]
    if (was === undefined) continue
    const starts = frameAt(base[id], 0) ?? SPECS[id].still
    const distance = Math.abs(starts.x - was.x)
    const standing = { ...SPECS[id].still, x: was.x }
    const going = distance > 3 ? GOING[id](was.x, starts.x, was.facing) : null
    const travel = going?.seconds ?? 0
    const seconds = BLEND + travel + BLEND
    const facingOut = going?.facing ?? starts.facing
    const motion: Motion = t => {
      if (t < BLEND) return mixFrames(was, { ...standing, facing: facingOut }, smooth(t / BLEND))
      if (going !== null && t < BLEND + travel) return going.motion(t - BLEND)
      const landed = going === null ? { ...standing, facing: facingOut } : going.motion(travel)
      return mixFrames(landed, starts, smooth(span(t, BLEND + travel, seconds)))
    }
    // Only the bones the move turns get channels: nothing plays under it, and
    // a bone it leaves alone is at rest, as the scene's plays find it.
    moves[id] = { ...once(`${id}Go`, motion, seconds, 0, 'both'), coarseness: 2, samplesPerSecond: 12 }
    lead = Math.max(lead, seconds)
  }
  const plays = {} as Record<PetId, Play[]>
  for (const id of PET_IDS) {
    const move = moves[id]
    // A scene play waits for the moves; a one-shot that would hold its first
    // frame meanwhile (fill both) must not, or it would sit over the move.
    const own = base[id].map(play => ({
      ...play,
      delay: (play.delay ?? 0) + lead,
      fill: lead > 0 && !play.isLooping && (play.fill ?? 'both') === 'both' ? 'forwards' : play.fill,
    }))
    plays[id] = move === undefined ? own : [move, ...own]
  }
  return { plays, lead }
}

// The desktop refuses a drawing over this many characters, and a refused
// band shows nothing; a scene that would is built again more economically.
export const SIZE_LIMIT = 131072
const SIZE_MARGIN = 4096

export const petsScene = (given: SceneInput): string => {
  for (let economy = 0; ; economy++) {
    const svg = sceneAt(given, economy)
    if (svg.length <= SIZE_LIMIT - SIZE_MARGIN || economy === 2) return svg
  }
}

// Economy 1 samples every motion more coarsely; 2 also leaves out the young.
export const sceneAt = (given: SceneInput, economy: number): string => {
  const layout = layoutFor(given.width)
  const staged = playsWithMoves(given, layout)
  const plays = staged.plays
  const input: Scene_ = { ...given, kids: economy >= 2 ? [] : given.kids, leadSeconds: staged.lead, economy }
  const isDigging = input.mode === 'working' && input.activity === null && input.scene === 'run'
  const defs: string[] = [DEFS]
  const css: string[] = [KEYFRAMES, BASE_RULES]
  const bodies: string[] = []
  // Every animation an element gets goes into its one `animation` list, in
  // play order, so stacked motions layer instead of replacing each other.
  const animations = new Map<string, string[]>()
  for (const id of PET_IDS) {
    const pet = petMarkup(id, layout, id === 'dog' && isDigging ? digDust : '')
    defs.push(pet.defs)
    css.push(pet.css)
    bodies.push(pet.body)
    for (const play of plays[id]) {
      const timing = {
        ...play,
        delay: (play.delay ?? 0) - input.elapsedSeconds,
        coarseness: (play.coarseness ?? 1) * (economy > 0 ? 1.6 : 1),
        samplesPerSecond: economy > 0 ? Math.min(10, play.samplesPerSecond ?? 16) : play.samplesPerSecond,
      }
      const tracked = track(SPECS[id].rig, play.name, play.motion, timing, { move: `.${id}-mv`, face: `.${id}-fc` })
      css.push(tracked.keyframes)
      for (const [selector, animation] of tracked.entries) animations.set(selector, [...(animations.get(selector) ?? []), animation])
    }
  }
  css.push([...animations].map(([selector, list]) => `${selector}{animation:${list.join(',')}}`).join(''))
  const ball = ballFor(input, layout)
  css.push(propCss(input, layout), ball?.css ?? '', kidsCss(input, plays), LIGHT_THEME)
  const young = input.kids.map(kid => kidMarkup(kid.parent, layout)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${SCENE_HEIGHT}" viewBox="0 0 ${input.width} ${SCENE_HEIGHT}">` +
    `<defs>${defs.join('')}</defs><style>${css.join('')}</style>` +
    skyMarkup(input, layout) +
    horizonMarkup(input, layout) +
    bodies.join('') +
    young +
    extrasMarkup(input, layout) +
    kidsExtras(input, layout) +
    (ball?.markup ?? '') +
    `</svg>`
  )
}

const SCENE_ALT: Record<Scene, string> = {
  think: 'The pets play along the number line while Claude thinks',
  read: 'The cat reads by lantern light while Claude reads files',
  edit: 'The bunny plants a seedling while Claude edits a file',
  run: 'The dog digs while Claude runs a command',
  test: 'The chick watches a bubbling flask while tests run',
  web: 'The chick flies up to look ahead while Claude browses',
  agent: 'The dog races off to fetch while a helper agent works',
  wait: 'The pets lean in toward the prompt, waiting for you',
  danger: 'The pets scatter: Claude wants to run a risky command',
}

export const petsAlt = (input: SceneInput) =>
  input.activity !== null
    ? `The pets are having a ${input.activity === 'feed' ? 'snack' : input.activity === 'play' ? 'game of fetch' : 'dance'}`
    : input.mode === 'working'
      ? SCENE_ALT[input.scene]
      : 'The pets rest under the stars by the prompt'
