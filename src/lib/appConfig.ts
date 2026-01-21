import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".claude-model-launcher");
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_CONFIG_DIR, "config.json");

const appConfigSchema = z.object({
	enableDebugLogging: z.boolean().optional().default(false),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export type AppConfigResult<T> =
	| { ok: true; data: T }
	| { ok: false; reason: "read" | "write" | "validation"; message: string };

const DEFAULT_CONFIG: AppConfig = { enableDebugLogging: false };

let cachedConfig: AppConfig | null = null;

function ensureConfigDir(): AppConfigResult<void> {
	try {
		if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
			fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
		}
		return { ok: true, data: undefined };
	} catch (err) {
		return {
			ok: false,
			reason: "write",
			message: `Failed to create config directory: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export function readAppConfig(): AppConfigResult<AppConfig> {
	const dirResult = ensureConfigDir();
	if (!dirResult.ok) {
		return dirResult;
	}

	if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
		const writeResult = writeAppConfig(DEFAULT_CONFIG);
		if (!writeResult.ok) {
			return writeResult;
		}
		return { ok: true, data: DEFAULT_CONFIG };
	}

	try {
		const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw);
		const validation = appConfigSchema.safeParse(parsed);
		if (!validation.success) {
			return {
				ok: false,
				reason: "validation",
				message: "Config file is not valid.",
			};
		}
		return { ok: true, data: validation.data };
	} catch (err) {
		return {
			ok: false,
			reason: "read",
			message: `Failed to read config: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export function writeAppConfig(config: AppConfig): AppConfigResult<void> {
	const dirResult = ensureConfigDir();
	if (!dirResult.ok) {
		return dirResult;
	}

	try {
		const validated = appConfigSchema.parse(config);
		fs.writeFileSync(DEFAULT_CONFIG_PATH, JSON.stringify(validated, null, 2));
		cachedConfig = validated;
		return { ok: true, data: undefined };
	} catch (err) {
		return {
			ok: false,
			reason: "write",
			message: `Failed to write config: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export function getAppConfig(): AppConfig {
	if (!cachedConfig) {
		const result = readAppConfig();
		cachedConfig = result.ok ? result.data : DEFAULT_CONFIG;
	}
	return cachedConfig;
}

export function isDebugLoggingEnabled(): boolean {
	return getAppConfig().enableDebugLogging;
}
