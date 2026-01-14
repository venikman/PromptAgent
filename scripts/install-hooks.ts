#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

/**
 * Install git hooks for PromptAgent
 *
 * Usage:
 *   deno run -A scripts/install-hooks.ts
 *   deno task hooks:install
 *
 * @module install-hooks
 */

import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = Deno.cwd();
const GIT_HOOKS_DIR = join(ROOT_DIR, ".git", "hooks");

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// Pre-commit hook content
const PRE_COMMIT_HOOK = `#!/bin/sh
# PromptAgent Pre-commit Hook
# Installed by: deno run -A scripts/install-hooks.ts

echo "Running pre-commit checks..."

# Run the pre-commit checks
deno run -A scripts/pre-commit-checks.ts

# Capture exit code
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Pre-commit checks failed. Commit aborted."
  echo "Fix the issues above or use --no-verify to skip (not recommended)."
  exit 1
fi

exit 0
`;

// Pre-push hook content (runs full test suite)
const PRE_PUSH_HOOK = `#!/bin/sh
# PromptAgent Pre-push Hook
# Installed by: deno run -A scripts/install-hooks.ts

echo "Running pre-push checks..."

# Run full test suite
deno task test

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Tests failed. Push aborted."
  echo "Fix failing tests or use --no-verify to skip (not recommended)."
  exit 1
fi

echo "All tests passed!"
exit 0
`;

function installHook(name: string, content: string) {
  const hookPath = join(GIT_HOOKS_DIR, name);

  // Check if hook already exists
  if (existsSync(hookPath)) {
    console.log(
      `${YELLOW}⚠ ${name} hook already exists, backing up...${RESET}`,
    );
    const backupPath = `${hookPath}.backup`;
    Deno.renameSync(hookPath, backupPath);
  }

  // Write the hook
  writeFileSync(hookPath, content);

  // Make executable
  chmodSync(hookPath, 0o755);

  console.log(`${GREEN}✓ Installed ${name} hook${RESET}`);
}

function main() {
  console.log(`${BOLD}Installing git hooks for PromptAgent...${RESET}\n`);

  // Check if .git directory exists
  if (!existsSync(join(ROOT_DIR, ".git"))) {
    console.error("Error: Not a git repository. Run from the project root.");
    Deno.exit(1);
  }

  // Create hooks directory if it doesn't exist
  if (!existsSync(GIT_HOOKS_DIR)) {
    Deno.mkdirSync(GIT_HOOKS_DIR, { recursive: true });
  }

  // Install hooks
  installHook("pre-commit", PRE_COMMIT_HOOK);
  installHook("pre-push", PRE_PUSH_HOOK);

  console.log(`\n${GREEN}${BOLD}✓ Git hooks installed successfully!${RESET}`);
  console.log(`\nHooks will run automatically on:`);
  console.log(`  - ${BOLD}git commit${RESET} → runs pre-commit checks`);
  console.log(`  - ${BOLD}git push${RESET} → runs full test suite`);
  console.log(`\nTo skip hooks (not recommended): git commit --no-verify`);
}

main();
