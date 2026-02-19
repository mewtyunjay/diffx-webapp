import { spawn } from "node:child_process";

function spawnDetached(command: string, args: string[]): boolean {
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function openBrowser(url: string): boolean {
  if (process.platform === "darwin") {
    return spawnDetached("open", [url]);
  }

  if (process.platform === "win32") {
    return spawnDetached("cmd", ["/c", "start", "", url]);
  }

  return spawnDetached("xdg-open", [url]);
}
