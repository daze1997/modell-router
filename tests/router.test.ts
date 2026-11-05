import { expect, test } from 'claude-code/testing'

async function runTurn($: any, on: any, verdict: string, text: string, turnId: string) {
  const seen: { model?: string; effort?: unknown } = {}
  on('store.get', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: verdict, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_: unknown, e: any) {
    seen.model = e.model
    seen.effort = e.effort
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })
  await $.turn.start({ text, turnId })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })
  for await (const _c of stream) { /* keine Chunks */ }
  return seen
}

test('Kleinkram geht an Haiku, ohne Effort', async ($, on) => {
  const seen = await runTurn($, on, 'klein', 'korrigiere die Tippfehler: Hallo wie gehts dier', 't1')
  expect(seen.model).toBe('haiku')
  expect(seen.effort).toBe(undefined)
})

test('Standard geht an Sonnet', async ($, on) => {
  const seen = await runTurn($, on, 'standard', 'Erklär mir kurz wie Tailscale funktioniert', 't2')
  expect(seen.model).toBe('sonnet')
})

test('Komplex bleibt beim Modell der Sitzung', async ($, on) => {
  const seen = await runTurn($, on, 'komplex', 'Bau mir einen Mod, der ...', 't3')
  expect(seen.model).toBe('claude-opus-5-5')
  expect(seen.effort).toBe('high')
})

test('Unklare Einstufung: Modell der Sitzung', async ($, on) => {
  const seen = await runTurn($, on, 'banane', 'irgendwas', 't4')
  expect(seen.model).toBe('claude-opus-5-5')
})
