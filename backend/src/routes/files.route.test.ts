import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /api/files", () => {
  it("returns changed files with per-file content hashes and stats", async () => {
    const app = createApp();

    const response = await request(app).get("/api/files");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    for (const file of response.body as Array<Record<string, unknown>>) {
      expect(typeof file.path).toBe("string");
      expect(typeof file.status).toBe("string");
      expect(typeof file.contentHash).toBe("string");
      expect((file.contentHash as string).length).toBeGreaterThan(0);

      if (file.stats === null) {
        expect(file.stats).toBeNull();
      } else {
        const stats = file.stats as Record<string, unknown>;
        expect(["number", "object"]).toContain(typeof stats.additions);
        expect(["number", "object"]).toContain(typeof stats.deletions);
      }
    }
  });
});
