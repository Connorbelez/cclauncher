import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";

export type ModelSelectionProps = {
    models: SelectOption[];
    onSelect: (model: SelectOption) => void;
    selectedModel: SelectOption;
    onMove: (fromIndex: number, direction: "up" | "down") => void;
    onReorderEnd: () => void;
    moveMode: boolean;
    onMoveModeChange: (moveMode: boolean) => void;
}

export function ModelSelection({ models, onSelect, selectedModel, onMove, onReorderEnd, moveMode, onMoveModeChange }: ModelSelectionProps) {
    const { isFocused, focusedId, editMode } = useFocusState("model_selection");

    const selectedIndex = useMemo(() => {
        const index = models.findIndex((model) => model.name === selectedModel.name);
        return index === -1 ? 0 : index;
    }, [models, selectedModel.name]);

    useKeyboard((key) => {
        if (!isFocused) {
            return;
        }

        if (key.name === "m") {
            onMoveModeChange(!moveMode);
            if (moveMode) {
                onReorderEnd();
            }
            return;
        }

        if (moveMode && (key.name === "return" || key.name === "escape")) {
            onMoveModeChange(false);
            onReorderEnd();
            return;
        }

        if (!moveMode) {
            return;
        }

        if (key.name === "up") {
            onMove(selectedIndex, "up");
        }

        if (key.name === "down") {
            onMove(selectedIndex, "down");
        }
    });

    if (focusedId !== 'model_selection' && focusedId !== 'model_details') {
        return null;
    }

    const isActive = isFocused;
    const selectFocused = isFocused && !moveMode;
    const borderColor = moveMode
        ? theme.colors.success
        : editMode
            ? theme.colors.primary
            : theme.colors.secondary;

    return (
        <box flexDirection="column" style={{ width: "100%", height: "80%" }}>
            <scrollbox
                title="Model Selection"
                style={{
                    width: "100%",
                    height: "100%",
                    border: true,
                    borderStyle: isActive ? "double" : "rounded",
                    borderColor: borderColor,
                    rootOptions: {
                        backgroundColor: theme.colors.surface,
                    },
                    wrapperOptions: {
                        backgroundColor: theme.colors.surfaceHighlight,
                    },
                    viewportOptions: {
                        backgroundColor: theme.colors.background,
                    },
                    contentOptions: {
                        backgroundColor: theme.colors.background,
                    },
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
                    focused={selectFocused}
                    selectedIndex={selectedIndex}
                    style={{ 
                        width: "100%", 
                        height: "100%",
                        selectedTextColor: theme.colors.primary,
                        backgroundColor: theme.colors.background,
                        selectedBackgroundColor: theme.colors.surfaceHighlight,
                    }}
                    onChange={(index) => {
                        onSelect(models[index]!);
                    }}
                    onSelect={(index) => {
                        onSelect(models[index]!);
                    }}  
                    options={models} 
                />
            </scrollbox>
            {/* Keyboard hints */}
            <box 
                style={{ 
                    paddingLeft: 1, 
                    paddingTop: 0,
                    height: 1,
                }}
            >
                <text style={{ fg: theme.colors.text.muted }}>
                    {isActive
                        ? moveMode
                            ? "[↑↓] Move  [m/Enter/Esc] Save & Exit"
                            : "[↑↓] Navigate  [Enter] Edit  [m] Reorder  [n] New Model"
                        : "[Tab] Focus"}
                </text>
            </box>
        </box>
    );
}
