export const LEVEL_VERSION = 5;
export const TILE_SIZE = 24;
export const VIEWPORT_WIDTH = 320;
export const VIEWPORT_HEIGHT = 180;
export const LAYER_OFFSET_Y = 16;
export const OAK_WOODS_TILESET_COLUMNS = 21;
export const OAK_WOODS_TILESET_ROWS = 15;
export const OAK_WOODS_TILESET_TILE_COUNT = OAK_WOODS_TILESET_COLUMNS * OAK_WOODS_TILESET_ROWS;
export const OAK_WOODS_TILESET_URL = "/assets/oakwoods/oak_woods_tileset.png";

export const PROP_TYPES = [
  "shop",
  "lamp",
  "sign",
  "fence1",
  "fence2",
  "rock1",
  "rock2",
  "rock3",
  "grass1",
  "grass2",
  "grass3",
] as const;

export type PropType = (typeof PROP_TYPES)[number];
export type PropDepth = "back" | "front";
export type SolidGrid = boolean[][];

export interface LevelProp {
  type: PropType;
  x: number;
  depth?: PropDepth;
  offsetY?: number;
  flipX?: boolean;
}

export interface LevelSolidRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerrainTileOverride {
  x: number;
  y: number;
  tile: number;
}

export interface LevelData {
  version: number;
  name: string;
  width: number;
  height: number;
  spawn: {
    x: number;
    y: number;
  };
  solids: LevelSolidRect[];
  terrainOverrides: TerrainTileOverride[];
  props: LevelProp[];
}
