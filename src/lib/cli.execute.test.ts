import { beforeEach, describe, expect, it, vi } from "vitest";

const hasViMock = typeof vi?.mock === "function";
const runDescribe = hasViMock ? describe : describe.skip;

const getGitRepoRoot = vi.fn();
const listWorktrees = vi.fn();
const getProjectConfig = vi.fn();
const saveProjectConfig = vi.fn();
const launchClaudeCode = vi.fn();
const launchClaudeCodeBackground = vi.fn();
const getModel = vi.fn();

if (hasViMock) {
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
		launchClaudeCodeBackground,
	}));

	vi.mock("./store", () => ({
		getStorePath: () => "/tmp/store",
		getDefaultModel: vi.fn(),
		getModel,
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
}

import { executeCommand } from "./cli";

runDescribe("executeCommand", () => {
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

	it("handles multi-launch command", async () => {
		getModel.mockImplementation((name: string) => ({
			ok: true,
			data: {
				name,
				description: "",
				value: {
					ANTHROPIC_BASE_URL: "https://api.example.com",
					ANTHROPIC_AUTH_TOKEN: "token",
					ANTHROPIC_MODEL: "claude",
					ANTHROPIC_SMALL_FAST_MODEL: "claude-fast",
					ANTHROPIC_DEFAULT_SONNET_MODEL: "",
					ANTHROPIC_DEFAULT_OPUS_MODEL: "",
					ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
				},
			},
		}));
		launchClaudeCodeBackground.mockResolvedValue({ ok: true, exitCode: 0 });

		const result = await executeCommand({
			type: "multi-launch",
			modelNames: ["one", "two"],
			prompt: "Compare",
			permissionMode: "plan",
		});

		expect(result).toBe(0);
		expect(launchClaudeCodeBackground).toHaveBeenCalledTimes(2);
	});
});
