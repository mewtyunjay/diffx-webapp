import { describe, expect, it } from "vitest";
import { validateCodeReviewFindings } from "./code-review-schema.validator.js";
import { CODE_REVIEW_SPECIALISTS } from "./specialists.js";

describe("validateCodeReviewFindings", () => {
  it("normalizes aliases and uses specialist default type fallback", () => {
    const securitySpecialist = CODE_REVIEW_SPECIALISTS.find((item) => item.id === "security");

    if (!securitySpecialist) {
      throw new Error("Expected security specialist.");
    }

    const findings = validateCodeReviewFindings(
      {
        findings: [
          {
            severity: "crit",
            type: "vulnerability",
            title: "  Injection  ",
            summary: "  Unsanitized input reaches command execution.  ",
            path: " backend/src/server.ts ",
            lineStart: 11.9,
            lineEnd: 9,
          },
          {
            severity: "info",
            type: "unknown-type",
            title: "",
            summary: "",
            path: "",
            lineStart: "x",
          },
        ],
      },
      securitySpecialist,
    );

    expect(findings).toEqual([
      {
        severity: "critical",
        type: "security",
        title: "Injection",
        summary: "Unsanitized input reaches command execution.",
        path: "backend/src/server.ts",
        lineStart: 11,
        lineEnd: 11,
      },
      {
        severity: "low",
        type: "security",
        title: "Potential issue detected",
        summary: "Security Specialist flagged this change for follow-up review.",
        path: "unknown",
        lineStart: null,
        lineEnd: null,
      },
    ]);
  });

  it("returns empty findings when payload has no findings array", () => {
    const specialist = CODE_REVIEW_SPECIALISTS[0];
    const findings = validateCodeReviewFindings({ result: [] }, specialist);
    expect(findings).toEqual([]);
  });
});
