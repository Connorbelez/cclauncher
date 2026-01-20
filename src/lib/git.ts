/**
 * Git utilities for detecting repos and managing worktrees.
 */

/**
 * Statistics about uncommitted changes in a worktree.
 */
export interface DiffStats {
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
}

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

/**
 * Get diff statistics for uncommitted changes in a worktree.
 * @param worktreePath The absolute path to the worktree
 * @returns DiffStats or null if error/no changes
 */
export async function getWorktreeDiffStats(
  worktreePath: string
): Promise<DiffStats | null> {
  try {
    const proc = Bun.spawn(["git", "diff", "--numstat", "HEAD"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return null;
    }

    const output = await new Response(proc.stdout).text();
    const lines = output.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      return { additions: 0, deletions: 0 };
    }

    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      // Format: "added\tdeleted\tfilename"
      // Binary files show "-" for both counts
      const [added, deleted] = line.split("\t");
      if (added !== "-") additions += parseInt(added, 10) || 0;
      if (deleted !== "-") deletions += parseInt(deleted, 10) || 0;
    }

    return { additions, deletions };
  } catch {
    return null;
  }
}

export type WorktreeResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

/**
 * Creates a detached Git worktree at the given path under the specified repository root.
 *
 * @param repoRoot - The repository root directory used as the Git working directory.
 * @param worktreePath - The filesystem path where the new detached worktree will be created.
 * @returns `{ ok: true; path: string }` when the worktree was created, `{ ok: false; message: string }` on failure.
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

/**
 * Information about a git worktree.
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree */
  path: string;
  /** Full commit hash */
  head: string;
  /** Short commit hash (7 chars) */
  headShort: string;
  /** Branch name (without refs/heads/ prefix) or null if detached */
  branch: string | null;
  /** Whether HEAD is detached */
  isDetached: boolean;
  /** Whether this is the main worktree (first in list) */
  isMain: boolean;
  /** Path relative to repo root for display purposes */
  relativePath: string;
  /** Uncommitted change statistics (null if unavailable) */
  diffStats?: DiffStats | null;
}

export type ListWorktreesResult =
  | { ok: true; worktrees: WorktreeInfo[] }
  | { ok: false; message: string };

/**
 * Lists all Git worktrees for the given repository and includes uncommitted diff stats for each.
 *
 * @param repoRoot - Absolute path to the repository root to list worktrees from
 * @returns An object with `{ ok: true; worktrees }` where `worktrees` is an array of `WorktreeInfo` on success; otherwise `{ ok: false; message }` with an error message
 */
export async function listWorktrees(
  repoRoot: string
): Promise<ListWorktreesResult> {
  try {
    const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        ok: false,
        message: `Failed to list worktrees: ${stderr.trim()}`,
      };
    }

    const output = await new Response(proc.stdout).text();
    const worktrees = parseWorktreeOutput(output, repoRoot);

    // Fetch diff stats for all worktrees in parallel
    const statsPromises = worktrees.map((wt) => getWorktreeDiffStats(wt.path));
    const allStats = await Promise.all(statsPromises);

    // Attach stats to each worktree
    for (let i = 0; i < worktrees.length; i++) {
      worktrees[i].diffStats = allStats[i];
    }

    return { ok: true, worktrees };
  } catch (err) {
    return {
      ok: false,
      message: `Failed to list worktrees: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Parse the porcelain output of `git worktree list --porcelain`.
 *
 * Example output format:
 * ```
 * worktree /path/to/repo
 * HEAD abc123def456...
 * branch refs/heads/main
 *
 * worktree /path/to/repo/.worktrees/feature
 * HEAD def456...
 * detached
 * ```
 */
function parseWorktreeOutput(output: string, repoRoot: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  const lines = output.split("\n");

  let currentWorktree: Partial<WorktreeInfo> = {};
  let isFirstWorktree = true;

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      // Start of a new worktree block
      if (currentWorktree.path) {
        // Save the previous worktree
        worktrees.push(
          finalizeWorktree(currentWorktree, repoRoot, isFirstWorktree)
        );
        isFirstWorktree = false;
      }
      currentWorktree = {
        path: line.slice("worktree ".length),
        isDetached: false,
      };
    } else if (line.startsWith("HEAD ")) {
      currentWorktree.head = line.slice("HEAD ".length);
      currentWorktree.headShort = currentWorktree.head.slice(0, 7);
    } else if (line.startsWith("branch ")) {
      const fullBranch = line.slice("branch ".length);
      // Remove refs/heads/ prefix
      currentWorktree.branch = fullBranch.replace(/^refs\/heads\//, "");
      currentWorktree.isDetached = false;
    } else if (line === "detached") {
      currentWorktree.isDetached = true;
      currentWorktree.branch = null;
    }
  }

  // Don't forget the last worktree
  if (currentWorktree.path) {
    worktrees.push(
      finalizeWorktree(currentWorktree, repoRoot, isFirstWorktree)
    );
  }

  return worktrees;
}

/**
 * Finalize a worktree object with computed fields.
 */
function finalizeWorktree(
  partial: Partial<WorktreeInfo>,
  repoRoot: string,
  isMain: boolean
): WorktreeInfo {
  const path = partial.path || "";

  // Compute relative path
  let relativePath = path;
  if (path.startsWith(repoRoot)) {
    relativePath = path.slice(repoRoot.length);
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }
    if (relativePath === "") {
      relativePath = ".";
    }
  }

  return {
    path,
    head: partial.head || "",
    headShort: partial.headShort || "",
    branch: partial.branch ?? null,
    isDetached: partial.isDetached ?? false,
    isMain,
    relativePath,
  };
}