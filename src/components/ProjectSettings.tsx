import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import {
	getProjectConfig,
	type ProjectConfig,
	saveProjectConfig,
	scriptExists,
} from "@/lib/projectStore";
import { theme } from "@/theme";
import { FormField } from "./FormField";

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

	const [detectedTerminals, setDetectedTerminals] = useState<
		{ name: string; path: string }[]
	>([]);

	// Field indices:
	// 0: Script Path
	// 1: Spawn in Terminal (Checkbox)
	// 2: Terminal App (Select) - only if spawnInTerminal
	// 3: Custom Path - only if terminalApp === 'custom'
	const [activeFieldIndex, setActiveFieldIndex] = useState(0);
	const [isSelectingTerminal, setIsSelectingTerminal] = useState(false);

	const [error, setError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);

	// Load detected terminals on mount
	useEffect(() => {
		import("@/utils/terminalLauncher").then(({ detectTerminals }) => {
			const terminals = detectTerminals();
			setDetectedTerminals(terminals);
		});
	}, []);

	// Load existing config on mount
	useEffect(() => {
		const result = getProjectConfig(gitRepoRoot);
		if (result.ok && result.data) {
			setScriptPath(result.data.postWorktreeScript || "");
			setOriginalScriptPath(result.data.postWorktreeScript || "");

			setSpawnInTerminal(result.data.spawnInTerminal ?? true);
			setOriginalSpawnInTerminal(result.data.spawnInTerminal ?? true);

			const app = result.data.terminalApp || "";
			setTerminalApp(app);
			setOriginalTerminalApp(app);
		}
	}, [gitRepoRoot]);

	// Clear error when inputs change
	useEffect(() => {
		if (error) setError(null);
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

	const handleSave = useCallback(() => {
		setError(null);

		const trimmedScript = scriptPath.trim();
		if (trimmedScript && !scriptExists(gitRepoRoot, trimmedScript)) {
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

		setTimeout(() => {
			onSave();
		}, 500);
	}, [
		gitRepoRoot,
		scriptPath,
		spawnInTerminal,
		terminalApp,
		customTerminalPath,
		onSave,
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
		} else if (activeFieldIndex === 2) {
			// Terminal Select
			if (isSelectingTerminal) {
				if (key.name === "up" || key.name === "down") {
					const options = [
						"",
						...detectedTerminals.map((t) => t.path),
						"custom",
					];
					const currentIndex = options.indexOf(terminalApp);
					let nextIndex =
						key.name === "up" ? currentIndex - 1 : currentIndex + 1;
					if (nextIndex < 0) nextIndex = options.length - 1;
					if (nextIndex >= options.length) nextIndex = 0;
					setTerminalApp(options[nextIndex] ?? "");
				} else if (key.name === "return") {
					setIsSelectingTerminal(false);
				}
			} else if (key.name === "return" || key.name === "space") {
				setIsSelectingTerminal(true);
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
						<box flexDirection="column">
							<text
								style={{
									fg:
										activeFieldIndex === 2
											? theme.colors.primary
											: theme.colors.text.muted,
								}}
							>
								Terminal Application
							</text>
							<box
								style={{
									border: true,
									borderStyle: activeFieldIndex === 2 ? "double" : "rounded",
									borderColor:
										activeFieldIndex === 2
											? theme.colors.primary
											: theme.colors.border,
									paddingLeft: 1,
									paddingRight: 1,
									height: isSelectingTerminal
										? detectedTerminals.length + 4
										: 3, // Expanded height handled by layout if possible, else fixed
									// Actually scrollbox handles height.
								}}
							>
								{isSelectingTerminal ? (
									<box flexDirection="column">
										<text
											style={{ fg: theme.colors.text.hint, marginBottom: 1 }}
										>
											Select a terminal:
										</text>
										{[
											"",
											...detectedTerminals.map((t) => t.path),
											"custom",
										].map((item) => {
											const isSelected = item === terminalApp;
											const label =
												item === ""
													? "Auto-detect (System Default)"
													: item === "custom"
														? "Custom Path..."
														: detectedTerminals.find((t) => t.path === item)
																?.name || item;
											return (
												<text
													key={item}
													style={{
														fg: isSelected
															? theme.colors.primary
															: theme.colors.text.primary,
														bg: isSelected
															? theme.colors.surfaceHighlight
															: undefined,
													}}
												>
													{isSelected ? "> " : "  "}
													{label}
												</text>
											);
										})}
									</box>
								) : (
									<text>
										{terminalApp === ""
											? "Auto-detect (System Default)"
											: terminalApp === "custom"
												? "Custom Path..."
												: detectedTerminals.find((t) => t.path === terminalApp)
														?.name || terminalApp}
									</text>
								)}
							</box>
							<text style={{ fg: theme.colors.text.hint }}>
								{isSelectingTerminal
									? "[Up/Down] Select  [Enter] Confirm"
									: activeFieldIndex === 2
										? "[Enter] Change Selection"
										: ""}
							</text>
						</box>
					)}

					{/* 3: Custom Path */}
					{spawnInTerminal && terminalApp === "custom" && (
						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 3}
							label="Custom Terminal Path"
							onChange={setCustomTerminalPath}
							value={customTerminalPath}
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
