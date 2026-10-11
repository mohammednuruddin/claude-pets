// Shared drawing pieces for the pets band and the /wrapped card, in the Zo
// midnight style: the palette, placement helpers, star points, and the
// props the pets use. The pets themselves are rigs (rig.ts and one file per
// pet), faceless by construction (Zo's asset rule).

export type Point = readonly [number, number]

export const COLORS = {
  starlight: '#EDE7D9',
  coral: '#F2664B',
  teal: '#46C2A5',
  cyan: '#58AED6',
  gold: '#F5B73F',
} as const

export const at = ([x, y]: Point, inner: string) => `<g transform="translate(${x} ${y})">${inner}</g>`

// A CSS rotation or scale turns about the element's local origin, so an
// animated part is moved to its pivot, animated there, and moved back.
export const pivot = ([x, y]: Point, cls: string, inner: string) =>
  `<g transform="translate(${x} ${y})"><g class="${cls}"><g transform="translate(${-x} ${-y})">${inner}</g></g></g>`

export const STAR = 'M0,-1 Q.16,-.16 1,0 Q.16,.16 0,1 Q-.16,.16 -1,0 Q-.16,-.16 0,-1 Z'

export const sparkle = (where: Point, size: number, color: string, cls = '') =>
  at(where, `<g${cls ? ` class="${cls}"` : ''}><path d="${STAR}" transform="scale(${size})" fill="${color}"/></g>`)

// ------------------------------------------------------------------ props

const line = (d: string, color: string, width = 1, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`

// An open book on the ground with a page that turns about the spine.
export const book = () =>
  `<path d="M-7,0 L-7.4,-4.4 C-4.6,-5.4 -1.8,-5 0,-3.8 C1.8,-5 4.6,-5.4 7.4,-4.4 L7,0 C4.6,-0.8 1.8,-0.6 0,0.4 C-1.8,-0.6 -4.6,-0.8 -7,0 Z" ` +
  `fill="${COLORS.starlight}" fill-opacity=".1" stroke="${COLORS.starlight}" stroke-width="1" stroke-linejoin="round"/>` +
  line('M0,-3.8 V0.4', COLORS.starlight, 0.8) +
  pivot([0, -1.7], 'page', line('M0,-3.8 C1.8,-5 4.6,-5.4 7.2,-4.4 L6.8,0 C4.6,-0.8 1.8,-0.6 0,0.4', COLORS.starlight, 0.9, ' stroke-opacity=".8"'))

// A small lantern whose warm light breathes.
export const lantern = () =>
  `<circle class="lamp-glow" cy="-6" r="9" fill="url(#lamp)"/>` +
  line('M-2.4,-11.6 C-2.4,-14.4 2.4,-14.4 2.4,-11.6', COLORS.starlight, 0.9) +
  `<path d="M-3.2,-11.4 H3.2 L2.6,-1.2 H-2.6 Z" fill="${COLORS.gold}" fill-opacity=".16" stroke="${COLORS.starlight}" stroke-width="1" stroke-linejoin="round"/>` +
  line('M-3.6,-1 H3.6', COLORS.starlight, 1.1) +
  `<ellipse class="flame" cy="-5.6" rx="1.2" ry="2" fill="${COLORS.gold}"/>`

// A flask with bubbles rising through it: a test running.
export const flask = () =>
  `<path d="M-1.8,-12 L-1.8,-8 L-6,-1.2 Q-6.6,0 -5.2,0 L5.2,0 Q6.6,0 6,-1.2 L1.8,-8 L1.8,-12" fill="none" ` +
  `stroke="${COLORS.starlight}" stroke-width="1" stroke-linejoin="round"/>` +
  line('M-2.8,-12 H2.8', COLORS.starlight, 1) +
  `<path d="M-4.4,-2.6 L4.4,-2.6 L5.6,-0.8 Q5.8,-0.4 5.2,-0.4 L-5.2,-0.4 Q-5.8,-0.4 -5.6,-0.8 Z" fill="${COLORS.teal}" fill-opacity=".45"/>` +
  [-1.6, 0.8, 2.2]
    .map((x, i) => `<g class="bubble bubble-${i}"><circle cx="${x}" cy="-3" r=".9" fill="none" stroke="${COLORS.teal}" stroke-width=".7"/></g>`)
    .join('')

// A rain cloud for failing tests, drawn in the same light as everything else.
export const rainCloud = () =>
  `<g class="cloud-drift">` +
  `<path d="M-14,2 C-18.4,2 -18.4,-5 -12.4,-5.2 C-11.6,-11 -3.4,-12 -0.4,-7.2 C2.8,-12 12.2,-11 11.2,-4.6 C16.8,-4.6 17,2 12,2 Z" ` +
  `fill="#8E97AA" fill-opacity=".22" stroke="#9AA3B5" stroke-width="1.1" stroke-linejoin="round"/>` +
  [-9, -4, 1, 6, 10]
    .map((x, i) => `<g class="drop drop-${i}">${line(`M${x},5 l-1,3`, COLORS.cyan, 0.9)}</g>`)
    .join('') +
  `</g>`
