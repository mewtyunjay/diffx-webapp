import { ApiRouteError } from "../../domain/api-route-error.js";

const MAX_PARSE_DEPTH = 8;
const MAX_TEXT_PARTS = 2000;

const PREFERRED_TEXT_KEYS = [
  "finalResponse",
  "output_text",
  "text",
  "content",
  "message",
  "result",
  "response",
] as const;

function collectTextParts(
  value: unknown,
  sink: string[],
  depth: number,
  visited: Set<object>,
): void {
  if (sink.length >= MAX_TEXT_PARTS || depth > MAX_PARSE_DEPTH) {
    return;
  }

  if (typeof value === "string") {
    if (value.trim().length > 0) {
      sink.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, sink, depth + 1, visited);
      if (sink.length >= MAX_TEXT_PARTS) {
        return;
      }
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  const record = value as Record<string, unknown>;

  for (const key of PREFERRED_TEXT_KEYS) {
    if (key in record) {
      collectTextParts(record[key], sink, depth + 1, visited);
    }

    if (sink.length >= MAX_TEXT_PARTS) {
      return;
    }
  }

  for (const child of Object.values(record)) {
    collectTextParts(child, sink, depth + 1, visited);
    if (sink.length >= MAX_TEXT_PARTS) {
      return;
    }
  }
}

function normalizeResponseText(value: unknown): string | null {
  const parts: string[] = [];
  collectTextParts(value, parts, 0, new Set<object>());

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n");
}

function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf("{");

  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index]!;

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === "\\") {
          escaping = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    start = text.indexOf("{", start + 1);
  }

  return null;
}

export function parseQuizPayloadFromResponse(raw: unknown, providerName: string): unknown {
  const responseText = normalizeResponseText(raw);

  if (!responseText) {
    throw new ApiRouteError(
      502,
      "QUIZ_GENERATION_FAILED",
      `${providerName} returned an empty quiz response.`,
    );
  }

  const jsonObject = extractFirstJsonObject(responseText);

  if (!jsonObject) {
    throw new ApiRouteError(
      502,
      "INVALID_QUIZ_PAYLOAD",
      `${providerName} response did not contain a JSON quiz payload.`,
    );
  }

  try {
    return JSON.parse(jsonObject);
  } catch {
    throw new ApiRouteError(
      502,
      "INVALID_QUIZ_PAYLOAD",
      `${providerName} JSON payload could not be parsed.`,
    );
  }
}
