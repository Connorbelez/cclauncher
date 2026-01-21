import fs from "node:fs";
import path from "node:path";

export type ScriptExecution =
	| { kind: "file"; resolvedPath: string; raw: string }
	| { kind: "command"; command: string; raw: string };

const FILE_EXTENSIONS = new Set([".sh", ".bash", ".zsh", ".command"]);

export function looksLikeFilePath(scriptPath: string): boolean {
	const trimmed = scriptPath.trim();
	if (!trimmed) return false;
	if (path.isAbsolute(trimmed)) return true;
	if (trimmed.startsWith(".") || trimmed.includes(path.sep)) return true;
	const extension = path.extname(trimmed).toLowerCase();
	return FILE_EXTENSIONS.has(extension);
}

export function resolveScriptExecution(
	basePath: string,
	scriptPath: string
): ScriptExecution {
	const trimmed = scriptPath.trim();
	const resolved = path.isAbsolute(trimmed)
		? trimmed
		: path.resolve(basePath, trimmed);

	if (trimmed && fs.existsSync(resolved)) {
		return { kind: "file", resolvedPath: resolved, raw: trimmed };
	}

	return { kind: "command", command: trimmed, raw: trimmed };
}
