// Shared parser for acceptance criteria strings.

// Minimum length for a valid acceptance criterion (filters out noise/fragments).
const MIN_CRITERION_LENGTH = 4;

/**
 * Parse acceptance criteria from various formats:
 * - Given/When/Then (GWT) blocks
 * - Numbered lists (1. 2. 3.)
 * - Bullet points (-, •, *, ◦)
 * - Checkbox format (- [ ], - [x])
 * - Plain newline-separated lines
 */
export function parseAcceptanceCriteria(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  const criteria: string[] = [];

  // Check for Given/When/Then format
  const gwtPattern =
    /\b(Given|When|Then|And|But)\b[:\s]+(.+?)(?=\b(?:Given|When|Then|And|But)\b|$)/gis;
  const gwtMatches = [...trimmed.matchAll(gwtPattern)];

  if (gwtMatches.length >= 2) {
    // Has GWT format - group into scenarios
    let currentScenario: string[] = [];

    for (const match of gwtMatches) {
      const keyword = match[1]!.toLowerCase();
      const content = match[2]!.trim().replace(/\n+/g, " ");

      if (keyword === "given" && currentScenario.length > 0) {
        // Start of new scenario, save previous
        criteria.push(currentScenario.join(" → "));
        currentScenario = [];
      }

      currentScenario.push(`${match[1]} ${content}`);
    }

    // Don't forget the last scenario
    if (currentScenario.length > 0) {
      criteria.push(currentScenario.join(" → "));
    }

    if (criteria.length > 0) return criteria;
  }

  // Check for numbered list format (1. or 1) or a. or a))
  const numberedPattern = /(?:^|\n)\s*(?:\d+[.)]\s*|[a-z][.)]\s*)/i;
  if (numberedPattern.test(trimmed)) {
    const items = trimmed
      .split(/(?:^|\n)\s*(?:\d+[.)]\s*|[a-z][.)]\s*)/i)
      .map((s) => s.trim().replace(/\n+/g, " "))
      .filter((s) => s.length >= MIN_CRITERION_LENGTH);
    if (items.length > 0) return items;
  }

  // Check for bullet/checkbox format
  // Matches: -, •, *, ◦, ▪, ►, →, and checkbox variants
  const bulletPattern = /(?:^|\n)\s*[-•*◦▪►→]\s*(?:\[[ x]\]\s*)?/i;
  if (bulletPattern.test(trimmed)) {
    const items = trimmed
      .split(/(?:^|\n)\s*[-•*◦▪►→]\s*(?:\[[ x]\]\s*)?/)
      .map((s) => s.trim().replace(/\n+/g, " "))
      .filter((s) => s.length >= MIN_CRITERION_LENGTH);
    if (items.length > 0) return items;
  }

  // Check for HTML list format (often from rich text)
  if (trimmed.includes("<li>")) {
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    const liMatches = [...trimmed.matchAll(liPattern)];
    const items = liMatches
      .map((m) => m[1]!.replace(/<[^>]+>/g, "").trim())
      .filter((s) => s.length >= MIN_CRITERION_LENGTH);
    if (items.length > 0) return items;
  }

  // Fallback: split by newlines (if multi-line) or return as single criterion
  const lines = trimmed
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_CRITERION_LENGTH);

  if (lines.length > 1) {
    return lines;
  }

  // Single criterion - return as array
  return trimmed.length >= MIN_CRITERION_LENGTH ? [trimmed] : [];
}
