type BackendLogLevel = "debug" | "info" | "warn" | "error";
type BackendLogScope = "app" | "http" | "git" | "quiz" | "provider";

const DEFAULT_LEVEL: BackendLogLevel = "info";
const VALID_LEVELS: BackendLogLevel[] = ["debug", "info", "warn", "error"];
const LEVEL_RANK: Record<BackendLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SCOPE_ENV_KEY: Record<BackendLogScope, string> = {
  app: "DIFFX_LOG_APP",
  http: "DIFFX_LOG_HTTP",
  git: "DIFFX_LOG_GIT",
  quiz: "DIFFX_LOG_QUIZ",
  provider: "DIFFX_LOG_PROVIDER",
};

const SCOPE_DEFAULT_ENABLED: Record<BackendLogScope, boolean> = {
  app: false,
  http: true,
  git: false,
  quiz: false,
  provider: false,
};

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export function parseBooleanEnvFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (typeof rawValue !== "string") {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export function parseBackendLogLevel(rawValue: string | undefined): BackendLogLevel {
  if (typeof rawValue !== "string") {
    return DEFAULT_LEVEL;
  }

  const normalized = rawValue.trim().toLowerCase();
  return VALID_LEVELS.includes(normalized as BackendLogLevel)
    ? (normalized as BackendLogLevel)
    : DEFAULT_LEVEL;
}

function shouldEmitLogs(): boolean {
  const forceLogging = parseBooleanEnvFlag(process.env.DIFFX_LOG_FORCE, false);
  if (forceLogging) {
    return true;
  }

  return !isTestRuntime();
}

function getActiveLogLevel(): BackendLogLevel {
  return parseBackendLogLevel(process.env.DIFFX_LOG_LEVEL);
}

function shouldEmitLevel(level: BackendLogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[getActiveLogLevel()];
}

export function isBackendLogScopeEnabled(scope: BackendLogScope): boolean {
  if (!shouldEmitLogs()) {
    return false;
  }

  const envKey = SCOPE_ENV_KEY[scope];
  return parseBooleanEnvFlag(process.env[envKey], SCOPE_DEFAULT_ENABLED[scope]);
}

function sanitizeMetadata(
  value: unknown,
  depth = 0,
  seen?: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    const maxLength = 200;
    return value.length > maxLength
      ? `${value.slice(0, maxLength)}... (truncated, len=${value.length})`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (depth >= 3) {
    return "[max-depth]";
  }

  if (Array.isArray(value)) {
    const maxItems = 25;
    const trimmed = value.slice(0, maxItems).map((item) =>
      sanitizeMetadata(item, depth + 1, seen),
    );

    if (value.length > maxItems) {
      trimmed.push(`[+${value.length - maxItems} more]`);
    }

    return trimmed;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const tracker = seen ?? new WeakSet<object>();

    if (tracker.has(record)) {
      return "[circular]";
    }

    tracker.add(record);

    const maxKeys = 25;
    const entries = Object.entries(record);
    const output: Record<string, unknown> = {};

    for (const [key, entryValue] of entries.slice(0, maxKeys)) {
      output[key] = sanitizeMetadata(entryValue, depth + 1, tracker);
    }

    if (entries.length > maxKeys) {
      output.__truncatedKeys = entries.length - maxKeys;
    }

    return output;
  }

  return String(value);
}

function stringifyMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "";
  }

  try {
    return JSON.stringify(sanitizeMetadata(metadata));
  } catch {
    return "[unserializable-metadata]";
  }
}

export function logBackendEvent(
  scope: BackendLogScope,
  level: BackendLogLevel,
  message: string,
  metadata?: Record<string, unknown>,
) {
  if (!isBackendLogScopeEnabled(scope) || !shouldEmitLevel(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${scope}]`;
  const metadataChunk = stringifyMetadata(metadata);
  const line = metadataChunk.length > 0 ? `${prefix} ${message} ${metadataChunk}` : `${prefix} ${message}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function getBackendLoggingConfigSnapshot(): Record<string, unknown> {
  return {
    level: getActiveLogLevel(),
    scopes: {
      app: isBackendLogScopeEnabled("app"),
      http: isBackendLogScopeEnabled("http"),
      git: isBackendLogScopeEnabled("git"),
      quiz: isBackendLogScopeEnabled("quiz"),
      provider: isBackendLogScopeEnabled("provider"),
    },
  };
}

export type { BackendLogLevel, BackendLogScope };
