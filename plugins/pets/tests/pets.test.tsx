import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { framesAt, petsScene } from '../hooks/scene'
import type { SceneInput } from '../hooks/scene'

const props = (isWorking: boolean) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 20,
  bodyColumns: 94,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

const mountBand = ($: Parameters<TestBody>[0], isWorking: boolean) =>
  $.ui.mount({ plugin: 'pets', surface: 'desktop', component: 'AbovePrompt', props: props(isWorking) })

// The desktop surface validates the whole tree (image Svg, overlaid Buttons)
// on every draw, so a prop it refuses fails the mount or the redraw.
test('the band follows the session and the activity buttons', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 3, 10) })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const ui = await mountBand($, false)
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source ?? '')

  expect(await source()).toMatch('.z-chk-0{animation:zfloat')
  expect(await source()).not.toMatch('.cstar-new{animation:pop')
  // A resting band comes fully to rest: nothing loops forever, the stars
  // and the pets' potter loops included, so the renderer can stop.
  expect(await source()).toMatch('.rays{animation-iteration-count:1}')
  expect(await source()).not.toMatch(/Potter[^,;}]* infinite/)

  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await source()).toMatch('.cstar-new{animation:pop')

  // A second activity started before the first ran out keeps its full time:
  // the first one's timer must not end it.
  await ui.press({ key: 'feed' })
  expect(await source()).toMatch('.bowl{animation:bowlIn')
  await clock.advance(6000)
  await ui.press({ key: 'play' })
  await clock.advance(6500)
  expect(await source()).toMatch('ball-x')
  await clock.advance(6000)
  expect(await source()).not.toMatch('ball-x')
  await ui.unmount()

  const terminal = await $.ui.mount({ plugin: 'pets', surface: 'terminal', component: 'AbovePrompt', props: props(false) })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  await terminal.unmount()
})

// The scene follows the newest call in flight; a finished call's drift back
// to thinking must never cut short a call that started after it.
test('the pets act out the newest call, and a finished call never cuts a newer one short', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 3, 10) })
  on('tool.call', { tool: 'Read' }, () => ({ result: 'text' }))
  // The edit stays in flight until the test lets it finish.
  let finishEdit = () => {}
  const editGate = new Promise<void>(resolve => {
    finishEdit = resolve
  })
  on('tool.call', { tool: 'Edit' }, async () => {
    await editGate
    return { result: {} }
  })
  const ui = await mountBand($, true)
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  expect(await source()).toMatch('bunHopM')

  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  expect(await source()).toMatch('catRead')

  const edit = $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
  await clock.settle()
  expect(await source()).toMatch('bunPlantM')
  await clock.advance(2000)
  expect(await source()).toMatch('bunPlantM')

  finishEdit()
  await edit
  await clock.advance(1700)
  expect(await source()).toMatch('bunHopM')
  await ui.unmount()
})

// A risky command waits for the person, the pets panicking meanwhile; a
// "Block it" refuses the call before it runs. Failing tests bring the rain,
// and the next passing run clears it.
test('the guard asks before a risky command, and failing tests rain until they pass', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 10) })
  let source = async () => ''
  let sceneWhileAsked = ''
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    sceneWhileAsked = await source()
    const [question] = e.questions as { question: string }[]
    return { result: { questions: e.questions, answers: { [question?.question ?? '']: 'Block it' } } }
  })
  const commands: string[] = []
  let doTestsPass = false
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    commands.push(String(e.command))
    return doTestsPass ? { result: { stdout: 'ok' } } : { isError: true, result: 'Exit code 1', text: 'Exit code 1' }
  })
  const ui = await mountBand($, true)
  source = async () => String((await ui.find({ type: 'Svg' }))?.props.source ?? '')

  const pushed = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(pushed.deny).toMatch('pets guard')
  expect(commands).toEqual([])
  expect(sceneWhileAsked).toMatch('chkBolt')

  await $.tool.call({ tool: 'Bash', command: 'flutter test test/foo_test.dart' })
  expect(await source()).toMatch('cloudDrift')
  doTestsPass = true
  await $.tool.call({ tool: 'Bash', command: 'flutter test test/foo_test.dart' })
  expect(await source()).toMatch('cloudLeave')
  expect(commands).toHaveLength(2)
  await ui.unmount()
})

// A full litter: two young ones awake, two asleep, in the size test.
const KIDS = [
  { parent: 'dog', bornSecondsAgo: 30, sleptSecondsAgo: null },
  { parent: 'cat', bornSecondsAgo: 20, sleptSecondsAgo: 4 },
  { parent: 'bun', bornSecondsAgo: 10, sleptSecondsAgo: null },
  { parent: 'chk', bornSecondsAgo: 5, sleptSecondsAgo: 1 },
] as const

// The desktop refuses an Svg source over 131072 characters, and a refused
// band shows nothing. Every scene must fit at the widest band in its fullest
// state: rain, every sprout and every star.
test('every scene fits the desktop Svg limit at the widest band', async () => {
  const full = { phase: 'night', weather: 'rain', width: 1400, sprouts: 8, freshSprouts: 2, stars: 10, isStarFresh: true, poke: { pet: 'cat', agoSeconds: 0.5 }, elapsedSeconds: 0, from: {}, kids: KIDS } as const
  const inputs: SceneInput[] = [
    ...(['think', 'read', 'edit', 'run', 'test', 'web', 'agent', 'wait', 'danger'] as const).map(scene => ({ ...full, mode: 'working' as const, scene, activity: null })),
    ...(['idle', 'cheer'] as const).map(mode => ({ ...full, mode, scene: 'think' as const, activity: null })),
    ...(['feed', 'play', 'dance'] as const).map(activity => ({ ...full, mode: 'idle' as const, scene: 'think' as const, activity })),
  ]
  // Each from the pets' farthest-flung moment of the think scene, so every
  // pet walks home into it first.
  const from = framesAt({ ...full, mode: 'working', scene: 'think', activity: null }, 3.6)
  for (const input of inputs) expect(petsScene({ ...input, from }).length).toBeLessThan(131072)
})

// A scene change picks the pets up where they are: a dog away sniffing when
// Claude starts reading walks back before the reading scene plays, instead
// of appearing at home.
test('a scene change moves the pets from where they were', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 5, 10) })
  on('tool.call', { tool: 'Read' }, () => ({ result: 'text' }))
  const ui = await mountBand($, true)
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  expect(await source()).not.toMatch('dogGoM')
  // 2.4 s into the think scene the dog is 52 px out on its sniff.
  await clock.advance(2400)
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  const changed = await source()
  expect(changed).toMatch('catRead')
  expect(changed).toMatch('dogGoM')
  await ui.unmount()
})

// In bypassPermissions the person asked not to be stopped: a risky command
// runs straight away (the pets still panic) and no dialog holds it.
test('the guard never holds a call in bypassPermissions mode', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 4, 10) })
  on('classic.UserPromptSubmit', () => ({}))
  let wasAsked = false
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    wasAsked = true
    return { deny: 'not expected' }
  })
  const commands: string[] = []
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    commands.push(String(e.command))
    return { result: { stdout: 'ok' } }
  })
  await $.classic.UserPromptSubmit({ prompt: 'ship it', permission_mode: 'bypassPermissions' })
  const pushed = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(pushed.deny).toBeUndefined()
  expect(commands).toEqual(['git push origin main'])
  expect(wasAsked).toBe(false)
  await $.classic.UserPromptSubmit({ prompt: 'back to normal', permission_mode: 'default' })
})

// Pressing a pet's star plays up that pet, and only that pet.
test('tapping a pet plays it up', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 5, 10) })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const ui = await mountBand($, false)
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  expect(await source()).not.toMatch('catPoke')
  await ui.press({ key: 'tap-cat' })
  expect(await source()).toMatch('catPoke')
  expect(await source()).not.toMatch('bunPoke')
  await ui.unmount()
})

// A subagent's first request gives a pet a young one; when the agent's turn
// ends the young one settles down to sleep where it is.
test('a subagent gives the dog a young one, which sleeps when the agent is done', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 10) })
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const ui = await mountBand($, true)
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  expect(await source()).not.toMatch('kid-dog')

  const stream = $.turn.step({ turnId: 'a1', index: 0, model: 'claude-sonnet-5-5', messageCount: 3, agentId: 'agent-1' } as never)
  for (;;) {
    const n = await stream.next()
    if (n.done) break
  }
  const born = await source()
  expect(born).toMatch('kid-dog-in{animation:kidBorn')
  expect(born).not.toMatch('kid-dogSettle')

  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 'a1', reason: 'answer', agentId: 'agent-1' } as never)
  const asleep = await source()
  expect(asleep).toMatch('kid-dogSettle')
  // Its half size must survive its breathing, which animates `scale`.
  expect(asleep).toMatch('class="kid-dog" transform="scale(0.55)"')
  await ui.unmount()
})
