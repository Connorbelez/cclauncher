import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatModelInfo, maskToken, prepareEnvironment } from "./launcher";
import type { Model } from "./store";

// Test fixtures
const createTestModel = (overrides: Partial<Model> = {}): Model => ({
	name: "test-model",
	description: "Test model description",
	order: 1,
	isDefault: false,
	value: {
		ANTHROPIC_BASE_URL: "https://api.test.com",
		ANTHROPIC_AUTH_TOKEN: "test-token-123456789",
		ANTHROPIC_MODEL: "claude-3-opus",
		ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
		ANTHROPIC_DEFAULT_SONNET_MODEL: "",
		ANTHROPIC_DEFAULT_OPUS_MODEL: "",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
	},
	...overrides,
});

describe("prepareEnvironment", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should set core model environment variables", () => {
		const model = createTestModel();
		const env = prepareEnvironment(model);

		expect(env.ANTHROPIC_BASE_URL).toBe("https://api.test.com");
		expect(env.ANTHROPIC_AUTH_TOKEN).toBe("test-token-123456789");
		expect(env.ANTHROPIC_MODEL).toBe("claude-3-opus");
		expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe("claude-3-haiku");
	});

	it("should inherit existing process.env", () => {
		process.env.EXISTING_VAR = "existing-value";
		const model = createTestModel();
		const env = prepareEnvironment(model);

		expect(env.EXISTING_VAR).toBe("existing-value");
	});

	it("should resolve env: references", () => {
		process.env.MY_API_KEY = "secret-key-from-env";
		const model = createTestModel({
			value: {
				...createTestModel().value,
				ANTHROPIC_AUTH_TOKEN: "env:MY_API_KEY",
			},
		});

		const env = prepareEnvironment(model);
		expect(env.ANTHROPIC_AUTH_TOKEN).toBe("secret-key-from-env");
	});

	it("should not set empty optional fields", () => {
		const model = createTestModel();
		const env = prepareEnvironment(model);

		// These are empty strings in the test model, so should not be set
		expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
		expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
		expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined();
	});

	it("should set optional model defaults when present", () => {
		const model = createTestModel({
			value: {
				...createTestModel().value,
				ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-3-sonnet",
				ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-3-opus",
				ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-3-haiku",
			},
		});

		const env = prepareEnvironment(model);
		expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("claude-3-sonnet");
		expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-3-opus");
		expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-3-haiku");
	});

	it("should set API_TIMEOUT_MS when positive", () => {
		const model = createTestModel({
			value: {
				...createTestModel().value,
				API_TIMEOUT_MS: 30_000,
			},
		});

		const env = prepareEnvironment(model);
		expect(env.API_TIMEOUT_MS).toBe("30000");
	});

	it("should not set API_TIMEOUT_MS when zero or undefined", () => {
		const model = createTestModel({
			value: {
				...createTestModel().value,
				API_TIMEOUT_MS: 0,
			},
		});

		const env = prepareEnvironment(model);
		expect(env.API_TIMEOUT_MS).toBeUndefined();
	});

	it("should set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC when true", () => {
		const model = createTestModel({
			value: {
				...createTestModel().value,
				DISABLE_NONESSENTIAL_TRAFFIC: true,
			},
		});

		const env = prepareEnvironment(model);
		expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
	});

	it("should not set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC when false", () => {
		const model = createTestModel({
			value: {
				...createTestModel().value,
				DISABLE_NONESSENTIAL_TRAFFIC: false,
			},
		});

		const env = prepareEnvironment(model);
		expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBeUndefined();
	});

	it("should handle model with all optional fields", () => {
		const model: Model = {
			name: "full-model",
			description: "Full configuration",
			order: 1,
			isDefault: true,
			value: {
				ANTHROPIC_BASE_URL: "https://api.example.com",
				ANTHROPIC_AUTH_TOKEN: "sk-full-token",
				ANTHROPIC_MODEL: "claude-3-opus",
				ANTHROPIC_SMALL_FAST_MODEL: "claude-3-haiku",
				ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnet-model",
				ANTHROPIC_DEFAULT_OPUS_MODEL: "opus-model",
				ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-model",
				API_TIMEOUT_MS: 60_000,
				DISABLE_NONESSENTIAL_TRAFFIC: true,
			},
		};

		const env = prepareEnvironment(model);
		expect(env.ANTHROPIC_BASE_URL).toBe("https://api.example.com");
		expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-full-token");
		expect(env.ANTHROPIC_MODEL).toBe("claude-3-opus");
		expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe("claude-3-haiku");
		expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("sonnet-model");
		expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("opus-model");
		expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("haiku-model");
		expect(env.API_TIMEOUT_MS).toBe("60000");
		expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
	});
});

describe("maskToken", () => {
	it("should return empty string for empty input", () => {
		expect(maskToken("")).toBe("");
	});

	it("should not mask env: references", () => {
		expect(maskToken("env:MY_API_KEY")).toBe("env:MY_API_KEY");
		expect(maskToken("env:ANTHROPIC_TOKEN")).toBe("env:ANTHROPIC_TOKEN");
	});

	it("should fully mask short tokens", () => {
		expect(maskToken("short")).toBe("****");
		expect(maskToken("12chars12345")).toBe("****");
	});

	it("should show first and last 4 chars for longer tokens", () => {
		expect(maskToken("sk-test-12345678")).toBe("sk-t...5678");
		// "this-is-a-very-long-api-key" - last 4 chars are "-key"
		expect(maskToken("this-is-a-very-long-api-key")).toBe("this...-key");
	});

	it("should handle exactly 13 character tokens", () => {
		// 13 chars: should show first 4 ... last 4
		expect(maskToken("1234567890123")).toBe("1234...0123");
	});

	it("should handle exactly 12 character tokens", () => {
		// 12 chars: should be fully masked
		expect(maskToken("123456789012")).toBe("****");
	});
});

describe("formatModelInfo", () => {
	it("should format basic model info", () => {
		const model = createTestModel();
		const info = formatModelInfo(model);

		expect(info).toContain("Name: test-model");
		expect(info).toContain("Description: Test model description");
		expect(info).toContain("Endpoint: https://api.test.com");
		expect(info).toContain("Model: claude-3-opus");
	});

	it("should mask auth token in output", () => {
		const model = createTestModel();
		const info = formatModelInfo(model);

		expect(info).toContain("Auth:");
		expect(info).not.toContain("test-token-123456789");
		expect(info).toContain("test...6789"); // Masked format
	});

	it("should show (none) for empty description", () => {
		const model = createTestModel({ description: "" });
		const info = formatModelInfo(model);

		expect(info).toContain("Description: (none)");
	});

	it("should show (Default) marker for default models", () => {
		const model = createTestModel({ isDefault: true });
		const info = formatModelInfo(model);

		expect(info).toContain("(Default)");
	});

	it("should not show (Default) marker for non-default models", () => {
		const model = createTestModel({ isDefault: false });
		const info = formatModelInfo(model);

		expect(info).not.toContain("(Default)");
	});

	it("should not mask env: references in auth", () => {
		const model = createTestModel({
			value: {
				...createTestModel().value,
				ANTHROPIC_AUTH_TOKEN: "env:MY_API_KEY",
			},
		});
		const info = formatModelInfo(model);

		expect(info).toContain("Auth: env:MY_API_KEY");
	});
});
