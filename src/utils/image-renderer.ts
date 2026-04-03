import { existsSync } from "fs";

const LOWER_HALF_BLOCK = "\u2584";

export interface HalfBlockCell {
  fg: string;
  bg: string;
  ch: string;
}

export interface HalfBlockGrid {
  rows: HalfBlockCell[][];
  width: number;
  height: number;
}

export interface ImagePixels {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function rgbaToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export async function loadImagePixels(
  source: string | Buffer,
  maxCols: number,
  maxRows: number,
): Promise<ImagePixels | null> {
  try {
    const sharp = (await import("sharp")).default;

    const maxPixelWidth = maxCols;
    const maxPixelHeight = maxRows * 2;

    let pipeline = typeof source === "string" ? sharp(source, { animated: false }) : sharp(source, { animated: false });

    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) return null;

    let targetW = metadata.width;
    let targetH = metadata.height;

    if (targetW > maxPixelWidth) {
      targetH = Math.round(targetH * (maxPixelWidth / targetW));
      targetW = maxPixelWidth;
    }
    if (targetH > maxPixelHeight) {
      targetW = Math.round(targetW * (maxPixelHeight / targetH));
      targetH = maxPixelHeight;
    }

    targetW = Math.max(1, targetW);
    targetH = Math.max(1, targetH);
    if (targetH % 2 !== 0) targetH += 1;

    pipeline = pipeline.resize(targetW, targetH, { fit: "fill" }).removeAlpha().raw();

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      width: info.width,
      height: info.height,
      pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  } catch {
    return null;
  }
}

export function pixelsToHalfBlocks(img: ImagePixels): HalfBlockGrid {
  const { width, height, pixels } = img;
  const rows: HalfBlockCell[][] = [];
  const cellRows = Math.floor(height / 2);

  for (let cy = 0; cy < cellRows; cy++) {
    const topRowY = cy * 2;
    const botRowY = topRowY + 1;
    const row: HalfBlockCell[] = [];

    for (let x = 0; x < width; x++) {
      const topOff = (topRowY * width + x) * 3;
      const botOff = (botRowY * width + x) * 3;

      const bgColor = rgbaToHex(pixels[topOff], pixels[topOff + 1], pixels[topOff + 2]);
      const fgColor = rgbaToHex(pixels[botOff], pixels[botOff + 1], pixels[botOff + 2]);

      row.push({ fg: fgColor, bg: bgColor, ch: LOWER_HALF_BLOCK });
    }
    rows.push(row);
  }

  return { rows, width, height: cellRows };
}

export function runLengthEncode(row: HalfBlockCell[]): HalfBlockCell[] {
  if (row.length === 0) return [];
  const merged: HalfBlockCell[] = [];
  let current = { ...row[0] };

  for (let i = 1; i < row.length; i++) {
    const cell = row[i];
    if (cell.fg === current.fg && cell.bg === current.bg) {
      current.ch += cell.ch;
    } else {
      merged.push(current);
      current = { ...cell };
    }
  }
  merged.push(current);
  return merged;
}

export async function loadImageAsHalfBlocks(
  source: string | Buffer,
  maxCols: number,
  maxRows: number,
): Promise<HalfBlockGrid | null> {
  const pixels = await loadImagePixels(source, maxCols, maxRows);
  if (!pixels) return null;

  const grid = pixelsToHalfBlocks(pixels);
  grid.rows = grid.rows.map(runLengthEncode);
  return grid;
}

export function isImageFile(path: string): boolean {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "tiff"].includes(ext);
}

export function isVideoFile(path: string): boolean {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return ["mp4", "webm", "mov", "avi", "mkv"].includes(ext);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}
