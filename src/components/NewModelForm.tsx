import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";
import { type SaveModelResult, saveModelToFile } from "@/utils/models";
import { ConfirmModal } from "./ConfirmModal";
import { FormField } from "./FormField";

const newModelSchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	description: z.string(),
	order: z.number().optional(),
	value: z.object({
		ANTHROPIC_BASE_URL: z.string().trim().min(1, "Base URL is required"),
		ANTHROPIC_AUTH_TOKEN: z.string(),
		ANTHROPIC_MODEL: z.string().trim().min(1, "Model is required"),
		ANTHROPIC_SMALL_FAST_MODEL: z.string(),
		ANTHROPIC_DEFAULT_SONNET_MODEL: z.string(),
		ANTHROPIC_DEFAULT_OPUS_MODEL: z.string(),
		ANTHROPIC_DEFAULT_HAIKU_MODEL: z.string(),
	}),
});

/**
 * Renders an interactive "Create New Model" form with keyboard navigation, validation, and save/overwrite confirmation flows.
 *
 * The component manages form state for model identity and Anthropica API configuration, prevents accidental exit when changes are pending,
 * validates input using the `newModelSchema`, and persists configurations via `saveModelToFile`. It also exposes keyboard shortcuts
 * for field navigation, submit (Enter) and cancel (Esc), and shows inline error messages when validation or save fails.
 *
 * @returns The form UI for creating a new model, or `null` when the form is not focused.
 */
export function NewModelForm() {
	const {
		isFocused,
		setFocusedId,
		setModalOpen,
		setExitGuard,
		clearExitGuard,
	} = useFocusState("new_model");
	const [newModelName, setNewModelName] = useState("");
	const [newModelDescription, setNewModelDescription] = useState("");
	const [newModelValue, setNewModelValue] = useState({
		ANTHROPIC_BASE_URL: "",
		ANTHROPIC_AUTH_TOKEN: "",
		ANTHROPIC_MODEL: "",
		ANTHROPIC_SMALL_FAST_MODEL: "",
		ANTHROPIC_DEFAULT_SONNET_MODEL: "",
		ANTHROPIC_DEFAULT_OPUS_MODEL: "",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
	});
	const [activeFieldIndex, setActiveFieldIndex] = useState(0);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);

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

	const openOverwriteConfirm = useCallback(() => {
		setIsOverwriteConfirmOpen(true);
		setModalOpen(true);
	}, [setModalOpen]);

	const closeOverwriteConfirm = useCallback(() => {
		setIsOverwriteConfirmOpen(false);
		setModalOpen(false);
	}, [setModalOpen]);

	const handleSave = useCallback(
		(allowOverwrite: boolean): SaveModelResult => {
			setErrorMessage(null);

			const validatedModel = newModelSchema.safeParse({
				name: newModelName,
				description: newModelDescription,
				value: newModelValue,
			});

			if (!validatedModel.success) {
				const errorMessages = validatedModel.error.issues.map(
					(err: z.ZodIssue) => {
						const path = err.path.join(".");
						return `${path}: ${err.message}`;
					}
				);
				const message = `Validation failed:\n${errorMessages.join("\n")}`;
				setErrorMessage(message);
				return { ok: false, reason: "validation", message };
			}

			const result = saveModelToFile(validatedModel.data, {
				allowOverwrite,
				setOrderIfMissing: true,
			});

			if (!result.ok) {
				if (result.reason !== "duplicate") {
					setErrorMessage(result.message);
				}
				return result;
			}

			setNewModelName("");
			setNewModelDescription("");
			setNewModelValue({
				ANTHROPIC_BASE_URL: "",
				ANTHROPIC_AUTH_TOKEN: "",
				ANTHROPIC_MODEL: "",
				ANTHROPIC_SMALL_FAST_MODEL: "",
				ANTHROPIC_DEFAULT_SONNET_MODEL: "",
				ANTHROPIC_DEFAULT_OPUS_MODEL: "",
				ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
			});
			setErrorMessage(null);
			setFocusedId("model_selection");
			return result;
		},
		[newModelName, newModelDescription, newModelValue, setFocusedId]
	);

	const resetForm = useCallback(() => {
		setNewModelName("");
		setNewModelDescription("");
		setNewModelValue({
			ANTHROPIC_BASE_URL: "",
			ANTHROPIC_AUTH_TOKEN: "",
			ANTHROPIC_MODEL: "",
			ANTHROPIC_SMALL_FAST_MODEL: "",
			ANTHROPIC_DEFAULT_SONNET_MODEL: "",
			ANTHROPIC_DEFAULT_OPUS_MODEL: "",
			ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
		});
		setActiveFieldIndex(0);
		setErrorMessage(null);
	}, []);

	useKeyboard((key) => {
		if (!isFocused || isConfirmOpen || isOverwriteConfirmOpen) {
			return;
		}

		const TOTAL_FIELDS = 9;

		if (key.name === "down") {
			setActiveFieldIndex((prev) => (prev + 1) % TOTAL_FIELDS);
		} else if (key.name === "up") {
			setActiveFieldIndex((prev) => (prev - 1 + TOTAL_FIELDS) % TOTAL_FIELDS);
		} else if (key.name === "escape") {
			if (isDirty) {
				openConfirm();
				return;
			}
			setFocusedId("model_selection");
		} else if (key.name === "return" && isDirty) {
			openConfirm();
		}
	});

	useEffect(() => {
		setExitGuard("new_model", (key) => {
			if (isConfirmOpen || isOverwriteConfirmOpen) {
				return true;
			}
			if (!isDirty) {
				return false;
			}
			if (key.name === "tab") {
				openConfirm();
				return true;
			}
			return false;
		});

		return () => clearExitGuard("new_model");
	}, [
		clearExitGuard,
		isConfirmOpen,
		isDirty,
		isOverwriteConfirmOpen,
		openConfirm,
		setExitGuard,
	]);

	if (!isFocused) {
		return null;
	}

	return (
		<>
			<box
				flexDirection="column"
				flexGrow={1}
				style={{ width: "100%" }}
			>
				<scrollbox
					style={{
						width: "100%",
						flexGrow: 1,
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
					title="Create New Model"
				>
					<box flexDirection="column" gap={1} padding={1}>
					<text style={{ fg: theme.colors.text.secondary, marginBottom: 1 }}>
						Fill in the details below to add a new model configuration.
					</text>

					{/* Error Message Display */}
					{errorMessage && (
						<box
							flexDirection="column"
							style={{
								border: true,
								borderStyle: "rounded",
								borderColor: "#ef4444", // Red border for errors
								backgroundColor: "#1f1f1f", // Dark background
								paddingLeft: 1,
								paddingRight: 1,
								paddingTop: 1,
								paddingBottom: 1,
								marginBottom: 1,
							}}
						>
							<text
								attributes={TextAttributes.BOLD}
								style={{ fg: "#ef4444", marginBottom: 1 }}
							>
								Error
							</text>
							{errorMessage.split("\n").map((line, idx) => (
								<text
									key={`${idx}-${line}`}
									style={{ fg: theme.colors.text.primary }}
								>
									{line}
								</text>
							))}
						</box>
					)}

					{/* Model Identity Section */}
					<box flexDirection="column" gap={0}>
						<text
							attributes={TextAttributes.UNDERLINE}
							style={{ fg: theme.colors.text.muted, marginBottom: 1 }}
						>
							Model Identity
						</text>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 0}
							label="Name *"
							onChange={(value) => {
								setNewModelName(value);
								// Clear error when user starts typing
								if (errorMessage) {
									setErrorMessage(null);
								}
							}}
							placeholder="e.g. My Custom Model"
							value={newModelName}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 1}
							label="Description"
							onChange={(value) => setNewModelDescription(value)}
							placeholder="Brief description of usage"
							value={newModelDescription}
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
							editMode={true}
							isFocused={activeFieldIndex === 2}
							label="Base URL"
							onChange={(value) =>
								setNewModelValue({
									...newModelValue,
									ANTHROPIC_BASE_URL: value,
								})
							}
							placeholder="https://api.anthropic.com"
							value={newModelValue.ANTHROPIC_BASE_URL}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 3}
							isPassword={true}
							label="Auth Token"
							onChange={(value) =>
								setNewModelValue({
									...newModelValue,
									ANTHROPIC_AUTH_TOKEN: value,
								})
							}
							value={newModelValue.ANTHROPIC_AUTH_TOKEN}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 4}
							label="Model"
							onChange={(value) =>
								setNewModelValue({ ...newModelValue, ANTHROPIC_MODEL: value })
							}
							value={newModelValue.ANTHROPIC_MODEL}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 5}
							label="Small Fast Model"
							onChange={(value) =>
								setNewModelValue({
									...newModelValue,
									ANTHROPIC_SMALL_FAST_MODEL: value,
								})
							}
							placeholder="e.g. claude-3-haiku-20240307"
							value={newModelValue.ANTHROPIC_SMALL_FAST_MODEL}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 6}
							label="Sonnet Model"
							onChange={(value) =>
								setNewModelValue({
									...newModelValue,
									ANTHROPIC_DEFAULT_SONNET_MODEL: value,
								})
							}
							placeholder="e.g. claude-3-5-sonnet-20240620"
							value={newModelValue.ANTHROPIC_DEFAULT_SONNET_MODEL}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 7}
							label="Opus Model"
							onChange={(value) =>
								setNewModelValue({
									...newModelValue,
									ANTHROPIC_DEFAULT_OPUS_MODEL: value,
								})
							}
							placeholder="e.g. claude-3-opus-20240229"
							value={newModelValue.ANTHROPIC_DEFAULT_OPUS_MODEL}
						/>

						<FormField
							editMode={true}
							isFocused={activeFieldIndex === 8}
							label="Haiku Model"
							onChange={(value) =>
								setNewModelValue({
									...newModelValue,
									ANTHROPIC_DEFAULT_HAIKU_MODEL: value,
								})
							}
							placeholder="e.g. claude-3-haiku-20240307"
							value={newModelValue.ANTHROPIC_DEFAULT_HAIKU_MODEL}
						/>
					</box>
					</box>
				</scrollbox>
			</box>
			<ConfirmModal
				cancelLabel="Cancel"
				confirmLabel="Save"
				isOpen={isConfirmOpen}
				message="Do you want to save this new model?"
				onCancel={() => {
					resetForm();
					setFocusedId("model_selection");
					closeConfirm();
				}}
				onConfirm={() => {
					const result = handleSave(false);
					closeConfirm();
					if (!result.ok && result.reason === "duplicate") {
						openOverwriteConfirm();
					}
				}}
				title="Create model?"
			/>
			<ConfirmModal
				cancelLabel="Cancel"
				confirmLabel="Overwrite"
				isOpen={isOverwriteConfirmOpen}
				message="A model with this name already exists. Do you want to overwrite it?"
				onCancel={() => {
					closeOverwriteConfirm();
				}}
				onConfirm={() => {
					handleSave(true);
					closeOverwriteConfirm();
				}}
				title="Overwrite existing model?"
			/>
		</>
	);
}
