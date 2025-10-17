import { hexToRgb, colors } from '@/core/util/color';
import { createCanvasWithCtx } from '@/core/util/canvas';

export const tinyFont = /* font-start */'56bayo0,55r0jcw,55qdpmo,53h80e8,g14jg1s,8555vkg,fwr99nk,,,tc,,w,118f6sg,c4bz6zc,89ig20o,879adko,nqns0ts,g1ax4aw,rviq6nk,857ohlc,roorw9c,87alfyo,87eauc0,,,1srlvq,,dkz5m8,879abyo,g19m1wg,7xe42k,g7xz6m0,7wra58,26yi61o,6thu6w,42kog7k,7xdd7c,g7xz6lg,fsdz38g,3y3hte8,g1awgmc,g19m3gw,em2m5m,fp2qsk,6tfqjc,fp4hsw,7xdd6s,bb4b34,7wqji0,8bqct1k,a5av4o,a5avbk,9l09sk,a59t7o,a5a494,gnyu64,6pp15k,b9utgk,bs11re,65owmfq'/* font-end */.split(',');

const characterSize = 6;

// Character cache: charCode-color-size -> Canvas
const characterCanvases: { [key: string]: HTMLCanvasElement } = {};

export const FULL_HEART = '#';
export const TWO_THIRDS_HEART = '$';
export const ONE_THIRD_HEART = '%';
export const EMPTY_HEART = '&';
export const COLCHEIA = '*';
export const HOUSE = '^';

export const TELEPORT = '[';
export const SCRATCH = '\\';
export const MAGIC = ']';

export type DrawTextProps = {
  text: string
  x: number
  y: number
  color?: string
  textAlign?: CanvasTextAlign
  textBaseline?: CanvasTextBaseline
  size?: number
  space?: number
}

const getCharacterData = (letter: string) => {
  if (letter === '0') return {
    paddedBinary: '0'.repeat(characterSize*characterSize),
    leftmostCol: 0,
    charWidth: characterSize,
  };
  
  const paddedBinary = String(parseInt(letter, 36).toString(2)).padStart(characterSize*characterSize, '0');
  let leftmostCol = characterSize;
  let rightmostCol = -1;
  
  // Find leftmost and rightmost columns with set bits
  for (let col = 0; col < characterSize; col++) {
    for (let row = 0; row < characterSize; row++) {
      const bitIndex = row * characterSize + col;
      if (paddedBinary[bitIndex] === '1') {
        leftmostCol = Math.min(leftmostCol, col);
        rightmostCol = Math.max(rightmostCol, col);
      }
    }
  }
  
  const charWidth = rightmostCol >= leftmostCol ? rightmostCol - leftmostCol + 1 : 1;
  return { paddedBinary, leftmostCol, charWidth };
};

const getCharacterWidth = (letter: string): number => {
  return getCharacterData(letter).charWidth;
};

const createCharacterCanvas = (character: string, size: number, color: string): HTMLCanvasElement => {
  const letter = character === ' ' ? '0' : tinyFont[character.charCodeAt(0) - 35];
  const { paddedBinary, leftmostCol, charWidth } = getCharacterData(letter);
  
  const scaledWidth = charWidth * size;
  const letterHeight = characterSize * size;
  
  const [canvas, ctx] = createCanvasWithCtx(scaledWidth, letterHeight);
  
  const [r, g, b, a] = hexToRgb(color);
  const fillStyle = `rgba(${r}, ${g}, ${b}, ${(a || 255) / 255})`;
  
  // Draw character bitmap
  paddedBinary.split('').forEach((bit, bitIndex) => {
    if (bit !== '0') {
      const col = bitIndex % characterSize;
      const row = Math.floor(bitIndex / characterSize);
      
      // Skip empty left columns
      if (col < leftmostCol) return;
      
      const adjustedCol = col - leftmostCol;
      
      ctx.fillStyle = fillStyle;
      ctx.fillRect(adjustedCol * size, row * size, size, size);
    }
  });

  return canvas;
};

const getCharacterCanvas = (character: string, size: number, color: string): HTMLCanvasElement => {
  const cacheKey = `${character.charCodeAt(0)}-${color}-${size}`;
  
  if (!characterCanvases[cacheKey]) {
    characterCanvases[cacheKey] = createCharacterCanvas(character, size, color);
  }
  
  return characterCanvases[cacheKey];
};

export const drawText = (
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = colors.white,
  textAlign = 0, // 0=left, 1=center, 2=right
  textBaseline = 0, // 0=top, 1=middle, 2=bottom  
  size = 2,
  space = 1
) => {
  x = Math.round(x);
  y = Math.round(y);
  if (!text) text = ' ';
  
  // Calculate variable width for text
  const spacing = space * size;
  const characters = text.replace('!', '@').toUpperCase().split('');
  
  // Calculate positions and total width
  let totalWidth = 0;
  const charPositions: { char: string; x: number; charWidth: number }[] = [];
  
  characters.forEach((character, i) => {
    const letter = character === ' ' ? '0' : tinyFont[character.charCodeAt(0) - 35];
    const charWidth = getCharacterWidth(letter) * size;
    
    charPositions.push({ char: character, x: totalWidth, charWidth });
    totalWidth += charWidth + (i < characters.length - 1 ? spacing : 0);
  });
  
  const letterHeight = characterSize * size;
  const offsetX = textAlign === 0 ? 0 : textAlign === 1 ? Math.round(totalWidth / 2) : totalWidth;
  const offsetY = textBaseline === 0 ? 0 : textBaseline === 1 ? Math.round(letterHeight / 2) : letterHeight;
  
  // Draw each character synchronously
  charPositions.forEach(({ char, x: charX, charWidth }) => {
    if (char === ' ') return; // Skip spaces
    
    const canvas = getCharacterCanvas(char, size, color);
    c.drawImage(canvas, 0, 0, charWidth, letterHeight, x - offsetX + charX, y - offsetY, charWidth, letterHeight);
  });
};


