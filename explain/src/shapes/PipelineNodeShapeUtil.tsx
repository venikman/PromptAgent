/**
 * PipelineNode Custom Shape - For pipeline visualization nodes
 *
 * Following tldraw best practices:
 * 1. props.w/h are authoritative
 * 2. getGeometry and indicator match exactly
 * 3. HTMLContainer for proper canvas transformation
 */

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type TLResizeInfo,
  resizeBox,
} from 'tldraw'
import type { PipelineNodeShape } from './types'

// ─────────────────────────────────────────────────
// Node Type Styles
// ─────────────────────────────────────────────────

const NODE_STYLES: Record<
  PipelineNodeShape['props']['nodeType'],
  { bg: string; border: string; shape: 'rect' | 'diamond' | 'ellipse'; textColor: string }
> = {
  artifact: {
    bg: 'rgba(59, 130, 246, 0.2)',
    border: '#3b82f6',
    shape: 'rect',
    textColor: '#1e3a8a',  // dark blue
  },
  process: {
    bg: 'rgba(251, 146, 60, 0.3)',
    border: '#f97316',
    shape: 'diamond',
    textColor: '#7c2d12',  // dark brown
  },
  evidence: {
    bg: 'transparent',
    border: '#6b7280',
    shape: 'rect',
    textColor: '#374151',  // dark gray
  },
  llm: {
    bg: 'rgba(139, 92, 246, 0.3)',
    border: '#8b5cf6',
    shape: 'ellipse',
    textColor: '#4c1d95',  // dark purple
  },
}

// ─────────────────────────────────────────────────
// Shape Util Implementation
// ─────────────────────────────────────────────────

export class PipelineNodeShapeUtil extends BaseBoxShapeUtil<PipelineNodeShape> {
  static override type = 'pipelinenode' as const

  // ─── Default Props ────────────────────────────

  getDefaultProps(): PipelineNodeShape['props'] {
    return {
      w: 100,
      h: 70,
      label: 'Node',
      icon: '📄',
      nodeType: 'artifact',
      color: 'blue',
    }
  }

  // ─── Geometry (authoritative from props.w/h) ──

  override getGeometry(shape: PipelineNodeShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  // ─── Indicator (must match getGeometry) ───────

  override indicator(shape: PipelineNodeShape) {
    const { w, h, nodeType } = shape.props
    const style = NODE_STYLES[nodeType]

    if (style.shape === 'ellipse') {
      return (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={w / 2}
          ry={h / 2}
          fill="none"
          stroke="var(--color-selected)"
          strokeWidth={2}
        />
      )
    }

    if (style.shape === 'diamond') {
      const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`
      return (
        <polygon
          points={points}
          fill="none"
          stroke="var(--color-selected)"
          strokeWidth={2}
        />
      )
    }

    return (
      <rect
        width={w}
        height={h}
        rx={6}
        ry={6}
        fill="none"
        stroke="var(--color-selected)"
        strokeWidth={2}
      />
    )
  }

  // ─── Resize Handler ───────────────────────────

  override onResize(shape: PipelineNodeShape, info: TLResizeInfo<PipelineNodeShape>) {
    return resizeBox(shape, info)
  }

  // ─── Flags ────────────────────────────────────

  override canResize() { return true }
  override canEdit() { return false }

  // ─── Component (HTML rendering) ───────────────

  override component(shape: PipelineNodeShape) {
    const { w, h, label, icon, nodeType } = shape.props
    const style = NODE_STYLES[nodeType]

    // CSS for different shapes
    const shapeStyles: React.CSSProperties = {
      width: w,
      height: h,
      background: style.bg,
      border: `2px ${nodeType === 'evidence' ? 'dashed' : 'solid'} ${style.border}`,
      borderRadius: style.shape === 'ellipse' ? '50%' : style.shape === 'diamond' ? 0 : 8,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      color: style.textColor,
      boxSizing: 'border-box',
      transform: style.shape === 'diamond' ? 'rotate(45deg)' : 'none',
    }

    const contentStyles: React.CSSProperties = {
      transform: style.shape === 'diamond' ? 'rotate(-45deg)' : 'none',
      textAlign: 'center',
    }

    return (
      <HTMLContainer>
        <div style={shapeStyles}>
          <div style={contentStyles}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: 12, fontWeight: 'bold' }}>{label}</div>
          </div>
        </div>
      </HTMLContainer>
    )
  }
}
