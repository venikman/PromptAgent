/**
 * RunTrace Custom Shape - Composite timeline + candidate cards
 *
 * Following tldraw best practices:
 * 1. props.w/h are authoritative - getGeometry returns rectangle matching props
 * 2. indicator matches getGeometry bounds exactly
 * 3. HTML rendering uses HTMLContainer for proper canvas transform
 * 4. Large data stored externally (dataStore), only IDs in props
 * 5. Internal scrollable log instead of spawning shapes
 */

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type TLResizeInfo,
  resizeBox,
} from 'tldraw'
import type { RunTraceShape } from './types'
import { dataStore, type IterationData } from './dataStore'

// ─────────────────────────────────────────────────
// Shape Util Implementation
// ─────────────────────────────────────────────────

export class RunTraceShapeUtil extends BaseBoxShapeUtil<RunTraceShape> {
  static override type = 'runtrace' as const

  // ─── Default Props ────────────────────────────

  getDefaultProps(): RunTraceShape['props'] {
    return {
      w: 700,
      h: 320,
      currentIteration: 0,
      totalIterations: 0,
      iterationIds: [],
    }
  }

  // ─── Geometry (authoritative from props.w/h) ──

  override getGeometry(shape: RunTraceShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  // ─── Indicator (must match getGeometry) ───────

  override indicator(shape: RunTraceShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        ry={8}
        fill="none"
        stroke="var(--color-selected)"
        strokeWidth={2}
      />
    )
  }

  // ─── Resize Handler ───────────────────────────

  override onResize(shape: RunTraceShape, info: TLResizeInfo<RunTraceShape>) {
    return resizeBox(shape, info)
  }

  // ─── Flags ────────────────────────────────────

  override canResize() { return true }
  override canEdit() { return false }

  // ─── Component (HTML rendering) ───────────────

  override component(shape: RunTraceShape) {
    const { w, h, currentIteration, iterationIds } = shape.props

    // Fetch data from external store (not from props)
    const iterations: IterationData[] = iterationIds
      .map((id) => dataStore.getIteration(id))
      .filter((d): d is IterationData => d !== undefined)

    const current = iterations[currentIteration]
    const totalIterations = iterations.length

    return (
      <HTMLContainer>
        <div
          style={{
            width: w,
            height: h,
            background: '#1e1e2e',
            borderRadius: 8,
            padding: 16,
            fontFamily: 'system-ui, sans-serif',
            color: '#e0e0e0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxSizing: 'border-box',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#a78bfa' }}>
              Run Trace: Evidence of Optimization
            </h3>
            <span style={{ fontSize: 12, color: '#888' }}>
              Iteration {currentIteration + 1} of {totalIterations}
            </span>
          </div>

          {/* Timeline Bar */}
          <div style={{ position: 'relative', height: 40 }}>
            {/* Background bar */}
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 0,
                right: 0,
                height: 8,
                background: '#333',
                borderRadius: 4,
              }}
            />
            {/* Progress */}
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 0,
                width: `${((currentIteration + 1) / Math.max(totalIterations, 1)) * 100}%`,
                height: 8,
                background: 'linear-gradient(90deg, #4ade80, #22c55e)',
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }}
            />
            {/* Markers */}
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              {iterations.map((iter, i) => {
                const isActive = i === currentIteration
                const color = iter.promoted ? '#4ade80' : '#fbbf24'
                return (
                  <div
                    key={iter.id}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isActive ? color : '#444',
                      border: isActive ? `2px solid ${color}` : '2px solid #555',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: isActive ? '#1a1a2e' : '#888',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {i + 1}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Current Iteration Details */}
          {current && (
            <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
              {/* Candidates */}
              <div style={{ flex: 2 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>CANDIDATES</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {current.candidates.map((c) => {
                    const bgColor = c.winner
                      ? 'rgba(74, 222, 128, 0.2)'
                      : c.score > 0.7
                        ? 'rgba(251, 191, 36, 0.15)'
                        : 'rgba(248, 113, 113, 0.15)'
                    const borderColor = c.winner ? '#4ade80' : c.score > 0.7 ? '#fbbf24' : '#f87171'

                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: '8px 10px',
                          background: bgColor,
                          border: `1px solid ${borderColor}`,
                          borderRadius: 6,
                          fontSize: 12,
                          minWidth: 90,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {c.winner && <span>🏆</span>}
                          <span style={{ color: borderColor, fontWeight: 'bold' }}>
                            {c.score.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
                          {c.text.slice(0, 20)}...
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Result Summary */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>RESULT</div>
                <div
                  style={{
                    padding: 12,
                    background: current.promoted
                      ? 'rgba(74, 222, 128, 0.2)'
                      : 'rgba(251, 191, 36, 0.15)',
                    border: `1px solid ${current.promoted ? '#4ade80' : '#fbbf24'}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 14, fontFamily: 'monospace', marginBottom: 4 }}>
                    {current.championBefore.toFixed(2)} → {current.championAfter.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {current.promoted ? '✅ Promoted!' : '⏸️ No change'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Log (scrollable, clipped) */}
          {current && (
            <div
              style={{
                background: '#111',
                borderRadius: 4,
                padding: 8,
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#888',
                maxHeight: 60,
                overflow: 'auto',
              }}
            >
              {current.logs.map((log, i) => (
                <div key={i}>{'>'} {log}</div>
              ))}
            </div>
          )}

          {/* Insight footer */}
          <div
            style={{
              background: 'rgba(251, 146, 60, 0.2)',
              border: '1px solid #f97316',
              borderRadius: 4,
              padding: '8px 10px',
              fontSize: 11,
            }}
          >
            💡 SO WHAT? The trace is EVIDENCE that optimization happened. You can audit any
            iteration.
          </div>
        </div>
      </HTMLContainer>
    )
  }
}
