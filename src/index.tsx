import { createCliRenderer, type SelectOption } from "@opentui/core";
import { createRoot, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ZodError } from "zod";
import { GitWorktreeSelector } from "./components/GitWorktreeSelector";
import { Header } from "./components/Header";
import { ModelDetails } from "./components/ModelDetails";
import { ModelSelection } from "./components/ModelSelection";
import { NewModelForm } from "./components/NewModelForm";
import { PreLaunchDialog } from "./components/PreLaunchDialog";
import { ScriptRunner } from "./components/ScriptRunner";
import { StatusBar } from "./components/StatusBar";
import { FocusProvider, useFocusContext } from "./hooks/FocusProvider";
import { useTerminalSize } from "./hooks/useTerminalSize";
import { parseArgs, runCli } from "./lib/cli";
import {
	createDetachedWorktree,
	generateWorktreePath,
	generateWorktreePathWithSuffix,
	getGitRepoRoot,
	listWorktrees,
	type WorktreeInfo,
} from "./lib/git";
import {
	buildCliArgs,
	launchClaudeCode,
	launchClaudeCodeBackground,
	type MultiLaunchOptions,
} from "./lib/launcher";
import { getProjectConfig, saveProjectConfig } from "./lib/projectStore";
import {
	deleteModel as deleteModelFromStore,
	getModel,
	getModelList,
	type Model,
	type ModelCreateInput,
	type ModelsJson,
	modelSchema,
	saveModel as saveModelToStore,
	writeModels,
} from "./lib/store";
import { resetTerminalForChild } from "./utils/terminal";

// Convert store Model to SelectOption format for compatibility with existing components
function modelToSelectOption(model: Model): SelectOption & { order?: number } {
	return {
		name: model.name,
		description: model.description || "",
		value: model.value,
		order: model.order,
	};
}

// Convert SelectOption back to Model format
function selectOptionToModel(option: SelectOption & { order?: number }): Model {
	return {
		name: option.name,
		description: option.description || "",
		order: option.order,
		value: option.value as Model["value"],
	};
}

function formatValidationError(error: ZodError<unknown>): string {
	const errorMessages = error.issues.map((err) => {
		const path = err.path.join(".");
		return `${path}: ${err.message}`;
	});
	return `Validation failed:\n${errorMessages.join("\n")}`;
}

function validateCreateInput(
	model: ModelCreateInput
):
	| { ok: true; data: SelectOption & { order?: number } }
	| { ok: false; reason: "validation"; message: string } {
	const validatedModel = modelSchema.safeParse(model);
	if (!validatedModel.success) {
		return {
			ok: false,
			reason: "validation",
			message: formatValidationError(validatedModel.error),
		};
	}
	return { ok: true, data: modelToSelectOption(validatedModel.data) };
}

/**
 * Load model entries from the persistent store (~/.claude-model-launcher/models.json).
 *
 * @returns An array of `SelectOption` objects (each may include an `order` field), sorted by order.
 */
function loadModels(): (SelectOption & { order?: number })[] {
	const result = getModelList();
	if (!result.ok) {
		console.error(`Failed to load models: ${result.message}`);
		return [];
	}

	return result.data.map(modelToSelectOption);
}

// CLI mode: check args and execute if needed
const args = process.argv.slice(2);
const cliCommand = parseArgs(args);

if (cliCommand.type !== "tui") {
	// Run CLI command and exit
	const exitCode = await runCli(args);
	process.exit(exitCode);
}

// TUI mode: load models and render
const initialModels = loadModels();

// Detect if we're in a git repository
const gitRepoRoot = await getGitRepoRoot();

if (initialModels.length === 0) {
	console.log("No models configured. Creating a sample model...");
	// Create a sample model to get started
	const sampleModel: Model = {
		name: "sample",
		description: "Sample model configuration",
		order: 1,
		value: {
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			ANTHROPIC_AUTH_TOKEN: "env:ANTHROPIC_API_KEY",
			ANTHROPIC_MODEL: "claude-opus-4-5-20251101",
			ANTHROPIC_SMALL_FAST_MODEL: "claude-sonnet-4-20250514",
			ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514",
			ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-5-20251101",
			ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-3-5-20241022",
		},
	};
	saveModelToStore(sampleModel);
	initialModels.push(modelToSelectOption(sampleModel));
}

export type SaveModelResult =
	| { ok: true }
	| {
			ok: false;
			reason: "validation" | "duplicate" | "read" | "write";
			message: string;
	  };

const saveModel = (
	model: SelectOption,
	originalName?: string,
	options?: { allowOverwrite?: boolean }
): SaveModelResult => {
	const storeModel = selectOptionToModel(
		model as SelectOption & { order?: number }
	);
	const validatedModel = modelSchema.safeParse(storeModel);
	if (!validatedModel.success) {
		return {
			ok: false,
			reason: "validation",
			message: formatValidationError(validatedModel.error),
		};
	}

	const result = saveModelToStore(validatedModel.data, {
		originalName,
		allowOverwrite: options?.allowOverwrite,
	});

	if (!result.ok) {
		return {
			ok: false,
			reason: result.reason as "validation" | "duplicate" | "read" | "write",
			message: result.message,
		};
	}

	return { ok: true };
};

/**
 * Render the main CCLauncher TUI and coordinate model, worktree, and launch workflows.
 *
 * @param gitRepoRoot - Path to the Git repository root to enable worktree features; `null` disables Git integrations.
 * @returns The root React element for the CLI text-based user interface.
 */
function App({ gitRepoRoot }: { gitRepoRoot: string | null }) {
	const [modelsState, setModelsState] =
		useState<(SelectOption & { order?: number })[]>(initialModels);
	const [selectedModel, setSelectedModel] = useState<SelectOption>(() => {
		const firstModel = initialModels[0];
		if (!firstModel) {
			throw new Error("No models available in initialModels");
		}
		return firstModel;
	});
	const modelsStateRef = useRef(modelsState);
	const [moveMode, setMoveMode] = useState(false);
	const [launching, setLaunching] = useState(false);
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [selectedWorktree, setSelectedWorktree] = useState<WorktreeInfo | null>(
		null
	);
	const [scriptRunnerState, setScriptRunnerState] = useState<{
		active: boolean;
		scriptPath: string;
		worktreePath: string;
		spawnInTerminal?: boolean;
		terminalApp?: string;
	} | null>(null);

	// Multi-select state
	const [multiSelectMode, setMultiSelectMode] = useState(false);
	const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
		new Set()
	);
	const [showPreLaunchDialog, setShowPreLaunchDialog] = useState(false);
	const [pendingLaunchModels, setPendingLaunchModels] = useState<
		SelectOption[] | null
	>(null);
	const [pendingUseWorktree, setPendingUseWorktree] = useState(false);
	const projectTerminalApp = useMemo(() => {
		if (!(gitRepoRoot && showPreLaunchDialog)) return undefined;
		const result = getProjectConfig(gitRepoRoot);
		return result.ok ? result.data?.terminalApp : undefined;
	}, [gitRepoRoot, showPreLaunchDialog]);

	const renderer = useRenderer();
	const isGitRepo = gitRepoRoot !== null;

	// Load worktrees on mount (when in a git repo)
	const loadWorktrees = useCallback(async () => {
		if (!gitRepoRoot) {
			return;
		}
		const result = await listWorktrees(gitRepoRoot);
		if (result.ok) {
			setWorktrees(result.worktrees);
			// Select the first worktree if none selected
			if (result.worktrees.length > 0) {
				setSelectedWorktree((current) => {
					if (current) return current;
					return result.worktrees[0] || null;
				});
			}
		}
	}, [gitRepoRoot]);

	// Load worktrees on initial mount
	useEffect(() => {
		if (isGitRepo) {
			loadWorktrees();
		}
	}, [isGitRepo, loadWorktrees]);

	// Handle Ctrl+C for graceful exit
	useEffect(() => {
		const keyInput = (
			renderer as unknown as {
				keyInput?: {
					on?: (event: string, handler: (data: unknown) => void) => void;
					off?: (event: string, handler: (data: unknown) => void) => void;
				};
			}
		).keyInput;
		if (!keyInput?.on) {
			return;
		}
		const onKeypress = (event: unknown) => {
			const key = event as {
				name?: string;
				ctrl?: boolean;
				meta?: boolean;
				shift?: boolean;
				super?: boolean;
				option?: boolean;
				code?: string;
			};
			if (key.name === "c" && key.ctrl && !key.shift) {
				renderer.destroy();
				process.exit(0);
				return;
			}
		};
		keyInput.on("keypress", onKeypress);
		return () => {
			keyInput.off?.("keypress", onKeypress);
		};
	}, [renderer]);

	// Handle paste events
	useEffect(() => {
		const stdinBuffer = (
			renderer as unknown as {
				_stdinBuffer?: {
					on?: (event: string, handler: (data: unknown) => void) => void;
					off?: (event: string, handler: (data: unknown) => void) => void;
				};
			}
		)._stdinBuffer;
		if (!stdinBuffer?.on) {
			return;
		}
		const onPaste = (data: unknown) => {
			const text = typeof data === "string" ? data : "";
			const keyInput = (
				renderer as unknown as {
					keyInput?: { processPaste?: (text: string) => void };
				}
			).keyInput;
			const focused = (
				renderer as unknown as {
					currentFocusedRenderable?: {
						constructor?: { name?: string };
						value?: unknown;
						insertText?: (text: string) => void;
					};
				}
			).currentFocusedRenderable;
			const beforeLength =
				typeof focused?.value === "string" ? focused.value.length : null;
			if (typeof keyInput?.processPaste === "function") {
				keyInput.processPaste(text);
			}
			const afterLength =
				typeof focused?.value === "string" ? focused.value.length : null;
			if (
				typeof focused?.insertText === "function" &&
				beforeLength !== null &&
				afterLength === beforeLength
			) {
				focused.insertText(text);
			}
		};
		stdinBuffer.on("paste", onPaste);
		return () => {
			stdinBuffer.off?.("paste", onPaste);
		};
	}, [renderer]);

	useEffect(() => {
		modelsStateRef.current = modelsState;
	}, [modelsState]);

	const persistModelOrder = useCallback(
		(nextModels: (SelectOption & { order?: number })[]) => {
			// Convert to store format and persist
			const modelsObj: ModelsJson = {};
			nextModels.forEach((model, index) => {
				modelsObj[model.name] = {
					name: model.name,
					description: model.description || "",
					order: index + 1,
					value: model.value as Model["value"],
				};
			});
			const result = writeModels(modelsObj);
			if (!result.ok) {
				console.error("Failed to persist model order:", result.message);
			}
		},
		[]
	);

	const handleSaveModel = useCallback(
		(
			model: SelectOption & { order?: number },
			originalName?: string,
			options?: { allowOverwrite?: boolean }
		): SaveModelResult => {
			const result = saveModel(model, originalName, options);
			if (!result.ok) {
				return result;
			}

			setModelsState((prev) => {
				const lookupName = originalName ?? model.name;
				const existingIndex = prev.findIndex((m) => m.name === lookupName);
				const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;
				const maxOrder = Math.max(0, ...prev.map((m) => m.order ?? 0));
				const order =
					existing?.order ??
					prev.find((m) => m.name === model.name)?.order ??
					model.order ??
					maxOrder + 1;
				const updatedModel = { ...model, order };
				let next: (SelectOption & { order?: number })[];

				if (existingIndex >= 0) {
					next = [...prev];
					next[existingIndex] = updatedModel;
					if (originalName && originalName !== model.name) {
						next = next.filter(
							(entry, index) =>
								index === existingIndex || entry.name !== model.name
						);
					}
				} else {
					next = [...prev, updatedModel];
				}

				return next;
			});

			setSelectedModel((current) => {
				if (current.name === (originalName ?? model.name)) {
					return model;
				}
				if (current.name === model.name) {
					return model;
				}
				return current;
			});

			setSelectedModelIds((prev) => {
				if (!(prev.size && originalName) || originalName === model.name) {
					return prev;
				}
				const next = new Set(prev);
				if (next.delete(originalName)) {
					next.add(model.name);
				}
				return next;
			});

			return result;
		},
		[]
	);

	const handleCreateModel = useCallback(
		(model: ModelCreateInput, options?: { allowOverwrite?: boolean }) => {
			const normalized = validateCreateInput(model);
			if (!normalized.ok) {
				return normalized;
			}
			const result = handleSaveModel(normalized.data, undefined, options);
			if (!result.ok) return result;

			// Ensure selected model has the saved/normalized value from store (order assignment, defaults, etc.)
			const saved = getModel(model.name);
			if (saved.ok) {
				setSelectedModel(modelToSelectOption(saved.data));
			}
			return result;
		},
		[handleSaveModel]
	);

	const handleMoveModel = useCallback(
		(fromIndex: number, direction: "up" | "down") => {
			setModelsState((prev) => {
				if (fromIndex < 0 || fromIndex >= prev.length) {
					return prev;
				}
				const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
				if (toIndex < 0 || toIndex >= prev.length) {
					return prev;
				}
				const next = [...prev];
				const [moved] = next.splice(fromIndex, 1);
				if (moved) {
					next.splice(toIndex, 0, moved);
				}
				const nextWithOrder = next.map((model, index) => ({
					...model,
					order: index + 1,
				}));
				const nextSelected = nextWithOrder[toIndex];
				if (!nextSelected) {
					return prev;
				}
				setSelectedModel(nextSelected);
				return nextWithOrder;
			});
		},
		[]
	);

	const handleReorderEnd = useCallback(() => {
		persistModelOrder(modelsStateRef.current);
	}, [persistModelOrder]);

	// Launch Claude Code with selected model
	const handleLaunch = useCallback(
		async (model: SelectOption, options?: { useWorktree?: boolean }) => {
			setLaunching(true);

			// Exit TUI before spawning Claude Code
			renderer.destroy();

			// Reset terminal input state so Claude Code inherits a clean TTY
			resetTerminalForChild();

			// Handle worktree creation if requested
			let launchCwd: string | undefined;
			if (options?.useWorktree && gitRepoRoot) {
				const worktreePath = generateWorktreePath(gitRepoRoot);
				console.log(`\nCreating worktree at: ${worktreePath}`);
				const worktreeResult = await createDetachedWorktree(
					gitRepoRoot,
					worktreePath
				);
				if (!worktreeResult.ok) {
					console.error(`\nError creating worktree: ${worktreeResult.message}`);
					process.exit(1);
				}
				launchCwd = worktreeResult.path;
				console.log("Worktree created successfully.");
			}

			console.log(`\nLaunching Claude Code with model: ${model.name}`);
			console.log(
				`Endpoint: ${(model.value as Model["value"]).ANTHROPIC_BASE_URL}`
			);
			if (launchCwd) {
				console.log(`Working directory: ${launchCwd}`);
			}
			console.log("");

			const storeModel = selectOptionToModel(
				model as SelectOption & { order?: number }
			);
			const result = await launchClaudeCode(storeModel, { cwd: launchCwd });

			if (!result.ok) {
				console.error(`\nError: ${result.message}`);
				process.exit(1);
			}

			process.exit(result.exitCode);
		},
		[renderer, gitRepoRoot]
	);

	// Delete a model
	const handleDelete = useCallback(
		(model: SelectOption) => {
			const result = deleteModelFromStore(model.name);
			if (!result.ok) {
				console.error(`Failed to delete model: ${result.message}`);
				return;
			}

			// Remove from local state
			setModelsState((prev) => {
				const next = prev.filter((m) => m.name !== model.name);
				// Select the next model if the deleted one was selected
				if (selectedModel.name === model.name && next.length > 0) {
					const deletedIndex = prev.findIndex((m) => m.name === model.name);
					const nextIndex = Math.min(deletedIndex, next.length - 1);
					const nextModel = next[nextIndex];
					if (nextModel) {
						setSelectedModel(nextModel);
					}
				}
				return next;
			});
		},
		[selectedModel.name]
	);

	// Launch Claude Code in an existing worktree
	const handleWorktreeLaunch = useCallback(
		async (worktree: WorktreeInfo) => {
			setLaunching(true);
			renderer.destroy();
			resetTerminalForChild();

			console.log(`\nLaunching Claude Code in worktree: ${worktree.path}`);
			console.log(`Branch: ${worktree.branch || "(detached)"}`);
			console.log(`Model: ${selectedModel.name}`);
			console.log("");

			const storeModel = selectOptionToModel(
				selectedModel as SelectOption & { order?: number }
			);
			const result = await launchClaudeCode(storeModel, { cwd: worktree.path });

			if (!result.ok) {
				console.error(`\nError: ${result.message}`);
				process.exit(1);
			}
			process.exit(result.exitCode);
		},
		[renderer, selectedModel]
	);

	// Create a new worktree and launch Claude Code in it
	const handleCreateWorktreeAndLaunch = useCallback(async () => {
		if (!gitRepoRoot) {
			return;
		}

		const worktreePath = generateWorktreePath(gitRepoRoot);

		// Create the worktree first (this happens within the TUI)
		const worktreeResult = await createDetachedWorktree(
			gitRepoRoot,
			worktreePath
		);
		if (!worktreeResult.ok) {
			// Show error in TUI (could add an error state for this)
			console.error(`Error creating worktree: ${worktreeResult.message}`);
			return;
		}

		// Check if there's a post-worktree setup script configured
		const projectConfig = getProjectConfig(gitRepoRoot);
		if (projectConfig.ok && projectConfig.data?.postWorktreeScript) {
			// Show the script runner UI
			setScriptRunnerState({
				active: true,
				scriptPath: projectConfig.data.postWorktreeScript,
				worktreePath: worktreeResult.path,
				spawnInTerminal: projectConfig.data.spawnInTerminal,
				terminalApp: projectConfig.data.terminalApp,
			});
			return;
		}

		// No script configured, launch directly
		setLaunching(true);
		renderer.destroy();
		resetTerminalForChild();

		console.log(`\nCreating worktree at: ${worktreePath}`);
		console.log("Worktree created successfully.");
		console.log(`Model: ${selectedModel.name}`);
		console.log("");

		const storeModel = selectOptionToModel(
			selectedModel as SelectOption & { order?: number }
		);
		const result = await launchClaudeCode(storeModel, {
			cwd: worktreeResult.path,
		});

		if (!result.ok) {
			console.error(`\nError: ${result.message}`);
			process.exit(1);
		}
		process.exit(result.exitCode);
	}, [renderer, gitRepoRoot, selectedModel]);

	// Handle script runner completion
	const handleScriptComplete = useCallback(() => {
		if (!scriptRunnerState) return;

		setLaunching(true);
		renderer.destroy();
		resetTerminalForChild();

		console.log(`\nWorktree: ${scriptRunnerState.worktreePath}`);
		console.log(`Model: ${selectedModel.name}`);
		console.log("");

		const storeModel = selectOptionToModel(
			selectedModel as SelectOption & { order?: number }
		);
		launchClaudeCode(storeModel, {
			cwd: scriptRunnerState.worktreePath,
		})
			.then((result) => {
				if (!result.ok) {
					console.error(`\nError: ${result.message}`);
					process.exit(1);
				}
				process.exit(result.exitCode);
			})
			.catch((error) => {
				console.error("\nUnexpected error launching Claude Code:", error);
				process.exit(1);
			});
	}, [renderer, scriptRunnerState, selectedModel]);

	// Handle script runner abort
	const handleScriptAbort = useCallback(() => {
		setScriptRunnerState(null);
	}, []);

	// Multi-select handlers
	const handleToggleModelSelection = useCallback((modelName: string) => {
		setSelectedModelIds((prev) => {
			const next = new Set(prev);
			if (next.has(modelName)) {
				next.delete(modelName);
			} else {
				next.add(modelName);
			}
			return next;
		});
	}, []);

	const handleSelectAll = useCallback(() => {
		setSelectedModelIds(new Set(modelsState.map((m) => m.name)));
	}, [modelsState]);

	const handleClearAllSelections = useCallback(() => {
		setSelectedModelIds(new Set());
	}, []);

	const handleMultiSelectModeChange = useCallback((enabled: boolean) => {
		setMultiSelectMode(enabled);
		if (!enabled) {
			setSelectedModelIds(new Set());
		}
	}, []);

	// Opens the pre-launch dialog for multi-model launch
	const handleMultiLaunchRequest = useCallback(
		(models: SelectOption[], options?: { useWorktree?: boolean }) => {
			setPendingLaunchModels(models);
			setPendingUseWorktree(options?.useWorktree ?? false);
			setShowPreLaunchDialog(true);
		},
		[]
	);

	// Execute multi-model launch
	const executeMultiLaunch = useCallback(
		async (options: MultiLaunchOptions & { terminalApp?: string }) => {
			if (!pendingLaunchModels || pendingLaunchModels.length === 0) {
				return;
			}

			setShowPreLaunchDialog(false);
			setLaunching(true);

			if (gitRepoRoot) {
				const configResult = getProjectConfig(gitRepoRoot);
				if (configResult.ok) {
					const existing = configResult.data ?? {};
					const normalizedTerminalApp =
						options.terminalApp?.trim() || undefined;
					const saveResult = saveProjectConfig(gitRepoRoot, {
						postWorktreeScript: existing.postWorktreeScript,
						spawnInTerminal: existing.spawnInTerminal,
						terminalApp: normalizedTerminalApp,
					});
					if (!saveResult.ok) {
						console.error(
							`Failed to persist terminal selection: ${saveResult.message}`
						);
					}
				}
			}

			// Exit TUI before spawning Claude Code instances
			renderer.destroy();
			resetTerminalForChild();

			const cliArgs = buildCliArgs(options);
			const modelCount = pendingLaunchModels.length;

			console.log(`\nLaunching ${modelCount} Claude Code instance(s)...`);
			if (options.initialPrompt) {
				console.log(`Initial prompt: "${options.initialPrompt}"`);
			}
			if (options.permissionMode !== "default") {
				console.log(`Permission mode: ${options.permissionMode}`);
			}
			if (options.terminalApp) {
				console.log(`Terminal: ${options.terminalApp}`);
			}
			console.log("");

			// Create worktrees if needed and launch each instance
			const launchResults: { model: string; ok: boolean; error?: string }[] =
				[];

			for (const model of pendingLaunchModels) {
				let launchCwd: string | undefined;

				// Create worktree if worktree mode is enabled
				if (pendingUseWorktree && gitRepoRoot) {
					const worktreePath = generateWorktreePathWithSuffix(
						gitRepoRoot,
						model.name
					);
					console.log(`Creating worktree for ${model.name}: ${worktreePath}`);
					const worktreeResult = await createDetachedWorktree(
						gitRepoRoot,
						worktreePath
					);
					if (!worktreeResult.ok) {
						console.error(
							`  Error creating worktree: ${worktreeResult.message}`
						);
						launchResults.push({
							model: model.name,
							ok: false,
							error: worktreeResult.message,
						});
						continue;
					}
					launchCwd = worktreeResult.path;
				}

				// Launch Claude Code in background
				const storeModel = selectOptionToModel(
					model as SelectOption & { order?: number }
				);
				console.log(
					`Launching: ${model.name}${launchCwd ? ` in ${launchCwd}` : ""}`
				);

				const result = await launchClaudeCodeBackground(storeModel, {
					cwd: launchCwd,
					cliArgs,
					terminalApp: options.terminalApp,
				});

				launchResults.push({
					model: model.name,
					ok: result.ok,
					error: result.ok ? undefined : result.message,
				});
			}

			// Report results
			const successCount = launchResults.filter((r) => r.ok).length;
			console.log(
				`\nLaunched ${successCount}/${modelCount} instance(s) successfully.`
			);

			if (successCount < modelCount) {
				const failures = launchResults.filter((r) => !r.ok);
				for (const failure of failures) {
					console.error(`  ${failure.model}: ${failure.error}`);
				}
			}

			// Exit - processes run independently
			process.exit(0);
		},
		[pendingLaunchModels, pendingUseWorktree, gitRepoRoot, renderer]
	);

	// Cancel multi-launch dialog
	const handleMultiLaunchCancel = useCallback(() => {
		setShowPreLaunchDialog(false);
		setPendingLaunchModels(null);
		setPendingUseWorktree(false);
	}, []);

	const { columns } = useTerminalSize();
	const isSmallScreen = columns < 100;

	// Use conditional focus order? No, focus order remains the same logically.
	const focusOrder = isGitRepo
		? ["model_selection", "worktree_selection"]
		: ["model_selection"];

	// Show script runner when active
	if (scriptRunnerState?.active && gitRepoRoot) {
		return (
			<FocusProvider order={[]}>
				<box
					flexDirection="column"
					flexGrow={1}
					style={{ width: "100%", height: "100%", padding: 1 }}
				>
					<Header />
					<ScriptRunner
						onAbort={handleScriptAbort}
						onComplete={handleScriptComplete}
						projectPath={gitRepoRoot}
						scriptPath={scriptRunnerState.scriptPath}
						spawnInTerminal={scriptRunnerState.spawnInTerminal}
						terminalApp={scriptRunnerState.terminalApp}
						workingDirectory={scriptRunnerState.worktreePath}
					/>
				</box>
			</FocusProvider>
		);
	}

	return (
		<FocusProvider order={focusOrder}>
			<box
				flexDirection="column"
				flexGrow={1}
				style={{ width: "100%", height: "100%" }}
			>
				{/* Header */}
				<Header />

				{/* Main Content Area */}
				<box
					alignItems="stretch"
					flexDirection={isSmallScreen ? "column" : "row"}
					flexGrow={1}
					gap={1}
					justifyContent="center"
					style={{ width: "100%", paddingLeft: 1, paddingRight: 1 }}
				>
					<ModelSelection
						isGitRepo={isGitRepo}
						models={modelsState}
						moveMode={moveMode}
						multiSelectMode={multiSelectMode}
						onClearAllSelections={handleClearAllSelections}
						onDelete={handleDelete}
						onLaunch={handleLaunch}
						onMove={handleMoveModel}
						onMoveModeChange={setMoveMode}
						onMultiLaunch={handleMultiLaunchRequest}
						onMultiSelectModeChange={handleMultiSelectModeChange}
						onReorderEnd={handleReorderEnd}
						onSelect={setSelectedModel}
						onSelectAll={handleSelectAll}
						onToggleModelSelection={handleToggleModelSelection}
						selectedModel={selectedModel}
						selectedModelIds={selectedModelIds}
					/>
					<ModelDetails model={selectedModel} onSave={handleSaveModel} />
					<NewModelForm onSave={handleCreateModel} />
					{isGitRepo && gitRepoRoot && (
						<GitWorktreeSelector
							gitRepoRoot={gitRepoRoot}
							onCreateNew={handleCreateWorktreeAndLaunch}
							onLaunch={handleWorktreeLaunch}
							onRefresh={loadWorktrees}
							onSelect={setSelectedWorktree}
							selectedModelName={selectedModel.name}
							selectedWorktree={selectedWorktree}
							worktrees={worktrees}
						/>
					)}
				</box>

				{/* Status Bar */}
				<StatusBarWrapper
					isGitRepo={isGitRepo}
					launching={launching}
					moveMode={moveMode}
					multiSelectMode={multiSelectMode}
					selectionCount={selectedModelIds.size}
				/>

				{/* Pre-Launch Dialog for multi-model launch */}
				{showPreLaunchDialog && pendingLaunchModels && (
					<PreLaunchDialogWrapper
						isOpen={showPreLaunchDialog}
						onCancel={handleMultiLaunchCancel}
						onLaunch={executeMultiLaunch}
						projectTerminalApp={projectTerminalApp}
						selectedModels={pendingLaunchModels}
						useWorktree={pendingUseWorktree}
					/>
				)}
			</box>
		</FocusProvider>
	);
}

/**
 * Wrapper for PreLaunchDialog that ensures modal state is reset on cancel.
 */
function PreLaunchDialogWrapper(props: {
	isOpen: boolean;
	selectedModels: SelectOption[];
	useWorktree: boolean;
	projectTerminalApp?: string;
	onLaunch: (options: MultiLaunchOptions & { terminalApp?: string }) => void;
	onCancel: () => void;
}) {
	const { setModalOpen, setInPreLaunchDialog } = useFocusContext();
	const onCancelRef = useRef(props.onCancel);
	onCancelRef.current = props.onCancel;

	// Ensure modal state is set on mount and reset on unmount
	useEffect(() => {
		setModalOpen(true);
		setInPreLaunchDialog(true);
		return () => {
			setModalOpen(false);
			setInPreLaunchDialog(false);
		};
	}, [setModalOpen, setInPreLaunchDialog]);

	const handleCancel = useCallback(() => {
		setModalOpen(false);
		setInPreLaunchDialog(false);
		onCancelRef.current();
	}, [setModalOpen, setInPreLaunchDialog]);

	return (
		<PreLaunchDialog
			isOpen={props.isOpen}
			onCancel={handleCancel}
			onLaunch={props.onLaunch}
			projectTerminalApp={props.projectTerminalApp}
			selectedModels={props.selectedModels}
			useWorktree={props.useWorktree}
		/>
	);
}

/**
 * Wrapper component to access FocusContext for StatusBar.
 */
function StatusBarWrapper({
	moveMode,
	launching,
	isGitRepo,
	multiSelectMode,
	selectionCount,
}: {
	moveMode: boolean;
	launching: boolean;
	isGitRepo: boolean;
	multiSelectMode?: boolean;
	selectionCount?: number;
}) {
	const { editMode, focusedId } = useFocusContext();
	const { columns } = useTerminalSize();
	const isSmallScreen = columns < 100;

	return (
		<StatusBar
			editMode={editMode}
			focusedId={focusedId}
			isGitRepo={isGitRepo}
			isSmallScreen={isSmallScreen}
			launching={launching}
			moveMode={moveMode}
			multiSelectMode={multiSelectMode}
			selectionCount={selectionCount}
		/>
	);
}

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	useKittyKeyboard: {
		disambiguate: true,
		alternateKeys: true,
		events: true,
		allKeysAsEscapes: false,
		reportText: false,
	},
});
createRoot(renderer).render(<App gitRepoRoot={gitRepoRoot} />);
