import type { CodeReviewIssueType, CodeReviewSeverity } from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { logBackendEvent } from "../../logging/logger.js";
import { createCodexCodeReviewProvider } from "./providers/codex.provider.js";
import type { CodeReviewSpecialist } from "./specialists.js";

type CodeReviewProviderId = "codex";

type CodeReviewProviderAvailability = {
  available: boolean;
  reason?: string;
};

type CodeReviewAgentConfig = {
  provider: string;
  model: string;
  reasoningEffort: string;
};

type CodeReviewProvider = {
  id: CodeReviewProviderId;
  checkAvailability: () => Promise<CodeReviewProviderAvailability>;
  getAgentConfig: () => CodeReviewAgentConfig;
  runSpecialist: (input: {
    specialist: CodeReviewSpecialist;
    focusFiles: string[];
    promptContext: string;
    signal: AbortSignal;
  }) => Promise<unknown>;
};

const PROVIDER_ID: CodeReviewProviderId = "codex";
let providerCache: CodeReviewProvider | null = null;
let providerOverrideForTests: CodeReviewProvider | null = null;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function createDeterministicTestProvider(): CodeReviewProvider {
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
    async runSpecialist(input) {
      const firstPath = input.focusFiles[0] ?? "unknown";
      const severityBySpecialist: Record<CodeReviewSpecialist["id"], CodeReviewSeverity> = {
        security: "high",
        correctness: "medium",
        performance: "low",
        maintainability: "low",
      };
      const typeBySpecialist: Record<CodeReviewSpecialist["id"], CodeReviewIssueType> = {
        security: "security",
        correctness: "correctness",
        performance: "performance",
        maintainability: "maintainability",
      };

      return {
        findings: [
          {
            severity: severityBySpecialist[input.specialist.id],
            type: typeBySpecialist[input.specialist.id],
            title: `${input.specialist.title} follow-up`,
            summary: `${input.specialist.title} flagged potential risk in changed code.`,
            path: firstPath,
            lineStart: 1,
            lineEnd: 1,
          },
        ],
      };
    },
  };
}

function getProvider(): CodeReviewProvider {
  if (providerCache) {
    return providerCache;
  }

  providerCache = createCodexCodeReviewProvider();
  return providerCache;
}

export async function getCodeReviewProvider(): Promise<CodeReviewProvider> {
  if (providerOverrideForTests) {
    return providerOverrideForTests;
  }

  if (isTestRuntime()) {
    return createDeterministicTestProvider();
  }

  const provider = getProvider();
  const availability = await provider.checkAvailability();

  if (!availability.available) {
    throw new ApiRouteError(
      502,
      "REVIEW_GENERATION_FAILED",
      `Code review provider '${PROVIDER_ID}' is unavailable${
        availability.reason ? `: ${availability.reason}` : "."
      }`,
    );
  }

  return provider;
}

export async function getCodeReviewProviderStatus(): Promise<{
  id: CodeReviewProviderId;
  available: boolean;
  reason: string | null;
  model: string;
}> {
  if (providerOverrideForTests) {
    return {
      id: providerOverrideForTests.id,
      available: true,
      reason: null,
      model: providerOverrideForTests.getAgentConfig().model,
    };
  }

  if (isTestRuntime()) {
    return {
      id: PROVIDER_ID,
      available: true,
      reason: null,
      model: "deterministic",
    };
  }

  const provider = getProvider();
  const availability = await provider.checkAvailability();

  logBackendEvent("provider", availability.available ? "info" : "warn", "code-review:provider-status", {
    provider: provider.id,
    available: availability.available,
    reason: availability.reason ?? null,
  });

  return {
    id: provider.id,
    available: availability.available,
    reason: availability.available ? null : (availability.reason ?? "Unavailable."),
    model: provider.getAgentConfig().model,
  };
}

export function setCodeReviewProviderForTests(next: CodeReviewProvider | null) {
  providerOverrideForTests = next;
  providerCache = null;
}

export function resetCodeReviewProviderForTests() {
  providerOverrideForTests = null;
  providerCache = null;
}

export type {
  CodeReviewProvider,
  CodeReviewAgentConfig,
  CodeReviewProviderAvailability,
  CodeReviewProviderId,
};
