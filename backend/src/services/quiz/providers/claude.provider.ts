import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

async function checkClaudeCliAuth(): Promise<QuizProviderAvailability> {
  try {
    const { stdout, stderr } = await execFileAsync("claude", ["auth", "status"], {
      timeout: AUTH_CHECK_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });

    const output = `${stdout ?? ""}\n${stderr ?? ""}`.toLowerCase();

    if (output.includes("\"loggedin\": true") || output.includes("loggedin: true")) {
      return { available: true };
    }

    return {
      available: false,
      reason: "Claude CLI is installed but not authenticated. Run `claude auth login`.",
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        available: false,
        reason: "Claude CLI is not installed.",
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

    if (output.includes("\"loggedin\": true") || output.includes("loggedin: true")) {
      return { available: true };
    }

    return {
      available: false,
      reason: "Claude authentication is unavailable. Run `claude auth status` to diagnose.",
    };
  }
}

function mapClaudeError(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) {
    return error;
  }

  const message = error instanceof Error ? error.message.trim() : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not logged") ||
    normalized.includes("login required") ||
    normalized.includes("please login")
  ) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      "Claude local auth is missing. Run `claude auth login` and retry quiz generation.",
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
      "Claude authentication failed. Verify local Claude login with `claude auth status` and retry.",
    );
  }

  if (
    normalized.includes("model") &&
    (normalized.includes("not found") || normalized.includes("unknown") || normalized.includes("invalid"))
  ) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      "Claude model is invalid. Set `DIFFX_QUIZ_CLAUDE_MODEL` to a supported model.",
    );
  }

  return new ApiRouteError(
    502,
    "QUIZ_GENERATION_FAILED",
    message.length > 0 ? `Claude quiz generation failed: ${message}` : "Claude quiz generation failed.",
  );
}

export function createClaudeQuizProvider(): QuizGeneratorProvider {
  const config = getQuizProviderConfig();

  return {
    id: "claude",

    async checkAvailability() {
      return await checkClaudeCliAuth();
    },

    getAgentConfig() {
      return {
        provider: "claude-agent-sdk(local-auth)",
        model: config.claude.model,
        reasoningEffort: "n/a",
      };
    },

    async generateQuiz(input: QuizGenerationInput): Promise<unknown> {
      try {
        const sdk = await import("@anthropic-ai/claude-agent-sdk");
        const query = (sdk as { query?: unknown }).query;

        if (typeof query !== "function") {
          throw new ApiRouteError(
            500,
            "INTERNAL_ERROR",
            "Claude Agent SDK query API is unavailable in current runtime.",
          );
        }

        const stream = (query as (params: Record<string, unknown>) => AsyncIterable<unknown>)({
          prompt: buildQuizPrompt(input),
          options: {
            model: config.claude.model,
            allowedTools: [],
          },
        });

        const events: unknown[] = [];
        for await (const event of stream) {
          events.push(event);
        }

        return parseQuizPayloadFromResponse(events, "Claude");
      } catch (error) {
        throw mapClaudeError(error);
      }
    },
  };
}
