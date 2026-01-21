import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useState, useCallback } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";

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
}

export function ModelSelection(props: ModelSelectionProps) {
	const { isFocused, focusedId } = useFocusState("model_selection");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [worktreeMode, setWorktreeMode] = useState(false);

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
		(name: string) => {
			if (name === "m") {
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
				setConfirmDelete(true);
			}
		},
		[props, worktreeMode, isFocused]
	);

	const handleKeyboard = useCallback(
		(key: { name?: string }) => {
			if (!isFocused) return;
			const name = key.name || "";

			if (confirmDelete) {
				if (name === "y" || name === "return") {
					props.onDelete?.(props.selectedModel);
					setConfirmDelete(false);
				} else if (name === "n" || name === "escape") {
					setConfirmDelete(false);
				}
				return;
			}

			if (handleMoveKeys(name)) {
				return;
			}
			handleActionKeys(name);
		},
		[isFocused, confirmDelete, handleMoveKeys, handleActionKeys, props]
	);

	useKeyboard(handleKeyboard);

	if (focusedId !== "model_selection" && focusedId !== "model_details") {
		return null;
	}

	const borderColor = worktreeMode
		? theme.colors.warning
		: props.moveMode
			? theme.colors.success
			: isFocused
				? theme.colors.primary
				: theme.colors.text.muted;

	return (
		<box flexDirection="column" flexGrow={1} style={{ width: "100%" }}>
			<scrollbox
				style={{
					width: "100%",
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
				title={`Models (${props.models.length})`}
			>
				<select
					focused={isFocused && !props.moveMode}
					onChange={(index) => {
						const model = props.models[index];
						if (model) props.onSelect(model);
					}}
					onSelect={(index) => {
						const model = props.models[index];
						if (model) props.onSelect(model);
					}}
					options={props.models}
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
		</box>
	);
}
