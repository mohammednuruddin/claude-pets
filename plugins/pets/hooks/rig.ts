// Skeletal line art for the pets: each pet is a tree of bones that turn about
// joints, drawn at rest in absolute coordinates (ground at y = 0, facing
// right). CSS turns the bones (forward kinematics: a child rides its parent's
// rotation); motions are sampled here, with legs solved by inverse kinematics
// so a planted foot stays planted while the body moves over it. The result is
// plain keyframes, so the drawing still plays as an image with no script.

import { COLORS, STAR } from './art'

export type Vec = { readonly x: number; readonly y: number }
export const v = (x: number, y: number): Vec => ({ x, y })

export type Layer = 'far' | 'body' | 'near'

// A closed outline drawn in its bone's rest frame. Far parts sit behind the
// body in a dimmer light; near parts of limbs get an edge drawn over the body.
export type Shape = { readonly d: string; readonly layer: Layer; readonly hasEdge?: boolean }

export type Bone = {
  readonly id: string
  readonly parent: string | null
  readonly joint: Vec
  readonly shapes: readonly Shape[]
  readonly tips?: readonly Vec[]
}

// A three-part leg: upper, lower and foot bones, their rest joints from the
// hip down to the toe, and which way the middle joint folds (+1 forward, as
// a cat's knee; -1 backward, as an elbow).
export type Leg = {
  readonly bones: readonly [string, string, string]
  readonly points: readonly [Vec, Vec, Vec, Vec]
  readonly bend: 1 | -1
}

export type Rig = {
  readonly key: string
  readonly root: string
  readonly bones: readonly Bone[]
  readonly legs: Readonly<Record<string, Leg>>
}

const f = (n: number) => String(Math.round(n * 100) / 100)
const f1 = (n: number) => String(Math.round(n * 10) / 10)

// A limb segment: a tapered capsule from a to b.
export const capsule = (a: Vec, b: Vec, ra: number, rb: number) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = -(b.y - a.y) / len
  const ny = (b.x - a.x) / len
  const p = (q: Vec, r: number) => `${f(q.x + nx * r)},${f(q.y + ny * r)}`
  return `M${p(a, ra)}L${p(b, rb)}A${f(rb)},${f(rb)} 0 0 0 ${p(b, -rb)}L${p(a, -ra)}A${f(ra)},${f(ra)} 0 0 0 ${p(a, ra)}Z`
}

export const ellipse = (cx: number, cy: number, rx: number, ry: number, deg = 0) => {
  const t = (deg * Math.PI) / 180
  const pt = (a: number) => {
    const x = rx * Math.cos(a)
    const y = ry * Math.sin(a)
    return `${f(cx + x * Math.cos(t) - y * Math.sin(t))},${f(cy + x * Math.sin(t) + y * Math.cos(t))}`
  }
  return `M${pt(0)}A${f(rx)},${f(ry)} ${f(deg)} 1 1 ${pt(Math.PI)}A${f(rx)},${f(ry)} ${f(deg)} 1 1 ${pt(0)}Z`
}

// ----------------------------------------------------------------- drawing

export type Palette = {
  readonly line: string
  readonly fill: string
  readonly farLine: string
  readonly farFill: string
  readonly lightFill: string
  readonly lightFarFill: string
}

const childrenOf = (rig: Rig) => {
  const map = new Map<string | null, Bone[]>()
  for (const bone of rig.bones) map.set(bone.parent, [...(map.get(bone.parent) ?? []), bone])
  return map
}


// Which numbers of each path command are x and y coordinates; the shapes
// here are written in absolute commands only.
const ROLES: Readonly<Record<string, readonly ('x' | 'y' | 'n')[]>> = {
  M: ['x', 'y'],
  L: ['x', 'y'],
  T: ['x', 'y'],
  H: ['x'],
  V: ['y'],
  C: ['x', 'y', 'x', 'y', 'x', 'y'],
  S: ['x', 'y', 'x', 'y'],
  Q: ['x', 'y', 'x', 'y'],
  A: ['n', 'n', 'n', 'n', 'n', 'x', 'y'],
  Z: [],
}

// A path moved by (dx, dy), its numbers set to one decimal: a shape drawn
// in rest coordinates, brought into its bone's own frame.
export const movePath = (d: string, dx: number, dy: number) => {
  let roles: readonly ('x' | 'y' | 'n')[] = []
  let index = 0
  let out = ''
  for (const token of d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? []) {
    if (/[A-Za-z]/.test(token)) {
      const known = ROLES[token]
      if (known === undefined) throw new Error(`movePath: only absolute commands, got ${token}`)
      roles = known
      index = 0
      out += token
      continue
    }
    const role = roles[index % roles.length]
    const n = Number(token)
    out += (index > 0 ? ' ' : '') + f1(role === 'x' ? n + dx : role === 'y' ? n + dy : n)
    index++
  }
  return out
}

// Draws the rig as light: far limbs dim behind; the body's outline under an
// opaque fill, so overlapping parts read as one silhouette; near limbs with
// an edge over the body; star points last. Every pass repeats the same bone
// groups, so one set of animations moves all of them together. Given `pose`
// (turns from `solve`), it is drawn still in that pose instead, with plain
// transform attributes any SVG viewer reads.
export const drawRig = (rig: Rig, palette: Palette, pose?: Readonly<Record<string, number>>) => {
  const kids = childrenOf(rig)
  // Shapes are kept in their bone's own frame (joint at the origin), so a
  // pass refers to them with no offset.
  const defs: string[] = []
  rig.bones.forEach(bone =>
    bone.shapes.forEach((shape, i) => defs.push(`<path id="${rig.key}${bone.id}_${i}" d="${movePath(shape.d, -bone.joint.x, -bone.joint.y)}"/>`)),
  )
  // Each bone is one group, set at its joint (from its parent's joint) by a
  // fixed `translate` and turned there by its class's `rotate`: the single
  // transform properties apply translate after rotate, so the bone turns
  // about its own joint. Drawn still, the turn is baked in alongside.
  const place = (dx: number, dy: number, turn = 0) => {
    const isPlaced = Math.abs(dx) >= 0.005 || Math.abs(dy) >= 0.005
    if (pose !== undefined) {
      const parts = (isPlaced ? `translate(${f(dx)} ${f(dy)})` : '') + (Math.abs(turn) >= 0.05 ? ` rotate(${f1(turn)})` : '')
      return parts ? ` transform="${parts.trim()}"` : ''
    }
    return isPlaced ? ` style="translate:${f(dx)}px ${f(dy)}px"` : ''
  }
  // With `glows`, each shape is drawn twice in the one tree: a wide faint
  // stroke under its line, so the glow and the outline share the bone groups.
  const pass = (pick: (shape: Shape) => boolean, paint: string, tips = false, glows = false) => {
    const tree = (bone: Bone, origin: Vec): string => {
      const { x, y } = bone.joint
      const own = bone.shapes
        .map((shape, i) => (pick(shape) ? `${glows ? `<use href="#${rig.key}${bone.id}_${i}" class="glow"/>` : ''}<use href="#${rig.key}${bone.id}_${i}"/>` : ''))
        .join('')
      const stars = tips
        ? // A star point's twinkle animates `transform`, applied before the `translate` placing it.
          (bone.tips ?? []).map(t => `<g class="tip"${place(t.x - x, t.y - y)}><path d="${STAR}" transform="scale(1.7)"/></g>`).join('')
        : ''
      const inner = own + stars + (kids.get(bone.id) ?? []).map(child => tree(child, bone.joint)).join('')
      if (!inner) return ''
      return `<g class="${rig.key}${bone.id}"${place(x - origin.x, y - origin.y, pose?.[bone.id] ?? 0)}>${inner}</g>`
    }
    const body = (kids.get(null) ?? []).map(root => tree(root, v(0, 0))).join('')
    return body ? `<g ${paint}>${body}</g>` : ''
  }
  const isFar = (s: Shape) => s.layer === 'far'
  const isMain = (s: Shape) => s.layer !== 'far'
  return {
    defs: defs.join(''),
    body:
      pass(isFar, `class="${rig.key}-farfill" stroke="${palette.farLine}" stroke-width="1.6" stroke-linejoin="round"`) +
      pass(isMain, `fill="none" stroke="${palette.line}" stroke-width="2.7" stroke-linejoin="round"`, false, true) +
      pass(isMain, `class="${rig.key}-fill" stroke="none"`) +
      pass(s => s.layer === 'near' && s.hasEdge === true, `fill="none" stroke="${palette.line}" stroke-width="1.1" stroke-opacity=".75" stroke-linejoin="round"`) +
      pass(() => false, `fill="${COLORS.gold}"`, true),
    // Fills for a dark ground, and the same for a light one.
    css: `.${rig.key}-fill{fill:${palette.fill}}.${rig.key}-farfill{fill:${palette.farFill}}.glow{stroke-width:5;stroke-opacity:.14}`,
    lightCss: `.${rig.key}-fill{fill:${palette.lightFill}}.${rig.key}-farfill{fill:${palette.lightFarFill}}`,
  }
}

// ------------------------------------------------------------- kinematics

type Matrix = readonly [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const turnAbout = (p: Vec, deg: number): Matrix => {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [c, s, -s, c, p.x - c * p.x + s * p.y, p.y - s * p.x - c * p.y]
}
const apply = (m: Matrix, p: Vec): Vec => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })
const DEG = 180 / Math.PI
const angleOf = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x) * DEG
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

// Forward kinematics: where each bone's rest frame sits once every bone is
// turned by `turns` (read when called, so later turns count).
const forward = (rig: Rig, turns: Readonly<Record<string, number>>) => {
  const byId = new Map(rig.bones.map(bone => [bone.id, bone]))
  const world = (id: string | null): Matrix => {
    if (id === null) return IDENTITY
    const bone = byId.get(id) as Bone
    return mul(world(bone.parent), turnAbout(bone.joint, turns[id] ?? 0))
  }
  return world
}

// One instant of a motion: where the pet is (x, y from its home spot) and
// which way it faces (1 as drawn, -1 mirrored, values between while it
// turns), the angles of bones set directly, and where each leg puts its toe
// and at what angle the foot meets it: x along the body's own facing from
// its position, y above the ground (0 on it). A leg with no target keeps the
// angles it is given.
export type Foot = { readonly at: Vec; readonly angle: number }
export type Frame = {
  readonly x: number
  readonly y: number
  readonly facing: number
  readonly bones: Readonly<Record<string, number>>
  readonly feet: Readonly<Record<string, Foot | undefined>>
}

// Every bone's turn (degrees from rest) for one frame: direct angles first,
// then each targeted leg solved in two-bone IK from its hip, as the body now
// carries it, to its ankle (the toe target less the foot).
export const solve = (rig: Rig, frame: Frame) => {
  const turns: Record<string, number> = {}
  for (const bone of rig.bones) turns[bone.id] = frame.bones[bone.id] ?? 0
  const byId = new Map(rig.bones.map(bone => [bone.id, bone]))
  const world = forward(rig, turns)
  const turnOf = (id: string | null): number => (id === null ? 0 : (turns[id] ?? 0) + turnOf(byId.get(id)?.parent ?? null))
  for (const [name, leg] of Object.entries(rig.legs)) {
    const target = frame.feet[name]
    if (target === undefined) continue
    const [upper, lower, foot] = leg.bones
    const [h0, k0, a0, t0] = leg.points
    const parent = byId.get(upper)?.parent ?? null
    const hip = apply(world(parent), h0)
    const l1 = Math.hypot(k0.x - h0.x, k0.y - h0.y)
    const l2 = Math.hypot(a0.x - k0.x, a0.y - k0.y)
    const l3 = Math.hypot(t0.x - a0.x, t0.y - a0.y)
    // The body is drawn raised or lowered by frame.y; the ground moves the other way.
    const toe = v(target.at.x, target.at.y - frame.y)
    const fa = (target.angle * Math.PI) / 180
    const ankle = v(toe.x - l3 * Math.cos(fa), toe.y - l3 * Math.sin(fa))
    const d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, Math.hypot(ankle.x - hip.x, ankle.y - hip.y)))
    const base = Math.atan2(ankle.y - hip.y, ankle.x - hip.x)
    const spread = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    const knees = [base + spread, base - spread].map(a => v(hip.x + l1 * Math.cos(a), hip.y + l1 * Math.sin(a)))
    const side = (k: Vec) => (ankle.x - hip.x) * (k.y - hip.y) - (ankle.y - hip.y) * (k.x - hip.x)
    const knee = (leg.bend === 1 ? knees.find(k => side(k) < 0) : knees.find(k => side(k) > 0)) ?? (knees[0] as Vec)
    const w1 = angleOf(hip, knee) - angleOf(h0, k0)
    const w2 = angleOf(knee, ankle) - angleOf(k0, a0)
    const w3 = target.angle - angleOf(a0, t0)
    turns[upper] = wrap(w1 - turnOf(parent))
    turns[lower] = wrap(w2 - w1)
    turns[foot] = wrap(w3 - w2)
  }
  return turns
}

// Where a point drawn on `bone` (rest coordinates) is in a frame, in the
// pet's own frame: x along its home facing, y down from the ground. A prop
// the pet carries or pushes follows this, so it stays with the body.
export const pointOn = (rig: Rig, frame: Frame, bone: string, point: Vec): Vec => {
  const p = apply(forward(rig, solve(rig, frame))(bone), point)
  return v(frame.x + frame.facing * p.x, frame.y + p.y)
}

// A blend of two frames, for handing one motion to another without a jump:
// place, turns and foot targets all move together.
export const mixFrames = (a: Frame, b: Frame, u: number): Frame => {
  const bones: Record<string, number> = {}
  for (const k of new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])) bones[k] = lerp(a.bones[k] ?? 0, b.bones[k] ?? 0, u)
  const feet: Record<string, Foot | undefined> = {}
  for (const k of new Set([...Object.keys(a.feet), ...Object.keys(b.feet)])) {
    const from = a.feet[k]
    const to = b.feet[k]
    feet[k] =
      from !== undefined && to !== undefined
        ? { at: v(lerp(from.at.x, to.at.x, u), lerp(from.at.y, to.at.y, u)), angle: lerp(from.angle, to.angle, u) }
        : u < 0.5
          ? from
          : to
  }
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), facing: lerp(a.facing, b.facing, u), bones, feet }
}

// ------------------------------------------------------------- keyframes

// Drops samples a straight line between neighbours already gives, within
// `tolerance`, so a sampled motion costs keys only where it bends.
const simplify = (times: readonly number[], values: readonly (readonly number[])[], tolerance: number) => {
  const keep = new Set([0, times.length - 1])
  const visit = (a: number, b: number) => {
    let worst = -1
    let worstAt = -1
    for (let i = a + 1; i < b; i++) {
      const u = (times[i]! - times[a]!) / (times[b]! - times[a]! || 1)
      const error = Math.max(...values[i]!.map((x, c) => Math.abs(x - (values[a]![c]! + (values[b]![c]! - values[a]![c]!) * u))))
      if (error > worst) {
        worst = error
        worstAt = i
      }
    }
    if (worst > tolerance && worstAt > 0) {
      keep.add(worstAt)
      visit(a, worstAt)
      visit(worstAt, b)
    }
  }
  visit(0, times.length - 1)
  return [...keep].sort((a, b) => a - b)
}

// Keys use the single transform properties (rotate, translate, scale): a
// third shorter than `transform:` and the same to the renderer.
const keys = (name: string, times: readonly number[], values: readonly (readonly number[])[], tolerance: number, format: (value: readonly number[]) => string) =>
  `@keyframes ${name}{` +
  simplify(times, values, tolerance)
    .map(i => `${f1(times[i]!)}%{${format(values[i]!)}}`)
    .join('') +
  `}`

// How a motion plays: its length, when it starts, whether it loops; a
// one-shot fills `both` ways unless told otherwise. `keepsStill` emits even
// still channels, so a one-shot that must override a loop holds every bone.
export type Timing = {
  readonly seconds: number
  readonly delay?: number
  readonly isLooping: boolean
  readonly fill?: string
  readonly keepsStill?: boolean
  // How many times a loop plays; left out, forever. A finite run lets a
  // drawing come to rest, after which the renderer stops repainting it.
  readonly count?: number
  // Thinning tolerance as a multiple of the usual; a brief move between
  // scenes can take coarser keys than a motion that loops in view.
  readonly coarseness?: number
  // Samples a second; the usual when left out. Fewer for a motion that is
  // brief or runs in every scene, so its keys stay cheap.
  readonly samplesPerSecond?: number
}

// Sampling and thinning: enough for smooth motion at band size, few enough
// keys that four pets fit in one drawing. A turn may stray from its samples
// by what moves the bone's far end ANGLE_ERROR px, so long bones (the spine)
// keep fine keys and short ones (a toe) coarse; travel strays MOVE_TOLERANCE.
const SAMPLES_PER_SECOND = 16
const ANGLE_ERROR = 0.9
const MOVE_TOLERANCE = 0.5

// How far each bone reaches: to the farthest joint, toe or tip it carries,
// with a margin for the shapes round them.
const reachOf = (rig: Rig) => {
  const kids = childrenOf(rig)
  const toes = new Map(Object.values(rig.legs).map(leg => [leg.bones[2], leg.points[3]] as const))
  const points = (bone: Bone): Vec[] => [
    bone.joint,
    ...(bone.tips ?? []),
    ...(toes.has(bone.id) ? [toes.get(bone.id) as Vec] : []),
    ...(kids.get(bone.id) ?? []).flatMap(points),
  ]
  return (bone: Bone) => 5 + Math.max(...points(bone).map(p => Math.hypot(p.x - bone.joint.x, p.y - bone.joint.y)))
}

// One sampled motion: its keyframes, and the animation each element should
// add for it. A caller merges entries per element, so motions can stack: a
// later entry wins while it runs (a one-shot over a loop, say).
export type Track = { readonly keyframes: string; readonly entries: readonly (readonly [selector: string, animation: string])[] }

// Samples a motion over its length: one rotation channel per bone that
// moves, the pet's travel on `move` and its facing on `face`. Samples are
// thinned to the keys a straight line between them cannot stand in for.
export const track = (rig: Rig, name: string, motion: (t: number) => Frame, timing: Timing, selectors: { readonly move: string; readonly face: string }): Track => {
  const steps = Math.max(12, Math.round(timing.seconds * (timing.samplesPerSecond ?? SAMPLES_PER_SECOND)))
  const times: number[] = []
  const turns: Record<string, number>[] = []
  const moves: [number, number][] = []
  const faces: [number][] = []
  for (let i = 0; i <= steps; i++) {
    const frame = motion((i / steps) * timing.seconds)
    times.push((i / steps) * 100)
    turns.push(solve(rig, frame))
    moves.push([frame.x, frame.y])
    faces.push([frame.facing])
  }
  const fill = timing.isLooping ? (timing.count === undefined ? 'infinite' : String(timing.count)) : timing.fill ?? 'both'
  const delay = timing.delay ?? 0
  const run = `${f(timing.seconds)}s linear${delay === 0 ? '' : ` ${f(delay)}s`} ${fill}`
  const css: string[] = []
  const entries: [string, string][] = []
  const reach = reachOf(rig)
  const coarseness = timing.coarseness ?? 1
  for (const bone of rig.bones) {
    const series = turns.map(t => [t[bone.id] ?? 0])
    if (!timing.keepsStill && series.every(([a]) => Math.abs(a!) < 0.05)) continue
    const anim = `${name}${bone.id}`
    css.push(keys(anim, times, series, (coarseness * ANGLE_ERROR / reach(bone)) * DEG, ([a]) => `rotate:${f1(a!)}deg`))
    entries.push([`.${rig.key}${bone.id}`, `${anim} ${run}`])
  }
  if (timing.keepsStill || moves.some(([x, y]) => Math.abs(x) > 0.01 || Math.abs(y) > 0.01)) {
    css.push(keys(`${name}M`, times, moves, coarseness * MOVE_TOLERANCE, ([x, y]) => `translate:${f1(x!)}px ${f1(y!)}px`))
    entries.push([selectors.move, `${name}M ${run}`])
  }
  if (timing.keepsStill || faces.some(([s]) => s !== 1)) {
    css.push(keys(`${name}F`, times, faces, 0.02, ([s]) => `scale:${f(s!)} 1`))
    entries.push([selectors.face, `${name}F ${run}`])
  }
  return { keyframes: css.join(''), entries }
}

// A prop's path as keyframes `name`, sampled and thinned like a motion:
// `at` gives where it is at each time over `seconds`.
export const pathKeys = (name: string, seconds: number, at: (t: number) => Vec) => {
  const steps = Math.max(16, Math.round(seconds * SAMPLES_PER_SECOND))
  const times: number[] = []
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const p = at((i / steps) * seconds)
    times.push((i / steps) * 100)
    points.push([p.x, p.y])
  }
  return keys(name, times, points, MOVE_TOLERANCE, ([x, y]) => `translate:${f1(x!)}px ${f1(y!)}px`)
}

// ------------------------------------------------------------ gait helpers

// Facing through a turn that starts at `at` and takes `seconds`: the body
// narrows edge-on and opens the other way.
// How far along a trip from `start` to `end` s the body is, 0 to 1: it
// gathers speed over a short ramp, keeps an even pace, and slows over the
// same ramp, as legs can. (A smoothstep instead runs its middle half again
// faster than the average, and the feet cannot keep up.)
export const travel = (t: number, start: number, end: number, ramp = 0.25) => {
  const total = end - start
  const r = Math.min(ramp, total / 3)
  const pace = 1 / (total - r)
  const s = Math.min(total, Math.max(0, t - start))
  if (s < r) return (pace * s * s) / (2 * r)
  if (s > total - r) return 1 - (pace * (total - s) ** 2) / (2 * r)
  return pace * (r / 2 + s - r)
}

export const turnFacing = (t: number, turns: readonly number[], seconds = 0.14, startsAt = 1) => {
  let facing = startsAt
  for (const at of turns) {
    if (t >= at + seconds) facing = -facing
    else if (t > at) return facing * Math.cos((Math.PI * (t - at)) / seconds)
  }
  return facing
}

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u
export const clamp01 = (u: number) => Math.min(1, Math.max(0, u))
export const smooth = (u: number) => {
  const c = clamp01(u)
  return c * c * (3 - 2 * c)
}
// Position within [start, end] as 0..1.
export const span = (t: number, start: number, end: number) => clamp01((t - start) / (end - start))

// A walking foot over one cycle, in the body's frame: planted for `duty` of
// the cycle while the body passes over it, then lifted in an arc and swung
// forward. `phase` sets where in the cycle this foot is planted.
export const stepOf = (cycle: number, phase: number, duty: number, stride: number, lift: number) => {
  const p = (((cycle - phase) % 1) + 1) % 1
  if (p < duty) return { dx: stride * (0.5 - p / duty), dy: 0, isPlanted: true, swing: 0 }
  const s = (p - duty) / (1 - duty)
  return { dx: stride * (-0.5 + smooth(s)), dy: -lift * Math.sin(Math.PI * s), isPlanted: false, swing: s }
}

// A jump in place over u in [0, 1], for any pet: it sinks onto bending legs,
// springs, flies with its feet tucked up, and lands absorbing the drop.
export const jumping = (frame: Frame, u: number, height: number): Frame => {
  const sink = u < 0.25 ? 2 * Math.sin((Math.PI * u) / 0.25) : 0
  const air = u > 0.25 && u < 0.75 ? Math.sin((Math.PI * (u - 0.25)) / 0.5) : 0
  const land = u > 0.75 && u < 0.95 ? 1.6 * Math.sin((Math.PI * (u - 0.75)) / 0.2) : 0
  const feet: Record<string, Foot | undefined> = {}
  for (const [leg, foot] of Object.entries(frame.feet)) {
    feet[leg] = foot === undefined ? undefined : { ...foot, at: v(foot.at.x, foot.at.y - height * air - 2.2 * air) }
  }
  return { ...frame, y: frame.y + sink + land - height * air, feet }
}
