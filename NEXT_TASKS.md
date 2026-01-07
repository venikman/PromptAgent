# Next Tasks for PromptAgent UI

## Completed This Session

### Backend
- [x] Live `/evaluate` endpoint with async polling
- [x] Live `/mine-pairs` endpoint for contrastive pair mining
- [x] Live `/generate-patches` endpoint for patch generation
- [x] Response transformation for LLM output → UI format
- [x] Dev script (`deno task dev`) to start both servers
- [x] Test server (`deno task test-server`) for API debugging
- [x] **Tournament Backend** - `/run-tournament` endpoint with async polling
  - Evaluates champion + all patch candidates
  - Returns TournamentCandidate[] with objective, passRate, deltaVsChampion
  - Progress tracking via `/tournament/{taskId}` polling
- [x] **Robust AC Parsing** - `parseAcceptanceCriteria()` function
  - Handles Given/When/Then blocks (grouped into scenarios)
  - Handles numbered lists (1. 2. 3.)
  - Handles bullet points (-, •, *, ◦, ▪, etc.)
  - Handles checkbox format (- [ ], - [x])
  - HTML list format fallback

### Frontend
- [x] Flow A (Playground) - fully wired to live backend
- [x] Flow B (Evaluation) - wired with progress polling
- [x] Flow C (Evolution) - wired to mine-pairs/generate-patches
- [x] Compact header/hero section
- [x] Dark mode toggle
- [x] localStorage sharing between Eval → Evolution tabs
- [x] **Tournament UI** - TournamentView wired to live `/run-tournament` backend
  - Progress bar during tournament evaluation
  - "Run Tournament" button enabled
  - Leaderboard updates in real-time
- [x] **Enhanced Error Handling** - Categorized error display
  - `categorizeError()` parses timeout, rate limit, connection, JSON errors
  - Error banners show icon, title, suggestion, collapsible details
  - Retry buttons on Playground and Evaluation flows

## Next Session Tasks

### Medium Priority
- [x] **Scorer Integration** - Display FPF scores in Flow A results
  - Wire up scorer to evaluate generated stories
  - Show pass/fail gate decision
  - Returns score, reason, gateDecision, and FPF subscores

- [x] **Prompt Editing** - Allow saving edited prompts
  - Add "Save as Champion" button with loading state
  - Store prompt versions in `prompts/versions/` with timestamps
  - Auto-backup before overwriting
  - GET `/champion/versions` endpoint for history

- [x] **Export** - Export generated stories
  - CSV export for ADO import (Work Item Type, Title, Description, AC, Story Points, Tags)
  - JSON export for API integration
  - Download buttons in Stories tab

### Low Priority
- [ ] **Charts** - Improve recharts visualizations
  - Add tooltips to distribution chart
  - Make FPF radar interactive

- [ ] **Mobile** - Responsive improvements
  - Collapse sidebar on small screens
  - Touch-friendly buttons

## Running the App

```bash
# Start both backend + UI dev server
deno task dev

# Or separately:
deno run -A deploy/main.ts  # Backend on :8000
deno task ui:dev            # UI on :5173
```

## Key Files

| File | Purpose |
|------|---------|
| `deploy/main.ts` | Backend API server |
| `ui/src/App.tsx` | Main app layout |
| `ui/src/components/playground/` | Flow A components |
| `ui/src/components/evaluation/` | Flow B components |
| `ui/src/components/evolution/` | Flow C components |
