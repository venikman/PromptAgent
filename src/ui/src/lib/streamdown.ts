const TEXT_FENCE_REGEX = /(^|\n)(\s*)(```|~~~)\s*text\b/gi;

export const normalizeStreamdownMarkdown = (value: string) =>
  value.replace(TEXT_FENCE_REGEX, "$1$2$3 markdown");
