# Next Tasks for PromptAgent UI

## Completed This Session

### Backend
- [x] Live `/evaluate` endpoint with async polling
- [x] Live `/mine-pairs` endpoint for contrastive pair mining
- [x] Live `/generate-patches` endpoint for patch generation
- [x] Response transformation for LLM output → UI format
- [x] Dev script (`deno task dev`) to start both servers
- [x] Test server (`deno task test-server`) for API debugging

### Frontend
- [x] Flow A (Playground) - fully wired to live backend
- [x] Flow B (Evaluation) - wired with progress polling
- [x] Flow C (Evolution) - wired to mine-pairs/generate-patches
- [x] Compact header/hero section
- [x] Dark mode toggle
- [x] localStorage sharing between Eval → Evolution tabs

## Next Session Tasks

### High Priority
- [ ] **Tournament Backend** - Flow C tournament is still demo-only
  - Add `/run-tournament` endpoint that evaluates patch candidates
  - Return comparative metrics (objective, passRate, deltaVsChampion)

- [ ] **Error Handling** - Improve error display in UI
  - Show specific LLM errors (timeout, rate limit, etc.)
  - Add retry button for failed generations

- [ ] **Acceptance Criteria Parsing** - Current regex parsing is fragile
  - Handle different AC formats from LLM
  - Parse Given/When/Then blocks properly

### Medium Priority
- [ ] **Scorer Integration** - Display FPF scores in Flow A results
  - Wire up scorer to evaluate generated stories
  - Show pass/fail gate decision

- [ ] **Prompt Editing** - Allow saving edited prompts
  - Add "Save as Champion" button
  - Store prompt versions

- [ ] **Export** - Export generated stories
  - CSV export for ADO import
  - JSON export for API integration

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
