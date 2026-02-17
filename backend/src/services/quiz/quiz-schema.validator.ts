import type { QuizPayload, QuizQuestion } from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";

function toInvalidPayloadError(message: string): ApiRouteError {
  return new ApiRouteError(502, "INVALID_QUIZ_PAYLOAD", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw toInvalidPayloadError(`\`${field}\` must be a non-empty string.`);
  }

  return value;
}

function normalizeNullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw toInvalidPayloadError(`\`${field}\` must be a string or null.`);
  }

  return value;
}

function normalizeTags(value: unknown, field: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw toInvalidPayloadError(`\`${field}\` must be an array of strings.`);
  }

  return value.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

function parseQuestion(value: unknown, index: number): QuizQuestion {
  if (!isRecord(value)) {
    throw toInvalidPayloadError(`Question ${index + 1} must be an object.`);
  }

  const id = requireString(value.id, `questions[${index}].id`);
  const prompt = requireString(value.prompt, `questions[${index}].prompt`);
  const snippet = normalizeNullableString(value.snippet, `questions[${index}].snippet`);

  if (!Array.isArray(value.options) || value.options.length !== 4) {
    throw toInvalidPayloadError(`questions[${index}].options must contain exactly 4 options.`);
  }

  const options = value.options.map((option, optionIndex) =>
    requireString(option, `questions[${index}].options[${optionIndex}]`),
  ) as [string, string, string, string];

  if (!Number.isInteger(value.correctOptionIndex)) {
    throw toInvalidPayloadError(`questions[${index}].correctOptionIndex must be an integer.`);
  }

  const correctOptionIndex = Number(value.correctOptionIndex);

  if (correctOptionIndex < 0 || correctOptionIndex > 3) {
    throw toInvalidPayloadError(
      `questions[${index}].correctOptionIndex must be between 0 and 3.`,
    );
  }

  const explanation = normalizeNullableString(
    value.explanation,
    `questions[${index}].explanation`,
  );
  const tags = normalizeTags(value.tags, `questions[${index}].tags`);

  return {
    id,
    prompt,
    snippet,
    options,
    correctOptionIndex,
    explanation,
    tags,
  };
}

export function validateQuizPayload(payload: unknown): QuizPayload {
  if (!isRecord(payload)) {
    throw toInvalidPayloadError("Generated quiz payload must be an object.");
  }

  const title = requireString(payload.title, "title");
  const generatedAt = requireString(payload.generatedAt, "generatedAt");

  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw toInvalidPayloadError("`questions` must be a non-empty array.");
  }

  const questions = payload.questions.map((question, index) => parseQuestion(question, index));

  return {
    title,
    generatedAt,
    questions,
  };
}
