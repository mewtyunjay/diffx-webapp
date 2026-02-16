import { createHash } from "node:crypto";
import { execGit, toGitApiError } from "./git-client.js";

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function readHeadOid(repoRoot: string): Promise<string> {
  try {
    const result = await execGit(["-C", repoRoot, "rev-parse", "--verify", "HEAD"], {
      allowExitCodes: [0, 128],
    });

    if (result.exitCode !== 0) {
      return "unborn";
    }

    return result.stdout.trim() || "unborn";
  } catch (error) {
    throw toGitApiError(error, "Unable to compute repository revision.");
  }
}

export async function getRemoteHash(repoRoot: string, branch: string | null): Promise<string> {
  const headOid = await readHeadOid(repoRoot);

  if (!branch) {
    return digest(`detached:${headOid}`);
  }

  try {
    const upstreamRefResult = await execGit(
      ["-C", repoRoot, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { allowExitCodes: [0, 128] },
    );

    if (upstreamRefResult.exitCode !== 0) {
      return digest(`no-upstream:${branch}:${headOid}`);
    }

    const upstreamRef = upstreamRefResult.stdout.trim();

    const [upstreamOidResult, aheadBehindResult] = await Promise.all([
      execGit(["-C", repoRoot, "rev-parse", "--verify", upstreamRef], {
        allowExitCodes: [0, 128],
      }),
      execGit(["-C", repoRoot, "rev-list", "--left-right", "--count", `${upstreamRef}...HEAD`], {
        allowExitCodes: [0, 128],
      }),
    ]);

    const upstreamOid =
      upstreamOidResult.exitCode === 0 ? upstreamOidResult.stdout.trim() || "missing" : "missing";
    const aheadBehind =
      aheadBehindResult.exitCode === 0 ? aheadBehindResult.stdout.trim() || "0\t0" : "0\t0";

    return digest(`${branch}:${headOid}:${upstreamRef}:${upstreamOid}:${aheadBehind}`);
  } catch (error) {
    throw toGitApiError(error, "Unable to compute remote hash.");
  }
}
