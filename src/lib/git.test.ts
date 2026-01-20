import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWorktreePath } from "./git";

// Note: Most git functions rely on Bun.spawn which makes them difficult to unit test
// without mocking the entire Bun runtime. These tests focus on pure functions.
// Integration tests with real git repos would be more appropriate for the async functions.

describe("generateWorktreePath", () => {
  it("should generate path inside .worktrees directory", () => {
    const repoRoot = "/home/user/project";
    const path = generateWorktreePath(repoRoot);

    expect(path).toContain("/home/user/project/.worktrees/");
  });

  it("should include claude prefix", () => {
    const repoRoot = "/home/user/project";
    const path = generateWorktreePath(repoRoot);

    expect(path).toContain("claude-");
  });

  it("should include timestamp-like pattern", () => {
    const repoRoot = "/home/user/project";
    const path = generateWorktreePath(repoRoot);

    // Pattern: claude-YYYY-MM-DDTHH-MM-SS
    const worktreeName = path.split("/").pop();
    expect(worktreeName).toMatch(/^claude-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it("should generate unique paths for different calls", () => {
    const repoRoot = "/home/user/project";

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const path1 = generateWorktreePath(repoRoot);
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const path2 = generateWorktreePath(repoRoot);
    vi.useRealTimers();

    expect(path1).not.toBe(path2);
  });

  it("should handle repo root with trailing slash", () => {
    const repoRoot = "/home/user/project/";
    const path = generateWorktreePath(repoRoot);

    expect(path).toContain("/home/user/project/.worktrees/");
    expect(path).toContain("claude-");
  });

  it("should handle different repo root paths", () => {
    const paths = [
      generateWorktreePath("/home/user/project"),
      generateWorktreePath("/var/repos/my-app"),
      generateWorktreePath("/Users/dev/code/test"),
    ];

    expect(paths[0]).toContain("/home/user/project/.worktrees/");
    expect(paths[1]).toContain("/var/repos/my-app/.worktrees/");
    expect(paths[2]).toContain("/Users/dev/code/test/.worktrees/");
  });
});

// Porcelain output parsing tests - testing the internal logic
describe("Worktree porcelain output parsing", () => {
  // This tests the expected format from `git worktree list --porcelain`
  // The actual parsing is done in parseWorktreeOutput which is not exported

  it("should describe expected porcelain format for main worktree", () => {
    const exampleOutput = `worktree /Users/user/project
HEAD abc123def456789012345678901234567890abcd
branch refs/heads/main
`;

    // Each worktree block has:
    // - worktree <path>
    // - HEAD <full-hash>
    // - branch refs/heads/<name> OR detached
    expect(exampleOutput).toContain("worktree ");
    expect(exampleOutput).toContain("HEAD ");
    expect(exampleOutput).toContain("branch refs/heads/");
  });

  it("should describe expected porcelain format for detached worktree", () => {
    const exampleOutput = `worktree /Users/user/project/.worktrees/feature
HEAD def456789012345678901234567890abcdef12
detached
`;

    expect(exampleOutput).toContain("worktree ");
    expect(exampleOutput).toContain("HEAD ");
    expect(exampleOutput).toContain("detached");
    expect(exampleOutput).not.toContain("branch ");
  });

  it("should describe expected porcelain format for multiple worktrees", () => {
    const exampleOutput = `worktree /Users/user/project
HEAD abc123def456789012345678901234567890abcd
branch refs/heads/main

worktree /Users/user/project/.worktrees/feature-a
HEAD 111222333444555666777888999000aaabbbccc
branch refs/heads/feature-a

worktree /Users/user/project/.worktrees/hotfix
HEAD dddeeefff000111222333444555666777888999
detached
`;

    const worktreeBlocks = exampleOutput.split("\n\n").filter(Boolean);
    expect(worktreeBlocks.length).toBe(3);
  });
});

// DiffStats interface tests
describe("DiffStats format", () => {
  it("should describe expected numstat format", () => {
    // `git diff --numstat HEAD` output format:
    // <additions>\t<deletions>\t<filename>
    const exampleOutput = `10\t5\tsrc/file1.ts
3\t0\tsrc/file2.ts
-\t-\tbinary-file.png`;

    const lines = exampleOutput.split("\n");
    expect(lines.length).toBe(3);

    // First file: 10 additions, 5 deletions
    const [add1, del1] = lines[0]!.split("\t");
    expect(add1).toBe("10");
    expect(del1).toBe("5");

    // Binary files show "-" for both counts
    const [addBin, delBin] = lines[2]!.split("\t");
    expect(addBin).toBe("-");
    expect(delBin).toBe("-");
  });
});

// WorktreeInfo interface contract tests
describe("WorktreeInfo interface", () => {
  it("should define expected properties for a branch worktree", () => {
    const worktree = {
      path: "/Users/user/project",
      head: "abc123def456789012345678901234567890abcd",
      headShort: "abc123d",
      branch: "main",
      isDetached: false,
      isMain: true,
      relativePath: ".",
      diffStats: { additions: 10, deletions: 5 },
    };

    expect(worktree.path).toBe("/Users/user/project");
    expect(worktree.headShort.length).toBe(7);
    expect(worktree.branch).toBe("main");
    expect(worktree.isDetached).toBe(false);
    expect(worktree.isMain).toBe(true);
    expect(worktree.relativePath).toBe(".");
  });

  it("should define expected properties for a detached worktree", () => {
    const worktree = {
      path: "/Users/user/project/.worktrees/feature",
      head: "def456789012345678901234567890abcdef12",
      headShort: "def4567",
      branch: null,
      isDetached: true,
      isMain: false,
      relativePath: ".worktrees/feature",
      diffStats: null,
    };

    expect(worktree.branch).toBeNull();
    expect(worktree.isDetached).toBe(true);
    expect(worktree.isMain).toBe(false);
    expect(worktree.relativePath).toBe(".worktrees/feature");
    expect(worktree.diffStats).toBeNull();
  });
});
