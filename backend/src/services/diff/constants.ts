function readPositiveNumberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

export const DEFAULT_CONTEXT_LINES = 3;
export const MAX_CONTEXT_LINES = 200;
export const MAX_PATCH_BYTES = readPositiveNumberFromEnv(
  "DIFFX_MAX_PATCH_BYTES",
  1024 * 1024,
);
export const MAX_FILE_BYTES = readPositiveNumberFromEnv(
  "DIFFX_MAX_FILE_BYTES",
  512 * 1024,
);
