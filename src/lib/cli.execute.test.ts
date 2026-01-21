import { beforeEach, describe, expect, it, vi } from "vitest";

const getGitRepoRoot = vi.fn();
const listWorktrees = vi.fn();
const getProjectConfig = vi.fn();
const saveProjectConfig = vi.fn();
const launchClaudeCode = vi.fn();

vi.mock("./git", () => ({
	getGitRepoRoot,
	listWorktrees,
	generateWorktreePath: vi.fn(),
	createDetachedWorktree: vi.fn(),
}));

vi.mock("./projectStore", () => ({
	getProjectConfig,
	saveProjectConfig,
}));

vi.mock("./launcher", () => ({
	formatModelInfo: vi.fn(),
	launchClaudeCode,
}));

vi.mock("./store", () => ({
	getStorePath: () => "/tmp/store",
	getDefaultModel: vi.fn(),
	getModel: vi.fn(),
	getModelList: vi.fn(),
	saveModel: vi.fn(),
}));

vi.mock("./scriptExecution", () => ({
	resolveScriptExecution: vi.fn(() => ({
		kind: "command",
		command: "echo ok",
		raw: "echo ok",
	})),
}));

vi.mock("../utils/terminalLauncher", () => ({
	launchExternalTerminal: vi.fn(() => Promise.resolve(true)),
}));

import { executeCommand } from "./cli";

describe("executeCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("handles worktree-list command", async () => {
		getGitRepoRoot.mockResolvedValue("/repo");
		listWorktrees.mockResolvedValue({ ok: true, worktrees: [] });

		const result = await executeCommand({ type: "worktree-list" });
		expect(result).toBe(0);
		expect(getGitRepoRoot).toHaveBeenCalled();
		expect(listWorktrees).toHaveBeenCalled();
	});

	it("handles project-config-show command", async () => {
		getGitRepoRoot.mockResolvedValue("/repo");
		getProjectConfig.mockReturnValue({
			ok: true,
			data: { postWorktreeScript: "./setup.sh" },
		});

		const result = await executeCommand({ type: "project-config-show" });
		expect(result).toBe(0);
	});

	it("handles project-config-set command", async () => {
		getGitRepoRoot.mockResolvedValue("/repo");
		getProjectConfig.mockReturnValue({ ok: true, data: {} });
		saveProjectConfig.mockReturnValue({ ok: true, data: undefined });

		const result = await executeCommand({
			type: "project-config-set",
			scriptPath: "./setup.sh",
			spawnInTerminal: true,
			terminalApp: "Warp",
		});
		expect(result).toBe(0);
		expect(saveProjectConfig).toHaveBeenCalledWith("/repo", {
			postWorktreeScript: "./setup.sh",
			spawnInTerminal: true,
			terminalApp: "Warp",
		});
	});

	it("returns error for run-script when no script configured", async () => {
		getGitRepoRoot.mockResolvedValue("/repo");
		getProjectConfig.mockReturnValue({ ok: true, data: null });

		const result = await executeCommand({ type: "run-script" });
		expect(result).toBe(1);
	});
});
