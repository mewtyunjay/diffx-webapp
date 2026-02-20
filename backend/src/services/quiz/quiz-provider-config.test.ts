import { afterEach, describe, expect, it } from "vitest";
import { getQuizProviderConfig } from "./quiz-provider-config.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getQuizProviderConfig", () => {
  it("returns expected defaults", () => {
    delete process.env.DIFFX_QUIZ_PROVIDER;
    delete process.env.DIFFX_QUIZ_CODEX_MODEL;
    delete process.env.DIFFX_QUIZ_CODEX_REASONING_EFFORT;

    const config = getQuizProviderConfig();

    expect(config.preference).toBe("codex");
    expect(config.codex.model).toBe("gpt-5.3-codex-spark");
    expect(config.codex.reasoningEffort).toBe("xhigh");
  });

  it("accepts valid env overrides and ignores invalid values", () => {
    process.env.DIFFX_QUIZ_PROVIDER = "codex";
    process.env.DIFFX_QUIZ_CODEX_MODEL = "gpt-5.3-codex";
    process.env.DIFFX_QUIZ_CODEX_REASONING_EFFORT = "low";

    const overridden = getQuizProviderConfig();

    expect(overridden.preference).toBe("codex");
    expect(overridden.codex.model).toBe("gpt-5.3-codex");
    expect(overridden.codex.reasoningEffort).toBe("low");

    process.env.DIFFX_QUIZ_PROVIDER = "invalid-provider";
    process.env.DIFFX_QUIZ_CODEX_REASONING_EFFORT = "super-high";

    const fallback = getQuizProviderConfig();

    expect(fallback.preference).toBe("codex");
    expect(fallback.codex.reasoningEffort).toBe("xhigh");
  });
});
