import type { SelectOption } from "@opentui/core";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";

export type ModelSelectionProps = {
    models: SelectOption[];
    onSelect: (model: SelectOption) => void;
    selectedModel: SelectOption;
}

export function ModelSelection({ models, onSelect, selectedModel }: ModelSelectionProps) {
    const { isFocused, focus, focusedId } = useFocusState("model_selection");

    if (focusedId !== 'model_selection' && focusedId !== 'model_details') {
        return null;
    }

    const isActive = isFocused;

    return (
        <box flexDirection="column" style={{ width: "100%", height: "80%" }}>
            <scrollbox
                title="Model Selection"
                style={{
                    width: "100%",
                    height: "100%",
                    border: true,
                    borderStyle: isActive ? "double" : "rounded",
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
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
                    focused={isFocused}
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
                    {isActive ? "[↑↓] Navigate  [Enter] Edit  [n] New Model" : "[Tab] Focus"}
                </text>
            </box>
        </box>
    );
}
