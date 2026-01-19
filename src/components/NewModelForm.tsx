import { useState } from "react";

import { useKeyboard } from "@opentui/react";
import { useFocusState } from "@/hooks/FocusProvider";
import fs from "fs";
import { z } from "zod";

const newModelSchema = z.object({
    name: z.string(),
    description: z.string(),
    value: z.object({
        ANTHROPIC_BASE_URL: z.string(),
        ANTHROPIC_AUTH_TOKEN: z.string(),
        ANTHROPIC_MODEL: z.string(),
        ANTHROPIC_SMALL_FAST_MODEL: z.string(),
        ANTHROPIC_DEFAULT_SONNET_MODEL: z.string(),
        ANTHROPIC_DEFAULT_OPUS_MODEL: z.string(),
        ANTHROPIC_DEFAULT_HAIKU_MODEL: z.string(),
    }),
});
export function NewModelForm() {
    // "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropica",
    // "ANTHROPIC_AUTH_TOKEN": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJDb25ub3IgQmVsZXpuYXkiLCJVc2VyTmFtZSI6IkNvbm5vciBCZWxlem5heSIsIkFjY291bnQiOiIiLCJTdWJqZWN0SUQiOiIxOTgzOTY4MDkwMzc4OTk4MzI5IiwiUGhvbmUiOiIiLCJHcm91cElEIjoiMTk4Mzk2ODA4Mzg1MjY2NTQwMiIsIlBhZ2VOYW1lIjoiIiwiTWFpbCI6ImMuYmVsZXpuYXlAaHVtYW5mZWVkYmFjay5jb20iLCJDcmVhdGVUaW1lIjoiMjAyNS0xMC0zMSAwMzo0MDoyNCIsIlRva2VuVHlwZSI6MSwiaXNzIjoibWluaW1heCJ9.J8Tq28tm8HGn551zM2wgdN9X0tpE5Rxo5AAg7bHg_rtc-VAyHFuJmxM1PHGwXNAKOgh6jq5eGSLPPRdeM0MKLP32G5WFRzZIB3cyxehiGcr_mlfmeRBe6p11qmS1ooHE7AMEo6XrfLvdh2CPq51YlDED3EynINWodnmm8IzxWenEXN8xVFvq3VcEnJbhe_97hFt6HhXMGOB9RmY37XdvIXzWH1u80tFH7sDDin9RC12O27waP8xL9wHlPy4OcvI2eyrVhVM0lUNFt4d9DvJoEjf9SeyT91EJrP6xlAl3Ug2jwbLOmtoDAwn_jol5Ng81ZmiZEMk_nYH4NZRk0gp84w",
    // "ANTHROPIC_MODEL": "MiniMax-M2",
    // "ANTHROPIC_SMALL_FAST_MODEL": "MiniMax-M2",
    // "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2",
    // "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2",
    // "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2"
    const { isFocused, setFocusedId, focusedId } = useFocusState("new_model");
    const [newModelName, setNewModelName] = useState("");
    const [newModelDescription, setNewModelDescription] = useState("");
    const [newModelValue, setNewModelValue] = useState({
        ANTHROPIC_BASE_URL: "",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "",
        ANTHROPIC_SMALL_FAST_MODEL: "",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: ""
    });
    const [activeFieldIndex, setActiveFieldIndex] = useState(0);

    useKeyboard((key) => {
        if (key.name === 'down') {
            setActiveFieldIndex(prev => (prev + 1) % 9);
        } else if (key.name === 'up') {
            setActiveFieldIndex(prev => (prev - 1 + 9) % 9);
        }
        else if (key.name === 'return' && focusedId === 'new_model') {
            console.log("Creating new model");
            setNewModelName(newModelName);
            setNewModelDescription(newModelDescription);
            setNewModelValue(newModelValue);
            //Write the model to the models.json file
            const validatedModel = newModelSchema.safeParse({
                name: newModelName,
                description: newModelDescription,
                value: newModelValue
            });
            if (!validatedModel.success) {
                console.error("Invalid model:", validatedModel.error);
                return;
            }
            const modelsJson = JSON.parse(fs.readFileSync("/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json", "utf8"));
            modelsJson[validatedModel.data.name] = validatedModel.data;
            fs.writeFileSync("/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json", JSON.stringify(modelsJson, null, 2));
            setFocusedId('model_selection');
        }

    });

    if (!isFocused) {
        return null;
    }
    return (
        <box title="New Model" style={{ border: true, width: "100%", height: "100%", flexDirection: "column", gap: 1, padding: 1 }}>
            <box flexDirection="row" gap={1}>
                <text>Name:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelName} focused={activeFieldIndex === 0} onInput={(value) => setNewModelName(value)} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Description:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelDescription} focused={activeFieldIndex === 1} onInput={(value) => setNewModelDescription(value)} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Base URL:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_BASE_URL} focused={activeFieldIndex === 2} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_BASE_URL: value})} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Auth Token:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_AUTH_TOKEN} focused={activeFieldIndex === 3} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_AUTH_TOKEN: value})} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Model:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_MODEL} focused={activeFieldIndex === 4} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_MODEL: value})} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Small Fast Model:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_SMALL_FAST_MODEL} focused={activeFieldIndex === 5} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_SMALL_FAST_MODEL: value})} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Default Sonnet Model:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_DEFAULT_SONNET_MODEL} focused={activeFieldIndex === 6} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_DEFAULT_SONNET_MODEL: value})} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Default Opus Model:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_DEFAULT_OPUS_MODEL} focused={activeFieldIndex === 7} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_DEFAULT_OPUS_MODEL: value})} />
            </box>
            <box flexDirection="row" gap={1}>
                <text>Default Haiku Model:</text>
                <input style={{ width: "70%", backgroundColor: "blue" }} value={newModelValue.ANTHROPIC_DEFAULT_HAIKU_MODEL} focused={activeFieldIndex === 8} onInput={(value) => setNewModelValue({...newModelValue, ANTHROPIC_DEFAULT_HAIKU_MODEL: value})} />
            </box>
        </box>
    );
}