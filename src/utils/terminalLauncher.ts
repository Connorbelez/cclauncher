import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SystemTerminal {
	name: string;
	path: string;
	isDetected: boolean;
}

/**
 * Detect available major terminal applications on the system.
 */
export function detectTerminals(): SystemTerminal[] {
	const platform = os.platform();
	const terminals: SystemTerminal[] = [];

	if (platform === "darwin") {
		// Common macOS terminals
		const candidates = [
			{ name: "Terminal", path: "/System/Applications/Utilities/Terminal.app" },
			{ name: "iTerm 2", path: "/Applications/iTerm.app" },
			{ name: "Hyper", path: "/Applications/Hyper.app" },
			{ name: "Alacritty", path: "/Applications/Alacritty.app" },
			{ name: "Kitty", path: "/Applications/kitty.app" },
			{ name: "Warp", path: "/Applications/Warp.app" },
		];

		for (const c of candidates) {
			if (fs.existsSync(c.path)) {
				terminals.push({ ...c, isDetected: true });
			}
		}
	} else {
		// Linux/other simple detection logic (future expansion)
		// Check PATH for x-terminal-emulator, gnome-terminal, etc.
	}

	return terminals;
}

/**
 * Launch a script in an external terminal.
 * returns true if successful, false otherwise.
 */
export async function launchExternalTerminal(
	cwd: string,
	scriptPath: string,
	terminalAppPath?: string
): Promise<boolean> {
	const platform = os.platform();

	// Create a wrapper script that runs the user script and signals completion
	const markerFile = path.join(cwd, ".cclauncher_setup_done");
	const wrapperScriptPath = path.join(cwd, ".cclauncher_wrapper.sh");

	// Ensure marker is gone
	if (fs.existsSync(markerFile)) {
		try {
			fs.unlinkSync(markerFile);
		} catch {}
	}

	const wrapperContent = `#!/bin/bash
cd "${cwd}"
echo "Running setup script: ${scriptPath}"
echo "----------------------------------------"
if [ -f "${scriptPath}" ]; then
  # Sourcing allows env vars to be set, but executing might be safer/cleaner.
  # Let's execute it.
  "${scriptPath}"
  EXIT_CODE=$?
else
  # If it's a command like "bun install", run it
  ${scriptPath}
  EXIT_CODE=$?
fi
echo "----------------------------------------"
if [ $EXIT_CODE -eq 0 ]; then
  echo "Setup completed successfully."
  touch "${markerFile}"
else
  echo "Setup failed with exit code $EXIT_CODE."
  # Do not touch marker file so TUI knows it didn't finish cleanly?
  # Or maybe we want to allow manual continuation.
  # For now, let's NOT touch the marker on failure, user has to override in TUI.
fi

# Keep window open
echo
read -p "Press Enter to close this window..."
exit $EXIT_CODE
`;

	try {
		fs.writeFileSync(wrapperScriptPath, wrapperContent, { mode: 0o755 });
	} catch (err) {
		console.error("Failed to write wrapper script:", err);
		return false;
	}

	// Launch
	if (platform === "darwin") {
		const args = ["-a", terminalAppPath || "Terminal", wrapperScriptPath];
		// If specific app not provided or just "Terminal", might default to Terminal.app
		// "open -a Terminal script.sh" works.
		// "open script.sh" opens in default editor or runner.
		// "open -a iTerm script.sh" works.

		try {
			// If no app specified, default to Terminal
			const app = terminalAppPath || "Terminal";

			// Check if app exists/is valid? open handles it reasonably well.

			const proc = Bun.spawn(["open", "-a", app, wrapperScriptPath], {
				stderr: "pipe",
				stdout: "ignore",
			});

			const code = await proc.exited;
			if (code !== 0) {
				const stderr = await new Response(proc.stderr).text();
				console.error("Failed to launch terminal:", stderr);
				return false;
			}
			return true;
		} catch (err) {
			console.error("Error launching terminal:", err);
			return false;
		}
	} else {
		// Basic fallback for other OS (not fully implemented yet per requirements focusing on macOS first)
		console.error("External terminal launch not implemented for this OS yet.");
		return false;
	}
}
