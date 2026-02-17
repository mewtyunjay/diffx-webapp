import { Codex, type ModelReasoningEffort } from "@openai/codex-sdk";
import { ApiRouteError } from "../../domain/api-route-error.js";

type QuizGenerationInput = {
  questionCount: number;
  commitMessage: string;
  focusFiles: string[];
  promptContext: string;
};

type QuizGeneratorAgentConfig = {
  provider: string;
  model: string;
  reasoningEffort: ModelReasoningEffort | "n/a";
};

type QuizGeneratorProvider = {
  getAgentConfig: () => QuizGeneratorAgentConfig;
  generateQuiz: (input: QuizGenerationInput) => Promise<unknown>;
};

const QUIZ_MODEL_ENV_KEY = "DIFFX_QUIZ_MODEL";
const QUIZ_REASONING_EFFORT_ENV_KEY = "DIFFX_QUIZ_REASONING_EFFORT";
const DEFAULT_QUIZ_MODEL = "gpt-5.3-codex-spark";
const DEFAULT_QUIZ_REASONING_EFFORT: ModelReasoningEffort = "xhigh";
const MAX_PROMPT_CONTEXT_CHARS = 16_000;
const API_KEY_ENV_KEYS = new Set(["OPENAI_API_KEY", "CODEX_API_KEY"]);
const VALID_REASONING_EFFORTS: ModelReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

const QUIZ_SCHEMA = `
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

function buildQuizPrompt(input: QuizGenerationInput): string {
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
    QUIZ_SCHEMA,
    "--- Commit context ---",
    `Commit message draft: ${commitSummary}`,
    `Focus files: ${focusSummary}`,
    "--- Diff context ---",
    boundedPromptContext(input.promptContext),
  ].join("\n");
}

function resolveQuizModelName(): string {
  const configuredModel = process.env[QUIZ_MODEL_ENV_KEY]?.trim();
  return configuredModel && configuredModel.length > 0 ? configuredModel : DEFAULT_QUIZ_MODEL;
}

function resolveQuizReasoningEffort(): ModelReasoningEffort {
  const configuredEffort = process.env[QUIZ_REASONING_EFFORT_ENV_KEY]?.trim();

  if (!configuredEffort) {
    return DEFAULT_QUIZ_REASONING_EFFORT;
  }

  return VALID_REASONING_EFFORTS.includes(configuredEffort as ModelReasoningEffort)
    ? (configuredEffort as ModelReasoningEffort)
    : DEFAULT_QUIZ_REASONING_EFFORT;
}

function buildLocalCodexEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") {
      continue;
    }

    if (API_KEY_ENV_KEYS.has(key)) {
      continue;
    }

    env[key] = value;
  }

  return env;
}

function toSnippet(context: string): string | null {
  const trimmed = context.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split("\n").slice(0, 10);
  return lines.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeToText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.finalResponse === "string") {
    return value.finalResponse;
  }

  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  if (Array.isArray(value.items)) {
    const parts = value.items
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        return typeof item.text === "string" ? item.text : null;
      })
      .filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  if (Array.isArray(value.output)) {
    const parts = value.output
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (!isRecord(item)) {
          return null;
        }

        if (typeof item.text === "string") {
          return item.text;
        }

        if (Array.isArray(item.content)) {
          return item.content
            .map((contentPart) => {
              if (!isRecord(contentPart)) {
                return null;
              }

              return typeof contentPart.text === "string" ? contentPart.text : null;
            })
            .filter((part): part is string => Boolean(part))
            .join("\n");
        }

        return null;
      })
      .filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  return null;
}

function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf("{");

  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index]!;

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === "\\") {
          escaping = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    start = text.indexOf("{", start + 1);
  }

  return null;
}

function parseQuizPayload(raw: unknown): unknown {
  const text = normalizeToText(raw);

  if (!text) {
    throw new ApiRouteError(502, "QUIZ_GENERATION_FAILED", "Codex returned an empty quiz response.");
  }

  const jsonObject = extractFirstJsonObject(text);

  if (!jsonObject) {
    throw new ApiRouteError(
      502,
      "INVALID_QUIZ_PAYLOAD",
      "Codex response did not contain a JSON quiz payload.",
    );
  }

  try {
    return JSON.parse(jsonObject);
  } catch {
    throw new ApiRouteError(502, "INVALID_QUIZ_PAYLOAD", "Codex JSON payload could not be parsed.");
  }
}

function mapCodexError(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) {
    return error;
  }

  const message = error instanceof Error ? error.message.trim() : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("not logged") || normalized.includes("login required")) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      "Codex local auth is missing. Run `codex login` and retry quiz generation.",
    );
  }

  if (
    normalized.includes("api key") ||
    normalized.includes("auth") ||
    normalized.includes("credential") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      "Codex authentication failed. Verify local Codex login with `codex login status` and retry.",
    );
  }

  if (
    normalized.includes("model") &&
    (normalized.includes("not found") ||
      normalized.includes("unknown") ||
      normalized.includes("unsupported") ||
      normalized.includes("invalid"))
  ) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      `Codex model is invalid. Set ${QUIZ_MODEL_ENV_KEY} to a supported model.`,
    );
  }

  return new ApiRouteError(
    502,
    "QUIZ_GENERATION_FAILED",
    message.length > 0 ? `Codex quiz generation failed: ${message}` : "Codex quiz generation failed.",
  );
}

class CodexSdkProvider implements QuizGeneratorProvider {
  private readonly client: Codex;
  private readonly modelName: string;
  private readonly reasoningEffort: ModelReasoningEffort;

  constructor(client: Codex = new Codex({ env: buildLocalCodexEnv() })) {
    this.client = client;
    this.modelName = resolveQuizModelName();
    this.reasoningEffort = resolveQuizReasoningEffort();
  }

  getAgentConfig(): QuizGeneratorAgentConfig {
    return {
      provider: "codex-sdk(local-auth)",
      model: this.modelName,
      reasoningEffort: this.reasoningEffort,
    };
  }

  async generateQuiz(input: QuizGenerationInput): Promise<unknown> {
    try {
      const thread = this.client.startThread({
        model: this.modelName,
        modelReasoningEffort: this.reasoningEffort,
      });
      const response = await thread.run(buildQuizPrompt(input));
      return parseQuizPayload(response);
    } catch (error) {
      throw mapCodexError(error);
    }
  }
}

class DeterministicTestProvider implements QuizGeneratorProvider {
  getAgentConfig(): QuizGeneratorAgentConfig {
    return {
      provider: "deterministic-test-provider",
      model: "deterministic",
      reasoningEffort: "n/a",
    };
  }

  async generateQuiz(input: QuizGenerationInput): Promise<unknown> {
    const focusFiles = input.focusFiles.length > 0 ? input.focusFiles : ["selected changes"];
    const snippet = toSnippet(input.promptContext);

    const questions = Array.from({ length: input.questionCount }, (_, index) => {
      const file = focusFiles[index % focusFiles.length];
      const correctOptionIndex = index % 4;

      const options = [
        "To improve readability and maintainability.",
        "To add capability required by the current task.",
        "To remove obsolete behavior and reduce risk.",
        "To align behavior with existing contract expectations.",
      ] as const;

      return {
        id: `q-${index + 1}`,
        prompt: `What is the most likely reason this change was made in ${file}?`,
        snippet,
        options,
        correctOptionIndex,
        explanation:
          "Choose the option that best matches the intent reflected by the diff and commit context.",
        tags: ["intent", "review"],
      };
    });

    return {
      title: input.commitMessage
        ? `Commit readiness quiz: ${input.commitMessage}`
        : "Commit readiness quiz",
      generatedAt: new Date().toISOString(),
      questions,
    };
  }
}

let provider: QuizGeneratorProvider | null = null;
let providerOverrideForTests: QuizGeneratorProvider | null = null;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export function setQuizGeneratorProviderForTests(next: QuizGeneratorProvider | null) {
  providerOverrideForTests = next;
  provider = null;
}

export function resetQuizGeneratorProviderForTests() {
  providerOverrideForTests = null;
  provider = null;
}

export function getQuizGeneratorProvider(): QuizGeneratorProvider {
  if (providerOverrideForTests) {
    return providerOverrideForTests;
  }

  if (isTestRuntime()) {
    return new DeterministicTestProvider();
  }

  if (!provider) {
    provider = new CodexSdkProvider();
  }

  return provider;
}

export type { QuizGenerationInput, QuizGeneratorProvider, QuizGeneratorAgentConfig };
