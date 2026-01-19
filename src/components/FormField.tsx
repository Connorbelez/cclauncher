import { theme } from "@/theme";
import { TextAttributes } from "@opentui/core";

interface FormFieldProps {
    label: string;
    value: string;
    isFocused?: boolean;
    editMode?: boolean;
    onChange?: (value: string) => void;
    placeholder?: string;
    isPassword?: boolean;
    width?: number | string;
}

export function FormField({ 
    label, 
    value, 
    isFocused = false, 
    editMode = false, 
    onChange, 
    placeholder = "", 
    isPassword = false,
    width = "100%"
}: FormFieldProps) {
    
    return (
        <box flexDirection="column" style={{ width: width as "100%" | `${number}%` | number, marginBottom: 1 }}>
            {editMode ? (
                <>
                    <text 
                        style={{ 
                            fg: isFocused ? theme.colors.primary : theme.colors.secondary,
                        }}
                        attributes={isFocused ? TextAttributes.BOLD : undefined}
                    >
                        {label}
                    </text>
                    <box 
                        style={{ 
                            border: true, 
                            borderStyle: "rounded",
                            borderColor: isFocused ? theme.colors.primary : theme.colors.border,
                            backgroundColor: theme.colors.background,
                            paddingLeft: 1,
                            paddingRight: 1,
                            height: 3 // Height includes border
                        }}
                    >
                        <input 
                            value={value} 
                            placeholder={placeholder}
                            focused={isFocused}
                            onInput={onChange}
                            style={{
                                textColor: theme.colors.text.primary,
                                backgroundColor: theme.colors.background, // Match container
                            }}
                        />
                    </box>
                </>
            ) : (
                <box flexDirection="row" style={{ width: "100%" }}>
                    <box style={{ width: 18 }}>
                        <text 
                            style={{ 
                                fg: theme.colors.secondary,
                            }}
                        >
                            {label}
                        </text>
                    </box>
                    <box style={{ paddingLeft: 1 }}>
                        <text style={{ fg: theme.colors.text.primary }}>
                            {isPassword ? "********" : (value || placeholder || "Not set")}
                        </text>
                    </box>
                </box>
            )}
        </box>
    );
}
