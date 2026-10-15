// The bunny: a jointed rig and the ways it moves. Faceless: head and ears
// only. Rest pose is the crouch rabbits sit in: haunches down, long hind feet
// flat on the ground, short front legs straight, facing right at y = 0.

import { capsule, ellipse, lerp, smooth, span, turnFacing, v } from './rig'
import type { Bone, Foot, Frame, Leg, Rig, Vec } from './rig'

const HIP = v(-5, -8.4)
const KNEE = v(0.6, -4.8)
const HOCK = v(-9.4, -1.6)
const HIND_TOE = v(2.6, 0)
const SHOULDER = v(6.8, -9)
const ELBOW = v(6.2, -4.8)
const WRIST = v(7.4, -1.5)
const FORE_TOE = v(9.9, 0)
const FAR_HIND = 2.2
const FAR_FORE = -1.8
const SPINE = v(1.5, -12.5)

const shift = (p: Vec, dx: number) => v(p.x + dx, p.y)

const hindLeg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}hu`, parent: 'p', joint: shift(HIP, dx), shapes: [{ d: capsule(shift(HIP, dx), shift(KNEE, dx), 4.2, 2.5), layer, hasEdge: true }] },
    // The body sits low over the legs: the lower leg is folded away under it,
    // as a crouching rabbit's is, but the long foot and the front leg get an
    // edge drawn over the body's fill, or only the thigh would show.
    { id: `${side}hl`, parent: `${side}hu`, joint: shift(KNEE, dx), shapes: [{ d: capsule(shift(KNEE, dx), shift(HOCK, dx), 1.9, 1.5), layer }] },
    { id: `${side}hf`, parent: `${side}hl`, joint: shift(HOCK, dx), shapes: [{ d: capsule(shift(HOCK, dx), shift(HIND_TOE, dx), 1.6, 1.5), layer, hasEdge: true }] },
  ]
}

const foreLeg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}fu`, parent: 'c', joint: shift(SHOULDER, dx), shapes: [{ d: capsule(shift(SHOULDER, dx), shift(ELBOW, dx), 2.4, 1.7), layer, hasEdge: true }] },
    { id: `${side}fl`, parent: `${side}fu`, joint: shift(ELBOW, dx), shapes: [{ d: capsule(shift(ELBOW, dx), shift(WRIST, dx), 1.5, 1.3), layer, hasEdge: true }] },
    { id: `${side}ff`, parent: `${side}fl`, joint: shift(WRIST, dx), shapes: [{ d: capsule(shift(WRIST, dx), shift(FORE_TOE, dx), 1.3, 1.45), layer, hasEdge: true }] },
  ]
}

export const bunnyRig: Rig = {
  key: 'r',
  root: 'b',
  bones: [
    { id: 'b', parent: null, joint: v(0, -10), shapes: [] },
    { id: 'p', parent: 'b', joint: SPINE, shapes: [{ d: ellipse(-4, -10, 9.6, 8.6), layer: 'body' }] },
    ...hindLeg('f', FAR_HIND),
    { id: 'tl', parent: 'p', joint: v(-12.6, -9.4), shapes: [{ d: ellipse(-14.2, -9.2, 3.1, 2.9), layer: 'body' }] },
    { id: 'c', parent: 'b', joint: SPINE, shapes: [{ d: ellipse(5.6, -11.6, 6.4, 6.8), layer: 'body' }] },
    ...foreLeg('f', FAR_FORE),
    {
      id: 'h',
      parent: 'c',
      joint: v(8, -15.5),
      shapes: [
        { d: capsule(v(6.8, -14.2), v(10, -18), 4.4, 3.8), layer: 'body' },
        { d: ellipse(11.8, -19.6, 5.6, 4.9, -8), layer: 'body' },
      ],
    },
    { id: 'ef', parent: 'h', joint: v(9.4, -23.4), shapes: [{ d: capsule(v(9.4, -23.4), v(7.2, -35.2), 2.1, 1.7), layer: 'far' }], tips: [v(7, -36.4)] },
    { id: 'en', parent: 'h', joint: v(11.4, -23.6), shapes: [{ d: capsule(v(11.4, -23.6), v(10.2, -36.2), 2.3, 1.8), layer: 'body' }], tips: [v(10.1, -37.6)] },
    ...hindLeg('n', 0),
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
const toeOf = (leg: LegName) => bunnyRig.legs[leg]!.points[3]

// Hind feet lie flat (a few degrees down to the toe); front paws meet the
// ground at a steeper angle.
const FLAT = 8
const PAW = 33

const restFeet = (): Record<LegName, Foot> =>
  Object.fromEntries(LEGS.map(leg => [leg, { at: toeOf(leg), angle: leg.endsWith('h') ? FLAT : PAW }])) as Record<LegName, Foot>

type Pose = { readonly y: number; readonly bones: Readonly<Record<string, number>>; readonly feet: Readonly<Record<LegName, Foot>> }

export const CROUCH: Pose = { y: 0, bones: {}, feet: restFeet() }

// The loaf: body sunk onto the folded legs, ears laid back along the spine.
export const LOAF: Pose = {
  y: 2.6,
  bones: { h: 6, en: -66, ef: -70 },
  feet: { ...restFeet(), nf: { at: v(8.6, 0), angle: 120 }, ff: { at: v(6.8, 0), angle: 120 } },
}

// The periscope: up on the haunches, body upright, front paws held in, ears tall.
export const PERISCOPE: Pose = {
  y: -2.4,
  bones: { b: -52, h: 46, en: -6, ef: -4 },
  feet: { ...restFeet(), nf: { at: v(10, -9), angle: 100 }, ff: { at: v(8.4, -8.6), angle: 100 } },
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

// An ear twitch now and then, the near ear first.
const twitch = (t: number, period: number) => {
  const p = (t % period) / period
  const flick = p > 0.86 ? Math.sin(Math.PI * span(p, 0.86, 1)) : 0
  return { en: -14 * flick, ef: -6 * flick }
}

// ------------------------------------------------------------- the hop

// One hop of `distance` px forward over `seconds`, from crouch to crouch,
// as a rabbit does it: the body dips, the hind legs drive it up and forward
// with the heels lifting off the planted toes, then in flight the hind legs
// stretch straight out behind the body and the front legs reach ahead; the
// front paws land first, the body rocks over them, and the hind legs swing
// forward under the body to land folded; the ears trail on the rise and
// flop forward on landing.
export const hopFrame = (u: number, from: number, distance: number, base: Pose = CROUCH, facing = 1): Pose & { x: number } => {
  const to = from + distance
  const x = from + distance * smooth(span(u, 0.16, 0.82))
  const rise = span(u, 0.22, 0.7)
  const y = u < 0.16 ? 0.7 * Math.sin(Math.PI * span(u, 0, 0.32)) : rise > 0 && rise < 1 ? -9 * Math.sin(Math.PI * rise) : u < 0.86 ? 0.9 * Math.sin(Math.PI * span(u, 0.7, 0.86)) : 0
  const pitch =
    u < 0.16 ? lerp(0, 5, span(u, 0, 0.16)) :
    u < 0.3 ? lerp(5, -13, span(u, 0.16, 0.3)) :
    u < 0.5 ? lerp(-13, -2, span(u, 0.3, 0.5)) :
    u < 0.66 ? lerp(-2, 13, span(u, 0.5, 0.66)) :
    u < 0.82 ? lerp(13, 2, span(u, 0.66, 0.82)) :
    lerp(2, 0, span(u, 0.82, 1))
  // World positions into the body's own frame, which faces `facing`.
  const local = (world: number) => (world - x) * facing
  // Feet are given as x along the body and height above the ground; a point
  // carried with the body sits `drop` px below the body's own height.
  const carried = (drop: number) => y - drop
  // Hind feet: planted on the toes, heels rising, until lift-off; stretched
  // out behind in flight; swung forward under the body to land in the crouch.
  const liftOff = 0.3
  const stretched = 0.6
  const landed = 0.8
  const hind = (toe: Vec): Foot => {
    const planted = { at: v(local(from) + toe.x, 0), angle: u < 0.16 ? FLAT : lerp(FLAT, 72, span(u, 0.16, liftOff)) }
    if (u < liftOff) return planted
    const back = { at: v(toe.x - 25, carried(6)), angle: 172 }
    if (u < stretched) {
      const p = smooth(span(u, liftOff, stretched))
      return { at: v(lerp(planted.at.x, back.at.x, p), lerp(0, back.at.y, p)), angle: lerp(72, back.angle, p) }
    }
    const down = { at: v(toe.x, 0), angle: FLAT }
    if (u < landed) {
      const p = smooth(span(u, stretched, landed))
      return { at: v(lerp(back.at.x, down.at.x, p), lerp(back.at.y, 0, p) - 2 * Math.sin(Math.PI * p)), angle: lerp(back.angle, FLAT, p) }
    }
    return down
  }
  // Front paws: lift as the body rises, reach ahead through the flight, and
  // land first, where the hop ends, the body rocking over them.
  const foreLift = 0.22
  const foreLand = 0.64
  const fore = (toe: Vec): Foot => {
    if (u < foreLift) return { at: v(local(from) + toe.x, 0), angle: PAW }
    if (u >= foreLand) return { at: v(local(to) + toe.x, 0), angle: PAW }
    const p = span(u, foreLift, foreLand)
    const reach = { at: v(toe.x + 5, carried(4)), angle: 20 }
    if (p < 0.5) {
      const q = smooth(p / 0.5)
      return { at: v(lerp(local(from) + toe.x, reach.at.x, q), lerp(0, reach.at.y, q)), angle: lerp(PAW, reach.angle, q) }
    }
    const q = smooth((p - 0.5) / 0.5)
    return { at: v(lerp(reach.at.x, local(to) + toe.x, q), lerp(reach.at.y, 0, q)), angle: lerp(reach.angle, PAW, q) }
  }
  const feet: Record<LegName, Foot> = {
    nh: hind(toeOf('nh')),
    fh: hind(toeOf('fh')),
    nf: fore(toeOf('nf')),
    ff: fore(v(toeOf('ff').x - 1.2, 0)),
  }
  const ears = u < 0.16 ? 6 * span(u, 0, 0.16) : u < 0.5 ? lerp(6, -30, span(u, 0.16, 0.5)) : u < 0.74 ? lerp(-30, 16, span(u, 0.5, 0.74)) : lerp(16, 0, span(u, 0.74, 1))
  const spine = Math.sin(Math.PI * span(u, 0.18, 0.62))
  return {
    x,
    y: y + base.y,
    bones: { ...base.bones, b: pitch + (base.bones.b ?? 0), p: -6 * spine, c: 5 * spine, h: -pitch * 0.5, en: ears, ef: ears * 0.85, tl: -10 * spine },
    feet,
  }
}

// Hops along the number line tick by tick: `count` hops out, a pause, a
// turn, `count` hops back, a turn; a loop of `seconds`.
export const bunnyCounting = (tick: number, seconds: number, count = 3) => (t: number): Frame => {
  const hop = 0.9
  const out = 0.3
  const pause = out + count * hop + 0.9
  const back = pause + 0.4
  const home = back + count * hop
  const facing = turnFacing(t, [pause, home + 0.5], 0.2)
  const leg = (start: number, from: number, sign: number) => {
    const i = Math.floor((t - start) / hop)
    if (i < 0 || i >= count) return null
    const u = (t - start - i * hop) / hop
    const at = from + sign * i * tick
    const frame = hopFrame(u, at, sign * tick, CROUCH, sign)
    return { ...frame, facing }
  }
  const x = t > out && t < back ? count * tick : 0
  return leg(out, 0, 1) ?? leg(back, count * tick, -1) ?? frameOf(add(CROUCH, twitch(t, 2.2)), x, facing)
}

// Planting: hop forward one tick, dig with the front paws in turn, sit back
// to look, hop home; a loop of `seconds`.
export const bunnyPlanting = (tick: number, seconds: number) => (t: number): Frame => {
  const u = t / seconds
  const facing = turnFacing(u, [0.8, 0.95], 0.025)
  if (u < 0.14) {
    const hop = hopFrame(span(u, 0.02, 0.14), 0, tick)
    return { ...hop, facing }
  }
  if (u < 0.44) {
    const k = span(u, 0.16, 0.42)
    const lean = Math.sin(Math.PI * k)
    const scrape = (phase: number) => {
      const p = (k * 6 + phase) % 1
      return { at: v(toeOf('nf').x + 1.5 - 4 * p, p < 0.5 ? -1.6 * Math.sin(2 * Math.PI * p) : 0), angle: PAW + 30 * Math.sin(Math.PI * p) }
    }
    const feet = { ...CROUCH.feet, nf: scrape(0), ff: { ...scrape(0.5), at: v(scrape(0.5).at.x - 1.8, scrape(0.5).at.y) } }
    return frameOf({ y: 1.2 * lean, bones: { b: 12 * lean, h: 6 * lean, en: 10 * lean, ef: 8 * lean }, feet: lean > 0.05 ? feet : CROUCH.feet }, tick, facing)
  }
  if (u < 0.58) return frameOf(add(CROUCH, { h: -4, ...twitch(t, 1.4) }), tick, facing)
  if (u < 0.7) {
    // A pat: a small hop in place.
    const hop = hopFrame(span(u, 0.58, 0.7), tick, 0)
    return { ...hop, facing }
  }
  if (u < 0.8) return frameOf(CROUCH, tick, facing)
  if (u < 0.95) {
    const hop = hopFrame(span(u, 0.82, 0.94), tick, -tick, CROUCH, -1)
    return { ...hop, facing }
  }
  return frameOf(CROUCH, 0, facing)
}

// Resting about: a hop along and back, ears twitching, and now and then up
// on the haunches to look around; a loop of RESTING_SECONDS.
export const RESTING_SECONDS = 9
export const bunnyResting = (t: number): Frame => {
  const p = t % 9
  const facing = turnFacing(p, [2.9, 4.9], 0.2)
  if (p > 1 && p < 1.9) return { ...hopFrame(span(p, 1, 1.9), 0, 36), facing }
  if (p > 3.4 && p < 4.3) return { ...hopFrame(span(p, 3.4, 4.3), 36, -36, CROUCH, -1), facing }
  const x = p > 1 && p < 3.4 ? 36 : 0
  const up = p < 6 ? 0 : p < 6.5 ? smooth(span(p, 6, 6.5)) : p < 8.2 ? 1 : 1 - smooth(span(p, 8.2, 8.8))
  return frameOf(add(blend(CROUCH, PERISCOPE, up), { ...twitch(t, 3), h: up * 6 * Math.sin(t * 2.4) }), x, facing)
}

// Played with: three binkies in a row, then a shake of the ears; 3.2 s.
export const bunnyPlayed = (t: number): Frame => {
  if (t < 0.2 || t > 2.9) return frameOf(add(CROUCH, { en: -8 * Math.sin(t * 30) * (t > 2.9 ? 1 : 0) }), 0)
  return bunnyBinky(0.9)(t - 0.2)
}

// Asleep in the loaf, ears laid back, for a nap to settle into.
export const bunnyAsleep = (): Frame => frameOf(LOAF, 0)

// Frozen in alarm: flattened low, ears pinned back, the hind foot thumping.
export const bunnyAlarmed = (t: number): Frame => {
  const low = smooth(span(t, 0, 0.25))
  const thump = (t > 0.35 && t < 1.25 ? Math.max(0, Math.sin(2 * Math.PI * (t - 0.35) * 2.2)) : 0) * 2.8
  const feet = { ...CROUCH.feet, nh: { at: v(toeOf('nh').x, -thump), angle: FLAT + thump * 6 } }
  return frameOf({ y: 1.8 * low, bones: { en: -62 * low, ef: -64 * low, h: 6 * low, b: 3 * low }, feet }, 0)
}

// A binky: straight up, the body twisting in the air, hind feet kicking out.
export const bunnyBinky = (seconds: number) => (t: number): Frame => {
  const u = (t % seconds) / seconds
  const hop = hopFrame(span(u, 0.08, 0.7), 0, 0)
  const air = Math.sin(Math.PI * span(u, 0.26, 0.6))
  const kick = air * 10
  const feet = { ...hop.feet, nh: { ...hop.feet.nh, at: v(hop.feet.nh.at.x - kick, hop.feet.nh.at.y - kick * 0.6) }, fh: { ...hop.feet.fh, at: v(hop.feet.fh.at.x - kick, hop.feet.fh.at.y - kick * 0.6) } }
  return { ...hop, y: hop.y - air * 5, facing: 1, bones: { ...hop.bones, b: (hop.bones.b ?? 0) - 16 * air * Math.sin(Math.PI * 2 * span(u, 0.26, 0.6)) }, feet }
}

// Eating: crouched, head dipping to nibble.
export const bunnyEating = (t: number): Frame => frameOf(add(CROUCH, { h: 14 + 6 * Math.sin((2 * Math.PI * t) / 0.7), b: 4 }), 0)

// Peering in: crouched, leaning toward the prompt, ears up.
export const bunnyPeering = (t: number): Frame => frameOf(add(CROUCH, { b: 6 * smooth(span(t, 0, 0.6)), en: -6, ef: -4, h: 1.2 * Math.sin((2 * Math.PI * t) / 2.4) }), 0)

// Up on the haunches to look far off, ears swivelling.
export const bunnyLooking = (t: number): Frame =>
  frameOf(add(blend(CROUCH, PERISCOPE, smooth(span(t, 0.2, 0.8))), { en: 4 * Math.sin((2 * Math.PI * t) / 3), ef: 3 * Math.sin((2 * Math.PI * t) / 3 + 1) }), 0)

export const bunnyStill = (): Frame => frameOf(CROUCH, 0)

// Going from `from` to `to` px along the facing, for a scene change: hops of
// up to a tick, facing the way it goes.
export const bunnyGoing = (from: number, to: number, keep: number) => {
  const distance = Math.abs(to - from)
  // A short way is one hop as it stands, forward or back.
  const facing = distance < 20 ? (keep < 0 ? -1 : 1) : to < from ? -1 : 1
  const count = Math.max(1, Math.ceil(distance / 36))
  const step = (distance / count) * facing
  const hop = 0.75
  const seconds = count * hop
  return { seconds, facing, motion: (t: number): Frame => {
    const i = Math.min(count - 1, Math.floor(t / hop))
    return { ...hopFrame((t - i * hop) / hop, from + i * step, step, CROUCH, facing), facing }
  } }
}
