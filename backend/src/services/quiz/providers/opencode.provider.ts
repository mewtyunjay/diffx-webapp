import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ApiRouteError } from "../../../domain/api-route-error.js";
import { buildQuizPrompt } from "../quiz-prompt.js";
import {
  getQuizProviderConfig,
  parseOpencodeModelRef,
  type QuizGenerationInput,
} from "../quiz-provider-config.js";
import { parseQuizPayloadFromResponse } from "../quiz-response-parser.js";
import type {
  QuizGeneratorProvider,
  QuizProviderAvailability,
} from "../provider-registry.js";

const execFileAsync = promisify(execFile);
const AUTH_CHECK_TIMEOUT_MS = 5000;

type OpencodeRuntime = {
  client: {
    session: {
      create: (input: unknown) => Promise<{ id: string }>;
      prompt: (input: unknown) => Promise<unknown>;
      delete: (input: unknown) => Promise<unknown>;
    };
  };
  server: {
    close: () => void;
  } | null;
};

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

async function checkOpencodeAuth(): Promise<QuizProviderAvailability> {
  try {
    const { stdout, stderr } = await execFileAsync("opencode", ["auth", "list"], {
      timeout: AUTH_CHECK_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });

    const output = stripAnsi(`${stdout ?? ""}\n${stderr ?? ""}`).toLowerCase();
    const credentialCountMatch = output.match(/(\d+)\s+credentials?/);
    const credentialCount = credentialCountMatch ? Number(credentialCountMatch[1]) : 0;

    if (Number.isFinite(credentialCount) && credentialCount > 0) {
      return { available: true };
    }

    return {
      available: false,
      reason: "OpenCode is installed but no provider auth is configured. Run `opencode auth login`.",
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        available: false,
        reason: "OpenCode CLI is not installed.",
      };
    }

    return {
      available: false,
      reason: "OpenCode auth check failed. Run `opencode auth list` to diagnose.",
    };
  }
}

function mapOpencodeError(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) {
    return error;
  }

  const message = error instanceof Error ? error.message.trim() : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("credential") ||
    normalized.includes("auth") ||
    normalized.includes("api key") ||
    normalized.includes("login")
  ) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      "OpenCode auth is unavailable. Run `opencode auth login` and retry quiz generation.",
    );
  }

  if (
    normalized.includes("model") &&
    (normalized.includes("not found") || normalized.includes("unknown") || normalized.includes("invalid"))
  ) {
    return new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      "OpenCode model is invalid. Set `DIFFX_QUIZ_OPENCODE_MODEL` to a valid provider/model id.",
    );
  }

  return new ApiRouteError(
    502,
    "QUIZ_GENERATION_FAILED",
    message.length > 0 ? `OpenCode quiz generation failed: ${message}` : "OpenCode quiz generation failed.",
  );
}

export function createOpencodeQuizProvider(): QuizGeneratorProvider {
  const config = getQuizProviderConfig();
  let runtimePromise: Promise<OpencodeRuntime> | null = null;

  async function getRuntime(): Promise<OpencodeRuntime> {
    if (!runtimePromise) {
      runtimePromise = (async () => {
        const sdk = await import("@opencode-ai/sdk");
        const createOpencode = (sdk as { createOpencode?: unknown }).createOpencode;

        if (typeof createOpencode !== "function") {
          throw new ApiRouteError(
            500,
            "INTERNAL_ERROR",
            "OpenCode SDK createOpencode API is unavailable in current runtime.",
          );
        }

        const instance = (await (
          createOpencode as (input: {
            hostname: string;
            config: Record<string, unknown>;
          }) => Promise<unknown>
        )({
          hostname: "127.0.0.1",
          config: config.opencode.model ? { model: config.opencode.model } : {},
        })) as {
          client: OpencodeRuntime["client"];
          server?: OpencodeRuntime["server"];
        };

        return {
          client: instance.client,
          server: instance.server ?? null,
        };
      })();
    }

    return await runtimePromise;
  }

  return {
    id: "opencode",

    async checkAvailability() {
      return await checkOpencodeAuth();
    },

    getAgentConfig() {
      return {
        provider: "opencode-sdk(config-auth)",
        model: config.opencode.model ?? "configured-default",
        reasoningEffort: "n/a",
      };
    },

    async generateQuiz(input: QuizGenerationInput): Promise<unknown> {
      let sessionId: string | null = null;

      try {
        const runtime = await getRuntime();
        const session = await runtime.client.session.create({
          body: {
            title: "DiffX quiz generation",
          },
        });

        sessionId = session.id;

        const modelRef = parseOpencodeModelRef(config.opencode.model);
        const rawResponse = await runtime.client.session.prompt({
          path: { id: session.id },
          body: {
            ...(modelRef
              ? {
                  model: modelRef,
                }
              : {}),
            parts: [
              {
                type: "text",
                text: buildQuizPrompt(input),
              },
            ],
          },
        });

        return parseQuizPayloadFromResponse(rawResponse, "OpenCode");
      } catch (error) {
        throw mapOpencodeError(error);
      } finally {
        if (sessionId) {
          try {
            const runtime = await getRuntime();
            await runtime.client.session.delete({ path: { id: sessionId } });
          } catch {
            // Best-effort cleanup only.
          }
        }
      }
    },
  };
}
