import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { WorkspaceState } from "@diffx/contracts";
import { ApiRouteError } from "../domain/api-route-error.js";

const execFileAsync = promisify(execFile);
const PICKER_CANCEL_TOKEN = "__DIFFX_PICK_CANCELLED__";

function resolveInitialWorkspaceRoot(): string {
  const configuredRoot = process.env.DIFFX_REPO_ROOT?.trim();
  return configuredRoot ? path.resolve(configuredRoot) : path.resolve(process.cwd());
}

const INITIAL_WORKSPACE_ROOT = resolveInitialWorkspaceRoot();
let workspaceRoot = INITIAL_WORKSPACE_ROOT;

function resolveWorkspaceRoot(rawPath: string): string {
  const trimmed = rawPath.trim();

  if (!trimmed) {
    throw new ApiRouteError(400, "INVALID_PATH", "Repository folder path cannot be empty.");
  }

  return path.resolve(trimmed);
}

async function assertDirectory(repoRoot: string): Promise<void> {
  let stats;

  try {
    stats = await stat(repoRoot);
  } catch {
    throw new ApiRouteError(400, "INVALID_PATH", `Folder does not exist: ${repoRoot}`);
  }

  if (!stats.isDirectory()) {
    throw new ApiRouteError(400, "INVALID_PATH", `Path is not a directory: ${repoRoot}`);
  }
}

export function getWorkspaceState(): WorkspaceState {
  return { repoRoot: workspaceRoot };
}

export async function setWorkspaceRoot(rawPath: string): Promise<WorkspaceState> {
  const repoRoot = resolveWorkspaceRoot(rawPath);
  await assertDirectory(repoRoot);
  workspaceRoot = repoRoot;

  return { repoRoot };
}

export async function initializeWorkspaceRoot(repoRoot: string): Promise<WorkspaceState> {
  const normalized = resolveWorkspaceRoot(repoRoot);
  await assertDirectory(normalized);
  workspaceRoot = normalized;

  return { repoRoot: normalized };
}

async function pickWorkspaceRootOnMac(): Promise<string> {
  const script = [
    "try",
    'set selectedFolder to POSIX path of (choose folder with prompt "Select a folder for DiffX")',
    "return selectedFolder",
    "on error number -128",
    `return "${PICKER_CANCEL_TOKEN}"`,
    "end try",
  ].join("\n");
  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  const pickedPath = stdout.trim();

  if (pickedPath.length === 0 || pickedPath === PICKER_CANCEL_TOKEN) {
    throw new ApiRouteError(409, "WORKSPACE_PICK_CANCELLED", "Folder selection was cancelled.");
  }

  return pickedPath;
}

export async function pickWorkspaceRoot(): Promise<WorkspaceState> {
  if (process.platform !== "darwin") {
    throw new ApiRouteError(
      501,
      "WORKSPACE_PICK_UNSUPPORTED",
      "Native folder picker is only supported on macOS.",
    );
  }

  let pickedPath: string;

  try {
    pickedPath = await pickWorkspaceRootOnMac();
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }

    throw new ApiRouteError(500, "INTERNAL_ERROR", "Unable to open native folder picker.");
  }

  return await setWorkspaceRoot(pickedPath);
}

export function resetWorkspaceRootForTests() {
  workspaceRoot = INITIAL_WORKSPACE_ROOT;
}
