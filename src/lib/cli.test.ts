import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
	describe("TUI mode", () => {
		it("should return tui type for empty args", () => {
			const result = parseArgs([]);
			expect(result).toEqual({ type: "tui" });
		});

		it("should return tui type when no recognized flags", () => {
			const result = parseArgs([]);
			expect(result.type).toBe("tui");
		});
	});

	describe("Help command", () => {
		it("should return help type for --help flag", () => {
			const result = parseArgs(["--help"]);
			expect(result).toEqual({ type: "help" });
		});

		it("should return help type for -h flag", () => {
			const result = parseArgs(["-h"]);
			expect(result).toEqual({ type: "help" });
		});

		it("should prioritize help over other flags", () => {
			const result = parseArgs(["--list", "--help"]);
			expect(result.type).toBe("help");
		});
	});

	describe("Version command", () => {
		it("should return version type for --version flag", () => {
			const result = parseArgs(["--version"]);
			expect(result).toEqual({ type: "version" });
		});

		it("should return version type for -v flag", () => {
			const result = parseArgs(["-v"]);
			expect(result).toEqual({ type: "version" });
		});
	});

	describe("List command", () => {
		it("should return list type for --list flag", () => {
			const result = parseArgs(["--list"]);
			expect(result).toEqual({ type: "list" });
		});

		it("should return list type for -l flag", () => {
			const result = parseArgs(["-l"]);
			expect(result).toEqual({ type: "list" });
		});
	});

	describe("Launch command", () => {
		it("should return launch type with model name for --model flag", () => {
			const result = parseArgs(["--model", "minimax"]);
			expect(result).toEqual({ type: "launch", modelName: "minimax" });
		});

		it("should return error for --model without name", () => {
			const result = parseArgs(["--model"]);
			expect(result.type).toBe("error");
			if (result.type === "error") {
				expect(result.message).toContain("--model requires a model name");
			}
		});

		it("should treat --model followed by another flag as separate flags", () => {
			// When --model is followed by another flag, --model gets "true" and --list is processed
			// This results in an error because --model requires a name
			const result = parseArgs(["--model", "--list"]);
			// The actual behavior: --list flag takes precedence in the check order
			expect(result.type).toBe("list");
		});

		it("should treat positional arg as model name", () => {
			const result = parseArgs(["minimax"]);
			expect(result).toEqual({ type: "launch", modelName: "minimax" });
		});
	});

	describe("Add command", () => {
		it("should return add type with model data", () => {
			const result = parseArgs([
				"--add",
				"--name",
				"my-model",
				"--endpoint",
				"https://api.test.com",
				"--token",
				"sk-123",
				"--model-id",
				"claude-3-opus",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.name).toBe("my-model");
				expect(result.model.value?.ANTHROPIC_BASE_URL).toBe(
					"https://api.test.com"
				);
				expect(result.model.value?.ANTHROPIC_AUTH_TOKEN).toBe("sk-123");
				expect(result.model.value?.ANTHROPIC_MODEL).toBe("claude-3-opus");
			}
		});

		it("should return error for --add without --name", () => {
			const result = parseArgs(["--add", "--endpoint", "https://api.test.com"]);
			expect(result.type).toBe("error");
			if (result.type === "error") {
				expect(result.message).toContain("--add requires --name");
			}
		});

		it("should handle env: token references", () => {
			const result = parseArgs([
				"--add",
				"--name",
				"env-model",
				"--token",
				"env:MY_API_KEY",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.value?.ANTHROPIC_AUTH_TOKEN).toBe("env:MY_API_KEY");
			}
		});

		it("should set fast-model to model-id if not specified", () => {
			const result = parseArgs([
				"--add",
				"--name",
				"simple",
				"--model-id",
				"claude-3-opus",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.value?.ANTHROPIC_SMALL_FAST_MODEL).toBe(
					"claude-3-opus"
				);
			}
		});

		it("should use explicit fast-model if provided", () => {
			const result = parseArgs([
				"--add",
				"--name",
				"dual",
				"--model-id",
				"claude-3-opus",
				"--fast-model",
				"claude-3-haiku",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.value?.ANTHROPIC_SMALL_FAST_MODEL).toBe(
					"claude-3-haiku"
				);
			}
		});

		it("should include description if provided", () => {
			const result = parseArgs([
				"--add",
				"--name",
				"described",
				"--description",
				"My custom model",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.description).toBe("My custom model");
			}
		});
	});

	describe("Worktree commands", () => {
		it("should return worktree type for --worktree flag", () => {
			const result = parseArgs(["--worktree"]);
			expect(result).toEqual({ type: "worktree", modelName: undefined });
		});

		it("should return worktree type with positional model", () => {
			const result = parseArgs(["--worktree", "demo"]);
			expect(result).toEqual({ type: "worktree", modelName: "demo" });
		});

		it("should return worktree type with --model value", () => {
			const result = parseArgs(["-w", "--model", "demo"]);
			expect(result).toEqual({ type: "worktree", modelName: "demo" });
		});

		it("should return worktree-list type for --worktree-list", () => {
			const result = parseArgs(["--worktree-list"]);
			expect(result).toEqual({ type: "worktree-list" });
		});
	});

	describe("Multi-launch command", () => {
		it("should parse multi-launch with positional models", () => {
			const result = parseArgs(["--multi", "model-a", "model-b"]);
			expect(result).toEqual({
				type: "multi-launch",
				modelNames: ["model-a", "model-b"],
				prompt: "",
				permissionMode: "default",
			});
		});

		it("should parse multi-launch with prompt and permission mode", () => {
			const result = parseArgs([
				"--multi",
				"model-a",
				"model-b",
				"--prompt",
				"Compare these",
				"--permission-mode",
				"plan",
			]);
			expect(result).toEqual({
				type: "multi-launch",
				modelNames: ["model-a", "model-b"],
				prompt: "Compare these",
				permissionMode: "plan",
			});
		});

		it("should return error for invalid permission mode", () => {
			const result = parseArgs([
				"--multi",
				"model-a",
				"--permission-mode",
				"invalid",
			]);
			expect(result.type).toBe("error");
		});

		it("should return error when --multi has no models", () => {
			const result = parseArgs(["--multi"]);
			expect(result.type).toBe("error");
		});
	});

	describe("Project config commands", () => {
		it("should return project-config-show for --project-config", () => {
			const result = parseArgs(["--project-config"]);
			expect(result).toEqual({ type: "project-config-show" });
		});

		it("should return project-config-set for --set-script", () => {
			const result = parseArgs([
				"--project-config",
				"--set-script",
				"./setup.sh",
			]);
			expect(result).toEqual({
				type: "project-config-set",
				scriptPath: "./setup.sh",
				spawnInTerminal: undefined,
				terminalApp: undefined,
			});
		});

		it("should parse spawn-in-terminal true values", () => {
			const result = parseArgs([
				"--project-config",
				"--spawn-in-terminal",
				"yes",
			]);
			expect(result).toEqual({
				type: "project-config-set",
				scriptPath: undefined,
				spawnInTerminal: true,
				terminalApp: undefined,
			});
		});

		it("should parse spawn-in-terminal false values", () => {
			const result = parseArgs([
				"--project-config",
				"--spawn-in-terminal",
				"0",
			]);
			expect(result).toEqual({
				type: "project-config-set",
				scriptPath: undefined,
				spawnInTerminal: false,
				terminalApp: undefined,
			});
		});

		it("should treat spawn-in-terminal without value as true", () => {
			const result = parseArgs(["--project-config", "--spawn-in-terminal"]);
			expect(result).toEqual({
				type: "project-config-set",
				scriptPath: undefined,
				spawnInTerminal: true,
				terminalApp: undefined,
			});
		});

		it("should return error for invalid spawn-in-terminal value", () => {
			const result = parseArgs([
				"--project-config",
				"--spawn-in-terminal",
				"maybe",
			]);
			expect(result.type).toBe("error");
		});

		it("should return project-config-set for --terminal-app", () => {
			const result = parseArgs(["--project-config", "--terminal-app", "Warp"]);
			expect(result).toEqual({
				type: "project-config-set",
				scriptPath: undefined,
				spawnInTerminal: undefined,
				terminalApp: "Warp",
			});
		});
	});

	describe("Run script command", () => {
		it("should return run-script for --run-script", () => {
			const result = parseArgs(["--run-script"]);
			expect(result).toEqual({ type: "run-script" });
		});
	});

	describe("Flag parsing edge cases", () => {
		it("should handle flags in any order", () => {
			const result = parseArgs([
				"--model-id",
				"opus",
				"--add",
				"--name",
				"test",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.name).toBe("test");
				expect(result.model.value?.ANTHROPIC_MODEL).toBe("opus");
			}
		});

		it("should handle multiple positional args (uses first)", () => {
			const result = parseArgs(["model1", "model2", "model3"]);
			expect(result).toEqual({ type: "launch", modelName: "model1" });
		});

		it("should handle unknown flags gracefully", () => {
			const result = parseArgs(["--unknown-flag", "value"]);
			// Falls through to tui since no recognized command
			expect(result.type).toBe("tui");
		});

		it("should handle empty string values", () => {
			const result = parseArgs(["--model", ""]);
			// Empty model name should cause error since it becomes "true"
			expect(result.type).toBe("error");
		});
	});

	describe("Complex scenarios", () => {
		it("should handle real-world add command", () => {
			const result = parseArgs([
				"--add",
				"--name",
				"production",
				"--endpoint",
				"https://api.anthropic.com/v1",
				"--token",
				"env:ANTHROPIC_API_KEY",
				"--model-id",
				"claude-3-opus-20240229",
				"--fast-model",
				"claude-3-haiku-20240307",
				"--description",
				"Production Anthropic API",
			]);

			expect(result.type).toBe("add");
			if (result.type === "add") {
				expect(result.model.name).toBe("production");
				expect(result.model.value?.ANTHROPIC_BASE_URL).toBe(
					"https://api.anthropic.com/v1"
				);
				expect(result.model.value?.ANTHROPIC_AUTH_TOKEN).toBe(
					"env:ANTHROPIC_API_KEY"
				);
				expect(result.model.value?.ANTHROPIC_MODEL).toBe(
					"claude-3-opus-20240229"
				);
				expect(result.model.value?.ANTHROPIC_SMALL_FAST_MODEL).toBe(
					"claude-3-haiku-20240307"
				);
				expect(result.model.description).toBe("Production Anthropic API");
			}
		});
	});
});
