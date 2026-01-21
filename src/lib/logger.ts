import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDebugLoggingEnabled } from "./appConfig";

const LOG_DIR = path.join(os.homedir(), ".claude-model-launcher", "logs");
const LOG_FILE = path.join(LOG_DIR, "debug.log");

function ensureLogDir(): void {
	if (!fs.existsSync(LOG_DIR)) {
		fs.mkdirSync(LOG_DIR, { recursive: true });
	}
}

export function logDebug(message: string, data?: unknown) {
	if (!isDebugLoggingEnabled()) return;
	ensureLogDir();
	const timestamp = new Date().toISOString();
	const dataStr = data ? ` ${JSON.stringify(data)}` : "";
	fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}${dataStr}\n`);
}
