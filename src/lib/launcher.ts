import { type Model, resolveEnvRef } from "./store";
import { resetTerminalForChild } from "../utils/terminal";

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
  | { ok: false; reason: "not_found" | "spawn_failed" | "signal"; message: string };

export type LaunchOptions = {
  /** Working directory to launch Claude Code in */
  cwd?: string;
};

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
 * Prepare environment variables for Claude Code from a model configuration.
 * Resolves env: references and only sets non-empty values.
 */
export function prepareEnvironment(model: Model): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
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
    env.ANTHROPIC_SMALL_FAST_MODEL = resolveEnvRef(value.ANTHROPIC_SMALL_FAST_MODEL);
  }

  // Optional model defaults
  if (value.ANTHROPIC_DEFAULT_SONNET_MODEL) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolveEnvRef(value.ANTHROPIC_DEFAULT_SONNET_MODEL);
  }

  if (value.ANTHROPIC_DEFAULT_OPUS_MODEL) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolveEnvRef(value.ANTHROPIC_DEFAULT_OPUS_MODEL);
  }

  if (value.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolveEnvRef(value.ANTHROPIC_DEFAULT_HAIKU_MODEL);
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
 * Launch Claude Code with the given model configuration using bun-pty for proper TTY handling.
 * Falls back to Bun.spawn if bun-pty is unavailable.
 */
export async function launchClaudeCode(model: Model, options?: LaunchOptions): Promise<LaunchResult> {
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
    } catch (err) {
      // Fall through to Bun.spawn fallback
    }
  }

  // Fallback: Bun.spawn with inherited stdio
  try {
    const proc = Bun.spawn(["claude"], {
      env,
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
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
 * Launch Claude Code using bun-pty for proper PTY handling.
 * This gives the child process a real TTY with independent input buffering.
 */
async function launchWithPty(env: Record<string, string>, cwd: string): Promise<LaunchResult> {
  if (!bunPtySpawn) {
    throw new Error("bun-pty not available");
  }

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

  // Handle terminal resize
  const onResize = () => {
    const newCols = process.stdout.columns || 80;
    const newRows = process.stdout.rows || 24;
    pty.resize(newCols, newRows);
  };
  process.stdout.on("resize", onResize);

  // Wait for exit
  return new Promise<LaunchResult>((resolve) => {
    pty.onExit(({ exitCode, signal }) => {
      // Cleanup
      dataHandler.dispose();
      process.stdin.off("data", onStdinData);
      process.stdout.off("resize", onResize);

      // Restore stdin mode
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
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
  if (!value) return "";
  if (value.startsWith("env:")) return value; // Show env references as-is
  if (value.length <= 12) return "****";
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
