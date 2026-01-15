const TEXT_FENCE_REGEX = /(^|\n)(\s*)(```|~~~)\s*text\b/gi;

/**
 * Streamdown expects markdown fences; convert `text` fences to `markdown` so
 * models that emit ```text still render with consistent formatting.
 */
export const normalizeStreamdownMarkdown = (value: string) =>
  value.replace(TEXT_FENCE_REGEX, "$1$2$3 markdown");
