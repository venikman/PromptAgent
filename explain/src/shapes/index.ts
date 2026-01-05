/**
 * Custom Shape Registry for PromptAgent Explainer
 *
 * Following tldraw best practices:
 * - All custom shapes registered in one place
 * - Exported array for use with tldraw's shapeUtils prop
 */

export * from './types'
export * from './dataStore'

export { RunTraceShapeUtil } from './RunTraceShapeUtil'
export { InfoBoxShapeUtil } from './InfoBoxShapeUtil'
export { PipelineNodeShapeUtil } from './PipelineNodeShapeUtil'

// ─────────────────────────────────────────────────
// Shape Utils Array (for tldraw registration)
// ─────────────────────────────────────────────────

import { RunTraceShapeUtil } from './RunTraceShapeUtil'
import { InfoBoxShapeUtil } from './InfoBoxShapeUtil'
import { PipelineNodeShapeUtil } from './PipelineNodeShapeUtil'

export const customShapeUtils = [
  RunTraceShapeUtil,
  InfoBoxShapeUtil,
  PipelineNodeShapeUtil,
]
