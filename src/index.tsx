import { createCliRenderer, type SelectOption } from "@opentui/core";
import { createRoot, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GitWorktreeSelector } from "./components/GitWorktreeSelector";
import { Header } from "./components/Header";
import { ModelDetails } from "./components/ModelDetails";
import { ModelSelection } from "./components/ModelSelection";
import { NewModelForm } from "./components/NewModelForm";
import { StatusBar } from "./components/StatusBar";
import { FocusProvider, useFocusContext } from "./hooks/FocusProvider";
import { useTerminalSize } from "./hooks/useTerminalSize";
import { parseArgs, runCli } from "./lib/cli";
import {
	createDetachedWorktree,
	generateWorktreePath,
	getGitRepoRoot,
	listWorktrees,
	type WorktreeInfo,
} from "./lib/git";
import { launchClaudeCode } from "./lib/launcher";
import {
	deleteModel as deleteModelFromStore,
	getModelList,
	type Model,
	type ModelsJson,
	migrateModels,
	modelSchema,
	saveModel as saveModelToStore,
	writeModels,
} from "./lib/store";
import modelsJson from "./models.json";
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

interface LegacyModel {
	description?: string;
	order?: number;
	value?: Model["value"];
}

/**
 * Load model entries from the persistent store, migrating in-source models.json into the store if the store is empty.
 *
 * When the store is empty and in-source models exist, attempts to migrate those models into the store and logs the migrated count.
 * If loading from the store fails, falls back to the in-source models.json.
 *
 * @returns An array of `SelectOption` objects (each may include an `order` field). When falling back to in-source models, the result is sorted by `order`.
 */
function loadModels(): (SelectOption & { order?: number })[] {
	// First, try to migrate in-source models if the store is empty
	const storeResult = getModelList();

	if (
		storeResult.ok &&
		storeResult.data.length === 0 &&
		Object.keys(modelsJson).length > 0
	) {
		// Migrate from in-source models.json
		const migrationSource: ModelsJson = {};
		for (const [key, value] of Object.entries(modelsJson)) {
			const legacyValue = value as unknown as LegacyModel;
			migrationSource[key] = {
				name: key,
				description: legacyValue.description || "",
				order: legacyValue.order,
				value: (legacyValue.value as Model["value"]) || ({} as Model["value"]),
			};
		}
		const migrateResult = migrateModels(migrationSource);
		if (migrateResult.ok) {
			console.log(`Migrated ${migrateResult.data.migrated} models to store.`);
		}
	}

	// Load from store
	const result = getModelList();
	if (!result.ok) {
		console.error(`Failed to load models: ${result.message}`);
		// Fall back to in-source models
		return Object.entries(modelsJson)
			.map(([key, value]) => {
				const legacyValue = value as unknown as LegacyModel;
				return {
					name: key,
					description: legacyValue.description || "",
					value:
						(legacyValue.value as Model["value"]) || ({} as Model["value"]),
					order: legacyValue.order,
				};
			})
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
		const errorMessages = validatedModel.error.issues.map((err) => {
			const path = err.path.join(".");
			return `${path}: ${err.message}`;
		});
		return {
			ok: false,
			reason: "validation",
			message: `Validation failed:\n${errorMessages.join("\n")}`,
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

		setLaunching(true);
		renderer.destroy();
		resetTerminalForChild();

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

	const { columns } = useTerminalSize();
	const isSmallScreen = columns < 100;

	// Use conditional focus order? No, focus order remains the same logically.
	const focusOrder = isGitRepo
		? ["model_selection", "worktree_selection", "new_model"]
		: ["model_selection", "new_model"];

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
					alignItems={isSmallScreen ? "stretch" : "flex-start"}
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
						onDelete={handleDelete}
						onLaunch={handleLaunch}
						onMove={handleMoveModel}
						onMoveModeChange={setMoveMode}
						onReorderEnd={handleReorderEnd}
						onSelect={setSelectedModel}
						selectedModel={selectedModel}
					/>
					<ModelDetails model={selectedModel} onSave={saveModel} />
					<NewModelForm />
					{isGitRepo && (
						<GitWorktreeSelector
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
				/>
			</box>
		</FocusProvider>
	);
}

/**
 * Wrapper component to access FocusContext for StatusBar.
 */
function StatusBarWrapper({
	moveMode,
	launching,
	isGitRepo,
}: {
	moveMode: boolean;
	launching: boolean;
	isGitRepo: boolean;
}) {
	const { editMode, focusedId } = useFocusContext();
	const { columns } = useTerminalSize();
	const isSmallScreen = columns < 100;

	return (
		<StatusBar
			editMode={editMode}
			focusedId={focusedId}
			isGitRepo={isGitRepo}
			launching={launching}
			moveMode={moveMode}
			isSmallScreen={isSmallScreen}
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
