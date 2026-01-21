import { theme } from "@/theme";

export interface StatusBarProps {
	/** Whether the UI is in edit mode */
	editMode: boolean;
	/** Whether model reorder/move mode is active */
	moveMode: boolean;
	/** Whether the application is currently launching */
	launching: boolean;
	/** Whether the current directory is a git repository */
	isGitRepo: boolean;
	/** The currently focused element ID */
	focusedId?: string;
	/** Whether multi-select mode is active */
	multiSelectMode?: boolean;
	/** Number of models selected in multi-select mode */
	selectionCount?: number;
}

/** A single shortcut with key and description */
interface Shortcut {
	key: string;
	desc: string;
}

/**
 * Render a single shortcut with styled key and description.
 */
function ShortcutHint({ shortcut }: { shortcut: Shortcut }) {
	return (
		<box flexDirection="row">
			<text style={{ fg: theme.colors.primary }}>[{shortcut.key}]</text>
			<text style={{ fg: theme.colors.text.muted }}> {shortcut.desc}</text>
		</box>
	);
}

/**
 * Render a compact status bar at the bottom of the screen with keyboard shortcuts and mode indicator.
 */
export function StatusBar({
	editMode,
	moveMode,
	launching,
	isGitRepo,
	focusedId,
	isSmallScreen = false,
	multiSelectMode = false,
	selectionCount = 0,
}: StatusBarProps & { isSmallScreen?: boolean }) {
	// Determine current mode label and color
	const modeLabel = launching
		? "Launching..."
		: multiSelectMode
			? `Select (${selectionCount})`
			: moveMode
				? "Move"
				: editMode
					? "Edit"
					: "View";
	const modeColor = launching
		? theme.colors.warning
		: multiSelectMode
			? theme.colors.secondary
			: moveMode
				? theme.colors.success
				: editMode
					? theme.colors.primary
					: theme.colors.secondary;

	// Build shortcut hints based on current mode and focus
	const shortcuts: Shortcut[] = [];

	if (moveMode) {
		shortcuts.push(
			{ key: "↑↓", desc: "Reorder" },
			{ key: "Enter", desc: "Save" },
			{ key: "Esc", desc: "Cancel" }
		);
	} else if (focusedId === "new_model") {
		shortcuts.push(
			{ key: "Enter", desc: "Save" },
			{ key: "Esc", desc: "Cancel" },
			{ key: "↑↓", desc: "Fields" },
			{ key: "Tab", desc: "Switch" }
		);
	} else if (editMode) {
		shortcuts.push(
			{ key: "Enter", desc: "Save" },
			{ key: "Esc", desc: "Cancel" },
			{ key: "↑↓", desc: "Fields" }
		);
	} else if (focusedId === "worktree_selection") {
		shortcuts.push(
			{ key: "Enter", desc: "Launch" },
			{ key: "Tab", desc: "Switch" },
			{ key: "↑↓", desc: "Navigate" },
			{ key: "n", desc: "New Worktree" },
			{ key: "m", desc: "Merge" },
			{ key: "s", desc: "Settings" },
			{ key: "r", desc: "Refresh" }
		);
	} else if (multiSelectMode) {
		// Multi-select mode shortcuts
		shortcuts.push(
			{ key: "Space", desc: "Toggle" },
			{ key: "a", desc: "All" },
			{ key: "A", desc: "None" },
			{ key: "↑↓", desc: "Navigate" }
		);
		if (selectionCount > 0) {
			shortcuts.push({ key: "Enter", desc: `Launch ${selectionCount}` });
		}
		shortcuts.push({ key: "Esc", desc: "Cancel" });
	} else {
		// Default view mode (mostly for model_selection)
		shortcuts.push(
			{ key: "n", desc: "New" },
			{ key: "e", desc: "Edit" },
			{ key: "s", desc: "Multi" },
			{ key: "Enter", desc: "Launch" }
		);
		if (isGitRepo) {
			shortcuts.push({ key: "w", desc: "Worktree" }, { key: "g", desc: "Git" });
		}
		shortcuts.push(
			{ key: "Tab", desc: "Switch" },
			{ key: "↑↓", desc: "Navigate" },
			{ key: "d", desc: "Delete" }
		);
	}

	return (
		<box
			flexDirection={isSmallScreen ? "column" : "row"}
			gap={isSmallScreen ? 1 : 2}
			justifyContent="space-between"
			style={{
				width: "100%",
				paddingLeft: 1,
				paddingRight: 1,
				paddingTop: isSmallScreen ? 1 : 0,
			}}
		>
			{/* Shortcuts Section */}
			<box
				flexDirection="row"
				flexWrap={isSmallScreen ? "wrap" : "no-wrap"}
				gap={isSmallScreen ? 1 : 2}
				style={{ maxWidth: isSmallScreen ? "100%" : undefined }}
			>
				{shortcuts.map((shortcut, idx) => (
					<ShortcutHint
						key={`shortcut-${idx}-${shortcut.key}`}
						shortcut={shortcut}
					/>
				))}
			</box>

			{/* Mode Indicator - Move to bottom right or bottom on small screens */}
			<box
				alignSelf={isSmallScreen ? "flex-end" : "auto"}
				flexDirection="row"
				marginTop={isSmallScreen ? 1 : 0}
			>
				<text style={{ fg: theme.colors.text.muted }}>Mode: </text>
				<text style={{ fg: modeColor }}>{modeLabel}</text>
			</box>
		</box>
	);
}
