import { afterEach, describe, expect, it } from "vitest";
import {
  parseBackendLogLevel,
  parseBooleanEnvFlag,
} from "./logger.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("parseBooleanEnvFlag", () => {
  it("parses true-ish and false-ish values", () => {
    expect(parseBooleanEnvFlag("1", false)).toBe(true);
    expect(parseBooleanEnvFlag("true", false)).toBe(true);
    expect(parseBooleanEnvFlag("YES", false)).toBe(true);

    expect(parseBooleanEnvFlag("0", true)).toBe(false);
    expect(parseBooleanEnvFlag("false", true)).toBe(false);
    expect(parseBooleanEnvFlag("off", true)).toBe(false);
  });

  it("falls back to default for unknown values", () => {
    expect(parseBooleanEnvFlag(undefined, true)).toBe(true);
    expect(parseBooleanEnvFlag(undefined, false)).toBe(false);
    expect(parseBooleanEnvFlag("maybe", true)).toBe(true);
    expect(parseBooleanEnvFlag("maybe", false)).toBe(false);
  });
});

describe("parseBackendLogLevel", () => {
  it("accepts supported levels", () => {
    expect(parseBackendLogLevel("debug")).toBe("debug");
    expect(parseBackendLogLevel("INFO")).toBe("info");
    expect(parseBackendLogLevel("warn")).toBe("warn");
    expect(parseBackendLogLevel("error")).toBe("error");
  });

  it("falls back to info for invalid values", () => {
    expect(parseBackendLogLevel(undefined)).toBe("info");
    expect(parseBackendLogLevel("trace")).toBe("info");
  });
});
