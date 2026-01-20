import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getModel,
  getModelList,
  getDefaultModel,
  saveModel,
  getStorePath,
  type Model,
} from "./store";
import { launchClaudeCode, formatModelInfo } from "./launcher";

export type CliCommand =
  | { type: "tui" }
  | { type: "help" }
  | { type: "version" }
  | { type: "list" }
  | { type: "launch"; modelName: string }
  | { type: "launch-default" }
  | { type: "add"; model: Partial<Model> }
  | { type: "error"; message: string };

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

For more information, visit: https://github.com/connor/cclauncher
`.trim();

/**
 * Parse command-line arguments into a CLI command.
 */
export function parseArgs(args: string[]): CliCommand {
  if (args.length === 0) {
    return { type: "tui" };
  }

  const flags = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // Flags that don't take values
      if (["help", "list", "version", "add"].includes(key)) {
        flags.set(key, "true");
        continue;
      }

      // Flags that take values
      if (nextArg && !nextArg.startsWith("--")) {
        flags.set(key, nextArg);
        i++; // Skip next arg since we consumed it as value
      } else {
        flags.set(key, "true");
      }
    } else if (arg.startsWith("-")) {
      // Short flags
      const key = arg.slice(1);
      if (key === "h") flags.set("help", "true");
      else if (key === "v") flags.set("version", "true");
      else if (key === "l") flags.set("list", "true");
    } else {
      positional.push(arg);
    }
  }

  // Check for specific commands
  if (flags.has("help")) {
    return { type: "help" };
  }

  if (flags.has("version")) {
    return { type: "version" };
  }

  if (flags.has("list")) {
    return { type: "list" };
  }

  if (flags.has("add")) {
    const name = flags.get("name");
    if (!name) {
      return { type: "error", message: "--add requires --name <name>" };
    }

    const model: Partial<Model> = {
      name,
      description: flags.get("description") || "",
      value: {
        ANTHROPIC_BASE_URL: flags.get("endpoint") || "",
        ANTHROPIC_AUTH_TOKEN: flags.get("token") || "",
        ANTHROPIC_MODEL: flags.get("model-id") || "",
        ANTHROPIC_SMALL_FAST_MODEL: flags.get("fast-model") || flags.get("model-id") || "",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
      },
    };

    return { type: "add", model };
  }

  if (flags.has("model")) {
    const modelName = flags.get("model");
    if (!modelName || modelName === "true") {
      return { type: "error", message: "--model requires a model name" };
    }
    return { type: "launch", modelName };
  }

  // If we have positional args, treat first as model name
  if (positional.length > 0) {
    return { type: "launch", modelName: positional[0]! };
  }

  return { type: "tui" };
}

/**
 * Execute a CLI command. Returns exit code.
 */
export async function executeCommand(command: CliCommand): Promise<number> {
  switch (command.type) {
    case "tui":
      // Returning -1 signals to the caller to launch TUI
      return -1;

    case "help":
      console.log(HELP_TEXT);
      return 0;

    case "version":
      console.log(`CCLauncher v${VERSION}`);
      return 0;

    case "list": {
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

    case "launch": {
      const result = getModel(command.modelName);
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

    case "launch-default": {
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

    case "add": {
      const model = command.model as Model;
      const result = saveModel(model);
      if (!result.ok) {
        console.error(`Error: ${result.message}`);
        return 1;
      }

      console.log(`Model "${model.name}" created successfully.`);
      console.log(`\nModel details:`);
      console.log(formatModelInfo(model));
      return 0;
    }

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
  return executeCommand(command);
}
