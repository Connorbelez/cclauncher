import fs from "node:fs";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "debug.log");

export function logDebug(message: string, data?: unknown) {
	const timestamp = new Date().toISOString();
	const dataStr = data ? ` ${JSON.stringify(data)}` : "";
	fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}${dataStr}\n`);
}
