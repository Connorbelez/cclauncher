import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";
import type { WorktreeInfo } from "@/lib/git";

export type GitWorktreeSelectorProps = {
  worktrees: WorktreeInfo[];
  selectedWorktree: WorktreeInfo | null;
  onSelect: (worktree: WorktreeInfo) => void;
  onLaunch: (worktree: WorktreeInfo) => void;
  onCreateNew: () => void;
  onRefresh: () => void;
  /** Name of the currently selected model (for display) */
  selectedModelName: string;
};

/**
 * Format diff stats for display (e.g., "+5/-10" or "✓" for clean).
 */
function formatDiffStats(stats: WorktreeInfo["diffStats"]): string {
  if (!stats) return "";
  if (stats.additions === 0 && stats.deletions === 0) return "✓";
  return `+${stats.additions}/-${stats.deletions}`;
}

/**
 * Constructs a select-list option that represents a worktree entry.
 *
 * The option's `name` contains a branch marker and branch label with diff stats aligned to the right; the `description` shows a truncated or special-path label and the short commit head, and `value` is the original worktree object.
 *
 * @param worktree - The worktree to format into a select option
 * @returns The SelectOption object to render in the worktree list
 */
function formatWorktreeOption(worktree: WorktreeInfo): SelectOption {
  const marker = worktree.isMain ? "★" : " ";
  const branchDisplay = worktree.branch || "(detached)";
  const pathDisplay = worktree.isMain
    ? "(main worktree)"
    : truncatePath(worktree.relativePath, 25);

  // Build name with diff stats right-aligned
  const leftPart = `${marker} ${branchDisplay}`;
  const statsDisplay = formatDiffStats(worktree.diffStats);

  // Pad to create right-aligned stats (assuming ~50 char width)
  const totalWidth = 45;
  const paddingNeeded = Math.max(
    1,
    totalWidth - leftPart.length - statsDisplay.length
  );
  const name = statsDisplay
    ? `${leftPart}${" ".repeat(paddingNeeded)}${statsDisplay}`
    : leftPart;

  return {
    name,
    description: `${pathDisplay}  ${worktree.headShort}`,
    value: worktree,
  };
}

/**
 * Truncate a path from the left with "..." prefix if too long.
 */
function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return "..." + path.slice(-(maxLen - 3));
}

/**
 * Render a selectable list of Git worktrees with keyboard shortcuts for launching, creating, refreshing, and navigating back.
 *
 * @param worktrees - Array of available worktrees to display.
 * @param selectedWorktree - Currently selected worktree (used to set the initial selection).
 * @param onSelect - Callback invoked when the user selects a worktree from the list.
 * @param onLaunch - Callback invoked to launch the currently selected worktree.
 * @param onCreateNew - Callback invoked to create a new worktree.
 * @param onRefresh - Callback invoked to refresh the worktree list.
 * @param selectedModelName - Human-readable model name shown in the selector title.
 * @returns The rendered worktree selector UI, or `null` when the component is not focused for worktree selection.
 */
export function GitWorktreeSelector({
  worktrees,
  selectedWorktree,
  onSelect,
  onLaunch,
  onCreateNew,
  onRefresh,
  selectedModelName,
}: GitWorktreeSelectorProps) {
  const { isFocused, focusedId, setFocusedId } =
    useFocusState("worktree_selection");

  // Find the selected index
  const selectedIndex = useMemo(() => {
    if (!selectedWorktree) return 0;
    const index = worktrees.findIndex((w) => w.path === selectedWorktree.path);
    return index === -1 ? 0 : index;
  }, [worktrees, selectedWorktree]);

  // Convert worktrees to select options
  const options = useMemo(
    () => worktrees.map(formatWorktreeOption),
    [worktrees]
  );

  useKeyboard((key) => {
    if (!isFocused) return;

    // Launch in selected worktree
    if (key.name === "return" && selectedWorktree) {
      onLaunch(selectedWorktree);
      return;
    }

    // Create new worktree and launch
    if (key.name === "n") {
      onCreateNew();
      return;
    }

    // Refresh worktree list
    if (key.name === "r") {
      onRefresh();
      return;
    }

    // Return to model selection
    if (key.name === "g" || key.name === "escape") {
      setFocusedId("model_selection");
      return;
    }
  });

  // Only render when focused on worktree_selection
  if (focusedId !== "worktree_selection") {
    return null;
  }

  const isActive = isFocused;
  const borderColor = theme.colors.primary;

  // Empty state: no worktrees at all (shouldn't happen - main always exists)
  if (worktrees.length === 0) {
    return (
      <box flexDirection="column" style={{ width: "100%", height: "80%" }}>
        <scrollbox
          title={`Git Worktrees · Model: ${selectedModelName}`}
          style={{
            width: "100%",
            height: "100%",
            border: true,
            borderStyle: isActive ? "double" : "rounded",
            borderColor: borderColor,
            rootOptions: { backgroundColor: theme.colors.surface },
            wrapperOptions: { backgroundColor: theme.colors.surfaceHighlight },
            viewportOptions: { backgroundColor: theme.colors.background },
            contentOptions: { backgroundColor: theme.colors.background },
          }}
        >
          <box padding={1} flexDirection="column" gap={1}>
            <text style={{ fg: theme.colors.text.secondary }}>
              No worktrees found.
            </text>
            <text style={{ fg: theme.colors.text.muted }}>
              Press [n] to create a new worktree.
            </text>
          </box>
        </scrollbox>
        <box style={{ paddingLeft: 1, height: 1 }}>
          <text style={{ fg: theme.colors.text.muted }}>
            [n] New Worktree [g/Esc] Back
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" style={{ width: "100%", height: "80%" }}>
      <scrollbox
        title={`Git Worktrees (${worktrees.length}) · Model: ${selectedModelName}`}
        style={{
          width: "100%",
          height: "100%",
          border: true,
          borderStyle: isActive ? "double" : "rounded",
          borderColor: borderColor,
          rootOptions: { backgroundColor: theme.colors.surface },
          wrapperOptions: { backgroundColor: theme.colors.surfaceHighlight },
          viewportOptions: { backgroundColor: theme.colors.background },
          contentOptions: { backgroundColor: theme.colors.background },
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
          focused={isFocused}
          selectedIndex={selectedIndex}
          style={{
            width: "100%",
            height: "100%",
            selectedTextColor: theme.colors.primary,
            backgroundColor: theme.colors.background,
            selectedBackgroundColor: theme.colors.surfaceHighlight,
          }}
          onChange={(index) => {
            const worktree = worktrees[index];
            if (worktree) onSelect(worktree);
          }}
          onSelect={(index) => {
            const worktree = worktrees[index];
            if (worktree) onSelect(worktree);
          }}
          options={options}
        />
      </scrollbox>
      {/* Keyboard hints */}
      <box style={{ paddingLeft: 1, paddingTop: 0, height: 1 }}>
        <text style={{ fg: theme.colors.text.muted }}>
          {isActive
            ? "[Enter] Launch  [n] New Worktree  [r] Refresh  [g/Esc] Back"
            : "[Tab] Focus"}
        </text>
      </box>
    </box>
  );
}