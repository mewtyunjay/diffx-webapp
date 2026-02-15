import { spawn } from "node:child_process";
import { ApiRouteError } from "../../domain/api-route-error.js";

export type GitExecResult = {
  stdout: string;
  stderr: string;
  stdoutBuffer: Buffer;
  stderrBuffer: Buffer;
  exitCode: number;
};

export type GitExecOptions = {
  cwd?: string;
  allowExitCodes?: number[];
};

export class GitCommandError extends Error {
  readonly args: string[];
  readonly cwd: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    args: string[],
    cwd: string,
    exitCode: number,
    stdout: string,
    stderr: string,
  ) {
    super(`git ${args.join(" ")} failed with exit code ${exitCode}`);
    this.name = "GitCommandError";
    this.args = args;
    this.cwd = cwd;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export async function execGit(
  args: string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> {
  const allowExitCodes = options.allowExitCodes ?? [0];
  const cwd = options.cwd ?? process.cwd();

  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      reject(
        new GitCommandError(
          args,
          cwd,
          -1,
          "",
          error instanceof Error ? error.message : String(error),
        ),
      );
    });

    child.on("close", (code) => {
      const exitCode = code ?? -1;
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const stdout = stdoutBuffer.toString("utf8");
      const stderr = stderrBuffer.toString("utf8");

      if (!allowExitCodes.includes(exitCode)) {
        reject(new GitCommandError(args, cwd, exitCode, stdout, stderr));
        return;
      }

      resolve({ stdout, stderr, stdoutBuffer, stderrBuffer, exitCode });
    });
  });
}

function gitErrorDetails(error: GitCommandError): Record<string, string | number | null> {
  return {
    command: `git ${error.args.join(" ")}`,
    cwd: error.cwd,
    exitCode: error.exitCode,
    stderr: error.stderr.trim() || null,
  };
}

export function toGitApiError(error: unknown, message: string, status = 500): ApiRouteError {
  if (error instanceof ApiRouteError) return error;

  if (error instanceof GitCommandError) {
    return new ApiRouteError(status, "GIT_COMMAND_FAILED", message, gitErrorDetails(error));
  }

  return new ApiRouteError(500, "INTERNAL_ERROR", message);
}
