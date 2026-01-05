/**
 * InfoBox Custom Shape - Reusable box for objectives, problems, solutions, insights
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
import type { InfoBoxShape } from './types'

// ─────────────────────────────────────────────────
// Variant Styles
// ─────────────────────────────────────────────────

const VARIANT_STYLES: Record<
  InfoBoxShape['props']['variant'],
  { bg: string; border: string; icon: string; titleColor: string; textColor: string }
> = {
  objective: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: '#3b82f6',
    icon: '🎯',
    titleColor: '#1d4ed8',  // darker blue for contrast
    textColor: '#1e3a5f',   // dark blue-gray
  },
  problem: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: '#ef4444',
    icon: '❌',
    titleColor: '#b91c1c',  // darker red
    textColor: '#7f1d1d',   // dark red
  },
  solution: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: '#22c55e',
    icon: '✅',
    titleColor: '#15803d',  // darker green
    textColor: '#14532d',   // dark green
  },
  insight: {
    bg: 'rgba(251, 146, 60, 0.2)',
    border: '#f97316',
    icon: '💡',
    titleColor: '#c2410c',  // darker orange
    textColor: '#7c2d12',   // dark brown
  },
  warning: {
    bg: 'rgba(234, 179, 8, 0.15)',
    border: '#eab308',
    icon: '⚠️',
    titleColor: '#a16207',  // darker yellow
    textColor: '#713f12',   // dark brown
  },
}

// ─────────────────────────────────────────────────
// Shape Util Implementation
// ─────────────────────────────────────────────────

export class InfoBoxShapeUtil extends BaseBoxShapeUtil<InfoBoxShape> {
  static override type = 'infobox' as const

  // ─── Default Props ────────────────────────────

  getDefaultProps(): InfoBoxShape['props'] {
    return {
      w: 400,
      h: 100,
      title: 'Info',
      content: 'Content goes here...',
      variant: 'insight',
    }
  }

  // ─── Geometry (authoritative from props.w/h) ──

  override getGeometry(shape: InfoBoxShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  // ─── Indicator (must match getGeometry) ───────

  override indicator(shape: InfoBoxShape) {
    const style = VARIANT_STYLES[shape.props.variant]
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        ry={8}
        fill="none"
        stroke={style.border}
        strokeWidth={2}
      />
    )
  }

  // ─── Resize Handler ───────────────────────────

  override onResize(shape: InfoBoxShape, info: TLResizeInfo<InfoBoxShape>) {
    return resizeBox(shape, info)
  }

  // ─── Flags ────────────────────────────────────

  override canResize() { return true }
  override canEdit() { return false }

  // ─── Component (HTML rendering) ───────────────

  override component(shape: InfoBoxShape) {
    const { w, h, title, content, variant } = shape.props
    const style = VARIANT_STYLES[variant]

    return (
      <HTMLContainer>
        <div
          style={{
            width: w,
            height: h,
            background: style.bg,
            border: `2px solid ${style.border}`,
            borderRadius: 8,
            padding: 12,
            fontFamily: 'system-ui, sans-serif',
            color: style.textColor,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          {/* Title */}
          {title && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 'bold',
                color: style.titleColor,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{style.icon}</span>
              <span>{title}</span>
            </div>
          )}

          {/* Content */}
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              flex: 1,
              overflow: 'auto',
            }}
          >
            {content}
          </div>
        </div>
      </HTMLContainer>
    )
  }
}
