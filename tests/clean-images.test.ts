import type { On, SessionMessage } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { KEEP_LAST, pruneMessages } from '../hooks/prune'

function message(
  role: 'user' | 'assistant',
  text: string,
  extra: Partial<SessionMessage> = {},
): SessionMessage {
  return { role, text, toolUses: [], ...extra }
}

function handles(messages: readonly SessionMessage[]): (string | undefined)[] {
  return messages.map(item => item.handle)
}

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 3,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 3 },
  view: {},
}

function baseStubs(on: On): void {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.status', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { context: { window: 100000, percent: 10 }, rateLimits: [] },
  }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
}

async function startSession($: Engine, active: boolean): Promise<void> {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't', text: '' })
  if (!active) {
    await $.turn.complete({
      turnId: 't',
      answer: '',
      durationMs: 1,
      isAborted: false,
      reason: 'answer',
    })
  }
}

test('keeps assistant messages and user prompts whole', () => {
  const messages = Array.from({ length: 12 }, (_, i) =>
    message(i % 2 === 0 ? 'user' : 'assistant', `m${i}`, { handle: `h${i}` }),
  )
  const pruned = pruneMessages(messages, 8)
  expect(handles(pruned)).toEqual(messages.map(item => item.handle))
})

test('rebuilds only older tool-result rows, dropping stored image records', () => {
  const messages: SessionMessage[] = [
    message('user', 'start', { handle: 'h0' }),
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{
        tool_use_id: 't1',
        text: '',
        isError: false,
        result: { type: 'image', source: { data: 'AAAA' } },
      }],
      handle: 'h1',
    },
    message('assistant', 'thinking stays', { handle: 'h2' }),
    message('user', 'a prompt with a PDF', { handle: 'h3' }),
    ...Array.from({ length: 9 }, (_, i) => message('user', `u${i}`, { handle: `h${i + 4}` })),
  ]
  const pruned = pruneMessages(messages, KEEP_LAST)
  expect(pruned[1]?.handle).toBeUndefined()
  expect(pruned[1]?.toolResults?.[0]?.result).toBeUndefined()
  expect(pruned[2]?.handle).toBe('h2')
  expect(pruned[3]?.handle).toBe('h3')
  expect(pruned).toHaveLength(messages.length)
})

test('never splits a tool_use from its tool_result', () => {
  const messages: SessionMessage[] = [
    message('user', 'start', { handle: 'h0' }),
    ...Array.from({ length: 7 }, (_, i) => message('user', `u${i}`, { handle: `h${i + 1}` })),
    {
      role: 'assistant',
      text: '',
      toolUses: [{ tool_use_id: 't1', tool: 'Read', input: {} }],
      handle: 'h8',
    },
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: 't1', text: '', isError: false }],
      handle: 'h9',
    },
  ]
  const pruned = pruneMessages(messages, 1)
  expect(pruned.at(-2)?.handle).toBe('h8')
  expect(pruned.at(-1)?.handle).toBe('h9')
})

test('keeps an older empty tool-result row instead of dropping it', () => {
  const messages: SessionMessage[] = [
    message('user', 'start', { handle: 'h0' }),
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: 't1', text: '', isError: false }],
      handle: 'h1',
    },
    ...Array.from({ length: 8 }, (_, i) => message('user', `u${i}`, { handle: `h${i + 2}` })),
  ]
  const pruned = pruneMessages(messages, KEEP_LAST)
  expect(pruned).toHaveLength(10)
  expect(pruned[1]?.handle).toBeUndefined()
  expect(pruned[1]?.toolResults).toHaveLength(1)
})

test('starts the rebuilt conversation with a user message', () => {
  const messages: SessionMessage[] = [
    message('assistant', 'a0', { handle: 'h0' }),
    ...Array.from({ length: 8 }, (_, i) => message('user', `u${i}`, { handle: `h${i + 1}` })),
  ]
  const pruned = pruneMessages(messages, KEEP_LAST)
  expect(pruned[0]?.role).toBe('user')
})

test('keeps the assistant message but drops stored image records from an older tool result', () => {
  const messages: SessionMessage[] = [
    message('user', 'start', { handle: 'h0' }),
    {
      role: 'assistant',
      text: '',
      toolUses: [{
        tool_use_id: 't1',
        tool: 'Read',
        input: { file_path: 'x.png' },
        result: { type: 'image', source: { data: 'AAAA' } },
        text: 'image',
      }],
      handle: 'h1',
    },
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{
        tool_use_id: 't1',
        text: '',
        isError: false,
        result: { type: 'image', source: { data: 'AAAA' } },
      }],
      handle: 'h2',
    },
    ...Array.from({ length: 9 }, (_, i) => message('user', `u${i}`, { handle: `h${i + 3}` })),
  ]
  const pruned = pruneMessages(messages, KEEP_LAST)
  expect(pruned[1]?.handle).toBe('h1')
  expect(pruned[2]?.handle).toBeUndefined()
  expect(pruned[2]?.toolResults?.[0]?.result).toBeUndefined()
})

test('the clean button asks the built-in compact to run', async ($, on) => {
  let command = ''
  const called = new Promise<void>(resolve => {
    on('command.run', ($hook, e) => {
      command = e.command
      resolve()
      return { text: 'compacted' }
    })
  })
  baseStubs(on)
  on('ui.toast', () => ({ value: undefined }))
  await startSession($, false)

  const ui = await $.ui.mount({
    plugin: 'token-speed',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
  })
  expect(await ui.find({ key: 'clean-images' })).toBeDefined()
  await ui.press({ key: 'clean-images' })
  await called
  expect(command).toBe('compact')
  await ui.unmount()
})

test('the clean button waits for the running turn to end', async ($, on) => {
  let commands = 0
  let toast = ''
  const toasted = new Promise<void>(resolve => {
    on('ui.toast', ($hook, e) => {
      toast = e.text
      resolve()
      return { value: undefined }
    })
  })
  on('command.run', () => {
    commands += 1
    return { text: '' }
  })
  baseStubs(on)
  await startSession($, true)

  const ui = await $.ui.mount({
    plugin: 'token-speed',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
  })
  await ui.press({ key: 'clean-images' })
  await toasted
  expect(toast).toBe('等本轮结束后再清理')
  expect(commands).toBe(0)
  await ui.unmount()
})

test('the clean button prunes the conversation through session.compact', async ($, on) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => {
    release = resolve
  })
  on('command.run', () => pending.then(() => ({ text: 'compacted' })))
  baseStubs(on)
  on('ui.toast', () => ({ value: undefined }))
  await startSession($, false)

  const messages: SessionMessage[] = [
    message('user', 'start', { handle: 'h0' }),
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: 't1', text: '', isError: false }],
      handle: 'h1',
    },
    ...Array.from({ length: 9 }, (_, i) => message('user', `u${i}`, { handle: `h${i + 2}` })),
  ]

  const ui = await $.ui.mount({
    plugin: 'token-speed',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
  })
  await ui.press({ key: 'clean-images' })

  const result = await $.session.compact({ trigger: 'manual', messages })
  const pruned = result.messages
  expect(pruned?.length).toBe(11)
  expect(pruned?.[0]?.handle).toBe('h0')
  expect(pruned?.[1]?.handle).toBeUndefined()
  expect(pruned?.[2]?.handle).toBe('h2')
  expect(pruned?.at(-1)?.handle).toBe('h10')

  release()
  await ui.unmount()
})
