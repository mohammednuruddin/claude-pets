// Colours for a pet drawn in light: its line, and opaque fills mixed toward
// the band behind it (dark by default, light under a light theme), so parts
// that overlap read as one silhouette.

import type { Palette } from './rig'

const BAND_DARK = [38, 38, 36] as const
const BAND_LIGHT = [250, 249, 245] as const

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const mix = (hex: string, band: readonly number[], amount: number) =>
  '#' +
  rgb(hex)
    .map((c, i) => Math.round(band[i]! + (c - band[i]!) * amount))
    .map(c => c.toString(16).padStart(2, '0'))
    .join('')

export const paletteOf = (line: string): Palette => ({
  line,
  fill: mix(line, BAND_DARK, 0.14),
  farLine: mix(line, BAND_DARK, 0.5),
  farFill: mix(line, BAND_DARK, 0.07),
  lightFill: mix(line, BAND_LIGHT, 0.12),
  lightFarFill: mix(line, BAND_LIGHT, 0.06),
})
