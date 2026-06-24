import { ENTITY_COLORS } from './config';
import { GameEntity } from './benchmarks/benchmark_oop';
import type { ECSData } from './benchmarks/benchmark_custom_ecs';
import type { BitecsStore } from './benchmarks/benchmark_bitecs';

interface RenderEntity {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function getRenderEntity(
  data: any,
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
    const store = data as BitecsStore;
    const eid = store.entities[i];
    return {
      id: eid,
      x: store.PositionX.value[eid],
      y: store.PositionYwh.y[eid],
      w: store.PositionYwh.w[eid],
      h: store.PositionYwh.h[eid],
      color: ENTITY_COLORS[store.Style.colorId[eid]]
    };
  }
}

export function renderCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  data: any,
  mode: 'oop' | 'oop-tree' | 'ecs' | 'bitecs',
  numEntities: number
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

  // 1. Draw entities
  for (let i = 0; i < numEntities; i++) {
    const entity = getRenderEntity(data, i, mode);

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
