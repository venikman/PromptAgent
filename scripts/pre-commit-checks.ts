#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

/**
 * Pre-commit checks for PromptAgent
 *
 * Run this before committing to catch configuration and code issues.
 * Can be integrated with git hooks or CI.
 *
 * Usage:
 *   deno run -A scripts/pre-commit-checks.ts
 *   deno task pre-commit
 *
 * @module pre-commit-checks
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = Deno.cwd();
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning";
}

const results: CheckResult[] = [];

function log(message: string) {
  console.log(message);
}

function check(
  name: string,
  passed: boolean,
  message: string,
  severity: "error" | "warning" = "error",
) {
  results.push({ name, passed, message, severity });

  const icon = passed
    ? `${GREEN}✓${RESET}`
    : severity === "error"
    ? `${RED}✗${RESET}`
    : `${YELLOW}⚠${RESET}`;
  const color = passed ? GREEN : severity === "error" ? RED : YELLOW;
  log(`${icon} ${color}${name}${RESET}: ${message}`);
}

// ============================================================================
// Check 1: No secrets in .env committed
// ============================================================================
function checkNoSecretsCommitted() {
  log(`\n${BOLD}Checking for secrets...${RESET}`);

  // Check if .env is tracked by git
  const gitStatusCmd = new Deno.Command("git", {
    args: ["ls-files", ".env"],
    stdout: "piped",
    stderr: "piped",
  });

  const gitStatus = gitStatusCmd.outputSync();
  const isTracked = new TextDecoder().decode(gitStatus.stdout).trim() !== "";

  check(
    "Secret files not tracked",
    !isTracked,
    isTracked
      ? ".env is tracked by git! Run: git rm --cached .env"
      : ".env is properly gitignored",
  );

  // Check staged files for secrets
  const stagedCmd = new Deno.Command("git", {
    args: ["diff", "--cached", "--name-only"],
    stdout: "piped",
    stderr: "piped",
  });

  const staged = new TextDecoder().decode(stagedCmd.outputSync().stdout).trim();
  const stagedFiles = staged.split("\n").filter(Boolean);

  let foundSecrets = false;
  for (const file of stagedFiles) {
    if (file === ".env" || file.endsWith(".env.local")) {
      foundSecrets = true;
      break;
    }

    // Check file content for API key patterns
    const filePath = join(ROOT_DIR, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        if (
          content.match(/sk-[a-zA-Z0-9]{32,}/) ||
          content.match(/sk-ant-[a-zA-Z0-9-]{32,}/)
        ) {
          check(
            `No secrets in ${file}`,
            false,
            "File may contain API keys!",
            "error",
          );
          foundSecrets = true;
        }
      } catch {
        // File might be binary or inaccessible
      }
    }
  }

  if (!foundSecrets && stagedFiles.length > 0) {
    check(
      "No secrets in staged files",
      true,
      `Checked ${stagedFiles.length} staged file(s)`,
    );
  }
}

// ============================================================================
// Check 2: Environment configuration
// ============================================================================
function checkEnvironmentConfig() {
  log(`\n${BOLD}Checking environment configuration...${RESET}`);

  // .env.example exists
  const envExamplePath = join(ROOT_DIR, ".env.example");
  check(
    ".env.example exists",
    existsSync(envExamplePath),
    existsSync(envExamplePath)
      ? "Template file present"
      : "Missing .env.example template",
  );

  // .env exists for local dev
  const envPath = join(ROOT_DIR, ".env");
  check(
    ".env exists",
    existsSync(envPath),
    existsSync(envPath)
      ? "Local config present"
      : "Missing .env for local development",
    "warning",
  );

  // Check .env has localhost configuration
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const hasLocalhost = content.includes("localhost") ||
      content.includes("127.0.0.1");
    check(
      "Local development URL",
      hasLocalhost,
      hasLocalhost
        ? "Using localhost for LM Studio"
        : "No localhost URL found - may be pointing to production",
    );
  }
}

// ============================================================================
// Check 3: TypeScript compilation
// ============================================================================
async function checkTypeScript() {
  log(`\n${BOLD}Checking TypeScript...${RESET}`);

  // Run deno check on src files
  const denoCheckCmd = new Deno.Command("deno", {
    args: ["check", "src/**/*.ts"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await denoCheckCmd.output();
  const stderr = new TextDecoder().decode(result.stderr);

  check(
    "TypeScript compilation",
    result.success,
    result.success
      ? "No type errors"
      : `Type errors found:\n${stderr.slice(0, 500)}`,
  );
}

// ============================================================================
// Check 4: Tests pass
// ============================================================================
async function checkTests() {
  log(`\n${BOLD}Running tests...${RESET}`);

  const testCmd = new Deno.Command("deno", {
    args: ["task", "test"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await testCmd.output();
  const output = new TextDecoder().decode(result.stdout);

  // Extract test summary
  const passMatch = output.match(/(\d+) pass/);
  const failMatch = output.match(/(\d+) fail/);

  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;

  check(
    "Unit tests",
    result.success && failed === 0,
    result.success ? `${passed} tests passed` : `${failed} test(s) failed`,
  );
}

// ============================================================================
// Check 5: React UI structure
// ============================================================================
function checkUi() {
  log(`\n${BOLD}Checking UI...${RESET}`);

  const indexPath = join(ROOT_DIR, "src", "ui", "index.html");
  check(
    "UI entry HTML",
    existsSync(indexPath),
    existsSync(indexPath)
      ? "src/ui/index.html present"
      : "src/ui/index.html not found",
    "warning",
  );

  const mainPath = join(ROOT_DIR, "src", "ui", "src", "main.tsx");
  check(
    "UI entry module",
    existsSync(mainPath),
    existsSync(mainPath)
      ? "src/ui/src/main.tsx present"
      : "src/ui/src/main.tsx not found",
    "warning",
  );

  const configPath = join(ROOT_DIR, "src", "ui", "vite.config.mts");
  check(
    "Vite config",
    existsSync(configPath),
    existsSync(configPath)
      ? "src/ui/vite.config.mts present"
      : "src/ui/vite.config.mts not found",
    "warning",
  );
}

// ============================================================================
// Check 6: Server entrypoint
// ============================================================================
function checkServerEntrypoint() {
  log(`\n${BOLD}Checking server entrypoints...${RESET}`);

  const localMainPath = join(ROOT_DIR, "src", "server", "main.ts");
  check(
    "Local server entry",
    existsSync(localMainPath),
    existsSync(localMainPath)
      ? "src/server/main.ts present"
      : "src/server/main.ts not found",
  );
}

// ============================================================================
// Check 7: No console.log in production code
// ============================================================================
function checkNoDebugLogs() {
  log(`\n${BOLD}Checking for debug statements...${RESET}`);

  const checkDir = (dir: string, pattern: RegExp) => {
    const files: string[] = [];

    const walk = (path: string) => {
      for (const entry of Deno.readDirSync(path)) {
        const fullPath = join(path, entry.name);
        if (
          entry.isDirectory &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          walk(fullPath);
        } else if (
          entry.isFile &&
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts")
        ) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (pattern.test(content)) {
              files.push(fullPath.replace(ROOT_DIR + "/", ""));
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    walk(dir);
    return files;
  };

  // Check for console.log (but allow console.warn, console.error)
  // Exclude CLI files which legitimately need console output
  const srcDir = join(ROOT_DIR, "src");
  if (existsSync(srcDir)) {
    const filesWithLogs = checkDir(srcDir, /console\.log\s*\(/).filter(
      (f) => !f.includes("/cli/"),
    ); // CLI files can use console.log

    check(
      "No console.log in src/",
      filesWithLogs.length === 0,
      filesWithLogs.length === 0
        ? "No debug logs found"
        : `Found in: ${filesWithLogs.slice(0, 3).join(", ")}${
          filesWithLogs.length > 3 ? "..." : ""
        }`,
      "warning",
    );
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  log(`${BOLD}╔════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}║     PromptAgent Pre-Commit Checks      ║${RESET}`);
  log(`${BOLD}╚════════════════════════════════════════╝${RESET}`);

  checkNoSecretsCommitted();
  checkEnvironmentConfig();
  await checkTypeScript();
  await checkTests();
  checkUi();
  checkServerEntrypoint();
  checkNoDebugLogs();

  // Summary
  log(`\n${BOLD}═══════════════════════════════════════${RESET}`);

  const errors = results.filter((r) => !r.passed && r.severity === "error");
  const warnings = results.filter((r) => !r.passed && r.severity === "warning");
  const passed = results.filter((r) => r.passed);

  log(`${GREEN}Passed: ${passed.length}${RESET}`);
  log(`${YELLOW}Warnings: ${warnings.length}${RESET}`);
  log(`${RED}Errors: ${errors.length}${RESET}`);

  if (errors.length > 0) {
    log(`\n${RED}${BOLD}✗ Pre-commit checks failed!${RESET}`);
    log(`${RED}Fix the errors above before committing.${RESET}`);
    Deno.exit(1);
  } else if (warnings.length > 0) {
    log(`\n${YELLOW}${BOLD}⚠ Passed with warnings${RESET}`);
    log(`${YELLOW}Consider addressing the warnings above.${RESET}`);
    Deno.exit(0);
  } else {
    log(`\n${GREEN}${BOLD}✓ All checks passed!${RESET}`);
    Deno.exit(0);
  }
}

main().catch((err) => {
  console.error(`${RED}Pre-commit check error:${RESET}`, err);
  Deno.exit(1);
});
