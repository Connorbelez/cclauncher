import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMP_ROOT_DIR = path.join(os.homedir(), ".claude-code-launcher");

function ensureDir(dirPath: string): void {
	if (fs.existsSync(dirPath)) {
		fs.chmodSync(dirPath, 0o700);
	} else {
		fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
	}
}

function hashPath(value: string): string {
	return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function getLaunchTempDir(workDir: string): string {
	ensureDir(TEMP_ROOT_DIR);
	const suffix = hashPath(path.resolve(workDir));
	const dirPath = path.join(TEMP_ROOT_DIR, `workdir-${suffix}`);
	ensureDir(dirPath);
	return dirPath;
}

export function getSetupMarkerPath(workDir: string): string {
	return path.join(getLaunchTempDir(workDir), "setup_done");
}
