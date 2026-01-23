import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ScriptExecution } from "@/lib/scriptExecution";
import { getLaunchTempDir, getSetupMarkerPath } from "@/utils/launchTempDir";
import { logger } from "./logger";

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
	script: ScriptExecution,
	terminalAppPath?: string
): Promise<boolean> {
	const platform = os.platform();

	// Create a wrapper script that runs the user script and signals completion
	const markerFile = getSetupMarkerPath(cwd);
	const wrapperScriptPath = path.join(
		getLaunchTempDir(cwd),
		"setup_wrapper.sh"
	);

	// Ensure marker is gone
	if (fs.existsSync(markerFile)) {
		try {
			fs.unlinkSync(markerFile);
		} catch (err) {
			logger.error(`Failed to cleanup marker file ${markerFile}`, err);
		}
	}

	const bashSingleQuote = (value: string): string =>
		`'${value.replace(/'/g, `'"'"'`)}'`;
	const resolvedScript =
		script.kind === "file" ? script.resolvedPath : script.command;
	const scriptLabel = script.raw || resolvedScript;
	const wrapperContent = `#!/bin/bash
SCRIPT_KIND=${bashSingleQuote(script.kind)}
SCRIPT_VALUE=${bashSingleQuote(resolvedScript)}
SCRIPT_LABEL=${bashSingleQuote(scriptLabel)}
cd "${cwd}"
echo "Running setup script: $SCRIPT_LABEL"
echo "----------------------------------------"
if [ "$SCRIPT_KIND" = "file" ]; then
  if [ -f "$SCRIPT_VALUE" ]; then
    # Execute the script file via bash to avoid relying on executable bits.
    bash "$SCRIPT_VALUE"
    EXIT_CODE=$?
  else
    echo "Setup script not found at $SCRIPT_VALUE"
    EXIT_CODE=1
  fi
else
  # If it's a command like "bun install", run it in a shell
  bash -lc "$SCRIPT_VALUE"
  EXIT_CODE=$?
fi
echo "----------------------------------------"
if [ $EXIT_CODE -eq 0 ]; then
  echo "Setup completed successfully."
else
  echo "Setup failed with exit code $EXIT_CODE."
fi

# Always write a marker with the exit code so the caller can detect completion.
echo "$EXIT_CODE" > "${markerFile}"

# Keep window open
echo
read -p "Press Enter to close this window..."
exit $EXIT_CODE
`;

	try {
		fs.writeFileSync(wrapperScriptPath, wrapperContent, { mode: 0o700 });
	} catch (err) {
		console.error("Failed to write wrapper script:", err);
		return false;
	}

	// Launch
	if (platform === "darwin") {
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
