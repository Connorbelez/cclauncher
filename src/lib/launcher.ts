import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetTerminalForChild } from "../utils/terminal";
import { type Model, resolveEnvRef } from "./store";

// Lazy-load bun-pty; may fail on some platforms
let bunPtySpawn: typeof import("bun-pty").spawn | null = null;
try {
	const bunPty = await import("bun-pty");
	bunPtySpawn = bunPty.spawn;
} catch {
	// bun-pty not available; will use fallback
}

export type LaunchResult =
	| { ok: true; exitCode: number }
	| {
			ok: false;
			reason: "not_found" | "spawn_failed" | "signal";
			message: string;
	  };

export interface LaunchOptions {
	/** Working directory to launch Claude Code in */
	cwd?: string;
}

/** Permission mode for Claude Code session */
export type PermissionMode = "default" | "plan" | "autoAccept" | "acceptEdits";

/** Options for multi-model launch */
export interface MultiLaunchOptions {
	/** Initial prompt text to pass to Claude Code */
	initialPrompt: string;
	/** Permission mode for the Claude Code session */
	permissionMode: PermissionMode;
}

/** Extended launch options with CLI argument support */
export interface ExtendedLaunchOptions extends LaunchOptions {
	/** CLI arguments to pass to claude command */
	cliArgs?: string[];
	/** Terminal app to use for launching (path or name) */
	terminalApp?: string;
}

/**
 * Build CLI arguments array from multi-launch options.
 *
 * Maps permission modes to appropriate CLI flags:
 * - default: no flags
 * - plan: --permission-mode plan
 * - autoAccept: --dangerously-skip-permissions
 * - acceptEdits: --permission-mode acceptEdits
 *
 * @param options - Multi-launch options with prompt and permission mode
 * @returns Array of CLI arguments to pass to claude command
 */
export function buildCliArgs(options: MultiLaunchOptions): string[] {
	const args: string[] = [];

	// Permission mode flags
	switch (options.permissionMode) {
		case "plan":
			args.push("--permission-mode", "plan");
			break;
		case "autoAccept":
			args.push("--dangerously-skip-permissions");
			break;
		case "acceptEdits":
			args.push("--permission-mode", "acceptEdits");
			break;
		default:
			// No flags for default mode
			break;
	}

	// Initial prompt as positional argument (must come last)
	if (options.initialPrompt.trim()) {
		args.push(options.initialPrompt.trim());
	}

	return args;
}

/**
 * Sets up signal forwarding for a child process.
 * Forwards SIGWINCH, SIGTERM, and SIGHUP.
 *
 * @param forwardFn - Function to execute when a signal is received
 * @returns Cleanup function to remove listeners
 */
function setupSignalForwarding(
	forwardFn: (signal: NodeJS.Signals) => void
): () => void {
	const signals: NodeJS.Signals[] = ["SIGWINCH", "SIGTERM", "SIGHUP"];
	const handlers = new Map<NodeJS.Signals, () => void>();

	for (const signal of signals) {
		const handler = () => {
			try {
				forwardFn(signal);
			} catch {
				// Ignore errors (e.g. if child is already dead)
			}
		};
		process.on(signal, handler);
		handlers.set(signal, handler);
	}

	return () => {
		for (const [signal, handler] of handlers) {
			process.off(signal, handler);
		}
	};
}

/**
 * Check if Claude Code is installed and available in PATH.
 */
export async function checkClaudeInstalled(): Promise<boolean> {
	try {
		const proc = Bun.spawn(["which", "claude"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * Build an environment variable map for launching Claude Code from a model configuration.
 *
 * Resolves any `env:` references in model values and sets only defined variables required by
 * Claude Code (core settings, optional default models, API timeout, and a flag to disable
 * nonessential traffic). Starts from the current process.env and overwrites values with those
 * resolved from the provided model.
 *
 * @param model - Model configuration whose `value` fields supply environment settings and references
 * @returns A record of environment variables to use when launching Claude Code
 */
export function prepareEnvironment(model: Model): Record<string, string> {
	const env: Record<string, string> = { ...process.env } as Record<
		string,
		string
	>;
	const value = model.value;

	// Core model settings
	if (value.ANTHROPIC_BASE_URL) {
		env.ANTHROPIC_BASE_URL = resolveEnvRef(value.ANTHROPIC_BASE_URL);
	}

	if (value.ANTHROPIC_AUTH_TOKEN) {
		env.ANTHROPIC_AUTH_TOKEN = resolveEnvRef(value.ANTHROPIC_AUTH_TOKEN);
	}

	if (value.ANTHROPIC_MODEL) {
		env.ANTHROPIC_MODEL = resolveEnvRef(value.ANTHROPIC_MODEL);
	}

	if (value.ANTHROPIC_SMALL_FAST_MODEL) {
		env.ANTHROPIC_SMALL_FAST_MODEL = resolveEnvRef(
			value.ANTHROPIC_SMALL_FAST_MODEL
		);
	}

	// Optional model defaults
	if (value.ANTHROPIC_DEFAULT_SONNET_MODEL) {
		env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolveEnvRef(
			value.ANTHROPIC_DEFAULT_SONNET_MODEL
		);
	}

	if (value.ANTHROPIC_DEFAULT_OPUS_MODEL) {
		env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolveEnvRef(
			value.ANTHROPIC_DEFAULT_OPUS_MODEL
		);
	}

	if (value.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
		env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolveEnvRef(
			value.ANTHROPIC_DEFAULT_HAIKU_MODEL
		);
	}

	// Optional settings - only set if explicitly configured
	if (value.API_TIMEOUT_MS !== undefined && value.API_TIMEOUT_MS > 0) {
		env.API_TIMEOUT_MS = String(value.API_TIMEOUT_MS);
	}

	if (value.DISABLE_NONESSENTIAL_TRAFFIC === true) {
		env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
	}

	return env;
}

/**
 * Launch Claude Code using the provided model configuration and a PTY when available.
 *
 * If bun-pty is unavailable or PTY launch fails, falls back to spawning the `claude`
 * process with inherited stdio. The function prepares the environment and working
 * directory before launching.
 *
 * @param model - Model configuration used to construct the environment for Claude Code
 * @param options - Optional launch settings; supports `cwd` to override the working directory
 * @returns `{ ok: true, exitCode: number }` when the process exits normally; `{ ok: false, reason: "not_found" | "spawn_failed" | "signal", message: string }` on failure
 */
export async function launchClaudeCode(
	model: Model,
	options?: LaunchOptions
): Promise<LaunchResult> {
	const cwd = options?.cwd ?? process.cwd();
	resetTerminalForChild();

	// Verify Claude is installed
	const isInstalled = await checkClaudeInstalled();
	if (!isInstalled) {
		return {
			ok: false,
			reason: "not_found",
			message:
				"Claude Code is not installed or not in PATH.\n\n" +
				"Install it with:\n" +
				"  npm install -g @anthropic-ai/claude-code\n\n" +
				"Or visit: https://claude.ai/code",
		};
	}

	// Prepare environment
	const env = prepareEnvironment(model);

	// Try bun-pty first for proper PTY handling
	if (bunPtySpawn) {
		try {
			return await launchWithPty(env, cwd);
		} catch (_err) {
			// Fall through to Bun.spawn fallback
		}
	}

	// Fallback: Bun.spawn with explicit file descriptors
	// Use Bun.stdin/stdout/stderr instead of "inherit" to ensure proper
	// terminal FD inheritance even after the TUI renderer is destroyed
	try {
		console.log("Using Bun.spawn fallback with signal forwarding...");
		const proc = Bun.spawn(["claude"], {
			env,
			cwd,
			stdin: Bun.stdin,
			stdout: Bun.stdout,
			stderr: Bun.stderr,
		});

		const cleanupSignals = setupSignalForwarding((signal) => {
			// biome-ignore lint/suspicious/noExplicitAny: Bun types require specific signal literals
			proc.kill(signal as any);
		});

		const exitCode = await proc.exited;
		cleanupSignals();

		return { ok: true, exitCode };
	} catch (err) {
		return {
			ok: false,
			reason: "spawn_failed",
			message: `Failed to launch Claude Code: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Launch Claude Code in a separate terminal window.
 *
 * Creates a wrapper script that sets up the environment and runs Claude Code,
 * then launches it in a new terminal window. This allows multiple Claude instances
 * to run simultaneously, each in its own terminal.
 *
 * @param model - Model configuration used to construct the environment
 * @param options - Extended launch options including CLI args and working directory
 * @returns LaunchResult indicating if spawn was successful
 */
export async function launchClaudeCodeBackground(
	model: Model,
	options?: ExtendedLaunchOptions
): Promise<LaunchResult> {
	const cwd = options?.cwd ?? process.cwd();
	const cliArgs = options?.cliArgs ?? [];
	const terminalApp = options?.terminalApp || "Terminal";
	const platform = os.platform();

	// Verify Claude is installed
	const isInstalled = await checkClaudeInstalled();
	if (!isInstalled) {
		return {
			ok: false,
			reason: "not_found",
			message: "Claude Code is not installed or not in PATH.",
		};
	}

	// Prepare environment variables
	const env = prepareEnvironment(model);

	// Build the claude command with arguments
	const claudeCommand = ["claude", ...cliArgs]
		.map((arg) => {
			// Escape single quotes in arguments for shell
			if (arg.includes("'") || arg.includes(" ") || arg.includes('"')) {
				return `'${arg.replace(/'/g, "'\\''")}'`;
			}
			return arg;
		})
		.join(" ");

	// Create a wrapper script that sets environment and runs claude
	const timestamp = Date.now();
	const scriptName = `.cclauncher_${model.name.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.sh`;
	const wrapperScriptPath = path.join(cwd, scriptName);

	// Build environment export statements
	const envExports = Object.entries(env)
		.filter(
			([key]) =>
				key.startsWith("ANTHROPIC") ||
				key.startsWith("CLAUDE") ||
				key === "API_TIMEOUT_MS"
		)
		.map(
			([key, value]) => `export ${key}='${value?.replace(/'/g, "'\\''") ?? ""}'`
		)
		.join("\n");

	const wrapperContent = `#!/bin/bash
cd "${cwd}"

# Set up environment for Claude Code
${envExports}

# Launch Claude Code
echo "Starting Claude Code with model: ${model.name}"
echo "Working directory: ${cwd}"
echo "----------------------------------------"
${claudeCommand}
CLAUDE_EXIT=$?

echo ""
echo "----------------------------------------"
echo "Claude Code exited with code $CLAUDE_EXIT"
echo "Press any key to close this terminal..."
read -n 1 -s -r < /dev/tty

# Cleanup wrapper script on exit
rm -f "${wrapperScriptPath}"

exit $CLAUDE_EXIT
`;

	try {
		// Write the wrapper script
		fs.writeFileSync(wrapperScriptPath, wrapperContent, { mode: 0o755 });
	} catch (err) {
		return {
			ok: false,
			reason: "spawn_failed",
			message: `Failed to create launch script: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	// Launch in a new terminal window
	if (platform === "darwin") {
		try {
			const proc = Bun.spawn(["open", "-a", terminalApp, wrapperScriptPath], {
				stderr: "pipe",
				stdout: "ignore",
			});

			const code = await proc.exited;
			if (code !== 0) {
				const stderr = await new Response(proc.stderr).text();
				// Clean up script on failure (ignore errors - best effort)
				try {
					fs.unlinkSync(wrapperScriptPath);
				} catch (_cleanupErr) {
					// Ignore cleanup errors
				}
				return {
					ok: false,
					reason: "spawn_failed",
					message: `Failed to open terminal: ${stderr}`,
				};
			}

			return { ok: true, exitCode: 0 };
		} catch (err) {
			// Clean up script on error (ignore errors - best effort)
			try {
				fs.unlinkSync(wrapperScriptPath);
			} catch (_cleanupErr) {
				// Ignore cleanup errors
			}
			return {
				ok: false,
				reason: "spawn_failed",
				message: `Failed to launch terminal: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	} else {
		// Linux/other - try common terminal emulators
		// For now, fall back to basic spawn (won't work for multiple instances)
		console.warn(
			"Multi-instance launch not fully supported on this platform yet."
		);
		try {
			fs.unlinkSync(wrapperScriptPath);
		} catch (_cleanupErr) {
			// Ignore cleanup errors
		}
		return {
			ok: false,
			reason: "spawn_failed",
			message:
				"Multi-instance terminal launch not supported on this platform yet.",
		};
	}
}

/**
 * Launch a Claude Code subprocess attached to a pseudo-terminal and proxy its stdin/stdout.
 *
 * @returns `ok: true` with `exitCode` when the child exits normally; `ok: false` with `reason: "signal"` and a `message` if the process was terminated by a signal.
 * @throws If bun-pty is not available (pty spawn implementation missing)
 */
function launchWithPty(
	env: Record<string, string>,
	cwd: string
): Promise<LaunchResult> {
	if (!bunPtySpawn) {
		throw new Error("bun-pty not available");
	}

	console.log("Using bun-pty with signal forwarding...");

	// Get terminal size
	const cols = process.stdout.columns || 80;
	const rows = process.stdout.rows || 24;

	const pty = bunPtySpawn("claude", [], {
		name: "xterm-256color",
		cols,
		rows,
		cwd,
		env,
	});

	// Put stdin in raw mode for direct input passthrough
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();

	// Forward PTY output to stdout
	const dataHandler = pty.onData((data: string) => {
		process.stdout.write(data);
	});

	// Forward stdin to PTY
	const onStdinData = (data: Buffer) => {
		pty.write(data.toString());
	};
	process.stdin.on("data", onStdinData);

	// Dedicated resize handler for stdout resize events (specific to TTY resize)
	const onStdoutResize = () => {
		const newCols = process.stdout.columns || 80;
		const newRows = process.stdout.rows || 24;
		try {
			pty.resize(newCols, newRows);
		} catch {
			// Ignore
		}
	};
	process.stdout.on("resize", onStdoutResize);

	// General signal forwarding (SIGWINCH, SIGTERM, SIGHUP)
	const cleanupSignals = setupSignalForwarding((signal) => {
		if (signal === "SIGWINCH") {
			// Handle SIGWINCH via resize
			onStdoutResize();
		} else {
			// Kill PTY for other signals
			// biome-ignore lint/suspicious/noExplicitAny: bun-pty types are loose
			pty.kill(signal as any);
		}
	});

	// Wait for exit
	return new Promise<LaunchResult>((resolve) => {
		pty.onExit(({ exitCode, signal }) => {
			// Cleanup
			dataHandler.dispose();
			process.stdin.off("data", onStdinData);
			process.stdout.off("resize", onStdoutResize);
			cleanupSignals();

			// Restore stdin mode
			if (process.stdin.isTTY) {
				try {
					process.stdin.setRawMode(false);
				} catch {
					// Ignore
				}
			}
			process.stdin.pause();

			if (signal !== undefined && signal !== null) {
				resolve({
					ok: false,
					reason: "signal",
					message: `Claude Code was killed by signal ${signal}`,
				});
			} else {
				resolve({ ok: true, exitCode: exitCode ?? 0 });
			}
		});
	});
}

/**
 * Mask sensitive values for display (shows first 4 and last 4 chars).
 */
export function maskToken(value: string): string {
	if (!value) {
		return "";
	}
	if (value.startsWith("env:")) {
		return value; // Show env references as-is
	}
	if (value.length <= 12) {
		return "****";
	}
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Format model info for display.
 */
export function formatModelInfo(model: Model): string {
	const lines = [
		`Name: ${model.name}`,
		`Description: ${model.description || "(none)"}`,
		`Endpoint: ${model.value.ANTHROPIC_BASE_URL}`,
		`Model: ${model.value.ANTHROPIC_MODEL}`,
		`Auth: ${maskToken(model.value.ANTHROPIC_AUTH_TOKEN)}`,
	];

	if (model.isDefault) {
		lines.push("(Default)");
	}

	return lines.join("\n");
}
