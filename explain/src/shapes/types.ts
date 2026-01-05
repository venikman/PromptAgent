/**
 * Type definitions for custom shapes following tldraw best practices.
 *
 * Key principles:
 * - props.w/h are authoritative for geometry
 * - Large payloads stored externally, only IDs in props
 * - All shapes use consistent base type pattern
 */

import type { TLBaseShape, TLDefaultColorStyle } from 'tldraw'

// ─────────────────────────────────────────────────
// External Data References (store large payloads elsewhere)
// ─────────────────────────────────────────────────

export type DataRef = {
  type: 'iteration' | 'scorecard' | 'candidate'
  id: string
}

// ─────────────────────────────────────────────────
// Score Card Shape
// ─────────────────────────────────────────────────

export type ScoreCardShapeProps = {
  w: number
  h: number
  dataRef: DataRef
  expanded: boolean
  color: TLDefaultColorStyle
}

export type ScoreCardShape = TLBaseShape<'scorecard', ScoreCardShapeProps>

// ─────────────────────────────────────────────────
// Run Trace Shape (composite timeline + cards)
// ─────────────────────────────────────────────────

export type RunTraceShapeProps = {
  w: number
  h: number
  currentIteration: number
  totalIterations: number
  /** Only store iteration IDs, not full data */
  iterationIds: string[]
}

export type RunTraceShape = TLBaseShape<'runtrace', RunTraceShapeProps>

// ─────────────────────────────────────────────────
// Candidate Card Shape
// ─────────────────────────────────────────────────

export type CandidateCardShapeProps = {
  w: number
  h: number
  dataRef: DataRef
  isWinner: boolean
  score: number
  color: TLDefaultColorStyle
}

export type CandidateCardShape = TLBaseShape<'candidate', CandidateCardShapeProps>

// ─────────────────────────────────────────────────
// Info Box Shape (reusable for objectives, insights, etc.)
// ─────────────────────────────────────────────────

export type InfoBoxShapeProps = {
  w: number
  h: number
  title: string
  content: string
  variant: 'objective' | 'problem' | 'solution' | 'insight' | 'warning'
}

export type InfoBoxShape = TLBaseShape<'infobox', InfoBoxShapeProps>

// ─────────────────────────────────────────────────
// Pipeline Node Shape
// ─────────────────────────────────────────────────

export type PipelineNodeShapeProps = {
  w: number
  h: number
  label: string
  icon: string
  nodeType: 'artifact' | 'process' | 'evidence' | 'llm'
  color: TLDefaultColorStyle
}

export type PipelineNodeShape = TLBaseShape<'pipelinenode', PipelineNodeShapeProps>

// ─────────────────────────────────────────────────
// All Custom Shape Types
// ─────────────────────────────────────────────────

export type CustomShape =
  | ScoreCardShape
  | RunTraceShape
  | CandidateCardShape
  | InfoBoxShape
  | PipelineNodeShape
