import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deleteModel,
	getDefaultModel,
	getModel,
	getModelList,
	getStorePath,
	type Model,
	type ModelsJson,
	migrateModels,
	modelSchema,
	modelValueSchema,
	readModels,
	resolveEnvRef,
	saveModel,
	setDefaultModel,
	writeModels,
} from "./store";

// Test fixtures
const createTestModel = (overrides: Partial<Model> = {}): Model => ({
	name: "test-model",
	description: "Test model description",
	order: 1,
	isDefault: false,
	value: {
		ANTHROPIC_BASE_URL: "https://api.test.com",
		ANTHROPIC_AUTH_TOKEN: "test-token-123",
		ANTHROPIC_MODEL: "claude-3-opus",
		ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
		ANTHROPIC_DEFAULT_SONNET_MODEL: "",
		ANTHROPIC_DEFAULT_OPUS_MODEL: "",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
	},
	...overrides,
});

describe("resolveEnvRef", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should return value as-is if not an env reference", () => {
		expect(resolveEnvRef("regular-value")).toBe("regular-value");
		expect(resolveEnvRef("https://api.anthropic.com")).toBe(
			"https://api.anthropic.com"
		);
		expect(resolveEnvRef("")).toBe("");
	});

	it("should resolve env: prefix to environment variable", () => {
		process.env.TEST_API_KEY = "secret-key-123";
		expect(resolveEnvRef("env:TEST_API_KEY")).toBe("secret-key-123");
	});

	it("should return empty string for undefined env variable", () => {
		process.env.UNDEFINED_VAR = undefined;
		expect(resolveEnvRef("env:UNDEFINED_VAR")).toBe("");
	});

	it("should handle env variable with empty value", () => {
		process.env.EMPTY_VAR = "";
		expect(resolveEnvRef("env:EMPTY_VAR")).toBe("");
	});
});

describe("modelValueSchema", () => {
	it("should validate a complete model value", () => {
		const value = {
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			ANTHROPIC_AUTH_TOKEN: "sk-test-123",
			ANTHROPIC_MODEL: "claude-3-opus",
			ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
		};

		const result = modelValueSchema.safeParse(value);
		expect(result.success).toBe(true);
	});

	it("should provide defaults for optional fields", () => {
		const value = {
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			ANTHROPIC_AUTH_TOKEN: "sk-test-123",
			ANTHROPIC_MODEL: "claude-3-opus",
			ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
		};

		const result = modelValueSchema.safeParse(value);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("");
			expect(result.data.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("");
			expect(result.data.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("");
		}
	});

	it("should reject missing required fields", () => {
		const value = {
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			// Missing other required fields
		};

		const result = modelValueSchema.safeParse(value);
		expect(result.success).toBe(false);
	});

	it("should accept optional API_TIMEOUT_MS", () => {
		const value = {
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			ANTHROPIC_AUTH_TOKEN: "sk-test-123",
			ANTHROPIC_MODEL: "claude-3-opus",
			ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
			API_TIMEOUT_MS: 30_000,
		};

		const result = modelValueSchema.safeParse(value);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.API_TIMEOUT_MS).toBe(30_000);
		}
	});

	it("should accept optional DISABLE_NONESSENTIAL_TRAFFIC", () => {
		const value = {
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			ANTHROPIC_AUTH_TOKEN: "sk-test-123",
			ANTHROPIC_MODEL: "claude-3-opus",
			ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
			DISABLE_NONESSENTIAL_TRAFFIC: true,
		};

		const result = modelValueSchema.safeParse(value);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.DISABLE_NONESSENTIAL_TRAFFIC).toBe(true);
		}
	});
});

describe("modelSchema", () => {
	it("should validate a complete model", () => {
		const model = createTestModel();
		const result = modelSchema.safeParse(model);
		expect(result.success).toBe(true);
	});

	it("should require non-empty name", () => {
		const model = createTestModel({ name: "" });
		const result = modelSchema.safeParse(model);
		expect(result.success).toBe(false);
	});

	it("should allow missing description", () => {
		const model = {
			name: "test",
			value: createTestModel().value,
		};
		const result = modelSchema.safeParse(model);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.description).toBe("");
		}
	});

	it("should allow missing order", () => {
		const model = {
			name: "test",
			value: createTestModel().value,
		};
		const result = modelSchema.safeParse(model);
		expect(result.success).toBe(true);
	});

	it("should allow isDefault flag", () => {
		const model = createTestModel({ isDefault: true });
		const result = modelSchema.safeParse(model);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(true);
		}
	});
});

describe("Store operations", () => {
	const STORE_DIR = path.join(os.homedir(), ".claude-model-launcher");
	const STORE_PATH = path.join(STORE_DIR, "models.json");
	let originalContent: string | null = null;

	beforeEach(() => {
		// Backup existing file if present
		try {
			originalContent = fs.readFileSync(STORE_PATH, "utf8");
		} catch {
			originalContent = null;
		}
		// Clear the store for tests
		try {
			fs.unlinkSync(STORE_PATH);
		} catch {
			// File may not exist
		}
	});

	afterEach(() => {
		// Restore original content
		try {
			fs.unlinkSync(STORE_PATH);
		} catch {
			// Ignore
		}
		if (originalContent !== null) {
			fs.writeFileSync(STORE_PATH, originalContent);
		}
	});

	describe("readModels", () => {
		it("should return empty object when store does not exist", () => {
			const result = readModels();
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toEqual({});
			}
		});

		it("should read existing models", () => {
			const models: ModelsJson = {
				"test-model": createTestModel(),
			};
			fs.mkdirSync(STORE_DIR, { recursive: true });
			fs.writeFileSync(STORE_PATH, JSON.stringify(models, null, 2));

			const result = readModels();
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data["test-model"]).toBeDefined();
				expect(result.data["test-model"]?.name).toBe("test-model");
			}
		});

		it("should return error for invalid JSON", () => {
			fs.mkdirSync(STORE_DIR, { recursive: true });
			fs.writeFileSync(STORE_PATH, "invalid json {{{");

			const result = readModels();
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("read");
			}
		});

		it("should return error if file is not an object", () => {
			fs.mkdirSync(STORE_DIR, { recursive: true });
			fs.writeFileSync(STORE_PATH, '"just a string"');

			const result = readModels();
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("read");
			}
		});
	});

	describe("writeModels", () => {
		it("should write models to store", () => {
			const models: ModelsJson = {
				"test-model": createTestModel(),
			};

			const result = writeModels(models);
			expect(result.ok).toBe(true);

			const content = fs.readFileSync(STORE_PATH, "utf8");
			const parsed = JSON.parse(content);
			expect(parsed["test-model"]).toBeDefined();
		});

		it("should create store directory if it does not exist", () => {
			// Remove directory if exists
			try {
				fs.rmSync(STORE_DIR, { recursive: true });
			} catch {
				// Ignore
			}

			const models: ModelsJson = {
				"test-model": createTestModel(),
			};

			const result = writeModels(models);
			expect(result.ok).toBe(true);
			expect(fs.existsSync(STORE_DIR)).toBe(true);
		});
	});

	describe("getModel", () => {
		it("should return model by name", () => {
			const models: ModelsJson = {
				"test-model": createTestModel(),
			};
			writeModels(models);

			const result = getModel("test-model");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.name).toBe("test-model");
			}
		});

		it("should return not_found for missing model", () => {
			const models: ModelsJson = {
				"test-model": createTestModel(),
			};
			writeModels(models);

			const result = getModel("non-existent");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_found");
			}
		});
	});

	describe("getDefaultModel", () => {
		it("should return model marked as default", () => {
			const models: ModelsJson = {
				"model-1": createTestModel({
					name: "model-1",
					isDefault: false,
					order: 1,
				}),
				"model-2": createTestModel({
					name: "model-2",
					isDefault: true,
					order: 2,
				}),
			};
			writeModels(models);

			const result = getDefaultModel();
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.name).toBe("model-2");
			}
		});

		it("should return first model by order if no default set", () => {
			const models: ModelsJson = {
				"model-2": createTestModel({ name: "model-2", order: 2 }),
				"model-1": createTestModel({ name: "model-1", order: 1 }),
			};
			writeModels(models);

			const result = getDefaultModel();
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.name).toBe("model-1");
			}
		});

		it("should return not_found when no models exist", () => {
			const result = getDefaultModel();
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_found");
			}
		});
	});

	describe("saveModel", () => {
		it("should save a new model", () => {
			const model = createTestModel();
			const result = saveModel(model);
			expect(result.ok).toBe(true);

			const getResult = getModel("test-model");
			expect(getResult.ok).toBe(true);
		});

		it("should reject duplicate model names", () => {
			const model = createTestModel();
			saveModel(model);

			const duplicate = createTestModel({ description: "different" });
			const result = saveModel(duplicate);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("duplicate");
			}
		});

		it("should allow overwrite with allowOverwrite option", () => {
			const model = createTestModel();
			saveModel(model);

			const updated = createTestModel({ description: "updated description" });
			const result = saveModel(updated, { allowOverwrite: true });
			expect(result.ok).toBe(true);

			const getResult = getModel("test-model");
			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.data.description).toBe("updated description");
			}
		});

		it("should handle rename with originalName option", () => {
			const model = createTestModel({ name: "old-name" });
			saveModel(model);

			const renamed = createTestModel({ name: "new-name" });
			const result = saveModel(renamed, { originalName: "old-name" });
			expect(result.ok).toBe(true);

			expect(getModel("old-name").ok).toBe(false);
			expect(getModel("new-name").ok).toBe(true);
		});

		it("should auto-assign order if not set", () => {
			const model1 = createTestModel({ name: "model-1", order: 5 });
			saveModel(model1);

			const model2 = createTestModel({ name: "model-2", order: undefined });
			saveModel(model2);

			const getResult = getModel("model-2");
			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.data.order).toBe(6); // max + 1
			}
		});

		it("should reject invalid model data", () => {
			const invalid = {
				name: "", // Empty name should fail
				value: createTestModel().value,
			} as Model;

			const result = saveModel(invalid);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("validation");
			}
		});
	});

	describe("deleteModel", () => {
		it("should delete existing model", () => {
			const model = createTestModel();
			saveModel(model);

			const result = deleteModel("test-model");
			expect(result.ok).toBe(true);

			expect(getModel("test-model").ok).toBe(false);
		});

		it("should return not_found for missing model", () => {
			const result = deleteModel("non-existent");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_found");
			}
		});
	});

	describe("setDefaultModel", () => {
		it("should set a model as default", () => {
			const models: ModelsJson = {
				"model-1": createTestModel({ name: "model-1", isDefault: false }),
				"model-2": createTestModel({ name: "model-2", isDefault: false }),
			};
			writeModels(models);

			const result = setDefaultModel("model-2");
			expect(result.ok).toBe(true);

			const getResult = getModel("model-2");
			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.data.isDefault).toBe(true);
			}
		});

		it("should clear previous default", () => {
			const models: ModelsJson = {
				"model-1": createTestModel({ name: "model-1", isDefault: true }),
				"model-2": createTestModel({ name: "model-2", isDefault: false }),
			};
			writeModels(models);

			setDefaultModel("model-2");

			const getResult1 = getModel("model-1");
			expect(getResult1.ok).toBe(true);
			if (getResult1.ok) {
				expect(getResult1.data.isDefault).toBe(false);
			}
		});

		it("should return not_found for missing model", () => {
			const result = setDefaultModel("non-existent");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_found");
			}
		});
	});

	describe("getModelList", () => {
		it("should return sorted list of models", () => {
			const models: ModelsJson = {
				"model-3": createTestModel({ name: "model-3", order: 3 }),
				"model-1": createTestModel({ name: "model-1", order: 1 }),
				"model-2": createTestModel({ name: "model-2", order: 2 }),
			};
			writeModels(models);

			const result = getModelList();
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(3);
				expect(result.data[0]?.name).toBe("model-1");
				expect(result.data[1]?.name).toBe("model-2");
				expect(result.data[2]?.name).toBe("model-3");
			}
		});

		it("should return empty array when no models", () => {
			const result = getModelList();
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toEqual([]);
			}
		});
	});

	describe("getStorePath", () => {
		it("should return the store path", () => {
			const storePath = getStorePath();
			expect(storePath).toContain(".claude-model-launcher");
			expect(storePath).toContain("models.json");
		});
	});

	describe("migrateModels", () => {
		it("should migrate new models", () => {
			const sourceModels: ModelsJson = {
				"new-model": createTestModel({ name: "new-model" }),
			};

			const result = migrateModels(sourceModels);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.migrated).toBe(1);
				expect(result.data.skipped).toBe(0);
			}

			expect(getModel("new-model").ok).toBe(true);
		});

		it("should skip existing models", () => {
			const existing = createTestModel({ name: "existing" });
			saveModel(existing);

			const sourceModels: ModelsJson = {
				existing: createTestModel({
					name: "existing",
					description: "different",
				}),
			};

			const result = migrateModels(sourceModels);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.migrated).toBe(0);
				expect(result.data.skipped).toBe(1);
			}

			// Original should be preserved
			const getResult = getModel("existing");
			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.data.description).toBe("Test model description");
			}
		});

		it("should handle mixed migration", () => {
			const existing = createTestModel({ name: "existing" });
			saveModel(existing);

			const sourceModels: ModelsJson = {
				existing: createTestModel({ name: "existing" }),
				"new-model": createTestModel({ name: "new-model" }),
			};

			const result = migrateModels(sourceModels);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.migrated).toBe(1);
				expect(result.data.skipped).toBe(1);
			}
		});
	});
});
