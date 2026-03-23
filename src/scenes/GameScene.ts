import Phaser from "phaser";
import { setEditorChromeState } from "../appMode";
import { createSolidGrid, normalizeLevelData } from "../levels/levelData";
import {
  createThemeAnimations,
  createParallaxBackground,
  renderProps,
  renderTerrain,
  updateParallax,
  type ParallaxLayers,
  type RenderedTerrain,
} from "../levels/rendering";
import {
  LAYER_OFFSET_Y,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  type LevelData,
} from "../levels/types";
import { getThemeDefinition } from "../themes/themes";

const WALK_SPEED = 100;
const RUN_SPEED = 145;
const BASE_JUMP_VELOCITY = -300;
const HARD_JUMP_MULTIPLIER = 1.25;

export class GameScene extends Phaser.Scene {
  private terrain?: RenderedTerrain;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private runKey!: Phaser.Input.Keyboard.Key;
  private background?: ParallaxLayers;
  private editorEnabled = false;
  private theme = getThemeDefinition(null);

  private isAttacking = false;
  private solidGrid: boolean[][] = [];
  private worldWidth = VIEWPORT_WIDTH;
  private spawnPoint = new Phaser.Math.Vector2();
  private deathY = VIEWPORT_HEIGHT;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const level = this.loadLevel();
    if (!level) {
      this.add.text(10, 10, "Missing level data.", {
        fontSize: "12px",
        color: "#ffffff",
        wordWrap: { width: VIEWPORT_WIDTH - 20 },
      });
      return;
    }

    this.editorEnabled = Boolean(this.registry.get("oakwoods-editor-enabled"));
    setEditorChromeState(this.editorEnabled ? "playtest" : "game");

    this.solidGrid = createSolidGrid(level);
    this.worldWidth = level.width * TILE_SIZE;
    this.theme = getThemeDefinition(level.theme);

    this.background = createParallaxBackground(this, level.theme);
    createThemeAnimations(this, level.theme);

    this.terrain = renderTerrain(this, level, this.solidGrid);
    this.terrain.layer.setCollisionByExclusion([-1]);
    renderProps(this, level, this.solidGrid);

    this.createPlayer(level);
    this.configureCamera(level);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.runKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    if (this.editorEnabled) {
      this.input.keyboard?.on("keydown-ESC", this.returnToEditor, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.keyboard?.off("keydown-ESC", this.returnToEditor, this);
      });
      this.add.text(8, 8, "Esc: back to editor", {
        fontSize: "12px",
        color: "#f4e3c3",
      })
        .setDepth(100)
        .setScrollFactor(0);
    }
  }

  update(): void {
    const onGround = this.player.body?.blocked.down ?? false;
    const velocityY = this.player.body?.velocity.y ?? 0;
    const isMovingHorizontally = this.cursors.left.isDown || this.cursors.right.isDown;
    const jumpKey = this.cursors.up;
    const isRunning = this.runKey.isDown;
    const moveSpeed = isRunning ? RUN_SPEED : WALK_SPEED;

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-moveSpeed);
      this.player.setFlipX(true);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(moveSpeed);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    if (Phaser.Input.Keyboard.JustDown(jumpKey) && onGround && !this.isAttacking) {
      const jumpVelocity = isRunning
        ? BASE_JUMP_VELOCITY * HARD_JUMP_MULTIPLIER
        : BASE_JUMP_VELOCITY;
      this.player.setVelocityY(jumpVelocity);
    }

    if (Phaser.Input.Keyboard.JustDown(this.attackKey) && onGround && !this.isAttacking) {
      this.isAttacking = true;
      this.player.setVelocityX(0);
      this.player.anims.play(this.theme.player.animationKeys.attack, true);
    }

    if (!this.isAttacking) {
      if (!onGround) {
        if (velocityY < 0) {
          this.player.anims.play(this.theme.player.animationKeys.jump, true);
        } else {
          this.player.anims.play(this.theme.player.animationKeys.fall, true);
        }
      } else if (isMovingHorizontally) {
        this.player.anims.play(this.theme.player.animationKeys.run, true);
      } else {
        this.player.anims.play(this.theme.player.animationKeys.idle, true);
      }
    }

    if (this.player.y > this.deathY) {
      this.respawnPlayer();
      return;
    }

    this.updateCamera();
    if (this.background) {
      updateParallax(this.background, this.cameras.main.scrollX);
    }
  }

  private loadLevel(): LevelData | null {
    const activeLevel = this.registry.get("oakwoods-active-level");
    if (activeLevel) {
      return normalizeLevelData(activeLevel);
    }

    const cachedLevel = this.cache.json.get("oakwoods-level-1");
    return cachedLevel ? normalizeLevelData(cachedLevel) : null;
  }

  private returnToEditor(): void {
    if (!this.editorEnabled) {
      return;
    }

    setEditorChromeState("editing");
    this.scene.start("EditorScene");
  }

  private createPlayer(level: LevelData): void {
    const spawnX = level.spawn.x * TILE_SIZE;
    const spawnY = LAYER_OFFSET_Y + (level.spawn.y * TILE_SIZE) - 28;
    this.spawnPoint.set(spawnX, spawnY);

    this.player = this.physics.add.sprite(spawnX, spawnY, this.theme.player.textureKey, 0)
      .setDepth(10);

    this.player.setBounce(0);
    this.player.body?.setSize(20, 38);
    this.player.body?.setOffset(18, 16);

    if (this.terrain) {
      this.physics.add.collider(this.player, this.terrain.layer);
    }

    this.player.anims.play(this.theme.player.animationKeys.idle, true);
    this.player.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
      if (anim.key === this.theme.player.animationKeys.attack) {
        this.isAttacking = false;
      }
    });
  }

  private configureCamera(level: LevelData): void {
    const worldHeight = LAYER_OFFSET_Y + (level.height * TILE_SIZE) + VIEWPORT_HEIGHT;
    this.physics.world.setBounds(0, 0, this.worldWidth, worldHeight);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.player.setCollideWorldBounds(true);
    this.deathY = LAYER_OFFSET_Y + (level.height * TILE_SIZE) + 24;

    this.cameras.main.setBounds(0, 0, this.worldWidth, VIEWPORT_HEIGHT);
    this.cameras.main.scrollY = 0;
  }

  private respawnPlayer(): void {
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.setVelocity(0, 0);
    this.player.setAcceleration(0, 0);
    this.isAttacking = false;
    this.player.anims.play(this.theme.player.animationKeys.idle, true);

    const maxScrollX = Math.max(0, this.worldWidth - VIEWPORT_WIDTH);
    this.cameras.main.scrollX = Phaser.Math.Clamp(this.spawnPoint.x - (VIEWPORT_WIDTH * 0.35), 0, maxScrollX);
  }

  private updateCamera(): void {
    const maxScrollX = Math.max(0, this.worldWidth - VIEWPORT_WIDTH);
    const targetScrollX = Phaser.Math.Clamp(this.player.x - (VIEWPORT_WIDTH * 0.35), 0, maxScrollX);

    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, 0.12);
    this.cameras.main.scrollY = 0;
  }
}
