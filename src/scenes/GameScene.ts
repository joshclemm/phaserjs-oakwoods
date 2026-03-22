import Phaser from "phaser";

const TILE_SIZE = 24;
const VIEWPORT_WIDTH = 320;
const VIEWPORT_HEIGHT = 180;
const LAYER_OFFSET_Y = 16;

const TERRAIN_TILES = {
  topLeft: 0,
  topCenter: [1, 2],
  topRight: 3,
  leftWall: [21, 42, 63],
  rightWall: [24, 45, 66],
  shallowFill: [253, 254],
  deepFill: [274, 275],
} as const;

type PropType =
  | "shop"
  | "lamp"
  | "sign"
  | "fence1"
  | "fence2"
  | "rock1"
  | "rock2"
  | "rock3"
  | "grass1"
  | "grass2"
  | "grass3";

interface LevelProp {
  type: PropType;
  x: number;
  depth?: "back" | "front";
  offsetY?: number;
  flipX?: boolean;
}

interface LevelSolidRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LevelData {
  version: number;
  name: string;
  width: number;
  height: number;
  spawn: {
    x: number;
    y: number;
  };
  solids: LevelSolidRect[];
  props: LevelProp[];
}

export class GameScene extends Phaser.Scene {
  private terrainLayer!: Phaser.Tilemaps.TilemapLayer;
  private map!: Phaser.Tilemaps.Tilemap;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;

  private bgLayer1!: Phaser.GameObjects.TileSprite;
  private bgLayer2!: Phaser.GameObjects.TileSprite;
  private bgLayer3!: Phaser.GameObjects.TileSprite;

  private isAttacking = false;
  private solidGrid: boolean[][] = [];
  private worldWidth = VIEWPORT_WIDTH;
  private spawnPoint = new Phaser.Math.Vector2();
  private deathY = VIEWPORT_HEIGHT;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const level = this.cache.json.get("oakwoods-level-1") as LevelData | undefined;
    if (!level) {
      this.add.text(10, 10, "Missing level file: public/levels/level-1.json", {
        fontSize: "12px",
        color: "#ffffff",
        wordWrap: { width: VIEWPORT_WIDTH - 20 },
      });
      return;
    }

    this.createBackground();
    this.createAnimations();
    this.buildTerrain(level);
    this.paintInteriorFill(level);
    this.placeProps(level);
    this.createPlayer(level);
    this.configureCamera(level);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  update(): void {
    const speed = 100;
    const jumpVelocity = -300;

    const onGround = this.player.body?.blocked.down ?? false;
    const velocityY = this.player.body?.velocity.y ?? 0;
    const isMovingHorizontally = this.cursors.left.isDown || this.cursors.right.isDown;

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    if (this.cursors.up.isDown && onGround && !this.isAttacking) {
      this.player.setVelocityY(jumpVelocity);
    }

    if (Phaser.Input.Keyboard.JustDown(this.attackKey) && onGround && !this.isAttacking) {
      this.isAttacking = true;
      this.player.setVelocityX(0);
      this.player.anims.play("char-blue-attack", true);
    }

    if (!this.isAttacking) {
      if (!onGround) {
        if (velocityY < 0) {
          this.player.anims.play("char-blue-jump", true);
        } else {
          this.player.anims.play("char-blue-fall", true);
        }
      } else if (isMovingHorizontally) {
        this.player.anims.play("char-blue-run", true);
      } else {
        this.player.anims.play("char-blue-idle", true);
      }
    }

    if (this.player.y > this.deathY) {
      this.respawnPlayer();
      return;
    }

    this.updateCamera();
    this.updateParallax();
  }

  private createBackground(): void {
    this.bgLayer1 = this.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "oakwoods-bg-layer1")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-30);

    this.bgLayer2 = this.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "oakwoods-bg-layer2")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20);

    this.bgLayer3 = this.add.tileSprite(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "oakwoods-bg-layer3")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10);
  }

  private createAnimations(): void {
    this.createAnimation("char-blue-idle", "oakwoods-char-blue", 0, 5, 8, -1);
    this.createAnimation("char-blue-run", "oakwoods-char-blue", 16, 21, 10, -1);
    this.createAnimation("char-blue-jump", "oakwoods-char-blue", 28, 31, 10, 0);
    this.createAnimation("char-blue-fall", "oakwoods-char-blue", 35, 37, 10, 0);
    this.createAnimation("char-blue-attack", "oakwoods-char-blue", 8, 13, 12, 0);
    this.createAnimation("shop-idle", "oakwoods-shop-anim", 0, 5, 8, -1);
  }

  private createAnimation(
    key: string,
    texture: string,
    start: number,
    end: number,
    frameRate: number,
    repeat: number,
  ): void {
    if (this.anims.exists(key)) {
      return;
    }

    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(texture, { start, end }),
      frameRate,
      repeat,
    });
  }

  private buildTerrain(level: LevelData): void {
    this.worldWidth = level.width * TILE_SIZE;
    this.solidGrid = this.createSolidGrid(level);

    this.map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: level.width,
      height: level.height,
    });

    const tileset = this.map.addTilesetImage("oakwoods-tileset");
    if (!tileset) {
      throw new Error("Failed to load oakwoods tileset");
    }

    const layer = this.map.createBlankLayer("terrain", tileset, 0, LAYER_OFFSET_Y);
    if (!layer) {
      throw new Error("Failed to create terrain layer");
    }

    this.terrainLayer = layer.setDepth(0);

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        if (!this.isSolid(x, y)) {
          continue;
        }

        const tileIndex = this.selectTerrainTile(x, y, level.width, level.height);
        this.map.putTileAt(tileIndex, x, y, true, "terrain");
      }
    }

    this.terrainLayer.setCollisionByExclusion([-1]);
  }

  private createSolidGrid(level: LevelData): boolean[][] {
    const grid = Array.from({ length: level.height }, () => Array(level.width).fill(false));

    for (const solid of level.solids) {
      const startX = Phaser.Math.Clamp(solid.x, 0, level.width - 1);
      const startY = Phaser.Math.Clamp(solid.y, 0, level.height - 1);
      const endX = Phaser.Math.Clamp(solid.x + solid.width - 1, startX, level.width - 1);
      const endY = Phaser.Math.Clamp(solid.y + solid.height - 1, startY, level.height - 1);

      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          grid[y][x] = true;
        }
      }
    }

    return grid;
  }

  private paintInteriorFill(level: LevelData): void {
    const graphics = this.add.graphics().setDepth(1);
    graphics.fillStyle(0x251613, 1);

    for (let y = 0; y < level.height; y += 1) {
      let spanStart = -1;

      for (let x = 0; x <= level.width; x += 1) {
        const isInterior =
          x < level.width
          && this.isSolid(x, y)
          && this.isSolid(x, y - 1)
          && this.isSolid(x - 1, y)
          && this.isSolid(x + 1, y);

        if (isInterior && spanStart === -1) {
          spanStart = x;
        }

        if ((!isInterior || x === level.width) && spanStart !== -1) {
          const spanEnd = isInterior ? x : x - 1;
          graphics.fillRect(
            spanStart * TILE_SIZE,
            LAYER_OFFSET_Y + (y * TILE_SIZE),
            ((spanEnd - spanStart) + 1) * TILE_SIZE,
            TILE_SIZE,
          );
          spanStart = -1;
        }
      }
    }
  }

  private selectTerrainTile(x: number, y: number, levelWidth: number, levelHeight: number): number {
    const aboveSolid = this.isSolid(x, y - 1);
    const leftSolid = this.isSolid(x - 1, y);
    const rightSolid = this.isSolid(x + 1, y);
    const depth = this.getSurfaceDepth(x, y);
    const normalizedDepth = Math.min(depth, 2);

    if (!aboveSolid) {
      if (!leftSolid && rightSolid) {
        return TERRAIN_TILES.topLeft;
      }
      if (leftSolid && !rightSolid) {
        return TERRAIN_TILES.topRight;
      }
      return this.pickFrom(TERRAIN_TILES.topCenter, x);
    }

    if (!leftSolid && rightSolid) {
      return TERRAIN_TILES.leftWall[normalizedDepth];
    }

    if (leftSolid && !rightSolid) {
      return TERRAIN_TILES.rightWall[normalizedDepth];
    }

    if (!leftSolid && !rightSolid) {
      return depth === 0
        ? this.pickFrom(TERRAIN_TILES.topCenter, x)
        : this.pickFrom(TERRAIN_TILES.shallowFill, x + y);
    }

    if (y === levelHeight - 1 || x === 0 || x === levelWidth - 1) {
      return this.pickFrom(TERRAIN_TILES.deepFill, x + y);
    }

    return depth <= 1
      ? this.pickFrom(TERRAIN_TILES.shallowFill, x + y)
      : this.pickFrom(TERRAIN_TILES.deepFill, x + y);
  }

  private pickFrom(tiles: readonly number[], seed: number): number {
    return tiles[Math.abs(seed) % tiles.length];
  }

  private isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || y >= this.solidGrid.length || x >= this.solidGrid[0].length) {
      return false;
    }

    return this.solidGrid[y][x];
  }

  private getSurfaceDepth(x: number, y: number): number {
    let depth = 0;
    let cursor = y - 1;

    while (this.isSolid(x, cursor)) {
      depth += 1;
      cursor -= 1;
    }

    return depth;
  }

  private placeProps(level: LevelData): void {
    const backDepth = 6;
    const frontDepth = 12;

    for (const prop of level.props) {
      const worldX = prop.x * TILE_SIZE;
      const worldY = this.getSurfaceWorldY(prop.x) + (prop.offsetY ?? 0);
      const depth = prop.depth === "front" ? frontDepth : backDepth;
      const assetKey = this.getPropAssetKey(prop.type);

      if (prop.type === "shop") {
        const shop = this.add.sprite(worldX, worldY, assetKey, 0)
          .setOrigin(0.5, 1)
          .setDepth(depth);
        shop.setFlipX(Boolean(prop.flipX));
        shop.anims.play("shop-idle");
        continue;
      }

      const image = this.add.image(worldX, worldY, assetKey)
        .setOrigin(0.5, 1)
        .setDepth(depth);

      image.setFlipX(Boolean(prop.flipX));
    }
  }

  private getPropAssetKey(propType: PropType): string {
    const assetKeys: Record<PropType, string> = {
      shop: "oakwoods-shop-anim",
      lamp: "oakwoods-lamp",
      sign: "oakwoods-sign",
      fence1: "oakwoods-fence1",
      fence2: "oakwoods-fence2",
      rock1: "oakwoods-rock1",
      rock2: "oakwoods-rock2",
      rock3: "oakwoods-rock3",
      grass1: "oakwoods-grass1",
      grass2: "oakwoods-grass2",
      grass3: "oakwoods-grass3",
    };

    return assetKeys[propType];
  }

  private getSurfaceWorldY(tileX: number): number {
    const column = Phaser.Math.Clamp(Math.floor(tileX), 0, this.solidGrid[0].length - 1);

    for (let y = 0; y < this.solidGrid.length; y += 1) {
      if (this.solidGrid[y][column]) {
        return LAYER_OFFSET_Y + (y * TILE_SIZE);
      }
    }

    return LAYER_OFFSET_Y + ((this.solidGrid.length - 1) * TILE_SIZE);
  }

  private createPlayer(level: LevelData): void {
    const spawnX = level.spawn.x * TILE_SIZE;
    const spawnY = LAYER_OFFSET_Y + (level.spawn.y * TILE_SIZE) - 28;
    this.spawnPoint.set(spawnX, spawnY);

    this.player = this.physics.add.sprite(spawnX, spawnY, "oakwoods-char-blue", 0)
      .setDepth(10);

    this.player.setBounce(0);
    this.player.body?.setSize(20, 38);
    this.player.body?.setOffset(18, 16);

    this.physics.add.collider(this.player, this.terrainLayer);

    this.player.anims.play("char-blue-idle", true);
    this.player.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
      if (anim.key === "char-blue-attack") {
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
    this.player.anims.play("char-blue-idle", true);

    const maxScrollX = Math.max(0, this.worldWidth - VIEWPORT_WIDTH);
    this.cameras.main.scrollX = Phaser.Math.Clamp(this.spawnPoint.x - (VIEWPORT_WIDTH * 0.35), 0, maxScrollX);
  }

  private updateCamera(): void {
    const maxScrollX = Math.max(0, this.worldWidth - VIEWPORT_WIDTH);
    const targetScrollX = Phaser.Math.Clamp(this.player.x - (VIEWPORT_WIDTH * 0.35), 0, maxScrollX);

    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, 0.12);
    this.cameras.main.scrollY = 0;
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX;
    this.bgLayer1.tilePositionX = camX * 0.1;
    this.bgLayer2.tilePositionX = camX * 0.3;
    this.bgLayer3.tilePositionX = camX * 0.5;
  }
}
