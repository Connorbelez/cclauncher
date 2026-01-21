import fs from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";

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
	} catch (err) {
		logger.error("Failed to get git repo root", err);
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
	} catch (err) {
		logger.error("Failed to get current commit", err);
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
			const parts = line.split("\t");
			const added = parts[0] || "0";
			const deleted = parts[1] || "0";

			if (added !== "-") {
				additions += Number.parseInt(added, 10) || 0;
			}
			if (deleted !== "-") {
				deletions += Number.parseInt(deleted, 10) || 0;
			}
		}

		return { additions, deletions };
	} catch (err) {
		logger.error(`Failed to get worktree diff stats for ${worktreePath}`, err);
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
		const worktreesDir = path.dirname(worktreePath);

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
	const normalizedRoot = repoRoot.endsWith("/")
		? repoRoot.slice(0, -1)
		: repoRoot;
	return `${normalizedRoot}/.worktrees/claude-${timestamp}`;
}

/**
 * Generate a worktree path with a model name suffix for multi-instance launches.
 * Creates unique paths like: .worktrees/claude-{modelName}-{timestamp}
 *
 * @param repoRoot The root of the git repository
 * @param modelName The model name to include in the path (will be sanitized)
 * @returns The path for a new worktree with model name and timestamp
 */
export function generateWorktreePathWithSuffix(
	repoRoot: string,
	modelName: string
): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	// Sanitize model name: keep alphanumeric, dash, underscore only
	const safeName = modelName.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 30);
	const normalizedRoot = repoRoot.endsWith("/")
		? repoRoot.slice(0, -1)
		: repoRoot;
	return `${normalizedRoot}/.worktrees/claude-${safeName}-${timestamp}`;
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
	/** Whether this worktree can merge cleanly into the default branch */
	isMergeable?: boolean | null;
	/** The branch this worktree was based on (upstream tracking) */
	baseBranch?: string | null;
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
		const allWorktrees = parseWorktreeOutput(output, repoRoot);

		// Filter out worktrees that don't exist on disk (e.g. manually deleted folders)
		const worktrees = allWorktrees.filter((wt) => fs.existsSync(wt.path));

		// Fetch diff stats, mergeability, and base branch for all worktrees in parallel
		// First get default branch for mergeability checks
		const defaultBranch = await getDefaultBranch(repoRoot);

		const enrichedWorktreesPromises = worktrees.map(async (wt) => {
			const [diffStats, isMergeable, baseBranch] = await Promise.all([
				getWorktreeDiffStats(wt.path),
				// Check mergeability against default branch for all worktrees (except main itself)
				wt.isMain
					? Promise.resolve(true)
					: checkMergeability(wt.path, defaultBranch),
				// Get base branch
				wt.branch
					? getBaseBranch(wt.branch, repoRoot)
					: getDetachedOriginalBranch(wt.head, repoRoot),
			]);

			return {
				...wt,
				diffStats,
				isMergeable,
				baseBranch,
			};
		});

		const enrichedWorktrees = await Promise.all(enrichedWorktreesPromises);
		return { ok: true, worktrees: enrichedWorktrees };
	} catch (err) {
		return {
			ok: false,
			message: `Failed to list worktrees: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

const REFS_HEADS_REGEX = /^refs\/heads\//;
const REFS_REMOTES_REGEX = /^refs\/remotes\//;

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
			currentWorktree.branch = fullBranch.replace(REFS_HEADS_REGEX, "");
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

/**
 * Check if the worktree's HEAD can be merged into the target branch without conflicts.
 * Uses `git merge-tree` to perform a dry-run merge in memory.
 *
 * @param worktreePath - Path to the worktree
 * @param targetBranch - Branch to merge into (e.g., "main")
 * @returns true if mergeable (exit code 0), false if conflicts, null on error
 */
export async function checkMergeability(
	worktreePath: string,
	targetBranch: string
): Promise<boolean | null> {
	try {
		// git merge-tree <target-branch> <source-commit>
		// We run this from the worktree directory so HEAD resolves correctly
		const proc = Bun.spawn(["git", "merge-tree", targetBranch, "HEAD"], {
			cwd: worktreePath,
			stdout: "ignore", // We only care about exit code (0 = success/clean, 1 = conflict)
			stderr: "ignore",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return null;
	}
}

/**
 * Get the upstream/base branch for a given branch name.
 * e.g. if 'feature' tracks 'origin/main', returns 'main' (simplified).
 *
 * @param branchName - The local branch name
 * @param cwd - Repository root
 * @returns The base branch name or null
 */
export async function getBaseBranch(
	branchName: string,
	cwd: string
): Promise<string | null> {
	try {
		// git config --get branch.<name>.merge
		// returns refs/heads/main or similar
		const proc = Bun.spawn(
			["git", "config", "--get", `branch.${branchName}.merge`],
			{
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			}
		);
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return null;
		}
		const output = await new Response(proc.stdout).text();
		const ref = output.trim();
		// Strip refs/heads/ or refs/remotes/origin/
		return ref.replace(REFS_HEADS_REGEX, "").replace(REFS_REMOTES_REGEX, "");
	} catch {
		return null;
	}
}

/**
 * Get the default branch name (e.g. main or master).
 */
export async function getDefaultBranch(cwd: string): Promise<string> {
	try {
		// Try to get the remote HEAD
		const proc = Bun.spawn(
			["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
			{
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			}
		);
		const exitCode = await proc.exited;

		if (exitCode === 0) {
			const output = await new Response(proc.stdout).text();
			// Output is like "refs/remotes/origin/main"
			const parts = output.trim().split("/");
			return parts.at(-1) || "main";
		}

		// Fallback: check if main exists
		return "main";
	} catch {
		return "main";
	}
}

/**
 * Try to discover the original branch for a detached HEAD.
 * Returns the first branch containing this commit, or a symbolic reference.
 */
export async function getDetachedOriginalBranch(
	head: string,
	repoRoot: string
): Promise<string | null> {
	try {
		// 1. Try to find a branch that contains this commit
		const branchProc = Bun.spawn(
			["git", "branch", "--format=%(refname:short)", "--contains", head],
			{
				cwd: repoRoot,
				stdout: "pipe",
				stderr: "pipe",
			}
		);
		const branchExit = await branchProc.exited;
		if (branchExit === 0) {
			const output = await new Response(branchProc.stdout).text();
			const branches = output.trim().split("\n").filter(Boolean);
			if (branches.length > 0) {
				// Prefer 'main' or 'master' if available, otherwise first one
				const mainBranch = branches.find((b) => b === "main" || b === "master");
				return mainBranch || branches[0] || null;
			}
		}

		// 2. Fallback to name-rev
		const nameProc = Bun.spawn(
			["git", "name-rev", "--name-only", "--refs=refs/heads/*", head],
			{
				cwd: repoRoot,
				stdout: "pipe",
				stderr: "pipe",
			}
		);
		const nameExit = await nameProc.exited;
		if (nameExit === 0) {
			const name = await new Response(nameProc.stdout).text();
			const trimmed = name.trim();
			if (trimmed && trimmed !== "undefined") {
				return trimmed;
			}
		}

		return null;
	} catch (err) {
		logger.error(`Error in getDetachedOriginalBranch for ${head}`, err);
		return null;
	}
}

/**
 * Merge a worktree HEAD into the specified target branch in the main repo.
 */
export async function mergeWorktreeIntoDefault(
	repoRoot: string,
	sourceHead: string,
	targetBranch: string
): Promise<{ ok: true } | { ok: false; message: string }> {
	try {
		// 1. Check if the main repo is clean
		const statusProc = Bun.spawn(["git", "status", "--porcelain"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await statusProc.exited;
		const statusOutput = await new Response(statusProc.stdout).text();
		if (statusOutput.trim() !== "") {
			return {
				ok: false,
				message:
					"Main repository has uncommitted changes. Please commit or stash them first.",
			};
		}

		// 2. Ensure we are on the target branch in the main repo
		// (This is a limitation - we only merge into the current checkout if it matches targetBranch)
		const branchProc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await branchProc.exited;
		const currentBranch = (await new Response(branchProc.stdout).text()).trim();

		if (currentBranch !== targetBranch) {
			return {
				ok: false,
				message: `Main repo is on '${currentBranch}', but you are trying to merge into '${targetBranch}'. Please switch branches first.`,
			};
		}

		// 3. Perform the merge
		const mergeProc = Bun.spawn(["git", "merge", sourceHead], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await mergeProc.exited;

		if (exitCode !== 0) {
			const stderr = await new Response(mergeProc.stderr).text();
			return {
				ok: false,
				message: `Merge failed: ${stderr.trim()}`,
			};
		}

		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			message: `Unexpected error during merge: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
