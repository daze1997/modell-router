import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Stats, Tier } from '../types'

// Modell-Router: jede neue Anfrage wird von Haiku kurz eingestuft
// (klein / standard / komplex) und dann vom passenden Modell bearbeitet.
// Kleinkram -> Haiku, Normales -> Sonnet, Komplexes -> Modell der Sitzung (Opus).

const stats = atom({ plugin: 'modell-router', key: 'stats' } as const, { klein: 0, standard: 0, komplex: 0 }, {
  shape: 'stats-1',
})

type Mode = 'auto' | 'aus' | Tier
const MODES: readonly Mode[] = ['auto', 'aus', 'klein', 'standard', 'komplex']
const TIERS: readonly Tier[] = ['klein', 'standard', 'komplex']

// undefined = Modell der Sitzung unverändert lassen
const MODEL: Record<Tier, string | undefined> = { klein: 'haiku', standard: 'sonnet', komplex: undefined }
const NAME: Record<Tier, string> = { klein: 'Haiku', standard: 'Sonnet', komplex: 'Opus' }
const LABEL: Record<Tier, string> = { klein: 'Kleinkram', standard: 'Standard', komplex: 'Komplex' }

const SYSTEM = `Du bist ein Router, der Anfragen an einen KI-Assistenten nach Schwierigkeit einstuft.
Antworte mit genau einem Wort: klein, standard oder komplex.

klein: Tippfehler korrigieren, umformulieren, formatieren, übersetzen, kurze Faktenfrage, Smalltalk, einfache Umrechnung, kurze Antwort ohne Recherche.
standard: normale Fragen und Erklärungen, Texte oder Mails entwerfen, Zusammenfassungen, einfache Websuche, kleine Code-Änderungen, einzelne Datei lesen.
komplex: mehrstufige Aufgaben mit vielen Werkzeugen, gründliche Recherche mit Quellenprüfung, Programme, Mods oder Server bauen oder ändern, schwieriges Debugging, Architektur, Video-, Bild- oder Datenanalyse, Planung mit vielen Abhängigkeiten, alles mit hohem Fehlerrisiko oder Geld/Buchungen.

Im Zweifel die höhere Stufe wählen. Kurze Folgeantworten wie "ja", "mach", "weiter", "ok" übernehmen die vorherige Stufe.`

const FOLLOW_UP = /^(ja|jo|ok|okay|mach|mach das|weiter|go|los|passt|gut|yes|super|danke)\b[\s.!]*$/i

async function getMode($: EngineInterface): Promise<Mode> {
  const stored = await $.store.get('mode')
  return MODES.includes(stored as Mode) ? (stored as Mode) : 'auto'
}

export const register: Register = on => {
  const decisions = new Map<string, Tier | null>()
  let previous: Tier = 'standard'
  let hadAttachments = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router',
      description: 'Modell-Router: /router [auto|klein|standard|komplex|aus]',
      argumentHint: '[auto|klein|standard|komplex|aus]',
    })
    const mode = await getMode($)
    $.ui.status(mode === 'aus' ? 'Router: aus' : `Router: ${mode}`)
    return next(e)
  })

  on('command.run', { command: 'router' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '') {
      if (!MODES.includes(arg as Mode)) {
        return { text: `Unbekannt: "${arg}". Erlaubt: ${MODES.join(', ')}` }
      }
      await $.store.set('mode', arg)
    }
    const mode = await getMode($)
    const s = await read($, stats)
    const lines = [
      `Modus: ${mode}`,
      'Zuordnung: klein → Haiku · standard → Sonnet · komplex → Modell der Sitzung',
      `Diese Sitzung: ${s.klein}× Haiku, ${s.standard}× Sonnet, ${s.komplex}× Opus`,
    ]
    $.ui.status(mode === 'aus' ? 'Router: aus' : `Router: ${mode}`)
    return { text: lines.join('\n') }
  })

  on('prompt.submit', ($, e, next) => {
    if (e.isMeta !== true) {
      hadAttachments = (e.attachments?.length ?? 0) > 0
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // Nur der Hauptverlauf; Subagenten behalten ihr eigenes Modell.
    if (e.agentId !== undefined) {
      return next(e)
    }

    const mode = await getMode($)
    let tier: Tier | null = null

    if (mode === 'aus') {
      tier = null
    } else if (mode !== 'auto') {
      tier = mode
    } else {
      const text = e.text.trim()
      if (text === '' || FOLLOW_UP.test(text)) {
        tier = previous
      } else {
        const r = await $.model.complete({
          model: 'haiku',
          system: SYSTEM,
          prompt: `Vorherige Stufe: ${previous}\n\nAnfrage:\n<<<\n${text.slice(0, 4000)}\n>>>`,
          maxTokens: 5,
          timeoutMs: 8000,
        })
        const word = r.isAnswered ? r.text.trim().toLowerCase().replace(/[^a-zäöü]/g, '') : ''
        tier = TIERS.includes(word as Tier) ? (word as Tier) : null
      }
      if (tier === 'klein' && hadAttachments) {
        tier = 'standard'
      }
    }

    decisions.set(e.turnId, tier)

    if (tier === null) {
      $.ui.status(mode === 'aus' ? 'Router: aus' : 'Router: keine Einstufung, Modell der Sitzung')
    } else {
      if (tier !== previous) {
        $.ui.toast(`Router → ${NAME[tier]} (${LABEL[tier]})`)
      }
      $.ui.status(`Router: ${NAME[tier]} · ${LABEL[tier]}${mode === 'auto' ? '' : ' (fix)'}`)
      previous = tier
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }
    const tier = decisions.get(e.turnId)
    const model = tier ? MODEL[tier] : undefined
    if (model === undefined) {
      return yield* next(e)
    }
    if (model === 'haiku') {
      // Haiku nimmt evtl. keinen Effort-Wert: weglassen.
      const { effort: _effort, ...rest } = e
      return yield* next({ ...rest, model })
    }
    return yield* next({ ...e, model })
  })

  on('turn.complete', async ($, e, next) => {
    const tier = decisions.get(e.turnId)
    decisions.delete(e.turnId)
    if (tier) {
      await update($, stats, s => ({ ...s, [tier]: s[tier] + 1 }) as Stats)
    }
    return next(e)
  })
}
