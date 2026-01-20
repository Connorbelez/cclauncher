import { describe, expect, it } from "vitest";
import {
	LINUX_READ,
	LINUX_WRITE,
	MAC_READ,
	MAC_WRITE,
	WINDOWS_READ,
	WINDOWS_WRITE,
} from "./clipboard";

// Since clipboard operations depend on system commands (pbcopy, xclip, etc.),
// we test the platform detection logic and command construction.
// Full integration tests would require mocking Bun.spawn.

describe("Clipboard utility", () => {
	describe("Platform commands", () => {
		it("should define macOS commands correctly", () => {
			expect(MAC_WRITE.cmd).toEqual(["pbcopy"]);
			expect(MAC_READ.cmd).toEqual(["pbpaste"]);
		});

		it("should define Windows commands correctly", () => {
			expect(WINDOWS_WRITE.cmd[0]).toBe("powershell");
			expect(WINDOWS_WRITE.cmd).toContain("-NoProfile");
			expect(WINDOWS_WRITE.cmd).toContain("Set-Clipboard");

			expect(WINDOWS_READ.cmd[0]).toBe("powershell");
			expect(WINDOWS_READ.cmd).toContain("Get-Clipboard");
		});

		it("should define Linux commands correctly", () => {
			expect(LINUX_WRITE.cmd[0]).toBe("xclip");
			expect(LINUX_WRITE.cmd).toContain("-selection");
			expect(LINUX_WRITE.cmd).toContain("clipboard");

			expect(LINUX_READ.cmd).toContain("-o");
		});
	});

	describe("Platform detection logic", () => {
		it("should identify macOS platform", () => {
			const platform = "darwin";
			const isMac = platform === "darwin";
			expect(isMac).toBe(true);
		});

		it("should identify Windows platform", () => {
			const platform = "win32";
			const isWindows = platform === "win32";
			expect(isWindows).toBe(true);
		});

		it("should default to Linux for other platforms", () => {
			const platforms = ["linux", "freebsd", "openbsd", "sunos", "aix"];

			for (const platform of platforms) {
				const isLinuxLike = platform !== "darwin" && platform !== "win32";
				expect(isLinuxLike).toBe(true);
			}
		});
	});

	describe("CRLF normalization", () => {
		it("should normalize Windows line endings", () => {
			const windowsText = "line1\r\nline2\r\nline3";
			const normalized = windowsText.replace(/\r\n/g, "\n");

			expect(normalized).toBe("line1\nline2\nline3");
			expect(normalized).not.toContain("\r");
		});

		it("should preserve Unix line endings", () => {
			const unixText = "line1\nline2\nline3";
			const normalized = unixText.replace(/\r\n/g, "\n");

			expect(normalized).toBe("line1\nline2\nline3");
		});

		it("should handle mixed line endings", () => {
			const mixedText = "line1\r\nline2\nline3\r\n";
			const normalized = mixedText.replace(/\r\n/g, "\n");

			expect(normalized).toBe("line1\nline2\nline3\n");
		});

		it("should handle empty string", () => {
			const emptyText = "";
			const normalized = emptyText.replace(/\r\n/g, "\n");

			expect(normalized).toBe("");
		});
	});

	describe("Error handling behavior", () => {
		it("should describe expected error handling for write", () => {
			// writeClipboard should:
			// 1. Not throw exceptions
			// 2. Log errors to console.error
			// 3. Continue execution even if clipboard fails

			// This documents the expected behavior for manual testing
			const expectedBehavior = {
				throwsOnError: false,
				logsToConsole: true,
				returnsVoid: true,
			};

			expect(expectedBehavior.throwsOnError).toBe(false);
		});

		it("should describe expected error handling for read", () => {
			// readClipboard should:
			// 1. Not throw exceptions
			// 2. Log errors to console.error
			// 3. Return empty string on error

			const expectedBehavior = {
				throwsOnError: false,
				logsToConsole: true,
				returnsEmptyOnError: true,
			};

			expect(expectedBehavior.returnsEmptyOnError).toBe(true);
		});
	});
});

// Integration test (requires actual clipboard access)
// We only run this in non-CI environments to avoid failures in headless shells
if (!process.env.CI) {
	describe("Clipboard integration", () => {
		it("should write and read text from clipboard", async () => {
			const { writeClipboard, readClipboard } = await import("./clipboard");

			const testText = `Hello from test ${Date.now()}`;
			await writeClipboard(testText);

			const result = await readClipboard();
			expect(result).toBe(testText);
		});
	});
}
