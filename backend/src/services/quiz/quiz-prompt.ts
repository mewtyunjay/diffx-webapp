import type { QuizGenerationInput } from "./quiz-provider-config.js";

const MAX_PROMPT_CONTEXT_CHARS = 16_000;

export const QUIZ_JSON_SCHEMA_TEMPLATE = `
{
  "title": "string",
  "generatedAt": "ISO-8601 timestamp",
  "questions": [
    {
      "id": "q-1",
      "prompt": "string",
      "snippet": "string or null",
      "options": ["string", "string", "string", "string"],
      "correctOptionIndex": 0,
      "explanation": "string or null",
      "tags": ["string"]
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

export function buildQuizPrompt(input: QuizGenerationInput): string {
  const commitSummary = input.commitMessage.trim().length > 0 ? input.commitMessage.trim() : "(none)";
  const focusSummary = input.focusFiles.length > 0 ? input.focusFiles.join(", ") : "(none)";

  return [
    "You are DiffX quiz generator.",
    "Create a commit-readiness quiz using ONLY the provided diff context.",
    "Return ONLY valid JSON. Do not wrap in markdown.",
    `Generate exactly ${input.questionCount} questions.`,
    "Each question must have exactly 4 options.",
    "correctOptionIndex must be an integer in [0, 3].",
    "Use concise prompts focused on intent, behavior, and regressions.",
    "If context is limited, still return schema-valid questions grounded in available details.",
    "JSON schema:",
    QUIZ_JSON_SCHEMA_TEMPLATE,
    "--- Commit context ---",
    `Commit message draft: ${commitSummary}`,
    `Focus files: ${focusSummary}`,
    "--- Diff context ---",
    boundedPromptContext(input.promptContext),
  ].join("\n");
}
