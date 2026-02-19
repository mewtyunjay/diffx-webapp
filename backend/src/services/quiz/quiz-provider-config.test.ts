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
    delete process.env.DIFFX_QUIZ_CLAUDE_MODEL;
    delete process.env.DIFFX_QUIZ_OPENCODE_MODEL;

    const config = getQuizProviderConfig();

    expect(config.preference).toBe("auto");
    expect(config.codex.model).toBe("gpt-5.3-codex-spark");
    expect(config.codex.reasoningEffort).toBe("xhigh");
    expect(config.claude.model).toBe("claude-sonnet-4-5-20250929");
    expect(config.opencode.model).toBeNull();
  });

  it("accepts valid env overrides and ignores invalid values", () => {
    process.env.DIFFX_QUIZ_PROVIDER = "opencode";
    process.env.DIFFX_QUIZ_CODEX_MODEL = "gpt-5.3-codex";
    process.env.DIFFX_QUIZ_CODEX_REASONING_EFFORT = "low";
    process.env.DIFFX_QUIZ_CLAUDE_MODEL = "claude-opus-4-5-20251101";
    process.env.DIFFX_QUIZ_OPENCODE_MODEL = "anthropic/claude-sonnet-4-5-20250929";

    const overridden = getQuizProviderConfig();

    expect(overridden.preference).toBe("opencode");
    expect(overridden.codex.model).toBe("gpt-5.3-codex");
    expect(overridden.codex.reasoningEffort).toBe("low");
    expect(overridden.claude.model).toBe("claude-opus-4-5-20251101");
    expect(overridden.opencode.model).toBe("anthropic/claude-sonnet-4-5-20250929");

    process.env.DIFFX_QUIZ_PROVIDER = "invalid-provider";
    process.env.DIFFX_QUIZ_CODEX_REASONING_EFFORT = "super-high";

    const fallback = getQuizProviderConfig();

    expect(fallback.preference).toBe("auto");
    expect(fallback.codex.reasoningEffort).toBe("xhigh");
  });
});
