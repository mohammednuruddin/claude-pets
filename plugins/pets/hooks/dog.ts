// The dog: a jointed rig and the ways it moves. Faceless: head, snout and a
// floppy ear only. Rest pose is standing, facing right, paws at y = 0.

import { capsule, ellipse, jumping, lerp, smooth, span, stepOf, travel, turnFacing, v } from './rig'
import type { Bone, Foot, Frame, Leg, Rig, Vec } from './rig'

const HIP = v(-10, -15.6)
const KNEE = v(-6.4, -9.8)
const HOCK = v(-11, -3.8)
const HIND_TOE = v(-8, 0)
const SHOULDER = v(8.6, -15)
const ELBOW = v(7.6, -8.2)
const WRIST = v(8.4, -2)
const FORE_TOE = v(11.2, 0)
const FAR_HIND = 2
const FAR_FORE = -2
const SPINE = v(-1, -18.5)

const shift = (p: Vec, dx: number) => v(p.x + dx, p.y)

const hindLeg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}hu`, parent: 'p', joint: shift(HIP, dx), shapes: [{ d: capsule(shift(HIP, dx), shift(KNEE, dx), 3.9, 2.4), layer, hasEdge: true }] },
    { id: `${side}hl`, parent: `${side}hu`, joint: shift(KNEE, dx), shapes: [{ d: capsule(shift(KNEE, dx), shift(HOCK, dx), 2, 1.5), layer }] },
    { id: `${side}hf`, parent: `${side}hl`, joint: shift(HOCK, dx), shapes: [{ d: capsule(shift(HOCK, dx), shift(HIND_TOE, dx), 1.5, 1.7), layer }] },
  ]
}

const foreLeg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}fu`, parent: 'c', joint: shift(SHOULDER, dx), shapes: [{ d: capsule(shift(SHOULDER, dx), shift(ELBOW, dx), 3.3, 2.2), layer, hasEdge: true }] },
    { id: `${side}fl`, parent: `${side}fu`, joint: shift(ELBOW, dx), shapes: [{ d: capsule(shift(ELBOW, dx), shift(WRIST, dx), 1.8, 1.6), layer }] },
    { id: `${side}ff`, parent: `${side}fl`, joint: shift(WRIST, dx), shapes: [{ d: capsule(shift(WRIST, dx), shift(FORE_TOE, dx), 1.6, 1.7), layer }] },
  ]
}

const TAIL: Vec[] = [v(-17, -21.6), v(-21, -24.8), v(-23.4, -29.2), v(-23.8, -33.6)]
const TAIL_R = [1.9, 1.7, 1.45, 1.1]

export const dogRig: Rig = {
  key: 'd',
  root: 'b',
  bones: [
    { id: 'b', parent: null, joint: v(0, -18), shapes: [] },
    { id: 'p', parent: 'b', joint: SPINE, shapes: [{ d: ellipse(-8, -18.6, 9.6, 6.4), layer: 'body' }] },
    ...hindLeg('f', FAR_HIND),
    ...TAIL.slice(0, -1).map((p, i) => ({
      id: `t${i + 1}`,
      parent: i === 0 ? 'p' : `t${i}`,
      joint: p,
      shapes: [{ d: capsule(p, TAIL[i + 1]!, TAIL_R[i]!, TAIL_R[i + 1]!), layer: 'body' as const }],
      tips: i === 2 ? [v(-23.8, -34)] : undefined,
    })),
    ...hindLeg('n', 0),
    { id: 'c', parent: 'b', joint: SPINE, shapes: [{ d: ellipse(6, -19, 9, 7.2), layer: 'body' }] },
    ...foreLeg('f', FAR_FORE),
    {
      id: 'h',
      parent: 'c',
      joint: v(12.6, -24),
      shapes: [
        { d: capsule(v(11, -22), v(16.4, -28.4), 4.4, 3.8), layer: 'body' },
        { d: ellipse(19.2, -30.6, 6, 5.2), layer: 'body' },
        { d: capsule(v(22, -29.6), v(28.2, -28.2), 3.1, 2.6), layer: 'body' },
      ],
    },
    { id: 'ea', parent: 'h', joint: v(16.4, -33.4), shapes: [{ d: capsule(v(16.4, -33.4), v(14.2, -25.6), 2.4, 2.9), layer: 'near', hasEdge: true }] },
    ...foreLeg('n', 0),
  ],
  legs: {
    nh: { bones: ['nhu', 'nhl', 'nhf'], points: [HIP, KNEE, HOCK, HIND_TOE], bend: 1 },
    fh: { bones: ['fhu', 'fhl', 'fhf'], points: [shift(HIP, FAR_HIND), shift(KNEE, FAR_HIND), shift(HOCK, FAR_HIND), shift(HIND_TOE, FAR_HIND)], bend: 1 },
    nf: { bones: ['nfu', 'nfl', 'nff'], points: [SHOULDER, ELBOW, WRIST, FORE_TOE], bend: -1 },
    ff: { bones: ['ffu', 'ffl', 'fff'], points: [shift(SHOULDER, FAR_FORE), shift(ELBOW, FAR_FORE), shift(WRIST, FAR_FORE), shift(FORE_TOE, FAR_FORE)], bend: -1 },
  } satisfies Record<string, Leg>,
}

type LegName = 'nh' | 'fh' | 'nf' | 'ff'
const LEGS: readonly LegName[] = ['nh', 'fh', 'nf', 'ff']
const isHind = (leg: LegName) => leg.endsWith('h')
const toeOf = (leg: LegName) => dogRig.legs[leg]!.points[3]
const STANDING = { hind: 50, fore: 35 }
const CURLED = { hind: 104, fore: 118 }

type Pose = { readonly y: number; readonly bones: Readonly<Record<string, number>>; readonly feet: Readonly<Record<LegName, Foot>> }

const standingFeet = (): Record<LegName, Foot> =>
  Object.fromEntries(LEGS.map(leg => [leg, { at: toeOf(leg), angle: isHind(leg) ? STANDING.hind : STANDING.fore }])) as Record<LegName, Foot>

export const STAND: Pose = { y: 0, bones: { t1: -10, t2: -6, t3: -4 }, feet: standingFeet() }

// Lying down: body flat on folded hind legs, front legs out along the
// ground, head resting low on the paws, tail flat behind.
export const LIE: Pose = {
  y: 10.4,
  bones: { h: 26, ea: 10, t1: -52, t2: -24, t3: -8 },
  feet: {
    nh: { at: v(-3.6, -0.3), angle: 2 },
    fh: { at: v(-1.6, -0.3), angle: 2 },
    nf: { at: v(19, 0), angle: 4 },
    ff: { at: v(16.6, 0), angle: 4 },
  },
}

// Cowering: body low, head down, tail tucked under.
export const COWER: Pose = {
  y: 4,
  bones: { b: 4, h: 18, ea: 14, t1: -78, t2: -40, t3: -20 },
  feet: { ...standingFeet(), nh: { at: v(-9, 0), angle: 34 }, fh: { at: v(-7, 0), angle: 34 } },
}

const blend = (a: Pose, b: Pose, u: number): Pose => {
  const bones: Record<string, number> = {}
  for (const k of new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])) bones[k] = lerp(a.bones[k] ?? 0, b.bones[k] ?? 0, u)
  const feet = Object.fromEntries(
    LEGS.map(leg => [leg, { at: v(lerp(a.feet[leg].at.x, b.feet[leg].at.x, u), lerp(a.feet[leg].at.y, b.feet[leg].at.y, u)), angle: lerp(a.feet[leg].angle, b.feet[leg].angle, u) }]),
  ) as Record<LegName, Foot>
  return { y: lerp(a.y, b.y, u), bones, feet }
}

const add = (pose: Pose, extra: Readonly<Record<string, number>>): Pose => {
  const bones: Record<string, number> = { ...pose.bones }
  for (const [k, a] of Object.entries(extra)) bones[k] = (bones[k] ?? 0) + a
  return { ...pose, bones }
}

const frameOf = (pose: Pose, x: number, facing = 1): Frame => ({ x, y: pose.y, facing, bones: pose.bones, feet: pose.feet })

// A wag: quick side-to-side of the whole tail, in bursts.
const wag = (t: number, speed: number, strength = 1) => {
  const a = 22 * strength * Math.sin(2 * Math.PI * speed * t)
  return { t1: -10 + a * 0.6, t2: -6 + a * 0.4, t3: -4 + a * 0.3 }
}
const wagBursts = (t: number) => (t % 4 < 1.5 ? wag(t, 4) : wag(t, 0.5, 0.2))

// Walking, `covered` px along the facing so far (negative backing away),
// `stride` px a cycle, lateral sequence, each paw planted 60% of the cycle.
// The cycle runs on the ground covered, not the clock, so a planted paw
// stays put whatever the pace.
const walking = (base: Pose, covered: number, stride: number, lift = 3.2): Pose => {
  const cycle = Math.abs(covered) / stride
  const direction = covered < 0 ? -1 : 1
  const phases: Record<LegName, number> = { nh: 0, nf: 0.25, fh: 0.5, ff: 0.75 }
  const feet = { ...base.feet }
  for (const leg of LEGS) {
    const step = stepOf(cycle, phases[leg], 0.6, stride * 0.6, lift)
    const flat = base.feet[leg].angle
    feet[leg] = {
      at: v(base.feet[leg].at.x + direction * step.dx, base.feet[leg].at.y + step.dy),
      angle: step.isPlanted ? flat : lerp(flat, isHind(leg) ? CURLED.hind : CURLED.fore, Math.sin(Math.PI * step.swing)),
    }
  }
  return { ...base, y: base.y - 0.6 * Math.sin(4 * Math.PI * cycle), bones: { ...base.bones, b: (base.bones.b ?? 0) + Math.sin(2 * Math.PI * cycle) }, feet }
}

// A walk from `from` to `to` px over [start, end] s while facing `facing`,
// out of `base` and back into it, so the first and last steps blend in.
const walk = (t: number, base: Pose, from: number, to: number, start: number, end: number, facing: number, stride = 18) => {
  const x = lerp(from, to, travel(t, start, end))
  const settle = Math.min(smooth(span(t, start, start + 0.2)), 1 - smooth(span(t, end - 0.2, end)))
  return frameOf(blend(base, walking(base, (x - from) * (facing < 0 ? -1 : 1), stride), settle), x, facing)
}

// Standing about: tail wagging in bursts, now and then a sniff at the
// ground; a loop of STANDING_SECONDS.
export const STANDING_SECONDS = 8
export const dogStanding = (t: number): Frame => {
  const p = t % 8
  const facing = turnFacing(p, [2.2, 4.4], 0.2)
  if (p > 0.8 && p < 1.7) return walk(p, add(STAND, wag(t, 1.5, 0.5)), 0, 40, 0.8, 1.7, 1)
  if (p > 2.7 && p < 3.6) return walk(p, add(STAND, wag(t, 1.5, 0.5)), 40, 0, 2.7, 3.6, facing)
  const sniff = p > 6 ? Math.sin(Math.PI * span(p, 6, 7.6)) : 0
  return frameOf(add(STAND, { ...wagBursts(t), h: 30 * sniff, b: 5 * sniff, ea: 6 * sniff }), p > 0.8 && p < 3.6 ? 40 : 0, facing)
}

// Sniffing about: a few steps forward nose down, a good sniff, turn, walk
// back, turn; a loop of SNIFFING_SECONDS.
export const SNIFFING_SECONDS = 6.4
export const dogSniffing = (t: number): Frame => {
  const facing = turnFacing(t, [3.65, 5.0])
  if (t < 0.5) return dogStanding(t)
  if (t < 1.9) return walk(t, add(STAND, { h: 18, b: 3, ...wag(t, 1.5, 0.5) }), 0, 52, 0.5, 1.9, 1)
  if (t < 3.65) return frameOf(add(STAND, { h: 26 + 4 * Math.sin(t * 9), b: 6, ...wag(t, 2, 0.6) }), 52, 1)
  if (t < 3.8) return frameOf(STAND, 52, facing)
  if (t < 5.2) return walk(t, add(STAND, wag(t, 1.5, 0.5)), 52, 0, 3.8, 5.2, facing)
  return frameOf(add(STAND, wagBursts(t)), 0, facing)
}

// Digging: front low and rear up, front paws scraping in turn, each stroke
// throwing dirt back, a pause now and then to look into the hole; a loop of
// DIGGING_SECONDS holding a whole number of strokes.
export const DIGGING_SECONDS = 3.6
export const dogDigging = (t: number): Frame => {
  const p = t / DIGGING_SECONDS
  const isPeering = p > 0.68 && p < 0.86
  const strokes = 15 / DIGGING_SECONDS
  const stroke = (phase: number) => {
    const s = (t * strokes + phase) % 1
    return isPeering
      ? { at: v(toeOf('nf').x + 2, 0), angle: 40 }
      : { at: v(toeOf('nf').x + 3.5 - 7 * s, s < 0.55 ? -3 * Math.sin(Math.PI * (s / 0.55)) : 0), angle: 40 + 50 * Math.sin(Math.PI * s) }
  }
  const nf = stroke(0)
  const ff = stroke(0.5)
  return {
    x: 0,
    y: 1.6,
    facing: 1,
    bones: { b: 12 + (isPeering ? 5 : 1.5 * Math.sin(2 * Math.PI * strokes * 2 * t)), h: isPeering ? 22 : 6, ea: 8, ...wag(t, 4) },
    feet: { ...STAND.feet, nh: { at: v(toeOf('nh').x - 2, 0), angle: 60 }, fh: { at: v(toeOf('fh').x - 2, 0), angle: 60 }, nf, ff: { ...ff, at: v(ff.at.x - 2, ff.at.y) } },
  }
}

// ------------------------------------------------------------- the gallop

// A rotary gallop `covered` px into a run: the hind paws drive in quick
// succession, then the front, the back gathering and stretching, with a
// moment in the air after the front paws push off. GALLOP_STRIDE px of
// ground a stride, the planted paw sweeping back exactly as far as the body
// travels over it, so no paw slides.
const GALLOP_STRIDE = 56
const PLANTED = 0.32
const galloping = (covered: number, t: number): Pose => {
  const cycle = covered / GALLOP_STRIDE
  const sweep = GALLOP_STRIDE * PLANTED
  const step = (phase: number, toe: number, isFore: boolean): Foot => {
    const p = (((cycle - phase) % 1) + 1) % 1
    if (p < PLANTED) return { at: v(toe + sweep * (0.5 - p / PLANTED), 0), angle: isFore ? 40 : 55 }
    const s = (p - PLANTED) / (1 - PLANTED)
    return { at: v(toe - sweep / 2 + sweep * smooth(s), -5 * Math.sin(Math.PI * s)), angle: isFore ? 120 : 100 }
  }
  const gather = Math.sin(2 * Math.PI * cycle)
  return {
    y: -2.4 * Math.max(0, Math.cos(2 * Math.PI * (cycle - 0.96))),
    bones: { b: -4 * gather, p: 6 * gather, c: -6 * gather, h: 4 * gather - 4, ea: -16, ...wag(t, 3, 0.4) },
    feet: {
      nh: step(0, toeOf('nh').x, false),
      fh: step(0.1, toeOf('fh').x + 2, false),
      nf: step(0.5, toeOf('nf').x, true),
      ff: step(0.6, toeOf('ff').x - 2, true),
    },
  }
}

// A run from `from` to `to` px over [start, end] s, always forward along
// the facing: the gallop gathers out of a stand and settles back into one.
const run = (t: number, from: number, to: number, start: number, end: number, facing: number): Frame => {
  const x = lerp(from, to, travel(t, start, end, 0.3))
  const settle = Math.min(smooth(span(t, start, start + 0.25)), 1 - smooth(span(t, end - 0.25, end)))
  return frameOf(blend(STAND, galloping(Math.abs(x - from), t), settle), x, facing)
}

// ------------------------------------------------------------- fetching

// Where a carried ball sits on the head bone: under the tip of the snout.
export const CARRY = v(28.4, -24.8)

// Head right down to the ground, to take up a ball or set it down.
const REACH: Pose = { y: 2, bones: { b: 10, h: 66, ea: 12, t1: -10, t2: -6, t3: -4 }, feet: standingFeet() }
const reaching = (u: number) => blend(STAND, REACH, u)

// Down to `at` and up again: 0 to 1 from `from` to `at`, back to 0 by `at` + 0.35.
const dip = (t: number, from: number, at: number) => (t < at ? smooth(span(t, from, at)) : 1 - smooth(span(t, at, at + 0.35)))

const RUN_SPEED = 120

// A fetch, timed so a scene can put its ball where the dog has it: after
// `waits` s the dog turns about and runs `distance` px out behind it, takes
// the ball up at `pick`, turns, runs home, and sets it down at `drop`.
export type Fetch = { readonly seconds: number; readonly pick: number; readonly drop: number; readonly motion: (t: number) => Frame }
export const fetching = (distance: number, waits: number): Fetch => {
  const running = Math.max(0.8, distance / RUN_SPEED)
  const out = waits + 0.25
  const arrive = out + running
  const pick = arrive + 0.4
  const back = pick + 0.75
  const home = back + running
  const drop = home + 0.6
  const seconds = drop + 1.2
  const motion = (t: number): Frame => {
    const facing = turnFacing(t, [waits, pick + 0.4], 0.16)
    if (t < out) return frameOf(add(STAND, { h: -10 * smooth(span(t, 0, 0.4)), ...wag(t, 2) }), 0, facing)
    if (t < arrive) return run(t, 0, -distance, out, arrive, facing)
    if (t < back) return frameOf(add(reaching(dip(t, arrive, pick)), wag(t, 4)), -distance, facing)
    if (t < home) return run(t, -distance, 0, back, home, facing)
    return frameOf(add(reaching(0.8 * dip(t, home + 0.25, drop)), wag(t, 4)), 0, facing)
  }
  return { seconds, pick, drop, motion }
}

// Played with: a play bow (front down, rear up, tail going), then two
// bounces, spinning right round in the air on the second; 3.2 s.
const BOW: Pose = { y: 3, bones: { b: 14, h: -8, ea: -6, t1: -30, t2: -10, t3: -6 }, feet: { ...standingFeet(), nf: { at: v(FORE_TOE.x + 7, 0), angle: 20 }, ff: { at: v(FORE_TOE.x + FAR_FORE + 7, 0), angle: 20 } } }
export const dogPlayed = (t: number): Frame => {
  if (t < 1) return frameOf(add(blend(STAND, BOW, Math.sin(Math.PI * span(t, 0, 1))), wag(t, 5)), 0)
  if (t < 1.7) return jumping(frameOf(add(STAND, wag(t, 5)), 0), span(t, 1, 1.7), 9)
  if (t < 2.6) return jumping(frameOf(add(STAND, { ...wag(t, 5), ea: -14 }), 0, turnFacing(t, [1.85, 2.15], 0.25)), span(t, 1.7, 2.6), 13)
  return frameOf(add(STAND, { ...wag(t, 5), h: -6 * Math.sin(Math.PI * span(t, 2.6, 3.2)) }), 0)
}

// ------------------------------------------------------------- the rest

// Going from `from` to `to` px along the facing, for a scene change: a trot
// facing the way it goes, a run when it is far.
export const dogGoing = (from: number, to: number, keep: number) => {
  const distance = Math.abs(to - from)
  const facing = distance < 30 ? (keep < 0 ? -1 : 1) : to < from ? -1 : 1
  if (distance > 90) {
    const seconds = Math.max(0.8, distance / 110)
    return { seconds, facing, motion: (t: number) => run(t, from, to, 0, seconds, facing) }
  }
  const seconds = Math.max(0.5, distance / 60)
  return { seconds, facing, motion: (t: number) => walk(t, add(STAND, wag(t, 1.5, 0.5)), from, to, 0, seconds, facing) }
}

// Asleep, lying down, for a nap to settle into.
export const dogAsleep = (): Frame => frameOf(LIE, 0)

// Frightened: cowering, tail tucked, backing off a few stiff steps.
export const dogFrightened = (t: number): Frame => {
  if (t < 0.5) return frameOf(blend(STAND, COWER, smooth(span(t, 0, 0.3))), 0)
  return walk(t, COWER, 0, -14, 0.5, 1.5, 1, 12)
}

// Eating: head down in the bowl, a bob at each bite; a loop of 1.5 s.
export const dogEating = (t: number): Frame => frameOf(add(STAND, { h: 36 + 7 * Math.sin((2 * Math.PI * t) / 0.75), b: 8, ...wag(t, 4) }), 0)

export const dogPeering = (t: number): Frame => frameOf(add(STAND, { h: 12 * smooth(span(t, 0, 0.6)), b: 3, ...wag(t, 1.2, 0.4) }), 0)

export const dogLookingAhead = (t: number): Frame => frameOf(add(STAND, { h: -6, ...wag(t, 1.6, 0.5) }), 0, turnFacing(t, [0.3]))

export const dogStill = (): Frame => frameOf(STAND, 0)
