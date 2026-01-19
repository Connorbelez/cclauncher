import { createCliRenderer, TextAttributes, type SelectOption } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useRenderer } from "@opentui/react"
import { useEffect, useState } from "react";
import { FocusProvider, useFocusState } from "./hooks/FocusProvider";
import { ModelSelection } from "./components/ModelSelection";
import { ModelDetails } from "./components/ModelDetails";
import modelsJson from "./models.json";
import { z } from "zod";
import fs from "fs";
import { NewModelForm } from "./components/NewModelForm";

export const models:(SelectOption & { order?: number })[] = Object.entries(modelsJson)
  .map(([key, value]) => ({ 
    name: key, 
    description: value.description, 
    value: value.value,
    order: (value as any).order 
  }))
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const modelSchema = z.object({
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

const saveModel = (model: SelectOption, originalName?: string) => {
  //Validate 
  const validatedModel = modelSchema.safeParse(model);
  if (!validatedModel.success) {
    console.error("Invalid model:", validatedModel.error);
    return;
  }
  //Save model to models.json
  //update the models.json file with the new model, using original name as key
  const modelsJson = JSON.parse(fs.readFileSync("/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json", "utf8"));
  
  // If we have an original name and it's different from the new name, delete the old entry
  if (originalName && originalName !== validatedModel.data.name) {
    delete modelsJson[originalName];
  }
  
  modelsJson[validatedModel.data.name] = validatedModel.data;
  fs.writeFileSync("/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json", JSON.stringify(modelsJson, null, 2));
}
function App() {


  const [modelsState, setModelsState] = useState<(SelectOption & { order?: number })[]>(models);
  const [selectedModel, setSelectedModel] = useState<SelectOption>(models[0]!);
  // const { isFocused, focus } = useFocusState("model_selection");
  const renderer = useRenderer();
  useEffect(() => {
    const keyInput = (renderer as unknown as { keyInput?: { on?: (event: string, handler: (data: unknown) => void) => void; off?: (event: string, handler: (data: unknown) => void) => void } }).keyInput;
    if (!keyInput?.on) {
      return;
    }
    const onKeypress = (event: unknown) => {
      const key = event as { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; super?: boolean; option?: boolean; code?: string };
      if (key.name === "c" && key.ctrl && !key.shift) {
        renderer.destroy();
        process.exit(0);
        return;
      }
    };
    keyInput.on("keypress", onKeypress);
    return () => {
      keyInput.off?.("keypress", onKeypress);
    };
  }, [renderer]);
  useEffect(() => {
    const stdinBuffer = (renderer as unknown as { _stdinBuffer?: { on?: (event: string, handler: (data: unknown) => void) => void; off?: (event: string, handler: (data: unknown) => void) => void } })._stdinBuffer;
    if (!stdinBuffer?.on) {
      return;
    }
    const onPaste = (data: unknown) => {
      const text = typeof data === "string" ? data : "";
      const keyInput = (renderer as unknown as { keyInput?: { processPaste?: (text: string) => void } }).keyInput;
      const focused = (renderer as unknown as { currentFocusedRenderable?: { constructor?: { name?: string }; value?: unknown; insertText?: (text: string) => void } }).currentFocusedRenderable;
      const beforeLength = typeof focused?.value === "string" ? focused.value.length : null;
      if (typeof keyInput?.processPaste === "function") {
        keyInput.processPaste(text);
      }
      const afterLength = typeof focused?.value === "string" ? focused.value.length : null;
      if (typeof focused?.insertText === "function" && beforeLength !== null && afterLength === beforeLength) {
        focused.insertText(text);
      }
    };
    stdinBuffer.on("paste", onPaste);
    return () => {
      stdinBuffer.off?.("paste", onPaste);
    };
  }, [renderer]);
  // useEffect(() => {
  //   renderer.console.show();
  //   console.log("App started! Logs are being forwarded...");
  // }, [renderer]);

  // console.log(models);

  const [newModelName, setNewModelName] = useState("");
  const [newModelDescription, setNewModelDescription] = useState("");
  const [newModelValue, setNewModelValue] = useState("");

  const [activeFieldIndex, setActiveFieldIndex] = useState(0);


  const persistModelOrder = (nextModels: (SelectOption & { order?: number })[]) => {
    const modelsPath = "/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json";
    const persisted = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    nextModels.forEach((model, index) => {
      const existing = persisted[model.name] ?? {};
      persisted[model.name] = {
        ...existing,
        ...model,
        order: index + 1,
      };
    });
    fs.writeFileSync(modelsPath, JSON.stringify(persisted, null, 2));
  };

  const handleMoveModel = (fromIndex: number, direction: "up" | "down") => {
    setModelsState((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) {
        return prev;
      }
      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const nextWithOrder = next.map((model, index) => ({
        ...model,
        order: index + 1,
      }));
      setSelectedModel(nextWithOrder[toIndex]!);
      return nextWithOrder;
    });
  };

  const handleReorderEnd = () => {
    persistModelOrder(modelsState);
  };

  return (
    <FocusProvider order={["model_selection"]}>
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box justifyContent="center" alignItems="flex-end">
        <ascii-font font="tiny" text="CCLauncher" />
        <text attributes={TextAttributes.DIM}>What will you build?</text>
      </box>
      <box justifyContent="center" alignItems="flex-start" flexDirection="row" gap={1} width="100%" height="100%">
        <ModelSelection
          models={modelsState}
          onSelect={setSelectedModel}
          selectedModel={selectedModel}
          onMove={handleMoveModel}
          onReorderEnd={handleReorderEnd}
        />
        <ModelDetails model={selectedModel} onSave={saveModel} />
        <NewModelForm />
      </box>

    </box>
    <box justifyContent="center" alignItems="flex-start" flexDirection="row" gap={1}>
      <text attributes={TextAttributes.DIM}>Legend:</text>
      <text attributes={TextAttributes.DIM}>n: New</text>
      <text attributes={TextAttributes.DIM}>e: Edit</text>
      <text attributes={TextAttributes.DIM}>arrows: Navigate/Scroll</text>
      <text attributes={TextAttributes.DIM}>return: Save</text>
      <text attributes={TextAttributes.DIM}>esc: Exit Edit</text>
    </box>
    </FocusProvider>
  );
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useKittyKeyboard: {
    disambiguate: true,
    alternateKeys: true,
    events: true,
    allKeysAsEscapes: false,
    reportText: false,
  },
});
createRoot(renderer).render(<App />);
