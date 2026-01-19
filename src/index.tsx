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

export const models:SelectOption[] = Object.entries(modelsJson).map(([key, value]) => ({ name: key, description: value.description, value: value.value }));

const modelSchema = z.object({
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

const saveModel = (model: SelectOption) => {
  console.log("Saving model:", model);
  //Validate 
  const validatedModel = modelSchema.safeParse(model);
  if (!validatedModel.success) {
    console.error("Invalid model:", validatedModel.error);
    return;
  }
  //Save model to models.json
  //update the models.json file with the new model, only update the model with the name of the model
  const modelsJson = JSON.parse(fs.readFileSync("/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json", "utf8"));
  modelsJson[validatedModel.data.name] = validatedModel.data;
  fs.writeFileSync("/Users/connor/Dev/cclauncher/cclaunchv2/src/models.json", JSON.stringify(modelsJson, null, 2));
  
}
function App() {


  const [selectedModel, setSelectedModel] = useState<SelectOption>(models[0]!);
  // const { isFocused, focus } = useFocusState("model_selection");
  const renderer = useRenderer();
  // useEffect(() => {
  //   renderer.console.show();
  //   console.log("App started! Logs are being forwarded...");
  // }, [renderer]);

  // console.log(models);

  const [newModelName, setNewModelName] = useState("");
  const [newModelDescription, setNewModelDescription] = useState("");
  const [newModelValue, setNewModelValue] = useState("");

  const [activeFieldIndex, setActiveFieldIndex] = useState(0);


  return (
    <FocusProvider order={["model_selection"]}>
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box justifyContent="center" alignItems="flex-end">
        <ascii-font font="tiny" text="OpenTUI" />
        <text attributes={TextAttributes.DIM}>What will you build?</text>
      </box>
      <box justifyContent="center" alignItems="flex-start" flexDirection="row" gap={1} width="100%" height="100%">
        <ModelSelection models={models} onSelect={setSelectedModel} selectedModel={selectedModel} />
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

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
