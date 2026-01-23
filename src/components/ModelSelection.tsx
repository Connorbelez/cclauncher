import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useMemo, useState } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";
import { logDebug } from "@/lib/logger";
import { ConfirmModal } from "./ConfirmModal";

export interface ModelSelectionProps {
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
	// Multi-select props
	multiSelectMode?: boolean;
	onMultiSelectModeChange?: (enabled: boolean) => void;
	selectedModelIds?: Set<string>;
	onToggleModelSelection?: (modelName: string) => void;
	onSelectAll?: () => void;
	onClearAllSelections?: () => void;
	onMultiLaunch?: (
		models: SelectOption[],
		options?: { useWorktree?: boolean }
	) => void;
}

export function ModelSelection(props: ModelSelectionProps) {
	const { isFocused, focusedId, isModalOpen, inPreLaunchDialog, setModalOpen } =
		useFocusState("model_selection");

	logDebug("ModelSelection render", { isFocused, focusedId, isModalOpen });

	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
	const [worktreeMode, setWorktreeMode] = useState(false);

	const openDeleteConfirm = useCallback(() => {
		setIsDeleteConfirmOpen(true);
		setModalOpen(true);
	}, [setModalOpen]);

	const closeDeleteConfirm = useCallback(() => {
		setIsDeleteConfirmOpen(false);
		setModalOpen(false);
	}, [setModalOpen]);

	const confirmDelete = useCallback(() => {
		props.onDelete?.(props.selectedModel);
		closeDeleteConfirm();
	}, [props, closeDeleteConfirm]);

	const selectedIndex = useMemo(() => {
		const index = props.models.findIndex(
			(model) => model.name === props.selectedModel.name
		);
		return index === -1 ? 0 : index;
	}, [props.models, props.selectedModel.name]);

	const handleMoveKeys = useCallback(
		(name: string) => {
			if (props.moveMode && (name === "up" || name === "down")) {
				props.onMove(selectedIndex, name as "up" | "down");
				return true;
			}
			return false;
		},
		[props.moveMode, props.onMove, selectedIndex]
	);

	const handleActionKeys = useCallback(
		(name: string, key: { shift?: boolean }) => {
			// Multi-select mode keyboard handlers
			if (props.multiSelectMode) {
				if (name === "space") {
					// Toggle selection of current model
					props.onToggleModelSelection?.(props.selectedModel.name);
					return;
				}
				if (name === "a") {
					if (key.shift) {
						// Shift+A: Deselect all
						props.onClearAllSelections?.();
					} else {
						// A: Select all
						props.onSelectAll?.();
					}
					return;
				}
				if (name === "escape") {
					// Exit multi-select mode
					props.onMultiSelectModeChange?.(false);
					return;
				}
				if (name === "return") {
					// Launch selected models
					const selectionCount = props.selectedModelIds?.size ?? 0;
					if (selectionCount > 0 && props.onMultiLaunch) {
						const selectedModels = props.models.filter((m) =>
							props.selectedModelIds?.has(m.name)
						);
						props.onMultiLaunch(selectedModels, { useWorktree: worktreeMode });
					}
					return;
				}
				// Allow up/down navigation in multi-select mode (handled by <select>)
				return;
			}

			// Normal mode keyboard handlers
			if (name === "s" && !props.moveMode) {
				// Enter multi-select mode
				props.onMultiSelectModeChange?.(true);
			} else if (name === "m") {
				props.onMoveModeChange(!props.moveMode);
				if (props.moveMode) props.onReorderEnd();
			} else if (name === "w" && props.isGitRepo && !props.moveMode) {
				setWorktreeMode(!worktreeMode);
			} else if (name === "e" && isFocused && !props.moveMode) {
				// Handled by FocusProvider to switch focus and enter edit mode
			} else if (name === "escape") {
				if (props.moveMode) {
					props.onMoveModeChange(false);
					props.onReorderEnd();
				} else {
					setWorktreeMode(false);
				}
			} else if (name === "return") {
				if (props.moveMode) {
					props.onMoveModeChange(false);
					props.onReorderEnd();
				} else if (props.onLaunch) {
					props.onLaunch(props.selectedModel, { useWorktree: worktreeMode });
					setWorktreeMode(false);
				}
			} else if (name === "d" && !props.moveMode && props.onDelete) {
				openDeleteConfirm();
			}
		},
		[props, worktreeMode, isFocused, openDeleteConfirm]
	);

	const handleKeyboard = useCallback(
		(key: { name?: string; shift?: boolean }) => {
			if (!isFocused || isModalOpen || inPreLaunchDialog) {
				logDebug("Ignoring key", {
					isFocused,
					isModalOpen,
					inPreLaunchDialog,
					key: key.name,
				});
				return;
			}
			const name = key.name || "";

			if (handleMoveKeys(name)) {
				return;
			}
			handleActionKeys(name, key);
		},
		[
			isFocused,
			isModalOpen,
			inPreLaunchDialog,
			handleMoveKeys,
			handleActionKeys,
		]
	);

	useKeyboard(handleKeyboard);

	const selectionCount = props.selectedModelIds?.size ?? 0;

	// Transform options to show checkboxes in multi-select mode
	const displayOptions = useMemo(() => {
		if (!props.multiSelectMode) {
			return props.models;
		}
		return props.models.map((model) => {
			const isSelected = props.selectedModelIds?.has(model.name) ?? false;
			const checkbox = isSelected ? "[✓] " : "[ ] ";
			return {
				...model,
				name: `${checkbox}${model.name}`,
			};
		});
	}, [props.models, props.multiSelectMode, props.selectedModelIds]);

	const title = props.multiSelectMode
		? `Models (${props.models.length}) - ${selectionCount} selected`
		: `Models (${props.models.length})`;

	const borderColor = props.multiSelectMode
		? theme.colors.secondary
		: worktreeMode
			? theme.colors.warning
			: props.moveMode
				? theme.colors.success
				: isFocused
					? theme.colors.primary
					: theme.colors.text.muted;

	if (focusedId !== "model_selection" && focusedId !== "model_details") {
		return null;
	}

	return (
		<>
			<scrollbox
				flexDirection="column"
				flexGrow={1}
				style={{
					width: "100%",
					height: "100%",
					flexGrow: 1,
					border: true,
					borderStyle: isFocused ? "double" : "rounded",
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
				title={title}
			>
				<select
					focused={
						isFocused &&
						!props.moveMode &&
						!isModalOpen &&
						!inPreLaunchDialog
					}
					onChange={(index) => {
						const model = props.models[index];
						if (model) props.onSelect(model);
					}}
					onSelect={(index) => {
						const model = props.models[index];
						if (model) props.onSelect(model);
					}}
					options={displayOptions}
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

			<ConfirmModal
				cancelLabel="Cancel"
				confirmLabel="Delete"
				isOpen={isDeleteConfirmOpen}
				message={`Delete model "${props.selectedModel.name}"? This cannot be undone.`}
				onCancel={closeDeleteConfirm}
				onConfirm={confirmDelete}
				title="Delete Model"
			/>
		</>
	);
}
