import { useCallback, useEffect, useState } from "react";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export type GitWorktree = {
    path: string;
    head: string | null;
    branch: string | null;
    isDetached: boolean;
    isMain: boolean;
};

export type GitWorktreeState =
    | {
          status: "loading";
          repoRoot: string | null;
          worktrees: GitWorktree[];
          error: string | null;
      }
    | {
          status: "ready";
          repoRoot: string | null;
          worktrees: GitWorktree[];
          error: string | null;
      }
    | {
          status: "no_repo" | "error";
          repoRoot: string | null;
          worktrees: GitWorktree[];
          error: string;
      };

const normalizeBranchName = (raw: string) => raw.replace("refs/heads/", "");

const parseWorktreeList = (output: string, repoRoot: string | null) => {
    const lines = output.split("\n");
    const worktrees: GitWorktree[] = [];
    let current: Partial<GitWorktree> | null = null;

    const pushCurrent = () => {
        if (!current?.path) return;
        const isMain = repoRoot ? current.path === repoRoot : false;
        worktrees.push({
            path: current.path,
            head: current.head ?? null,
            branch: current.branch ?? null,
            isDetached: current.isDetached ?? false,
            isMain,
        });
    };

    lines.forEach((line) => {
        if (!line.trim()) {
            pushCurrent();
            current = null;
            return;
        }

        if (line.startsWith("worktree ")) {
            pushCurrent();
            current = { path: line.replace("worktree ", ""), head: null, branch: null, isDetached: false };
            return;
        }

        if (!current) return;

        if (line.startsWith("HEAD ")) {
            current.head = line.replace("HEAD ", "").trim();
        }

        if (line.startsWith("branch ")) {
            current.branch = normalizeBranchName(line.replace("branch ", "").trim());
        }

        if (line.trim() === "detached") {
            current.isDetached = true;
        }
    });

    pushCurrent();
    return worktrees;
};

const getRepoRoot = async (cwd: string) => {
    const { stdout } = await execAsync("git rev-parse --show-toplevel", { cwd });
    return stdout.trim();
};

const getWorktrees = async (cwd: string, repoRoot: string) => {
    const { stdout } = await execAsync("git worktree list --porcelain", { cwd });
    return parseWorktreeList(stdout, repoRoot);
};

export const useGitWorktrees = () => {
    const [state, setState] = useState<GitWorktreeState>({
        status: "loading",
        repoRoot: null,
        worktrees: [],
        error: null,
    });

    const loadWorktrees = useCallback(async () => {
        setState((prev) => ({ ...prev, status: "loading", error: null }));
        try {
            const repoRoot = await getRepoRoot(process.cwd());
            const worktrees = await getWorktrees(process.cwd(), repoRoot);
            setState({ status: "ready", repoRoot, worktrees, error: null });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown git error";
            const status = message.includes("not a git repository") ? "no_repo" : "error";
            setState({ status, repoRoot: null, worktrees: [], error: message });
        }
    }, []);

    useEffect(() => {
        void loadWorktrees();
    }, [loadWorktrees]);

    return {
        state,
        refresh: loadWorktrees,
    };
};
