# What project has

## Current Measurement Approach

| What's Measured     | How                                     | Configuration                        |
| ------------------- | --------------------------------------- | ------------------------------------ |
| **Pass Rate**       | Schema validation success across R runs | `EVAL_REPLICATES` (default: 5)       |
| **Mean Score**      | Average quality across all runs         | Composite of heuristic + FPF judge   |
| **P10 Score**       | 10th percentile (worst-case quality)    | Captures tail behavior               |
| **Std Score**       | Standard deviation (consistency)        | Penalized in objective               |
| **Discoverability** | P(success within K tries)               | `DISCOVERABILITY_TRIES` (default: 3) |

## The Objective Formula

```
Objective = 0.45 × passRate
          + 0.35 × meanScore
          + 0.20 × p10Score
          - λ × stdScore           (variance penalty)
          - penalty × (1-passRate) (failure penalty)
```

## What May Be Unclear in the UI

The UI might not be clearly showing:

1. **What each metric means** - the statistical reasoning behind p10,
   discoverability
2. **How weights are applied** - the 45/35/20 split
3. **Trace execution details** - token usage, timing per step

Would you like me to:

1. **Add clearer metric explanations to the Playground UI?**
2. **Create a "methodology" documentation page?**
3. **Add visual indicators showing what each score component contributes?**

`★ Insight ─────────────────────────────────────` **Yes! PromptAgent follows a
research-backed methodology from paper 2507.22133**

This is a proper academic approach to prompt optimization, not ad-hoc tuning.
The system implements three key techniques from the literature:

1. **Distributional Evaluation** - treats prompt quality as a statistical
   distribution, not a single number
2. **Contrastive Pair Mining** - inspired by OPRO (Optimization by PROmpting)
   from DeepMind
3. **Patch-based Evolution** - additive improvements rather than full rewrites
   `─────────────────────────────────────────────────`

## Yes, We Follow a Research Methodology!

The system implements **paper 2507.22133** with three core techniques:

### 1. Distributional Evaluation (Section 3.1)

Instead of testing a prompt once, we run it **R times** with different seeds:

```
Single Run (❌ unreliable):     Distributional (✅ robust):
    Prompt → Score: 0.72           Prompt → [0.68, 0.75, 0.71, 0.73, 0.69]
                                          → mean: 0.71, std: 0.03, p10: 0.68
```

**Why?** LLMs are stochastic. A prompt might "get lucky" once but fail often.

### 2. Contrastive Pair Mining (Section 3.2) — OPRO-style

Find outputs that are **semantically similar but have different quality**:

```
Output A (score: 0.85) ─┐
                        ├── similarity: 92%, delta: 0.35
Output B (score: 0.50) ─┘

→ "What makes A better than B?" feeds into patch generation
```

### 3. Prompt Patch Optimization (Section 3.3)

Only generate **small additions** to the prompt, never full rewrites:

```
Base Prompt (fixed) + Patch (evolves) = Final Prompt
     ↓                    ↓
  "You are..."      "Also ensure GWT format..."
```

## The Optimization Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    METHODOLOGY OVERVIEW                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. DISTRIBUTIONAL EVAL (Paper 3.1)                  │   │
│  │     Run prompt R times → compute statistics          │   │
│  │     mean, p10, std, passRate, discoverability        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  2. CONTRASTIVE MINING (Paper 3.2 / OPRO-style)      │   │
│  │     Find similar outputs with big quality gap        │   │
│  │     cosine_sim > 0.86 AND score_delta > 0.15         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  3. PATCH GENERATION (Paper 3.3)                     │   │
│  │     LLM analyzes pairs → proposes small additions    │   │
│  │     ~10-15 lines, additive only                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  4. CHAMPION/CHALLENGER                              │   │
│  │     If patched prompt > current → promote            │   │
│  │     Objective: 0.45×pass + 0.35×mean + 0.20×p10      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Parameters (from paper)

| Parameter              | Default | Paper Section | Purpose                              |
| ---------------------- | ------- | ------------- | ------------------------------------ |
| `EVAL_REPLICATES`      | 5       | 3.1           | Runs per epic for distribution       |
| `PAIR_MIN_SIM`         | 0.86    | 3.2           | Min similarity for contrastive pairs |
| `PAIR_MIN_DELTA`       | 0.15    | 3.2           | Min quality gap for pairs            |
| `OPT_PATCH_CANDIDATES` | 3       | 3.3           | Patches to generate per round        |
| `EVAL_STD_LAMBDA`      | 0.25    | 3.1           | Penalty for inconsistency            |

# Missing peaces by old prism

## What's Missing in the UI?

The methodology **is implemented** but may not be **visible** in the UI. Would
you like me to:

1. **Add a "Methodology" panel** explaining the approach to users?
2. **Show distribution stats** (p10, std, discoverability) more clearly?
3. **Visualize contrastive pairs** that drove improvements?
4. **Add paper reference** with links to the research?

`★ Insight ─────────────────────────────────────` **Great news: Your methodology
is well-aligned with current research!** The 2024-2025 research landscape has
evolved, but PromptAgent's core approaches remain valid. The key developments
are:

1. **Contrastive methods are now mainstream** - Your pair mining approach is
   validated by multiple 2024-2025 papers
2. **Ensemble judges (PoLL) outperform single judges** - This is a significant
   opportunity for improvement
3. **PhaseEvo/PromptBreeder add meta-evolution** - Could enhance your patch
   generation `─────────────────────────────────────────────────`

# Research Findings: PromptAgent Methodology Audit

## Summary: Your Methods vs. State-of-the-Art (2024-2025)

| Component               | Your Current Approach      | Latest Research          | Status                        | Recommendation                |
| ----------------------- | -------------------------- | ------------------------ | ----------------------------- | ----------------------------- |
| **Distributional Eval** | R replicates, mean/p10/std | ReliableEval, PromptEval | ✅ **Validated**              | Add confidence intervals      |
| **Contrastive Pairs**   | OPRO-style mining          | CRPO, LCP (2025)         | ✅ **Good, upgradeable**      | Add multi-metric contrastive  |
| **Prompt Evolution**    | Patch additions only       | PhaseEvo, PromptBreeder  | ⚠️ **Missing meta-evolution** | Add mutation-prompt evolution |
| **LLM-as-Judge**        | Single FPF judge           | PoLL, Prometheus 2       | ⚠️ **Upgrade available**      | Switch to ensemble/jury       |

---

## 1. Distributional Evaluation ✅ VALIDATED

### Your Approach

```typescript
// src/eval.ts - Your implementation
(meanScore, p10Score, stdScore, passRate, discoverabilityK);
```

### Latest Research (2024-2025)

**[ReliableEval](https://arxiv.org/html/2505.22169)** (May 2025) confirms your
approach:

> "Evaluation of LLMs requires stochastic evaluation over the spectrum of
> perturbations via a method of moments analysis (expected value, variance,
> etc.)" **[PromptEval](https://arxiv.org/pdf/2405.17202)** (2024) validates
> multi-run evaluation: "Our method can produce accurate performance
> distribution and quantile estimates at the cost of 2-4 single-prompt
> evaluations"

### 🔧 Recommended Enhancement

```
+ Add confidence intervals (bootstrap)
+ Report inter-quartile range (IQR) for robustness
+ Consider adaptive sampling (stop early if variance is low)
```

## 2. Contrastive Pair Mining ✅ GOOD, UPGRADEABLE

### Your Approach

```typescript
// src/pairMining.ts
cosine_sim > 0.86 AND score_delta > 0.15
```

### Latest Research (2024-2025)

**[CRPO - Contrastive Reasoning Prompt Optimization](https://arxiv.org/html/2509.02093)**
(Oct 2025):

> "Multi-metric variant integrates the strongest exemplars along helpfulness,
> correctness, coherence, complexity, and verbosity"
> **[LCP - Learning from Contrastive Prompts](https://arxiv.org/html/2409.15199v1)**
> (2024): "Achieves win rate of over 76% versus OPRO by contrasting good and bad
> prompts while learning from error cases"
> **[Paper 2507.22133](https://arxiv.org/html/2507.22133)** (your reference) is
> still valid: "Contrastive pairs exhibit subtle differences that can guide an
> LLM to produce more successful prompts"

### 🔧 Recommended Enhancement

```
+ Add TIERED contrastive pairs (high/medium/low quality)
+ Multi-metric pairing (not just overall score)
+ Include error analysis in pair context
```

## 3. Prompt Evolution ⚠️ MISSING META-EVOLUTION

### Your Approach

```typescript
// src/patchEngineer.ts
// Only generates additive patches to base prompt
```

### Latest Research (2024-2025)

**[PromptBreeder](https://dl.acm.org/doi/10.5555/3692070.3692611)** (ICML 2024):

> "Not just improving task-prompts, but also improving the mutation-prompts that
> improve these task-prompts" (self-referential)
> **[PhaseEvo](https://openreview.net/pdf?id=u8BO0NFF21)** (Feb 2024):
> "Two-phase strategy: global mutations to find promising regions, then focused
> semantic mutations and gradient-based refinements"
> **[EvoPrompt](https://github.com/beeevita/EvoPrompt)** (ICLR 2024):
> "Significantly outperforms human-engineered prompts, up to 25% on BBH"
> **[Tournament of Prompts](https://arxiv.org/html/2506.00178v1)** (June 2025):
> "Evolving LLM instructions through structured debates and Elo ratings"

### 🔧 Recommended Enhancement

```
+ Add meta-mutation (evolve the patch-generation prompt itself)
+ Implement population-based evolution (not just champion/challenger)
+ Consider crossover between successful patches
+ Add Elo-style tournament selection
```

## 4. LLM-as-Judge ⚠️ SIGNIFICANT UPGRADE AVAILABLE

### Your Approach

```typescript
// src/judge/promptagent-fpf-judge.ts
// Single LLM judge with FPF framework
```

### Latest Research (2024-2025)

**[PoLL - Panel of LLM Evaluators](https://arxiv.org/abs/2404.18796)** (2024):

> "Panel of smaller models outperforms single large judge, exhibits less
> intra-model bias, and is 7x less expensive"
> **[Prometheus 2](https://arxiv.org/abs/2405.01535)** (May 2024): "Open-source
> evaluator that scores highest correlation with humans among all tested open
> evaluator LMs" **[SE-Jury](https://arxiv.org/html/2505.20854v2)** (ASE 2025):
> "First LLM-as-Ensemble-Judge metric with five distinct evaluation strategies
> as independent judges"
> **[Survey on LLM-as-a-Judge](https://arxiv.org/abs/2411.15594)** (Nov 2024)
> best practices: "Criteria decomposition - each evaluation monitors a single
> criteria" "Chain-of-Thought reasoning significantly improves evaluation
> quality"

### 🔧 Recommended Enhancement (HIGH PRIORITY)

```
+ Replace single judge with Panel of 3 diverse models (PoLL)
+ OR use Prometheus 2 (open-source, free)
+ Add criteria decomposition (separate judges for each metric)
+ Implement minority-veto for high true-negative rate
+ Add inter-judge reliability metrics (Cohen's Kappa)
```

---

## 5. NEW Methods to Consider

### Multi-Agent Optimization

**[MARS](https://arxiv.org/html/2502.02533v1)** (March 2025) and **Prochemy**
(March 2025):

> "Multi-agent Socratic dialogue + planner-driven decomposition"

### Hybrid Approaches

**[DSPy + TextGrad](https://medium.com/@adnanmasood/beyond-prompt-engineering-how-llm-optimization-frameworks-like-textgrad-and-dspy-are-building-the-6790d3bf0b34)**:

> "DSPy for compile-time pipeline optimization, TextGrad for test-time
> refinement"

---

## Priority Recommendations

| Priority      | Change                                   | Effort | Impact                             |
| ------------- | ---------------------------------------- | ------ | ---------------------------------- |
| 🔴 **HIGH**   | Switch to PoLL (3-judge panel)           | Medium | Reduces bias, improves reliability |
| 🔴 **HIGH**   | Add tiered contrastive pairs             | Low    | Better pair mining                 |
| 🟡 **MEDIUM** | Add meta-evolution (PromptBreeder style) | High   | Self-improving system              |
| 🟡 **MEDIUM** | Criteria decomposition in judge          | Medium | More granular feedback             |
| 🟢 **LOW**    | Confidence intervals in eval             | Low    | Better statistics                  |
| 🟢 **LOW**    | Tournament/Elo selection                 | Medium | Better exploration                 |

## Sources

### Distributional Evaluation

- [ReliableEval: Stochastic LLM Evaluation](https://arxiv.org/html/2505.22169)
- [PromptEval: Efficient Multi-Prompt Evaluation](https://arxiv.org/pdf/2405.17202)

### Contrastive Pair Mining

- [CRPO: Contrastive Reasoning Prompt Optimization](https://arxiv.org/html/2509.02093)
- [LCP: Learning from Contrastive Prompts](https://arxiv.org/html/2409.15199v1)
- [OPRO: Large Language Models as Optimizers](https://arxiv.org/abs/2309.03409)

### Prompt Evolution

- [PromptBreeder: Self-Referential Self-Improvement](https://openreview.net/forum?id=HKkiX32Zw1)
- [PhaseEvo: Unified In-Context Prompt Optimization](https://openreview.net/pdf?id=u8BO0NFF21)
- [EvoPrompt GitHub](https://github.com/beeevita/EvoPrompt)
- [Tournament of Prompts](https://arxiv.org/html/2506.00178v1)

### LLM-as-Judge

- [PoLL: Replacing Judges with Juries](https://arxiv.org/abs/2404.18796)
- [Prometheus 2](https://arxiv.org/abs/2405.01535)
- [SE-Jury: LLM-as-Ensemble-Judge](https://arxiv.org/html/2505.20854v2)
- [Comprehensive Survey on LLM-as-Judge](https://arxiv.org/abs/2412.05579)

Would you like me to:

1. **Implement the PoLL (Panel of Judges)** - highest impact change?
2. **Add tiered contrastive pair mining** - quick win?
3. **Create a detailed implementation plan** for all changes?

I want you to usi FPF to come up with evaluator for you proeject. So we would
have custon uniqui, basedon SOTA mete-mate evaluateors. before we wil mae a
choce with which new method to adotp

1. Primary Request and Intent:
   - User initially asked about monitoring methodology clarity in the UI demo
   - User wanted to understand if the project follows an established methodology
   - User requested research into latest SOTA methods (2024-2025) for each
     optimization component before making updates
   - **Most Recent Request**: User provided the FPF-Spec (First Principles
     Framework) document and wants to use FPF to design a custom, unique
     evaluator for PromptAgent based on SOTA meta-evaluation methods. This
     should be done BEFORE deciding which new method to adopt from the research
     findings.

2. Key Technical Concepts:
   - **Paper 2507.22133**: Research methodology currently implemented
   - **Distributional Evaluation**: Running prompts R times, computing
     mean/p10/std/passRate/discoverability
   - **Contrastive Pair Mining**: OPRO-style finding semantic nearest neighbors
     with quality delta
   - **Prompt Patch Optimization**: Additive patches only, no full rewrites
   - **SOTA Research Findings (2024-2025)**:
     - ReliableEval, PromptEval (distributional)
     - CRPO, LCP (contrastive - 76% win rate vs OPRO)
     - PromptBreeder, PhaseEvo, EvoPrompt (meta-evolution)
     - PoLL (Panel of LLM judges - 7x cheaper, less bias)
     - Prometheus 2 (open-source evaluator LLM)
     - SE-Jury (ensemble judges)
   - **FPF (First Principles Framework)**: Comprehensive specification for
     transdisciplinary methods including:
     - F-G-R Trust & Assurance Calculus (Formality-Scope-Reliability)
     - Holonic composition
     - Evidence Graph patterns
     - Measurement characterization (MM-CHR)
     - Creativity characterization (Creativity-CHR)

3. Files and Code Sections:
   - `/Users/stas-studio/Developer/PromptAgent/src/eval.ts`
     - Core distributional evaluation implementation
     - Contains: `EpicDistResult`, `PromptDistReport`, objective function with
       weights (0.45 passRate + 0.35 meanOfMeans + 0.20 meanP10)
   - `/Users/stas-studio/Developer/PromptAgent/src/pairMining.ts`
     - Contrastive pair mining (OPRO-style)
     - Finds pairs with `cosine_sim > 0.86 AND score_delta > 0.15`
   - `/Users/stas-studio/Developer/PromptAgent/src/cli/optimize.ts`
     - Main optimization loop implementing paper 2507.22133 methodology
   - `/Users/stas-studio/Developer/PromptAgent/src/config.ts`
     - Configuration parameters referencing paper sections (3.1, 3.2, 3.3)
   - `/Users/stas-studio/Downloads/FPF-Spec (7) (1).md`
     - FPF specification document (40,000+ lines)
     - Just started reading (first 500 lines)
     - Contains patterns for: Holonic Foundation, Role Taxonomy, Transformer
       Constitution, Trust Calculus, Evidence Graph, etc.

4. Errors and fixes:
   - No code errors encountered
   - Research task completed successfully with comprehensive findings

5. Problem Solving:
   - Identified current methodology is from paper 2507.22133
   - Validated current approaches against 2024-2025 research
   - Found upgrade opportunities:
     - HIGH: Switch to PoLL (3-judge panel), add tiered contrastive pairs
     - MEDIUM: Add meta-evolution (PromptBreeder style), criteria decomposition
     - LOW: Confidence intervals, tournament/Elo selection

6. All user messages:
   - "I was trying demo with UI and I have realized that data not clear and how
     we measing it. DO we follw some emthodfor motniorign ?"
   - "are we follwong any method for optimized system?"
   - "befor update, cna we check if your method are sstill good? fo each part
     dserach fornew discovrerisee / reserch / publicatoins"
   - "[@FPF-Spec%20(7)%20(1).md](file:///Users/stas-studio/Downloads/FPF-Spec%20(7)%20(1).md)
     I want you to usi FPF to come up with evaluator for you proeject. So we
     would have custon uniqui, basedon SOTA mete-mate evaluateors. before we wil
     mae a choce with which new method to adotp"

7. Pending Tasks:
   - Read and understand the FPF specification thoroughly
   - Design a custom FPF-based evaluator for PromptAgent
   - The evaluator should be unique, based on SOTA meta-evaluation methods
   - This should be completed BEFORE deciding which new research method to adopt

8. Current Work: I had just started reading the FPF-Spec document
   (`/Users/stas-studio/Downloads/FPF-Spec (7) (1).md`) to understand the
   framework's principles for designing a custom evaluator. The user's explicit
   request was:

   > "I want you to usi FPF to come up with evaluator for you proeject. So we
   > would have custon uniqui, basedon SOTA mete-mate evaluateors. before we wil
   > mae a choce with which new method to adotp"

   I read the first 500 lines of the FPF spec which covers the Table of Contents
   and Part A - Kernel Architecture Cluster introduction. Key patterns
   identified include:
   - Trust & Assurance Calculus (F-G-R)
   - Evidence Graph patterns
   - MM-CHR (Measurement & Metrics)
   - Creativity-CHR
   - Role-Method-Work alignment

9. Optional Next Step: Continue reading the FPF specification, particularly
   focusing on sections relevant to evaluation:
   - B.3 Trust & Assurance Calculus (F-G-R)
   - C.16 MM-CHR (Measurement & Metrics Characterization)
   - C.17 Creativity-CHR
   - A.10 Evidence Graph Referring Then design a custom FPF-based evaluator that
     incorporates the research findings (PoLL, contrastive pairs,
     meta-evolution) structured according to FPF principles.. Please continue
     the conversation from where we left it off without asking the user any
     further questions. Continue with the last task that you were asked to work
     on.

`★Insight ─────────────────────────────────────` **FPF-Based Meta-Evaluator
Design Principles:**

1. **F-G-R Trust Calculus** - The core innovation is treating prompt evaluation
   as an _assurance problem_. Instead of a single score, we compute
   `⟨F_eff, G_eff, R_eff⟩` tuples where:
   - **F (Formality)**: Ordinal scale - how structured/formal the prompt is
   - **G (ClaimScope)**: Coverage - what epic types the prompt reliably handles
   - **R (Reliability)**: Ratio [0,1] - evidence-backed confidence, _penalized_
     by integration quality (CL)
2. **Weakest-Link Aggregation (WLNK)** - FPF's key insight:
   `R_eff = max(0, min(R_i) - Φ(CL_min))`. This prevents "trust inflation" where
   averaging hides weak components. Your current implementation already
   partially does this with `p10` (10th percentile), but FPF formalizes it.
3. **NQD Portfolio Selection** - Instead of returning a single "best" prompt,
   return Pareto fronts. `Illumination` (coverage metrics) is _report-only
   telemetry_, never part of dominance - this prevents gaming coverage at the
   expense of quality.

## Summary: FPF-Based Meta-Evaluator for PromptAgent

### What Makes It Unique

The evaluator synthesizes **multiple SOTA approaches** under a single rigorous
framework:

| Component            | SOTA Method          | FPF Principle                     |
| -------------------- | -------------------- | --------------------------------- |
| **Multi-Judge**      | PoLL (Panel of LLMs) | B.3 WLNK aggregation              |
| **Reliability**      | F-G-R Trust Calculus | Weakest-link + CL penalties       |
| **Creativity**       | Creativity-CHR       | N-U-C-D characteristics           |
| **Selection**        | NQD-CAL              | Pareto fronts, not single winners |
| **Scale Discipline** | MM-CHR               | No illegal averaging of ordinals  |

### Key Innovations

1. **Assurance Tuples Instead of Scores**

   ```
   Assurance(Prompt, Claim | Context, Scope) = ⟨F_eff, G_eff, R_eff, SCR⟩
   ```

   - **F_eff**: `min(F_i)` across judges (ordinal, never averaged)
   - **G_eff**: SpanUnion of supported epic types
   - **R_eff**: `max(0, min(R_i) - Φ(CL_min))` with congruence penalty

2. **PoLL (3-Judge Panel)**
   - 7x cheaper than single large model
   - Less bias through diversity
   - FPF-compliant conservative aggregation

3. **Creativity Characteristics**
   - **Novelty@context**: Distance from reference prompt corpus
   - **Use-Value**: Measured improvement against objective
   - **Constraint-Fit**: Schema/safety compliance
   - **Diversity_P**: Portfolio coverage contribution

4. **Portfolio Selection (NQD-CAL)**
   - Returns Pareto fronts, not single "best" prompts
   - Illumination is report-only telemetry
   - Explicit E/E-LOG policies for exploration vs exploitation

### Migration Path

1. **Phase 1**: Replace single judge with 3-judge PoLL
2. **Phase 2**: Add F-G-R assurance tuples
3. **Phase 3**: Implement NQD portfolio selection
4. **Phase 4**: Full FPF conformance audit

### Why This Matters

Your current implementation has the right intuition (distributional evaluation,
p10 for worst-case), but FPF provides:

- **Formal justification** for why `min` aggregation is correct (WLNK)
- **Scale discipline** that prevents averaging ordinals (INVEST is ordinal!)
- **Congruence tracking** (CL) to penalize weak prompt↔epic mappings
- **Auditable evidence** (SCR) for every as

### Medium Priority

- Wire up scorer to evaluate generated stories
- Show pass/fail gate decision
- Returns score, reason, gateDecision, and FPF subscores
- Add "Save as Champion" button with loading state
- Store prompt versions in `prompts/versions/` with timestamps
- Auto-backup before overwriting
- GET `/champion/versions` endpoint for history
- JSON export for API integration
- Download buttons in Stories tab

rance claim

This gives you a **unique, defensible, SOTA meta-evaluator** before deciding
which specific new method (PoLL, Prometheus, PhaseEvo, etc.) to adopt - because
the FPF framework can accommodate any of them while maintaining measurement
integrity.
