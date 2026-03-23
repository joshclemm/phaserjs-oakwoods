import Phaser from "phaser";
import { applyAppMode, getAppMode } from "./appMode";
import { BootScene } from "./scenes/BootScene";
import { EditorScene } from "./scenes/EditorScene";
import { GameScene } from "./scenes/GameScene";

const appMode = getAppMode();
applyAppMode(appMode);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: 320,
  height: 180,
  parent: "game-stage",
  backgroundColor: "#1a1a1a",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false,
    },
  },
  scene: [BootScene, EditorScene, GameScene],
};

new Phaser.Game(config);
