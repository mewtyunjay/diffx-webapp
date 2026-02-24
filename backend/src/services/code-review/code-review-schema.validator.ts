import type {
  CodeReviewFinding,
  CodeReviewIssueType,
  CodeReviewSeverity,
} from "@diffx/contracts";
import type { CodeReviewSpecialist } from "./specialists.js";

const MAX_FINDINGS_PER_AGENT = 16;

type NormalizedFinding = Omit<CodeReviewFinding, "id" | "agent">;

const SEVERITY_ALIASES: Record<string, CodeReviewSeverity> = {
  critical: "critical",
  crit: "critical",
  high: "high",
  medium: "medium",
  med: "medium",
  moderate: "medium",
  low: "low",
  info: "low",
  informational: "low",
};

const TYPE_ALIASES: Record<string, CodeReviewIssueType> = {
  security: "security",
  vuln: "security",
  vulnerability: "security",
  correctness: "correctness",
  bug: "correctness",
  reliability: "correctness",
  performance: "performance",
  perf: "performance",
  maintainability: "maintainability",
  maintainable: "maintainability",
  readability: "maintainability",
  quality: "maintainability",
};

function toTrimmedString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  return trimmed;
}

function toBoundedString(value: unknown, fallback: string, maxLength: number): string {
  const text = toTrimmedString(value, fallback);
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

function toSeverity(value: unknown): CodeReviewSeverity {
  if (typeof value !== "string") {
    return "medium";
  }

  return SEVERITY_ALIASES[value.trim().toLowerCase()] ?? "medium";
}

function toIssueType(value: unknown, specialist: CodeReviewSpecialist): CodeReviewIssueType {
  if (typeof value !== "string") {
    return specialist.defaultType;
  }

  return TYPE_ALIASES[value.trim().toLowerCase()] ?? specialist.defaultType;
}

function toLine(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function normalizeCandidate(
  candidate: unknown,
  specialist: CodeReviewSpecialist,
): NormalizedFinding | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const path = toBoundedString(record.path, "unknown", 300);
  const title = toBoundedString(record.title, "Potential issue detected", 180);
  const summary = toBoundedString(
    record.summary,
    `${specialist.title} flagged this change for follow-up review.`,
    500,
  );

  const lineStart = toLine(record.lineStart);
  const lineEndRaw = toLine(record.lineEnd);
  const lineEnd = lineStart !== null && lineEndRaw !== null && lineEndRaw < lineStart
    ? lineStart
    : lineEndRaw;

  return {
    severity: toSeverity(record.severity),
    type: toIssueType(record.type, specialist),
    title,
    summary,
    path,
    lineStart,
    lineEnd,
  };
}

function extractCandidates(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.findings)) {
    return [];
  }

  return record.findings;
}

export function validateCodeReviewFindings(
  payload: unknown,
  specialist: CodeReviewSpecialist,
): NormalizedFinding[] {
  const candidates = extractCandidates(payload);
  const findings: NormalizedFinding[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate, specialist);
    if (!normalized) {
      continue;
    }

    findings.push(normalized);

    if (findings.length >= MAX_FINDINGS_PER_AGENT) {
      break;
    }
  }

  return findings;
}

export type { NormalizedFinding };
