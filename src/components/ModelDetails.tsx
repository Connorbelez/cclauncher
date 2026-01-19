import type { SelectOption, ScrollBoxRenderable } from "@opentui/core";
import { useFocusState } from "@/hooks/FocusProvider";
import { useEffect, useState, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { theme } from "@/theme";
import { FormField } from "./FormField";
import { TextAttributes } from "@opentui/core";

export type ModelDetailsProps = {
    model: SelectOption;
    onSave: (model: SelectOption) => void;
}

export function ModelDetails({ model, onSave }: ModelDetailsProps) {
    const { editMode, setEditMode, isFocused, setFocusedId, focusedId } = useFocusState("model_details");
    const scrollboxRef = useRef<ScrollBoxRenderable>(null);

    const [anthropicBaseUrl, setAnthropicBaseUrl] = useState(model.value.ANTHROPIC_BASE_URL);
    const [anthropicAuthToken, setAnthropicAuthToken] = useState(model.value.ANTHROPIC_AUTH_TOKEN);
    const [anthropicModel, setAnthropicModel] = useState(model.value.ANTHROPIC_MODEL);
    const [anthropicSmallFastModel, setAnthropicSmallFastModel] = useState(model.value.ANTHROPIC_SMALL_FAST_MODEL);
    const [anthropicDefaultSonnetModel, setAnthropicDefaultSonnetModel] = useState(model.value.ANTHROPIC_DEFAULT_SONNET_MODEL);
    const [anthropicDefaultOpusModel, setAnthropicDefaultOpusModel] = useState(model.value.ANTHROPIC_DEFAULT_OPUS_MODEL);
    const [anthropicDefaultHaikuModel, setAnthropicDefaultHaikuModel] = useState(model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    const [activeFieldIndex, setActiveFieldIndex] = useState(0);
    
    // Keep local state in sync when model changes
    useEffect(() => {
        setAnthropicBaseUrl(model.value.ANTHROPIC_BASE_URL);
        setAnthropicAuthToken(model.value.ANTHROPIC_AUTH_TOKEN);
        setAnthropicModel(model.value.ANTHROPIC_MODEL);
        setAnthropicSmallFastModel(model.value.ANTHROPIC_SMALL_FAST_MODEL);
        setAnthropicDefaultSonnetModel(model.value.ANTHROPIC_DEFAULT_SONNET_MODEL);
        setAnthropicDefaultOpusModel(model.value.ANTHROPIC_DEFAULT_OPUS_MODEL);
        setAnthropicDefaultHaikuModel(model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    }, [model]);

    useEffect(() => {
        if (editMode) {
            setActiveFieldIndex(0);
        }
    }, [editMode]);

    useKeyboard((key) => {
        if (!isFocused) return;

        if (editMode) {
            // In edit mode, arrow keys navigate between fields
            const TOTAL_FIELDS = 9; // Name, Description, and the 7 config fields

            if (key.name === 'down') {
                setActiveFieldIndex(prev => (prev + 1) % TOTAL_FIELDS);
            } else if (key.name === 'up') {
                setActiveFieldIndex(prev => (prev - 1 + TOTAL_FIELDS) % TOTAL_FIELDS);
            }

            if (key.name === 'return') {
                onSave({
                    ...model,
                    value: {
                        ...model.value,
                        ANTHROPIC_BASE_URL: anthropicBaseUrl,
                        ANTHROPIC_AUTH_TOKEN: anthropicAuthToken,
                        ANTHROPIC_MODEL: anthropicModel,
                        ANTHROPIC_SMALL_FAST_MODEL: anthropicSmallFastModel,
                        ANTHROPIC_DEFAULT_SONNET_MODEL: anthropicDefaultSonnetModel,
                        ANTHROPIC_DEFAULT_OPUS_MODEL: anthropicDefaultOpusModel,
                        ANTHROPIC_DEFAULT_HAIKU_MODEL: anthropicDefaultHaikuModel,
                    }
                });
                setEditMode(false);
                setFocusedId('model_selection');
            }
        } else {
            // Not in edit mode, arrow keys scroll the content
            if (key.name === 'down') {
                scrollboxRef.current?.scrollBy(1);
            } else if (key.name === 'up') {
                scrollboxRef.current?.scrollBy(-1);
            }
        }
    });

    if (focusedId !== 'model_details' && focusedId !== 'model_selection') {
        return null;
    }

    const isActive = isFocused;

    return (
        <scrollbox
            ref={scrollboxRef}
            title={editMode ? `Editing: ${model.name}` : "Model Details"}
            style={{
                width: "100%",
                height: "80%",
                border: true,
                borderStyle: isActive ? "double" : "rounded",
                borderColor: isActive ? theme.colors.primary : theme.colors.border,
                rootOptions: { backgroundColor: theme.colors.surface },
                wrapperOptions: { backgroundColor: theme.colors.surfaceHighlight },
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
        >
            <box flexDirection="column" padding={1} gap={1}>
                {/* Header Section */}
                <box flexDirection="column" marginBottom={1}>
                    <text 
                        attributes={TextAttributes.BOLD} 
                        style={{ fg: theme.colors.text.primary }}
                    >
                        {model.name}
                    </text>
                    <text style={{ fg: theme.colors.text.secondary }}>
                        {model.description}
                    </text>
                </box>

                {/* Basic Info Section */}
                <box flexDirection="column" gap={0}>
                    <text 
                        attributes={TextAttributes.UNDERLINE} 
                        style={{ fg: theme.colors.text.muted, marginBottom: 1 }}
                    >
                        Basic Info
                    </text>
                    
                    <FormField 
                        label="Name" 
                        value={model.name} 
                        isFocused={isActive && editMode && activeFieldIndex === 0}
                        editMode={editMode}
                        onChange={(val) => model.name = val}
                    />
                    
                    <FormField 
                        label="Description" 
                        value={model.description} 
                        isFocused={isActive && editMode && activeFieldIndex === 1}
                        editMode={editMode}
                        onChange={(val) => model.description = val}
                    />
                </box>

                {/* API Configuration Section */}
                <box flexDirection="column" gap={0} marginTop={1}>
                    <text 
                        attributes={TextAttributes.UNDERLINE} 
                        style={{ fg: theme.colors.text.muted, marginBottom: 1 }}
                    >
                        API Configuration
                    </text>

                    <FormField 
                        label="Base URL" 
                        value={anthropicBaseUrl} 
                        isFocused={isActive && editMode && activeFieldIndex === 2}
                        editMode={editMode}
                        onChange={setAnthropicBaseUrl}
                        placeholder="https://api.anthropic.com"
                    />

                    <FormField 
                        label="Auth Token" 
                        value={anthropicAuthToken} 
                        isFocused={isActive && editMode && activeFieldIndex === 3}
                        editMode={editMode}
                        onChange={setAnthropicAuthToken}
                        isPassword={true}
                    />

                    <FormField 
                        label="Model" 
                        value={anthropicModel} 
                        isFocused={isActive && editMode && activeFieldIndex === 4}
                        editMode={editMode}
                        onChange={setAnthropicModel}
                    />

                    <FormField 
                        label="Small Fast Model" 
                        value={anthropicSmallFastModel} 
                        isFocused={isActive && editMode && activeFieldIndex === 5}
                        editMode={editMode}
                        onChange={setAnthropicSmallFastModel}
                        placeholder="e.g. claude-3-haiku-20240307"
                    />

                    <FormField 
                        label="Sonnet Model" 
                        value={anthropicDefaultSonnetModel} 
                        isFocused={isActive && editMode && activeFieldIndex === 6}
                        editMode={editMode}
                        onChange={setAnthropicDefaultSonnetModel}
                        placeholder="e.g. claude-3-5-sonnet-20240620"
                    />

                    <FormField 
                        label="Opus Model" 
                        value={anthropicDefaultOpusModel} 
                        isFocused={isActive && editMode && activeFieldIndex === 7}
                        editMode={editMode}
                        onChange={setAnthropicDefaultOpusModel}
                        placeholder="e.g. claude-3-opus-20240229"
                    />

                    <FormField 
                        label="Haiku Model" 
                        value={anthropicDefaultHaikuModel} 
                        isFocused={isActive && editMode && activeFieldIndex === 8}
                        editMode={editMode}
                        onChange={setAnthropicDefaultHaikuModel}
                        placeholder="e.g. claude-3-haiku-20240307"
                    />
                </box>
            </box>
        </scrollbox>
    );
}
