import { PROP_TYPES, type PropType } from "../levels/types";

export interface ThemeManifestAnimation {
  key: string;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  repeat: number;
}

export interface ThemeAssetManifest {
  meta: {
    name?: string;
    author?: string;
    description?: string;
    basePath: string;
  };
  images: {
    backgrounds: Array<{ key: string; path: string }>;
    decorations: Array<{ key: string; path: string }>;
  };
  spritesheets: {
    character: {
      key: string;
      path: string;
      frameWidth: number;
      frameHeight: number;
      animations: ThemeManifestAnimation[];
    };
    decorations?: {
      shop?: {
        key: string;
        path: string;
        frameWidth: number;
        frameHeight: number;
        animations: ThemeManifestAnimation[];
      };
    };
  };
  tilesets: {
    main: {
      key: string;
      path: string;
      tileWidth?: number;
      tileHeight?: number;
      columns?: number;
      rows?: number;
      totalTiles?: number;
    };
  };
}

export interface ThemeDefinition {
  id: string;
  label: string;
  manifestCacheKey: string;
  manifestPath: string;
  tilesetKey: string;
  backgrounds: {
    farKey: string;
    midKey: string;
    nearKey: string;
  };
  player: {
    textureKey: string;
    animationKeys: {
      idle: string;
      run: string;
      jump: string;
      fall: string;
      attack: string;
    };
    animationSources: {
      idle: string;
      run: string;
      jump: string;
      fall: string;
      attack: string;
    };
  };
  props: Partial<Record<PropType, {
    textureKey: string;
    animationKey?: string;
    animationSourceKey?: string;
  }>>;
}

export type ThemeManifestMap = Record<string, ThemeAssetManifest>;

export const DEFAULT_THEME_ID = "woods";
export const THEME_MANIFESTS_REGISTRY_KEY = "game-theme-manifests";

const THEME_DEFINITIONS = [
  {
    id: "woods",
    label: "Woods",
    manifestCacheKey: "theme-manifest-woods",
    manifestPath: "assets/oakwoods/assets.json",
    tilesetKey: "oakwoods-tileset",
    backgrounds: {
      farKey: "oakwoods-bg-layer1",
      midKey: "oakwoods-bg-layer2",
      nearKey: "oakwoods-bg-layer3",
    },
    player: {
      textureKey: "oakwoods-char-blue",
      animationKeys: {
        idle: "woods-player-idle",
        run: "woods-player-run",
        jump: "woods-player-jump",
        fall: "woods-player-fall",
        attack: "woods-player-attack",
      },
      animationSources: {
        idle: "char-blue-idle",
        run: "char-blue-run",
        jump: "char-blue-jump",
        fall: "char-blue-fall",
        attack: "char-blue-attack",
      },
    },
    props: {
      shop: {
        textureKey: "oakwoods-shop-anim",
        animationKey: "woods-prop-shop-idle",
        animationSourceKey: "shop-idle",
      },
      lamp: { textureKey: "oakwoods-lamp" },
      sign: { textureKey: "oakwoods-sign" },
      fence1: { textureKey: "oakwoods-fence1" },
      fence2: { textureKey: "oakwoods-fence2" },
      rock1: { textureKey: "oakwoods-rock1" },
      rock2: { textureKey: "oakwoods-rock2" },
      rock3: { textureKey: "oakwoods-rock3" },
      grass1: { textureKey: "oakwoods-grass1" },
      grass2: { textureKey: "oakwoods-grass2" },
      grass3: { textureKey: "oakwoods-grass3" },
    },
  },
  {
    id: "irwin",
    label: "Irwin",
    manifestCacheKey: "theme-manifest-irwin",
    manifestPath: "assets/irwin/assets.json",
    tilesetKey: "irwin-tileset",
    backgrounds: {
      farKey: "irwin-bg-layer1",
      midKey: "irwin-bg-layer2",
      nearKey: "irwin-bg-layer3",
    },
    player: {
      textureKey: "irwin-char-blue",
      animationKeys: {
        idle: "irwin-player-idle",
        run: "irwin-player-run",
        jump: "irwin-player-jump",
        fall: "irwin-player-fall",
        attack: "irwin-player-attack",
      },
      animationSources: {
        idle: "char-blue-idle",
        run: "char-blue-run",
        jump: "char-blue-jump",
        fall: "char-blue-fall",
        attack: "char-blue-attack",
      },
    },
    props: {
      shop: {
        textureKey: "irwin-shop-anim",
        animationKey: "irwin-prop-shop-idle",
        animationSourceKey: "shop-idle",
      },
      lamp: { textureKey: "irwin-lamp" },
      sign: { textureKey: "irwin-sign" },
      rock1: { textureKey: "irwin-rock1" },
      rock2: { textureKey: "irwin-rock2" },
      rock3: { textureKey: "irwin-rock3" },
      grass1: { textureKey: "irwin-grass1" },
      grass2: { textureKey: "irwin-grass2" },
      grass3: { textureKey: "irwin-grass3" },
    },
  },
] as const satisfies readonly ThemeDefinition[];

const THEME_MAP = new Map(THEME_DEFINITIONS.map((theme) => [theme.id, theme]));

export function getThemeDefinitions(): readonly ThemeDefinition[] {
  return THEME_DEFINITIONS;
}

export function getThemeOptions(): Array<{ id: string; label: string }> {
  return THEME_DEFINITIONS.map((theme) => ({
    id: theme.id,
    label: theme.label,
  }));
}

export function getThemePropTypes(themeId: string | null | undefined): PropType[] {
  const theme = getThemeDefinition(themeId);
  return PROP_TYPES.filter((propType) => theme.props[propType] !== undefined);
}

export function getThemeDefinition(themeId: string | null | undefined): ThemeDefinition {
  return THEME_MAP.get(themeId ?? "") ?? THEME_MAP.get(DEFAULT_THEME_ID)!;
}

export function resolveThemeId(themeId: unknown): string {
  return typeof themeId === "string" && THEME_MAP.has(themeId)
    ? themeId
    : DEFAULT_THEME_ID;
}

export function getThemeManifest(themeId: string | null | undefined, themeManifests: ThemeManifestMap | undefined): ThemeAssetManifest {
  const theme = getThemeDefinition(themeId);
  const manifest = themeManifests?.[theme.id];

  if (!manifest?.meta?.basePath) {
    throw new Error(`Missing asset manifest for theme "${theme.id}"`);
  }

  return manifest;
}

export function resolveThemeAssetUrl(manifest: ThemeAssetManifest, relativePath: string): string {
  const basePath = manifest.meta.basePath.replace(/^\/+|\/+$/g, "");
  const assetPath = relativePath.replace(/^\/+/, "");
  return `/${basePath}/${assetPath}`;
}

export function getThemeTilesetColumns(manifest: ThemeAssetManifest): number {
  return Math.max(1, Math.floor(manifest.tilesets.main.columns ?? 1));
}

export function getThemeTilesetRows(manifest: ThemeAssetManifest): number {
  const explicitRows = manifest.tilesets.main.rows;
  if (Number.isFinite(explicitRows)) {
    return Math.max(1, Math.floor(explicitRows!));
  }

  const columns = getThemeTilesetColumns(manifest);
  const totalTiles = manifest.tilesets.main.totalTiles;
  if (!Number.isFinite(totalTiles)) {
    return 1;
  }
  return Math.max(1, Math.ceil(totalTiles / columns));
}

export function getThemeTilesetTileCount(manifest: ThemeAssetManifest): number {
  const explicitTotalTiles = manifest.tilesets.main.totalTiles;
  if (Number.isFinite(explicitTotalTiles)) {
    return Math.max(0, Math.floor(explicitTotalTiles!));
  }

  return getThemeTilesetColumns(manifest) * Math.max(1, Math.floor(manifest.tilesets.main.rows ?? 1));
}
