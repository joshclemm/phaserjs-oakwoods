import Phaser from "phaser";
import { createSolidGrid, getSurfaceWorldY, isSolid } from "./levelData";
import { LAYER_OFFSET_Y, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, TILE_SIZE, type LevelData, type SolidGrid } from "./types";
import {
  getThemeDefinition,
  getThemeManifest,
  THEME_MANIFESTS_REGISTRY_KEY,
  type ThemeAssetManifest,
  type ThemeManifestAnimation,
  type ThemeManifestMap,
} from "../themes/themes";

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

function getThemeContext(scene: Phaser.Scene, themeId: string): {
  theme: ReturnType<typeof getThemeDefinition>;
  manifest: ThemeAssetManifest;
} {
  const theme = getThemeDefinition(themeId);
  const manifests = scene.registry.get(THEME_MANIFESTS_REGISTRY_KEY) as ThemeManifestMap | undefined;
  const manifest = getThemeManifest(theme.id, manifests);
  return { theme, manifest };
}

function getRequiredAnimation(
  animations: readonly ThemeManifestAnimation[] | undefined,
  animationKey: string,
  themeId: string,
): ThemeManifestAnimation {
  const animation = animations?.find((entry) => entry.key === animationKey);
  if (!animation) {
    throw new Error(`Missing animation "${animationKey}" for theme "${themeId}"`);
  }

  return animation;
}

function createAnimationIfNeeded(
  scene: Phaser.Scene,
  animationKey: string,
  textureKey: string,
  animation: ThemeManifestAnimation,
): void {
  if (scene.anims.exists(animationKey)) {
    return;
  }

  scene.anims.create({
    key: animationKey,
    frames: scene.anims.generateFrameNumbers(textureKey, {
      start: animation.startFrame,
      end: animation.endFrame,
    }),
    frameRate: animation.frameRate,
    repeat: animation.repeat,
  });
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

export function createThemeAnimations(scene: Phaser.Scene, themeId: string): void {
  const { theme, manifest } = getThemeContext(scene, themeId);
  const playerAnimationSources = theme.player.animationSources;
  const playerAnimationKeys = theme.player.animationKeys;

  createAnimationIfNeeded(
    scene,
    playerAnimationKeys.idle,
    theme.player.textureKey,
    getRequiredAnimation(manifest.spritesheets.character.animations, playerAnimationSources.idle, theme.id),
  );
  createAnimationIfNeeded(
    scene,
    playerAnimationKeys.run,
    theme.player.textureKey,
    getRequiredAnimation(manifest.spritesheets.character.animations, playerAnimationSources.run, theme.id),
  );
  createAnimationIfNeeded(
    scene,
    playerAnimationKeys.jump,
    theme.player.textureKey,
    getRequiredAnimation(manifest.spritesheets.character.animations, playerAnimationSources.jump, theme.id),
  );
  createAnimationIfNeeded(
    scene,
    playerAnimationKeys.fall,
    theme.player.textureKey,
    getRequiredAnimation(manifest.spritesheets.character.animations, playerAnimationSources.fall, theme.id),
  );
  createAnimationIfNeeded(
    scene,
    playerAnimationKeys.attack,
    theme.player.textureKey,
    getRequiredAnimation(manifest.spritesheets.character.animations, playerAnimationSources.attack, theme.id),
  );

  const shopAsset = theme.props.shop;
  if (shopAsset?.animationKey && shopAsset.animationSourceKey) {
    createAnimationIfNeeded(
      scene,
      shopAsset.animationKey,
      shopAsset.textureKey,
      getRequiredAnimation(manifest.spritesheets.decorations?.shop?.animations, shopAsset.animationSourceKey, theme.id),
    );
  }
}

export function createParallaxBackground(scene: Phaser.Scene, themeId: string): ParallaxLayers {
  const { theme } = getThemeContext(scene, themeId);
  return {
    layer1: scene.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, theme.backgrounds.farKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-30),
    layer2: scene.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, theme.backgrounds.midKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20),
    layer3: scene.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, theme.backgrounds.nearKey)
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
  const { theme } = getThemeContext(scene, level.theme);
  const terrainOverrideLookup = createTerrainOverrideLookup(level);
  const map = scene.make.tilemap({
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    width: level.width,
    height: level.height,
  });
  const tileset = map.addTilesetImage(theme.tilesetKey);

  if (!tileset) {
    throw new Error(`Failed to load tileset for theme "${theme.id}"`);
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
  const { theme } = getThemeContext(scene, level.theme);
  const renderedProps: RenderedProp[] = [];
  const backDepth = 6;
  const frontDepth = 12;

  level.props.forEach((prop, propIndex) => {
    const worldX = prop.x * TILE_SIZE;
    const worldY = getSurfaceWorldY(solidGrid, prop.x) + (prop.offsetY ?? 0);
    const depth = prop.depth === "front" ? frontDepth : backDepth;
    const propAsset = theme.props[prop.type];

    if (!propAsset || !scene.textures.exists(propAsset.textureKey)) {
      return;
    }

    if (propAsset.animationKey) {
      const sprite = scene.add.sprite(worldX, worldY, propAsset.textureKey, 0)
        .setOrigin(0.5, 1)
        .setDepth(depth);
      sprite.setFlipX(Boolean(prop.flipX));
      sprite.anims.play(propAsset.animationKey);
      renderedProps.push({ propIndex, display: sprite });
      return;
    }

    const image = scene.add.image(worldX, worldY, propAsset.textureKey)
      .setOrigin(0.5, 1)
      .setDepth(depth);
    image.setFlipX(Boolean(prop.flipX));
    renderedProps.push({ propIndex, display: image });
  });

  return renderedProps;
}
