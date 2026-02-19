import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getQuizGeneratorProvider,
  resetQuizGeneratorProviderForTests,
  setQuizGeneratorProviderForTests,
  type QuizGeneratorProvider,
} from "./provider-registry.js";

describe("provider-registry", () => {
  beforeEach(() => {
    resetQuizGeneratorProviderForTests();
  });

  afterEach(() => {
    resetQuizGeneratorProviderForTests();
  });

  it("uses deterministic provider in test runtime by default", async () => {
    const provider = await getQuizGeneratorProvider();
    const config = provider.getAgentConfig();

    expect(config.provider).toBe("deterministic-test-provider");
    expect(config.model).toBe("deterministic");
  });

  it("honors explicit provider overrides in tests", async () => {
    const override: QuizGeneratorProvider = {
      id: "claude",
      async checkAvailability() {
        return { available: true };
      },
      getAgentConfig() {
        return {
          provider: "override-provider",
          model: "override-model",
          reasoningEffort: "n/a",
        };
      },
      async generateQuiz() {
        return { title: "override" };
      },
    };

    setQuizGeneratorProviderForTests(override);

    const provider = await getQuizGeneratorProvider();

    expect(provider).toBe(override);
    expect(provider.getAgentConfig().provider).toBe("override-provider");
  });
});
