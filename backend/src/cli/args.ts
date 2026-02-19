import path from "node:path";

export type DiffxCliOptions = {
  repoRoot: string;
  port: number;
  host: string;
  openBrowser: boolean;
};

export type DiffxCliParseResult =
  | {
      kind: "help";
      message: string;
    }
  | {
      kind: "run";
      options: DiffxCliOptions;
    };

export class DiffxCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffxCliArgsError";
  }
}

const DEFAULT_PORT = 3210;
const DEFAULT_HOST = "127.0.0.1";
const MIN_PORT = 1;
const MAX_PORT = 65535;

export function formatHelp(binaryName = "diffx"): string {
  return [
    "DiffX CLI",
    "",
    "Usage:",
    `  ${binaryName} [repoPath] [--port <number>] [--host <host>] [--no-open]`,
    "",
    "Examples:",
    `  ${binaryName}`,
    `  ${binaryName} ~/dev/my-repo`,
    `  ${binaryName} --port 4000 --host 0.0.0.0`,
    "",
    "Options:",
    "  -p, --port <number>   UI/API server port (default: 3210)",
    "      --host <host>     Host interface (default: 127.0.0.1)",
    "      --no-open         Do not auto-open browser",
    "  -h, --help            Show help",
  ].join("\n");
}

function parsePort(raw: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
    throw new DiffxCliArgsError(`Invalid port: ${raw}. Use an integer between ${MIN_PORT}-${MAX_PORT}.`);
  }

  return parsed;
}

function requireValue(flag: string, next: string | undefined): string {
  if (!next || next.startsWith("-")) {
    throw new DiffxCliArgsError(`Missing value for ${flag}.`);
  }

  return next;
}

export function parseDiffxCliArgs(argv: string[], cwd = process.cwd()): DiffxCliParseResult {
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let openBrowser = true;
  let repoPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;

    if (token === "-h" || token === "--help") {
      return {
        kind: "help",
        message: formatHelp(),
      };
    }

    if (token === "--no-open") {
      openBrowser = false;
      continue;
    }

    if (token === "-p" || token === "--port") {
      const value = requireValue(token, argv[index + 1]);
      port = parsePort(value);
      index += 1;
      continue;
    }

    if (token.startsWith("--port=")) {
      port = parsePort(token.slice("--port=".length));
      continue;
    }

    if (token === "--host") {
      host = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith("--host=")) {
      host = token.slice("--host=".length);
      if (!host.trim()) {
        throw new DiffxCliArgsError("Host value cannot be empty.");
      }

      continue;
    }

    if (token.startsWith("-")) {
      throw new DiffxCliArgsError(`Unknown flag: ${token}`);
    }

    if (repoPath !== null) {
      throw new DiffxCliArgsError("Only one repository path can be provided.");
    }

    repoPath = token;
  }

  return {
    kind: "run",
    options: {
      repoRoot: path.resolve(cwd, repoPath ?? "."),
      port,
      host,
      openBrowser,
    },
  };
}
