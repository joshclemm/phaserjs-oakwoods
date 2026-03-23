import { PROP_TYPES } from "../levels/types";
import { getThemeOptions } from "../themes/themes";

export type EditorTool = "terrain-draw" | "terrain-erase" | "terrain-paint" | "prop" | "spawn" | "select";

export interface EditorDomRefs {
  levelName: HTMLInputElement;
  levelTheme: HTMLSelectElement;
  levelWidth: HTMLInputElement;
  levelHeight: HTMLInputElement;
  status: HTMLSpanElement;
  cursor: HTMLSpanElement;
  terrainSelection: HTMLParagraphElement;
  terrainAutoButton: HTMLButtonElement;
  terrainPaletteGrid: HTMLDivElement;
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

const PROP_TYPE_LABELS: Record<string, string> = {
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

  for (const propType of PROP_TYPES) {
    const option = document.createElement("option");
    option.value = propType;
    option.textContent = PROP_TYPE_LABELS[propType] ?? propType;
    select.append(option);
  }
}

function ensureThemeOptions(select: HTMLSelectElement): void {
  if (select.options.length > 0) {
    return;
  }

  for (const theme of getThemeOptions()) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.label;
    select.append(option);
  }
}

export function getEditorDomRefs(): EditorDomRefs {
  if (cachedRefs) {
    return cachedRefs;
  }

  const refs: EditorDomRefs = {
    levelName: getElement<HTMLInputElement>("editor-level-name"),
    levelTheme: getElement<HTMLSelectElement>("editor-level-theme"),
    levelWidth: getElement<HTMLInputElement>("editor-level-width"),
    levelHeight: getElement<HTMLInputElement>("editor-level-height"),
    status: getElement<HTMLSpanElement>("editor-status"),
    cursor: getElement<HTMLSpanElement>("editor-cursor"),
    terrainSelection: getElement<HTMLParagraphElement>("editor-terrain-selection"),
    terrainAutoButton: getElement<HTMLButtonElement>("editor-terrain-auto"),
    terrainPaletteGrid: getElement<HTMLDivElement>("editor-terrain-grid"),
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

  ensureThemeOptions(refs.levelTheme);
  ensurePropTypeOptions(refs.propType);
  cachedRefs = refs;
  return refs;
}

export function setActiveToolButton(tool: EditorTool, refs = getEditorDomRefs()): void {
  refs.toolButtons.forEach((button) => {
    button.dataset.active = button.dataset.editorTool === tool ? "true" : "false";
  });
}

export function setPropTypeOptions(
  select: HTMLSelectElement,
  propTypes: readonly string[],
  selectedType: string | null | undefined,
): void {
  const nextValue = selectedType && propTypes.includes(selectedType)
    ? selectedType
    : propTypes[0] ?? "";

  if (
    select.options.length === propTypes.length
    && Array.from(select.options).every((option, index) => option.value === propTypes[index])
  ) {
    select.value = nextValue;
    select.disabled = propTypes.length === 0;
    return;
  }

  select.replaceChildren();
  for (const propType of propTypes) {
    const option = document.createElement("option");
    option.value = propType;
    option.textContent = PROP_TYPE_LABELS[propType] ?? propType;
    select.append(option);
  }
  select.value = nextValue;
  select.disabled = propTypes.length === 0;
}

export function setActiveTerrainTileButton(tileIndex: number | null, refs = getEditorDomRefs()): void {
  refs.terrainAutoButton.dataset.active = tileIndex === null ? "true" : "false";
  refs.terrainPaletteGrid.querySelectorAll<HTMLButtonElement>("[data-terrain-tile-index]").forEach((button) => {
    button.dataset.active = button.dataset.terrainTileIndex === String(tileIndex) ? "true" : "false";
  });
}
