import type { SelectOption } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MultiLaunchOptions, PermissionMode } from "@/lib/launcher";
import { theme } from "@/theme";
import { detectTerminals, type SystemTerminal } from "@/utils/terminalLauncher";

interface PreLaunchDialogProps {
	isOpen: boolean;
	selectedModels: SelectOption[];
	useWorktree: boolean;
	onLaunch: (options: MultiLaunchOptions & { terminalApp?: string }) => void;
	onCancel: () => void;
}

interface PermissionModeOption {
	value: PermissionMode;
	label: string;
}

const PERMISSION_MODES: PermissionModeOption[] = [
	{ value: "default", label: "Default" },
	{ value: "plan", label: "Plan Mode" },
	{ value: "autoAccept", label: "Auto-Accept All" },
	{ value: "acceptEdits", label: "Accept Edits Only" },
];

type FocusField = "prompt" | "permission" | "terminal" | "launch" | "cancel";

/**
 * Modal dialog for configuring multi-model launch options.
 *
 * Allows users to set an initial prompt, permission mode, and terminal
 * before launching multiple Claude Code instances in parallel.
 */
export function PreLaunchDialog({
	isOpen,
	selectedModels,
	useWorktree,
	onLaunch,
	onCancel,
}: PreLaunchDialogProps) {
	const [prompt, setPrompt] = useState("");
	const [permissionIndex, setPermissionIndex] = useState(0);
	const [terminalIndex, setTerminalIndex] = useState(0);
	const [focusedField, setFocusedField] = useState<FocusField>("prompt");
	const [isSelectingPermission, setIsSelectingPermission] = useState(false);
	const [isSelectingTerminal, setIsSelectingTerminal] = useState(false);
	const [detectedTerminals, setDetectedTerminals] = useState<SystemTerminal[]>(
		[]
	);
	const { width, height } = useTerminalDimensions();

	// Detect available terminals on mount
	useEffect(() => {
		const terminals = detectTerminals();
		setDetectedTerminals(terminals);
	}, []);

	// Terminal options: Auto-detect + detected terminals
	const terminalOptions = useMemo(() => {
		return [
			{ name: "Auto (Terminal.app)", path: "" },
			...detectedTerminals.map((t) => ({ name: t.name, path: t.path })),
		];
	}, [detectedTerminals]);

	// Reset state when dialog opens
	useEffect(() => {
		if (isOpen) {
			setPrompt("");
			setPermissionIndex(0);
			setTerminalIndex(0);
			setFocusedField("prompt");
			setIsSelectingPermission(false);
			setIsSelectingTerminal(false);
		}
	}, [isOpen]);

	const handleLaunch = useCallback(() => {
		const selectedTerminal = terminalOptions[terminalIndex];
		const permissionMode =
			PERMISSION_MODES[permissionIndex]?.value ?? "default";
		onLaunch({
			initialPrompt: prompt,
			permissionMode,
			terminalApp: selectedTerminal?.path || undefined,
		});
	}, [prompt, permissionIndex, terminalIndex, terminalOptions, onLaunch]);

	const handleCancel = useCallback(() => {
		onCancel();
	}, [onCancel]);

	useKeyboard((key) => {
		if (!isOpen) return;

		const name = key.name || "";

		// If selecting in a dropdown, handle that first
		if (isSelectingPermission) {
			if (name === "up") {
				setPermissionIndex(
					(prev) =>
						(prev - 1 + PERMISSION_MODES.length) % PERMISSION_MODES.length
				);
				return;
			}
			if (name === "down") {
				setPermissionIndex((prev) => (prev + 1) % PERMISSION_MODES.length);
				return;
			}
			if (name === "return" || name === "escape") {
				setIsSelectingPermission(false);
				return;
			}
			return;
		}

		if (isSelectingTerminal) {
			if (name === "up") {
				setTerminalIndex(
					(prev) => (prev - 1 + terminalOptions.length) % terminalOptions.length
				);
				return;
			}
			if (name === "down") {
				setTerminalIndex((prev) => (prev + 1) % terminalOptions.length);
				return;
			}
			if (name === "return" || name === "escape") {
				setIsSelectingTerminal(false);
				return;
			}
			return;
		}

		// Normal navigation mode
		const fieldOrder: FocusField[] = [
			"prompt",
			"permission",
			"terminal",
			"launch",
			"cancel",
		];
		const currentIndex = fieldOrder.indexOf(focusedField);

		// Up/Down navigates between fields
		if (name === "up" || name === "down") {
			const nextIndex =
				name === "up"
					? (currentIndex - 1 + fieldOrder.length) % fieldOrder.length
					: (currentIndex + 1) % fieldOrder.length;
			const nextField = fieldOrder[nextIndex];
			if (nextField) {
				setFocusedField(nextField);
			}
			return;
		}

		// Escape to cancel
		if (name === "escape") {
			handleCancel();
			return;
		}

		// Enter handling based on focused field
		if (name === "return") {
			if (focusedField === "permission") {
				setIsSelectingPermission(true);
			} else if (focusedField === "terminal") {
				setIsSelectingTerminal(true);
			} else if (focusedField === "cancel") {
				handleCancel();
			} else if (focusedField === "launch") {
				handleLaunch();
			} else {
				// From prompt field, launch
				handleLaunch();
			}
			return;
		}
	});

	if (!isOpen) return null;

	// Modal dimensions
	const modalWidth = 60;
	const modalHeight = useWorktree ? 19 : 18;

	// Center the modal
	const left = Math.floor((width - modalWidth) / 2);
	const top = Math.floor((height - modalHeight) / 2);

	const modelCount = selectedModels.length;
	const modelNames =
		modelCount <= 3
			? selectedModels.map((m) => m.name).join(", ")
			: `${selectedModels
					.slice(0, 2)
					.map((m) => m.name)
					.join(", ")} +${modelCount - 2} more`;

	const currentMode = PERMISSION_MODES[permissionIndex];
	const currentTerminal = terminalOptions[terminalIndex];
	const launchActive = focusedField === "launch";
	const cancelActive = focusedField === "cancel";

	return (
		<>
			{/* Backdrop */}
			<box
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					width,
					height,
					backgroundColor: "#000000",
					opacity: 0.6,
				}}
			/>
			{/* Dialog */}
			<box
				flexDirection="column"
				style={{
					position: "absolute",
					left,
					top,
					width: modalWidth,
					border: true,
					borderStyle: "double",
					borderColor: theme.colors.primary,
					backgroundColor: theme.colors.surface,
					paddingLeft: 2,
					paddingRight: 2,
					paddingTop: 1,
					paddingBottom: 1,
				}}
			>
				{/* Title */}
				<text
					attributes={TextAttributes.BOLD}
					style={{ fg: theme.colors.primary, marginBottom: 1 }}
				>
					Launch {modelCount} Model{modelCount > 1 ? "s" : ""}
				</text>

				{/* Model names */}
				<text style={{ fg: theme.colors.text.secondary, marginBottom: 1 }}>
					{modelNames}
				</text>

				{/* Worktree warning */}
				{useWorktree && (
					<text style={{ fg: theme.colors.warning, marginBottom: 1 }}>
						⚡ Each instance will launch in its own worktree
					</text>
				)}

				{/* Initial prompt input */}
				<box flexDirection="column" style={{ marginBottom: 1 }}>
					<text style={{ fg: theme.colors.text.muted }}>Initial Prompt:</text>
					<box
						style={{
							width: modalWidth - 6,
							border: true,
							borderStyle: focusedField === "prompt" ? "double" : "rounded",
							borderColor:
								focusedField === "prompt"
									? theme.colors.primary
									: theme.colors.border,
							backgroundColor:
								focusedField === "prompt"
									? theme.colors.surfaceHighlight
									: theme.colors.background,
						}}
					>
						<input
							focused={focusedField === "prompt"}
							onInput={setPrompt}
							placeholder="(optional) Enter a prompt for all instances..."
							style={{
								width: modalWidth - 8,
							}}
							value={prompt}
						/>
					</box>
				</box>

				{/* Permission mode selector */}
				<box flexDirection="column" style={{ marginBottom: 1 }}>
					<text style={{ fg: theme.colors.text.muted }}>Permission Mode:</text>
					<box
						style={{
							width: modalWidth - 6,
							border: true,
							borderStyle: focusedField === "permission" ? "double" : "rounded",
							borderColor:
								focusedField === "permission"
									? theme.colors.primary
									: theme.colors.border,
							backgroundColor:
								focusedField === "permission"
									? theme.colors.surfaceHighlight
									: theme.colors.background,
							paddingLeft: 1,
							paddingRight: 1,
						}}
					>
						<text
							style={{
								fg:
									focusedField === "permission"
										? theme.colors.text.primary
										: theme.colors.text.secondary,
							}}
						>
							{currentMode?.label ?? "Default"}{" "}
							{focusedField === "permission" ? "▲▼" : ""}
						</text>
					</box>
				</box>

				{/* Terminal selector */}
				<box flexDirection="column" style={{ marginBottom: 1 }}>
					<text style={{ fg: theme.colors.text.muted }}>Terminal:</text>
					<box
						style={{
							width: modalWidth - 6,
							border: true,
							borderStyle: focusedField === "terminal" ? "double" : "rounded",
							borderColor:
								focusedField === "terminal"
									? theme.colors.primary
									: theme.colors.border,
							backgroundColor:
								focusedField === "terminal"
									? theme.colors.surfaceHighlight
									: theme.colors.background,
							paddingLeft: 1,
							paddingRight: 1,
						}}
					>
						<text
							style={{
								fg:
									focusedField === "terminal"
										? theme.colors.text.primary
										: theme.colors.text.secondary,
							}}
						>
							{currentTerminal?.name || "Auto"}{" "}
							{focusedField === "terminal" ? "▲▼" : ""}
						</text>
					</box>
				</box>

				{/* Action buttons */}
				<box flexDirection="row" gap={2} justifyContent="center">
					<box
						style={{
							border: true,
							borderStyle: "rounded",
							borderColor: launchActive
								? theme.colors.success
								: theme.colors.border,
							backgroundColor: launchActive
								? theme.colors.surfaceHighlight
								: theme.colors.background,
							paddingLeft: 2,
							paddingRight: 2,
						}}
					>
						<text
							attributes={launchActive ? TextAttributes.BOLD : undefined}
							style={{
								fg: launchActive
									? theme.colors.success
									: theme.colors.text.muted,
							}}
						>
							Launch
						</text>
					</box>
					<box
						style={{
							border: true,
							borderStyle: "rounded",
							borderColor: cancelActive
								? theme.colors.primary
								: theme.colors.border,
							backgroundColor: cancelActive
								? theme.colors.surfaceHighlight
								: theme.colors.background,
							paddingLeft: 2,
							paddingRight: 2,
						}}
					>
						<text
							attributes={cancelActive ? TextAttributes.BOLD : undefined}
							style={{
								fg: cancelActive
									? theme.colors.text.primary
									: theme.colors.text.muted,
							}}
						>
							Cancel
						</text>
					</box>
				</box>

				{/* Key Legend */}
				<box flexDirection="row" gap={2} justifyContent="center" marginTop={1}>
					<box flexDirection="row">
						<text style={{ fg: theme.colors.primary }}>[Enter]</text>
						<text style={{ fg: theme.colors.text.muted }}> Select/Launch</text>
					</box>
					<box flexDirection="row">
						<text style={{ fg: theme.colors.primary }}>[↑↓]</text>
						<text style={{ fg: theme.colors.text.muted }}> Navigate</text>
					</box>
					<box flexDirection="row">
						<text style={{ fg: theme.colors.primary }}>[Esc]</text>
						<text style={{ fg: theme.colors.text.muted }}> Cancel</text>
					</box>
				</box>
			</box>
		</>
	);
}
