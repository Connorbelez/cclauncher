import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

// Store location: ~/.claude-model-launcher/projects.json
const DEFAULT_STORE_DIR = path.join(os.homedir(), ".claude-model-launcher");
const DEFAULT_PROJECTS_PATH = path.join(DEFAULT_STORE_DIR, "projects.json");

let customProjectsPath: string | null = null;

/**
 * Get the current projects store path.
 */
export function getProjectsStorePath(): string {
	return customProjectsPath ?? DEFAULT_PROJECTS_PATH;
}

/**
 * Override the projects store path (primarily for testing).
 */
export function setProjectsStorePath(newPath: string | null): void {
	customProjectsPath = newPath;
}

/**
 * Get the store directory.
 */
function getStoreDir(): string {
	return path.dirname(getProjectsStorePath());
}

// Schema for a single project's configuration
export const projectConfigSchema = z.object({
	postWorktreeScript: z.string().optional(),
	// Future extensibility: add more per-project settings here
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

// Schema for the entire projects.json file
export const projectsStoreSchema = z.record(z.string(), projectConfigSchema);

export type ProjectsStore = z.infer<typeof projectsStoreSchema>;

export type ProjectStoreResult<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			reason: "read" | "write" | "validation" | "not_found";
			message: string;
	  };

/**
 * Ensure the store directory exists.
 */
function ensureStoreDir(): ProjectStoreResult<void> {
	try {
		const storeDir = getStoreDir();
		if (!fs.existsSync(storeDir)) {
			fs.mkdirSync(storeDir, { recursive: true });
		}
		return { ok: true, data: undefined };
	} catch (err) {
		return {
			ok: false,
			reason: "write",
			message: `Failed to create store directory: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Read all project settings from the persistent store.
 */
export function readProjectsStore(): ProjectStoreResult<ProjectsStore> {
	const dirResult = ensureStoreDir();
	if (!dirResult.ok) {
		return dirResult;
	}

	const storePath = getProjectsStorePath();
	if (!fs.existsSync(storePath)) {
		// Return empty object if file doesn't exist yet
		return { ok: true, data: {} };
	}

	try {
		const raw = fs.readFileSync(storePath, "utf8");
		const parsed = JSON.parse(raw);

		const validation = projectsStoreSchema.safeParse(parsed);
		if (!validation.success) {
			// Return empty object if validation fails (corrupted file)
			console.error("Projects store validation failed, returning empty store");
			return { ok: true, data: {} };
		}

		return { ok: true, data: validation.data };
	} catch (err) {
		return {
			ok: false,
			reason: "read",
			message: `Failed to read projects store: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Write all project settings to the store using atomic write (temp file + rename).
 */
export function writeProjectsStore(
	projects: ProjectsStore
): ProjectStoreResult<void> {
	const dirResult = ensureStoreDir();
	if (!dirResult.ok) {
		return dirResult;
	}

	const storePath = getProjectsStorePath();
	const tempPath = `${storePath}.tmp`;

	try {
		// Write to temp file first for atomic operation
		fs.writeFileSync(tempPath, JSON.stringify(projects, null, 2));
		// Rename to actual path (atomic on most filesystems)
		fs.renameSync(tempPath, storePath);
		return { ok: true, data: undefined };
	} catch (err) {
		// Clean up temp file if it exists
		try {
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		} catch {
			// Ignore cleanup errors
		}
		return {
			ok: false,
			reason: "write",
			message: `Failed to save projects store: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Get the configuration for a specific project by its root path.
 */
export function getProjectConfig(
	projectPath: string
): ProjectStoreResult<ProjectConfig | null> {
	const result = readProjectsStore();
	if (!result.ok) {
		return result;
	}

	const config = result.data[projectPath];
	return { ok: true, data: config || null };
}

/**
 * Save or update the configuration for a specific project.
 */
export function saveProjectConfig(
	projectPath: string,
	config: ProjectConfig
): ProjectStoreResult<void> {
	// Validate the config
	const validation = projectConfigSchema.safeParse(config);
	if (!validation.success) {
		const errors = validation.error.issues
			.map((e) => `${e.path.join(".")}: ${e.message}`)
			.join("\n");
		return {
			ok: false,
			reason: "validation",
			message: `Validation failed:\n${errors}`,
		};
	}

	const readResult = readProjectsStore();
	if (!readResult.ok) {
		return readResult;
	}

	const projects = readResult.data;

	// If the config has a script, save it; otherwise remove the project entry
	if (config.postWorktreeScript) {
		projects[projectPath] = validation.data;
	} else {
		delete projects[projectPath];
	}

	return writeProjectsStore(projects);
}

/**
 * Remove the configuration for a specific project.
 */
export function deleteProjectConfig(
	projectPath: string
): ProjectStoreResult<void> {
	const readResult = readProjectsStore();
	if (!readResult.ok) {
		return readResult;
	}

	const projects = readResult.data;
	delete projects[projectPath];

	return writeProjectsStore(projects);
}

/**
 * Resolve a relative script path to an absolute path based on the project root.
 */
export function resolveScriptPath(
	projectPath: string,
	scriptPath: string
): string {
	if (path.isAbsolute(scriptPath)) {
		return scriptPath;
	}
	return path.resolve(projectPath, scriptPath);
}

/**
 * Check if a script file exists at the given path.
 */
export function scriptExists(
	projectPath: string,
	scriptPath: string
): boolean {
	const absolutePath = resolveScriptPath(projectPath, scriptPath);
	return fs.existsSync(absolutePath);
}
