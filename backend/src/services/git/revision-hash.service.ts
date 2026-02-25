import { createHash } from "node:crypto";
import { execGit, toGitApiError } from "./git-client.js";

type RemoteHashCacheEntry = {
  value: string;
  expiresAt: number;
};

const REMOTE_HASH_CACHE_TTL_MS = 5_000;
const remoteHashCache = new Map<string, RemoteHashCacheEntry>();
const inFlightRemoteHashRequests = new Map<string, Promise<string>>();

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
  const cacheKey = `${repoRoot}:${branch ?? "detached"}`;
  const cached = remoteHashCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = inFlightRemoteHashRequests.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const pendingRequest = (async () => {
    try {
      const headOid = await readHeadOid(repoRoot);

      if (!branch) {
        const value = digest(`detached:${headOid}`);
        remoteHashCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + REMOTE_HASH_CACHE_TTL_MS,
        });
        return value;
      }

      const upstreamRefResult = await execGit(
        ["-C", repoRoot, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        { allowExitCodes: [0, 128] },
      );

      if (upstreamRefResult.exitCode !== 0) {
        const value = digest(`no-upstream:${branch}:${headOid}`);
        remoteHashCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + REMOTE_HASH_CACHE_TTL_MS,
        });
        return value;
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
      const value = digest(`${branch}:${headOid}:${upstreamRef}:${upstreamOid}:${aheadBehind}`);

      remoteHashCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + REMOTE_HASH_CACHE_TTL_MS,
      });

      return value;
    } catch (error) {
      throw toGitApiError(error, "Unable to compute remote hash.");
    } finally {
      inFlightRemoteHashRequests.delete(cacheKey);
    }
  })();

  inFlightRemoteHashRequests.set(cacheKey, pendingRequest);
  return await pendingRequest;
}

export function invalidateRemoteHashCache(repoRoot?: string): void {
  if (!repoRoot) {
    remoteHashCache.clear();
    inFlightRemoteHashRequests.clear();
    return;
  }

  for (const cacheKey of remoteHashCache.keys()) {
    if (cacheKey.startsWith(`${repoRoot}:`)) {
      remoteHashCache.delete(cacheKey);
    }
  }

  for (const cacheKey of inFlightRemoteHashRequests.keys()) {
    if (cacheKey.startsWith(`${repoRoot}:`)) {
      inFlightRemoteHashRequests.delete(cacheKey);
    }
  }
}
