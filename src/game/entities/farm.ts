import { CELL_HEIGHT, CELL_WIDTH } from '../constants';
import { GameStaticObject } from '@/core/game-static-object';
import { GameAssets } from '../game-assets';
import { drawEngine } from '@/core/draw-engine';
import { SeededRandom } from '@/core/util/rng';

const rng = new SeededRandom();

export class Farm extends GameStaticObject {
  mirrored: boolean;

  constructor(col: number, row: number) {
    super(
      GameAssets.grass,
      col * CELL_WIDTH,
      row * CELL_HEIGHT,
      'field',
    );
    this.mirrored = rng.next() > 0.5;
  }

  draw() {
    drawEngine.drawBackgroundImage(this.img, this.offsetX, this.offsetY, this.mirrored);
  }
}
