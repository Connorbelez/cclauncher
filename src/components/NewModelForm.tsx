import { useState, useMemo, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useFocusState } from "@/hooks/FocusProvider";
import fs from "fs";
import { z } from "zod";
import { theme } from "@/theme";
import { FormField } from "./FormField";
import { TextAttributes } from "@opentui/core";
import { ConfirmModal } from "./ConfirmModal";

const newModelSchema = z.object({
    name: z.string(),
    description: z.string(),
    order: z.number().optional(),
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
    const { isFocused, setFocusedId, focusedId, setModalOpen, setExitGuard, clearExitGuard } = useFocusState("new_model");
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
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const isDirty = useMemo(() => {
        return Boolean(
            newModelName ||
            newModelDescription ||
            newModelValue.ANTHROPIC_BASE_URL ||
            newModelValue.ANTHROPIC_AUTH_TOKEN ||
            newModelValue.ANTHROPIC_MODEL ||
            newModelValue.ANTHROPIC_SMALL_FAST_MODEL ||
            newModelValue.ANTHROPIC_DEFAULT_SONNET_MODEL ||
            newModelValue.ANTHROPIC_DEFAULT_OPUS_MODEL ||
            newModelValue.ANTHROPIC_DEFAULT_HAIKU_MODEL
        );
    }, [newModelName, newModelDescription, newModelValue]);

    const openConfirm = useCallback(() => {
        setIsConfirmOpen(true);
        setModalOpen(true);
    }, [setModalOpen]);

    const closeConfirm = useCallback(() => {
        setIsConfirmOpen(false);
        setModalOpen(false);
    }, [setModalOpen]);

    const handleSave = useCallback(() => {
        console.log("Creating new model");

        // Basic validation
        if (!newModelName) {
            // In a real app we'd show an error message
            return;
        }

        const validatedModel = newModelSchema.safeParse({
            name: newModelName,
            description: newModelDescription,
            value: newModelValue
        });

        if (!validatedModel.success) {
            console.error("Invalid model:", validatedModel.error);
            return;
        }

        try {
            // In a real implementation this should probably use an absolute path or be configurable
            const modelsPath = "/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json";
            const modelsJson = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
            
            // Calculate new order
            const orders = Object.values(modelsJson).map((m: any) => m.order ?? 0);
            const maxOrder = Math.max(...orders as number[], -1);
            const newOrder = maxOrder + 1;
            
            modelsJson[validatedModel.data.name] = {
                ...validatedModel.data,
                order: newOrder
            };
            fs.writeFileSync(modelsPath, JSON.stringify(modelsJson, null, 2));

            // Reset form
            setNewModelName("");
            setNewModelDescription("");
            setNewModelValue({
                ANTHROPIC_BASE_URL: "",
                ANTHROPIC_AUTH_TOKEN: "",
                ANTHROPIC_MODEL: "",
                ANTHROPIC_SMALL_FAST_MODEL: "",
                ANTHROPIC_DEFAULT_SONNET_MODEL: "",
                ANTHROPIC_DEFAULT_OPUS_MODEL: "",
                ANTHROPIC_DEFAULT_HAIKU_MODEL: ""
            });

            setFocusedId('model_selection');
        } catch (err) {
            console.error("Failed to save model:", err);
        }
    }, [newModelName, newModelDescription, newModelValue, setFocusedId]);

    useKeyboard((key) => {
        if (!isFocused || isConfirmOpen) return;

        const TOTAL_FIELDS = 9;

        if (key.name === 'down') {
            setActiveFieldIndex(prev => (prev + 1) % TOTAL_FIELDS);
        } else if (key.name === 'up') {
            setActiveFieldIndex(prev => (prev - 1 + TOTAL_FIELDS) % TOTAL_FIELDS);
        }
        else if (key.name === 'escape') {
            if (isDirty) {
                openConfirm();
                return;
            }
            setFocusedId('model_selection');
        }
        else if (key.name === 'return') {
            if (isDirty) {
                openConfirm();
            }
        }
    });

    useEffect(() => {
        setExitGuard("new_model", (key) => {
            if (isConfirmOpen) {
                return true;
            }
            if (!isDirty) return false;
            if (key.name === "tab") {
                openConfirm();
                return true;
            }
            return false;
        });

        return () => clearExitGuard("new_model");
    }, [clearExitGuard, isConfirmOpen, isDirty, openConfirm, setExitGuard]);

    if (!isFocused) {
        return null;
    }

    return (<>
        <scrollbox
            title="Create New Model"
            style={{ 
                width: "100%",
                height: "100%",
                border: true,
                borderStyle: "rounded",
                borderColor: theme.colors.primary,
                rootOptions: {
                    backgroundColor: theme.colors.surface,
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
            <box flexDirection="column" padding={1} gap={1}>
                <text style={{ fg: theme.colors.text.secondary, marginBottom: 1 }}>
                    Fill in the details below to add a new model configuration.
                </text>

                {/* Model Identity Section */}
                <box flexDirection="column" gap={0}>
                    <text 
                        attributes={TextAttributes.UNDERLINE} 
                        style={{ fg: theme.colors.text.muted, marginBottom: 1 }}
                    >
                        Model Identity
                    </text>
                    
                    <FormField 
                        label="Name *" 
                        value={newModelName} 
                        isFocused={activeFieldIndex === 0} 
                        editMode={true}
                        onChange={(value) => setNewModelName(value)} 
                        placeholder="e.g. My Custom Model"
                    />
                    
                    <FormField 
                        label="Description" 
                        value={newModelDescription} 
                        isFocused={activeFieldIndex === 1} 
                        editMode={true}
                        onChange={(value) => setNewModelDescription(value)} 
                        placeholder="Brief description of usage"
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
                        value={newModelValue.ANTHROPIC_BASE_URL} 
                        isFocused={activeFieldIndex === 2} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_BASE_URL: value})} 
                        placeholder="https://api.anthropic.com"
                    />

                    <FormField 
                        label="Auth Token" 
                        value={newModelValue.ANTHROPIC_AUTH_TOKEN} 
                        isFocused={activeFieldIndex === 3} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_AUTH_TOKEN: value})} 
                        isPassword={true}
                    />

                    <FormField 
                        label="Model" 
                        value={newModelValue.ANTHROPIC_MODEL} 
                        isFocused={activeFieldIndex === 4} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_MODEL: value})} 
                    />

                    <FormField 
                        label="Small Fast Model" 
                        value={newModelValue.ANTHROPIC_SMALL_FAST_MODEL} 
                        isFocused={activeFieldIndex === 5} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_SMALL_FAST_MODEL: value})} 
                        placeholder="e.g. claude-3-haiku-20240307"
                    />

                    <FormField 
                        label="Sonnet Model" 
                        value={newModelValue.ANTHROPIC_DEFAULT_SONNET_MODEL} 
                        isFocused={activeFieldIndex === 6} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_DEFAULT_SONNET_MODEL: value})} 
                        placeholder="e.g. claude-3-5-sonnet-20240620"
                    />

                    <FormField 
                        label="Opus Model" 
                        value={newModelValue.ANTHROPIC_DEFAULT_OPUS_MODEL} 
                        isFocused={activeFieldIndex === 7} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_DEFAULT_OPUS_MODEL: value})} 
                        placeholder="e.g. claude-3-opus-20240229"
                    />

                    <FormField 
                        label="Haiku Model" 
                        value={newModelValue.ANTHROPIC_DEFAULT_HAIKU_MODEL} 
                        isFocused={activeFieldIndex === 8} 
                        editMode={true}
                        onChange={(value) => setNewModelValue({...newModelValue, ANTHROPIC_DEFAULT_HAIKU_MODEL: value})} 
                        placeholder="e.g. claude-3-haiku-20240307"
                    />
                </box>
                
                {/* Footer hints */}
                <box marginTop={1} paddingTop={1}>
                     <text style={{ fg: theme.colors.text.muted }}>
                        [Enter] Save   [Esc] Cancel   [Ctrl+C] Copy   [Ctrl+V] Paste
                     </text>
                </box>
            </box>
        </scrollbox>
        <ConfirmModal
            isOpen={isConfirmOpen}
            title="Create model?"
            message="Do you want to save this new model?"
            confirmLabel="Save"
            cancelLabel="Cancel"
            onConfirm={() => {
                handleSave();
                closeConfirm();
            }}
            onCancel={closeConfirm}
        />
    </>
    );
}
