// The /wrapped card: one midnight picture of the session so far, its numbers
// set in starlight beside the constellation it drew and the pets on their
// number line. A standalone SVG, so it can be saved and shared as it is.

import { COLORS, at, sparkle } from './art'
import { bunnyRig, bunnyStill } from './bunny'
import { catRig, catSitting } from './cat'
import { chickRig, chickStill } from './chick'
import { dogRig, dogStill } from './dog'
import { paletteOf } from './palette'
import { drawRig, solve } from './rig'
import type { Frame, Rig } from './rig'
import { CONSTELLATION, CONSTELLATION_SIZE, MAX_SPROUTS } from './scene'

export type SessionStats = {
  readonly startedAt: number
  readonly calls: { readonly read: number; readonly edit: number; readonly run: number; readonly test: number; readonly web: number; readonly agent: number }
  readonly testsPassed: number
  readonly testsFailed: number
  readonly files: readonly string[]
  readonly answers: number
  readonly busyMs: number
  readonly longestTurnMs: number
  readonly guarded: number
}

const WIDTH = 640
const HEIGHT = 300
const LINE = 276
const FONT = `font-family="ui-rounded, 'SF Pro Rounded', system-ui, sans-serif"`

const label = (x: number, y: number, size: number, weight: number, content: string, opacity = 1, color: string = COLORS.starlight) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" fill-opacity="${opacity}" ${FONT}>${content}</text>`

export const durationOf = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clockOf = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

export const spanOf = (from: number, to: number) => {
  const start = new Date(from)
  return `${MONTHS[start.getMonth()]} ${start.getDate()} · ${clockOf(start)}–${clockOf(new Date(to))}`
}

const constellation = (lit: number) => {
  const box = { x: 404, y: 34, w: 206, h: 104 }
  const points = CONSTELLATION.map(([u, v]) => [Math.round(box.x + u * box.w), Math.round(box.y + v * box.h)] as const)
  const links = points
    .slice(1, lit)
    .map((p, i) => {
      const q = points[i] as readonly [number, number]
      return `<path d="M${q[0]},${q[1]} L${p[0]},${p[1]}" stroke="${COLORS.starlight}" stroke-opacity=".38" stroke-width="1"/>`
    })
    .join('')
  const stars = points
    .map((p, i) => (i < lit ? sparkle(p, 3.6, COLORS.gold) : `<circle cx="${p[0]}" cy="${p[1]}" r="1.1" fill="${COLORS.starlight}" fill-opacity=".2"/>`))
    .join('')
  return links + stars
}

const sprout = (x: number) =>
  `<path d="M${x},${LINE - 2} C${x},${LINE - 5} ${x + 0.4},${LINE - 7} ${x},${LINE - 9.4}" stroke="${COLORS.teal}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
  `<path d="M${x},${LINE - 6.4} C${x - 2.6},${LINE - 7.2} ${x - 3.6},${LINE - 9.4} ${x - 3.4},${LINE - 10.4} C${x - 1.6},${LINE - 10} ${x - 0.4},${LINE - 8.6} ${x},${LINE - 6.4} Z" fill="${COLORS.teal}" fill-opacity=".35" stroke="${COLORS.teal}" stroke-width=".9"/>` +
  `<path d="M${x},${LINE - 8} C${x + 2.4},${LINE - 8.6} ${x + 3.4},${LINE - 10.6} ${x + 3.2},${LINE - 11.6} C${x + 1.6},${LINE - 11.2} ${x + 0.4},${LINE - 10} ${x},${LINE - 8} Z" fill="${COLORS.teal}" fill-opacity=".35" stroke="${COLORS.teal}" stroke-width=".9"/>`

export const wrappedCard = (stats: SessionStats, now: number) => {
  const commands = stats.calls.run + stats.calls.test
  const tests = stats.testsPassed + stats.testsFailed
  const cells: readonly (readonly [string, string, string])[] = [
    [String(stats.calls.read), 'files read', COLORS.coral],
    [String(stats.calls.edit), 'edits', COLORS.cyan],
    [String(commands), 'commands', COLORS.teal],
    [String(stats.answers), 'answers', COLORS.gold],
    [String(stats.files.length), 'files changed', COLORS.cyan],
    [tests > 0 ? `${stats.testsPassed}/${tests}` : '0', 'test runs passed', COLORS.teal],
  ]
  const grid = cells
    .map(([value, name, color], i) => {
      const x = 28 + (i % 3) * 122
      const y = 116 + Math.floor(i / 3) * 62
      return (
        `<path d="M${x},${y - 30} h12" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` +
        label(x, y, 30, 700, value) +
        label(x, y + 16, 11, 500, name, 0.55)
      )
    })
    .join('')
  const notes = [
    `Longest turn ${durationOf(stats.longestTurnMs)}`,
    `Busy ${durationOf(stats.busyMs)}`,
    stats.guarded > 0 ? `${stats.guarded} risky ${stats.guarded === 1 ? 'command' : 'commands'} checked with you` : 'Nothing risky tried',
  ].join('   ·   ')
  const ticks = Array.from({ length: 19 }, (_, i) => 20 + i * 32)
    .map(x => `<path d="M${x},${LINE - 2} V${LINE + 2.4}" stroke="${COLORS.starlight}" stroke-opacity=".3" stroke-width="1" stroke-linecap="round"/>`)
    .join('')
  const sprouts = Array.from({ length: Math.min(stats.calls.edit, MAX_SPROUTS) }, (_, i) => sprout(20 + i * 32)).join('')
  // The pets drawn still, from the same rigs as the band.
  const styles: string[] = []
  const pet = (x: number, rig: Rig, frame: Frame, color: string, isFacingLeft: boolean) => {
    const drawn = drawRig(rig, paletteOf(color), solve(rig, frame))
    styles.push(drawn.css)
    const mirror = isFacingLeft ? -1 : 1
    return (
      `<defs>${drawn.defs}</defs>` +
      at([x + mirror * frame.x, LINE + frame.y], `<g transform="scale(${mirror * frame.facing} 1)">${drawn.body}</g>`)
    )
  }
  const pets =
    pet(452, chickRig, chickStill(), COLORS.starlight, false) +
    pet(492, bunnyRig, bunnyStill(), COLORS.cyan, false) +
    pet(552, catRig, catSitting(0), COLORS.coral, true) +
    pet(604, dogRig, dogStill(), COLORS.teal, true)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<style>${styles.join('')}</style>` +
    `<rect x=".5" y=".5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="18" fill="#0E1116" stroke="${COLORS.starlight}" stroke-opacity=".12"/>` +
    label(28, 46, 22, 700, 'Session wrapped') +
    label(28, 66, 12, 500, spanOf(stats.startedAt, now), 0.55) +
    constellation(Math.min(stats.answers, CONSTELLATION_SIZE)) +
    grid +
    label(28, 238, 11, 500, notes, 0.6) +
    `<path d="M0,${LINE + 0.5} H${WIDTH}" stroke="${COLORS.starlight}" stroke-opacity=".3" stroke-width="1"/>` +
    ticks +
    sprouts +
    pets +
    `</svg>`
  )
}

export const wrappedText = (stats: SessionStats, savedTo: string | null) => {
  const tests = stats.testsPassed + stats.testsFailed
  return (
    `Session wrapped: ${stats.calls.read} files read, ${stats.calls.edit} edits, ${stats.calls.run + stats.calls.test} commands, ` +
    `${stats.answers} answers, ${stats.files.length} files changed` +
    (tests > 0 ? `, ${stats.testsPassed} of ${tests} test runs passed` : '') +
    `; longest turn ${durationOf(stats.longestTurnMs)}.` +
    (savedTo ? ` Card saved to ${savedTo}.` : '')
  )
}
