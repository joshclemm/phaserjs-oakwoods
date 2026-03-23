import Phaser from "phaser";
import { getAppMode } from "../appMode";
import { cloneLevelData, normalizeLevelData } from "../levels/levelData";

interface AssetManifest {
  meta: {
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
      animations: Array<{
        key: string;
        startFrame: number;
        endFrame: number;
        frameRate: number;
        repeat: number;
      }>;
    };
    decorations?: {
      shop?: {
        key: string;
        path: string;
        frameWidth: number;
        frameHeight: number;
        animations: Array<{
          key: string;
          startFrame: number;
          endFrame: number;
          frameRate: number;
          repeat: number;
        }>;
      };
    };
  };
  tilesets: {
    main: {
      key: string;
      path: string;
    };
  };
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    // If art assets are missing, the loader will fail. Track failures so we can
    // show an actionable message instead of starting the game with missing textures.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: any) => {
      const list = (this.registry.get("oakwoods-missing-files") as string[] | undefined) ?? [];
      const key = typeof file?.key === "string" ? file.key : "unknown";
      const url = typeof file?.url === "string" ? file.url : undefined;
      list.push(url ? `${key} (${url})` : key);
      this.registry.set("oakwoods-missing-files", list);
    });

    // Display loading text
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.add.text(width / 2, height / 2, "Loading...", {
      fontSize: "16px",
      color: "#ffffff",
    }).setOrigin(0.5);

    // Load the asset manifest
    this.load.json("oakwoods-manifest", "assets/oakwoods/assets.json");
  }

  create(): void {
    const manifest = this.cache.json.get("oakwoods-manifest") as AssetManifest;
    if (!manifest?.meta?.basePath) {
      const width = this.cameras.main.width;
      const height = this.cameras.main.height;
      this.add.text(
        10,
        10,
        [
          "Missing manifest:",
          "public/assets/oakwoods/assets.json",
          "",
          "See the repo README for setup.",
        ].join("\n"),
        { fontSize: "12px", color: "#ffffff", wordWrap: { width: width - 20 } },
      );
      return;
    }

    const basePath = manifest.meta.basePath;

    // Queue all assets for loading
    // Background images
    for (const bg of manifest.images.backgrounds) {
      this.load.image(bg.key, `${basePath}/${bg.path}`);
    }

    // Decoration images (for future use)
    for (const dec of manifest.images.decorations) {
      this.load.image(dec.key, `${basePath}/${dec.path}`);
    }

    // Character spritesheet
    const char = manifest.spritesheets.character;
    this.load.spritesheet(char.key, `${basePath}/${char.path}`, {
      frameWidth: char.frameWidth,
      frameHeight: char.frameHeight,
    });

    const shop = manifest.spritesheets.decorations?.shop;
    if (shop) {
      this.load.spritesheet(shop.key, `${basePath}/${shop.path}`, {
        frameWidth: shop.frameWidth,
        frameHeight: shop.frameHeight,
      });
    }

    // Tileset image
    const tileset = manifest.tilesets.main;
    this.load.image(tileset.key, `${basePath}/${tileset.path}`);
    this.load.json("oakwoods-level-1", "levels/level-1.json");

    // Store manifest in registry for other scenes
    this.registry.set("oakwoods-manifest", manifest);

    // Start loading and transition to GameScene when complete
    this.load.once("complete", () => {
      const missing = (this.registry.get("oakwoods-missing-files") as string[] | undefined) ?? [];
      if (missing.length > 0) {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const preview = missing.slice(0, 6).map((s) => `- ${s}`).join("\n");
        this.add.text(
          10,
          10,
          [
            "Missing Oak Woods art assets.",
            "",
            "Download + extract the pack into:",
            "public/assets/oakwoods/",
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
