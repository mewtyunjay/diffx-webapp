import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex } from "@openai/codex-sdk";
import { ApiRouteError } from "../../../domain/api-route-error.js";
import { buildCodeReviewPrompt } from "../code-review-prompt.js";
import { parseCodeReviewPayloadFromResponse } from "../code-review-response-parser.js";
import type { CodeReviewProvider, CodeReviewProviderAvailability } from "../provider-registry.js";

const execFileAsync = promisify(execFile);
const AUTH_CHECK_TIMEOUT_MS = 5000;
const API_KEY_ENV_KEYS = new Set(["OPENAI_API_KEY", "CODEX_API_KEY"]);
const DEFAULT_CODE_REVIEW_MODEL = "gpt-5.3-codex-spark";
const DEFAULT_REASONING_EFFORT = "low";
const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high"]);

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

function resolveModel(): string {
  const raw = process.env.DIFFX_CODE_REVIEW_CODEX_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_CODE_REVIEW_MODEL;
}

function resolveReasoningEffort(): "low" | "medium" | "high" {
  const raw = process.env.DIFFX_CODE_REVIEW_CODEX_REASONING?.trim().toLowerCase();
  if (!raw) {
    return DEFAULT_REASONING_EFFORT;
  }

  return VALID_REASONING_EFFORTS.has(raw) ? (raw as "low" | "medium" | "high") : DEFAULT_REASONING_EFFORT;
}

async function checkCodexCliAuth(): Promise<CodeReviewProviderAvailability> {
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
      "REVIEW_GENERATION_FAILED",
      "Codex local auth is missing. Run `codex login` and retry code review.",
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
      "REVIEW_GENERATION_FAILED",
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
      "REVIEW_GENERATION_FAILED",
      "Code review model is invalid. Set `DIFFX_CODE_REVIEW_CODEX_MODEL` to a supported model.",
    );
  }

  return new ApiRouteError(
    502,
    "REVIEW_GENERATION_FAILED",
    message.length > 0 ? `Code review generation failed: ${message}` : "Code review generation failed.",
  );
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new ApiRouteError(499, "REVIEW_GENERATION_FAILED", "Code review run cancelled.");
  }
}

export function createCodexCodeReviewProvider(): CodeReviewProvider {
  const model = resolveModel();
  const reasoningEffort = resolveReasoningEffort();
  const client = new Codex({ env: buildLocalCodexEnv() });

  return {
    id: "codex",

    async checkAvailability() {
      return await checkCodexCliAuth();
    },

    getAgentConfig() {
      return {
        provider: "codex-sdk(local-auth)",
        model,
        reasoningEffort,
      };
    },

    async runSpecialist(input) {
      try {
        assertNotAborted(input.signal);

        const thread = client.startThread({
          model,
          modelReasoningEffort: reasoningEffort,
        });

        const rawResponse = await thread.run(
          buildCodeReviewPrompt({
            specialist: input.specialist,
            focusFiles: input.focusFiles,
            promptContext: input.promptContext,
          }),
        );

        assertNotAborted(input.signal);
        return parseCodeReviewPayloadFromResponse(rawResponse, "Codex");
      } catch (error) {
        throw mapCodexError(error);
      }
    },
  };
}
