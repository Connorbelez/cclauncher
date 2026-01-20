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

export type CliCommand =
	| { type: "tui" }
	| { type: "help" }
	| { type: "version" }
	| { type: "list" }
	| { type: "launch"; modelName: string }
	| { type: "launch-default" }
	| { type: "add"; model: Partial<Model> }
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
  --list              List all configured models
  --add               Add a new model (use with other flags)
  --help              Show this help message
  --version           Show version information

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
	if (["help", "list", "version", "add"].includes(key)) {
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
