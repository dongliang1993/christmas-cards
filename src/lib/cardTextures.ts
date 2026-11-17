import type { MotifSpec } from "./cardAssets";
import type { CardTemplateId } from "./types";
import { TEMPLATE_MAP } from "./templates";

const TEX_W = 940;
const TEX_H = 1316;

/**
 * Extracts a soft-feathered motif crop from the cover artwork, so inside-left, insert & back
 * decorations share the exact same brushstroke & palette as the cover.
 */
export function extractMotifCanvas(
  coverImg: HTMLImageElement,
  from: [number, number, number, number],
): HTMLCanvasElement {
  const [sx, sy, sw, sh] = from;
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(sw / 2, sh / 2, sw * 0.47, sh * 0.47, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(coverImg, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.restore();

  // Soft radial edge feathering
  ctx.globalCompositeOperation = "destination-in";
  const grad = ctx.createRadialGradient(
    sw / 2,
    sh / 2,
    sw * 0.34,
    sw / 2,
    sh / 2,
    sw * 0.49,
  );
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sw, sh);

  return canvas;
}

function addPaperGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseColor: string,
): void {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    width * 0.12,
    width * 0.5,
    height * 0.5,
    width * 0.85,
  );
  grad.addColorStop(0, "rgba(255,255,255,0.24)");
  grad.addColorStop(1, "rgba(175,158,142,0.14)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 12000; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 0.7 + rand() * 1.6;
    ctx.fillStyle =
      rand() > 0.48
        ? "rgba(255,255,255,0.3)"
        : "rgba(130,112,94,0.075)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLeftMotifs(
  ctx: CanvasRenderingContext2D,
  coverImg: HTMLImageElement | null | undefined,
  motifs: MotifSpec[],
): void {
  if (!coverImg) return;
  for (const m of motifs) {
    const crop = extractMotifCanvas(coverImg, m.from);
    const dw = TEX_W * m.width;
    const dh = (crop.height / crop.width) * dw;
    ctx.save();
    ctx.translate(TEX_W * m.at[0], TEX_H * m.at[1]);
    if (m.turn) {
      ctx.rotate((m.turn * Math.PI) / 180);
    }
    ctx.drawImage(crop, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

export function createInsideLeftCanvas(
  templateId: CardTemplateId,
  coverImg?: HTMLImageElement | null,
  motifs: MotifSpec[] = [],
  reliefOnly = false,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const tpl = TEMPLATE_MAP[templateId];
  if (reliefOnly) {
    // Stickers alone on flat paper: the source for the relief bake.
    ctx.fillStyle = tpl.paperTint;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    drawLeftMotifs(ctx, coverImg, motifs);
    return canvas;
  }
  addPaperGrain(ctx, TEX_W, TEX_H, tpl.paperTint);

  const spine = ctx.createLinearGradient(TEX_W - 44, 0, TEX_W, 0);
  spine.addColorStop(0, "rgba(0,0,0,0)");
  spine.addColorStop(1, "rgba(90,75,60,0.16)");
  ctx.fillStyle = spine;
  ctx.fillRect(TEX_W - 44, 0, 44, TEX_H);

  drawLeftMotifs(ctx, coverImg, motifs);

  ctx.fillStyle = "rgba(100, 88, 76, 0.65)";
  ctx.font = "italic 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(tpl.name, TEX_W / 2, TEX_H - 140);

  return canvas;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    let currentLine = "";
    for (const char of para) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine !== "") {
        const lastSpace = currentLine.lastIndexOf(" ");
        if (lastSpace > currentLine.length * 0.45 && char !== " ") {
          lines.push(currentLine.slice(0, lastSpace));
          currentLine = currentLine.slice(lastSpace + 1) + char;
        } else {
          lines.push(currentLine);
          currentLine = char;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine !== "") {
      lines.push(currentLine);
    }
  }

  return lines;
}

export function createInsideRightBaseCanvas(
  templateId: CardTemplateId,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const tpl = TEMPLATE_MAP[templateId];
  addPaperGrain(ctx, TEX_W, TEX_H, tpl.paperTint);

  const spine = ctx.createLinearGradient(0, 0, 48, 0);
  spine.addColorStop(0, "rgba(90,75,60,0.16)");
  spine.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spine;
  ctx.fillRect(0, 0, 48, TEX_H);

  return canvas;
}

export function createInsideRightSheetCanvas(
  templateId: CardTemplateId,
  message: string,
  signature: string,
  coverImg?: HTMLImageElement | null,
  insertMotifs: MotifSpec[] = [],
  reliefOnly = false,
): HTMLCanvasElement {
  const w = 780;
  const h = 1130;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const tpl = TEMPLATE_MAP[templateId];
  if (reliefOnly) {
    // Stickers only — the message is flat ink and must not emboss.
    ctx.fillStyle = tpl.insideTint;
    ctx.fillRect(0, 0, w, h);
    drawInsertMotifs(ctx, w, h, coverImg, insertMotifs);
    return canvas;
  }
  addPaperGrain(ctx, w, h, tpl.insideTint);

  ctx.strokeStyle = "rgba(150, 134, 118, 0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  const displayMessage = message.trim() || tpl.defaultMessage;
  const maxTextWidth = w - 140;
  const fontSize = displayMessage.length > 140 ? 32 : 42;
  const lineHeight = fontSize * 1.55;

  ctx.fillStyle = "#2b2623";
  ctx.font = `500 ${fontSize}px "Caveat", "Kaiti SC", "STKaiti", "Georgia", cursive, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapTextLines(ctx, displayMessage, maxTextWidth).slice(0, 12);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.max(150, h * 0.4 - blockHeight / 2);

  lines.forEach((line, idx) => {
    ctx.fillText(line, w / 2, startY + idx * lineHeight);
  });

  if (signature.trim()) {
    ctx.fillStyle = "#6c5d53";
    ctx.font = `italic 32px "Caveat", "Kaiti SC", "STKaiti", Georgia, serif`;
    ctx.textAlign = "right";
    ctx.fillText(
      `— ${signature.trim()}`,
      w - 72,
      Math.min(h - 210, startY + blockHeight + 70),
    );
  }

  drawInsertMotifs(ctx, w, h, coverImg, insertMotifs);

  return canvas;
}

function drawInsertMotifs(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  coverImg: HTMLImageElement | null | undefined,
  motifs: MotifSpec[],
): void {
  if (!coverImg) return;
  for (const m of motifs) {
    const crop = extractMotifCanvas(coverImg, m.from);
    const dw = w * m.width;
    const dh = (crop.height / crop.width) * dw;
    ctx.drawImage(crop, w * m.at[0] - dw / 2, h * m.at[1] - dh / 2, dw, dh);
  }
}

export function createBackCanvas(
  templateId: CardTemplateId,
  coverImg?: HTMLImageElement | null,
  backMotifs: MotifSpec[] = [],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const tpl = TEMPLATE_MAP[templateId];
  addPaperGrain(ctx, TEX_W, TEX_H, tpl.paperTint);

  if (coverImg) {
    for (const m of backMotifs) {
      const crop = extractMotifCanvas(coverImg, m.from);
      const dw = TEX_W * m.width;
      const dh = (crop.height / crop.width) * dw;
      const cx = TEX_W * m.at[0];
      const cy = TEX_H * m.at[1];
      ctx.drawImage(crop, cx - dw / 2, cy - dh / 2, dw, dh);
    }
  }

  ctx.fillStyle = "rgba(110, 96, 84, 0.55)";
  ctx.font = "italic 24px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("Warm Wishes · Christmas Card", TEX_W / 2, TEX_H - 120);

  return canvas;
}

/**
 * #5 Parallax snowfall canvas, ported from bubbbly's snowfall() shader:
 * three cell layers, each slower & sparser, drifting with sine shear.
 * Rendered white-on-transparent for a plane layered above the cover.
 */
export function createSnowfallCanvas(
  w = 470,
  h = 658,
  time = 0,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const img = ctx.createImageData(w, h);
  const dst = img.data;

  // hash12, ported from bubbbly's GLSL.
  const hash12 = (x: number, y: number): number => {
    const px = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return px - Math.floor(px);
  };

  const cellsBase = 70;
  for (let k = 0; k < 3; k += 1) {
    const cells = cellsBase - k * 18;
    const cellW = w / cells;
    const cellH = h / (cells * 0.72);
    for (let cy = 0; cy < Math.ceil(cells * 0.72) + 1; cy += 1) {
      for (let cx = 0; cx < cells + 1; cx += 1) {
        const rx = hash12(cx + 5.3 + k * 31.7, cy + 9.1 - k);
        const ry = hash12(cx + 9.1 - k, cy + 5.3 + k * 17.3);
        const r = (0.07 + 0.07 * hash12(cx + 2.9, cy + k)) * (1 + k * 0.25) * cellW;
        const drift = Math.sin(cy * 0.21 + k * 2 + time * 0.6) * 0.45 * cellW;
        const ox = (rx - 0.5) * 0.55 * cellW + drift;
        const oy = (ry - 0.5) * 0.55 * cellH - time * (0.02 + k * 0.008) * cellH;
        const px = cx * cellW + ox;
        const py = ((cy * cellH + oy) % (h + cellH)) - cellH * 0.5;

        for (let y = Math.max(0, Math.floor(py - r)); y < Math.min(h, Math.ceil(py + r)); y += 1) {
          for (let x = Math.max(0, Math.floor(px - r)); x < Math.min(w, Math.ceil(px + r)); x += 1) {
            const d = Math.hypot(x - px, y - py);
            if (d > r) continue;
            const soft = Math.min(1, (r - d) / (r * 0.65));
            const idx = (y * w + x) * 4;
            const add = soft * (0.5 - k * 0.12);
            dst[idx] = Math.min(255, dst[idx] + add * 255);
            dst[idx + 1] = Math.min(255, dst[idx + 1] + add * 255);
            dst[idx + 2] = Math.min(255, dst[idx + 2] + add * 255);
            dst[idx + 3] = Math.max(dst[idx + 3], Math.round(Math.min(1, add * 1.4) * 255));
          }
        }
      }
    }
  }

  // Snow is white everywhere; alpha alone carries the flakes. Leaving RGB at
  // 0 in transparent texels makes filtering bleed black into each flake.
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 255;
    dst[i + 1] = 255;
    dst[i + 2] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Static alpha mask (read from G) that keeps the drifting snowfall layer
 * "behind the glass": inside the template's snowArea, and only over the
 * dark night-sky pixels of the artwork, never over curtains or paper.
 */
export function createSnowMaskCanvas(
  coverImg: HTMLImageElement,
  snowArea: readonly [number, number, number, number],
  coverW: number,
  coverH: number,
): HTMLCanvasElement {
  const w = 470;
  const h = 658;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(coverImg, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [ax, ay, aw, ah] = snowArea;
  const x0 = (ax / coverW) * w;
  const x1 = ((ax + aw) / coverW) * w;
  const y0 = (ay / coverH) * h;
  const y1 = ((ay + ah) / coverH) * h;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const r = d[i] / 255;
      const g = d[i + 1] / 255;
      const b = d[i + 2] / 255;
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const night = b - r > 0.08 && lum < 0.55;
      const v = inside && night ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Feather the edge so flakes fade at the window frame instead of clipping.
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const sCtx = soft.getContext("2d");
  if (!sCtx) return canvas;
  sCtx.filter = "blur(1.5px)";
  sCtx.drawImage(canvas, 0, 0);
  return soft;
}

/**
 * #5b Scrolling helper: a tall snowfall canvas whose rows wrap vertically,
 * so the component can advance it with a texture offset instead of
 * regenerating every frame.
 */
export function createSnowfallTile(time = 0): HTMLCanvasElement {
  return createSnowfallCanvas(470, 658, time);
}
