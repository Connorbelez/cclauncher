import { theme } from "@/theme";
import { writeClipboard, readClipboard } from "@/utils/clipboard";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState, useEffect, useRef } from "react";

interface FormFieldProps {
  label: string;
  value: string;
  isFocused?: boolean;
  editMode?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  isPassword?: boolean;
  width?: number | "auto" | `${number}%`;
}

/**
 * Renders a labeled form field that supports read-only and edit modes, with optional password masking and keyboard clipboard handling.
 *
 * The field displays a label and either an editable input or a read-only value depending on `editMode`. When `isPassword` and `editMode` are true the input shows a masked value while tracking the real value via keyboard and clipboard events.
 *
 * @param label - Visible label for the field
 * @param value - Current value of the field (source of truth)
 * @param isFocused - When true, renders focus styling and enables keyboard handlers
 * @param editMode - When true, renders an editable input; otherwise renders a read-only value view
 * @param onChange - Optional change callback invoked with the new actual value when the user edits the field (including typed characters, backspace, or paste)
 * @param placeholder - Placeholder text shown when the value is empty
 * @param isPassword - When true, masks the displayed value and treats input specially to keep the actual value out of the visible UI
 * @param width - CSS-like width for the component container (number, "auto", or percent string)
 * @returns A JSX element representing the configured form field
 */
export function FormField({
  label,
  value,
  isFocused = false,
  editMode = false,
  onChange,
  placeholder = "",
  isPassword = false,
  width = "100%",
}: FormFieldProps) {
  const [maskedValue, setMaskedValue] = useState("");
  const actualValueRef = useRef(value);
  const lastKeyRef = useRef<string | null>(null);

  // Sync actual value ref when value prop changes
  useEffect(() => {
    actualValueRef.current = value;
    if (isPassword && editMode) {
      setMaskedValue("*".repeat(value.length));
    }
  }, [value, isPassword, editMode]);

  const handleInput = (nextValue: string) => {
    if (isPassword && editMode) {
      // For password fields, the input value is masked (asterisks)
      // We track the actual value separately via keyboard events
      // Sync the masked display with the input length
      const currentLength = maskedValue.length;
      const nextLength = nextValue.length;

      if (nextLength > currentLength) {
        // Character(s) added
        if (
          lastKeyRef.current &&
          nextLength === currentLength + 1 &&
          onChange
        ) {
          // Single character typed - use captured key
          const newValue = actualValueRef.current + lastKeyRef.current;
          actualValueRef.current = newValue;
          onChange(newValue);
          setMaskedValue("*".repeat(newValue.length));
          lastKeyRef.current = null;
        } else {
          // Multiple characters or no captured key - just sync display length
          // The actual value will be handled by paste handler in useKeyboard if needed
          setMaskedValue("*".repeat(nextLength));
        }
      } else if (nextLength < currentLength) {
        // Character(s) removed - sync display (backspace handled in keyboard handler)
        setMaskedValue("*".repeat(nextLength));
      } else {
        // Length unchanged - might be cursor movement or other input
        setMaskedValue(nextValue);
      }
    } else {
      onChange?.(nextValue);
    }
  };

  // Combined keyboard handler for copy/paste and password character tracking
  useKeyboard((key) => {
    if (!isFocused) return;

    // Copy to clipboard
    if (
      ((key.meta || (key as { super?: boolean }).super) && key.name === "c") ||
      (key.ctrl && key.shift && key.name === "c")
    ) {
      void writeClipboard(value);
    }

    // Paste from clipboard
    if (
      (key.meta || key.ctrl || (key as { super?: boolean }).super) &&
      key.name === "v" &&
      onChange
    ) {
      if (isPassword && editMode) {
        // For password fields, paste the actual value but display masked
        void readClipboard().then((text) => {
          actualValueRef.current = text;
          onChange(text);
          setMaskedValue("*".repeat(text.length));
        });
      } else {
        void readClipboard().then((text) => onChange(text));
      }
    }

    // Track printable characters for password fields
    if (isPassword && editMode && onChange) {
      // Capture printable characters (single character keys)
      if (
        key.name &&
        key.name.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        !key.shift
      ) {
        lastKeyRef.current = key.name;
      } else if (key.shift && key.name && key.name.length === 1) {
        // Handle shift+character for uppercase/special chars
        if (key.sequence && key.sequence.length === 1) {
          lastKeyRef.current = key.sequence;
        } else {
          lastKeyRef.current = key.name;
        }
      }

      // Handle backspace
      if (key.name === "backspace") {
        const newValue = actualValueRef.current.slice(0, -1);
        actualValueRef.current = newValue;
        onChange(newValue);
        setMaskedValue("*".repeat(newValue.length));
        lastKeyRef.current = null;
      }
    }
  });

  return (
    <box flexDirection="column" style={{ width: width, marginBottom: 1 }}>
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
              borderColor: isFocused
                ? theme.colors.primary
                : theme.colors.border,
              backgroundColor: theme.colors.background,
              paddingLeft: 1,
              paddingRight: 1,
              height: 3, // Height includes border
            }}
          >
            <input
              value={isPassword ? maskedValue : value}
              placeholder={placeholder}
              focused={isFocused}
              onInput={onChange ? handleInput : undefined}
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
              {isPassword ? "********" : value || placeholder || "Not set"}
            </text>
          </box>
        </box>
      )}
    </box>
  );
}
