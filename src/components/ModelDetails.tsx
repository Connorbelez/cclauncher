import type { SelectOption, ScrollBoxRenderable } from "@opentui/core";
import { useFocusState } from "@/hooks/FocusProvider";
import { useEffect, useState, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import type { BorderStyle } from "@opentui/core";

export type ModelDetailsProps = {
    model: SelectOption;
    onSave: (model: SelectOption) => void;
}





export function ModelDetails({ model, onSave }: ModelDetailsProps) {
    const { editMode, setEditMode, isFocused, setFocusedId, focusedId } = useFocusState("model_details");
    const scrollboxRef = useRef<ScrollBoxRenderable>(null);
    // "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
    // "ANTHROPIC_AUTH_TOKEN": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJDb25ub3IgQmVsZXpuYXkiLCJVc2VyTmFtZSI6IkNvbm5vciBCZWxlem5heSIsIkFjY291bnQiOiIiLCJTdWJqZWN0SUQiOiIxOTgzOTY4MDkwMzc4OTk4MzI5IiwiUGhvbmUiOiIiLCJHcm91cElEIjoiMTk4Mzk2ODA4Mzg1MjY2NTQwMiIsIlBhZ2VOYW1lIjoiIiwiTWFpbCI6ImMuYmVsZXpuYXlAaHVtYW5mZWVkYmFjay5jb20iLCJDcmVhdGVUaW1lIjoiMjAyNS0xMC0zMSAwMzo0MDoyNCIsIlRva2VuVHlwZSI6MSwiaXNzIjoibWluaW1heCJ9.J8Tq28tm8HGn551zM2wgdN9X0tpE5Rxo5AAg7bHg_rtc-VAyHFuJmxM1PHGwXNAKOgh6jq5eGSLPPRdeM0MKLP32G5WFRzZIB3cyxehiGcr_mlfmeRBe6p11qmS1ooHE7AMEo6XrfLvdh2CPq51YlDED3EynINWodnmm8IzxWenEXN8xVFvq3VcEnJbhe_97hFt6HhXMGOB9RmY37XdvIXzWH1u80tFH7sDDin9RC12O27waP8xL9wHlPy4OcvI2eyrVhVM0lUNFt4d9DvJoEjf9SeyT91EJrP6xlAl3Ug2jwbLOmtoDAwn_jol5Ng81ZmiZEMk_nYH4NZRk0gp84w",
    // "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    // "ANTHROPIC_MODEL": "MiniMax-M2",
    // "ANTHROPIC_SMALL_FAST_MODEL": "MiniMax-M2",
    // "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2",
    // "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2",
    // "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2"
    const [anthropicBaseUrl, setAnthropicBaseUrl] = useState(model.value.ANTHROPIC_BASE_URL);
    const [anthropicAuthToken, setAnthropicAuthToken] = useState(model.value.ANTHROPIC_AUTH_TOKEN);
    const [anthropicModel, setAnthropicModel] = useState(model.value.ANTHROPIC_MODEL);
    const [anthropicSmallFastModel, setAnthropicSmallFastModel] = useState(model.value.ANTHROPIC_SMALL_FAST_MODEL);
    const [anthropicDefaultSonnetModel, setAnthropicDefaultSonnetModel] = useState(model.value.ANTHROPIC_DEFAULT_SONNET_MODEL);
    const [anthropicDefaultOpusModel, setAnthropicDefaultOpusModel] = useState(model.value.ANTHROPIC_DEFAULT_OPUS_MODEL);
    const [anthropicDefaultHaikuModel, setAnthropicDefaultHaikuModel] = useState(model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    const [activeFieldIndex, setActiveFieldIndex] = useState(0);
    
    useEffect(() => {
        if (editMode) {
            setActiveFieldIndex(0);
            setAnthropicBaseUrl(model.value.ANTHROPIC_BASE_URL);
            setAnthropicAuthToken(model.value.ANTHROPIC_AUTH_TOKEN);
            setAnthropicModel(model.value.ANTHROPIC_MODEL);
            setAnthropicSmallFastModel(model.value.ANTHROPIC_SMALL_FAST_MODEL);
            setAnthropicDefaultSonnetModel(model.value.ANTHROPIC_DEFAULT_SONNET_MODEL);
            setAnthropicDefaultOpusModel(model.value.ANTHROPIC_DEFAULT_OPUS_MODEL);
            setAnthropicDefaultHaikuModel(model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL);
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
    return (
        <scrollbox
        ref={scrollboxRef}
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
        title="Model Details"
        
      >            
            {editMode ? (
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}> 
                    <text>Name:</text>
                    <input value={model.name} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 0} onInput={(value) => model.name = value}/>
                </box>
            ) : (
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>{model.name}</text>
                </box>
            )}
            {editMode ? (
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Description:</text>
                    <input value={model.description} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 1} onInput={(value) => model.description = value} />
                </box>
            ) : (
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>{model.description}</text>
                </box>
            )}
            {editMode ? (
                <box flexDirection="column" gap={1}>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Base URL:</text>
                    <input value={anthropicBaseUrl} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 2} onInput={(value) => setAnthropicBaseUrl(value)} />
                </box>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Auth Token:</text>
                    <input value={anthropicAuthToken} style={{ width: "70%", backgroundColor: "blue"}} focused={isFocused && activeFieldIndex === 3} onInput={(value) => setAnthropicAuthToken(value)} />
                </box>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Model:</text>
                    <input value={anthropicModel} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 4} onInput={(value) => setAnthropicModel(value)} />
                </box>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Small Fast Model:</text>
                    <input value={anthropicSmallFastModel} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 5} onInput={(value) => setAnthropicSmallFastModel(value)} />
                </box>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Default Sonnet Model:</text>
                    <input value={anthropicDefaultSonnetModel} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 6} onInput={(value) => setAnthropicDefaultSonnetModel(value)} />
                </box>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Default Opus Model:</text>
                    <input value={anthropicDefaultOpusModel} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 7} onInput={(value) => setAnthropicDefaultOpusModel(value)} />
                </box>
                <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                    <text>Default Haiku Model:</text>
                    <input value={anthropicDefaultHaikuModel} style={{ width: "70%", backgroundColor: "blue" }} focused={isFocused && activeFieldIndex === 8} onInput={(value) => setAnthropicDefaultHaikuModel(value)} />
                </box>
                </box>
            ) : (
                <box flexDirection="column" gap={1}>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Base URL:</text>
                        <text>{model.value.ANTHROPIC_BASE_URL}</text>
                    </box>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Auth Token:</text>
                        <text>********</text>
                    </box>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Model:</text>
                        <text>{model.value.ANTHROPIC_MODEL}</text>
                    </box>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Small Fast Model:</text>
                        <text>{model.value.ANTHROPIC_SMALL_FAST_MODEL}</text>
                    </box>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Default Sonnet Model:</text>
                        <text>{model.value.ANTHROPIC_DEFAULT_SONNET_MODEL}</text>
                    </box>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Default Opus Model:</text>
                        <text>{model.value.ANTHROPIC_DEFAULT_OPUS_MODEL}</text>
                    </box>
                    <box flexDirection="row" style={{ border: true, borderColor: "blue", borderStyle: "rounded"}} gap={1}>
                        <text>Default Haiku Model:</text>
                        <text>{model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL}</text>
                    </box>
                </box>
            )}
        </scrollbox>
    );
}