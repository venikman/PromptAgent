#!/bin/bash
# verify-agent-setup.sh — Test suite for AGENTS.md standardization
# Per AGENTS.md: Every change must include a way to verify.

echo "========================================"
echo "Agent Setup Verification Suite"
echo "========================================"
echo ""

PASS=0
FAIL=0
WARN=0

pass() { echo "✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ FAIL: $1"; FAIL=$((FAIL + 1)); }
warn() { echo "⚠️  WARN: $1"; WARN=$((WARN + 1)); }

# Get the repo root
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "📁 Repository: $REPO_ROOT"
echo ""

# ==============================================================================
# Test A: AGENTS.md Files Present
# ==============================================================================
echo "--- Test A: AGENTS.md Files ---"

[ -f "AGENTS.md" ] && pass "Root AGENTS.md exists" || fail "Root AGENTS.md missing"
[ -f "src/ui/AGENTS.md" ] && pass "UI AGENTS.md exists" || warn "UI AGENTS.md missing"
[ -f "src/services/AGENTS.md" ] && pass "Services AGENTS.md exists" || warn "Services AGENTS.md missing"
[ -f "infra/AGENTS.md" ] && pass "Infra AGENTS.md exists" || warn "Infra AGENTS.md missing"

echo ""

# ==============================================================================
# Test B: Skills Discoverability
# ==============================================================================
echo "--- Test B: Skills Discoverability ---"

if [ -d ".codex/skills" ]; then
    CODEX_SKILLS=$(find .codex/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
    pass "Codex skills found: $CODEX_SKILLS skill(s)"
    [ -f ".codex/skills/react-best-practices/SKILL.md" ] && pass "  - react-best-practices" || warn "  - react-best-practices missing"
    [ -f ".codex/skills/web-design-guidelines/SKILL.md" ] && pass "  - web-design-guidelines" || warn "  - web-design-guidelines missing"
else
    warn "Codex skills directory not found"
fi

if [ -d ".claude/skills" ]; then
    CLAUDE_SKILLS=$(find .claude/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
    pass "Claude skills found: $CLAUDE_SKILLS skill(s)"
else
    warn "Claude skills directory not found"
fi

echo ""

# ==============================================================================
# Test C: MCP Configuration
# ==============================================================================
echo "--- Test C: MCP Configuration ---"

if [ -f ".codex/config.toml" ]; then
    pass "Codex config.toml exists"
    grep -q "\[mcp_servers" .codex/config.toml && pass "MCP servers configured" || fail "No MCP servers"
    grep -q "playwright" .codex/config.toml && pass "  - Playwright MCP" || warn "  - Playwright MCP missing"
    grep -q "figma" .codex/config.toml && pass "  - Figma MCP" || warn "  - Figma MCP missing"
    grep -q "grafana\|sentry" .codex/config.toml && pass "  - Telemetry MCP" || warn "  - Telemetry MCP missing"
else
    fail "Codex config.toml not found"
fi

echo ""

# ==============================================================================
# Test D: GitHub Actions Workflows
# ==============================================================================
echo "--- Test D: GitHub Actions ---"

[ -d ".github/workflows" ] && pass ".github/workflows exists" || fail ".github/workflows missing"
[ -f ".github/workflows/ci.yaml" ] && pass "  - CI workflow" || fail "  - CI workflow missing"
[ -f ".github/workflows/deploy.yaml" ] && pass "  - Deploy workflow" || fail "  - Deploy workflow missing"

echo ""

# ==============================================================================
# Test E: FPF Integration
# ==============================================================================
echo "--- Test E: FPF Integration ---"

[ -f ".agents/roles.yaml" ] && pass "Agent roles defined" || warn "Agent roles missing"

FPF_SKILLS=$(find .codex/skills -type d -name "fpf-*" 2>/dev/null | wc -l | tr -d ' ')
[ "$FPF_SKILLS" -gt 0 ] && pass "FPF skills: $FPF_SKILLS" || warn "No FPF skills"

echo ""

# ==============================================================================
# Test F: Content Validation
# ==============================================================================
echo "--- Test F: Content Validation ---"

if [ -f "AGENTS.md" ]; then
    grep -q "Deployment Policy" AGENTS.md && pass "Has Deployment Policy" || warn "Missing Deployment Policy"
    grep -q "FPF Patterns" AGENTS.md && pass "Has FPF Patterns" || warn "Missing FPF Patterns"
    grep -q "Proxy-Audit" AGENTS.md && pass "Has Proxy-Audit Loop" || warn "Missing Proxy-Audit"
    grep -q "isProxyFor" AGENTS.md && pass "Has isProxyFor" || warn "Missing isProxyFor"
fi

echo ""

# ==============================================================================
# Summary
# ==============================================================================
echo "========================================"
echo "Summary: ✅ $PASS passed | ❌ $FAIL failed | ⚠️ $WARN warnings"
echo "========================================"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
