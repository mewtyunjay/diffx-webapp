import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "../app.js";
import { initializeWorkspaceRoot } from "../services/workspace.service.js";
import { DiffxCliArgsError, parseDiffxCliArgs } from "./args.js";
import { openBrowser } from "./open-browser.js";

function resolvePackageRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function toLaunchUrl(host: string, port: number): string {
  const launchHost = host === "0.0.0.0" ? "localhost" : host;
  return `http://${launchHost}:${port}`;
}

async function assertDirectoryExists(targetPath: string, label: string): Promise<void> {
  try {
    const targetStat = await stat(targetPath);
    if (!targetStat.isDirectory()) {
      throw new Error();
    }
  } catch {
    throw new DiffxCliArgsError(`${label} does not exist or is not a directory: ${targetPath}`);
  }
}

async function assertFrontendBuildReady(frontendDistDir: string, indexHtmlPath: string): Promise<void> {
  try {
    await access(frontendDistDir);
    await access(indexHtmlPath);
  } catch {
    throw new Error(
      "Frontend build artifacts are missing. Run `bun run build:frontend` (or `bun run build`) before running diffx.",
    );
  }
}

async function listen(app: ReturnType<typeof createApp>, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host);
    server.once("error", reject);
    server.once("listening", resolve);
  });
}

export async function runDiffxCli(argv: string[]): Promise<void> {
  try {
    const parsed = parseDiffxCliArgs(argv);

    if (parsed.kind === "help") {
      console.log(parsed.message);
      return;
    }

    const { host, openBrowser: shouldOpenBrowser, port, repoRoot } = parsed.options;
    const packageRoot = resolvePackageRoot();
    const frontendDistDir = path.resolve(packageRoot, "frontend", "dist");
    const indexHtmlPath = path.resolve(frontendDistDir, "index.html");
    const launchUrl = toLaunchUrl(host, port);

    await assertDirectoryExists(repoRoot, "Repository path");
    await assertFrontendBuildReady(frontendDistDir, indexHtmlPath);

    await initializeWorkspaceRoot(repoRoot);

    const app = createApp();

    app.use(express.static(frontendDistDir, { index: false }));
    app.get(/^(?!\/api(?:\/|$)).*$/, (_req, res) => {
      res.sendFile(indexHtmlPath);
    });

    await listen(app, host, port);

    console.log(`[diffx] serving repo: ${repoRoot}`);
    console.log(`[diffx] UI + API ready at ${launchUrl}`);

    if (shouldOpenBrowser && !openBrowser(launchUrl)) {
      console.warn(`[diffx] unable to auto-open browser. Open ${launchUrl} manually.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start diffx.";
    console.error(`[diffx] ${message}`);
    process.exitCode = 1;
  }
}
