import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import type { WorktreeInfo } from "@/lib/git";
import { getProjectConfig } from "@/lib/projectStore";
import { theme } from "@/theme";
import { ProjectSettings, ProjectSettingsPreview } from "./ProjectSettings";

export interface GitWorktreeSelectorProps {
	worktrees: WorktreeInfo[];
	selectedWorktree: WorktreeInfo | null;
	onSelect: (worktree: WorktreeInfo) => void;
	onLaunch: (worktree: WorktreeInfo) => void;
	onCreateNew: () => void;
	onRefresh: () => void;
	/** Name of the currently selected model (for display) */
	selectedModelName: string;
	/** Git repository root path */
	gitRepoRoot: string;
}

type ViewMode = "worktrees" | "settings";

/**
 * Format diff stats for display (e.g., "+5/-10" or "✓" for clean).
 */
function formatDiffStats(stats: WorktreeInfo["diffStats"]): string {
	if (!stats) {
		return "";
	}
	if (stats.additions === 0 && stats.deletions === 0) {
		return "✓";
	}
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
	if (path.length <= maxLen) {
		return path;
	}
	if (maxLen <= 3) {
		return ".".repeat(Math.max(0, maxLen));
	}
	const visibleChars = maxLen - 3;
	// Guard against non-positive visibleChars to ensure a strictly negative index for slice,
	// which prevents slice(-0) from returning the entire string.
	return `...${path.slice(-Math.max(1, visibleChars))}`;
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
 * @param gitRepoRoot - Git repository root path for project settings.
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
	gitRepoRoot,
}: GitWorktreeSelectorProps) {
	const { isFocused, focusedId, setFocusedId } =
		useFocusState("worktree_selection");

	const [viewMode, setViewMode] = useState<ViewMode>("worktrees");
	const [hasSetupScript, setHasSetupScript] = useState(false);

	// Check if project has a setup script configured
	useEffect(() => {
		const result = getProjectConfig(gitRepoRoot);
		setHasSetupScript(Boolean(result.ok && result.data?.postWorktreeScript));
	}, [gitRepoRoot]);

	// Refresh setup script state when returning from settings
	useEffect(() => {
		if (viewMode === "worktrees") {
			const result = getProjectConfig(gitRepoRoot);
			setHasSetupScript(Boolean(result.ok && result.data?.postWorktreeScript));
		}
	}, [viewMode, gitRepoRoot]);

	// Find the selected index
	const selectedIndex = useMemo(() => {
		if (!selectedWorktree) {
			return 0;
		}
		const index = worktrees.findIndex((w) => w.path === selectedWorktree.path);
		return index === -1 ? 0 : index;
	}, [worktrees, selectedWorktree]);

	// Convert worktrees to select options
	const options = useMemo(
		() => worktrees.map(formatWorktreeOption),
		[worktrees]
	);

	const handleSettingsSave = useCallback(() => {
		setViewMode("worktrees");
		// Refresh the hasSetupScript state
		const result = getProjectConfig(gitRepoRoot);
		setHasSetupScript(Boolean(result.ok && result.data?.postWorktreeScript));
	}, [gitRepoRoot]);

	const handleSettingsCancel = useCallback(() => {
		setViewMode("worktrees");
	}, []);

	useKeyboard((key) => {
		if (!isFocused) {
			return;
		}

		// Settings mode handles its own keys
		if (viewMode === "settings") {
			return;
		}

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

		// Open project settings
		if (key.name === "s") {
			setViewMode("settings");
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

	// Render settings view
	if (viewMode === "settings") {
		return (
			<ProjectSettings
				gitRepoRoot={gitRepoRoot}
				isFocused={isFocused}
				onCancel={handleSettingsCancel}
				onSave={handleSettingsSave}
			/>
		);
	}

	const isActive = isFocused;
	const borderColor = theme.colors.primary;

	// Empty state: no worktrees at all (shouldn't happen - main always exists)
	if (worktrees.length === 0) {
		return (
			<box flexDirection="column" flexGrow={1} style={{ width: "100%" }}>
				<scrollbox
					style={{
						width: "100%",
						flexGrow: 1,
						border: true,
						borderStyle: isActive ? "double" : "rounded",
						borderColor,
						rootOptions: { backgroundColor: theme.colors.surface },
						viewportOptions: { backgroundColor: theme.colors.background },
						contentOptions: { backgroundColor: theme.colors.background },
					}}
					title={`Worktrees · ${selectedModelName}`}
				>
					<box flexDirection="column" gap={1} padding={1}>
						<text style={{ fg: theme.colors.text.secondary }}>
							No worktrees found.
						</text>
						<text style={{ fg: theme.colors.text.muted }}>
							Press [n] to create a new worktree.
						</text>
					</box>
				</scrollbox>
				<ProjectSettingsPreview gitRepoRoot={gitRepoRoot} />
			</box>
		);
	}

	return (
		<box flexDirection="column" flexGrow={1} style={{ width: "100%" }}>
			<scrollbox
				style={{
					width: "100%",
					flexGrow: 1,
					border: true,
					borderStyle: isActive ? "double" : "rounded",
					borderColor,
					rootOptions: { backgroundColor: theme.colors.surface },
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
				title={`Worktrees (${worktrees.length}) · ${selectedModelName}${hasSetupScript ? " ⚡" : ""}`}
			>
				<select
					focused={isFocused}
					onChange={(index) => {
						const worktree = worktrees[index];
						if (worktree) {
							onSelect(worktree);
						}
					}}
					onSelect={(index) => {
						const worktree = worktrees[index];
						if (worktree) {
							onSelect(worktree);
						}
					}}
					options={options}
					selectedIndex={selectedIndex}
					style={{
						width: "100%",
						height: "100%",
						selectedTextColor: theme.colors.primary,
						backgroundColor: theme.colors.background,
						selectedBackgroundColor: theme.colors.surfaceHighlight,
					}}
				/>
			</scrollbox>

			{/* Project settings preview */}
			<box style={{ marginTop: 1 }}>
				<ProjectSettingsPreview gitRepoRoot={gitRepoRoot} />
			</box>
		</box>
	);
}
