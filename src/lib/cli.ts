import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatModelInfo, launchClaudeCode } from "./launcher";
import {
	getDefaultModel,
	getModel,
	getModelList,
	getStorePath,
	type Model,
	saveModel,
} from "./store";
import {
	getGitRepoRoot,
	listWorktrees,
	generateWorktreePath,
	createDetachedWorktree,
} from "./git";
import { getProjectConfig, saveProjectConfig } from "./projectStore";
import { launchExternalTerminal } from "../utils/terminalLauncher";
import fs from "node:fs";

export type CliCommand =
	| { type: "tui" }
	| { type: "help" }
	| { type: "version" }
	| { type: "list" }
	| { type: "launch"; modelName: string }
	| { type: "launch-default" }
	| { type: "add"; model: Partial<Model> }
	| { type: "worktree"; modelName?: string }
	| { type: "worktree-list" }
	| { type: "project-config-show" }
	| {
			type: "project-config-set";
			scriptPath?: string;
			spawnInTerminal?: boolean;
			terminalApp?: string;
	  }
	| { type: "run-script" }
	| { type: "error"; message: string };

/**
 * Determine the package version for this application.
 *
 * Reads the package.json version for the running package and falls back to "0.0.0" if the file is missing, malformed, or cannot be read.
 *
 * @returns The package version string from package.json, or `"0.0.0"` if unavailable.
 */
function getPackageVersion(): string {
	try {
		const entryPath = process.argv[1];
		const packagePath = entryPath
			? path.resolve(path.dirname(entryPath), "..", "package.json")
			: fileURLToPath(new URL("../../package.json", import.meta.url));
		const raw = readFileSync(packagePath, "utf8");
		const parsed = JSON.parse(raw) as { version?: string };
		return parsed.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

const VERSION = getPackageVersion();
const NUMERIC_VALUE_RE = /^-?\d+(\.\d+)?$/;

const HELP_TEXT = `
CCLauncher - Launch Claude Code with custom model configurations

USAGE:
  claude-launch [OPTIONS] [COMMAND]

COMMANDS:
  (no command)        Launch the TUI for interactive model selection
  --model <name>      Launch Claude Code with the specified model
  --list               List all configured models
  --add                Add a new model (use with other flags)
  --worktree, -w       Create a new worktree and launch Claude Code in it
  --worktree-list      List all active worktrees
  --project-config     Manage project settings
  --run-script         Run the configured setup script in the current directory
  --help               Show this help message
  --version            Show version information

OPTIONS FOR --project-config:
  --show               Show current project configuration
  --set-script <path>  Set the post-worktree setup script
  --spawn-in-terminal <true|false> Run script in a separate terminal
  --terminal-app <path|name> Specific terminal app to use

OPTIONS FOR --add:
  --name <name>       Model name (required)
  --endpoint <url>    API endpoint URL
  --token <token>     Auth token (use env:VAR_NAME for environment reference)
  --model-id <id>     Model identifier (e.g., "claude-opus-4-5-20251101")
  --fast-model <id>   Fast model identifier
  --description <text> Model description

EXAMPLES:
  claude-launch                           # Open TUI
  claude-launch --model minimax           # Launch with "minimax" model
  claude-launch --list                    # List all models
  claude-launch --add --name mymodel \\
    --endpoint https://api.example.com \\
    --token env:MY_API_TOKEN \\
    --model-id claude-opus-4-5-20251101

CONFIG:
  Models are stored at: ${getStorePath()}

For more information, visit: https://github.com/Connorbelez/cclauncher
`.trim();

/**
 * Parse an argv-style list of strings into a CliCommand describing the requested CLI action.
 *
 * Recognizes long flags (e.g., `--help`, `--version`, `--list`, `--add`, `--name`, `--description`,
 * `--endpoint`, `--token`, `--model-id`, `--fast-model`, `--model`) and short flags `-h`, `-v`, `-l`.
 * If `--add` is present, a `--name` value is required and a Partial<Model> is constructed from
 * the provided name, description and ANTHROPIC_* flag values. If `--model <name>` is provided or
 * a positional argument is present, the command will be a launch request for that model name.
 * When no actionable flags or positional args are provided, the TUI command is returned.
 *
 * @param args - Command-line arguments (excluding node/script) to parse
 * @returns The parsed CliCommand: `tui` for interactive launch, `help`, `version`, `list`,
 *          `add` with a Partial<Model>` when adding a model, `launch` with a modelName when
 *          launching a specific model, or `error` with a message for malformed flag usage.
 */
function handleLongFlag(
	arg: string,
	nextArg: string | undefined,
	flags: Map<string, string>
): number {
	const key = arg.slice(2);
	if (
		[
			"help",
			"list",
			"version",
			"add",
			"worktree",
			"worktree-list",
			"project-config",
			"show",
			"run-script",
		].includes(key)
	) {
		flags.set(key, "true");
		return 0;
	}

	// A value is legitimate if it doesn't start with a dash,
	// or if it's a negative number (e.g., -1.5).
	const isValue =
		nextArg && (!nextArg.startsWith("-") || NUMERIC_VALUE_RE.test(nextArg));
	if (isValue) {
		flags.set(key, nextArg);
		return 1;
	}

	flags.set(key, "true");
	return 0;
}

function handleShortFlag(arg: string, flags: Map<string, string>): void {
	const key = arg.slice(1);
	if (key === "h") flags.set("help", "true");
	else if (key === "v") flags.set("version", "true");
	else if (key === "l") flags.set("list", "true");
	else if (key === "w") flags.set("worktree", "true");
}

function collectFlagsAndPositional(args: string[]): {
	flags: Map<string, string>;
	positional: string[];
} {
	const flags = new Map<string, string>();
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg.startsWith("--")) {
			i += handleLongFlag(arg, args[i + 1], flags);
		} else if (arg.startsWith("-")) {
			handleShortFlag(arg, flags);
		} else {
			positional.push(arg);
		}
	}
	return { flags, positional };
}

function constructCommand(
	flags: Map<string, string>,
	positional: string[]
): CliCommand {
	if (flags.has("help")) return { type: "help" };
	if (flags.has("version")) return { type: "version" };
	if (flags.has("list")) return { type: "list" };
	if (flags.has("worktree-list")) return { type: "worktree-list" };
	if (flags.has("run-script")) return { type: "run-script" };

	if (flags.has("project-config")) {
		if (
			flags.has("set-script") ||
			flags.has("spawn-in-terminal") ||
			flags.has("terminal-app")
		) {
			return {
				type: "project-config-set",
				scriptPath: flags.get("set-script"),
				spawnInTerminal: flags.has("spawn-in-terminal")
					? flags.get("spawn-in-terminal") === "true"
					: undefined,
				terminalApp: flags.get("terminal-app"),
			};
		}
		return { type: "project-config-show" };
	}

	if (flags.has("worktree")) {
		const modelName = flags.get("model") || positional[0];
		return {
			type: "worktree",
			modelName: modelName && modelName !== "true" ? modelName : undefined,
		};
	}

	if (flags.has("add")) {
		const name = flags.get("name");
		if (!name)
			return { type: "error", message: "--add requires --name <name>" };

		return {
			type: "add",
			model: {
				name,
				description: flags.get("description") || "",
				value: {
					ANTHROPIC_BASE_URL: flags.get("endpoint") || "",
					ANTHROPIC_AUTH_TOKEN: flags.get("token") || "",
					ANTHROPIC_MODEL: flags.get("model-id") || "",
					ANTHROPIC_SMALL_FAST_MODEL:
						flags.get("fast-model") || flags.get("model-id") || "",
					ANTHROPIC_DEFAULT_SONNET_MODEL: "",
					ANTHROPIC_DEFAULT_OPUS_MODEL: "",
					ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
				},
			},
		};
	}

	if (flags.has("model")) {
		const modelName = flags.get("model");
		if (!modelName || modelName === "true") {
			return { type: "error", message: "--model requires a model name" };
		}
		return { type: "launch", modelName };
	}

	const firstPositional = positional[0];
	if (firstPositional) {
		return { type: "launch", modelName: firstPositional };
	}

	return { type: "tui" };
}

export function parseArgs(args: string[]): CliCommand {
	if (args.length === 0) {
		return { type: "tui" };
	}

	const { flags, positional } = collectFlagsAndPositional(args);
	return constructCommand(flags, positional);
}

/**
 * Execute a parsed CLI command and perform the associated action.
 *
 * @param command - The parsed CLI command to execute
 * @returns An exit code: `-1` to indicate the caller should launch the TUI, `0` for success, `1` for a generic failure, or a model-launch-specific exit code returned by the launcher
 */
function handleListCommand(): number {
	const result = getModelList();
	if (!result.ok) {
		console.error(`Error: ${result.message}`);
		return 1;
	}

	if (result.data.length === 0) {
		console.log("No models configured.");
		console.log(`\nCreate models in: ${getStorePath()}`);
		console.log("Or use: claude-launch --add --name <name> ...");
		return 0;
	}

	console.log("Configured models:\n");
	for (const model of result.data) {
		const defaultMarker = model.isDefault ? " (default)" : "";
		console.log(`  ${model.name}${defaultMarker}`);
		console.log(`    Endpoint: ${model.value.ANTHROPIC_BASE_URL}`);
		console.log(`    Model: ${model.value.ANTHROPIC_MODEL}`);
		if (model.description) {
			console.log(`    Description: ${model.description}`);
		}
		console.log();
	}

	console.log(`Config location: ${getStorePath()}`);
	return 0;
}

async function handleListWorktreesCommand(): Promise<number> {
	const repoRoot = await getGitRepoRoot();
	if (!repoRoot) {
		console.error("Error: Not in a git repository.");
		return 1;
	}

	const result = await listWorktrees(repoRoot);
	if (!result.ok) {
		console.error(`Error: ${result.message}`);
		return 1;
	}

	if (result.worktrees.length === 0) {
		console.log("No active worktrees.");
		return 0;
	}

	console.log("Active worktrees:\n");
	for (const wt of result.worktrees) {
		const mainMarker = wt.isMain ? " (main)" : "";
		const detachedMarker = wt.isDetached ? " (detached)" : "";
		const branchInfo = wt.branch ? ` [${wt.branch}]` : "";
		console.log(
			`  ${wt.relativePath || "."}${mainMarker}${detachedMarker}${branchInfo}`
		);
		console.log(`    Path: ${wt.path}`);
		console.log(`    HEAD: ${wt.headShort}`);
		if (wt.diffStats) {
			console.log(
				`    Changes: +${wt.diffStats.additions} -${wt.diffStats.deletions}`
			);
		}
		console.log();
	}

	return 0;
}

async function runSetupScript(
	worktreePath: string,
	scriptPath: string,
	spawnInTerminal = false,
	terminalApp?: string
): Promise<boolean> {
	const absoluteScriptPath = path.resolve(worktreePath, scriptPath);
	if (!fs.existsSync(absoluteScriptPath)) {
		console.error(`Error: Setup script not found at ${absoluteScriptPath}`);
		return false;
	}

	console.log(`Running setup script: ${scriptPath}`);

	if (spawnInTerminal) {
		const success = await launchExternalTerminal(
			worktreePath,
			scriptPath,
			terminalApp
		);
		if (!success) {
			console.error("Error launching external terminal.");
			return false;
		}
		console.log("Waiting for external setup script to complete...");

		// Poll for marker file
		const markerFile = path.join(worktreePath, ".cclauncher_setup_done");
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (fs.existsSync(markerFile)) {
					clearInterval(interval);
					fs.unlinkSync(markerFile); // Clean up
					resolve(true);
				}
			}, 1000);
		});
	}

	try {
		const proc = Bun.spawn(["bash", scriptPath], {
			cwd: worktreePath,
			stdout: "inherit",
			stderr: "inherit",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch (err) {
		console.error(
			`Error running setup script: ${err instanceof Error ? err.message : String(err)}`
		);
		return false;
	}
}

async function handleCreateWorktreeCommand(
	modelName?: string
): Promise<number> {
	const modelResult = modelName ? getModel(modelName) : getDefaultModel();
	if (!modelResult.ok) {
		console.error(`Error: ${modelResult.message}`);
		return 1;
	}

	const repoRoot = await getGitRepoRoot();
	if (!repoRoot) {
		console.error("Error: Not in a git repository.");
		return 1;
	}

	const worktreePath = generateWorktreePath(repoRoot);
	console.log(`Creating worktree at: ${worktreePath}`);

	const wtResult = await createDetachedWorktree(repoRoot, worktreePath);
	if (!wtResult.ok) {
		console.error(`Error: ${wtResult.message}`);
		return 1;
	}

	const configResult = getProjectConfig(repoRoot);
	const projectConfig = configResult.ok ? configResult.data : null;

	if (projectConfig?.postWorktreeScript) {
		const success = await runSetupScript(
			worktreePath,
			projectConfig.postWorktreeScript,
			projectConfig.spawnInTerminal,
			projectConfig.terminalApp || undefined
		);
		if (!success) {
			console.error("Setup script failed.");
			// Optionally we could still launch CC, but let's be safe
			return 1;
		}
	}

	console.log(
		`Launching Claude Code in worktree with model: ${modelResult.data.name}`
	);
	const launchResult = await launchClaudeCode(modelResult.data, {
		cwd: worktreePath,
	});
	if (!launchResult.ok) {
		console.error(`\nError: ${launchResult.message}`);
		return 1;
	}

	return launchResult.exitCode;
}

function handleShowProjectConfig(): number {
	const repoRoot = process.cwd(); // Assume current dir for project config
	const result = getProjectConfig(repoRoot);

	if (!result.ok) {
		console.error(`Error reading project config: ${result.message}`);
		return 1;
	}

	const config = result.data;
	console.log(`Project Configuration for ${repoRoot}:`);
	console.log(`  Setup Script: ${config?.postWorktreeScript || "(none)"}`);
	console.log(`  Spawn in Terminal: ${config?.spawnInTerminal ?? false}`);
	console.log(`  Terminal App: ${config?.terminalApp || "Auto-detect"}`);
	return 0;
}

function handleSetProjectConfig(
	scriptPath?: string,
	spawnInTerminal?: boolean,
	terminalApp?: string
): number {
	const repoRoot = process.cwd();
	const result = getProjectConfig(repoRoot);

	if (!result.ok) {
		console.error(`Error reading project config: ${result.message}`);
		return 1;
	}

	const config = result.data || {};
	if (scriptPath !== undefined) config.postWorktreeScript = scriptPath;
	if (spawnInTerminal !== undefined) config.spawnInTerminal = spawnInTerminal;
	if (terminalApp !== undefined) config.terminalApp = terminalApp;

	const saveResult = saveProjectConfig(repoRoot, config);

	if (saveResult.ok) {
		console.log("Successfully updated project configuration.");
		return 0;
	}
	console.error(`Failed to save project config: ${saveResult.message}`);
	return 1;
}

async function handleRunScript(): Promise<number> {
	const repoRoot = process.cwd();
	const result = getProjectConfig(repoRoot);

	if (!result.ok) {
		console.error(`Error reading project config: ${result.message}`);
		return 1;
	}

	const config = result.data;
	if (!config?.postWorktreeScript) {
		console.error("Error: No setup script configured for this project.");
		return 1;
	}

	const success = await runSetupScript(
		repoRoot,
		config.postWorktreeScript,
		config.spawnInTerminal,
		config.terminalApp || undefined
	);
	return success ? 0 : 1;
}

async function handleLaunchCommand(modelName: string): Promise<number> {
	const result = getModel(modelName);
	if (!result.ok) {
		console.error(`Error: ${result.message}`);
		console.error(`\nUse 'claude-launch --list' to see available models.`);
		return 1;
	}

	console.log(`Launching Claude Code with model: ${result.data.name}`);
	console.log(`Endpoint: ${result.data.value.ANTHROPIC_BASE_URL}`);
	console.log();

	const launchResult = await launchClaudeCode(result.data);
	if (!launchResult.ok) {
		console.error(`\nError: ${launchResult.message}`);
		return 1;
	}

	return launchResult.exitCode;
}

async function handleLaunchDefaultCommand(): Promise<number> {
	const result = getDefaultModel();
	if (!result.ok) {
		console.error(`Error: ${result.message}`);
		console.error(`\nUse 'claude-launch --list' to see available models.`);
		return 1;
	}

	console.log(`Launching Claude Code with default model: ${result.data.name}`);
	console.log(`Endpoint: ${result.data.value.ANTHROPIC_BASE_URL}`);
	console.log();

	const launchResult = await launchClaudeCode(result.data);
	if (!launchResult.ok) {
		console.error(`\nError: ${launchResult.message}`);
		return 1;
	}

	return launchResult.exitCode;
}

function handleAddCommand(model: Partial<Model>): number {
	const fullModel = model as Model;
	const result = saveModel(fullModel);
	if (!result.ok) {
		console.error(`Error: ${result.message}`);
		return 1;
	}

	console.log(`Model "${fullModel.name}" created successfully.`);
	console.log("\nModel details:");
	console.log(formatModelInfo(fullModel));
	return 0;
}

export async function executeCommand(command: CliCommand): Promise<number> {
	switch (command.type) {
		case "tui":
			return -1;
		case "help":
			console.log(HELP_TEXT);
			return 0;
		case "version":
			console.log(`CCLauncher v${VERSION}`);
			return 0;
		case "list":
			return handleListCommand();
		case "launch":
			return await handleLaunchCommand(command.modelName);
		case "launch-default":
			return await handleLaunchDefaultCommand();
		case "add":
			return handleAddCommand(command.model);
		case "worktree":
			return await handleCreateWorktreeCommand(command.modelName);
		case "worktree-list":
			return await handleListWorktreesCommand();
		case "project-config-show":
			return handleShowProjectConfig();
		case "project-config-set":
			return handleSetProjectConfig(
				command.scriptPath,
				command.spawnInTerminal,
				command.terminalApp
			);
		case "run-script":
			return await handleRunScript();
		case "error":
			console.error(`Error: ${command.message}`);
			console.error(`\nUse 'claude-launch --help' for usage information.`);
			return 1;
		default:
			return 1;
	}
}

/**
 * Main CLI entry point.
 */
export async function runCli(args: string[]): Promise<number> {
	const command = parseArgs(args);
	const result = await executeCommand(command);
	return result;
}
