import type { CodeReviewIssueType } from "@diffx/contracts";

export type CodeReviewSpecialistId =
  | "security"
  | "correctness"
  | "performance"
  | "maintainability";

export type CodeReviewSpecialist = {
  id: CodeReviewSpecialistId;
  title: string;
  defaultType: CodeReviewIssueType;
  focus: string;
};

export const CODE_REVIEW_SPECIALISTS: CodeReviewSpecialist[] = [
  {
    id: "security",
    title: "Security Specialist",
    defaultType: "security",
    focus:
      "Find vulnerabilities, unsafe input handling, authz/authn gaps, secrets exposure, injection risk, and insecure defaults.",
  },
  {
    id: "correctness",
    title: "Correctness Specialist",
    defaultType: "correctness",
    focus:
      "Find logic bugs, state transition issues, race conditions, null/undefined hazards, and contract mismatches.",
  },
  {
    id: "performance",
    title: "Performance Specialist",
    defaultType: "performance",
    focus:
      "Find avoidable latency, unnecessary repeated expensive work, unbounded memory growth, and poor algorithmic behavior.",
  },
  {
    id: "maintainability",
    title: "Maintainability Specialist",
    defaultType: "maintainability",
    focus:
      "Find brittle patterns, hard-to-change code paths, unclear ownership boundaries, and error-handling gaps.",
  },
];
