import { Tree } from './entities/tree';
import { SeededRandom } from '@/core/util/rng';
import { Village } from './entities/village';
import { CELL_HEIGHT, CELL_WIDTH, clearings, paths, statues } from './constants';
import { Statue } from './entities/statue';
import { Cell, Path } from './types';
import { Drawable } from './Drawable';
import { on } from '@/core/event';
import { Spirit } from './entities/spirit';
import { Coords } from './path-findind';
import { drawEngine } from '@/core/draw-engine';
import { GameAssets } from './game-assets';
import { GameData } from './game-data';
import { GameEvent } from './event-manifest';
import { Farm } from './entities/farm';
import { forEachSurroundingCell } from './grid-utils';
import { House } from './entities/house';
import { Obelisk } from './entities/obelisk';

export class GameMap {
  grid: Cell[][];
  villages: Village[] = [];
  private rng: SeededRandom;
  playerLookingAt: Coords = { col: 0, row: 0 };
  statues: Statue[] = [];
  obelisk: Obelisk;

  constructor(
    public readonly colCount: number,
    public readonly rowCount: number,
    public gameData: GameData,
  ) {
    this.rng = new SeededRandom();

    this.grid = Array.from({ length: rowCount }, (_a, y) =>
      Array.from({ length: colCount }, (_b, x) => {
        // Determine tree species based on distance from Heart Peak (70, 90)
        const dx = x - 70;
        const dy = y - 90;
        const distanceFromHeartPeak = Math.sqrt(dx * dx + dy * dy);
        
        let treeType: 'oak' | 'spruce';
        if (distanceFromHeartPeak <= 40) {
          // Within 20 cell radius of Heart Peak: 90% spruce, 10% oak
          treeType = this.rng.next() < 0.9 ? 'spruce' : 'oak';
        } else {
          // Rest of map: 20% spruce, 80% oak
          treeType = this.rng.next() < 0.2 ? 'spruce' : 'oak';
        }
        
        const tree = new Tree(
          x * CELL_WIDTH, // Adjust x to center the image
          y * CELL_HEIGHT, // Adjust y to center the image
          treeType
        );
        return { x, y, content: tree };
      })
    );

    this.villages = [
      new Village('Heart Peak', { x: 70, y: 90 }, 12, 0, 0),
      new Village('Pine Rest', { x: 99, y: 100 }, 6, 2, 3),
      new Village('Oak Branch', { x: 42, y: 51 }, 4, 3, 4),
      new Village('Cat Foot', { x: 48, y: 140 }, 5, 4, 5),
      new Village('Black Tail', { x: 113, y: 107 }, 4, 5, 8),
      new Village('Moon Town', { x: 129, y: 29 }, 8, 12, 25),
    ];


    // Clear paths with jitter
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const from = { x: path[i][0], y: path[i][1] };
        const to = { x: path[i + 1][0], y: path[i + 1][1] };
        const pathWidth = path[i][2];
        this.clearPathWithJitter(from, to, pathWidth);
      }
    }

    // Clear circular areas with jitter
    for (const clearing of clearings) {
      this.clearCircleWithJitter(clearing.x, clearing.y, clearing.r);
    }

    // Calculate neighbor information for each tree
    for (let y = 0; y < rowCount; y++) {
      for (let x = 0; x < colCount; x++) {
        const cell = this.grid[y][x];
        if (cell.content instanceof Tree) {
          const neighbors = {
            top: this.grid[y - 1]?.[x]?.content instanceof Tree,
            bottom: this.grid[y + 1]?.[x]?.content instanceof Tree,
            left: this.grid[y]?.[x - 1]?.content instanceof Tree,
            right: this.grid[y]?.[x + 1]?.content instanceof Tree,
          };
          cell.content.setNeighbors(neighbors);
        }
      }
    }

    for (const village of this.villages) {
      village.generateFarms(this.rng, this)
        .forEach(farm => {
          this.grid[farm.row][farm.col].content = farm;
        });
      village.generateHouses(this.rng, this)
        .forEach(house => {
          this.grid[house.row][house.col].content = house;
        });
      village.generateVillagers(this.rng, this)
        .forEach(villager => {
          this.grid[villager.row][villager.col].content = villager;
        });

      // Set cell.village for each cell in the village radius
      const { x: centerX, y: centerY } = village.center;
      const radius = village.radius;
      for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          if (dx * dx + dy * dy <= radius * radius) {
            this.grid[y][x].village = village;
          }
        }
      }

      // Generate starting home
      this.set(61, 84, new House(61, 84, 'home'));
    }

    this.fillCenterWithGrass(1.0);

    this.obelisk = new Obelisk(this);

    for (const statueProps of Object.values(statues)) {
      const { x, y, name } = statueProps;
      const fullName = `cat ${name} altar`;
      const statue = new Statue(x, y, this, this.gameData, fullName);
      // Place farms in the 8 squares around the statue
      forEachSurroundingCell(x, y, (farmCol, farmRow) => {
        const cell = this.grid[farmRow][farmCol];
        cell.content = new Farm(farmCol, farmRow);
      });
      this.grid[y][x].content = statue;
      this.statues.push(statue);
    }

    on(GameEvent.SPAWN_FIRST_SPIRIT, () => {
      // Spawn a single cloud spirit
      this.set(64, 89, new Spirit(64, 89, '☁️', this));
    });
  }

  getLookingAt() {
    return this.grid[this.playerLookingAt.row][this.playerLookingAt.col];
  }

  get(col: number, row: number) {
    if (row < 0 || row >= this.rowCount || col < 0 || col >= this.colCount) {
      return null;
    }
    return this.grid[row][col];
  }

  clearPlants(col: number, row: number) {
    if(
      this.grid[row][col].content instanceof Tree
      || this.grid[row][col].content instanceof Farm
    ) {
      this.grid[row][col].content = null;
    }
  }

  // Fill the center area with fields to limit player movements
  // until they finish the onboarding.
  // Then clear out a path from where the player starts, to the obelisk,
  // and to the heart statue.
  fillCenterWithGrass(converage: number) {
    const heartsPeak = this.villages[0];
    const radius = 12;
    const { x: centerX, y: centerY } = heartsPeak.center;
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const cell = this.grid[y][x];
        if (!cell.content && this.rng.next() <= converage) {
          cell.content = new Farm(cell.x, cell.y);
        } else if (cell.content instanceof Farm && this.rng.next() > converage) {
          cell.content = null;
        }
      }
    }
    
    const villagePath: Path = [
      [61, 86, 2],
      [69, 88, 0.9],
      [75, 89, 0.9],
      [76, 84, 0.9],
    ];
    for (let i = 0; i < villagePath.length - 1; i++) {
      const from = { x: villagePath[i][0], y: villagePath[i][1] };
      const to = { x: villagePath[i + 1][0], y: villagePath[i + 1][1] };
      const pathWidth = villagePath[i][2];
      this.clearPathWithJitter(from, to, pathWidth);
    }
  }

  clearPathWithJitter(
    from: { x: number, y: number },
    to: { x: number, y: number },
    pathWidth: number,
  ) {
    // Bresenham's line algorithm for any angle
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const sx = from.x < to.x ? 1 : -1;
    const sy = from.y < to.y ? 1 : -1;
    let err = dx - dy;

    let x = from.x;
    let y = from.y;

    const halfWidth = pathWidth / 2;

    while (true) {
      // Add jitter to the clearing area
      const jitterAmount = pathWidth < 1 ? 0 : 1.2; // Adjust for more/less randomness
      const jitterX = Math.ceil(this.rng.range(-jitterAmount, jitterAmount));
      const jitterY = Math.ceil(this.rng.range(-jitterAmount, jitterAmount));

      // Clear area around the current position with jitter
      for (let ox = -halfWidth; ox <= halfWidth; ox++) {
        for (let oy = -halfWidth; oy <= halfWidth; oy++) {
          const clearX = Math.ceil(x + ox + jitterX);
          const clearY = Math.ceil(y + oy + jitterY);
          this.clearPlants(clearX, clearY);
          if (pathWidth < 1) {
            if (this.rng.next() > 0.5) {
              this.clearPlants(clearX + 1, clearY);
            } else {
              this.grid[clearY][clearX].content = new Farm(clearX, clearY);
              this.grid[clearY][clearX + 1].content = new Farm(clearX, clearY);
            }
          } else if (this.rng.next() > 0.1) {
            if (this.rng.next() > 0.05) {
              // Add probability for partial clearing to create natural edges
              this.clearPlants(clearX, clearY);
            } else {
              this.grid[clearY][clearX].content = new Farm(clearX, clearY);
            }
          }
        }
      }

      // Check if we've reached the destination
      if (x === to.x && y === to.y) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  clearCircleWithJitter(
    centerX: number,
    centerY: number,
    radius: number,
    fieldsOnly = false,
    border = 99,
    probability = 1,
  ) {
    for (let y = 0; y < this.rowCount; y++) {
      for (let x = 0; x < this.colCount; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Add jitter to radius for natural edge
        const jitterRadius = this.rng.range(-radius, radius) / 6;
        const adjustedRadius = radius + jitterRadius;

        // Calculate inner radius based on borderRatio
        const innerRadius = adjustedRadius - border;
        
        if (distance >= innerRadius && distance <= adjustedRadius) {
          // Add probability for partial clearing near edges
          const edgeDistance = adjustedRadius - distance;
          const clearProbability = Math.min(1, edgeDistance / 2 + 0.7) * probability;

          if (this.rng.next() < clearProbability) {
            const isFarm = this.grid[y][x].content instanceof Farm;
            if (!fieldsOnly || fieldsOnly && isFarm) {
              this.grid[y][x].content = null;
            }
          }
        }
      }
    }
  }

  set(col: number, row: number, content: Drawable | null) {
    if (this.grid[row] && this.grid[row][col]) {
      this.grid[row][col].content = content;
    }
  }

  update(timeElapsed: number, isCutscene: boolean) {
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.content) {
          cell.content.updateAnimation?.(timeElapsed);
          if (!isCutscene) {
            cell.content.update?.(timeElapsed);
            if (cell.x != cell.content.col || cell.y != cell.content.row) {
              this.grid[cell.content.row][cell.content.col].content = cell.content;
              cell.content = null;
            }
            if (cell.content && (cell?.content as Spirit)?.dead) {
              this.set(cell.content.col, cell.content.row, null);
            }
          }
        }
      }
    }
  }

  draw(cameraX: number, cameraY: number) {
    const zoom = drawEngine.zoom;
    const renderWidth = (drawEngine.canvasWidth / zoom) / 2 + 50;
    const renderHeight = (drawEngine.canvasHeight / zoom) / 2 + 50;
    const seenRadius = 75;
    const seenRadiusSquared = seenRadius * seenRadius;

    // Compute visible cell bounds
    const minCol = Math.max(0, Math.floor((cameraX - renderWidth) / CELL_WIDTH));
    const maxCol = Math.min(this.colCount - 1, Math.ceil((cameraX + renderWidth) / CELL_WIDTH));
    const minRow = Math.max(0, Math.floor((cameraY - renderHeight) / CELL_HEIGHT));
    const maxRow = Math.min(this.rowCount - 1, Math.ceil((cameraY + renderHeight) / CELL_HEIGHT));

    // First pass: draw ground
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.grid[row][col];
        const x = cell.x * CELL_WIDTH;
        const y = cell.y * CELL_HEIGHT;
        drawEngine.drawBackgroundImage(GameAssets.ground, x, y);
      }
    }

    // Second pass: draw content, collect postDraw
    const postDrawDrawables: Drawable[] = [];
    let drawHighlight = false;
    for (let row = minRow; row <= maxRow; row++) {
      const rowObjects: Drawable[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.grid[row][col];
        const x = cell.x * CELL_WIDTH;
        const y = cell.y * CELL_HEIGHT;
        const dx = x - cameraX;
        const dy = y - cameraY;

        // Seen radius for minimap
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= seenRadiusSquared) {
          cell.seen = true;
        }

        if (
          cell.y === this.playerLookingAt.row &&
          cell.x === this.playerLookingAt.col &&
          cell.content &&
          cell.content.type !== 'oak' && cell.content.type !== 'spruce'
        ) {
          drawHighlight = true;
        }

        if (cell.content?.draw) {
          rowObjects.push(cell.content);
        }
        if (cell?.content?.postDraw) {
          postDrawDrawables.push(cell?.content);
        }

        // drawEngine.ctx1.strokeStyle = 'red';
        // drawEngine.ctx1.strokeRect(x, y, CELL_WIDTH, CELL_HEIGHT);
      }
      rowObjects.sort((a, b) => (
        a.type === 'field' ? -1
        : b.type === 'field' ? 1
        : 0
      ));
      rowObjects.forEach(drawable => drawable.draw());
    }

    // Third pass: postDraw
    // @ts-expect-error -- postDraw is definitely defined
    postDrawDrawables.forEach(drawable => drawable.postDraw());

    if (drawHighlight) {
      drawEngine.drawBackgroundImage(
        GameAssets.cornerImage,
        this.playerLookingAt.col * CELL_WIDTH - (16 - CELL_WIDTH) / 2,
        this.playerLookingAt.row * CELL_HEIGHT - (16 - CELL_HEIGHT) / 2
      );
    }
  }
}
