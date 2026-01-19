import { NewModelForm } from "./NewModelForm";
import { ModelSelection } from "./ModelSelection";
import { ModelDetails } from "./ModelDetails";
import type { SelectOption } from "@opentui/core";
import { useFocusState, useFocusContext } from "@/hooks/FocusProvider";

export type ContentProps = {
    models: SelectOption[];
    selectedModel: SelectOption;
    setSelectedModel: (model: SelectOption) => void;
    onSelect: (model: SelectOption) => void;
    onSave: (model: SelectOption) => void;
    onMove: (fromIndex: number, direction: "up" | "down") => void;
    onReorderEnd: () => void;

}

export function Content({ models, selectedModel, onSelect, setSelectedModel, onSave, onMove, onReorderEnd }: ContentProps) {
    const { focusedId } = useFocusContext();
    if (focusedId === 'model_selection' || focusedId === 'model_details') {
    return (
        <box justifyContent="center" alignItems="flex-start" flexDirection="row" gap={1} width="100%" height="80%">
            <ModelSelection
                models={models}
                onSelect={setSelectedModel}
                selectedModel={selectedModel}
                onMove={onMove}
                onReorderEnd={onReorderEnd}
            />
            <ModelDetails model={selectedModel} onSave={onSave} />
        </box>
        )
    }

    return (
        <box justifyContent="center" alignItems="flex-start" flexDirection="row" gap={1} width="100%" height="100%">
            <NewModelForm />
        </box>
    );
}