import Phaser from "phaser";
import { getAppMode } from "../appMode";
import { cloneLevelData, normalizeLevelData } from "../levels/levelData";
import {
  getThemeDefinitions,
  THEME_MANIFESTS_REGISTRY_KEY,
  type ThemeAssetManifest,
  type ThemeManifestMap,
} from "../themes/themes";

const MISSING_FILES_REGISTRY_KEY = "game-missing-files";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    // If art assets are missing, the loader will fail. Track failures so we can
    // show an actionable message instead of starting the game with missing textures.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: any) => {
      const list = (this.registry.get(MISSING_FILES_REGISTRY_KEY) as string[] | undefined) ?? [];
      const key = typeof file?.key === "string" ? file.key : "unknown";
      const url = typeof file?.url === "string" ? file.url : undefined;
      list.push(url ? `${key} (${url})` : key);
      this.registry.set(MISSING_FILES_REGISTRY_KEY, list);
    });

    // Display loading text
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.add.text(width / 2, height / 2, "Loading...", {
      fontSize: "16px",
      color: "#ffffff",
    }).setOrigin(0.5);

    for (const theme of getThemeDefinitions()) {
      this.load.json(theme.manifestCacheKey, theme.manifestPath);
    }

    this.load.json("oakwoods-level-1", "levels/level-1.json");
  }

  create(): void {
    const themeManifests: ThemeManifestMap = {};
    const missingManifests: string[] = [];

    for (const theme of getThemeDefinitions()) {
      const manifest = this.cache.json.get(theme.manifestCacheKey) as ThemeAssetManifest | undefined;
      if (!manifest?.meta?.basePath) {
        missingManifests.push(theme.manifestPath);
        continue;
      }

      themeManifests[theme.id] = manifest;
    }

    if (missingManifests.length > 0) {
      const width = this.cameras.main.width;
      const height = this.cameras.main.height;
      this.add.text(
        10,
        10,
        [
          "Missing theme manifest data.",
          "",
          ...missingManifests.map((path) => `- public/${path}`),
          "",
          "See the repo README for setup.",
        ].join("\n"),
        { fontSize: "12px", color: "#ffffff", wordWrap: { width: width - 20 } },
      );
      return;
    }

    for (const manifest of Object.values(themeManifests)) {
      const basePath = manifest.meta.basePath;

      for (const bg of manifest.images.backgrounds) {
        this.load.image(bg.key, `${basePath}/${bg.path}`);
      }

      for (const decoration of manifest.images.decorations) {
        this.load.image(decoration.key, `${basePath}/${decoration.path}`);
      }

      const character = manifest.spritesheets.character;
      this.load.spritesheet(character.key, `${basePath}/${character.path}`, {
        frameWidth: character.frameWidth,
        frameHeight: character.frameHeight,
      });

      const shop = manifest.spritesheets.decorations?.shop;
      if (shop) {
        this.load.spritesheet(shop.key, `${basePath}/${shop.path}`, {
          frameWidth: shop.frameWidth,
          frameHeight: shop.frameHeight,
        });
      }

      const tileset = manifest.tilesets.main;
      this.load.image(tileset.key, `${basePath}/${tileset.path}`);
    }

    this.registry.set(THEME_MANIFESTS_REGISTRY_KEY, themeManifests);

    // Start loading and transition to GameScene when complete
    this.load.once("complete", () => {
      const missing = (this.registry.get(MISSING_FILES_REGISTRY_KEY) as string[] | undefined) ?? [];
      if (missing.length > 0) {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const preview = missing.slice(0, 6).map((s) => `- ${s}`).join("\n");
        this.add.text(
          10,
          10,
          [
            "Missing theme art assets.",
            "",
            "Example missing files:",
            preview,
            missing.length > 6 ? `\n(and ${missing.length - 6} more)` : "",
            "",
            "See the repo README for setup + credits.",
          ].join("\n"),
          { fontSize: "12px", color: "#ffffff", wordWrap: { width: width - 20 } },
        );
        return;
      }

      const level = normalizeLevelData(this.cache.json.get("oakwoods-level-1"));
      const appMode = getAppMode();
      this.registry.set("oakwoods-source-level", cloneLevelData(level));
      this.registry.set("oakwoods-active-level", cloneLevelData(level));
      this.registry.set("oakwoods-editor-enabled", appMode === "editor");
      this.scene.start(appMode === "editor" ? "EditorScene" : "GameScene");
    });

    this.load.start();
  }
}
