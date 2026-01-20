import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useState } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";

export type ModelSelectionProps = {
  models: SelectOption[];
  onSelect: (model: SelectOption) => void;
  selectedModel: SelectOption;
  onMove: (fromIndex: number, direction: "up" | "down") => void;
  onReorderEnd: () => void;
  moveMode: boolean;
  onMoveModeChange: (moveMode: boolean) => void;
  onLaunch?: (model: SelectOption, options?: { useWorktree?: boolean }) => void;
  onDelete?: (model: SelectOption) => void;
  isGitRepo?: boolean;
};

export function ModelSelection({
  models,
  onSelect,
  selectedModel,
  onMove,
  onReorderEnd,
  moveMode,
  onMoveModeChange,
  onLaunch,
  onDelete,
  isGitRepo,
}: ModelSelectionProps) {
  const { isFocused, focusedId, editMode } = useFocusState("model_selection");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [worktreeMode, setWorktreeMode] = useState(false);

  const selectedIndex = useMemo(() => {
    const index = models.findIndex(
      (model) => model.name === selectedModel.name
    );
    return index === -1 ? 0 : index;
  }, [models, selectedModel.name]);

  useKeyboard((key) => {
    if (!isFocused) {
      return;
    }

    // Handle delete confirmation
    if (confirmDelete) {
      if (key.name === "y" || key.name === "return") {
        onDelete?.(selectedModel);
        setConfirmDelete(false);
      } else if (key.name === "n" || key.name === "escape") {
        setConfirmDelete(false);
      }
      return;
    }

    if (key.name === "m") {
      onMoveModeChange(!moveMode);
      if (moveMode) {
        onReorderEnd();
      }
      return;
    }

    // Toggle worktree mode with 'w' (only when in a git repo)
    if (key.name === "w" && isGitRepo && !moveMode) {
      setWorktreeMode(!worktreeMode);
      return;
    }

    if (moveMode && (key.name === "return" || key.name === "escape")) {
      onMoveModeChange(false);
      onReorderEnd();
      return;
    }

    // Exit worktree mode on Escape
    if (worktreeMode && key.name === "escape") {
      setWorktreeMode(false);
      return;
    }

    // Launch on Enter when not in move mode
    if (!moveMode && key.name === "return" && onLaunch) {
      onLaunch(selectedModel, { useWorktree: worktreeMode });
      if (worktreeMode) {
        setWorktreeMode(false);
      }
      return;
    }

    // Delete on 'd' when not in move mode
    if (!moveMode && key.name === "d" && onDelete) {
      setConfirmDelete(true);
      return;
    }

    if (!moveMode) {
      return;
    }

    if (key.name === "up") {
      onMove(selectedIndex, "up");
    }

    if (key.name === "down") {
      onMove(selectedIndex, "down");
    }
  });

  if (focusedId !== "model_selection" && focusedId !== "model_details") {
    return null;
  }

  const isActive = isFocused;
  const selectFocused = isFocused && !moveMode;
  const borderColor = worktreeMode
    ? theme.colors.warning
    : moveMode
      ? theme.colors.success
      : editMode
        ? theme.colors.primary
        : theme.colors.secondary;

  return (
    <box flexDirection="column" style={{ width: "100%", height: "80%" }}>
      <scrollbox
        title="Model Selection"
        style={{
          width: "100%",
          height: "100%",
          border: true,
          borderStyle: isActive ? "double" : "rounded",
          borderColor: borderColor,
          rootOptions: {
            backgroundColor: theme.colors.surface,
          },
          wrapperOptions: {
            backgroundColor: theme.colors.surfaceHighlight,
          },
          viewportOptions: {
            backgroundColor: theme.colors.background,
          },
          contentOptions: {
            backgroundColor: theme.colors.background,
          },
          scrollbarOptions: {
            showArrows: true,
            trackOptions: {
              foregroundColor: theme.colors.primary,
              backgroundColor: theme.colors.border,
            },
          },
        }}
      >
        <select
          focused={selectFocused}
          selectedIndex={selectedIndex}
          style={{
            width: "100%",
            height: "100%",
            selectedTextColor: theme.colors.primary,
            backgroundColor: theme.colors.background,
            selectedBackgroundColor: theme.colors.surfaceHighlight,
          }}
          onChange={(index) => {
            onSelect(models[index]!);
          }}
          onSelect={(index) => {
            onSelect(models[index]!);
          }}
          options={models}
        />
      </scrollbox>
      {/* Keyboard hints */}
      <box
        style={{
          paddingLeft: 1,
          paddingTop: 0,
          height: 1,
        }}
      >
        <text
          style={{
            fg: confirmDelete
              ? theme.colors.error
              : worktreeMode
                ? theme.colors.warning
                : theme.colors.text.muted,
          }}
        >
          {confirmDelete
            ? `Delete "${selectedModel.name}"? [y] Yes  [n/Esc] Cancel`
            : isActive
              ? moveMode
                ? "[↑↓] Move  [m/Enter/Esc] Save & Exit"
                : worktreeMode
                  ? "[Enter] Launch in Worktree  [w/Esc] Cancel"
                  : isGitRepo
                    ? "[↑↓] Navigate  [Enter] Launch  [w] Worktree  [m] Reorder  [d] Delete"
                    : "[↑↓] Navigate  [Enter] Launch  [m] Reorder  [d] Delete"
              : "[Tab] Focus"}
        </text>
      </box>
    </box>
  );
}
