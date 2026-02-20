import { ApiRouteError } from "../../domain/api-route-error.js";
import type { QuizProviderId, QuizProviderPreference, QuizProviderStatus } from "@diffx/contracts";
import { logBackendEvent } from "../../logging/logger.js";
import { createCodexQuizProvider } from "./providers/codex.provider.js";
import {
  getQuizProviderConfig,
  type QuizGenerationInput,
} from "./quiz-provider-config.js";

type QuizProviderAvailability = {
  available: boolean;
  reason?: string;
};

type QuizGeneratorAgentConfig = {
  provider: string;
  model: string;
  reasoningEffort: string;
};

type QuizGeneratorProvider = {
  id: QuizProviderId;
  checkAvailability: () => Promise<QuizProviderAvailability>;
  getAgentConfig: () => QuizGeneratorAgentConfig;
  generateQuiz: (input: QuizGenerationInput) => Promise<unknown>;
};

const PROVIDER_ORDER: QuizProviderId[] = ["codex"];

let providerCache = new Map<QuizProviderId, QuizGeneratorProvider>();
let providerOverrideForTests: QuizGeneratorProvider | null = null;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function toSnippet(context: string): string | null {
  const trimmed = context.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split("\n").slice(0, 10);
  return lines.join("\n");
}

function createDeterministicTestProvider(): QuizGeneratorProvider {
  return {
    id: "codex",
    async checkAvailability() {
      return { available: true };
    },
    getAgentConfig() {
      return {
        provider: "deterministic-test-provider",
        model: "deterministic",
        reasoningEffort: "n/a",
      };
    },
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
    },
  };
}

function getProvider(providerId: QuizProviderId): QuizGeneratorProvider {
  const cached = providerCache.get(providerId);
  if (cached) {
    return cached;
  }

  const created = createCodexQuizProvider();

  providerCache.set(providerId, created);
  return created;
}

function resolveCandidateOrder(preference: QuizProviderPreference): QuizProviderId[] {
  const remaining = PROVIDER_ORDER.filter((provider) => provider !== preference);
  return [preference, ...remaining];
}

function toNoProviderError(reasonsByProvider: Map<QuizProviderId, string>): ApiRouteError {
  const reasonLines = PROVIDER_ORDER.map((providerId) => {
    const reason = reasonsByProvider.get(providerId) ?? "unavailable";
    return `${providerId}: ${reason}`;
  }).join("; ");

  return new ApiRouteError(
    502,
    "QUIZ_GENERATION_FAILED",
    `Codex is unavailable. Authenticate with \`codex login\` and retry quiz generation. (${reasonLines})`,
  );
}

function toPreferredProviderError(
  preferredProvider: QuizProviderId,
  availability: QuizProviderAvailability,
): ApiRouteError {
  return new ApiRouteError(
    502,
    "QUIZ_GENERATION_FAILED",
    `Preferred quiz provider '${preferredProvider}' is unavailable${
      availability.reason ? `: ${availability.reason}` : "."
    }`,
  );
}

export async function getQuizGeneratorProvider(
  preferenceOverride?: QuizProviderPreference,
): Promise<QuizGeneratorProvider> {
  if (providerOverrideForTests) {
    logBackendEvent("provider", "debug", "provider:using-test-override", {
      providerId: providerOverrideForTests.id,
    });
    return providerOverrideForTests;
  }

  if (isTestRuntime()) {
    logBackendEvent("provider", "debug", "provider:using-deterministic-test-runtime", {});
    return createDeterministicTestProvider();
  }

  const config = getQuizProviderConfig();
  const effectivePreference = preferenceOverride ?? config.preference;
  const candidateOrder = resolveCandidateOrder(effectivePreference);
  const reasonsByProvider = new Map<QuizProviderId, string>();

  logBackendEvent("provider", "info", "provider:resolve-start", {
    preference: effectivePreference,
    candidates: candidateOrder,
  });

  for (const providerId of candidateOrder) {
    const provider = getProvider(providerId);
    const availability = await provider.checkAvailability();

    logBackendEvent("provider", availability.available ? "info" : "warn", "provider:availability", {
      providerId,
      available: availability.available,
      reason: availability.reason ?? null,
    });

    if (availability.available) {
      logBackendEvent("provider", "info", "provider:selected", {
        providerId,
        preference: effectivePreference,
      });
      return provider;
    }

    reasonsByProvider.set(providerId, availability.reason ?? "unavailable");

    if (providerId === effectivePreference) {
      logBackendEvent("provider", "warn", "provider:preferred-unavailable", {
        providerId,
        reason: availability.reason ?? null,
      });
      throw toPreferredProviderError(providerId, availability);
    }
  }

  logBackendEvent("provider", "error", "provider:none-available", {
    reasons: Object.fromEntries(reasonsByProvider),
  });

  throw toNoProviderError(reasonsByProvider);
}

export async function getQuizProviderStatuses(): Promise<QuizProviderStatus[]> {
  if (providerOverrideForTests) {
    logBackendEvent("provider", "debug", "provider:status-test-override", {
      providerId: providerOverrideForTests.id,
    });
    return PROVIDER_ORDER.map((providerId) => ({
      id: providerId,
      available: providerId === providerOverrideForTests!.id,
      reason:
        providerId === providerOverrideForTests!.id
          ? null
          : "Provider unavailable in test override mode.",
      model: getProvider(providerId).getAgentConfig().model,
    }));
  }

  if (isTestRuntime()) {
    logBackendEvent("provider", "debug", "provider:status-test-runtime", {});
    return PROVIDER_ORDER.map((providerId) => ({
      id: providerId,
      available: providerId === "codex",
      reason: providerId === "codex" ? null : "Provider checks are disabled in test runtime.",
      model: providerId === "codex" ? "deterministic" : getProvider(providerId).getAgentConfig().model,
    }));
  }

  const providers = PROVIDER_ORDER.map((providerId) => getProvider(providerId));
  const availability = await Promise.all(providers.map(async (provider) => await provider.checkAvailability()));

  logBackendEvent("provider", "info", "provider:status-snapshot", {
    providers: providers.map((provider, index) => ({
      id: provider.id,
      available: availability[index]?.available ?? false,
      reason: availability[index]?.reason ?? null,
    })),
  });

  return providers.map((provider, index) => ({
    id: provider.id,
    available: availability[index]?.available ?? false,
    reason: availability[index]?.available ? null : (availability[index]?.reason ?? "Unavailable."),
    model: provider.getAgentConfig().model,
  }));
}

export function setQuizGeneratorProviderForTests(next: QuizGeneratorProvider | null) {
  providerOverrideForTests = next;
  providerCache = new Map<QuizProviderId, QuizGeneratorProvider>();
}

export function resetQuizGeneratorProviderForTests() {
  providerOverrideForTests = null;
  providerCache = new Map<QuizProviderId, QuizGeneratorProvider>();
}

export type { QuizGeneratorProvider, QuizGeneratorAgentConfig, QuizProviderAvailability };
