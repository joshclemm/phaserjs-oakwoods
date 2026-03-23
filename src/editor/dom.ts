import { PROP_TYPES } from "../levels/types";

export type EditorTool = "terrain-draw" | "terrain-erase" | "prop" | "spawn" | "select";

export interface EditorDomRefs {
  levelName: HTMLInputElement;
  levelWidth: HTMLInputElement;
  levelHeight: HTMLInputElement;
  status: HTMLSpanElement;
  cursor: HTMLSpanElement;
  propEmpty: HTMLDivElement;
  propDetails: HTMLDivElement;
  selection: HTMLParagraphElement;
  propType: HTMLSelectElement;
  propDepth: HTMLSelectElement;
  propFlip: HTMLInputElement;
  propOffsetY: HTMLInputElement;
  newLevelButton: HTMLButtonElement;
  resizeButton: HTMLButtonElement;
  loadDemoButton: HTMLButtonElement;
  playtestButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  downloadButton: HTMLButtonElement;
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  deletePropButton: HTMLButtonElement;
  nudgeLeftButton: HTMLButtonElement;
  nudgeRightButton: HTMLButtonElement;
  toolButtons: HTMLButtonElement[];
}

let cachedRefs: EditorDomRefs | null = null;

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing editor DOM element: #${id}`);
  }

  return element as T;
}

function ensurePropTypeOptions(select: HTMLSelectElement): void {
  if (select.options.length > 0) {
    return;
  }

  const labels: Record<string, string> = {
    shop: "Shop",
    lamp: "Lamp",
    sign: "Sign",
    fence1: "Fence 1",
    fence2: "Fence 2",
    rock1: "Rock 1",
    rock2: "Rock 2",
    rock3: "Rock 3",
    grass1: "Grass 1",
    grass2: "Grass 2",
    grass3: "Grass 3",
  };

  for (const propType of PROP_TYPES) {
    const option = document.createElement("option");
    option.value = propType;
    option.textContent = labels[propType] ?? propType;
    select.append(option);
  }
}

export function getEditorDomRefs(): EditorDomRefs {
  if (cachedRefs) {
    return cachedRefs;
  }

  const refs: EditorDomRefs = {
    levelName: getElement<HTMLInputElement>("editor-level-name"),
    levelWidth: getElement<HTMLInputElement>("editor-level-width"),
    levelHeight: getElement<HTMLInputElement>("editor-level-height"),
    status: getElement<HTMLSpanElement>("editor-status"),
    cursor: getElement<HTMLSpanElement>("editor-cursor"),
    propEmpty: getElement<HTMLDivElement>("editor-prop-empty"),
    propDetails: getElement<HTMLDivElement>("editor-prop-details"),
    selection: getElement<HTMLParagraphElement>("editor-selection"),
    propType: getElement<HTMLSelectElement>("editor-prop-type"),
    propDepth: getElement<HTMLSelectElement>("editor-prop-depth"),
    propFlip: getElement<HTMLInputElement>("editor-prop-flip"),
    propOffsetY: getElement<HTMLInputElement>("editor-prop-offset-y"),
    newLevelButton: getElement<HTMLButtonElement>("editor-new-level"),
    resizeButton: getElement<HTMLButtonElement>("editor-resize-level"),
    loadDemoButton: getElement<HTMLButtonElement>("editor-load-demo"),
    playtestButton: getElement<HTMLButtonElement>("editor-playtest"),
    exportButton: getElement<HTMLButtonElement>("editor-export-json"),
    downloadButton: getElement<HTMLButtonElement>("editor-download-json"),
    undoButton: getElement<HTMLButtonElement>("editor-undo"),
    redoButton: getElement<HTMLButtonElement>("editor-redo"),
    deletePropButton: getElement<HTMLButtonElement>("editor-delete-prop"),
    nudgeLeftButton: getElement<HTMLButtonElement>("editor-nudge-left"),
    nudgeRightButton: getElement<HTMLButtonElement>("editor-nudge-right"),
    toolButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-editor-tool]")),
  };

  ensurePropTypeOptions(refs.propType);
  cachedRefs = refs;
  return refs;
}

export function setActiveToolButton(tool: EditorTool, refs = getEditorDomRefs()): void {
  refs.toolButtons.forEach((button) => {
    button.dataset.active = button.dataset.editorTool === tool ? "true" : "false";
  });
}
