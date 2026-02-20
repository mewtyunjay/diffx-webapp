import { describe, expect, it } from "vitest";
import {
  buildCommitMessagePrompt,
  sanitizeCommitMessageSuggestion,
} from "./actions.service.js";

describe("sanitizeCommitMessageSuggestion", () => {
  it("extracts the first usable single-line subject", () => {
    const value = `\nCommit message: "wire commit composer"\n\nextra details`;

    expect(sanitizeCommitMessageSuggestion(value)).toBe("wire commit composer");
  });

  it("returns null when no valid line is present", () => {
    expect(sanitizeCommitMessageSuggestion("\n\n```\n")).toBeNull();
  });
});

describe("buildCommitMessagePrompt", () => {
  it("includes commit history, staged context, and optional draft", () => {
    const prompt = buildCommitMessagePrompt({
      stagedFileContext: "File: src/app.ts\nPatch:\n+new",
      recentCommitSubjects: ["wire api endpoints", "project setup"],
      draft: "ship composer",
    });

    expect(prompt).toContain("Recent local commit subjects:");
    expect(prompt).toContain("- wire api endpoints");
    expect(prompt).toContain("Current draft from user:");
    expect(prompt).toContain("ship composer");
    expect(prompt).toContain("Current staged change context:");
  });
});
