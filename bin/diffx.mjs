#!/usr/bin/env node

async function main() {
  try {
    const { runDiffxCli } = await import("../backend/dist/cli/run.js");
    await runDiffxCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup error.";
    console.error(
      "[diffx] executable is not built yet. Run `bun run build` (or both frontend/backend builds) and retry.",
    );
    console.error(`[diffx] ${message}`);
    process.exit(1);
  }
}

void main();
