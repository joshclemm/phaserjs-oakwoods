export type AppMode = "editor" | "game";
export type EditorChromeState = "editing" | "playtest" | "game";

export function getAppMode(): AppMode {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "game" ? "game" : "editor";
}

export function applyAppMode(mode: AppMode): void {
  document.body.dataset.appMode = mode;
  document.body.dataset.editorState = mode === "editor" ? "editing" : "game";
}

export function setEditorChromeState(state: EditorChromeState): void {
  document.body.dataset.editorState = state;
}
