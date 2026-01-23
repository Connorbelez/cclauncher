import type { ScrollBoxRenderable, SelectOption } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useFocusState } from "@/hooks/FocusProvider";
import { theme } from "@/theme";
import { ConfirmModal } from "./ConfirmModal";
import { FormField } from "./FormField";

export interface ModelDetailsProps {
	model: SelectOption;
	onSave: (
		model: SelectOption,
		originalName?: string,
		options?: { allowOverwrite?: boolean }
	) => {
		ok: boolean;
		reason?: "validation" | "duplicate" | "read" | "write";
		message?: string;
	};
}

const editModelSchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	value: z.object({
		ANTHROPIC_BASE_URL: z.string().trim().min(1, "Base URL is required"),
		ANTHROPIC_MODEL: z.string().trim().min(1, "Model is required"),
	}),
});

/**
 * Render an editable model details panel with validation, keyboard navigation, and a two-step save/overwrite flow.
 *
 * @param model - The model option to display and edit (initial field values are read from `model`).
 * @param onSave - Callback invoked to persist changes. Called with the updated model, the original model name, and an options object `{ allowOverwrite?: boolean }`. Must return an object `{ ok: boolean; reason?: "validation" | "duplicate" | "read" | "write"; message?: string }` where `ok` indicates success; if a duplicate exists the callback should return `reason: "duplicate"`.
 * @returns The React element that renders the model details editor, including input fields, validation error display, and confirmation modals.
 */
export function ModelDetails({ model, onSave }: ModelDetailsProps) {
	const {
		editMode,
		setEditMode,
		isFocused,
		setFocusedId,
		focusedId,
		setModalOpen,
		setExitGuard,
		clearExitGuard,
	} = useFocusState("model_details");
	const scrollboxRef = useRef<ScrollBoxRenderable>(null);

	const [modelName, setModelName] = useState(model.name);
	const [modelDescription, setModelDescription] = useState(model.description);
	const [anthropicBaseUrl, setAnthropicBaseUrl] = useState(
		model.value.ANTHROPIC_BASE_URL
	);
	const [anthropicAuthToken, setAnthropicAuthToken] = useState(
		model.value.ANTHROPIC_AUTH_TOKEN
	);
	const [anthropicModel, setAnthropicModel] = useState(
		model.value.ANTHROPIC_MODEL
	);
	const [anthropicSmallFastModel, setAnthropicSmallFastModel] = useState(
		model.value.ANTHROPIC_SMALL_FAST_MODEL
	);
	const [anthropicDefaultSonnetModel, setAnthropicDefaultSonnetModel] =
		useState(model.value.ANTHROPIC_DEFAULT_SONNET_MODEL);
	const [anthropicDefaultOpusModel, setAnthropicDefaultOpusModel] = useState(
		model.value.ANTHROPIC_DEFAULT_OPUS_MODEL
	);
	const [anthropicDefaultHaikuModel, setAnthropicDefaultHaikuModel] = useState(
		model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL
	);
	const [activeFieldIndex, setActiveFieldIndex] = useState(0);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const isDirty = useMemo(() => {
		return (
			modelName !== model.name ||
			modelDescription !== model.description ||
			anthropicBaseUrl !== model.value.ANTHROPIC_BASE_URL ||
			anthropicAuthToken !== model.value.ANTHROPIC_AUTH_TOKEN ||
			anthropicModel !== model.value.ANTHROPIC_MODEL ||
			anthropicSmallFastModel !== model.value.ANTHROPIC_SMALL_FAST_MODEL ||
			anthropicDefaultSonnetModel !==
				model.value.ANTHROPIC_DEFAULT_SONNET_MODEL ||
			anthropicDefaultOpusModel !== model.value.ANTHROPIC_DEFAULT_OPUS_MODEL ||
			anthropicDefaultHaikuModel !== model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL
		);
	}, [
		modelName,
		modelDescription,
		anthropicBaseUrl,
		anthropicAuthToken,
		anthropicModel,
		anthropicSmallFastModel,
		anthropicDefaultSonnetModel,
		anthropicDefaultOpusModel,
		anthropicDefaultHaikuModel,
		model,
	]);

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

	const closeAllModals = useCallback(() => {
		closeConfirm();
		closeOverwriteConfirm();
	}, [closeConfirm, closeOverwriteConfirm]);

	useEffect(() => {
		if (!(isConfirmOpen || isOverwriteConfirmOpen)) {
			return;
		}

		const eventTarget = globalThis as unknown as {
			addEventListener?: (type: string, listener: () => void) => void;
			removeEventListener?: (type: string, listener: () => void) => void;
		};
		const handleBlur = () => {
			closeAllModals();
		};

		if (eventTarget.addEventListener) {
			eventTarget.addEventListener("blur", handleBlur);
			eventTarget.addEventListener("focusout", handleBlur);
		}

		return () => {
			if (eventTarget.removeEventListener) {
				eventTarget.removeEventListener("blur", handleBlur);
				eventTarget.removeEventListener("focusout", handleBlur);
			}
			closeAllModals();
		};
	}, [isConfirmOpen, isOverwriteConfirmOpen, closeAllModals]);

	useEffect(() => {
		if ((isConfirmOpen || isOverwriteConfirmOpen) && !isFocused) {
			closeAllModals();
		}
	}, [isConfirmOpen, isOverwriteConfirmOpen, isFocused, closeAllModals]);

	const handleSave = useCallback(
		(allowOverwrite: boolean): { ok: boolean; reason?: string } => {
			setErrorMessage(null);

			const validatedModel = editModelSchema.safeParse({
				name: modelName,
				value: {
					ANTHROPIC_BASE_URL: anthropicBaseUrl,
					ANTHROPIC_MODEL: anthropicModel,
				},
			});

			if (!validatedModel.success) {
				const errorMessages = validatedModel.error.issues.map(
					(err: z.ZodIssue) => {
						const path = err.path.join(".");
						return `${path}: ${err.message}`;
					}
				);
				setErrorMessage(`Validation failed:\n${errorMessages.join("\n")}`);
				return { ok: false, reason: "validation" };
			}

			const result = onSave(
				{
					...model,
					name: modelName,
					description: modelDescription,
					value: {
						...model.value,
						ANTHROPIC_BASE_URL: anthropicBaseUrl,
						ANTHROPIC_AUTH_TOKEN: anthropicAuthToken,
						ANTHROPIC_MODEL: anthropicModel,
						ANTHROPIC_SMALL_FAST_MODEL: anthropicSmallFastModel,
						ANTHROPIC_DEFAULT_SONNET_MODEL: anthropicDefaultSonnetModel,
						ANTHROPIC_DEFAULT_OPUS_MODEL: anthropicDefaultOpusModel,
						ANTHROPIC_DEFAULT_HAIKU_MODEL: anthropicDefaultHaikuModel,
					},
				},
				model.name,
				{ allowOverwrite }
			);

			if (!result.ok) {
				if (result.reason !== "duplicate" && result.message) {
					setErrorMessage(result.message);
				}
				return { ok: false, reason: result.reason };
			}

			setEditMode(false);
			setFocusedId("model_selection");
			return { ok: true };
		},
		[
			onSave,
			model,
			modelName,
			modelDescription,
			anthropicBaseUrl,
			anthropicAuthToken,
			anthropicModel,
			anthropicSmallFastModel,
			anthropicDefaultSonnetModel,
			anthropicDefaultOpusModel,
			anthropicDefaultHaikuModel,
			setEditMode,
			setFocusedId,
		]
	);

	const resetFields = useCallback(() => {
		setModelName(model.name);
		setModelDescription(model.description);
		setAnthropicBaseUrl(model.value.ANTHROPIC_BASE_URL);
		setAnthropicAuthToken(model.value.ANTHROPIC_AUTH_TOKEN);
		setAnthropicModel(model.value.ANTHROPIC_MODEL);
		setAnthropicSmallFastModel(model.value.ANTHROPIC_SMALL_FAST_MODEL);
		setAnthropicDefaultSonnetModel(model.value.ANTHROPIC_DEFAULT_SONNET_MODEL);
		setAnthropicDefaultOpusModel(model.value.ANTHROPIC_DEFAULT_OPUS_MODEL);
		setAnthropicDefaultHaikuModel(model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL);
		setErrorMessage(null);
	}, [
		model.name,
		model.description,
		model.value.ANTHROPIC_BASE_URL,
		model.value.ANTHROPIC_AUTH_TOKEN,
		model.value.ANTHROPIC_MODEL,
		model.value.ANTHROPIC_SMALL_FAST_MODEL,
		model.value.ANTHROPIC_DEFAULT_SONNET_MODEL,
		model.value.ANTHROPIC_DEFAULT_OPUS_MODEL,
		model.value.ANTHROPIC_DEFAULT_HAIKU_MODEL,
	]);

	// Keep local state in sync when model changes
	useEffect(() => {
		resetFields();
	}, [resetFields]);

	useEffect(() => {
		if (!errorMessage) {
			return;
		}
		if (modelName.trim() && anthropicBaseUrl.trim() && anthropicModel.trim()) {
			setErrorMessage(null);
		}
	}, [errorMessage, modelName, anthropicBaseUrl, anthropicModel]);

	useEffect(() => {
		if (editMode) {
			setActiveFieldIndex(0);
		}
	}, [editMode]);

	const handleEditKeyboard = useCallback(
		(name: string) => {
			const TOTAL_FIELDS = 9;
			if (name === "down") {
				setActiveFieldIndex((prev) => (prev + 1) % TOTAL_FIELDS);
			} else if (name === "up") {
				setActiveFieldIndex((prev) => (prev - 1 + TOTAL_FIELDS) % TOTAL_FIELDS);
			} else if (name === "return") {
				if (isDirty) {
					openConfirm();
				} else {
					setEditMode(false);
					setFocusedId("model_selection");
				}
			}
		},
		[isDirty, openConfirm, setEditMode, setFocusedId]
	);

	useKeyboard((key) => {
		if (!isFocused || isConfirmOpen || isOverwriteConfirmOpen) return;

		if (editMode) {
			handleEditKeyboard(key.name || "");
		} else if (key.name === "down") {
			scrollboxRef.current?.scrollBy(1);
		} else if (key.name === "up") {
			scrollboxRef.current?.scrollBy(-1);
		}
	});

	useEffect(() => {
		setExitGuard("model_details", (key) => {
			if (isConfirmOpen || isOverwriteConfirmOpen) {
				return true;
			}
			if (!(editMode && isDirty)) {
				return false;
			}
			if (key.name === "escape" || key.name === "tab" || key.name === "left") {
				openConfirm();
				return true;
			}
			return false;
		});

		return () => clearExitGuard("model_details");
	}, [
		clearExitGuard,
		editMode,
		isConfirmOpen,
		isDirty,
		isOverwriteConfirmOpen,
		openConfirm,
		setExitGuard,
	]);

	if (focusedId !== "model_details" && focusedId !== "model_selection") {
		return null;
	}

	const isActive = isFocused;
	const borderColor = editMode ? theme.colors.primary : theme.colors.secondary;

	return (
		<>
			<box
				flexDirection="column"
				flexGrow={1}
				style={{ width: "100%", height: "100%" }}
			>
				<scrollbox
					ref={scrollboxRef}
					style={{
						width: "100%",
						flexGrow: 1,
						border: true,
						borderStyle: isActive ? "double" : "rounded",
						borderColor,
						rootOptions: { backgroundColor: theme.colors.surface },
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
					title={editMode ? `Editing: ${model.name}` : "Model Details"}
				>
					<box flexDirection="column" gap={1} padding={1}>
						{/* Header Section */}
						<box flexDirection="column" marginBottom={1}>
							<text
								attributes={TextAttributes.BOLD}
								style={{ fg: theme.colors.text.primary }}
							>
								{modelName}
							</text>
							<text style={{ fg: theme.colors.text.secondary }}>
								{modelDescription}
							</text>
						</box>

						{errorMessage && (
							<box
								flexDirection="column"
								style={{
									border: true,
									borderStyle: "rounded",
									borderColor: "#ef4444",
									backgroundColor: "#1f1f1f",
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

						{/* Basic Info Section */}
						<box flexDirection="column" gap={0}>
							<text
								attributes={TextAttributes.UNDERLINE}
								style={{ fg: theme.colors.text.muted, marginBottom: 1 }}
							>
								Basic Info
							</text>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 0}
								label="Name"
								onChange={setModelName}
								value={modelName}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 1}
								label="Description"
								onChange={setModelDescription}
								value={modelDescription}
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
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 2}
								label="Base URL"
								onChange={setAnthropicBaseUrl}
								placeholder="https://api.anthropic.com"
								value={anthropicBaseUrl}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 3}
								isPassword={true}
								label="Auth Token"
								onChange={setAnthropicAuthToken}
								value={anthropicAuthToken}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 4}
								label="Model"
								onChange={setAnthropicModel}
								value={anthropicModel}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 5}
								label="Small Fast Model"
								onChange={setAnthropicSmallFastModel}
								placeholder="e.g. claude-3-haiku-20240307"
								value={anthropicSmallFastModel}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 6}
								label="Sonnet Model"
								onChange={setAnthropicDefaultSonnetModel}
								placeholder="e.g. claude-3-5-sonnet-20240620"
								value={anthropicDefaultSonnetModel}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 7}
								label="Opus Model"
								onChange={setAnthropicDefaultOpusModel}
								placeholder="e.g. claude-3-opus-20240229"
								value={anthropicDefaultOpusModel}
							/>

							<FormField
								editMode={editMode}
								isFocused={isActive && editMode && activeFieldIndex === 8}
								label="Haiku Model"
								onChange={setAnthropicDefaultHaikuModel}
								placeholder="e.g. claude-3-haiku-20240307"
								value={anthropicDefaultHaikuModel}
							/>
						</box>
					</box>
				</scrollbox>
			</box>
			<ConfirmModal
				cancelLabel="Cancel"
				confirmLabel="Save"
				isOpen={isConfirmOpen}
				message="Do you want to save your updates?"
				onCancel={() => {
					resetFields();
					setEditMode(false);
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
				title="Save changes?"
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
