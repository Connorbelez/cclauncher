import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";

// Store location: ~/.claude-model-launcher/models.json
const STORE_DIR = path.join(os.homedir(), ".claude-model-launcher");
const STORE_PATH = path.join(STORE_DIR, "models.json");

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
export type ModelsJson = Record<string, Model>;

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
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
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
 * Migrate from old array-based format to new key-value format.
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
 * Read all models from the store.
 */
export function readModels(): StoreResult<ModelsJson> {
  const dirResult = ensureStoreDir();
  if (!dirResult.ok) return dirResult;

  if (!fs.existsSync(STORE_PATH)) {
    // Return empty object if file doesn't exist yet
    return { ok: true, data: {} };
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
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
  if (!dirResult.ok) return dirResult;

  const tempPath = `${STORE_PATH}.tmp`;

  try {
    // Write to temp file first for atomic operation
    fs.writeFileSync(tempPath, JSON.stringify(models, null, 2));
    // Rename to actual path (atomic on most filesystems)
    fs.renameSync(tempPath, STORE_PATH);
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
  if (!result.ok) return result;

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
  if (!result.ok) return result;

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
  return { ok: true, data: sorted[0]! };
}

/**
 * Save a model to the store.
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
  if (!readResult.ok) return readResult;

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
  if (!readResult.ok) return readResult;

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
  if (!readResult.ok) return readResult;

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
    models[key]!.isDefault = key === name;
  }

  return writeModels(models);
}

/**
 * Get all models as a sorted array.
 */
export function getModelList(): StoreResult<Model[]> {
  const result = readModels();
  if (!result.ok) return result;

  const models = Object.values(result.data).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  return { ok: true, data: models };
}

/**
 * Get the store path (for display/debugging).
 */
export function getStorePath(): string {
  return STORE_PATH;
}

/**
 * Migrate models from a source file (e.g., in-source models.json).
 */
export function migrateModels(
  sourceModels: ModelsJson
): StoreResult<{ migrated: number; skipped: number }> {
  const readResult = readModels();
  if (!readResult.ok) return readResult;

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
    if (!writeResult.ok) return writeResult;
  }

  return { ok: true, data: { migrated, skipped } };
}
