import type { SessionMessage } from 'claude-code'

export const KEEP_LAST = 8

/**
 * Drops stored images from older tool-result rows.
 *
 * Assistant messages and user prompts are kept whole, with their handles, so
 * thinking and attachments such as PDFs survive. Only an older user message
 * that carries tool results is rebuilt: the engine rebuilds it from role,
 * text and tool blocks, so the image bytes and the stored `result` records
 * are not carried over.
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
    const results = message.toolResults
    if (message.role !== 'user' || !results || results.length === 0) {
      pruned.push(message)
      continue
    }
    pruned.push({
      role: 'user',
      text: message.text,
      toolUses: [],
      toolResults: results.map(result => ({
        tool_use_id: result.tool_use_id,
        text: result.text,
        isError: result.isError,
      })),
    })
  }

  if (pruned[0]?.role === 'assistant') {
    pruned.unshift({ role: 'user', text: '（较早的历史截图已清理）', toolUses: [] })
  }
  return pruned
}
