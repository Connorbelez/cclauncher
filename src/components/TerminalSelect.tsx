import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { theme } from "@/theme";
import { detectTerminals, type SystemTerminal } from "@/utils/terminalLauncher";
import { FormField } from "./FormField";

interface TerminalSelectProps {
	label: string;
	value: string;
	customPath: string;
	onChange: (value: string) => void;
	onCustomPathChange: (value: string) => void;
	isFocused: boolean;
	isSelecting: boolean;
	onSelectingChange: (isSelecting: boolean) => void;
	showSelectionList?: boolean;
	showHint?: boolean;
	customPathFocused?: boolean;
	width?: number | "auto" | `${number}%`;
}

export function TerminalSelect({
	label,
	value,
	customPath,
	onChange,
	onCustomPathChange,
	isFocused,
	isSelecting,
	onSelectingChange,
	showSelectionList = true,
	showHint = true,
	customPathFocused = false,
	width = "100%",
}: TerminalSelectProps) {
	const [detectedTerminals, setDetectedTerminals] = useState<SystemTerminal[]>(
		[]
	);

	useEffect(() => {
		const terminals = detectTerminals();
		setDetectedTerminals(terminals);
	}, []);

	const options = useMemo(() => {
		return ["", ...detectedTerminals.map((t) => t.path), "custom"];
	}, [detectedTerminals]);

	const getLabel = useCallback(
		(item: string) => {
			if (item === "") return "Auto-detect (System Default)";
			if (item === "custom") return "Custom Path...";
			return detectedTerminals.find((t) => t.path === item)?.name || item;
		},
		[detectedTerminals]
	);

	useKeyboard((key) => {
		if (!isFocused) return;

		const name = key.name || "";
		if (isSelecting) {
			if (name === "up" || name === "down") {
				const currentIndex = options.indexOf(value);
				let nextIndex = name === "up" ? currentIndex - 1 : currentIndex + 1;
				if (nextIndex < 0) nextIndex = options.length - 1;
				if (nextIndex >= options.length) nextIndex = 0;
				onChange(options[nextIndex] ?? "");
				return;
			}
			if (name === "return") {
				onSelectingChange(false);
			}
			return;
		}

		if (name === "return" || name === "space") {
			onSelectingChange(true);
		}
	});

	const currentLabel = getLabel(value);
	const showCustomPathInput = value === "custom";
	const expandedHeight = detectedTerminals.length + 4;

	return (
		<box flexDirection="column">
			<text
				style={{
					fg: isFocused ? theme.colors.primary : theme.colors.text.muted,
				}}
			>
				{label}
			</text>
			<box
				style={{
					width,
					border: true,
					borderStyle: isFocused ? "double" : "rounded",
					borderColor: isFocused ? theme.colors.primary : theme.colors.border,
					backgroundColor: isFocused
						? theme.colors.surfaceHighlight
						: theme.colors.background,
					paddingLeft: 1,
					paddingRight: 1,
					height: isSelecting && showSelectionList ? expandedHeight : 3,
				}}
			>
				{isSelecting && showSelectionList ? (
					<box flexDirection="column">
						<text style={{ fg: theme.colors.text.hint, marginBottom: 1 }}>
							Select a terminal:
						</text>
						{options.map((item) => {
							const isSelected = item === value;
							const itemLabel = getLabel(item);
							return (
								<text
									key={item || "auto"}
									style={{
										fg: isSelected
											? theme.colors.primary
											: theme.colors.text.primary,
										bg: isSelected ? theme.colors.surfaceHighlight : undefined,
									}}
								>
									{isSelected ? "> " : "  "}
									{itemLabel}
								</text>
							);
						})}
					</box>
				) : (
					<text
						style={{
							fg: isFocused
								? theme.colors.text.primary
								: theme.colors.text.secondary,
						}}
					>
						{currentLabel} {isFocused ? "▲▼" : ""}
					</text>
				)}
			</box>
			{showHint && (
				<text style={{ fg: theme.colors.text.hint }}>
					{showSelectionList
						? isSelecting
							? "[Up/Down] Select  [Enter] Confirm"
							: isFocused
								? "[Enter] Change Selection"
								: ""
						: ""}
				</text>
			)}
			{showCustomPathInput && (
				<FormField
					editMode={true}
					isFocused={customPathFocused}
					label="Custom Terminal Path"
					onChange={onCustomPathChange}
					value={customPath}
					width={width}
				/>
			)}
		</box>
	);
}
