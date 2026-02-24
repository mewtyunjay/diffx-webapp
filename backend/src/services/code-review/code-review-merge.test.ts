import { describe, expect, it } from "vitest";
import type { CodeReviewFinding } from "@diffx/contracts";
import { mergeCodeReviewFindings } from "./code-review-merge.js";

function finding(overrides: Partial<CodeReviewFinding>): CodeReviewFinding {
  return {
    id: overrides.id ?? "finding-id",
    severity: overrides.severity ?? "medium",
    type: overrides.type ?? "correctness",
    title: overrides.title ?? "Potential issue",
    summary: overrides.summary ?? "Summary",
    path: overrides.path ?? "src/app.ts",
    lineStart: overrides.lineStart ?? 1,
    lineEnd: overrides.lineEnd ?? 1,
    agent: overrides.agent ?? "correctness",
  };
}

describe("mergeCodeReviewFindings", () => {
  it("deduplicates matching findings and sorts by severity then location", () => {
    const existing = [
      finding({
        id: "a",
        severity: "medium",
        path: "src/b.ts",
        lineStart: 20,
        title: "Medium issue",
      }),
    ];

    const incoming = [
      finding({
        id: "duplicate",
        severity: "medium",
        path: "src/b.ts",
        lineStart: 20,
        title: "Medium issue",
      }),
      finding({
        id: "critical",
        severity: "critical",
        path: "src/a.ts",
        lineStart: 5,
        title: "Critical issue",
      }),
      finding({
        id: "low",
        severity: "low",
        path: "src/z.ts",
        lineStart: 1,
        title: "Low issue",
      }),
    ];

    const merged = mergeCodeReviewFindings(existing, incoming);

    expect(merged).toHaveLength(3);
    expect(merged.map((item) => item.id)).toEqual(["critical", "a", "low"]);
  });
});
