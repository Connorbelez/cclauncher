/**
 * Git utilities for detecting repos and managing worktrees.
 */

/**
 * Detect if the current directory is inside a git repository.
 * @returns The absolute path to the repo root, or null if not in a git repo.
 */
export async function getGitRepoRoot(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return null;
    }
    const output = await new Response(proc.stdout).text();
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Get the current git commit hash (short form).
 */
export async function getCurrentCommit(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return null;
    }
    const output = await new Response(proc.stdout).text();
    return output.trim();
  } catch {
    return null;
  }
}

export type WorktreeResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

/**
 * Create a detached worktree at the specified path.
 * @param repoRoot The root of the git repository
 * @param worktreePath The path where the worktree should be created
 * @returns Result with the worktree path or an error message
 */
export async function createDetachedWorktree(
  repoRoot: string,
  worktreePath: string
): Promise<WorktreeResult> {
  try {
    // Ensure the .worktrees directory exists
    const path = await import("path");
    const worktreesDir = path.dirname(worktreePath);
    
    const fs = await import("fs");
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    // Create the detached worktree
    const proc = Bun.spawn(
      ["git", "worktree", "add", "--detach", worktreePath],
      {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const exitCode = await proc.exited;
    
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        ok: false,
        message: `Failed to create worktree: ${stderr.trim()}`,
      };
    }

    return { ok: true, path: worktreePath };
  } catch (err) {
    return {
      ok: false,
      message: `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Generate a worktree path inside the repo's .worktrees directory.
 * @param repoRoot The root of the git repository
 * @returns The path for a new worktree with timestamp
 */
export function generateWorktreePath(repoRoot: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${repoRoot}/.worktrees/claude-${timestamp}`;
}
