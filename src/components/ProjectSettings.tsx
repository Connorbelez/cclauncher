import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	getProjectConfig,
	saveProjectConfig,
	scriptExists,
	type ProjectConfig,
} from "@/lib/projectStore";
import { theme } from "@/theme";

interface ProjectSettingsProps {
	/** Git repository root path */
	gitRepoRoot: string;
	/** Whether this component is focused */
	isFocused: boolean;
	/** Called when user saves and wants to return */
	onSave: () => void;
	/** Called when user cancels */
	onCancel: () => void;
}

/**
 * Component for configuring per-project settings.
 * Currently supports configuring the post-worktree setup script.
 */
export function ProjectSettings({
	gitRepoRoot,
	isFocused,
	onSave,
	onCancel,
}: ProjectSettingsProps) {
	const [scriptPath, setScriptPath] = useState("");
	const [originalScriptPath, setOriginalScriptPath] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);

	// Load existing config on mount
	useEffect(() => {
		const result = getProjectConfig(gitRepoRoot);
		if (result.ok && result.data?.postWorktreeScript) {
			setScriptPath(result.data.postWorktreeScript);
			setOriginalScriptPath(result.data.postWorktreeScript);
		}
	}, [gitRepoRoot]);

	// Clear error when scriptPath changes (user started typing)
	const prevScriptPathRef = useRef(scriptPath);
	useEffect(() => {
		if (prevScriptPathRef.current !== scriptPath && error) {
			setError(null);
		}
		prevScriptPathRef.current = scriptPath;
	}, [scriptPath, error]);

	// Clear success message after a delay
	useEffect(() => {
		if (saveSuccess) {
			const timeout = setTimeout(() => {
				setSaveSuccess(false);
			}, 1500);
			return () => clearTimeout(timeout);
		}
	}, [saveSuccess]);

	const handleSave = useCallback(() => {
		// Clear any previous error
		setError(null);

		// Validate the script path if provided
		if (scriptPath.trim() && !scriptExists(gitRepoRoot, scriptPath.trim())) {
			setError(`File not found: ${scriptPath.trim()}`);
			return;
		}

		// Save the config
		const config: ProjectConfig = {
			postWorktreeScript: scriptPath.trim() || undefined,
		};

		const result = saveProjectConfig(gitRepoRoot, config);
		if (!result.ok) {
			setError(result.message);
			return;
		}

		setOriginalScriptPath(scriptPath.trim());
		setSaveSuccess(true);

		// Return to worktree view after short delay
		setTimeout(() => {
			onSave();
		}, 500);
	}, [gitRepoRoot, scriptPath, onSave]);

	const handleCancel = useCallback(() => {
		// Restore original value
		setScriptPath(originalScriptPath);
		setError(null);
		onCancel();
	}, [originalScriptPath, onCancel]);

	const handleClear = useCallback(() => {
		setScriptPath("");
		setError(null);
	}, []);

	// Handle keyboard input
	useKeyboard((key) => {
		if (!isFocused) return;

		if (key.name === "return") {
			handleSave();
			return;
		}

		if (key.name === "escape") {
			handleCancel();
			return;
		}

		// Clear on Ctrl+Backspace or when input is empty and backspace pressed
		if (key.name === "backspace" && key.ctrl) {
			handleClear();
			return;
		}
	});

	const hasChanges = scriptPath !== originalScriptPath;
	const borderColor = error
		? theme.colors.error
		: saveSuccess
			? theme.colors.success
			: theme.colors.primary;

	if (!isFocused) {
		return null;
	}

	return (
		<box flexDirection="column" flexGrow={1} style={{ width: "100%" }}>
			<box
				flexDirection="column"
				style={{
					width: "100%",
					flexGrow: 1,
					border: true,
					borderStyle: "double",
					borderColor,
					padding: 1,
				}}
				title="Project Settings"
			>
				{/* Description */}
				<box flexDirection="column" marginBottom={1}>
					<text style={{ fg: theme.colors.text.secondary }}>
						Configure settings for this project. These settings are saved
					</text>
					<text style={{ fg: theme.colors.text.secondary }}>
						and will apply whenever you work in this repository.
					</text>
				</box>

				{/* Error display */}
				{error && (
					<box
						flexDirection="column"
						marginBottom={1}
						style={{
							border: true,
							borderStyle: "rounded",
							borderColor: theme.colors.error,
							padding: 1,
						}}
					>
						<text
							style={{ fg: theme.colors.error }}
							attributes={TextAttributes.BOLD}
						>
							Error
						</text>
						<text style={{ fg: theme.colors.text.primary }}>{error}</text>
						<text style={{ fg: theme.colors.text.muted, marginTop: 1 }}>
							Please enter a valid path to an existing file.
						</text>
					</box>
				)}

				{/* Success message */}
				{saveSuccess && (
					<box
						flexDirection="column"
						marginBottom={1}
						style={{
							border: true,
							borderStyle: "rounded",
							borderColor: theme.colors.success,
							padding: 1,
						}}
					>
						<text style={{ fg: theme.colors.success }}>
							Settings saved successfully
						</text>
					</box>
				)}

				{/* Divider */}
				<box marginBottom={1}>
					<text style={{ fg: theme.colors.border }}>
						{"─".repeat(60)}
					</text>
				</box>

				{/* Post-Worktree Script section */}
				<box flexDirection="column" marginBottom={1}>
					<text
						style={{ fg: theme.colors.secondary }}
						attributes={TextAttributes.BOLD}
					>
						Post-Worktree Script
					</text>
					<box marginTop={1}>
						<text style={{ fg: theme.colors.text.muted }}>
							Script to run after creating a new worktree, before launching
						</text>
					</box>
					<text style={{ fg: theme.colors.text.muted }}>
						Claude Code. Use this to install dependencies, start dev servers,
						etc.
					</text>
				</box>

				{/* Input field */}
				<box
					flexDirection="column"
					style={{
						border: true,
						borderStyle: isFocused ? "double" : "rounded",
						borderColor: error
							? theme.colors.error
							: theme.colors.primary,
						backgroundColor: theme.colors.surfaceHighlight,
						paddingLeft: 1,
						paddingRight: 1,
						height: 3,
					}}
				>
					<input
						focused={isFocused}
						onInput={setScriptPath}
						placeholder="./scripts/worktree-setup.sh"
						style={{
							textColor: theme.colors.text.primary,
							backgroundColor: theme.colors.surfaceHighlight,
						}}
						value={scriptPath}
					/>
				</box>

				{/* Help text */}
				<box marginTop={1}>
					<text style={{ fg: theme.colors.text.hint }}>
						Tip: Use a relative path from the repository root
					</text>
				</box>

				{/* Current project path */}
				<box flexDirection="column" marginTop={2}>
					<text style={{ fg: theme.colors.text.muted }}>Project:</text>
					<text style={{ fg: theme.colors.text.secondary }}>{gitRepoRoot}</text>
				</box>
			</box>

			{/* Status bar */}
			<box
				flexDirection="row"
				gap={2}
				style={{
					paddingTop: 1,
					paddingLeft: 1,
				}}
			>
				<box flexDirection="row">
					<text style={{ fg: theme.colors.primary }}>[Enter]</text>
					<text style={{ fg: theme.colors.text.muted }}> Save</text>
				</box>
				<box flexDirection="row">
					<text style={{ fg: theme.colors.primary }}>[Esc]</text>
					<text style={{ fg: theme.colors.text.muted }}> Cancel</text>
				</box>
				<box flexDirection="row">
					<text style={{ fg: theme.colors.primary }}>[Ctrl+Backspace]</text>
					<text style={{ fg: theme.colors.text.muted }}> Clear</text>
				</box>
				{hasChanges && (
					<box flexDirection="row">
						<text style={{ fg: theme.colors.warning }}>*</text>
						<text style={{ fg: theme.colors.text.muted }}> Unsaved</text>
					</box>
				)}
			</box>
		</box>
	);
}

interface ProjectSettingsPreviewProps {
	/** Git repository root path */
	gitRepoRoot: string;
	/** Whether this component is focused (for border styling) */
	isActive?: boolean;
}

/**
 * Compact preview of project settings shown in the worktree selector.
 */
export function ProjectSettingsPreview({
	gitRepoRoot,
	isActive = false,
}: ProjectSettingsPreviewProps) {
	const [scriptPath, setScriptPath] = useState<string | null>(null);

	useEffect(() => {
		const result = getProjectConfig(gitRepoRoot);
		if (result.ok && result.data?.postWorktreeScript) {
			setScriptPath(result.data.postWorktreeScript);
		} else {
			setScriptPath(null);
		}
	}, [gitRepoRoot]);

	const borderColor = isActive ? theme.colors.primary : theme.colors.border;

	return (
		<box
			flexDirection="column"
			style={{
				width: "100%",
				border: true,
				borderStyle: isActive ? "double" : "rounded",
				borderColor,
				paddingLeft: 1,
				paddingRight: 1,
				paddingTop: 0,
				paddingBottom: 0,
			}}
			title="Project Settings"
		>
			<box flexDirection="row" gap={1}>
				<text style={{ fg: theme.colors.text.muted }}>Setup Script</text>
				{scriptPath ? (
					<text style={{ fg: theme.colors.success }}>{scriptPath}</text>
				) : (
					<text style={{ fg: theme.colors.text.hint }}>Not configured</text>
				)}
			</box>
		</box>
	);
}
