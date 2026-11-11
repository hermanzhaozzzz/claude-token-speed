import type { SessionMessage } from 'claude-code'

export const KEEP_LAST = 8

/**
 * Drops images from every message before the newest `keepLast` ones.
 *
 * The engine keeps a message with its `handle` exactly as stored. Without its
 * handle it rebuilds the message from `role`, `text` and tool blocks, so image
 * blocks are not carried over. The stored `result` records can hold the same
 * bytes, so the rebuilt tool blocks keep only their ids and text.
 */
export function pruneMessages(
  messages: readonly SessionMessage[],
  keepLast: number = KEEP_LAST,
): SessionMessage[] {
  if (messages.length <= keepLast) return messages.slice()

  let cut = messages.length - keepLast
  const keptIds = new Set<string>()
  for (let i = cut; i < messages.length; i += 1) {
    for (const result of messages[i]?.toolResults ?? []) keptIds.add(result.tool_use_id)
  }
  // Keep a tool_use and its tool_result on the same side of the cut.
  while (cut > 0) {
    const uses = messages[cut - 1]?.toolUses ?? []
    if (!uses.some(use => keptIds.has(use.tool_use_id))) break
    cut -= 1
    for (const result of messages[cut]?.toolResults ?? []) keptIds.add(result.tool_use_id)
  }

  const pruned: SessionMessage[] = []
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]
    if (!message) continue
    // The first message carries the conversation's initial context; keep it whole.
    if (i === 0 || i >= cut) {
      pruned.push(message)
      continue
    }
    const toolUses = message.toolUses.map(use => ({
      tool_use_id: use.tool_use_id,
      tool: use.tool,
      input: use.input,
    }))
    const toolResults = message.toolResults?.map(result => ({
      tool_use_id: result.tool_use_id,
      text: result.text,
      isError: result.isError,
    }))
    const rebuilt: SessionMessage = {
      role: message.role,
      text: message.text,
      toolUses,
      ...(toolResults ? { toolResults } : {}),
    }
    if (rebuilt.text !== '' || rebuilt.toolUses.length > 0 || (rebuilt.toolResults?.length ?? 0) > 0) {
      pruned.push(rebuilt)
    }
  }

  if (pruned[0]?.role === 'assistant') {
    pruned.unshift({ role: 'user', text: '（较早的历史截图已清理）', toolUses: [] })
  }
  return pruned
}
