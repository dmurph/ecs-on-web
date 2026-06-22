import { ENTITY_COLORS } from './config';
import { GameEntity } from './benchmarks/benchmark_oop';
import type { ECSData } from './benchmarks/benchmark_custom_ecs';
import { PositionX, PositionYwh, Style } from './benchmarks/benchmark_bitecs';

interface RenderEntity {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function getRenderEntity(
  data: GameEntity[] | ECSData | number[],
  i: number,
  mode: 'oop' | 'oop-tree' | 'ecs' | 'bitecs'
): RenderEntity {
  if (mode === 'oop' || mode === 'oop-tree') {
    const e = (data as GameEntity[])[i];
    return {
      id: e.id,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      color: e.color
    };
  } else if (mode === 'ecs') {
    const ecs = data as ECSData;
    const id = ecs.id[i];
    return {
      id,
      x: ecs.posX[i],
      y: ecs.posYwh[i * 3 + 0],
      w: ecs.posYwh[i * 3 + 1],
      h: ecs.posYwh[i * 3 + 2],
      color: ENTITY_COLORS[ecs.colorId[i]]
    };
  } else {
    const entities = data as number[];
    const eid = entities[i];
    return {
      id: eid,
      x: PositionX.value[eid],
      y: PositionYwh.y[eid],
      w: PositionYwh.w[eid],
      h: PositionYwh.h[eid],
      color: ENTITY_COLORS[Style.colorId[eid]]
    };
  }
}

function getEntityBoundsById(
  data: GameEntity[] | ECSData | number[],
  id: number,
  mode: 'oop' | 'oop-tree' | 'ecs' | 'bitecs',
  entitiesById?: GameEntity[]
): { x: number; y: number; w: number; h: number } | null {
  if (mode === 'oop' || mode === 'oop-tree') {
    if (!entitiesById) return null;
    const e = entitiesById[id];
    return e ? { x: e.x, y: e.y, w: e.w, h: e.h } : null;
  } else if (mode === 'ecs') {
    const ecs = data as ECSData;
    return {
      x: ecs.posX[id],
      y: ecs.posYwh[id * 3 + 0],
      w: ecs.posYwh[id * 3 + 1],
      h: ecs.posYwh[id * 3 + 2]
    };
  } else {
    return {
      x: PositionX.value[id],
      y: PositionYwh.y[id],
      w: PositionYwh.w[id],
      h: PositionYwh.h[id]
    };
  }
}

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

  ctx.lineWidth = 1.5;

  // 1. Draw entities
  for (let i = 0; i < numEntities; i++) {
    const entity = getRenderEntity(data, i, mode);
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

  // Draw collision network lines and contact pixels connecting touching entities
  if (pairsCount > 0 && !skipLines) {
    // 1. Draw connection lines
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.2)'; // Semi-transparent crimson
    ctx.lineWidth = 1.0;
    ctx.beginPath();

    for (let i = 0; i < pairsCount; i++) {
      const idA = pairsBuffer[i * 2];
      const idB = pairsBuffer[i * 2 + 1];
      const a = getEntityBoundsById(data, idA, mode, entitiesById);
      const b = getEntityBoundsById(data, idB, mode, entitiesById);
      if (a && b) {
        ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
        ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
      }
    }
    ctx.stroke();

    // 2. Draw red impact pixels at the exact contact midpoint (sparks)
    ctx.fillStyle = '#e11d48';
    for (let i = 0; i < pairsCount; i++) {
      const idA = pairsBuffer[i * 2];
      const idB = pairsBuffer[i * 2 + 1];
      const a = getEntityBoundsById(data, idA, mode, entitiesById);
      const b = getEntityBoundsById(data, idB, mode, entitiesById);
      if (a && b) {
        const mx = Math.round((a.x + a.w / 2 + b.x + b.w / 2) / 2);
        const my = Math.round((a.y + a.h / 2 + b.y + b.h / 2) / 2);
        ctx.fillRect(mx - 1, my - 1, 2, 2);
      }
    }
  }
}
