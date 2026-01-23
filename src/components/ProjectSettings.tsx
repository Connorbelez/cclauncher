import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	getProjectConfig,
	type ProjectConfig,
	saveProjectConfig,
	scriptExists,
} from "@/lib/projectStore";
import { looksLikeFilePath } from "@/lib/scriptExecution";
import { theme } from "@/theme";
import { FormField } from "./FormField";
import { TerminalSelect } from "./TerminalSelect";

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
	const [spawnInTerminal, setSpawnInTerminal] = useState(false);
	const [terminalApp, setTerminalApp] = useState("");
	const [customTerminalPath, setCustomTerminalPath] = useState("");

	const [originalScriptPath, setOriginalScriptPath] = useState("");
	const [originalSpawnInTerminal, setOriginalSpawnInTerminal] = useState(false);
	const [originalTerminalApp, setOriginalTerminalApp] = useState("");

	// Field indices:
	// 0: Script Path
	// 1: Spawn in Terminal (Checkbox)
	// 2: Terminal App (Select) - only if spawnInTerminal
	// 3: Custom Path - only if terminalApp === 'custom'
	const [activeFieldIndex, setActiveFieldIndex] = useState(0);
	const [isSelectingTerminal, setIsSelectingTerminal] = useState(false);

	const [error, setError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [saveRequestId, setSaveRequestId] = useState(0);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Load existing config on mount
	useEffect(() => {
		const result = getProjectConfig(gitRepoRoot);
		if (result.ok && result.data) {
			setScriptPath(result.data.postWorktreeScript || "");
			setOriginalScriptPath(result.data.postWorktreeScript || "");

			setSpawnInTerminal(result.data.spawnInTerminal ?? false);
			setOriginalSpawnInTerminal(result.data.spawnInTerminal ?? false);

			const app = result.data.terminalApp || "";
			setTerminalApp(app);
			setOriginalTerminalApp(app);
		}
	}, [gitRepoRoot]);

	// Clear error when inputs change
	useEffect(() => {
		if (!error) return;
		setError(null);
	}, [error]);

	// Clear success message after a delay
	useEffect(() => {
		if (saveSuccess) {
			const timeout = setTimeout(() => {
				setSaveSuccess(false);
			}, 1500);
			return () => clearTimeout(timeout);
		}
	}, [saveSuccess]);

	// Delay returning to the previous view after saving
	useEffect(() => {
		if (saveRequestId === 0) return;
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}
		saveTimeoutRef.current = setTimeout(() => {
			onSave();
		}, 500);
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
				saveTimeoutRef.current = null;
			}
		};
	}, [saveRequestId, onSave]);

	const handleSave = useCallback(() => {
		setError(null);

		const trimmedScript = scriptPath.trim();
		const looksLikePath = looksLikeFilePath(trimmedScript);
		if (
			trimmedScript &&
			looksLikePath &&
			!scriptExists(gitRepoRoot, trimmedScript)
		) {
			setError(`File not found: ${trimmedScript}`);
			return;
		}

		let finalTerminalApp = terminalApp;
		if (terminalApp === "custom") {
			if (!customTerminalPath.trim()) {
				setError("Please enter a custom terminal path");
				return;
			}
			finalTerminalApp = customTerminalPath.trim();
		}

		const config: ProjectConfig = {
			postWorktreeScript: trimmedScript || undefined,
			spawnInTerminal,
			terminalApp: finalTerminalApp || undefined,
		};

		const result = saveProjectConfig(gitRepoRoot, config);
		if (!result.ok) {
			setError(result.message);
			return;
		}

		setOriginalScriptPath(trimmedScript);
		setOriginalSpawnInTerminal(spawnInTerminal);
		setOriginalTerminalApp(finalTerminalApp);
		setSaveSuccess(true);

		setSaveRequestId((prev) => prev + 1);
	}, [
		gitRepoRoot,
		scriptPath,
		spawnInTerminal,
		terminalApp,
		customTerminalPath,
	]);

	const handleCancel = useCallback(() => {
		setScriptPath(originalScriptPath);
		setSpawnInTerminal(originalSpawnInTerminal);
		setTerminalApp(originalTerminalApp);
		setError(null);
		onCancel();
	}, [
		originalScriptPath,
		originalSpawnInTerminal,
		originalTerminalApp,
		onCancel,
	]);

	// Calculate visible fields to handle navigation correctly
	const getVisibleFields = useCallback(() => {
		const fields = [0, 1]; // Script (0) and Toggle (1) are always visible
		if (spawnInTerminal) {
			fields.push(2); // Terminal Select
			if (terminalApp === "custom") {
				fields.push(3); // Custom Path
			}
		}
		return fields;
	}, [spawnInTerminal, terminalApp]);

	useKeyboard((key) => {
		if (!isFocused) return;

		// Ctrl+S to save from anywhere (except terminal dropdown)
		if (!isSelectingTerminal && key.name === "s" && key.ctrl) {
			handleSave();
			return;
		}

		if (key.name === "escape") {
			if (isSelectingTerminal) {
				setIsSelectingTerminal(false);
			} else {
				handleCancel();
			}
			return;
		}

		if (key.name === "s" && key.ctrl) {
			handleSave();
			return;
		}

		// Field Navigation
		if (!isSelectingTerminal) {
			if (key.name === "down" || key.name === "tab") {
				const visibleFields = getVisibleFields();
				const currentIdx = visibleFields.indexOf(activeFieldIndex);
				if (currentIdx !== -1 && currentIdx < visibleFields.length - 1) {
					setActiveFieldIndex(visibleFields[currentIdx + 1] ?? 0);
				}
				return;
			}
			if (key.name === "up" || (key.name === "tab" && key.shift)) {
				const visibleFields = getVisibleFields();
				const currentIdx = visibleFields.indexOf(activeFieldIndex);
				if (currentIdx > 0) {
					setActiveFieldIndex(visibleFields[currentIdx - 1] ?? 0);
				}
				return;
			}
		}

		// Field specific handling
		if (activeFieldIndex === 0) {
			// Script Input
			if (key.name === "return") handleSave();
		} else if (activeFieldIndex === 1) {
			// Toggle Spawn
			if (key.name === "return" || key.name === "space") {
				setSpawnInTerminal((p) => !p);
			}
		} else if (activeFieldIndex === 3 && key.name === "return") {
			// Custom Path Input
			handleSave();
		}
	});

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
			<scrollbox
				style={{
					width: "100%",
					flexGrow: 1,
					border: true,
					borderStyle: "double",
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
				title="Project Settings"
			>
				<box flexDirection="column" gap={1} padding={1}>
					{/* Description */}
					<text style={{ fg: theme.colors.text.secondary }}>
						Configure settings for this project.
					</text>

					{/* Error / Success */}
					{error && (
						<text style={{ fg: theme.colors.error }}>Error: {error}</text>
					)}
					{saveSuccess && (
						<text style={{ fg: theme.colors.success }}>Saved!</text>
					)}

					{/* 0: Script Path */}
					<FormField
						editMode={true}
						isFocused={activeFieldIndex === 0}
						label="Post-Worktree Script"
						onChange={setScriptPath}
						placeholder="./scripts/setup.sh"
						value={scriptPath}
					/>

					{/* 1: Spawn in Terminal Toggle */}
					<box flexDirection="column">
						<text
							style={{
								fg:
									activeFieldIndex === 1
										? theme.colors.primary
										: theme.colors.text.muted,
							}}
						>
							Run in separate terminal
						</text>
						<box
							style={{
								border: true,
								borderStyle: activeFieldIndex === 1 ? "double" : "rounded",
								borderColor:
									activeFieldIndex === 1
										? theme.colors.primary
										: theme.colors.border,
								paddingLeft: 1,
								paddingRight: 1,
								height: 3,
							}}
						>
							<text>{spawnInTerminal ? "[x] Enabled" : "[ ] Disabled"}</text>
						</box>
					</box>

					{/* 2: Terminal Selection */}
					{spawnInTerminal && (
						<TerminalSelect
							customPath={customTerminalPath}
							customPathFocused={activeFieldIndex === 3}
							isFocused={activeFieldIndex === 2}
							isSelecting={isSelectingTerminal}
							label="Terminal Application"
							onChange={setTerminalApp}
							onCustomPathChange={setCustomTerminalPath}
							onSelectingChange={setIsSelectingTerminal}
							showHint={true}
							showSelectionList={true}
							value={terminalApp}
						/>
					)}

					<box marginTop={1}>
						<text style={{ fg: theme.colors.text.hint }}>
							[Up/Down] Navigate [Enter] Select/Save [Ctrl+S] Save [Esc] Cancel
						</text>
					</box>
				</box>
			</scrollbox>
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
