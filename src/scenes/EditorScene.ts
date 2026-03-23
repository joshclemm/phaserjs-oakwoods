import Phaser from "phaser";
import { setEditorChromeState } from "../appMode";
import { getEditorDomRefs, setActiveTerrainTileButton, setActiveToolButton, setPropTypeOptions, type EditorTool } from "../editor/dom";
import {
  cloneLevelData,
  compressSolidGrid,
  createEmptyLevel,
  createSolidGrid,
  getSurfaceWorldY,
  normalizeLevelData,
  resizeLevel,
  serializeLevel,
} from "../levels/levelData";
import {
  createThemeAnimations,
  createParallaxBackground,
  renderProps,
  renderTerrain,
  updateParallax,
  type ParallaxLayers,
  type RenderedProp,
  type RenderedTerrain,
} from "../levels/rendering";
import {
  LAYER_OFFSET_Y,
  TILE_SIZE,
  type LevelData,
  type LevelProp,
  type PropDepth,
  type PropType,
  type SolidGrid,
} from "../levels/types";
import {
  getThemeDefinition,
  getThemeManifest,
  getThemePropTypes,
  getThemeTilesetColumns,
  getThemeTilesetRows,
  getThemeTilesetTileCount,
  resolveThemeAssetUrl,
  THEME_MANIFESTS_REGISTRY_KEY,
  type ThemeManifestMap,
} from "../themes/themes";

interface PropDraft {
  type: PropType;
  depth: PropDepth;
  flipX: boolean;
  offsetY: number;
}

interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface TerrainPaintStroke {
  before: LevelData;
  changed: boolean;
  visited: Set<string>;
}

const HISTORY_LIMIT = 100;
const TRACKPAD_PINCH_ZOOM_SENSITIVITY = 0.0035;

export class EditorScene extends Phaser.Scene {
  private level!: LevelData;
  private solidGrid: SolidGrid = [];
  private terrain?: RenderedTerrain;
  private renderedProps: RenderedProp[] = [];
  private background?: ParallaxLayers;
  private spawnMarker?: Phaser.GameObjects.Sprite;

  private gridOverlay!: Phaser.GameObjects.Graphics;
  private hoverOverlay!: Phaser.GameObjects.Graphics;
  private dragOverlay!: Phaser.GameObjects.Graphics;
  private selectionOverlay!: Phaser.GameObjects.Graphics;

  private uiAbortController?: AbortController;
  private tool: EditorTool = "terrain-draw";
  private selectedTerrainTile: number | null = null;
  private selectedPropIndex: number | null = null;
  private draftProp: PropDraft = {
    type: "lamp",
    depth: "back",
    flipX: false,
    offsetY: 0,
  };
  private undoStack: LevelData[] = [];
  private redoStack: LevelData[] = [];
  private dragRect: DragRect | null = null;
  private terrainPaintStroke: TerrainPaintStroke | null = null;
  private activeThemeId: string | null = null;
  private terrainPaletteThemeId: string | null = null;
  private isPanning = false;
  private gestureZoomStart = 1;
  private lastPointerPosition = new Phaser.Math.Vector2();
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("EditorScene");
  }

  create(): void {
    this.level = normalizeLevelData(
      this.registry.get("oakwoods-active-level")
      ?? this.registry.get("oakwoods-source-level")
      ?? this.cache.json.get("oakwoods-level-1"),
    );
    this.solidGrid = createSolidGrid(this.level);

    setEditorChromeState("editing");
    this.input.mouse?.disableContextMenu();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.gridOverlay = this.add.graphics().setDepth(20);
    this.hoverOverlay = this.add.graphics().setDepth(24);
    this.dragOverlay = this.add.graphics().setDepth(28);
    this.selectionOverlay = this.add.graphics().setDepth(30);

    this.rebuildLevelVisuals(true);
    this.bindEditorUi();
    this.bindSceneInput();
    this.syncUi();
    this.persistActiveLevel();
    this.setStatus("Draw adds solids. Paint stamps exact terrain sprites. Two-finger scroll pans the view. Pinch to zoom.");

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiAbortController?.abort();
      this.uiAbortController = undefined;
    });
  }

  update(): void {
    if (this.background) {
      updateParallax(this.background, this.cameras.main.scrollX);
    }
  }

  private bindEditorUi(): void {
    this.uiAbortController?.abort();
    this.uiAbortController = new AbortController();
    const signal = this.uiAbortController.signal;
    const refs = getEditorDomRefs();

    for (const button of refs.toolButtons) {
      button.addEventListener("click", () => {
        const nextTool = button.dataset.editorTool as EditorTool | undefined;
        if (nextTool) {
          this.setTool(nextTool);
        }
      }, { signal });
    }

    refs.newLevelButton.addEventListener("click", () => this.handleNewLevel(), { signal });
    refs.resizeButton.addEventListener("click", () => this.handleResizeLevel(), { signal });
    refs.loadDemoButton.addEventListener("click", () => this.handleLoadDemo(), { signal });
    refs.playtestButton.addEventListener("click", () => this.startPlaytest(), { signal });
    refs.exportButton.addEventListener("click", () => {
      void this.copyLevelJson();
    }, { signal });
    refs.downloadButton.addEventListener("click", () => this.downloadLevelJson(), { signal });
    refs.undoButton.addEventListener("click", () => this.undo(), { signal });
    refs.redoButton.addEventListener("click", () => this.redo(), { signal });
    refs.levelTheme.addEventListener("change", () => this.handleThemeChange(refs.levelTheme.value), { signal });
    refs.terrainAutoButton.addEventListener("click", () => this.setSelectedTerrainTile(null), { signal });
    refs.terrainPaletteGrid.addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof HTMLElement
        ? target.closest<HTMLButtonElement>("[data-terrain-tile-index]")
        : null;
      const tileIndex = Number(button?.dataset.terrainTileIndex);
      if (Number.isInteger(tileIndex)) {
        this.setSelectedTerrainTile(tileIndex);
      }
    }, { signal });
    refs.deletePropButton.addEventListener("click", () => this.deleteSelectedProp(), { signal });
    refs.nudgeLeftButton.addEventListener("click", () => this.nudgeSelectedProp(-0.5), { signal });
    refs.nudgeRightButton.addEventListener("click", () => this.nudgeSelectedProp(0.5), { signal });
    refs.levelName.addEventListener("change", () => this.handleRenameLevel(refs.levelName.value), { signal });
    refs.propType.addEventListener("change", () => this.handlePropFormChange(), { signal });
    refs.propDepth.addEventListener("change", () => this.handlePropFormChange(), { signal });
    refs.propFlip.addEventListener("change", () => this.handlePropFormChange(), { signal });
    refs.propOffsetY.addEventListener("change", () => this.handlePropFormChange(), { signal });

    window.addEventListener("keydown", (event) => this.handleKeyDown(event), { signal });
  }

  private bindSceneInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.bindTrackpadGestures();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    const isFormTarget = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if (!isFormTarget && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      this.deleteSelectedProp();
      return;
    }

    if (isFormTarget) {
      return;
    }

    if (event.key === "1") {
      this.setTool("terrain-draw");
    } else if (event.key === "2") {
      this.setTool("terrain-erase");
    } else if (event.key === "3") {
      this.setTool("terrain-paint");
    } else if (event.key === "4") {
      this.setTool("prop");
    } else if (event.key === "5") {
      this.setTool("spawn");
    } else if (event.key === "6") {
      this.setTool("select");
    } else if (event.key === "Escape") {
      this.selectProp(null);
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.shouldPan(pointer)) {
      this.isPanning = true;
      this.lastPointerPosition.set(pointer.x, pointer.y);
      return;
    }

    if (pointer.button !== 0) {
      return;
    }

    const tile = this.getTileFromPointer(pointer);

    if (this.tool === "terrain-draw" || this.tool === "terrain-erase") {
      if (!tile) {
        return;
      }

      this.dragRect = {
        startX: tile.x,
        startY: tile.y,
        endX: tile.x,
        endY: tile.y,
      };
      this.redrawDragOverlay();
      return;
    }

    if (this.tool === "terrain-paint") {
      if (!tile) {
        return;
      }

      this.terrainPaintStroke = {
        before: cloneLevelData(this.level),
        changed: false,
        visited: new Set(),
      };
      this.applyTerrainPaintAt(tile.x, tile.y);
      return;
    }

    if (this.tool === "prop") {
      if (!tile) {
        return;
      }

      this.placeProp(pointer.worldX / TILE_SIZE);
      return;
    }

    if (this.tool === "spawn") {
      if (!tile) {
        return;
      }

      this.setSpawn(tile.x, tile.y);
      return;
    }

    if (this.tool === "select") {
      this.selectProp(this.findPropAtWorld(pointer.worldX, pointer.worldY));
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isPanning && pointer.isDown) {
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPointerPosition.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPointerPosition.y) / camera.zoom;
      this.lastPointerPosition.set(pointer.x, pointer.y);
    }

    const tile = this.getTileFromPointer(pointer);
    this.updateCursor(tile);

    if (this.dragRect && tile) {
      this.dragRect.endX = tile.x;
      this.dragRect.endY = tile.y;
      this.redrawDragOverlay();
    }

    if (!this.isPanning && this.terrainPaintStroke && pointer.isDown && tile) {
      this.applyTerrainPaintAt(tile.x, tile.y);
    }

    this.redrawHoverOverlay(tile);
  }

  private handlePointerUp(_pointer: Phaser.Input.Pointer): void {
    this.isPanning = false;

    if (this.terrainPaintStroke) {
      const stroke = this.terrainPaintStroke;
      this.terrainPaintStroke = null;

      if (!stroke.changed) {
        return;
      }

      this.finalizeLevelMutation(
        stroke.before,
        this.selectedTerrainTile === null
          ? "Restored painted terrain cells to autotile."
          : `Painted terrain with tile ${this.selectedTerrainTile}.`,
      );
      return;
    }

    if (!this.dragRect) {
      return;
    }

    const before = cloneLevelData(this.level);
    const bounds = this.getDragBounds(this.dragRect);
    const nextSolid = this.tool === "terrain-draw";
    let changed = false;

    for (let y = bounds.startY; y <= bounds.endY; y += 1) {
      for (let x = bounds.startX; x <= bounds.endX; x += 1) {
        if (this.solidGrid[y][x] === nextSolid) {
          continue;
        }

        this.solidGrid[y][x] = nextSolid;
        changed = true;
      }
    }

    this.dragRect = null;
    this.redrawDragOverlay();

    if (!changed) {
      return;
    }

    this.level.solids = compressSolidGrid(this.solidGrid);
    if (!nextSolid) {
      this.pruneTerrainOverridesToSolids();
    }
    this.finalizeLevelMutation(
      before,
      nextSolid ? "Added terrain block." : "Removed terrain block.",
    );
  }

  private bindTrackpadGestures(): void {
    const gameStage = document.getElementById("game-stage");
    if (!gameStage || !this.uiAbortController) {
      return;
    }

    const signal = this.uiAbortController.signal;
    gameStage.addEventListener("wheel", (event) => {
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const zoomFactor = Math.exp(-event.deltaY * TRACKPAD_PINCH_ZOOM_SENSITIVITY);
        this.zoomAtClientPoint(event.clientX, event.clientY, zoomFactor);
        return;
      }

      this.panByScreenDelta(event.deltaX, event.deltaY);
    }, { passive: false, signal });

    gameStage.addEventListener("gesturestart", ((event: Event) => {
      event.preventDefault();
      this.gestureZoomStart = this.cameras.main.zoom;
    }) as EventListener, { passive: false, signal });

    gameStage.addEventListener("gesturechange", ((event: Event) => {
      event.preventDefault();
      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number };
      const scale = typeof gestureEvent.scale === "number" ? gestureEvent.scale : 1;
      const clientX = typeof gestureEvent.clientX === "number" ? gestureEvent.clientX : window.innerWidth / 2;
      const clientY = typeof gestureEvent.clientY === "number" ? gestureEvent.clientY : window.innerHeight / 2;
      this.setZoomAtClientPoint(clientX, clientY, Phaser.Math.Clamp(this.gestureZoomStart * scale, 0.5, 3));
    }) as EventListener, { passive: false, signal });
  }

  private panByScreenDelta(deltaX: number, deltaY: number): void {
    const camera = this.cameras.main;
    camera.scrollX += deltaX / camera.zoom;
    camera.scrollY += deltaY / camera.zoom;
  }

  private zoomAtClientPoint(clientX: number, clientY: number, zoomFactor: number): void {
    const camera = this.cameras.main;
    const currentZoom = camera.zoom;
    const nextZoom = Phaser.Math.Clamp(currentZoom * zoomFactor, 0.5, 3);

    if (nextZoom === currentZoom) {
      return;
    }

    this.setZoomAtClientPoint(clientX, clientY, nextZoom);
  }

  private setZoomAtClientPoint(clientX: number, clientY: number, nextZoom: number): void {
    const camera = this.cameras.main;
    const currentZoom = camera.zoom;
    if (nextZoom === currentZoom) {
      return;
    }

    const canvasBounds = this.game.canvas.getBoundingClientRect();
    const pointerX = Phaser.Math.Clamp((clientX - canvasBounds.left) / canvasBounds.width, 0, 1);
    const pointerY = Phaser.Math.Clamp((clientY - canvasBounds.top) / canvasBounds.height, 0, 1);
    const visibleWorldWidth = this.scale.width / currentZoom;
    const visibleWorldHeight = this.scale.height / currentZoom;
    const worldPoint = new Phaser.Math.Vector2(
      camera.scrollX + (pointerX * visibleWorldWidth),
      camera.scrollY + (pointerY * visibleWorldHeight),
    );

    camera.setZoom(nextZoom);
    camera.scrollX = worldPoint.x - (pointerX * (this.scale.width / nextZoom));
    camera.scrollY = worldPoint.y - (pointerY * (this.scale.height / nextZoom));
  }

  private handleRenameLevel(nextName: string): void {
    const trimmedName = nextName.trim();
    if (trimmedName.length === 0) {
      this.syncUi();
      return;
    }

    const before = cloneLevelData(this.level);
    this.level.name = trimmedName;
    this.finalizeLevelMutation(before, `Renamed level to ${trimmedName}.`);
  }

  private handleThemeChange(nextThemeId: string): void {
    const currentTheme = getThemeDefinition(this.level.theme);
    const nextTheme = getThemeDefinition(nextThemeId);

    if (currentTheme.id === nextTheme.id) {
      this.syncUi();
      return;
    }

    const before = cloneLevelData(this.level);
    const clearedOverrides = this.level.terrainOverrides.length;
    this.level.theme = nextTheme.id;
    this.level.terrainOverrides = [];
    const removedProps = this.pruneUnsupportedPropsForTheme();
    if (removedProps > 0) {
      this.selectedPropIndex = null;
    }
    this.selectedTerrainTile = null;
    this.terrainPaletteThemeId = null;
    this.ensureDraftPropTypeForTheme();
    this.finalizeLevelMutation(
      before,
      [
        `Switched theme to ${nextTheme.label}.`,
        clearedOverrides > 0 ? "Cleared manual terrain paint overrides." : "",
        removedProps > 0 ? `Removed ${removedProps} prop${removedProps === 1 ? "" : "s"} not supported by this theme.` : "",
      ].filter(Boolean).join(" "),
    );
  }

  private handleNewLevel(): void {
    const refs = getEditorDomRefs();
    this.replaceLevel(
      createEmptyLevel(
      Number(refs.levelWidth.value),
      Number(refs.levelHeight.value),
      refs.levelName.value.trim() || "Untitled Level",
      ),
      "Created a new empty level.",
      { resetCamera: true, clearSelection: true },
    );
  }

  private handleResizeLevel(): void {
    const refs = getEditorDomRefs();
    this.replaceLevel(
      resizeLevel(this.level, Number(refs.levelWidth.value), Number(refs.levelHeight.value)),
      "Resized level bounds.",
      { resetCamera: true },
    );
  }

  private handleLoadDemo(): void {
    const sourceLevel = this.registry.get("oakwoods-source-level");
    if (!sourceLevel) {
      this.setStatus("No source level found in the loader cache.");
      return;
    }

    this.replaceLevel(
      normalizeLevelData(sourceLevel),
      "Reloaded the demo level.",
      { resetCamera: true, clearSelection: true },
    );
  }

  private handlePropFormChange(): void {
    const nextDraft = this.readPropDraftFromDom();
    this.draftProp = nextDraft;

    if (this.selectedPropIndex === null) {
      this.syncUi();
      this.setStatus("Updated prop placement defaults.");
      return;
    }

    const selectedProp = this.level.props[this.selectedPropIndex];
    if (!selectedProp) {
      this.selectedPropIndex = null;
      this.syncUi();
      return;
    }

    const before = cloneLevelData(this.level);
    this.applyDraftToProp(selectedProp, nextDraft);
    this.finalizeLevelMutation(before, "Updated selected prop.");
  }

  private placeProp(tileX: number): void {
    if (!this.ensureDraftPropTypeForTheme()) {
      this.syncUi();
      this.setStatus("This theme has no placeable props configured yet.");
      return;
    }

    const before = cloneLevelData(this.level);
    this.level.props.push(this.createPropFromDraft(tileX));
    this.selectedPropIndex = this.level.props.length - 1;
    this.finalizeLevelMutation(before, `Placed ${this.draftProp.type}.`);
  }

  private setSpawn(tileX: number, tileY: number): void {
    const before = cloneLevelData(this.level);
    this.level.spawn = {
      x: Phaser.Math.Clamp(tileX + 0.5, 0.5, Math.max(0.5, this.level.width - 0.5)),
      y: Phaser.Math.Clamp(tileY, 0, this.level.height - 1),
    };
    this.finalizeLevelMutation(before, "Moved player spawn.");
  }

  private applyTerrainPaintAt(tileX: number, tileY: number): void {
    const stroke = this.terrainPaintStroke;
    if (!stroke) {
      return;
    }

    const key = `${tileX}:${tileY}`;
    if (stroke.visited.has(key)) {
      return;
    }

    stroke.visited.add(key);

    if (!this.solidGrid[tileY]?.[tileX]) {
      if (!stroke.changed) {
        this.setStatus("Terrain paint only applies to solid cells. Use Draw first, then Paint.");
      }
      return;
    }

    if (!this.setTerrainOverrideAt(tileX, tileY, this.selectedTerrainTile)) {
      return;
    }

    stroke.changed = true;
    this.refreshTerrainVisuals();
  }

  private setTerrainOverrideAt(tileX: number, tileY: number, tileIndex: number | null): boolean {
    const existingIndex = this.level.terrainOverrides.findIndex((override) => override.x === tileX && override.y === tileY);
    const existingOverride = existingIndex >= 0 ? this.level.terrainOverrides[existingIndex] : null;

    if (tileIndex === null) {
      if (!existingOverride) {
        return false;
      }

      this.level.terrainOverrides.splice(existingIndex, 1);
      return true;
    }

    if (existingOverride) {
      if (existingOverride.tile === tileIndex) {
        return false;
      }

      existingOverride.tile = tileIndex;
      return true;
    }

    this.level.terrainOverrides.push({
      x: tileX,
      y: tileY,
      tile: tileIndex,
    });
    return true;
  }

  private refreshTerrainVisuals(): void {
    this.terrain?.layer.destroy();
    this.terrain?.interiorFill.destroy();
    this.terrain?.map.destroy();
    this.terrain = renderTerrain(this, this.level, this.solidGrid);
    this.redrawGrid();
    this.redrawSelectionOverlay();
  }

  private pruneTerrainOverridesToSolids(): void {
    this.level.terrainOverrides = this.level.terrainOverrides.filter((override) => this.solidGrid[override.y]?.[override.x] === true);
  }

  private syncThemeSceneState(): void {
    const theme = getThemeDefinition(this.level.theme);
    if (this.activeThemeId === theme.id && this.background) {
      return;
    }

    this.background?.layer1.destroy();
    this.background?.layer2.destroy();
    this.background?.layer3.destroy();
    createThemeAnimations(this, theme.id);
    this.background = createParallaxBackground(this, theme.id);
    this.activeThemeId = theme.id;
  }

  private syncTerrainPalette(): void {
    const theme = getThemeDefinition(this.level.theme);
    if (this.terrainPaletteThemeId === theme.id) {
      return;
    }

    const refs = getEditorDomRefs();
    const manifests = this.registry.get(THEME_MANIFESTS_REGISTRY_KEY) as ThemeManifestMap | undefined;
    const manifest = getThemeManifest(theme.id, manifests);
    const tileCount = getThemeTilesetTileCount(manifest);
    const columns = getThemeTilesetColumns(manifest);
    const rows = getThemeTilesetRows(manifest);
    const tilesetUrl = resolveThemeAssetUrl(manifest, manifest.tilesets.main.path);
    const previewTileSize = 32;
    const fragment = document.createDocumentFragment();

    refs.terrainPaletteGrid.replaceChildren();

    for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
      const button = document.createElement("button");
      const column = tileIndex % columns;
      const row = Math.floor(tileIndex / columns);
      button.type = "button";
      button.className = "terrain-swatch";
      button.dataset.terrainTileIndex = String(tileIndex);
      button.title = `${theme.label} tile ${tileIndex}`;
      button.style.backgroundImage = `url("${tilesetUrl}")`;
      button.style.backgroundSize = `${columns * previewTileSize}px ${rows * previewTileSize}px`;
      button.style.backgroundPosition = `-${column * previewTileSize}px -${row * previewTileSize}px`;
      fragment.append(button);
    }

    refs.terrainPaletteGrid.append(fragment);
    this.terrainPaletteThemeId = theme.id;
  }

  private deleteSelectedProp(): void {
    if (this.selectedPropIndex === null || !this.level.props[this.selectedPropIndex]) {
      return;
    }

    const before = cloneLevelData(this.level);
    const removed = this.level.props[this.selectedPropIndex];
    this.level.props.splice(this.selectedPropIndex, 1);
    this.selectedPropIndex = null;
    this.finalizeLevelMutation(before, `Deleted ${removed.type}.`);
  }

  private nudgeSelectedProp(delta: number): void {
    if (this.selectedPropIndex === null) {
      return;
    }

    const selectedProp = this.level.props[this.selectedPropIndex];
    if (!selectedProp) {
      this.selectedPropIndex = null;
      this.syncUi();
      return;
    }

    const before = cloneLevelData(this.level);
    selectedProp.x = Math.round(Phaser.Math.Clamp(selectedProp.x + delta, 0, Math.max(0, this.level.width - 0.1)) * 10) / 10;
    this.finalizeLevelMutation(before, `Moved ${selectedProp.type}.`);
  }

  private undo(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      return;
    }

    this.redoStack.push(cloneLevelData(this.level));
    this.restoreLevel(snapshot, "Undid the last edit.");
  }

  private redo(): void {
    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      return;
    }

    this.undoStack.push(cloneLevelData(this.level));
    this.restoreLevel(snapshot, "Reapplied the edit.");
  }

  private async copyLevelJson(): Promise<void> {
    const json = serializeLevel(this.level);

    if (!navigator.clipboard?.writeText) {
      this.setStatus("Clipboard API is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(json);
      this.setStatus("Copied level JSON to the clipboard.");
    } catch {
      this.setStatus("Clipboard write failed. Use Download instead.");
    }
  }

  private downloadLevelJson(): void {
    const safeName = this.level.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "oakwoods-level";
    const blob = new Blob([serializeLevel(this.level)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus(`Downloaded ${link.download}.`);
  }

  private startPlaytest(): void {
    this.persistActiveLevel();
    setEditorChromeState("playtest");
    this.scene.start("GameScene");
  }

  private shouldPan(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 1 || pointer.button === 2 || this.spaceKey.isDown;
  }

  private getTileFromPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } | null {
    const tileX = Math.floor(pointer.worldX / TILE_SIZE);
    const tileY = Math.floor((pointer.worldY - LAYER_OFFSET_Y) / TILE_SIZE);

    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) {
      return null;
    }

    return { x: tileX, y: tileY };
  }

  private getDragBounds(dragRect: DragRect): DragRect {
    return {
      startX: Math.min(dragRect.startX, dragRect.endX),
      startY: Math.min(dragRect.startY, dragRect.endY),
      endX: Math.max(dragRect.startX, dragRect.endX),
      endY: Math.max(dragRect.startY, dragRect.endY),
    };
  }

  private redrawDragOverlay(): void {
    this.dragOverlay.clear();

    if (!this.dragRect) {
      return;
    }

    const bounds = this.getDragBounds(this.dragRect);
    this.dragOverlay.fillStyle(this.tool === "terrain-draw" ? 0x8ec07c : 0xe57373, 0.25);
    this.dragOverlay.lineStyle(2, this.tool === "terrain-draw" ? 0xb7f191 : 0xff9b9b, 0.95);
    this.dragOverlay.fillRect(
      bounds.startX * TILE_SIZE,
      LAYER_OFFSET_Y + (bounds.startY * TILE_SIZE),
      ((bounds.endX - bounds.startX) + 1) * TILE_SIZE,
      ((bounds.endY - bounds.startY) + 1) * TILE_SIZE,
    );
    this.dragOverlay.strokeRect(
      bounds.startX * TILE_SIZE,
      LAYER_OFFSET_Y + (bounds.startY * TILE_SIZE),
      ((bounds.endX - bounds.startX) + 1) * TILE_SIZE,
      ((bounds.endY - bounds.startY) + 1) * TILE_SIZE,
    );
  }

  private redrawHoverOverlay(tile: { x: number; y: number } | null): void {
    this.hoverOverlay.clear();

    if (!tile) {
      return;
    }

    this.hoverOverlay.lineStyle(2, 0xffffff, 0.75);
    this.hoverOverlay.strokeRect(tile.x * TILE_SIZE, LAYER_OFFSET_Y + (tile.y * TILE_SIZE), TILE_SIZE, TILE_SIZE);
  }

  private redrawGrid(): void {
    this.gridOverlay.clear();
    this.gridOverlay.lineStyle(1, 0xf5ead9, 0.14);

    const top = LAYER_OFFSET_Y;
    const bottom = LAYER_OFFSET_Y + (this.level.height * TILE_SIZE);

    for (let x = 0; x <= this.level.width; x += 1) {
      this.gridOverlay.beginPath();
      this.gridOverlay.moveTo(x * TILE_SIZE, top);
      this.gridOverlay.lineTo(x * TILE_SIZE, bottom);
      this.gridOverlay.strokePath();
    }

    for (let y = 0; y <= this.level.height; y += 1) {
      const worldY = top + (y * TILE_SIZE);
      this.gridOverlay.beginPath();
      this.gridOverlay.moveTo(0, worldY);
      this.gridOverlay.lineTo(this.level.width * TILE_SIZE, worldY);
      this.gridOverlay.strokePath();
    }
  }

  private redrawSelectionOverlay(): void {
    this.selectionOverlay.clear();

    if (this.selectedPropIndex === null) {
      return;
    }

    const selectedRender = this.renderedProps.find((renderedProp) => renderedProp.propIndex === this.selectedPropIndex);
    if (!selectedRender) {
      return;
    }

    const selectedProp = this.level.props[this.selectedPropIndex];
    const anchorX = selectedProp.x * TILE_SIZE;
    const anchorY = getSurfaceWorldY(this.solidGrid, selectedProp.x) + (selectedProp.offsetY ?? 0);
    const bounds = selectedRender.display.getBounds();
    this.selectionOverlay.lineStyle(2, 0xffd166, 1);
    this.selectionOverlay.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4);

    // Props are free-placed sprites; the anchor is the real snapped point, not the art bounds.
    this.selectionOverlay.lineStyle(2, 0x6fe3ff, 0.95);
    this.selectionOverlay.beginPath();
    this.selectionOverlay.moveTo(anchorX, bounds.y - 8);
    this.selectionOverlay.lineTo(anchorX, anchorY + 10);
    this.selectionOverlay.strokePath();
    this.selectionOverlay.strokeRect(anchorX - 4, anchorY - 4, 8, 8);
    this.selectionOverlay.lineStyle(1, 0x6fe3ff, 0.8);
    this.selectionOverlay.beginPath();
    this.selectionOverlay.moveTo(anchorX - 8, anchorY);
    this.selectionOverlay.lineTo(anchorX + 8, anchorY);
    this.selectionOverlay.moveTo(anchorX, anchorY - 8);
    this.selectionOverlay.lineTo(anchorX, anchorY + 8);
    this.selectionOverlay.strokePath();
  }

  private rebuildLevelVisuals(resetCamera = false): void {
    const theme = getThemeDefinition(this.level.theme);
    this.syncThemeSceneState();
    this.terrain?.layer.destroy();
    this.terrain?.interiorFill.destroy();
    this.terrain?.map.destroy();
    this.renderedProps.forEach((renderedProp) => renderedProp.display.destroy());
    this.spawnMarker?.destroy();

    this.solidGrid = createSolidGrid(this.level);
    this.terrain = renderTerrain(this, this.level, this.solidGrid);
    this.renderedProps = renderProps(this, this.level, this.solidGrid);

    this.spawnMarker = this.add.sprite(
      this.level.spawn.x * TILE_SIZE,
      LAYER_OFFSET_Y + (this.level.spawn.y * TILE_SIZE) - 28,
      theme.player.textureKey,
      0,
    )
      .setDepth(14)
      .setAlpha(0.7);
    this.spawnMarker.anims.play(theme.player.animationKeys.idle);

    this.redrawGrid();
    this.redrawSelectionOverlay();
    this.updateCameraBounds(resetCamera);
  }

  private updateCameraBounds(resetCamera = false): void {
    const worldWidth = this.level.width * TILE_SIZE;
    const worldHeight = LAYER_OFFSET_Y + (this.level.height * TILE_SIZE) + 24;
    const camera = this.cameras.main;

    camera.setBounds(0, 0, worldWidth, worldHeight);

    if (resetCamera) {
      camera.setZoom(1);
      camera.scrollX = 0;
      camera.scrollY = 0;
    }
  }

  private finalizeLevelMutation(
    before: LevelData,
    status: string,
    options: { resetCamera?: boolean } = {},
  ): void {
    const normalizedLevel = normalizeLevelData(this.level);
    const beforeSignature = JSON.stringify(before);
    const afterSignature = JSON.stringify(normalizedLevel);

    this.level = normalizedLevel;

    if (beforeSignature === afterSignature) {
      this.syncUi();
      return;
    }

    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.refreshLevelView(options.resetCamera ?? false);
    this.setStatus(status);
  }

  private syncUi(): void {
    const refs = getEditorDomRefs();
    this.ensureDraftPropTypeForTheme();
    const selectedProp = this.selectedPropIndex !== null ? this.level.props[this.selectedPropIndex] : undefined;
    const propSettings = selectedProp
      ? this.createDraftFromProp(selectedProp)
      : this.draftProp;
    const availablePropTypes = this.getAvailablePropTypes();

    refs.levelName.value = this.level.name;
    refs.levelTheme.value = getThemeDefinition(this.level.theme).id;
    refs.levelWidth.value = String(this.level.width);
    refs.levelHeight.value = String(this.level.height);
    this.syncTerrainPalette();
    refs.terrainSelection.textContent = this.selectedTerrainTile === null
      ? "Selected terrain sprite: Auto."
      : `Selected terrain sprite: Tile ${this.selectedTerrainTile}.`;
    setPropTypeOptions(refs.propType, availablePropTypes, propSettings.type);
    refs.propDepth.value = propSettings.depth;
    refs.propFlip.checked = propSettings.flipX;
    refs.propOffsetY.value = String(propSettings.offsetY);
    refs.undoButton.disabled = this.undoStack.length === 0;
    refs.redoButton.disabled = this.redoStack.length === 0;
    refs.deletePropButton.disabled = selectedProp === undefined;
    refs.nudgeLeftButton.disabled = selectedProp === undefined;
    refs.nudgeRightButton.disabled = selectedProp === undefined;
    refs.propEmpty.hidden = selectedProp !== undefined;
    refs.propDetails.hidden = selectedProp === undefined;
    refs.selection.textContent = selectedProp
      ? `Selected #${this.selectedPropIndex! + 1}: ${selectedProp.type} anchor x=${selectedProp.x.toFixed(1)}. Blue marker = real prop anchor; yellow box = sprite bounds.`
      : "Nothing selected.";

    setActiveToolButton(this.tool, refs);
    setActiveTerrainTileButton(this.selectedTerrainTile, refs);
    this.redrawSelectionOverlay();
  }

  private readPropDraftFromDom(): PropDraft {
    const refs = getEditorDomRefs();
    const availablePropTypes = this.getAvailablePropTypes();
    const selectedType = availablePropTypes.includes(refs.propType.value as PropType)
      ? refs.propType.value as PropType
      : availablePropTypes[0] ?? this.draftProp.type;

    return {
      type: selectedType,
      depth: refs.propDepth.value === "front" ? "front" : "back",
      flipX: refs.propFlip.checked,
      offsetY: Number.isFinite(Number(refs.propOffsetY.value)) ? Math.round(Number(refs.propOffsetY.value)) : 0,
    };
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.syncUi();
    const toolStatus: Record<EditorTool, string> = {
      "terrain-draw": "Terrain draw mode: drag a rectangle to add solid ground.",
      "terrain-erase": "Terrain erase mode: drag a rectangle to remove solid ground.",
      "terrain-paint": this.selectedTerrainTile === null
        ? "Terrain paint mode: click or drag across solid cells to restore autotile."
        : `Terrain paint mode: click or drag across solid cells to stamp tile ${this.selectedTerrainTile}.`,
      prop: "Prop mode: click in the level to place the selected decoration.",
      spawn: "Spawn mode: click a tile to move the player start.",
      select: "Select mode: click a prop to inspect, tweak, nudge, or delete it.",
    };
    this.setStatus(toolStatus[tool]);
  }

  private setSelectedTerrainTile(tileIndex: number | null): void {
    this.selectedTerrainTile = tileIndex;
    this.tool = "terrain-paint";
    this.syncUi();
    this.setStatus(
      tileIndex === null
        ? "Terrain paint mode: click or drag across solid cells to restore autotile."
        : `Terrain paint mode: click or drag across solid cells to stamp tile ${tileIndex}.`,
    );
  }

  private selectProp(propIndex: number | null): void {
    this.selectedPropIndex = propIndex;
    if (propIndex !== null && this.level.props[propIndex]) {
      this.draftProp = this.createDraftFromProp(this.level.props[propIndex]);
    }
    this.syncUi();
  }

  private createDraftFromProp(prop: LevelProp): PropDraft {
    return {
      type: prop.type,
      depth: prop.depth ?? "back",
      flipX: Boolean(prop.flipX),
      offsetY: prop.offsetY ?? 0,
    };
  }

  private applyDraftToProp(prop: LevelProp, draft: PropDraft): void {
    prop.type = draft.type;
    prop.depth = draft.depth;
    prop.flipX = draft.flipX ? true : undefined;
    prop.offsetY = draft.offsetY !== 0 ? draft.offsetY : undefined;
  }

  private createPropFromDraft(tileX: number): LevelProp {
    const clampedTileX = Phaser.Math.Clamp(tileX, 0, Math.max(0, this.level.width - 0.1));

    return {
      type: this.draftProp.type,
      x: Math.round(clampedTileX * 10) / 10,
      depth: this.draftProp.depth,
      flipX: this.draftProp.flipX ? true : undefined,
      offsetY: this.draftProp.offsetY !== 0 ? this.draftProp.offsetY : undefined,
    };
  }

  private getAvailablePropTypes(): PropType[] {
    return getThemePropTypes(this.level.theme);
  }

  private ensureDraftPropTypeForTheme(): boolean {
    const availablePropTypes = this.getAvailablePropTypes();
    if (availablePropTypes.length === 0) {
      return false;
    }

    if (!availablePropTypes.includes(this.draftProp.type)) {
      this.draftProp = {
        ...this.draftProp,
        type: availablePropTypes[0],
      };
    }

    return true;
  }

  private pruneUnsupportedPropsForTheme(): number {
    const availablePropTypes = new Set(this.getAvailablePropTypes());
    const beforeCount = this.level.props.length;
    this.level.props = this.level.props.filter((prop) => availablePropTypes.has(prop.type));
    return beforeCount - this.level.props.length;
  }

  private replaceLevel(
    nextLevel: LevelData,
    status: string,
    options: { resetCamera?: boolean; clearSelection?: boolean } = {},
  ): void {
    const before = cloneLevelData(this.level);
    this.level = nextLevel;
    if (options.clearSelection) {
      this.selectedPropIndex = null;
    }
    this.finalizeLevelMutation(before, status, { resetCamera: options.resetCamera });
  }

  private restoreLevel(snapshot: LevelData, status: string): void {
    this.level = normalizeLevelData(snapshot);
    this.refreshLevelView();
    this.setStatus(status);
  }

  private refreshLevelView(resetCamera = false): void {
    this.clearInvalidSelectedProp();
    this.rebuildLevelVisuals(resetCamera);
    this.syncUi();
    this.persistActiveLevel();
  }

  private clearInvalidSelectedProp(): void {
    if (this.selectedPropIndex !== null && !this.level.props[this.selectedPropIndex]) {
      this.selectedPropIndex = null;
    }
  }

  private findPropAtWorld(worldX: number, worldY: number): number | null {
    for (let index = this.renderedProps.length - 1; index >= 0; index -= 1) {
      const renderedProp = this.renderedProps[index];
      if (renderedProp.display.getBounds().contains(worldX, worldY)) {
        return renderedProp.propIndex;
      }
    }

    return null;
  }

  private updateCursor(tile: { x: number; y: number } | null): void {
    const refs = getEditorDomRefs();
    refs.cursor.textContent = tile
      ? `Tile ${tile.x}, ${tile.y}`
      : "Tile -, -";
  }

  private persistActiveLevel(): void {
    this.registry.set("oakwoods-active-level", cloneLevelData(this.level));
  }

  private setStatus(message: string): void {
    getEditorDomRefs().status.textContent = message;
  }
}
