import { useEffect, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { theme } from "@/theme";

type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Renders a centered confirmation modal with keyboard-accessible Confirm and Cancel actions.
 *
 * Shows a backdrop and a dialog with a title, message, and two buttons. Left/Right arrow keys switch focus between the Confirm and Cancel options; Enter triggers the currently selected action; Escape triggers cancel.
 *
 * @param isOpen - Whether the modal is visible.
 * @param title - Dialog title text (defaults to "Confirm").
 * @param message - Dialog message text (defaults to "Save changes?").
 * @param confirmLabel - Label for the confirm button (defaults to "Save").
 * @param cancelLabel - Label for the cancel button (defaults to "Cancel").
 * @param onConfirm - Callback invoked when the user confirms.
 * @param onCancel - Callback invoked when the user cancels.
 * @returns The modal element when `isOpen` is true, otherwise `null`.
 */
export function ConfirmModal({
  isOpen,
  title = "Confirm",
  message = "Save changes?",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [selected, setSelected] = useState<"confirm" | "cancel">("confirm");
  const { width, height } = useTerminalDimensions();

  useEffect(() => {
    if (isOpen) {
      setSelected("confirm");
    }
  }, [isOpen]);

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "left" || key.name === "right") {
      setSelected((prev) => (prev === "confirm" ? "cancel" : "confirm"));
    }

    if (key.name === "return") {
      if (selected === "confirm") {
        onConfirm();
      } else {
        onCancel();
      }
    }

    if (key.name === "escape") {
      onCancel();
    }
  });

  if (!isOpen) return null;

  const confirmActive = selected === "confirm";
  const cancelActive = selected === "cancel";

  // Modal dimensions
  const modalWidth = 46;
  const modalHeight = 9;

  // Center the modal
  const left = Math.floor((width - modalWidth) / 2);
  const top = Math.floor((height - modalHeight) / 2);

  return (
    <>
      {/* Backdrop - full screen overlay */}
      <box
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: width,
          height: height,
          backgroundColor: "#000000",
          opacity: 0.6,
        }}
      />
      {/* Modal dialog - centered */}
      <box
        flexDirection="column"
        style={{
          position: "absolute",
          left: left,
          top: top,
          width: modalWidth,
          border: true,
          borderStyle: "double",
          borderColor: theme.colors.primary,
          backgroundColor: theme.colors.surface,
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 1,
          paddingBottom: 1,
        }}
      >
        <text
          attributes={TextAttributes.BOLD}
          style={{ fg: theme.colors.primary, marginBottom: 1 }}
        >
          {title}
        </text>
        <text style={{ fg: theme.colors.text.secondary, marginBottom: 1 }}>
          {message}
        </text>
        <box flexDirection="row" justifyContent="center" gap={2}>
          <box
            style={{
              border: true,
              borderStyle: "rounded",
              borderColor: confirmActive
                ? theme.colors.primary
                : theme.colors.border,
              backgroundColor: confirmActive
                ? theme.colors.surfaceHighlight
                : theme.colors.background,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <text
              attributes={confirmActive ? TextAttributes.BOLD : undefined}
              style={{
                fg: confirmActive
                  ? theme.colors.text.primary
                  : theme.colors.text.muted,
              }}
            >
              {confirmLabel}
            </text>
          </box>
          <box
            style={{
              border: true,
              borderStyle: "rounded",
              borderColor: cancelActive
                ? theme.colors.primary
                : theme.colors.border,
              backgroundColor: cancelActive
                ? theme.colors.surfaceHighlight
                : theme.colors.background,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <text
              attributes={cancelActive ? TextAttributes.BOLD : undefined}
              style={{
                fg: cancelActive
                  ? theme.colors.text.primary
                  : theme.colors.text.muted,
              }}
            >
              {cancelLabel}
            </text>
          </box>
        </box>
        <text style={{ fg: theme.colors.text.muted, marginTop: 1 }}>
          ←/→ Select Enter Confirm Esc Cancel
        </text>
      </box>
    </>
  );
}