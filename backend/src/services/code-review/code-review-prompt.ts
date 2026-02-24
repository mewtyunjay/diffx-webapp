import type { CodeReviewSpecialist } from "./specialists.js";

const MAX_PROMPT_CONTEXT_CHARS = 18_000;

const CODE_REVIEW_SCHEMA_TEMPLATE = `
{
  "findings": [
    {
      "severity": "critical | high | medium | low",
      "type": "security | correctness | performance | maintainability",
      "title": "short issue title",
      "summary": "short explanation of risk and impact",
      "path": "repo-relative/file/path.ts",
      "lineStart": 12,
      "lineEnd": 18
    }
  ]
}
`.trim();

function boundedPromptContext(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= MAX_PROMPT_CONTEXT_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_PROMPT_CONTEXT_CHARS)}\n\n[context truncated for size]`;
}

export function buildCodeReviewPrompt(input: {
  specialist: CodeReviewSpecialist;
  focusFiles: string[];
  promptContext: string;
}): string {
  const fileSummary = input.focusFiles.length > 0 ? input.focusFiles.join(", ") : "(none)";

  return [
    "You are DiffX code reviewer.",
    `You are acting as: ${input.specialist.title}.`,
    `Focus area: ${input.specialist.focus}`,
    "Review ONLY the provided changed-file context.",
    "Return ONLY valid JSON and match the schema exactly.",
    "Do not wrap response in markdown.",
    "If no issues are found, return {\"findings\":[]}.",
    "Prioritize actionable findings over broad advice.",
    "Use concise issue titles and summaries.",
    "Severity must be one of: critical, high, medium, low.",
    "Type must be one of: security, correctness, performance, maintainability.",
    "JSON schema:",
    CODE_REVIEW_SCHEMA_TEMPLATE,
    "--- Changed files ---",
    fileSummary,
    "--- Review context ---",
    boundedPromptContext(input.promptContext),
  ].join("\n");
}
