import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOG_DIR = path.join(os.homedir(), ".claude-model-launcher", "logs");
const LOG_FILE = path.join(LOG_DIR, "errors.log");

/**
 * Ensure the log directory exists.
 */
function ensureLogDir() {
	if (!fs.existsSync(LOG_DIR)) {
		try {
			fs.mkdirSync(LOG_DIR, { recursive: true });
		} catch {
			// If we can't even create the log dir, we're in trouble
		}
	}
}

/**
 * Simple logger that writes errors to a persistent log file and console.
 */
export const logger = {
	error: (message: string, error?: unknown) => {
		try {
			ensureLogDir();
			const timestamp = new Date().toISOString();
			const errorMsg =
				error instanceof Error ? error.stack || error.message : String(error);
			const logEntry = `[${timestamp}] ERROR: ${message}\n${error ? `${errorMsg}\n` : ""}\n`;

			fs.appendFileSync(LOG_FILE, logEntry);

			// Also log to console for development visibility
			// In TUI apps, this might not be visible unless redirected, but it's good practice
			console.error(message, error);
		} catch (e) {
			// Fallback if logging to file fails
			console.error("Logging system failed:", e);
			console.error(message, error);
		}
	},
	warn: (message: string) => {
		try {
			ensureLogDir();
			const timestamp = new Date().toISOString();
			const logEntry = `[${timestamp}] WARN: ${message}\n`;
			fs.appendFileSync(LOG_FILE, logEntry);
			console.warn(message);
		} catch (e) {
			console.error("Logging system failed:", e);
			console.warn(message);
		}
	},
};
