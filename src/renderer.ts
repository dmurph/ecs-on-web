import type { RenderEntity } from './simulator';

export function renderCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  entities: RenderEntity[],
) {
  const w = canvas.width;
  const h = canvas.height;

  // Clear background
  ctx.fillStyle = '#f1f5f9'; // Slate light grid back
  ctx.fillRect(0, 0, w, h);

  // Draw technological gridlines
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
  ctx.lineWidth = 1;
  const gridSize = 30;
  ctx.beginPath();
  for (let x = 0; x < w; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  const fillOpacity = 'cc';

  // Draw entities
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    ctx.fillStyle = entity.color + fillOpacity;

    // Draw as actual physical circle
    const r = entity.w / 2;
    const cx = entity.x + r;
    const cy = entity.y + r;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
