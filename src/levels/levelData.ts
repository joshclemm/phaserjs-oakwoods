import {
  LAYER_OFFSET_Y,
  LEVEL_VERSION,
  PROP_TYPES,
  TILE_SIZE,
  type LevelData,
  type LevelProp,
  type LevelSolidRect,
  type PropDepth,
  type PropType,
  type SolidGrid,
  type TerrainTileOverride,
} from "./types";
import { DEFAULT_THEME_ID, resolveThemeId } from "../themes/themes";

const PROP_TYPE_SET = new Set<string>(PROP_TYPES);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function toSafeInteger(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return clamp(Math.round(value), min, max);
}

function sanitizePropDepth(value: unknown): PropDepth | undefined {
  return value === "front" || value === "back" ? value : undefined;
}

function sanitizePropType(value: unknown): PropType {
  return typeof value === "string" && PROP_TYPE_SET.has(value)
    ? value as PropType
    : "grass1";
}

function sanitizeProp(prop: LevelProp, width: number): LevelProp {
  return {
    type: sanitizePropType(prop.type),
    x: roundToTenths(clamp(toFiniteNumber(prop.x, 0), 0, Math.max(0, width - 0.1))),
    depth: sanitizePropDepth(prop.depth),
    offsetY: Number.isFinite(prop.offsetY) && prop.offsetY !== 0 ? Math.round(prop.offsetY) : undefined,
    flipX: prop.flipX ? true : undefined,
  };
}

function sanitizeSolidRect(rect: LevelSolidRect, width: number, height: number): LevelSolidRect | null {
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null;
  }

  const startX = clamp(Math.floor(rect.x), 0, width - 1);
  const startY = clamp(Math.floor(rect.y), 0, height - 1);
  const endX = clamp(Math.floor(rect.x + rect.width - 1), startX, width - 1);
  const endY = clamp(Math.floor(rect.y + rect.height - 1), startY, height - 1);

  return {
    x: startX,
    y: startY,
    width: (endX - startX) + 1,
    height: (endY - startY) + 1,
  };
}

function sanitizeTerrainOverride(override: TerrainTileOverride, width: number, height: number): TerrainTileOverride | null {
  if (!Number.isFinite(override.x) || !Number.isFinite(override.y) || !Number.isFinite(override.tile)) {
    return null;
  }

  const x = Math.floor(override.x);
  const y = Math.floor(override.y);
  const tile = Math.floor(override.tile);

  if (x < 0 || y < 0 || x >= width || y >= height || tile < 0) {
    return null;
  }

  return { x, y, tile };
}

function createSolidGridFromRects(width: number, height: number, solids: LevelSolidRect[]): SolidGrid {
  const grid = Array.from({ length: height }, () => Array(width).fill(false));

  for (const solid of solids) {
    for (let y = solid.y; y < solid.y + solid.height; y += 1) {
      for (let x = solid.x; x < solid.x + solid.width; x += 1) {
        grid[y][x] = true;
      }
    }
  }

  return grid;
}

export function cloneLevelData(level: LevelData): LevelData {
  return {
    version: level.version,
    name: level.name,
    theme: level.theme,
    width: level.width,
    height: level.height,
    spawn: {
      x: level.spawn.x,
      y: level.spawn.y,
    },
    solids: level.solids.map((solid) => ({ ...solid })),
    terrainOverrides: level.terrainOverrides.map((override) => ({ ...override })),
    props: level.props.map((prop) => ({ ...prop })),
  };
}

export function createEmptyLevel(width = 64, height = 12, name = "Untitled Level"): LevelData {
  const safeWidth = toSafeInteger(width, 64, 8, 256);
  const safeHeight = toSafeInteger(height, 12, 4, 64);

  return {
    version: LEVEL_VERSION,
    name,
    theme: DEFAULT_THEME_ID,
    width: safeWidth,
    height: safeHeight,
    spawn: {
      x: 2.5,
      y: Math.max(0, safeHeight - 4),
    },
    solids: [],
    terrainOverrides: [],
    props: [],
  };
}

export function normalizeLevelData(raw: unknown): LevelData {
  if (!raw || typeof raw !== "object") {
    return createEmptyLevel();
  }

  const level = raw as Partial<LevelData>;
  const width = toSafeInteger(Number(level.width), 64, 8, 256);
  const height = toSafeInteger(Number(level.height), 12, 4, 64);
  const name = typeof level.name === "string" && level.name.trim().length > 0
    ? level.name.trim()
    : "Untitled Level";
  const theme = resolveThemeId(level.theme);
  const solids = Array.isArray(level.solids)
    ? level.solids
      .map((solid) => sanitizeSolidRect(solid, width, height))
      .filter((solid): solid is LevelSolidRect => solid !== null)
    : [];
  const solidGrid = createSolidGridFromRects(width, height, solids);
  const terrainOverrides = Array.isArray(level.terrainOverrides)
    ? level.terrainOverrides
      .map((override) => sanitizeTerrainOverride(override, width, height))
      .filter((override): override is TerrainTileOverride => override !== null && solidGrid[override.y]?.[override.x] === true)
    : [];
  const props = Array.isArray(level.props)
    ? level.props.map((prop) => sanitizeProp(prop, width))
    : [];

  return {
    version: Number.isFinite(level.version) ? Number(level.version) : LEVEL_VERSION,
    name,
    theme,
    width,
    height,
    spawn: {
      x: roundToTenths(clamp(toFiniteNumber(level.spawn?.x, 2.5), 0.5, Math.max(0.5, width - 0.5))),
      y: clamp(toFiniteNumber(level.spawn?.y, Math.max(0, height - 4)), 0, height - 1),
    },
    solids,
    terrainOverrides,
    props,
  };
}

export function createSolidGrid(level: LevelData): SolidGrid {
  return createSolidGridFromRects(
    level.width,
    level.height,
    level.solids
      .map((solid) => sanitizeSolidRect(solid, level.width, level.height))
      .filter((solid): solid is LevelSolidRect => solid !== null),
  );
}

export function compressSolidGrid(grid: SolidGrid): LevelSolidRect[] {
  const solids: LevelSolidRect[] = [];
  let activeRects = new Map<string, LevelSolidRect>();

  for (let y = 0; y < grid.length; y += 1) {
    const segments: Array<{ x: number; width: number }> = [];
    let spanStart = -1;

    for (let x = 0; x <= grid[y].length; x += 1) {
      const occupied = x < grid[y].length && grid[y][x];

      if (occupied && spanStart === -1) {
        spanStart = x;
      }

      if (!occupied && spanStart !== -1) {
        segments.push({ x: spanStart, width: x - spanStart });
        spanStart = -1;
      }
    }

    const nextActive = new Map<string, LevelSolidRect>();

    for (const segment of segments) {
      const key = `${segment.x}:${segment.width}`;
      const existing = activeRects.get(key);

      if (existing && existing.y + existing.height === y) {
        existing.height += 1;
        nextActive.set(key, existing);
        continue;
      }

      const rect: LevelSolidRect = {
        x: segment.x,
        y,
        width: segment.width,
        height: 1,
      };
      solids.push(rect);
      nextActive.set(key, rect);
    }

    activeRects = nextActive;
  }

  return solids;
}

export function resizeLevel(level: LevelData, nextWidth: number, nextHeight: number): LevelData {
  const width = toSafeInteger(nextWidth, level.width, 8, 256);
  const height = toSafeInteger(nextHeight, level.height, 4, 64);
  const currentGrid = createSolidGrid(level);
  const nextGrid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => level.solids.length > 0 && y < level.height && x < level.width
      ? currentGrid[y]?.[x] ?? false
      : false));

  return normalizeLevelData({
    ...level,
    width,
    height,
    spawn: {
      x: clamp(level.spawn.x, 0.5, Math.max(0.5, width - 0.5)),
      y: clamp(level.spawn.y, 0, height - 1),
    },
    solids: compressSolidGrid(nextGrid),
    terrainOverrides: level.terrainOverrides.filter((override) =>
      override.x >= 0
      && override.x < width
      && override.y >= 0
      && override.y < height
      && nextGrid[override.y]?.[override.x] === true),
    props: level.props.filter((prop) => prop.x >= 0 && prop.x < width),
  });
}

export function serializeLevel(level: LevelData): string {
  return `${JSON.stringify(normalizeLevelData(level), null, 2)}\n`;
}

export function isSolid(grid: SolidGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || y >= grid.length || x >= grid[0].length) {
    return false;
  }

  return grid[y][x];
}

export function getSurfaceTileY(grid: SolidGrid, tileX: number): number {
  if (grid.length === 0 || grid[0].length === 0) {
    return 0;
  }

  const column = clamp(Math.floor(tileX), 0, grid[0].length - 1);

  for (let y = 0; y < grid.length; y += 1) {
    if (grid[y][column]) {
      return y;
    }
  }

  return grid.length - 1;
}

export function getSurfaceWorldY(grid: SolidGrid, tileX: number): number {
  return LAYER_OFFSET_Y + (getSurfaceTileY(grid, tileX) * TILE_SIZE);
}
