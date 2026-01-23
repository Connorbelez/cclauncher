import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

// Store location: ~/.claude-model-launcher/models.json
const DEFAULT_STORE_DIR = path.join(os.homedir(), ".claude-model-launcher");
const DEFAULT_STORE_PATH = path.join(DEFAULT_STORE_DIR, "models.json");

let customStorePath: string | null = null;

/**
 * Get the current store path.
 */
export function getStorePath(): string {
	return customStorePath ?? DEFAULT_STORE_PATH;
}

/**
 * Override the store path (primarily for testing).
 */
export function setStorePath(newPath: string | null): void {
	customStorePath = newPath;
}

/**
 * Get the current store directory.
 */
function getStoreDir(): string {
	return path.dirname(getStorePath());
}

// Extended model schema with new fields
export const modelValueSchema = z.object({
	ANTHROPIC_BASE_URL: z.string(),
	ANTHROPIC_AUTH_TOKEN: z.string(),
	ANTHROPIC_MODEL: z.string(),
	ANTHROPIC_SMALL_FAST_MODEL: z.string(),
	ANTHROPIC_DEFAULT_SONNET_MODEL: z.string().optional().default(""),
	ANTHROPIC_DEFAULT_OPUS_MODEL: z.string().optional().default(""),
	ANTHROPIC_DEFAULT_HAIKU_MODEL: z.string().optional().default(""),
	API_TIMEOUT_MS: z.number().optional(),
	DISABLE_NONESSENTIAL_TRAFFIC: z.boolean().optional(),
});

export const modelSchema = z.object({
	name: z.string().min(1, "Model name is required"),
	description: z.string().optional().default(""),
	order: z.number().optional(),
	isDefault: z.boolean().optional(),
	value: modelValueSchema,
});

export type ModelValue = z.infer<typeof modelValueSchema>;
export type Model = z.infer<typeof modelSchema>;
export type ModelCreateInput = Omit<Model, "isDefault">;
export type ModelsJson = Record<string, Model>;

function getDefaultModels(): ModelsJson {
	const zAIName = "Z.ai GLM 4.7";
	const miniMaxName = "MiniMax M2";

	return {
		[zAIName]: {
			name: zAIName,
			description: "Sample configuration (Z.ai GLM 4.7)",
			order: 1,
			value: {
				ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
				ANTHROPIC_AUTH_TOKEN: "token",
				ANTHROPIC_MODEL: "glm-4.7",
				ANTHROPIC_SMALL_FAST_MODEL: "glm-4.7",
				ANTHROPIC_DEFAULT_SONNET_MODEL: "",
				ANTHROPIC_DEFAULT_OPUS_MODEL: "",
				ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
				API_TIMEOUT_MS: 3000000,
				DISABLE_NONESSENTIAL_TRAFFIC: true,
			},
		},
		[miniMaxName]: {
			name: miniMaxName,
			description: "Sample configuration (MiniMax M2)",
			order: 2,
			value: {
				ANTHROPIC_BASE_URL: "https://api.minimax.io/anthropic",
				ANTHROPIC_AUTH_TOKEN: "authtoken",
				ANTHROPIC_MODEL: "MiniMax-M2",
				ANTHROPIC_SMALL_FAST_MODEL: "MiniMax-M2",
				ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M2",
				ANTHROPIC_DEFAULT_OPUS_MODEL: "MiniMax-M2",
				ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2",
				API_TIMEOUT_MS: 3000000,
				DISABLE_NONESSENTIAL_TRAFFIC: true,
			},
		},
	};
}

export type StoreResult<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			reason: "read" | "write" | "validation" | "not_found" | "duplicate";
			message: string;
	  };

/**
 * Resolve environment variable references in a value.
 * Supports "env:VARIABLE_NAME" syntax.
 */
export function resolveEnvRef(value: string): string {
	if (value.startsWith("env:")) {
		const varName = value.slice(4);
		return process.env[varName] ?? "";
	}
	return value;
}

/**
 * Ensure the store directory exists.
 */
function ensureStoreDir(): StoreResult<void> {
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
 * Convert legacy array-based model data into the new name-keyed ModelsJson structure.
 *
 * The migrated entries preserve the original array order (used for `order`), set
 * `description` to "Migrated from v<version> format", and map legacy fields into
 * the new model `value`. Fields that do not exist in the legacy item become
 * empty strings or undefined where appropriate.
 *
 * @param oldData - Legacy payload containing an optional `version` and a `models` array of legacy model objects
 * @returns A `ModelsJson` object mapping migrated model names to their new `Model` representation; returns an empty object if no models are present
 */
function migrateOldFormat(oldData: {
	version?: number;
	models?: unknown[];
}): ModelsJson {
	const migrated: ModelsJson = {};

	if (Array.isArray(oldData.models)) {
		oldData.models.forEach((item, index) => {
			const oldModel = item as {
				id?: string;
				displayName?: string;
				modelId?: string;
				fastModelId?: string;
				endpointUrl?: string;
				authToken?: string;
				timeout?: number;
			};

			const name = oldModel.displayName || oldModel.id || `model_${index + 1}`;
			migrated[name] = {
				name,
				description: `Migrated from v${oldData.version || 1} format`,
				order: index + 1,
				value: {
					ANTHROPIC_BASE_URL: oldModel.endpointUrl || "",
					ANTHROPIC_AUTH_TOKEN: oldModel.authToken || "",
					ANTHROPIC_MODEL: oldModel.modelId || "",
					ANTHROPIC_SMALL_FAST_MODEL: oldModel.fastModelId || "",
					ANTHROPIC_DEFAULT_SONNET_MODEL: "",
					ANTHROPIC_DEFAULT_OPUS_MODEL: "",
					ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
					API_TIMEOUT_MS: oldModel.timeout,
				},
			};
		});
	}

	return migrated;
}

/**
 * Read and validate all models from the persistent store.
 *
 * @returns A StoreResult whose `data` is a map of model name to Model when successful; if the operation fails, `ok` is `false` and `reason` and `message` explain the error.
 */
export function readModels(): StoreResult<ModelsJson> {
	const dirResult = ensureStoreDir();
	if (!dirResult.ok) {
		return dirResult;
	}

	const storePath = getStorePath();
	if (!fs.existsSync(storePath)) {
		const defaults = getDefaultModels();
		const writeResult = writeModels(defaults);
		if (!writeResult.ok) {
			return writeResult;
		}
		return { ok: true, data: defaults };
	}

	try {
		const raw = fs.readFileSync(storePath, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			return {
				ok: false,
				reason: "read",
				message: "Models file is not a valid object.",
			};
		}

		// Detect and migrate old array-based format
		if (
			"version" in parsed &&
			"models" in parsed &&
			Array.isArray(parsed.models)
		) {
			const migrated = migrateOldFormat(parsed);
			// Write migrated data back
			const writeResult = writeModels(migrated);
			if (!writeResult.ok) {
				return writeResult;
			}
			return { ok: true, data: migrated };
		}

		// Validate that models have the expected structure
		const validatedData: ModelsJson = {};
		for (const [key, model] of Object.entries(parsed)) {
			const m = model as Model;
			// Ensure each model has a valid value object
			if (
				m &&
				typeof m === "object" &&
				m.value &&
				typeof m.value === "object"
			) {
				validatedData[key] = m;
			}
		}

		if (Object.keys(validatedData).length === 0) {
			const defaults = getDefaultModels();
			const writeResult = writeModels(defaults);
			if (!writeResult.ok) {
				return writeResult;
			}
			return { ok: true, data: defaults };
		}

		return { ok: true, data: validatedData };
	} catch (err) {
		return {
			ok: false,
			reason: "read",
			message: `Failed to read models: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Write all models to the store using atomic write (temp file + rename).
 */
export function writeModels(models: ModelsJson): StoreResult<void> {
	const dirResult = ensureStoreDir();
	if (!dirResult.ok) {
		return dirResult;
	}

	const storePath = getStorePath();
	const tempPath = `${storePath}.tmp`;

	try {
		// Write to temp file first for atomic operation
		fs.writeFileSync(tempPath, JSON.stringify(models, null, 2));
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
			message: `Failed to save models: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Get a single model by name.
 */
export function getModel(name: string): StoreResult<Model> {
	const result = readModels();
	if (!result.ok) {
		return result;
	}

	const model = result.data[name];
	if (!model) {
		return {
			ok: false,
			reason: "not_found",
			message: `Model "${name}" not found.`,
		};
	}

	return { ok: true, data: model };
}

/**
 * Get the default model (or first model if none is marked default).
 */
export function getDefaultModel(): StoreResult<Model> {
	const result = readModels();
	if (!result.ok) {
		return result;
	}

	const models = Object.values(result.data);
	if (models.length === 0) {
		return {
			ok: false,
			reason: "not_found",
			message: "No models configured.",
		};
	}

	// Find default model or fall back to first by order
	const defaultModel = models.find((m) => m.isDefault);
	if (defaultModel) {
		return { ok: true, data: defaultModel };
	}

	// Sort by order and return first
	const sorted = models.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const first = sorted[0];
	if (!first) {
		return {
			ok: false,
			reason: "not_found",
			message: "No models found after sorting.",
		};
	}
	return { ok: true, data: first };
}

/**
 * Store or update a model in the persistent models store.
 *
 * If `originalName` is provided and differs from `model.name`, the entry is renamed.
 * If `model.order` is undefined, an order value is assigned after existing models.
 * Duplicate names are rejected unless `allowOverwrite` is true.
 *
 * @param model - The model object to save
 * @param options.originalName - Previous name when renaming a model
 * @param options.allowOverwrite - If `true`, overwrite an existing model with the same name
 * @returns `ok: true` on success; otherwise `ok: false` with `reason` set to `"read" | "write" | "validation" | "not_found" | "duplicate"` and a descriptive `message`
 */
export function saveModel(
	model: Model,
	options: { originalName?: string; allowOverwrite?: boolean } = {}
): StoreResult<void> {
	// Validate model
	const validation = modelSchema.safeParse(model);
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

	const readResult = readModels();
	if (!readResult.ok) {
		return readResult;
	}

	const models = readResult.data;
	const { originalName, allowOverwrite = false } = options;
	const targetName = model.name;
	const hasExisting = Boolean(models[targetName]);
	const isRename = Boolean(originalName && originalName !== targetName);

	// Check for duplicates
	if (hasExisting && (!originalName || isRename) && !allowOverwrite) {
		return {
			ok: false,
			reason: "duplicate",
			message: `A model with the name "${targetName}" already exists.`,
		};
	}

	// Handle rename
	if (isRename && originalName) {
		delete models[originalName];
	}

	// Calculate order if not set
	if (model.order === undefined) {
		const maxOrder = Math.max(
			0,
			...Object.values(models).map((m) => m.order ?? 0)
		);
		model.order = maxOrder + 1;
	}

	models[targetName] = model;

	return writeModels(models);
}

/**
 * Delete a model from the store.
 */
export function deleteModel(name: string): StoreResult<void> {
	const readResult = readModels();
	if (!readResult.ok) {
		return readResult;
	}

	const models = readResult.data;
	if (!models[name]) {
		return {
			ok: false,
			reason: "not_found",
			message: `Model "${name}" not found.`,
		};
	}

	delete models[name];
	return writeModels(models);
}

/**
 * Set a model as the default.
 */
export function setDefaultModel(name: string): StoreResult<void> {
	const readResult = readModels();
	if (!readResult.ok) {
		return readResult;
	}

	const models = readResult.data;
	if (!models[name]) {
		return {
			ok: false,
			reason: "not_found",
			message: `Model "${name}" not found.`,
		};
	}

	// Clear existing default and set new one
	for (const key of Object.keys(models)) {
		const m = models[key];
		if (m) {
			m.isDefault = key === name;
		}
	}

	return writeModels(models);
}

/**
 * Retrieve all stored models sorted by their `order` property in ascending order.
 *
 * @returns A StoreResult whose `data` is an array of models sorted by `order` ascending when `ok` is `true`; otherwise an error result indicating why the store could not be read.
 */
export function getModelList(): StoreResult<Model[]> {
	const result = readModels();
	if (!result.ok) {
		return result;
	}

	const models = Object.values(result.data).sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0)
	);
	return { ok: true, data: models };
}

/**
 * Get the store path (for display/debugging).
 * Handled by the exported getStorePath() defined above.
 */

/**
 * Merge models from the provided source into the persistent store, adding any new entries.
 *
 * @param sourceModels - Map of model names to model objects to import into the store
 * @returns An object with `migrated` equal to the number of models added and `skipped` equal to the number of models that already existed
 */
export function migrateModels(
	sourceModels: ModelsJson
): StoreResult<{ migrated: number; skipped: number }> {
	const readResult = readModels();
	if (!readResult.ok) {
		return readResult;
	}

	const existingModels = readResult.data;
	let migrated = 0;
	let skipped = 0;

	for (const [name, model] of Object.entries(sourceModels)) {
		if (existingModels[name]) {
			skipped++;
			continue;
		}
		existingModels[name] = model;
		migrated++;
	}

	if (migrated > 0) {
		const writeResult = writeModels(existingModels);
		if (!writeResult.ok) {
			return writeResult;
		}
	}

	return { ok: true, data: { migrated, skipped } };
}
