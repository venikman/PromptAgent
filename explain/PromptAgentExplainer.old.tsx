import { Tldraw, Editor, createShapeId, toRichText } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'

// Type for shape IDs
type ShapeId = ReturnType<typeof createShapeId>

// ═══════════════════════════════════════════════════════════════════════════
// SCORE CARD SCHEMA (Rationale Mandate)
// ═══════════════════════════════════════════════════════════════════════════

interface ScoreCard {
  id: string
  objective: string      // What you really care about
  proxy: string          // What you measure
  rationale: string      // Why this proxy predicts objective
  auditCadence: string   // When to re-check proxy validity
  currentValue: number
}

const SCORE_CARDS: ScoreCard[] = [
  {
    id: 'keyword',
    objective: 'Stories cover all epic requirements',
    proxy: 'Keyword Coverage (25%)',
    rationale: 'If key terms from epic appear in stories, requirements are likely addressed',
    auditCadence: 'Review when epic vocabulary changes',
    currentValue: 0.85,
  },
  {
    id: 'invest',
    objective: 'Stories are actionable by dev teams',
    proxy: 'INVEST Principles (30%)',
    rationale: 'INVEST compliance predicts story quality and estimability',
    auditCadence: 'Monthly review with delivery metrics',
    currentValue: 0.72,
  },
  {
    id: 'acceptance',
    objective: 'Stories are testable',
    proxy: 'Acceptance Criteria Quality (30%)',
    rationale: 'Well-formed AC enables test automation and clear DoD',
    auditCadence: 'Compare with QA defect rates quarterly',
    currentValue: 0.68,
  },
  {
    id: 'duplication',
    objective: 'No redundant work',
    proxy: 'No Duplication (10%)',
    rationale: 'Unique stories prevent double-counting and confusion',
    auditCadence: 'Check when similar epics cluster',
    currentValue: 0.95,
  },
  {
    id: 'count',
    objective: 'Right granularity for sprint planning',
    proxy: 'Story Count 4-8 (5%)',
    rationale: 'Too few = too big; too many = over-decomposed',
    auditCadence: 'Adjust based on team velocity data',
    currentValue: 0.80,
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// ITERATION TRACE DATA (Run History)
// ═══════════════════════════════════════════════════════════════════════════

interface IterationRecord {
  id: number
  timestamp: string
  candidates: Array<{ text: string; score: number; winner: boolean }>
  championBefore: number
  championAfter: number
  promoted: boolean
  logs: string[]
}

// Sample MVE trace data
const SAMPLE_TRACE: IterationRecord[] = [
  {
    id: 1,
    timestamp: '10:23:15',
    candidates: [
      { text: 'Add Chain-of-Thought...', score: 0.62, winner: false },
      { text: 'Add few-shot examples...', score: 0.71, winner: true },
      { text: 'Strict JSON schema...', score: 0.58, winner: false },
    ],
    championBefore: 0.50,
    championAfter: 0.71,
    promoted: true,
    logs: ['Generated 3 variants', 'Scored all', 'Promoted variant 2'],
  },
  {
    id: 2,
    timestamp: '10:24:02',
    candidates: [
      { text: 'INVEST checklist...', score: 0.78, winner: true },
      { text: 'Output validation...', score: 0.69, winner: false },
      { text: 'Role clarification...', score: 0.73, winner: false },
    ],
    championBefore: 0.71,
    championAfter: 0.78,
    promoted: true,
    logs: ['Generated 3 variants', 'Scored all', 'Promoted variant 1'],
  },
  {
    id: 3,
    timestamp: '10:24:48',
    candidates: [
      { text: 'Persona injection...', score: 0.74, winner: false },
      { text: 'Constraint emphasis...', score: 0.76, winner: false },
      { text: 'Example diversity...', score: 0.72, winner: false },
    ],
    championBefore: 0.78,
    championAfter: 0.78,
    promoted: false,
    logs: ['Generated 3 variants', 'Scored all', 'No improvement - kept champion'],
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// PAGE IDS
// ═══════════════════════════════════════════════════════════════════════════

// tldraw page IDs are branded strings - we use type assertion to match internal format
const PAGE_IDS = {
  overview: 'page:overview' as const,
  concept: 'page:concept' as const,
  loop: 'page:loop' as const,
  trace: 'page:trace' as const,
} as Record<string, `page:${string}`>

// ═══════════════════════════════════════════════════════════════════════════
// PAGE CREATORS
// ═══════════════════════════════════════════════════════════════════════════

function createOverviewPage(editor: Editor) {
  // Title
  editor.createShape({
    id: createShapeId('overview-title'),
    type: 'text',
    x: 50,
    y: 30,
    props: {
      richText: toRichText('PromptAgent: Automated Prompt Optimization'),
      size: 'xl',
      color: 'blue',
      font: 'sans',
    },
  })

  // Objective Statement (The "Why") - moved to top
  editor.createShape({
    id: createShapeId('objective-statement'),
    type: 'geo',
    x: 50,
    y: 100,
    props: {
      geo: 'rectangle',
      w: 700,
      h: 80,
      color: 'blue',
      fill: 'solid',
      richText: toRichText('🎯 OBJECTIVE: Produce high-quality user stories that dev teams can estimate and deliver'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 'm',
    },
  })

  // Problem Box (Red) - use geo rectangle for consistent sizing
  editor.createShape({
    id: createShapeId('problem-box'),
    type: 'geo',
    x: 50,
    y: 220,
    props: {
      geo: 'rectangle',
      w: 280,
      h: 200,
      color: 'red',
      fill: 'semi',
      richText: toRichText('❌ THE PROBLEM\n\nManual prompt engineering:\n• Time-consuming\n• Hard to measure\n• Inconsistent results\n• No systematic improvement'),
      align: 'start',
      verticalAlign: 'start',
      font: 'sans',
      size: 's',
    },
  })

  // Arrow
  editor.createShape({
    id: createShapeId('problem-solution-arrow'),
    type: 'arrow',
    x: 350,
    y: 320,
    props: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      color: 'grey',
      arrowheadEnd: 'arrow',
      size: 'xl',
    },
  })

  // Solution Box (Green) - use geo rectangle for consistent sizing
  editor.createShape({
    id: createShapeId('solution-box'),
    type: 'geo',
    x: 470,
    y: 220,
    props: {
      geo: 'rectangle',
      w: 280,
      h: 200,
      color: 'green',
      fill: 'semi',
      richText: toRichText('✅ THE SOLUTION\n\nPromptAgent automates:\n• Generate prompt variants\n• Score against objectives\n• Promote improvements\n• Track evolution history'),
      align: 'start',
      verticalAlign: 'start',
      font: 'sans',
      size: 's',
    },
  })

  // "So What?" Rationale - use solid fill with orange for visibility
  editor.createShape({
    id: createShapeId('so-what'),
    type: 'geo',
    x: 50,
    y: 450,
    props: {
      geo: 'rectangle',
      w: 700,
      h: 90,
      color: 'orange',
      fill: 'solid',
      richText: toRichText('💡 SO WHAT? Scores are PROXIES, not goals. We measure keyword coverage, INVEST compliance, and AC quality because they PREDICT deliverable stories. The real test: can the team ship it?'),
      align: 'start',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })
}

function createConceptPage(editor: Editor) {
  // Title
  editor.createShape({
    id: createShapeId('concept-title'),
    type: 'text',
    x: 50,
    y: 30,
    props: {
      richText: toRichText('Core Concept: Treat Prompts as Code'),
      size: 'xl',
      color: 'blue',
      font: 'sans',
    },
  })

  // Key Insight
  editor.createShape({
    id: createShapeId('key-insight'),
    type: 'geo',
    x: 50,
    y: 100,
    props: {
      geo: 'rectangle',
      w: 700,
      h: 80,
      color: 'yellow',
      fill: 'solid',
      richText: toRichText('💡 KEY INSIGHT: If prompts are code, they can be version-controlled,\ntested, and optimized systematically.'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 'm',
    },
  })

  // Shape Legend
  editor.createShape({
    id: createShapeId('legend-title'),
    type: 'text',
    x: 50,
    y: 210,
    props: {
      richText: toRichText('SHAPE TAXONOMY'),
      size: 'l',
      color: 'grey',
      font: 'sans',
    },
  })

  // Artifact shape - use geo rectangle for consistent sizing
  editor.createShape({
    id: createShapeId('legend-artifact'),
    type: 'geo',
    x: 50,
    y: 260,
    props: {
      geo: 'rectangle',
      w: 150,
      h: 80,
      color: 'blue',
      fill: 'semi',
      richText: toRichText('📄 ARTIFACT\n(Data/Prompts)'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  // Process shape
  editor.createShape({
    id: createShapeId('legend-process'),
    type: 'geo',
    x: 230,
    y: 260,
    props: {
      geo: 'diamond',
      w: 100,
      h: 80,
      color: 'orange',
      fill: 'solid',
      richText: toRichText('⚙️ PROCESS'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  // Evidence shape
  editor.createShape({
    id: createShapeId('legend-evidence'),
    type: 'geo',
    x: 360,
    y: 260,
    props: {
      geo: 'rectangle',
      w: 150,
      h: 80,
      color: 'grey',
      fill: 'none',
      dash: 'dashed',
      richText: toRichText('📊 EVIDENCE'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'mono',
      size: 's',
    },
  })

  // Pipeline Title - positioned above pipeline boxes
  editor.createShape({
    id: createShapeId('pipeline-title'),
    type: 'text',
    x: 50,
    y: 365,
    props: {
      richText: toRichText('THE PIPELINE'),
      size: 'm',
      color: 'grey',
      font: 'sans',
    },
  })

  // Pipeline: Epic → Prompt → LLM → Stories - wider boxes, more spacing
  const pipelineY = 400

  editor.createShape({
    id: createShapeId('pipe-epic'),
    type: 'geo',
    x: 50,
    y: pipelineY,
    props: {
      geo: 'rectangle',
      w: 90,
      h: 60,
      color: 'yellow',
      fill: 'semi',
      richText: toRichText('📄 Epic'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  editor.createShape({
    id: createShapeId('pipe-arrow-1'),
    type: 'arrow',
    x: 150,
    y: pipelineY + 30,
    props: { start: { x: 0, y: 0 }, end: { x: 40, y: 0 }, color: 'grey', arrowheadEnd: 'arrow', size: 'm' },
  })

  editor.createShape({
    id: createShapeId('pipe-prompt'),
    type: 'geo',
    x: 200,
    y: pipelineY,
    props: {
      geo: 'rectangle',
      w: 90,
      h: 60,
      color: 'blue',
      fill: 'semi',
      richText: toRichText('📄 Prompt'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  editor.createShape({
    id: createShapeId('pipe-arrow-2'),
    type: 'arrow',
    x: 300,
    y: pipelineY + 30,
    props: { start: { x: 0, y: 0 }, end: { x: 40, y: 0 }, color: 'grey', arrowheadEnd: 'arrow', size: 'm' },
  })

  editor.createShape({
    id: createShapeId('pipe-llm'),
    type: 'geo',
    x: 350,
    y: pipelineY,
    props: {
      geo: 'ellipse',
      w: 80,
      h: 60,
      color: 'violet',
      fill: 'solid',
      richText: toRichText('LLM'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  editor.createShape({
    id: createShapeId('pipe-arrow-3'),
    type: 'arrow',
    x: 440,
    y: pipelineY + 30,
    props: { start: { x: 0, y: 0 }, end: { x: 40, y: 0 }, color: 'grey', arrowheadEnd: 'arrow', size: 'm' },
  })

  editor.createShape({
    id: createShapeId('pipe-stories'),
    type: 'geo',
    x: 490,
    y: pipelineY,
    props: {
      geo: 'rectangle',
      w: 90,
      h: 60,
      color: 'green',
      fill: 'semi',
      richText: toRichText('📄 Stories'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  // So What? - solid orange for visibility
  editor.createShape({
    id: createShapeId('concept-sowhat'),
    type: 'geo',
    x: 50,
    y: 490,
    props: {
      geo: 'rectangle',
      w: 530,
      h: 55,
      color: 'orange',
      fill: 'solid',
      richText: toRichText('💡 SO WHAT? The prompt is the "code" we optimize. The LLM is fixed. Improving the prompt improves output without changing the model.'),
      align: 'start',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })
}

function createLoopPage(editor: Editor, onRunLoop: () => void) {
  // Title
  editor.createShape({
    id: createShapeId('loop-title'),
    type: 'text',
    x: 50,
    y: 30,
    props: {
      richText: toRichText('The Optimization Loop'),
      size: 'xl',
      color: 'orange',
      font: 'sans',
    },
  })

  // Selection Rule
  editor.createShape({
    id: createShapeId('selection-rule'),
    type: 'geo',
    x: 50,
    y: 90,
    props: {
      geo: 'rectangle',
      w: 500,
      h: 50,
      color: 'green',
      fill: 'solid',
      richText: toRichText('RULE: Promote if score > champion + 0.01'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'mono',
      size: 'm',
    },
  })

  const loopY = 170

  // Run Button
  editor.createShape({
    id: createShapeId('loop-run-button'),
    type: 'geo',
    x: 50,
    y: loopY,
    props: {
      geo: 'rectangle',
      w: 140,
      h: 50,
      color: 'green',
      fill: 'solid',
      richText: toRichText('▶ Run Loop'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 'l',
    },
  })

  // Mutator
  editor.createShape({
    id: createShapeId('loop-mutator'),
    type: 'geo',
    x: 50,
    y: loopY + 80,
    props: {
      geo: 'diamond',
      w: 140,
      h: 120,
      color: 'orange',
      fill: 'solid',
      richText: toRichText('MUTATE\n3 variants'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  // Candidates area - label positioned clearly above boxes
  editor.createShape({
    id: createShapeId('candidates-label'),
    type: 'text',
    x: 240,
    y: loopY - 30,
    props: {
      richText: toRichText('Candidates'),
      size: 's',
      color: 'grey',
      font: 'sans',
    },
  })

  for (let i = 0; i < 3; i++) {
    editor.createShape({
      id: createShapeId(`loop-candidate-${i}`),
      type: 'geo',
      x: 240 + i * 130,
      y: loopY,
      props: {
        geo: 'rectangle',
        w: 110,
        h: 110,
        color: 'grey',
        fill: 'none',
        dash: 'dashed',
        richText: toRichText(`C${i + 1}\n\n(waiting)`),
        align: 'middle',
        verticalAlign: 'middle',
        font: 'sans',
        size: 's',
      },
    })
  }

  // Scorer
  editor.createShape({
    id: createShapeId('loop-scorer'),
    type: 'geo',
    x: 640,
    y: loopY,
    props: {
      geo: 'rectangle',
      w: 100,
      h: 80,
      color: 'violet',
      fill: 'solid',
      richText: toRichText('SCORE\n0.0-1.0'),
      align: 'middle',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })

  // Results Log
  editor.createShape({
    id: createShapeId('loop-results'),
    type: 'geo',
    x: 640,
    y: loopY + 95,
    props: {
      geo: 'rectangle',
      w: 140,
      h: 80,
      color: 'black',
      fill: 'solid',
      richText: toRichText('📊 Log\n────\n(waiting)'),
      align: 'start',
      verticalAlign: 'start',
      font: 'mono',
      size: 's',
      labelColor: 'white',
    },
  })

  // Feedback arrow
  editor.createShape({
    id: createShapeId('loop-feedback'),
    type: 'arrow',
    x: 400,
    y: loopY + 140,
    props: {
      start: { x: 0, y: 0 },
      end: { x: -300, y: -130 },
      bend: 50,
      color: 'green',
      arrowheadEnd: 'arrow',
      size: 'l',
    },
  })

  editor.createShape({
    id: createShapeId('feedback-label'),
    type: 'text',
    x: 200,
    y: loopY + 130,
    props: {
      richText: toRichText('↑ Promote winner'),
      size: 's',
      color: 'green',
      font: 'mono',
    },
  })

  // So What? for loop - solid orange for visibility
  editor.createShape({
    id: createShapeId('loop-sowhat'),
    type: 'geo',
    x: 50,
    y: loopY + 200,
    props: {
      geo: 'rectangle',
      w: 710,
      h: 55,
      color: 'orange',
      fill: 'solid',
      richText: toRichText('💡 SO WHAT? The loop is greedy: it only promotes strict improvements. This prevents score gaming - a variant must ACTUALLY be better.'),
      align: 'start',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })
}

function createTracePage(editor: Editor, trace: IterationRecord[], currentIter: number) {
  // Title
  editor.createShape({
    id: createShapeId('trace-title'),
    type: 'text',
    x: 50,
    y: 30,
    props: {
      richText: toRichText('Run Trace: Evidence of Optimization'),
      size: 'xl',
      color: 'violet',
      font: 'sans',
    },
  })

  // Timeline header
  editor.createShape({
    id: createShapeId('timeline-header'),
    type: 'text',
    x: 50,
    y: 90,
    props: {
      richText: toRichText(`Timeline (Iteration ${currentIter + 1} of ${trace.length})`),
      size: 'm',
      color: 'grey',
      font: 'sans',
    },
  })

  // Timeline bar
  const timelineY = 130
  const timelineWidth = 700
  const stepWidth = timelineWidth / Math.max(trace.length, 1)

  editor.createShape({
    id: createShapeId('timeline-bar'),
    type: 'geo',
    x: 50,
    y: timelineY,
    props: {
      geo: 'rectangle',
      w: timelineWidth,
      h: 8,
      color: 'grey',
      fill: 'solid',
    },
  })

  // Timeline markers
  trace.forEach((iter, i) => {
    const markerX = 50 + i * stepWidth + stepWidth / 2 - 15
    const isActive = i === currentIter
    const color = iter.promoted ? 'green' : 'yellow'

    editor.createShape({
      id: createShapeId(`timeline-marker-${i}`),
      type: 'geo',
      x: markerX,
      y: timelineY - 10,
      props: {
        geo: 'ellipse',
        w: 30,
        h: 30,
        color: isActive ? color : 'grey',
        fill: isActive ? 'solid' : 'semi',
        richText: toRichText(`${i + 1}`),
        align: 'middle',
        verticalAlign: 'middle',
        font: 'mono',
        size: 's',
      },
    })
  })

  // Current iteration details
  const current = trace[currentIter]
  if (current) {
    const detailY = 175

    // Candidates label - positioned clearly above candidate cards
    editor.createShape({
      id: createShapeId('trace-candidates-label'),
      type: 'text',
      x: 50,
      y: detailY,
      props: {
        richText: toRichText('Candidates:'),
        size: 's',
        color: 'grey',
        font: 'sans',
      },
    })

    // Candidate cards - 3 in a row
    current.candidates.forEach((c, i) => {
      const badgeColor = c.winner ? 'green' : c.score > 0.7 ? 'yellow' : 'light-red'

      editor.createShape({
        id: createShapeId(`trace-candidate-${i}`),
        type: 'geo',
        x: 50 + i * 110,
        y: detailY + 25,
        props: {
          geo: 'rectangle',
          w: 100,
          h: 50,
          color: badgeColor as 'green' | 'yellow' | 'light-red',
          fill: 'semi',
          richText: toRichText(`${c.winner ? '🏆 ' : ''}${c.text.slice(0, 8)}...\n${c.score.toFixed(2)}`),
          align: 'middle',
          verticalAlign: 'middle',
          font: 'sans',
          size: 's',
        },
      })
    })

    // Result summary - single row with score change and status
    editor.createShape({
      id: createShapeId('trace-result'),
      type: 'geo',
      x: 390,
      y: detailY + 25,
      props: {
        geo: 'rectangle',
        w: 220,
        h: 50,
        color: current.promoted ? 'green' : 'yellow',
        fill: 'solid',
        richText: toRichText(`📊 ${current.championBefore.toFixed(2)} → ${current.championAfter.toFixed(2)} ${current.promoted ? '✅ Promoted!' : '⏸️ No change'}`),
        align: 'middle',
        verticalAlign: 'middle',
        font: 'mono',
        size: 's',
      },
    })
  }

  // So What? - solid orange for visibility - moved below candidates
  editor.createShape({
    id: createShapeId('trace-sowhat'),
    type: 'geo',
    x: 50,
    y: 260,
    props: {
      geo: 'rectangle',
      w: 560,
      h: 45,
      color: 'orange',
      fill: 'solid',
      richText: toRichText('💡 SO WHAT? The trace is EVIDENCE that optimization happened. You can audit any iteration and see why the winner won.'),
      align: 'start',
      verticalAlign: 'middle',
      font: 'sans',
      size: 's',
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PromptAgentExplainer() {
  const editorRef = useRef<Editor | null>(null)
  const [currentPage, setCurrentPage] = useState<'overview' | 'concept' | 'loop' | 'trace'>('overview')
  const [currentIteration, setCurrentIteration] = useState(0)
  const [showScoreCard, setShowScoreCard] = useState<ScoreCard | null>(null)
  const [mveMode, setMveMode] = useState(true)

  const navigateToPage = useCallback((page: 'overview' | 'concept' | 'loop' | 'trace') => {
    const editor = editorRef.current
    if (!editor) return

    setCurrentPage(page)
    editor.setCurrentPage(PAGE_IDS[page])

    setTimeout(() => {
      editor.selectAll()
      editor.zoomToSelection({ animation: { duration: 300 } })
      editor.selectNone()
    }, 50)
  }, [])

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    // Create pages
    editor.createPage({ id: PAGE_IDS.overview, name: '1. Overview' })
    editor.createPage({ id: PAGE_IDS.concept, name: '2. Concept' })
    editor.createPage({ id: PAGE_IDS.loop, name: '3. Loop' })
    editor.createPage({ id: PAGE_IDS.trace, name: '4. Trace' })

    // Delete the default page
    const defaultPage = editor.getPages().find(p => p.name === 'Page 1')
    if (defaultPage) {
      editor.setCurrentPage(PAGE_IDS.overview)
      editor.deletePage(defaultPage.id)
    }

    // Populate pages
    editor.setCurrentPage(PAGE_IDS.overview)
    createOverviewPage(editor)

    editor.setCurrentPage(PAGE_IDS.concept)
    createConceptPage(editor)

    editor.setCurrentPage(PAGE_IDS.loop)
    createLoopPage(editor, () => {})

    editor.setCurrentPage(PAGE_IDS.trace)
    createTracePage(editor, SAMPLE_TRACE, currentIteration)

    // Go back to overview
    editor.setCurrentPage(PAGE_IDS.overview)
    setTimeout(() => {
      editor.selectAll()
      editor.zoomToSelection({ animation: { duration: 500 } })
      editor.selectNone()
    }, 100)
  }, [currentIteration])

  const updateTrace = useCallback((newIter: number) => {
    const editor = editorRef.current
    if (!editor) return

    setCurrentIteration(newIter)

    // Delete existing trace shapes and recreate
    const currentPageShapes = editor.getCurrentPageShapes()
    currentPageShapes.forEach(shape => {
      if (shape.id.includes('trace-')) {
        editor.deleteShape(shape.id)
      }
    })

    // Only recreate if on trace page
    if (currentPage === 'trace') {
      createTracePage(editor, SAMPLE_TRACE, newIter)
    }
  }, [currentPage])

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      {/* Side Panel */}
      <div style={{
        width: 280,
        background: '#1a1a2e',
        color: 'white',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'system-ui',
        fontSize: 14,
        overflowY: 'auto',
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>PromptAgent</h2>

        {/* MVE Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={mveMode}
            onChange={(e) => setMveMode(e.target.checked)}
            id="mve-toggle"
          />
          <label htmlFor="mve-toggle" style={{ fontSize: 12, opacity: 0.8 }}>
            MVE Mode (minimal example)
          </label>
        </div>

        {/* Page Navigation */}
        <div>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>VIEWPOINTS</div>
          {(['overview', 'concept', 'loop', 'trace'] as const).map((page, i) => (
            <button
              key={page}
              onClick={() => navigateToPage(page)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                marginBottom: 4,
                border: 'none',
                borderRadius: 6,
                background: currentPage === page ? '#4361ee' : '#2a2a4a',
                color: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
              }}
            >
              {i + 1}. {page.charAt(0).toUpperCase() + page.slice(1)}
              <span style={{ float: 'right', opacity: 0.5 }}>
                {page === 'overview' && '(Why)'}
                {page === 'concept' && '(What)'}
                {page === 'loop' && '(How)'}
                {page === 'trace' && '(Evidence)'}
              </span>
            </button>
          ))}
        </div>

        {/* Timeline Scrubber (visible on loop/trace pages) */}
        {(currentPage === 'loop' || currentPage === 'trace') && (
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              TIMELINE (Iteration {currentIteration + 1}/{SAMPLE_TRACE.length})
            </div>
            <input
              type="range"
              min={0}
              max={SAMPLE_TRACE.length - 1}
              value={currentIteration}
              onChange={(e) => updateTrace(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.5 }}>
              <span>Start</span>
              <span>End</span>
            </div>
          </div>
        )}

        {/* Score Cards */}
        <div>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>SCORE CARDS (click for rationale)</div>
          {SCORE_CARDS.map(card => (
            <button
              key={card.id}
              onClick={() => setShowScoreCard(showScoreCard?.id === card.id ? null : card)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 10px',
                marginBottom: 4,
                border: showScoreCard?.id === card.id ? '2px solid #4361ee' : '1px solid #3a3a5a',
                borderRadius: 6,
                background: '#2a2a4a',
                color: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{card.proxy.split(' (')[0]}</span>
                <span style={{
                  color: card.currentValue > 0.8 ? '#4ade80' : card.currentValue > 0.6 ? '#fbbf24' : '#f87171'
                }}>
                  {card.currentValue.toFixed(2)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Score Card Detail */}
        {showScoreCard && (
          <div style={{
            background: '#2a2a4a',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{showScoreCard.proxy}</div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.6 }}>Objective: </span>
              {showScoreCard.objective}
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.6 }}>Rationale: </span>
              {showScoreCard.rationale}
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.6 }}>Audit: </span>
              {showScoreCard.auditCadence}
            </div>
            <div style={{
              marginTop: 8,
              padding: 8,
              background: '#1a1a2e',
              borderRadius: 4,
              fontSize: 11,
              opacity: 0.8,
            }}>
              ⚠️ This score is a PROXY. It predicts the objective but is not the objective itself.
            </div>
          </div>
        )}

        {/* Proxy Warning */}
        <div style={{
          marginTop: 'auto',
          padding: 10,
          background: '#4a1a1a',
          borderRadius: 6,
          fontSize: 11,
        }}>
          ⚠️ <strong>Goodhart Warning</strong><br />
          Scores are proxies. High scores don&apos;t guarantee good stories. Audit periodically.
        </div>
      </div>

      {/* Main Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          onMount={handleMount}
          hideUi={false}
        />
      </div>
    </div>
  )
}
