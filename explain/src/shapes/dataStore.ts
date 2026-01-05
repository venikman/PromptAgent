/**
 * External Data Store for PromptAgent Explainer
 *
 * Following tldraw best practice: "Store only references on-canvas (IDs, hashes,
 * short previews). Put full prompts, outputs, and judge rationales in external
 * storage keyed by those IDs."
 *
 * This keeps the tldraw store small and prevents "document bloat" from becoming
 * your scaling bottleneck.
 */

// ─────────────────────────────────────────────────
// Score Card Data
// ─────────────────────────────────────────────────

export interface ScoreCardData {
  id: string
  objective: string
  proxy: string
  rationale: string
  auditCadence: string
  currentValue: number
  weight: number
}

// ─────────────────────────────────────────────────
// Iteration Data
// ─────────────────────────────────────────────────

export interface CandidateData {
  id: string
  text: string
  score: number
  winner: boolean
  /** Full prompt text - stored here, not in shape props */
  fullPrompt?: string
  /** Judge rationale - stored here, not in shape props */
  judgeRationale?: string
}

export interface IterationData {
  id: string
  iterNumber: number
  timestamp: string
  candidates: CandidateData[]
  championBefore: number
  championAfter: number
  promoted: boolean
  logs: string[]
  /** Full evidence payloads - stored here, not in shape props */
  evidence?: {
    inputs?: Record<string, unknown>
    outputs?: Record<string, unknown>
    metrics?: Record<string, number>
  }
}

// ─────────────────────────────────────────────────
// Data Store Class
// ─────────────────────────────────────────────────

class ExplainerDataStore {
  private scoreCards = new Map<string, ScoreCardData>()
  private iterations = new Map<string, IterationData>()
  private candidates = new Map<string, CandidateData>()

  // ─── Score Cards ─────────────────────────────────

  setScoreCard(data: ScoreCardData): void {
    this.scoreCards.set(data.id, data)
  }

  getScoreCard(id: string): ScoreCardData | undefined {
    return this.scoreCards.get(id)
  }

  getAllScoreCards(): ScoreCardData[] {
    return Array.from(this.scoreCards.values())
  }

  // ─── Iterations ──────────────────────────────────

  setIteration(data: IterationData): void {
    this.iterations.set(data.id, data)
    // Also index candidates
    for (const c of data.candidates) {
      this.candidates.set(c.id, c)
    }
  }

  getIteration(id: string): IterationData | undefined {
    return this.iterations.get(id)
  }

  getIterationByNumber(num: number): IterationData | undefined {
    for (const iter of this.iterations.values()) {
      if (iter.iterNumber === num) return iter
    }
    return undefined
  }

  getAllIterations(): IterationData[] {
    return Array.from(this.iterations.values()).sort(
      (a, b) => a.iterNumber - b.iterNumber
    )
  }

  // ─── Candidates ──────────────────────────────────

  getCandidate(id: string): CandidateData | undefined {
    return this.candidates.get(id)
  }

  // ─── Bulk Loading ────────────────────────────────

  loadScoreCards(cards: ScoreCardData[]): void {
    for (const card of cards) {
      this.setScoreCard(card)
    }
  }

  loadIterations(iterations: IterationData[]): void {
    for (const iter of iterations) {
      this.setIteration(iter)
    }
  }

  // ─── Clear ───────────────────────────────────────

  clear(): void {
    this.scoreCards.clear()
    this.iterations.clear()
    this.candidates.clear()
  }
}

// ─────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────

export const dataStore = new ExplainerDataStore()

// ─────────────────────────────────────────────────
// Sample Data (MVE)
// ─────────────────────────────────────────────────

export const SAMPLE_SCORE_CARDS: ScoreCardData[] = [
  {
    id: 'keyword',
    objective: 'Stories cover all epic requirements',
    proxy: 'Keyword Coverage',
    rationale: 'If key terms from epic appear in stories, requirements are likely addressed',
    auditCadence: 'Review when epic vocabulary changes',
    currentValue: 0.85,
    weight: 0.25,
  },
  {
    id: 'invest',
    objective: 'Stories are actionable by dev teams',
    proxy: 'INVEST Principles',
    rationale: 'INVEST compliance predicts story quality and estimability',
    auditCadence: 'Monthly review with delivery metrics',
    currentValue: 0.72,
    weight: 0.30,
  },
  {
    id: 'acceptance',
    objective: 'Stories are testable',
    proxy: 'Acceptance Criteria Quality',
    rationale: 'Well-formed AC enables test automation and clear DoD',
    auditCadence: 'Compare with QA defect rates quarterly',
    currentValue: 0.68,
    weight: 0.30,
  },
  {
    id: 'duplication',
    objective: 'No redundant work',
    proxy: 'No Duplication',
    rationale: 'Unique stories prevent double-counting and confusion',
    auditCadence: 'Check when similar epics cluster',
    currentValue: 0.95,
    weight: 0.10,
  },
  {
    id: 'count',
    objective: 'Right granularity for sprint planning',
    proxy: 'Story Count 4-8',
    rationale: 'Too few = too big; too many = over-decomposed',
    auditCadence: 'Adjust based on team velocity data',
    currentValue: 0.80,
    weight: 0.05,
  },
]

export const SAMPLE_ITERATIONS: IterationData[] = [
  {
    id: 'iter-1',
    iterNumber: 1,
    timestamp: '10:23:15',
    candidates: [
      { id: 'c1-1', text: 'Add Chain-of-Thought...', score: 0.62, winner: false },
      { id: 'c1-2', text: 'Add few-shot examples...', score: 0.71, winner: true },
      { id: 'c1-3', text: 'Strict JSON schema...', score: 0.58, winner: false },
    ],
    championBefore: 0.50,
    championAfter: 0.71,
    promoted: true,
    logs: ['Generated 3 variants', 'Scored all', 'Promoted variant 2'],
  },
  {
    id: 'iter-2',
    iterNumber: 2,
    timestamp: '10:24:02',
    candidates: [
      { id: 'c2-1', text: 'INVEST checklist...', score: 0.78, winner: true },
      { id: 'c2-2', text: 'Output validation...', score: 0.69, winner: false },
      { id: 'c2-3', text: 'Role clarification...', score: 0.73, winner: false },
    ],
    championBefore: 0.71,
    championAfter: 0.78,
    promoted: true,
    logs: ['Generated 3 variants', 'Scored all', 'Promoted variant 1'],
  },
  {
    id: 'iter-3',
    iterNumber: 3,
    timestamp: '10:24:48',
    candidates: [
      { id: 'c3-1', text: 'Persona injection...', score: 0.74, winner: false },
      { id: 'c3-2', text: 'Constraint emphasis...', score: 0.76, winner: false },
      { id: 'c3-3', text: 'Example diversity...', score: 0.72, winner: false },
    ],
    championBefore: 0.78,
    championAfter: 0.78,
    promoted: false,
    logs: ['Generated 3 variants', 'Scored all', 'No improvement - kept champion'],
  },
]

// Initialize store with sample data
export function initializeSampleData(): void {
  dataStore.loadScoreCards(SAMPLE_SCORE_CARDS)
  dataStore.loadIterations(SAMPLE_ITERATIONS)
}
