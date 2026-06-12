import { ENTITY_COLORS } from './config';
import { GameEntity } from './benchmark_oop';
import type { ECSData } from './benchmark_custom_ecs';
import { PositionX, PositionYwh, Style } from './benchmark_bitecs';

export function renderCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  data: GameEntity[] | ECSData | number[],
  isColliding: Uint8Array,
  mode: 'oop' | 'oop-tree' | 'ecs' | 'bitecs',
  pairsBuffer: Int32Array,
  pairsCount: number,
  numEntities: number,
  entitiesById?: GameEntity[]
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

  // Performance Optimizations
  const skipStrokes = numEntities > 4000;
  const skipLines = numEntities > 8000;
  
  // Colors
  const strokeCollision = '#e11d48';
  const fillCollision = 'rgba(225, 29, 72, 0.2)';

  // Determine fill opacity: solid neon glow (45%) or full brightness (80%) when strokes are skipped
  const fillOpacity = skipStrokes ? 'cc' : '77'; 

  if (mode === 'oop' || mode === 'oop-tree') {
    const entities = data as GameEntity[];
    ctx.lineWidth = 1.5;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const colliding = isColliding[entity.id] === 1;

      if (colliding) {
        ctx.fillStyle = fillCollision;
        ctx.strokeStyle = strokeCollision;
      } else {
        ctx.fillStyle = entity.color + fillOpacity;
        ctx.strokeStyle = entity.color;
      }

      // Draw as actual physical circle
      const r = entity.w / 2;
      const cx = entity.x + r;
      const cy = entity.y + r;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (!skipStrokes) {
        ctx.stroke();
      }
    }
  } else if (mode === 'ecs') {
    const ecs = data as ECSData;
    ctx.lineWidth = 1.5;
    const len = ecs.posX.length;

    for (let i = 0; i < len; i++) {
      const id = ecs.id[i];
      const colliding = isColliding[id] === 1;
      const color = ENTITY_COLORS[ecs.colorId[i]];
      
      if (colliding) {
        ctx.fillStyle = fillCollision;
        ctx.strokeStyle = strokeCollision;
      } else {
        ctx.fillStyle = color + fillOpacity;
        ctx.strokeStyle = color;
      }

      // Draw as actual physical circle
      const px = ecs.posX[i];
      const py = ecs.posYwh[i * 3 + 0];
      const pw = ecs.posYwh[i * 3 + 1];
      const r = pw / 2;
      const cx = px + r;
      const cy = py + r;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (!skipStrokes) {
        ctx.stroke();
      }
    }
  } else {
    const entities = data as number[];
    ctx.lineWidth = 1.5;
    const len = entities.length;

    for (let i = 0; i < len; i++) {
      const eid = entities[i];
      const colliding = isColliding[eid] === 1;
      const color = ENTITY_COLORS[Style.colorId[eid]];

      if (colliding) {
        ctx.fillStyle = fillCollision;
        ctx.strokeStyle = strokeCollision;
      } else {
        ctx.fillStyle = color + fillOpacity;
        ctx.strokeStyle = color;
      }

      // Draw as actual physical circle
      const px = PositionX.value[eid];
      const py = PositionYwh.y[eid];
      const pw = PositionYwh.w[eid];
      const r = pw / 2;
      const cx = px + r;
      const cy = py + r;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (!skipStrokes) {
        ctx.stroke();
      }
    }
  }

  // Draw collision network lines and contact pixels connecting touching entities
  if (pairsCount > 0 && !skipLines) {
    // 1. Draw connection lines
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.2)'; // Semi-transparent crimson
    ctx.lineWidth = 1.0;
    ctx.beginPath();

    if (mode === 'oop' || mode === 'oop-tree') {
      if (entitiesById) {
        for (let i = 0; i < pairsCount; i++) {
          const idA = pairsBuffer[i * 2];
          const idB = pairsBuffer[i * 2 + 1];
          const a = entitiesById[idA];
          const b = entitiesById[idB];
          if (a && b) {
            ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
            ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
          }
        }
      }
    } else if (mode === 'ecs') {
      const ecs = data as ECSData;
      for (let i = 0; i < pairsCount; i++) {
        const idA = pairsBuffer[i * 2];
        const idB = pairsBuffer[i * 2 + 1];

        const ax = ecs.posX[idA] + ecs.posYwh[idA * 3 + 1] / 2;
        const ay = ecs.posYwh[idA * 3 + 0] + ecs.posYwh[idA * 3 + 2] / 2;
        const bx = ecs.posX[idB] + ecs.posYwh[idB * 3 + 1] / 2;
        const by = ecs.posYwh[idB * 3 + 0] + ecs.posYwh[idB * 3 + 2] / 2;

        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    } else {
      for (let i = 0; i < pairsCount; i++) {
        const idA = pairsBuffer[i * 2];
        const idB = pairsBuffer[i * 2 + 1];

        const ax = PositionX.value[idA] + PositionYwh.w[idA] / 2;
        const ay = PositionYwh.y[idA] + PositionYwh.h[idA] / 2;
        const bx = PositionX.value[idB] + PositionYwh.w[idB] / 2;
        const by = PositionYwh.y[idB] + PositionYwh.h[idB] / 2;

        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    }
    ctx.stroke();

    // 2. Draw red impact pixels at the exact contact midpoint (sparks)
    ctx.fillStyle = '#e11d48';
    if (mode === 'oop' || mode === 'oop-tree') {
      if (entitiesById) {
        for (let i = 0; i < pairsCount; i++) {
          const idA = pairsBuffer[i * 2];
          const idB = pairsBuffer[i * 2 + 1];
          const a = entitiesById[idA];
          const b = entitiesById[idB];
          if (a && b) {
            const mx = Math.round((a.x + a.w / 2 + b.x + b.w / 2) / 2);
            const my = Math.round((a.y + a.h / 2 + b.y + b.h / 2) / 2);
            ctx.fillRect(mx - 1, my - 1, 2, 2);
          }
        }
      }
    } else if (mode === 'ecs') {
      const ecs = data as ECSData;
      for (let i = 0; i < pairsCount; i++) {
        const idA = pairsBuffer[i * 2];
        const idB = pairsBuffer[i * 2 + 1];

        const ax = ecs.posX[idA] + ecs.posYwh[idA * 3 + 1] / 2;
        const ay = ecs.posYwh[idA * 3 + 0] + ecs.posYwh[idA * 3 + 2] / 2;
        const bx = ecs.posX[idB] + ecs.posYwh[idB * 3 + 1] / 2;
        const by = ecs.posYwh[idB * 3 + 0] + ecs.posYwh[idB * 3 + 2] / 2;

        const mx = Math.round((ax + bx) / 2);
        const my = Math.round((ay + by) / 2);
        ctx.fillRect(mx - 1, my - 1, 2, 2);
      }
    } else {
      for (let i = 0; i < pairsCount; i++) {
        const idA = pairsBuffer[i * 2];
        const idB = pairsBuffer[i * 2 + 1];

        const ax = PositionX.value[idA] + PositionYwh.w[idA] / 2;
        const ay = PositionYwh.y[idA] + PositionYwh.h[idA] / 2;
        const bx = PositionX.value[idB] + PositionYwh.w[idB] / 2;
        const by = PositionYwh.y[idB] + PositionYwh.h[idB] / 2;

        const mx = Math.round((ax + bx) / 2);
        const my = Math.round((ay + by) / 2);
        ctx.fillRect(mx - 1, my - 1, 2, 2);
      }
    }
  }
}
