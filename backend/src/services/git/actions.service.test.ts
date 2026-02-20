import { describe, expect, it } from "vitest";
import {
  buildCommitMessagePrompt,
  extractCommitMessageResponseText,
  filterStagedFilesForCommitContext,
  sanitizeCommitMessageSuggestion,
} from "./actions.service.js";

describe("filterStagedFilesForCommitContext", () => {
  it("returns all staged files without limiting count", () => {
    const stagedFiles = Array.from({ length: 10 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      status: "staged",
    }));
    const files = [
      { path: "src/unstaged-a.ts", status: "unstaged" },
      ...stagedFiles,
      { path: "src/untracked-a.ts", status: "untracked" },
    ];

    const selected = filterStagedFilesForCommitContext(files);

    expect(selected).toEqual(stagedFiles);
  });
});

describe("extractCommitMessageResponseText", () => {
  it("prefers finalResponse over noisy item payloads", () => {
    const response = {
      items: [
        {
          id: "todo-1",
          type: "todo_list",
          items: [{ text: "item_0", completed: false }],
        },
      ],
      finalResponse: "wire commit message parser",
      usage: null,
    };

    expect(extractCommitMessageResponseText(response)).toBe("wire commit message parser");
  });

  it("falls back to agent_message text when finalResponse is empty", () => {
    const response = {
      items: [
        {
          id: "agent-1",
          type: "agent_message",
          text: "ship commit parser safeguards",
        },
      ],
      finalResponse: "",
      usage: null,
    };

    expect(extractCommitMessageResponseText(response)).toBe("ship commit parser safeguards");
  });
});

describe("sanitizeCommitMessageSuggestion", () => {
  it("extracts the first usable single-line subject", () => {
    const value = `\nCommit message: "wire commit composer"\n\nextra details`;

    expect(sanitizeCommitMessageSuggestion(value)).toBe("wire commit composer");
  });

  it("ignores placeholder lines such as item_0", () => {
    const value = "item_0\nwire commit composer";

    expect(sanitizeCommitMessageSuggestion(value)).toBe("wire commit composer");
  });

  it("returns null when no valid line is present", () => {
    expect(sanitizeCommitMessageSuggestion("\n\n```\nitem_0\n")).toBeNull();
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
