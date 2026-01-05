/**
 * PromptAgent Explainer V2 - Refactored with tldraw Best Practices
 *
 * Key improvements:
 * 1. Custom composite shapes (RunTraceShape, InfoBoxShape, PipelineNodeShape)
 * 2. Geometry-driven positioning (props.w/h authoritative)
 * 3. External data store (large payloads not in shape props)
 * 4. Batch updates (editor.run() for bulk operations)
 * 5. Reduced shape count (~10 shapes vs ~95 in V1)
 * 6. Proper resize handling with resizeBox utility
 */

import { Tldraw, Editor, createShapeId, toRichText, type TLPageId } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCallback, useRef, useState, useEffect } from 'react'

// Custom shapes
import {
  customShapeUtils,
  initializeSampleData,
  SAMPLE_SCORE_CARDS,
  SAMPLE_ITERATIONS,
  type ScoreCardData,
} from './shapes'

// ─────────────────────────────────────────────────
// Page IDs (branded strings for tldraw)
// ─────────────────────────────────────────────────

const PAGE_IDS: Record<string, TLPageId> = {
  overview: 'page:overview' as TLPageId,
  concept: 'page:concept' as TLPageId,
  loop: 'page:loop' as TLPageId,
  trace: 'page:trace' as TLPageId,
}

// ─────────────────────────────────────────────────
// Page Creation Functions (using batch updates)
// ─────────────────────────────────────────────────

function createOverviewPage(editor: Editor) {
  // Batch all shape creation for performance
  editor.run(
    () => {
      // Title (still using built-in text for simple labels)
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

      // Objective - using custom InfoBox shape
      editor.createShape({
        id: createShapeId('overview-objective'),
        type: 'infobox',
        x: 50,
        y: 100,
        props: {
          w: 700,
          h: 80,
          title: 'OBJECTIVE',
          content:
            'Produce high-quality user stories that dev teams can estimate and deliver',
          variant: 'objective',
        },
      })

      // Problem - using custom InfoBox shape
      editor.createShape({
        id: createShapeId('overview-problem'),
        type: 'infobox',
        x: 50,
        y: 210,
        props: {
          w: 280,
          h: 180,
          title: 'THE PROBLEM',
          content:
            'Manual prompt engineering:\n• Time-consuming\n• Hard to measure\n• Inconsistent results\n• No systematic improvement',
          variant: 'problem',
        },
      })

      // Arrow (still using built-in)
      editor.createShape({
        id: createShapeId('overview-arrow'),
        type: 'arrow',
        x: 350,
        y: 300,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 100, y: 0 },
          color: 'grey',
          arrowheadEnd: 'arrow',
          size: 'xl',
        },
      })

      // Solution - using custom InfoBox shape
      editor.createShape({
        id: createShapeId('overview-solution'),
        type: 'infobox',
        x: 470,
        y: 210,
        props: {
          w: 280,
          h: 180,
          title: 'THE SOLUTION',
          content:
            'PromptAgent automates:\n• Generate prompt variants\n• Score against objectives\n• Promote improvements\n• Track evolution history',
          variant: 'solution',
        },
      })

      // Insight - using custom InfoBox shape
      editor.createShape({
        id: createShapeId('overview-insight'),
        type: 'infobox',
        x: 50,
        y: 420,
        props: {
          w: 700,
          h: 80,
          title: 'SO WHAT?',
          content:
            'Scores are PROXIES, not goals. We measure keyword coverage, INVEST compliance, and AC quality because they PREDICT deliverable stories.',
          variant: 'insight',
        },
      })
    },
    { history: 'ignore' }
  ) // Ignore history to avoid bloating undo stack
}

function createConceptPage(editor: Editor) {
  editor.run(
    () => {
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
        id: createShapeId('concept-insight'),
        type: 'infobox',
        x: 50,
        y: 100,
        props: {
          w: 600,
          h: 70,
          title: 'KEY INSIGHT',
          content:
            'If prompts are code, they can be version-controlled, tested, and optimized systematically.',
          variant: 'insight',
        },
      })

      // Pipeline - using custom PipelineNode shapes
      const pipelineY = 220
      const nodes = [
        { id: 'epic', x: 50, label: 'Epic', icon: '📄', nodeType: 'artifact' as const },
        { id: 'prompt', x: 180, label: 'Prompt', icon: '📝', nodeType: 'artifact' as const },
        { id: 'llm', x: 310, label: 'LLM', icon: '🤖', nodeType: 'llm' as const },
        { id: 'stories', x: 440, label: 'Stories', icon: '📋', nodeType: 'artifact' as const },
      ]

      for (const node of nodes) {
        editor.createShape({
          id: createShapeId(`concept-${node.id}`),
          type: 'pipelinenode',
          x: node.x,
          y: pipelineY,
          props: {
            w: 100,
            h: 70,
            label: node.label,
            icon: node.icon,
            nodeType: node.nodeType,
            color: 'blue',
          },
        })
      }

      // Pipeline arrows
      const arrowPositions = [150, 280, 410]
      for (let i = 0; i < arrowPositions.length; i++) {
        editor.createShape({
          id: createShapeId(`concept-arrow-${i}`),
          type: 'arrow',
          x: arrowPositions[i]!,
          y: pipelineY + 35,
          props: {
            start: { x: 0, y: 0 },
            end: { x: 30, y: 0 },
            color: 'grey',
            arrowheadEnd: 'arrow',
            size: 'm',
          },
        })
      }

      // Final insight
      editor.createShape({
        id: createShapeId('concept-sowhat'),
        type: 'infobox',
        x: 50,
        y: 330,
        props: {
          w: 490,
          h: 80,
          title: 'SO WHAT?',
          content:
            'The prompt is the "code" we optimize. The LLM is fixed. Improving the prompt improves output.',
          variant: 'insight',
        },
      })
    },
    { history: 'ignore' }
  )
}

function createLoopPage(editor: Editor) {
  editor.run(
    () => {
      // Title
      editor.createShape({
        id: createShapeId('loop-title'),
        type: 'text',
        x: 50,
        y: 20,
        props: {
          richText: toRichText('The Optimization Loop'),
          size: 'xl',
          color: 'orange',
          font: 'sans',
        },
      })

      // Layout: Circular flow
      // Champion at top center, then clockwise: Mutate → Candidates → Score → Compare → back

      const centerX = 350
      const topY = 90
      const midY = 200
      const bottomY = 310

      // 1. Champion Prompt (top center)
      editor.createShape({
        id: createShapeId('loop-champion'),
        type: 'pipelinenode',
        x: centerX - 60,
        y: topY,
        props: {
          w: 120,
          h: 60,
          label: 'Champion',
          icon: '🏆',
          nodeType: 'artifact',
          color: 'blue',
        },
      })

      // 2. Mutate (left side)
      editor.createShape({
        id: createShapeId('loop-mutate'),
        type: 'pipelinenode',
        x: 50,
        y: midY,
        props: {
          w: 100,
          h: 60,
          label: 'Mutate',
          icon: '🔀',
          nodeType: 'artifact',
          color: 'blue',
        },
      })

      // Arrow: Champion → Mutate
      editor.createShape({
        id: createShapeId('loop-arrow-1'),
        type: 'arrow',
        x: centerX - 60,
        y: topY + 60,
        props: {
          start: { x: 0, y: 0 },
          end: { x: -190, y: 80 },
          color: 'grey',
          arrowheadEnd: 'arrow',
          size: 'm',
        },
      })

      // 3. Candidates (bottom, horizontal row)
      const candidateLabels = ['C1', 'C2', 'C3']
      for (let i = 0; i < 3; i++) {
        editor.createShape({
          id: createShapeId(`loop-candidate-${i}`),
          type: 'pipelinenode',
          x: 180 + i * 120,
          y: bottomY,
          props: {
            w: 100,
            h: 60,
            label: candidateLabels[i]!,
            icon: '📄',
            nodeType: 'evidence',
            color: 'grey',
          },
        })
      }

      // Arrow: Mutate → Candidates
      editor.createShape({
        id: createShapeId('loop-arrow-2'),
        type: 'arrow',
        x: 100,
        y: midY + 60,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 80, y: 60 },
          color: 'grey',
          arrowheadEnd: 'arrow',
          size: 'm',
        },
      })

      // 4. Score (right side)
      editor.createShape({
        id: createShapeId('loop-score'),
        type: 'pipelinenode',
        x: 550,
        y: midY,
        props: {
          w: 100,
          h: 60,
          label: 'Score',
          icon: '📊',
          nodeType: 'llm',
          color: 'blue',
        },
      })

      // Arrow: Candidates → Score
      editor.createShape({
        id: createShapeId('loop-arrow-3'),
        type: 'arrow',
        x: 520,
        y: bottomY + 30,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 80, y: -70 },
          color: 'grey',
          arrowheadEnd: 'arrow',
          size: 'm',
        },
      })

      // Arrow: Score → Champion (with "promote if better" label)
      editor.createShape({
        id: createShapeId('loop-arrow-4'),
        type: 'arrow',
        x: 600,
        y: midY,
        props: {
          start: { x: 0, y: 0 },
          end: { x: -190, y: -80 },
          color: 'green',
          arrowheadEnd: 'arrow',
          size: 'l',
        },
      })

      // Promote label
      editor.createShape({
        id: createShapeId('loop-promote-label'),
        type: 'text',
        x: 470,
        y: topY + 30,
        props: {
          richText: toRichText('promote if\nbetter'),
          size: 's',
          color: 'green',
          font: 'mono',
        },
      })

      // Selection Rule box
      editor.createShape({
        id: createShapeId('loop-rule'),
        type: 'infobox',
        x: 50,
        y: bottomY + 80,
        props: {
          w: 600,
          h: 50,
          title: '',
          content: 'RULE: Promote only if score > champion_score + 0.01 (strict improvement)',
          variant: 'solution',
        },
      })

      // Insight
      editor.createShape({
        id: createShapeId('loop-insight'),
        type: 'infobox',
        x: 50,
        y: bottomY + 145,
        props: {
          w: 600,
          h: 70,
          title: 'SO WHAT?',
          content:
            'The loop is greedy: it only promotes strict improvements. No regression allowed. This prevents score gaming.',
          variant: 'insight',
        },
      })
    },
    { history: 'ignore' }
  )
}

function createTracePage(editor: Editor, currentIteration: number) {
  editor.run(
    () => {
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

      // Single composite RunTrace shape (replaces ~30 primitive shapes!)
      editor.createShape({
        id: createShapeId('trace-main'),
        type: 'runtrace',
        x: 50,
        y: 90,
        props: {
          w: 700,
          h: 350,
          currentIteration,
          totalIterations: SAMPLE_ITERATIONS.length,
          iterationIds: SAMPLE_ITERATIONS.map((i) => i.id),
        },
      })
    },
    { history: 'ignore' }
  )
}

// ─────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────

export default function PromptAgentExplainerV2() {
  const editorRef = useRef<Editor | null>(null)
  const [currentPage, setCurrentPage] = useState<'overview' | 'concept' | 'loop' | 'trace'>(
    'overview'
  )
  const [currentIteration, setCurrentIteration] = useState(0)
  const [showScoreCard, setShowScoreCard] = useState<ScoreCardData | null>(null)

  // Initialize data store on mount
  useEffect(() => {
    initializeSampleData()
  }, [])

  const navigateToPage = useCallback(
    (page: 'overview' | 'concept' | 'loop' | 'trace') => {
      const editor = editorRef.current
      if (!editor) return

      setCurrentPage(page)
      editor.setCurrentPage(PAGE_IDS[page])

      setTimeout(() => {
        editor.selectAll()
        editor.zoomToSelection({ animation: { duration: 300 } })
        editor.selectNone()
      }, 50)
    },
    []
  )

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor

      // Create pages with batch operations
      editor.run(
        () => {
          editor.createPage({ id: PAGE_IDS.overview, name: '1. Overview' })
          editor.createPage({ id: PAGE_IDS.concept, name: '2. Concept' })
          editor.createPage({ id: PAGE_IDS.loop, name: '3. Loop' })
          editor.createPage({ id: PAGE_IDS.trace, name: '4. Trace' })

          // Delete default page
          const defaultPage = editor.getPages().find((p) => p.name === 'Page 1')
          if (defaultPage) {
            editor.deletePage(defaultPage.id)
          }
        },
        { history: 'ignore' }
      )

      // Populate pages
      editor.setCurrentPage(PAGE_IDS.overview)
      createOverviewPage(editor)

      editor.setCurrentPage(PAGE_IDS.concept)
      createConceptPage(editor)

      editor.setCurrentPage(PAGE_IDS.loop)
      createLoopPage(editor)

      editor.setCurrentPage(PAGE_IDS.trace)
      createTracePage(editor, currentIteration)

      // Go back to overview
      editor.setCurrentPage(PAGE_IDS.overview)
      setTimeout(() => {
        editor.selectAll()
        editor.zoomToSelection({ animation: { duration: 500 } })
        editor.selectNone()
      }, 100)
    },
    [currentIteration]
  )

  const updateTrace = useCallback(
    (newIter: number) => {
      const editor = editorRef.current
      if (!editor) return

      setCurrentIteration(newIter)

      // Update the single RunTrace shape's props (no delete/recreate!)
      const traceShapeId = createShapeId('trace-main')

      editor.run(
        () => {
          editor.updateShape({
            id: traceShapeId,
            type: 'runtrace',
            props: {
              currentIteration: newIter,
            },
          })
        },
        { history: 'ignore' }
      )
    },
    []
  )

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      {/* Side Panel */}
      <div
        style={{
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
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>PromptAgent</h2>

        {/* Architecture Note */}
        <div
          style={{
            background: '#2a2a4a',
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            opacity: 0.8,
          }}
        >
          ✨ V2: Using custom shapes with geometry-driven positioning
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

        {/* Timeline Scrubber */}
        {(currentPage === 'loop' || currentPage === 'trace') && (
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              TIMELINE (Iteration {currentIteration + 1}/{SAMPLE_ITERATIONS.length})
            </div>
            <input
              type="range"
              min={0}
              max={SAMPLE_ITERATIONS.length - 1}
              value={currentIteration}
              onChange={(e) => updateTrace(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Score Cards */}
        <div>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
            SCORE CARDS (click for rationale)
          </div>
          {SAMPLE_SCORE_CARDS.map((card) => (
            <button
              key={card.id}
              onClick={() => setShowScoreCard(showScoreCard?.id === card.id ? null : card)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 10px',
                marginBottom: 4,
                border:
                  showScoreCard?.id === card.id ? '2px solid #4361ee' : '1px solid #3a3a5a',
                borderRadius: 6,
                background: '#2a2a4a',
                color: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{card.proxy}</span>
                <span
                  style={{
                    color:
                      card.currentValue > 0.8
                        ? '#4ade80'
                        : card.currentValue > 0.6
                          ? '#fbbf24'
                          : '#f87171',
                  }}
                >
                  {card.currentValue.toFixed(2)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Score Card Detail */}
        {showScoreCard && (
          <div
            style={{
              background: '#2a2a4a',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
              {showScoreCard.proxy} ({(showScoreCard.weight * 100).toFixed(0)}%)
            </div>
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
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: '#1a1a2e',
                borderRadius: 4,
                fontSize: 11,
                opacity: 0.8,
              }}
            >
              ⚠️ This score is a PROXY. It predicts the objective but is not the objective
              itself.
            </div>
          </div>
        )}

        {/* Goodhart Warning */}
        <div
          style={{
            marginTop: 'auto',
            padding: 10,
            background: '#4a1a1a',
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          ⚠️ <strong>Goodhart Warning</strong>
          <br />
          Scores are proxies. High scores don&apos;t guarantee good stories. Audit periodically.
        </div>
      </div>

      {/* Main Canvas with custom shapes */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          onMount={handleMount}
          shapeUtils={customShapeUtils}
          hideUi={true}
        />
      </div>
    </div>
  )
}
