/**
 * Reset terminal keyboard mode by disabling Kitty keyboard protocol.
 * This ensures spawned processes inherit a terminal in standard mode.
 *
 * The Kitty keyboard protocol uses a stack-based system where enabling
 * pushes a mode and disabling pops it. The escape sequence \x1b[<u
 * pops the current keyboard mode, restoring the previous state.
 *
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
export function resetKeyboardMode(): void {
	process.stdout.write("\x1b[<u");
}

type BunSpawnSync = (
	args: string[],
	options: {
		stdin: "inherit";
		stdout: "inherit";
		stderr: "inherit";
	}
) => void;

/**
 * Prepare the current process terminal for spawning a child TUI by restoring input/output state and disabling terminal protocols that can persist across applications.
 *
 * Attempts to disable raw mode on stdin (when it is a TTY), writes escape sequences to stdout to reset attributes, show the cursor, exit the alternate buffer, pop the Kitty keyboard mode, and disable mouse tracking, focus events, and bracketed paste. Finally, when stdin is a TTY it attempts to run `stty sane`. All operations are best-effort; failures are ignored.
 */
export function resetTerminalForChild(): void {
	if (process.stdin.isTTY) {
		try {
			process.stdin.setRawMode(false);
		} catch {
			// Best-effort reset; some stdin streams don't allow this.
		}
	}

	// Disable features that can interfere with child input handling.
	// - Kitty keyboard protocol: pop current mode
	// - Bracketed paste, mouse tracking, focus events
	process.stdout.write(
		"\x1b[0m\x1b[?25h\x1b[?1049l\x1b[?1l\x1b[<u\x1b[?2004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1004l"
	);

	if (process.stdin.isTTY) {
		try {
			// Type assertion needed due to Bun type definitions mismatch
			(Bun.spawnSync as unknown as BunSpawnSync)(["stty", "sane"], {
				stdin: "inherit",
				stdout: "inherit",
				stderr: "inherit",
			});
		} catch {
			// Best-effort reset; ignore if stty is unavailable.
		}
	}
}
