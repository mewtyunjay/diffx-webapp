import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealth } from "./health";

describe("getHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns typed health payload when API responds OK", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/health", undefined);
  });

  it("throws a descriptive error when API responds with failure status", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).rejects.toThrow("Request failed: 503");
  });
});
