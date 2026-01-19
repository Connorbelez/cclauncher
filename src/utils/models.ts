import type { SelectOption } from "@opentui/core";
import fs from "fs";
import path from "path";

type ModelsJson = Record<string, SelectOption & { order?: number }>;

export type SaveModelResult =
  | { ok: true }
  | { ok: false; reason: "validation" | "duplicate" | "read" | "write"; message: string };

const MODELS_PATH = path.resolve(process.cwd(), "src/models.json");

const formatError = (context: string, err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  return `${context}: ${message}`;
};

const readModelsJson = (): { ok: true; models: ModelsJson } | { ok: false; message: string; reason: "read" } => {
  try {
    const raw = fs.readFileSync(MODELS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        reason: "read",
        message: "Models file is not a valid object. Please fix the JSON structure.",
      };
    }
    return { ok: true, models: parsed as ModelsJson };
  } catch (err) {
    return {
      ok: false,
      reason: "read",
      message: `${formatError("Failed to read models file", err)}\n\nPlease ensure the file exists and is readable.`,
    };
  }
};

const writeModelsJson = (models: ModelsJson): { ok: true } | { ok: false; message: string; reason: "write" } => {
  try {
    fs.writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "write",
      message: `${formatError("Failed to save models file", err)}\n\nPlease check file permissions and ensure the file is writable.`,
    };
  }
};

const getNextModelOrder = (models: ModelsJson): number => {
  const numericOrders = Object.values(models)
    .map((model) => (typeof model.order === "number" && Number.isFinite(model.order) ? model.order : null))
    .filter((order): order is number => order !== null);
  const maxOrder = numericOrders.length > 0 ? Math.max(...numericOrders) : -1;
  return maxOrder + 1;
};

export const saveModelToFile = (
  model: SelectOption & { order?: number },
  options: { originalName?: string; allowOverwrite?: boolean; setOrderIfMissing?: boolean } = {},
): SaveModelResult => {
  const readResult = readModelsJson();
  if (!readResult.ok) {
    return readResult;
  }

  const { originalName, allowOverwrite = false, setOrderIfMissing = false } = options;
  const models = readResult.models;
  const targetName = model.name;
  const hasExisting = Boolean(models[targetName]);
  const isRename = Boolean(originalName && originalName !== targetName);

  if (hasExisting && (!originalName || isRename) && !allowOverwrite) {
    return {
      ok: false,
      reason: "duplicate",
      message: `A model with the name "${targetName}" already exists.`,
    };
  }

  if (isRename && originalName) {
    delete models[originalName];
  }

  const { order: incomingOrder, ...restModel } = model;
  const existing: (SelectOption & { order?: number }) | undefined = models[targetName];
  const nextModel: SelectOption & { order?: number } = {
    ...(existing ?? {}),
    ...restModel,
  };

  if (incomingOrder !== undefined) {
    nextModel.order = incomingOrder;
  } else if (setOrderIfMissing) {
    const existingOrder =
      typeof existing?.order === "number" && Number.isFinite(existing.order) ? existing.order : null;
    nextModel.order = existingOrder ?? getNextModelOrder(models);
  } else if (typeof existing?.order === "number") {
    nextModel.order = existing.order;
  }

  models[targetName] = nextModel;

  const writeResult = writeModelsJson(models);
  if (!writeResult.ok) {
    return writeResult;
  }

  return { ok: true };
};
