import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { resetWorkspaceRootForTests } from "../services/workspace.service.js";
import * as workspaceService from "../services/workspace.service.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "diffx-workspace-"));
  tempDirs.push(dir);
  return dir;
}

describe("/api/workspace", () => {
  beforeEach(() => {
    resetWorkspaceRootForTests();
  });

  afterEach(async () => {
    resetWorkspaceRootForTests();
    vi.restoreAllMocks();

    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      }),
    );
  });

  it("returns current workspace root", async () => {
    const app = createApp();

    const response = await request(app).get("/api/workspace");

    expect(response.status).toBe(200);
    expect(typeof response.body.repoRoot).toBe("string");
    expect(response.body.repoRoot.length).toBeGreaterThan(0);
  });

  it("updates workspace root for valid directories", async () => {
    const app = createApp();
    const repoRoot = await createTempDir();

    const putResponse = await request(app).put("/api/workspace").send({ repoRoot });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body).toEqual({ repoRoot });

    const getResponse = await request(app).get("/api/workspace");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({ repoRoot });
  });

  it("rejects invalid workspace paths", async () => {
    const app = createApp();

    const response = await request(app).put("/api/workspace").send({
      repoRoot: "/tmp/does-not-exist-diffx-workspace",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "INVALID_PATH" });
  });

  it("returns workspace root from native picker endpoint", async () => {
    const app = createApp();
    const repoRoot = await createTempDir();
    const pickerSpy = vi
      .spyOn(workspaceService, "pickWorkspaceRoot")
      .mockResolvedValueOnce({ repoRoot });

    const response = await request(app).post("/api/workspace/pick");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ repoRoot });
    expect(pickerSpy).toHaveBeenCalledTimes(1);
  });
});
