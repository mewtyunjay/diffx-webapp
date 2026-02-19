import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex } from "@openai/codex-sdk";
import { ApiRouteError } from "../../../domain/api-route-error.js";
import { buildQuizPrompt } from "../quiz-prompt.js";
import {
  getQuizProviderConfig,
  type QuizGenerationInput,
} from "../quiz-provider-config.js";
import { parseQuizPayloadFromResponse } from "../quiz-response-parser.js";
import type {
  QuizGeneratorProvider,
  QuizProviderAvailability,
} from "../provider-registry.js";

const execFileAsync = promisify(execFile);
const AUTH_CHECK_TIMEOUT_MS = 5000;
const API_KEY_ENV_KEYS = new Set(["OPENAI_API_KEY", "CODEX_API_KEY"]);

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

async function checkCodexCliAuth(): Promise<QuizProviderAvailability> {
  try {
    const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
      timeout: AUTH_CHECK_TIMEOUT_MS,
      env: buildLocalCodexEnv(),
      maxBuffer: 1024 * 1024,
    });

    const output = `${stdout ?? ""}\n${stderr ?? ""}`.toLowerCase();

    if (output.includes("logged in") || output.includes("chatgpt")) {
      return { available: true };
    }

    return {
      available: false,
      reason: "Codex CLI is installed but not authenticated. Run `codex login`.",
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        available: false,
        reason: "Codex CLI is not installed.",
      };
    }

    const stdout =
      error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
        ? error.stdout
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : "";
    const output = `${stdout}\n${stderr}`.toLowerCase();

    if (output.includes("logged in") || output.includes("chatgpt")) {
      return { available: true };
    }

    return {
      available: false,
      reason: "Codex authentication is unavailable. Run `codex login status` to diagnose.",
    };
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
      "Codex model is invalid. Set `DIFFX_QUIZ_CODEX_MODEL` to a supported model.",
    );
  }

  return new ApiRouteError(
    502,
    "QUIZ_GENERATION_FAILED",
    message.length > 0 ? `Codex quiz generation failed: ${message}` : "Codex quiz generation failed.",
  );
}

export function createCodexQuizProvider(): QuizGeneratorProvider {
  const config = getQuizProviderConfig();
  const client = new Codex({ env: buildLocalCodexEnv() });

  return {
    id: "codex",

    async checkAvailability() {
      return await checkCodexCliAuth();
    },

    getAgentConfig() {
      return {
        provider: "codex-sdk(local-auth)",
        model: config.codex.model,
        reasoningEffort: config.codex.reasoningEffort,
      };
    },

    async generateQuiz(input: QuizGenerationInput): Promise<unknown> {
      try {
        const thread = client.startThread({
          model: config.codex.model,
          modelReasoningEffort: config.codex.reasoningEffort,
        });
        const rawResponse = await thread.run(buildQuizPrompt(input));
        return parseQuizPayloadFromResponse(rawResponse, "Codex");
      } catch (error) {
        throw mapCodexError(error);
      }
    },
  };
}
