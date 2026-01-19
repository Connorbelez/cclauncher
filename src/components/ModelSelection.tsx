import type { SelectOption } from "@opentui/core";
import { useFocusState } from "@/hooks/FocusProvider";

const models:SelectOption[] = [
    { name: "model_1", description: "Model 1", value: "model_1" },
    { name: "model_2", description: "Model 2", value: "model_2" },
    { name: "model_3", description: "Model 3", value: "model_3" }
];

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
    return (
        <scrollbox
            title="Model Selection"
            style={{
                width: "100%",
                height: "80%",
                border: true,
                borderStyle: "rounded",
                rootOptions: {
                    backgroundColor: "#24283b",
                },
                wrapperOptions: {
                    backgroundColor: "#1f2335",
                },
                viewportOptions: {
                    backgroundColor: "#1a1b26",
                },
                contentOptions: {
                    backgroundColor: "#16161e",
                },
                scrollbarOptions: {
                    showArrows: true,
                    trackOptions: {
                        foregroundColor: "#7aa2f7",
                        backgroundColor: "#414868",
                    },
                },
            }}
        >
            <select 
                focused={isFocused}
                style={{ width: "100%", height: "100%" }}
                onChange={(index) => {
                    console.log("Auto-selecting:", models[index]);
                    onSelect(models[index]!);
                }}
                onSelect={(index) => {
                    console.log("Selected:", models[index]);
                    onSelect(models[index]!);
                }}  
                options={models} 
            />
        </scrollbox>
    );
}