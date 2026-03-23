import Phaser from "phaser";
import { createSolidGrid, getPropAssetKey, getSurfaceWorldY, isSolid } from "./levelData";
import { LAYER_OFFSET_Y, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, TILE_SIZE, type LevelData, type SolidGrid } from "./types";

const TERRAIN_TILES = {
  topLeft: 0,
  topCenter: [1, 2],
  topRight: 3,
  isolatedTop: 48,
  leftWall: [21, 42, 63],
  rightWall: [24, 45, 66],
  shallowFill: [253, 254],
  deepFill: [274, 275],
} as const;

export interface ParallaxLayers {
  layer1: Phaser.GameObjects.TileSprite;
  layer2: Phaser.GameObjects.TileSprite;
  layer3: Phaser.GameObjects.TileSprite;
}

export interface RenderedTerrain {
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  interiorFill: Phaser.GameObjects.Graphics;
}

export interface RenderedProp {
  propIndex: number;
  display: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
}

function getTerrainKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function pickFrom(tiles: readonly number[], seed: number): number {
  return tiles[Math.abs(seed) % tiles.length];
}

function getSurfaceDepth(grid: SolidGrid, x: number, y: number): number {
  let depth = 0;
  let cursor = y - 1;

  while (isSolid(grid, x, cursor)) {
    depth += 1;
    cursor -= 1;
  }

  return depth;
}

function selectTerrainTile(grid: SolidGrid, x: number, y: number, levelWidth: number, levelHeight: number): number {
  const aboveSolid = isSolid(grid, x, y - 1);
  const leftSolid = isSolid(grid, x - 1, y);
  const rightSolid = isSolid(grid, x + 1, y);
  const depth = getSurfaceDepth(grid, x, y);
  const normalizedDepth = Math.min(depth, 2);

  if (!aboveSolid) {
    if (!leftSolid && rightSolid) {
      return TERRAIN_TILES.topLeft;
    }
    if (leftSolid && !rightSolid) {
      return TERRAIN_TILES.topRight;
    }
    if (!leftSolid && !rightSolid) {
      return TERRAIN_TILES.isolatedTop;
    }
    return pickFrom(TERRAIN_TILES.topCenter, x);
  }

  if (!leftSolid && rightSolid) {
    return TERRAIN_TILES.leftWall[normalizedDepth];
  }

  if (leftSolid && !rightSolid) {
    return TERRAIN_TILES.rightWall[normalizedDepth];
  }

  if (!leftSolid && !rightSolid) {
    return depth === 0
      ? pickFrom(TERRAIN_TILES.topCenter, x)
      : pickFrom(TERRAIN_TILES.shallowFill, x + y);
  }

  if (y === levelHeight - 1 || x === 0 || x === levelWidth - 1) {
    return pickFrom(TERRAIN_TILES.deepFill, x + y);
  }

  return depth <= 1
    ? pickFrom(TERRAIN_TILES.shallowFill, x + y)
    : pickFrom(TERRAIN_TILES.deepFill, x + y);
}

export function createTerrainOverrideLookup(level: LevelData): Map<string, number> {
  return new Map(level.terrainOverrides.map((override) => [getTerrainKey(override.x, override.y), override.tile]));
}

export function getTerrainTileIndex(
  level: LevelData,
  grid: SolidGrid,
  x: number,
  y: number,
  overrideLookup = createTerrainOverrideLookup(level),
): number | null {
  if (!isSolid(grid, x, y)) {
    return null;
  }

  return overrideLookup.get(getTerrainKey(x, y))
    ?? selectTerrainTile(grid, x, y, level.width, level.height);
}

export function createOakwoodsAnimations(scene: Phaser.Scene): void {
  const animations = [
    { key: "char-blue-idle", texture: "oakwoods-char-blue", start: 0, end: 5, frameRate: 8, repeat: -1 },
    { key: "char-blue-run", texture: "oakwoods-char-blue", start: 16, end: 21, frameRate: 10, repeat: -1 },
    { key: "char-blue-jump", texture: "oakwoods-char-blue", start: 28, end: 31, frameRate: 10, repeat: 0 },
    { key: "char-blue-fall", texture: "oakwoods-char-blue", start: 35, end: 37, frameRate: 10, repeat: 0 },
    { key: "char-blue-attack", texture: "oakwoods-char-blue", start: 8, end: 13, frameRate: 12, repeat: 0 },
    { key: "shop-idle", texture: "oakwoods-shop-anim", start: 0, end: 5, frameRate: 8, repeat: -1 },
  ] as const;

  for (const animation of animations) {
    if (scene.anims.exists(animation.key)) {
      continue;
    }

    scene.anims.create({
      key: animation.key,
      frames: scene.anims.generateFrameNumbers(animation.texture, {
        start: animation.start,
        end: animation.end,
      }),
      frameRate: animation.frameRate,
      repeat: animation.repeat,
    });
  }
}

export function createParallaxBackground(scene: Phaser.Scene): ParallaxLayers {
  return {
    layer1: scene.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "oakwoods-bg-layer1")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-30),
    layer2: scene.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "oakwoods-bg-layer2")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20),
    layer3: scene.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "oakwoods-bg-layer3")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10),
  };
}

export function updateParallax(layers: ParallaxLayers, cameraScrollX: number): void {
  layers.layer1.tilePositionX = cameraScrollX * 0.1;
  layers.layer2.tilePositionX = cameraScrollX * 0.3;
  layers.layer3.tilePositionX = cameraScrollX * 0.5;
}

export function renderTerrain(scene: Phaser.Scene, level: LevelData, grid = createSolidGrid(level)): RenderedTerrain {
  const terrainOverrideLookup = createTerrainOverrideLookup(level);
  const map = scene.make.tilemap({
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    width: level.width,
    height: level.height,
  });
  const tileset = map.addTilesetImage("oakwoods-tileset");

  if (!tileset) {
    throw new Error("Failed to load oakwoods tileset");
  }

  const layer = map.createBlankLayer("terrain", tileset, 0, LAYER_OFFSET_Y);

  if (!layer) {
    throw new Error("Failed to create terrain layer");
  }

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const tileIndex = getTerrainTileIndex(level, grid, x, y, terrainOverrideLookup);
      if (tileIndex === null) {
        continue;
      }

      map.putTileAt(tileIndex, x, y, true, "terrain");
    }
  }

  const interiorFill = scene.add.graphics().setDepth(1);
  interiorFill.fillStyle(0x251613, 1);

  for (let y = 0; y < level.height; y += 1) {
    let spanStart = -1;

    for (let x = 0; x <= level.width; x += 1) {
      const isInterior =
        x < level.width
        && isSolid(grid, x, y)
        && isSolid(grid, x, y - 1)
        && isSolid(grid, x - 1, y)
        && isSolid(grid, x + 1, y);
      const fillsInterior = isInterior && !terrainOverrideLookup.has(getTerrainKey(x, y));

      if (fillsInterior && spanStart === -1) {
        spanStart = x;
      }

      if ((!fillsInterior || x === level.width) && spanStart !== -1) {
        const spanEnd = fillsInterior ? x : x - 1;
        interiorFill.fillRect(
          spanStart * TILE_SIZE,
          LAYER_OFFSET_Y + (y * TILE_SIZE),
          ((spanEnd - spanStart) + 1) * TILE_SIZE,
          TILE_SIZE,
        );
        spanStart = -1;
      }
    }
  }

  return {
    map,
    layer: layer.setDepth(0),
    interiorFill,
  };
}

export function renderProps(scene: Phaser.Scene, level: LevelData, solidGrid: SolidGrid): RenderedProp[] {
  const renderedProps: RenderedProp[] = [];
  const backDepth = 6;
  const frontDepth = 12;

  level.props.forEach((prop, propIndex) => {
    const worldX = prop.x * TILE_SIZE;
    const worldY = getSurfaceWorldY(solidGrid, prop.x) + (prop.offsetY ?? 0);
    const depth = prop.depth === "front" ? frontDepth : backDepth;
    const assetKey = getPropAssetKey(prop.type);

    if (prop.type === "shop") {
      const shop = scene.add.sprite(worldX, worldY, assetKey, 0)
        .setOrigin(0.5, 1)
        .setDepth(depth);
      shop.setFlipX(Boolean(prop.flipX));
      shop.anims.play("shop-idle");
      renderedProps.push({ propIndex, display: shop });
      return;
    }

    const image = scene.add.image(worldX, worldY, assetKey)
      .setOrigin(0.5, 1)
      .setDepth(depth);
    image.setFlipX(Boolean(prop.flipX));
    renderedProps.push({ propIndex, display: image });
  });

  return renderedProps;
}
