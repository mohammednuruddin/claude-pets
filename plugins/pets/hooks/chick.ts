// The chick: a jointed rig and the ways it moves. Faceless: no beak, no eyes;
// a round body, a head with a tuft, a wing, tail feathers and thin legs.
// Rest pose is standing, facing right, toes at y = 0.

import { capsule, ellipse, lerp, smooth, span, stepOf, travel, turnFacing, v } from './rig'
import type { Bone, Foot, Frame, Leg, Rig, Vec } from './rig'

const HIP = v(0.6, -4.8)
const KNEE = v(1.8, -2.9)
const ANKLE = v(0.6, -0.9)
const TOE = v(3, 0)
const FAR = -1.6

const shift = (p: Vec, dx: number) => v(p.x + dx, p.y)

const leg = (side: 'n' | 'f', dx: number): Bone[] => {
  const layer = side === 'n' ? 'near' : 'far'
  return [
    { id: `${side}u`, parent: 'p', joint: shift(HIP, dx), shapes: [{ d: capsule(shift(HIP, dx), shift(KNEE, dx), 0.8, 0.6), layer }] },
    { id: `${side}l`, parent: `${side}u`, joint: shift(KNEE, dx), shapes: [{ d: capsule(shift(KNEE, dx), shift(ANKLE, dx), 0.6, 0.55), layer }] },
    { id: `${side}f`, parent: `${side}l`, joint: shift(ANKLE, dx), shapes: [{ d: capsule(shift(ANKLE, dx), shift(TOE, dx), 0.55, 0.5), layer }] },
  ]
}

export const chickRig: Rig = {
  key: 'k',
  root: 'b',
  bones: [
    { id: 'b', parent: null, joint: v(0, -8), shapes: [] },
    ...leg('f', FAR),
    {
      id: 'p',
      parent: 'b',
      joint: v(0, -8),
      shapes: [
        { d: 'M-6.6,-10.4L-10.6,-14.4L-9.4,-10.2L-11.4,-11L-6.8,-6.6Z', layer: 'body' },
        { d: ellipse(0, -9, 7.2, 6.2), layer: 'body' },
      ],
    },
    {
      id: 'h',
      parent: 'p',
      joint: v(3.6, -13),
      shapes: [
        { d: ellipse(5.4, -16.6, 4.4, 4.2), layer: 'body' },
        { d: 'M4.6,-20.4C4.2,-23 6,-23.8 6.6,-22C7.6,-23.6 9.4,-22.4 7.8,-20.2Z', layer: 'body' },
      ],
    },
    { id: 'w', parent: 'p', joint: v(2.4, -10.6), shapes: [{ d: 'M2.4,-10.6C0.4,-8.6 -3.4,-8.4 -5.4,-10.8C-2.8,-11.8 0.2,-11.8 2.4,-10.6Z', layer: 'near', hasEdge: true }] },
    ...leg('n', 0),
  ],
  legs: {
    n: { bones: ['nu', 'nl', 'nf'], points: [HIP, KNEE, ANKLE, TOE], bend: 1 },
    f: { bones: ['fu', 'fl', 'ff'], points: [shift(HIP, FAR), shift(KNEE, FAR), shift(ANKLE, FAR), shift(TOE, FAR)], bend: 1 },
  } satisfies Record<string, Leg>,
}

const TOE_ANGLE = 22
const restFeet = () => ({ n: { at: TOE, angle: TOE_ANGLE }, f: { at: shift(TOE, FAR), angle: TOE_ANGLE } })

type Pose = { readonly y: number; readonly bones: Readonly<Record<string, number>>; readonly feet: Readonly<Record<'n' | 'f', Foot>> }
export const STAND: Pose = { y: 0, bones: {}, feet: restFeet() }
// Tucked down to sleep: legs folded away under the round body, head sunk.
export const TUCK: Pose = { y: 3.4, bones: { h: 18, w: 4 }, feet: { n: { at: v(2.4, -0.2), angle: 0 }, f: { at: v(0.8, -0.2), angle: 0 } } }

const frameOf = (pose: Pose, x: number, facing = 1): Frame => ({ x, y: pose.y, facing, bones: pose.bones, feet: pose.feet })
const add = (pose: Pose, extra: Readonly<Record<string, number>>): Pose => {
  const bones: Record<string, number> = { ...pose.bones }
  for (const [k, a] of Object.entries(extra)) bones[k] = (bones[k] ?? 0) + a
  return { ...pose, bones }
}

// A peck: a quick tip forward to the ground, a beat there, and back up.
const peckAt = (p: number) => (p < 0.08 ? 34 * smooth(p / 0.08) : p < 0.16 ? 34 : p < 0.24 ? 34 * (1 - smooth((p - 0.16) / 0.08)) : 0)

// Pottering: pecking at the ground in pairs, looking about between, turning
// now and then; a loop of POTTERING_SECONDS.
export const POTTERING_SECONDS = 11
export const chickPottering = (t: number): Frame => {
  const p = (t % 2.75) / 2.75
  const peck = peckAt(p) + peckAt((p + 0.72) % 1)
  return frameOf(add(STAND, { b: peck * 0.7, h: peck * 0.5 + 6 * Math.sin(t * 1.4) * (peck === 0 ? 1 : 0) }), 0, turnFacing(t % 11, [4.2, 9.2], 0.12))
}

// Running, `covered` px into a run: quick little steps, each foot planted
// half the cycle, body leaning into it, wing half out. RUN_STRIDE px of
// ground a cycle, so a planted foot never slides.
const RUN_STRIDE = 9
const running = (covered: number): Pose => {
  const cycle = covered / RUN_STRIDE
  const sweep = RUN_STRIDE * 0.5
  const a = stepOf(cycle, 0, 0.5, sweep, 1.8)
  const b = stepOf(cycle, 0.5, 0.5, sweep, 1.8)
  return {
    y: -0.6 * Math.abs(Math.sin(2 * Math.PI * cycle)),
    bones: { b: 10, h: -8, w: -18 },
    feet: { n: { at: v(TOE.x + a.dx, a.dy), angle: TOE_ANGLE + 50 * a.swing * (1 - a.swing) * 4 }, f: { at: v(TOE.x + FAR + b.dx, b.dy), angle: TOE_ANGLE + 50 * b.swing * (1 - b.swing) * 4 } },
  }
}

const blendPose = (a: Pose, b: Pose, u: number): Pose => {
  const bones: Record<string, number> = {}
  for (const k of new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])) bones[k] = lerp(a.bones[k] ?? 0, b.bones[k] ?? 0, u)
  const foot = (p: Foot, q: Foot): Foot => ({ at: v(lerp(p.at.x, q.at.x, u), lerp(p.at.y, q.at.y, u)), angle: lerp(p.angle, q.angle, u) })
  return { y: lerp(a.y, b.y, u), bones, feet: { n: foot(a.feet.n, b.feet.n), f: foot(a.feet.f, b.feet.f) } }
}

// A run from `from` to `to` px over [start, end] s, always forward along
// the facing, out of a stand and back into one.
const run = (t: number, from: number, to: number, start: number, end: number, facing: number): Frame => {
  const x = lerp(from, to, travel(t, start, end, 0.15))
  const settle = Math.min(smooth(span(t, start, start + 0.12)), 1 - smooth(span(t, end - 0.12, end)))
  return frameOf(blendPose(STAND, running(Math.abs(x - from)), settle), x, facing)
}

// Following the bunny along the number line: it sets off after the first
// hop and hurries to keep up, turns when the bunny does, and hurries home.
export const chickFollowing = (tick: number, seconds: number, count = 3) => (t: number): Frame => {
  const far = tick * count
  const out = [1.1, 1.1 + count * 0.75] as const
  const back = [seconds * 0.57, seconds * 0.57 + count * 0.75] as const
  const facing = turnFacing(t, [back[0] - 0.3, seconds - 0.5], 0.12)
  if (t > out[0] && t < out[1]) return run(t, 0, far, out[0], out[1], facing)
  if (t > back[0] && t < back[1]) return run(t, far, 0, back[0], back[1], facing)
  const x = t <= out[0] || t >= back[1] ? 0 : far
  return frameOf(add(STAND, { b: peckAt(((t / seconds) * 7) % 1) * 0.5 }), x, facing)
}

// Played with: a flurry of flapping hops, then a shake of the feathers; 3.2 s.
export const chickPlayed = (t: number): Frame => {
  if (t < 2.4) return chickHopping(t)
  return frameOf(add(STAND, { b: 3 * Math.sin(t * 40) * (1 - span(t, 2.6, 3.2)), w: -10 }), 0)
}

// Peering at the flask: leaning in, head cocked one way then the other,
// and two excited hops with wings out.
export const chickPeering = (t: number): Frame => {
  const p = (t % 4.2) / 4.2
  const cock = p < 0.3 ? 10 : p < 0.5 ? -6 : 10
  const hop = p > 0.74 && p < 0.92 ? Math.abs(Math.sin(Math.PI * span(p, 0.74, 0.92) * 2)) : 0
  return frameOf(add({ ...STAND, y: -5 * hop }, { b: 8, h: cock, w: -30 * hop }), 0)
}

// Flying ahead: a crouch, wings beating, up to hover and look far off, then
// down to land with the legs reaching.
export const chickFlying = (t: number): Frame => {
  const p = (t % 5.4) / 5.4
  const up = p < 0.1 ? 0 : p < 0.3 ? smooth(span(p, 0.1, 0.3)) : p < 0.7 ? 1 : p < 0.86 ? 1 - smooth(span(p, 0.7, 0.86)) : 0
  const crouch = p > 0.04 && p < 0.1 ? 2 : 0
  const beat = up > 0 ? -40 + 34 * Math.sin(2 * Math.PI * t * 7) : 0
  const bob = up * 1.5 * Math.sin(2 * Math.PI * t * 1.4)
  return {
    x: 40 * Math.sin(Math.PI * span(p, 0.1, 0.86)),
    y: crouch - 22 * up + bob,
    facing: 1,
    bones: { b: up > 0 && p < 0.3 ? -12 : p > 0.7 && p < 0.86 ? 10 : 0, w: beat, h: -4 * up },
    feet: up > 0.2 ? { n: { at: v(TOE.x - 1, -1), angle: 70 }, f: { at: v(TOE.x + FAR - 1, -1), angle: 70 } } : restFeet(),
  }
}

// Bolting from danger: a startled jump, a run back, and cowering low.
export const chickBolting = (t: number): Frame => {
  const facing = turnFacing(t, [0.12], 0.1)
  if (t < 0.3) return frameOf({ ...STAND, y: -5 * Math.sin(Math.PI * span(t, 0, 0.3)) }, 0, facing)
  if (t < 1.3) return run(t, 0, -40, 0.3, 1.3, facing)
  return frameOf(blendPose(STAND, TUCK, smooth(span(t, 1.3, 1.6))), -40, facing)
}

// Asleep, tucked down, for a nap to settle into.
export const chickAsleep = (): Frame => frameOf(TUCK, 0)

export const chickEating = (t: number): Frame => {
  const p = (t % 0.8) / 0.8
  return frameOf(add(STAND, { b: peckAt(p) * 0.9, h: peckAt(p) * 0.4 }), 0)
}

export const chickHopping = (t: number): Frame => {
  const p = (t % 0.45) / 0.45
  return frameOf(add({ ...STAND, y: -5 * Math.sin(Math.PI * p) }, { w: -30 * Math.sin(Math.PI * p) }), 0)
}

export const chickLeaning = (t: number): Frame => frameOf(add(STAND, { b: 10 * smooth(span(t, 0, 0.6)) }), 0)

export const chickStill = (): Frame => frameOf(STAND, 0)

// Going from `from` to `to` px along the facing, for a scene change: a run
// facing the way it goes.
export const chickGoing = (from: number, to: number, keep: number) => {
  const seconds = Math.max(0.4, Math.abs(to - from) / 55)
  const facing = Math.abs(to - from) < 16 ? (keep < 0 ? -1 : 1) : to < from ? -1 : 1
  return { seconds, facing, motion: (t: number) => run(t, from, to, 0, seconds, facing) }
}
