import { createCliRenderer, TextAttributes, type SelectOption } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useRenderer } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FocusProvider, useFocusContext } from "./hooks/FocusProvider";
import { ModelSelection } from "./components/ModelSelection";
import { ModelDetails } from "./components/ModelDetails";
import { NewModelForm } from "./components/NewModelForm";
import { theme } from "./theme";
import { runCli, parseArgs } from "./lib/cli";
import {
  getModelList,
  saveModel as saveModelToStore,
  deleteModel as deleteModelFromStore,
  writeModels,
  migrateModels,
  type Model,
  type ModelsJson,
  modelSchema,
} from "./lib/store";
import { launchClaudeCode } from "./lib/launcher";
import { resetTerminalForChild } from "./utils/terminal";
import { getGitRepoRoot, generateWorktreePath, createDetachedWorktree, listWorktrees, type WorktreeInfo } from "./lib/git";
import { GitWorktreeSelector } from "./components/GitWorktreeSelector";
import modelsJson from "./models.json";

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

// Load models from store, with migration from in-source models.json
function loadModels(): (SelectOption & { order?: number })[] {
  // First, try to migrate in-source models if the store is empty
  const storeResult = getModelList();

  if (storeResult.ok && storeResult.data.length === 0 && Object.keys(modelsJson).length > 0) {
    // Migrate from in-source models.json
    const migrationSource: ModelsJson = {};
    for (const [key, value] of Object.entries(modelsJson)) {
      migrationSource[key] = {
        name: key,
        description: (value as any).description || "",
        order: (value as any).order,
        value: (value as any).value,
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
      .map(([key, value]) => ({
        name: key,
        description: (value as any).description || "",
        value: (value as any).value,
        order: (value as any).order,
      }))
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
  | { ok: false; reason: "validation" | "duplicate" | "read" | "write"; message: string };

const saveModel = (
  model: SelectOption,
  originalName?: string,
  options?: { allowOverwrite?: boolean }
): SaveModelResult => {
  const storeModel = selectOptionToModel(model as SelectOption & { order?: number });
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

function ModeIndicator({ moveMode, launching }: { moveMode: boolean; launching: boolean }) {
  const { editMode } = useFocusContext();
  const modeLabel = launching ? "Launching..." : moveMode ? "Move" : editMode ? "Edit" : "View";
  const modeColor = launching
    ? theme.colors.warning
    : moveMode
      ? theme.colors.success
      : editMode
        ? theme.colors.primary
        : theme.colors.secondary;

  return (
    <text attributes={TextAttributes.DIM} style={{ fg: modeColor }}>
      Mode: {modeLabel}
    </text>
  );
}

function App({ gitRepoRoot }: { gitRepoRoot: string | null }) {
  const [modelsState, setModelsState] = useState<(SelectOption & { order?: number })[]>(initialModels);
  const [selectedModel, setSelectedModel] = useState<SelectOption>(initialModels[0]!);
  const modelsStateRef = useRef(modelsState);
  const [moveMode, setMoveMode] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [selectedWorktree, setSelectedWorktree] = useState<WorktreeInfo | null>(null);
  const renderer = useRenderer();
  const isGitRepo = gitRepoRoot !== null;

  // Load worktrees on mount (when in a git repo)
  const loadWorktrees = useCallback(async () => {
    if (!gitRepoRoot) return;
    const result = await listWorktrees(gitRepoRoot);
    if (result.ok) {
      setWorktrees(result.worktrees);
      // Select the first worktree if none selected
      if (result.worktrees.length > 0) {
        setSelectedWorktree((current) => current ?? result.worktrees[0]!);
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
      const keyInput = (renderer as unknown as { keyInput?: { processPaste?: (text: string) => void } }).keyInput;
      const focused = (
        renderer as unknown as {
          currentFocusedRenderable?: {
            constructor?: { name?: string };
            value?: unknown;
            insertText?: (text: string) => void;
          };
        }
      ).currentFocusedRenderable;
      const beforeLength = typeof focused?.value === "string" ? focused.value.length : null;
      if (typeof keyInput?.processPaste === "function") {
        keyInput.processPaste(text);
      }
      const afterLength = typeof focused?.value === "string" ? focused.value.length : null;
      if (typeof focused?.insertText === "function" && beforeLength !== null && afterLength === beforeLength) {
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

  const persistModelOrder = useCallback((nextModels: (SelectOption & { order?: number })[]) => {
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
  }, []);

  const handleMoveModel = useCallback((fromIndex: number, direction: "up" | "down") => {
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
      next.splice(toIndex, 0, moved!);
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
  }, []);

  const handleReorderEnd = useCallback(() => {
    persistModelOrder(modelsStateRef.current);
  }, [persistModelOrder]);

  // Launch Claude Code with selected model
  const handleLaunch = useCallback(
    async (model: SelectOption, options?: { useWorktree?: boolean }) => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e9da0001-9545-4aee-8bfe-0a658987fe33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/index.tsx:handleLaunch:entry',message:'handleLaunch entry',data:{modelName:model.name,useWorktree:options?.useWorktree},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      setLaunching(true);

      // Exit TUI before spawning Claude Code
      renderer.destroy();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e9da0001-9545-4aee-8bfe-0a658987fe33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/index.tsx:handleLaunch:afterDestroy',message:'renderer.destroy called',data:{destroyCalled:true},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion

      // Reset terminal input state so Claude Code inherits a clean TTY
      resetTerminalForChild();

      // Handle worktree creation if requested
      let launchCwd: string | undefined;
      if (options?.useWorktree && gitRepoRoot) {
        const worktreePath = generateWorktreePath(gitRepoRoot);
        console.log(`\nCreating worktree at: ${worktreePath}`);
        const worktreeResult = await createDetachedWorktree(gitRepoRoot, worktreePath);
        if (!worktreeResult.ok) {
          console.error(`\nError creating worktree: ${worktreeResult.message}`);
          process.exit(1);
        }
        launchCwd = worktreeResult.path;
        console.log(`Worktree created successfully.`);
      }

      console.log(`\nLaunching Claude Code with model: ${model.name}`);
      console.log(`Endpoint: ${(model.value as Model["value"]).ANTHROPIC_BASE_URL}`);
      if (launchCwd) {
        console.log(`Working directory: ${launchCwd}`);
      }
      console.log("");

      const storeModel = selectOptionToModel(model as SelectOption & { order?: number });
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
          setSelectedModel(next[nextIndex]!);
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

      const storeModel = selectOptionToModel(selectedModel as SelectOption & { order?: number });
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
    if (!gitRepoRoot) return;

    setLaunching(true);
    renderer.destroy();
    resetTerminalForChild();

    const worktreePath = generateWorktreePath(gitRepoRoot);
    console.log(`\nCreating worktree at: ${worktreePath}`);

    const worktreeResult = await createDetachedWorktree(gitRepoRoot, worktreePath);
    if (!worktreeResult.ok) {
      console.error(`\nError creating worktree: ${worktreeResult.message}`);
      process.exit(1);
    }

    console.log(`Worktree created successfully.`);
    console.log(`Model: ${selectedModel.name}`);
    console.log("");

    const storeModel = selectOptionToModel(selectedModel as SelectOption & { order?: number });
    const result = await launchClaudeCode(storeModel, { cwd: worktreeResult.path });

    if (!result.ok) {
      console.error(`\nError: ${result.message}`);
      process.exit(1);
    }
    process.exit(result.exitCode);
  }, [renderer, gitRepoRoot, selectedModel]);

  return (
    <FocusProvider order={["model_selection", "worktree_selection"]}>
      <box alignItems="center" justifyContent="center" flexGrow={1}>
        <box justifyContent="center" alignItems="flex-end">
          <ascii-font font="tiny" text="CCLauncher" />
          <text attributes={TextAttributes.DIM}>What will you build?</text>
        </box>
        <box
          justifyContent="center"
          alignItems="flex-start"
          flexDirection="row"
          gap={1}
          width="100%"
          height="100%"
        >
          <ModelSelection
            models={modelsState}
            onSelect={setSelectedModel}
            selectedModel={selectedModel}
            onMove={handleMoveModel}
            onReorderEnd={handleReorderEnd}
            moveMode={moveMode}
            onMoveModeChange={setMoveMode}
            onLaunch={handleLaunch}
            onDelete={handleDelete}
            isGitRepo={isGitRepo}
          />
          <ModelDetails model={selectedModel} onSave={saveModel} />
          <NewModelForm />
          {isGitRepo && (
            <GitWorktreeSelector
              worktrees={worktrees}
              selectedWorktree={selectedWorktree}
              onSelect={setSelectedWorktree}
              onLaunch={handleWorktreeLaunch}
              onCreateNew={handleCreateWorktreeAndLaunch}
              onRefresh={loadWorktrees}
              selectedModelName={selectedModel.name}
            />
          )}
        </box>
      </box>
      <box justifyContent="center" alignItems="flex-start" flexDirection="row" gap={1}>
        <text attributes={TextAttributes.DIM}>[n] New</text>
        <text attributes={TextAttributes.DIM}>·</text>
        <text attributes={TextAttributes.DIM}>[e] Edit</text>
        <text attributes={TextAttributes.DIM}>·</text>
        <text attributes={TextAttributes.DIM}>[Enter] Launch</text>
        {isGitRepo && <text attributes={TextAttributes.DIM}>·</text>}
        {isGitRepo && <text attributes={TextAttributes.DIM}>[w] New Worktree</text>}
        {isGitRepo && <text attributes={TextAttributes.DIM}>·</text>}
        {isGitRepo && <text attributes={TextAttributes.DIM}>[g] Git Worktrees</text>}
        <text attributes={TextAttributes.DIM}>·</text>
        <text attributes={TextAttributes.DIM}>[↑↓] Navigate</text>
        <text attributes={TextAttributes.DIM}>·</text>
        <text attributes={TextAttributes.DIM}>[Esc] Exit Edit</text>
        <text attributes={TextAttributes.DIM}>·</text>
        <ModeIndicator moveMode={moveMode} launching={launching} />
      </box>
    </FocusProvider>
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
