// The cat: a jointed rig and the ways it moves. Faceless: head and ears only.
// Rest pose is standing, facing right, paws on the ground at y = 0. Poses
// (sitting, the loaf, the arch) are the same skeleton turned, never a
// separate drawing, so every change of pose is real motion.

import { capsule, ellipse, jumping, lerp, smooth, span, stepOf, travel, turnFacing, v } from './rig'
import type { Bone, Foot, Frame, Leg, Rig, Vec } from './rig'

const HIP = v(-10.5, -15)
const KNEE = v(-6.6, -9.2)
const HOCK = v(-11.8, -3.4)
const HIND_TOE = v(-8.8, 0)
const SHOULDER = v(8.6, -14)
const ELBOW = v(7.2, -7.4)
const WRIST = v(8.4, -1.8)
const FORE_TOE = v(10.9, 0)
const FAR_HIND = 1.8
const FAR_FORE = -1.8

const shift = (p: Vec, dx: number) => v(p.x + dx, p.y)

const hindLeg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}hu`, parent: 'p', joint: shift(HIP, dx), shapes: [{ d: capsule(shift(HIP, dx), shift(KNEE, dx), 3.7, 2.2), layer, hasEdge: true }] },
    { id: `${side}hl`, parent: `${side}hu`, joint: shift(KNEE, dx), shapes: [{ d: capsule(shift(KNEE, dx), shift(HOCK, dx), 1.8, 1.25), layer }] },
    { id: `${side}hf`, parent: `${side}hl`, joint: shift(HOCK, dx), shapes: [{ d: capsule(shift(HOCK, dx), shift(HIND_TOE, dx), 1.25, 1.5), layer }] },
  ]
}

const foreLeg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}fu`, parent: 'c', joint: shift(SHOULDER, dx), shapes: [{ d: capsule(shift(SHOULDER, dx), shift(ELBOW, dx), 3, 1.9), layer, hasEdge: true }] },
    { id: `${side}fl`, parent: `${side}fu`, joint: shift(ELBOW, dx), shapes: [{ d: capsule(shift(ELBOW, dx), shift(WRIST, dx), 1.6, 1.35), layer }] },
    { id: `${side}ff`, parent: `${side}fl`, joint: shift(WRIST, dx), shapes: [{ d: capsule(shift(WRIST, dx), shift(FORE_TOE, dx), 1.35, 1.5), layer }] },
  ]
}

const TAIL: Vec[] = [v(-16.8, -20), v(-21.8, -19.8), v(-25.9, -22.6), v(-27.7, -27.2), v(-27.5, -31.8)]
const TAIL_R = [1.7, 1.55, 1.4, 1.25, 1.05]
const ROOT = v(0, -17)
const SPINE = v(-1, -17.5)

export const catRig: Rig = {
  key: 'c',
  root: 'b',
  bones: [
    { id: 'b', parent: null, joint: ROOT, shapes: [] },
    { id: 'p', parent: 'b', joint: SPINE, shapes: [{ d: ellipse(-8.5, -17, 9, 6), layer: 'body' }] },
    ...hindLeg('f', FAR_HIND),
    ...TAIL.slice(0, -1).map((p, i) => ({
      id: `t${i + 1}`,
      parent: i === 0 ? 'p' : `t${i}`,
      joint: p,
      shapes: [{ d: capsule(p, TAIL[i + 1]!, TAIL_R[i]!, TAIL_R[i + 1]!), layer: 'body' as const }],
      tips: i === 3 ? [v(-27.5, -32.2)] : undefined,
    })),
    ...hindLeg('n', 0),
    { id: 'c', parent: 'b', joint: SPINE, shapes: [{ d: ellipse(5.5, -17.5, 8.6, 6.2), layer: 'body' }] },
    ...foreLeg('f', FAR_FORE),
    {
      id: 'h',
      parent: 'c',
      joint: v(12.5, -21),
      shapes: [
        { d: capsule(v(11, -19.5), v(16, -25), 3.8, 3.2), layer: 'body' },
        { d: 'M15.3,-29.7L16.2,-35.9L19.4,-30.9Z', layer: 'body' },
        { d: 'M19,-31.1L22.4,-35.5L23.2,-29.1Z', layer: 'body' },
        { d: ellipse(18.6, -26.7, 5.4, 4.8), layer: 'body' },
      ],
      tips: [v(16.2, -36.1), v(22.4, -35.7)],
    },
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
const isHind = (leg: LegName) => leg === 'nh' || leg === 'fh'
const toeOf = (leg: LegName) => catRig.legs[leg]!.points[3]

// How each foot meets the ground (ankle to toe), flat on the ground, and
// curled while the leg swings.
const STANDING = { hind: 47, fore: 34 }
const CURLED = { hind: 100, fore: 115 }

// ------------------------------------------------------------- poses

// A pose: the body's place, its bone angles, and its feet as offsets from
// where they rest standing; everything blends, so poses flow into each other.
type Pose = {
  readonly x: number
  readonly y: number
  readonly bones: Readonly<Record<string, number>>
  readonly feet: Readonly<Record<LegName, Foot>>
}

const standingFeet = (): Record<LegName, Foot> =>
  Object.fromEntries(LEGS.map(leg => [leg, { at: toeOf(leg), angle: isHind(leg) ? STANDING.hind : STANDING.fore }])) as Record<LegName, Foot>

const TAIL_UP = { t1: -8, t2: -4, t3: 4, t4: 6 }

export const STAND: Pose = { x: 0, y: 0, bones: { ...TAIL_UP }, feet: standingFeet() }

// Sitting: the body pitched up about the hips, haunch on the ground, front
// legs straight under the chest, hind feet flat forward, head level, tail
// curled round in front of the paws.
export const SIT: Pose = {
  x: -2,
  y: 4.4,
  bones: { b: -40, p: 16, h: 34, t1: -10, t2: -96, t3: -84, t4: -50 },
  feet: {
    nh: { at: v(-1, 0), angle: 3 },
    fh: { at: v(1, 0), angle: 3 },
    nf: { at: v(10.4, 0), angle: 40 },
    ff: { at: v(8.6, 0), angle: 40 },
  },
}

// The loaf: lowered onto folded legs, front paws tucked under, head sunk a
// little, tail wrapped along the side.
export const LOAF: Pose = {
  x: 0,
  y: 7.6,
  bones: { h: 16, t1: -78, t2: -106, t3: -65, t4: -44 },
  feet: {
    nh: { at: v(-4.6, -0.4), angle: 2 },
    fh: { at: v(-2.8, -0.4), angle: 2 },
    nf: { at: v(7.6, -1.4), angle: 168 },
    ff: { at: v(5.8, -1.4), angle: 168 },
  },
}

// Crouched to stalk: belly low, shoulders up, head level and forward.
export const CROUCH: Pose = {
  x: 0,
  y: 4.6,
  bones: { b: -3, h: -2, t1: 10, t2: 6, t3: 0, t4: 0 },
  feet: { ...standingFeet(), nh: { at: v(-10.6, 0), angle: 30 }, fh: { at: v(-8.6, 0), angle: 30 } },
}

// The Halloween arch: spine bowed up, legs straight and stiff, tail up and
// bristling.
export const ARCH: Pose = {
  x: 0,
  y: -3,
  bones: { p: 26, c: -26, h: 22, t1: -58, t2: -6, t3: 4, t4: 6 },
  feet: {
    nh: { at: v(-5.6, 0), angle: 64 },
    fh: { at: v(-3.8, 0), angle: 64 },
    nf: { at: v(6.6, 0), angle: 64 },
    ff: { at: v(4.8, 0), angle: 64 },
  },
}

const mixFeet = (a: Record<LegName, Foot>, b: Record<LegName, Foot>, u: number) =>
  Object.fromEntries(
    LEGS.map(leg => [leg, { at: v(lerp(a[leg].at.x, b[leg].at.x, u), lerp(a[leg].at.y, b[leg].at.y, u)), angle: lerp(a[leg].angle, b[leg].angle, u) }]),
  ) as Record<LegName, Foot>

export const blend = (a: Pose, b: Pose, u: number): Pose => {
  const keys = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])
  const bones: Record<string, number> = {}
  for (const k of keys) bones[k] = lerp(a.bones[k] ?? 0, b.bones[k] ?? 0, u)
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), bones, feet: mixFeet(a.feet, b.feet, u) }
}

const withBones = (pose: Pose, extra: Readonly<Record<string, number>>): Pose => {
  const bones: Record<string, number> = { ...pose.bones }
  for (const [k, a] of Object.entries(extra)) bones[k] = (bones[k] ?? 0) + a
  return { ...pose, bones }
}

// A pose as a frame, placed at `x` facing `facing`.
const frameOf = (pose: Pose, x: number, facing: number): Frame => ({ x: x + pose.x * Math.sign(facing || 1), y: pose.y, facing, bones: pose.bones, feet: pose.feet })

// ------------------------------------------------------------- motions

// The tail's slow swish: a wave from base to tip.
const swish = (t: number, period: number, amplitude: number) => ({
  t1: amplitude * 0.5 * Math.sin((2 * Math.PI * t) / period),
  t2: amplitude * 0.7 * Math.sin((2 * Math.PI * t) / period - 0.6),
  t3: amplitude * Math.sin((2 * Math.PI * t) / period - 1.2),
  t4: amplitude * 1.2 * Math.sin((2 * Math.PI * t) / period - 1.8),
})

// Walking, `covered` px along the facing so far (negative backing away),
// `stride` px a cycle, lateral sequence: near hind, near fore, far hind, far
// fore, each planted 62% of the cycle. The cycle runs on the ground covered,
// not the clock, so a planted paw stays put whatever the pace.
const walking = (base: Pose, covered: number, stride: number, lift = 3): Pose => {
  const cycle = Math.abs(covered) / stride
  const direction = covered < 0 ? -1 : 1
  const phases: Record<LegName, number> = { nh: 0, nf: 0.25, fh: 0.5, ff: 0.75 }
  const feet = { ...base.feet }
  for (const leg of LEGS) {
    const step = stepOf(cycle, phases[leg], 0.62, stride * 0.62, lift)
    const flat = base.feet[leg].angle
    const curled = isHind(leg) ? CURLED.hind : CURLED.fore
    feet[leg] = {
      at: v(base.feet[leg].at.x + direction * step.dx, base.feet[leg].at.y + step.dy),
      angle: step.isPlanted ? flat : lerp(flat, curled, Math.sin(Math.PI * step.swing)),
    }
  }
  return {
    ...base,
    y: base.y - 0.5 * Math.sin(4 * Math.PI * cycle),
    bones: { ...base.bones, b: (base.bones.b ?? 0) + 0.8 * Math.sin(2 * Math.PI * cycle), h: (base.bones.h ?? 0) - 0.8 * Math.sin(2 * Math.PI * cycle) },
    feet,
  }
}

// A walk from `from` to `to` px over [start, end] s while facing `facing`,
// out of `base` and back into it: the first and last steps blend in, so
// nothing pops. Travel against the facing is a walk backwards.
const walk = (t: number, base: Pose, from: number, to: number, start: number, end: number, facing: number, stride: number, lift = 3) => {
  const x = lerp(from, to, travel(t, start, end))
  const settle = Math.min(smooth(span(t, start, start + 0.2)), 1 - smooth(span(t, end - 0.2, end)))
  return { pose: blend(base, walking(base, (x - from) * (facing < 0 ? -1 : 1), stride, lift), settle), x }
}

// Sitting about, watching: head turning to follow things, tail swishing;
// every period divides SITTING_SECONDS, so the loop never jumps.
export const SITTING_SECONDS = 6
export const catSitting = (t: number): Frame => {
  const look = 6 * Math.sin((2 * Math.PI * t) / 6) + 3 * Math.sin((2 * Math.PI * t) / 2)
  return frameOf(withBones(SIT, { h: look, ...swish(t, 3, 10) }), 0, 1)
}

// Reading: sitting, head bowed over the book, a small nod at each page; a
// loop of READING_SECONDS, two pages.
export const READING_SECONDS = 5.2
export const catReading = (t: number): Frame => {
  const nod = 4 * Math.max(0, Math.sin((2 * Math.PI * t) / 2.6))
  return frameOf(withBones(SIT, { h: 18 + nod, b: 4, ...swish(t, 5.2, 6) }), 0, 1)
}

// The hunt, one 7.2-second loop from sitting back to sitting: stand, stalk
// low on two slow steps, sink and wiggle the hindquarters, spring, land
// front paws first, look, turn, walk back, turn and sit.
export const HUNT_SECONDS = 7.2
export const catHunt = (t: number): Frame => {
  // Body travel along the facing, in px from home.
  const stalkEnd = 16
  const leapEnd = 44
  if (t < 0.9) return catSitting(t)
  if (t < 1.5) return frameOf(blend(SIT, STAND, smooth(span(t, 0.9, 1.5))), 0, 1)
  if (t < 3) {
    // The stalk: low, slow, one careful step a paw.
    const low = blend(STAND, CROUCH, smooth(span(t, 1.5, 1.9)))
    const { pose, x } = walk(t, low, 0, stalkEnd, 1.6, 3, 1, 10, 2.4)
    return frameOf(withBones(pose, swish(t, 2, 6)), x, 1)
  }
  if (t < 3.8) {
    // The wiggle: hind feet treading in turn, hindquarters rocking, tail lashing.
    const u = span(t, 3, 3.8)
    const deeper = blend(CROUCH, { ...CROUCH, y: 6.2 }, smooth(span(t, 3, 3.3)))
    const tread = (phase: number) => Math.max(0, Math.sin(2 * Math.PI * (u * 3 + phase))) * 1.6
    const feet = { ...deeper.feet, nh: { ...deeper.feet.nh, at: v(deeper.feet.nh.at.x, -tread(0)) }, fh: { ...deeper.feet.fh, at: v(deeper.feet.fh.at.x, -tread(0.5)) } }
    return frameOf(withBones({ ...deeper, feet }, { p: 3 * Math.sin(2 * Math.PI * u * 3), t1: -20 + 18 * Math.sin(2 * Math.PI * u * 4), t2: 14 * Math.sin(2 * Math.PI * u * 4 - 1), t3: 10, t4: 6 }), stalkEnd, 1)
  }
  if (t < 4.75) {
    // The spring: hind feet push until they leave the ground, the body
    // stretches long in a ballistic arc, front paws reach and land first.
    const u = span(t, 3.8, 4.75)
    const travel = leapEnd - stalkEnd
    const flight = span(u, 0.18, 0.72)
    const bodyX = stalkEnd + travel * smooth(span(u, 0.08, 0.85))
    const lift = flight > 0 && flight < 1 ? 13 * Math.sin(Math.PI * flight) : 0
    const pitch = u < 0.2 ? lerp(0, -16, span(u, 0, 0.2)) : u < 0.55 ? lerp(-16, 6, span(u, 0.2, 0.55)) : u < 0.78 ? lerp(6, 14, span(u, 0.55, 0.78)) : lerp(14, 0, span(u, 0.78, 1))
    const stretch = Math.sin(Math.PI * clampUnit(span(u, 0.15, 0.75)))
    const crouchY = lerp(6.2, 2, smooth(span(u, 0, 0.18)))
    const local = (worldX: number) => worldX - bodyX
    const hindFrom = stalkEnd
    const hindTo = leapEnd
    const hindPlanted = u < 0.22
    const hindLanded = u > 0.8
    const hindX = hindPlanted ? hindFrom : hindLanded ? hindTo : lerp(hindFrom, hindTo, smooth(span(u, 0.22, 0.8)))
    const hindY = hindPlanted || hindLanded ? 0 : -6 * Math.sin(Math.PI * span(u, 0.22, 0.8))
    const foreLift = u < 0.12 ? 0 : u < 0.66 ? -8 * Math.sin(Math.PI * span(u, 0.12, 0.66)) : 0
    const foreX = u < 0.12 ? stalkEnd : u < 0.66 ? lerp(stalkEnd, leapEnd + 3, smooth(span(u, 0.12, 0.66))) : leapEnd + 3
    const feet: Record<LegName, Foot> = {
      nh: { at: v(local(hindX) + toeOf('nh').x, hindY), angle: hindPlanted ? lerp(30, 75, span(u, 0, 0.22)) : hindLanded ? 40 : 110 },
      fh: { at: v(local(hindX) + toeOf('fh').x, hindY), angle: hindPlanted ? lerp(30, 75, span(u, 0, 0.22)) : hindLanded ? 40 : 110 },
      nf: { at: v(local(foreX) + toeOf('nf').x, foreLift), angle: u < 0.12 || u > 0.66 ? 40 : lerp(40, 10, Math.sin(Math.PI * span(u, 0.12, 0.66))) },
      ff: { at: v(local(foreX) + toeOf('ff').x - 1.5, foreLift * 0.9), angle: u < 0.12 || u > 0.66 ? 40 : lerp(40, 10, Math.sin(Math.PI * span(u, 0.12, 0.66))) },
    }
    return {
      x: bodyX,
      y: (u < 0.18 ? crouchY : lerp(2, 0, span(u, 0.72, 1))) - lift,
      facing: 1,
      bones: { b: pitch, p: -6 * stretch, c: 6 * stretch, h: -pitch * 0.6, t1: -14, t2: -8 + 10 * stretch, t3: 6, t4: 6 },
      feet,
    }
  }
  if (t < 5.3) return frameOf(withBones(STAND, { h: -6 * Math.sin(Math.PI * span(t, 4.75, 5.3)), ...swish(t, 1.2, 10) }), leapEnd, 1)
  if (t < 6.75) {
    // Turn about, walk home, turn back.
    const facing = turnFacing(t, [5.3, 6.55])
    const { pose, x } = walk(t, STAND, leapEnd, 0, 5.45, 6.55, -1, 16)
    return frameOf(withBones(pose, swish(t, 2, 6)), x, facing)
  }
  return frameOf(blend(STAND, SIT, smooth(span(t, 6.75, 7.2))), 0, 1)
}

const clampUnit = (u: number) => Math.min(1, Math.max(0, u))

// Eating: standing over the bowl, head down, a bob at every bite.
export const catEating = (t: number): Frame => frameOf(withBones(STAND, { h: 34 + 6 * Math.sin((2 * Math.PI * t) / 0.8), b: 6, ...swish(t, 1.6, 8) }), 0, 1)

// Startled: up into the arch, then three stiff steps back, and holding.
export const catStartled = (t: number): Frame => {
  if (t < 0.5) return frameOf(blend(SIT, ARCH, smooth(span(t, 0, 0.35))), 0, 1)
  const { pose, x } = walk(t, ARCH, 0, -10, 0.5, 1.4, 1, 8, 2)
  return frameOf(pose, x, 1)
}

// Asleep in the loaf, for a nap to settle into.
export const catAsleep = (): Frame => frameOf(LOAF, 0, 1)

// Looking toward something far off: standing, turned around, tail up.
export const catLookingAhead = (t: number): Frame =>
  frameOf(withBones(STAND, { h: -4 + 2 * Math.sin((2 * Math.PI * t) / 6), ...swish(t, 3, 8) }), 0, turnFacing(t, [0.3]))

// Peering in at the prompt: sitting, leaning forward and down a little.
export const catPeering = (t: number): Frame => {
  const lean = smooth(span(t, 0, 0.7))
  return frameOf(withBones(SIT, { b: 10 * lean, h: 10 * lean, ...swish(t, 2.4, 4) }), 0, 1)
}

// Played with: a sink into the crouch, a tall pounce straight up with the
// back arched and the tail up, a landing, and a swish; 3.2 s.
export const catPlayed = (t: number): Frame => {
  if (t < 0.5) return frameOf(blend(STAND, CROUCH, smooth(span(t, 0, 0.4))), 0, 1)
  if (t < 1.4) {
    const u = span(t, 0.5, 1.4)
    const air = Math.sin(Math.PI * span(u, 0.2, 0.8))
    return { ...jumping(frameOf(STAND, 0, 1), u, 18), bones: { b: -10 * air, p: 14 * air, c: -14 * air, h: 12 * air, t1: -40 * air, t2: -10, t3: 4, t4: 6 } }
  }
  return frameOf(withBones(STAND, { h: 4 * Math.sin((t - 1.4) * 5), ...swish(t, 1.2, 12) }), 0, 1)
}

// Going from `from` to `to` px along the facing, for a scene change: a walk
// at a cat's pace, facing the way it goes; the seconds it takes come with it.
// A short way is a few steps as it stands, backwards if need be; a long way
// it turns to face.
export const catGoing = (from: number, to: number, keep: number) => {
  const seconds = Math.max(0.5, Math.abs(to - from) / 44)
  const facing = Math.abs(to - from) < 30 ? (keep < 0 ? -1 : 1) : to < from ? -1 : 1
  return { seconds, facing, motion: (t: number): Frame => {
    const { pose, x } = walk(t, STAND, from, to, 0, seconds, facing, 16)
    return frameOf(withBones(pose, swish(t, 2, 6)), x, facing)
  } }
}

// Standing still, for dancing and cheering from.
export const catStill = (): Frame => frameOf(STAND, 0, 1)
