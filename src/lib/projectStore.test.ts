import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getProjectConfig,
	readProjectsStore,
	saveProjectConfig,
	setProjectsStorePath,
} from "./projectStore";

describe("projectStore", () => {
	let tempDir: string;
	let storePath: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cclauncher-projects-"));
		storePath = path.join(tempDir, "projects.json");
		setProjectsStorePath(storePath);
	});

	afterEach(() => {
		setProjectsStorePath(null);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns an empty store when no projects file exists", () => {
		const result = readProjectsStore();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({});
		}
	});

	it("saves and reads a project config with a script", () => {
		const projectPath = "/repo/root";
		const saveResult = saveProjectConfig(projectPath, {
			postWorktreeScript: "./setup.sh",
			spawnInTerminal: true,
			terminalApp: "Warp",
		});
		expect(saveResult.ok).toBe(true);

		const readResult = getProjectConfig(projectPath);
		expect(readResult.ok).toBe(true);
		if (readResult.ok) {
			expect(readResult.data).toEqual({
				postWorktreeScript: "./setup.sh",
				spawnInTerminal: true,
				terminalApp: "Warp",
			});
		}
	});

	it("persists non-script settings without deleting the project entry", () => {
		const projectPath = "/repo/root";
		const saveResult = saveProjectConfig(projectPath, {
			spawnInTerminal: true,
			terminalApp: "Terminal",
		});
		expect(saveResult.ok).toBe(true);

		const readResult = getProjectConfig(projectPath);
		expect(readResult.ok).toBe(true);
		if (readResult.ok) {
			expect(readResult.data).toEqual({
				spawnInTerminal: true,
				terminalApp: "Terminal",
			});
		}
	});

	it("removes the project entry when no config values remain", () => {
		const projectPath = "/repo/root";
		expect(
			saveProjectConfig(projectPath, { postWorktreeScript: "./setup.sh" }).ok
		).toBe(true);
		expect(saveProjectConfig(projectPath, {}).ok).toBe(true);

		const readResult = getProjectConfig(projectPath);
		expect(readResult.ok).toBe(true);
		if (readResult.ok) {
			expect(readResult.data).toBeNull();
		}
	});
});
