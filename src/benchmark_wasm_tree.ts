import { ENTITY_COLORS } from './config';
import { SeededPRNG } from './prng';
import type { Simulator, EntityState } from './simulator';
import { renderCanvas } from './renderer';
import type { ECSData } from './benchmark_custom_ecs';

// Fetch and compile WebAssembly module synchronously/top-level await
const response = await fetch('./benchmark_wasm_tree.wasm');
const buffer = await response.arrayBuffer();
const wasmModule = await WebAssembly.compile(buffer);

export class WasmTreeSimulator implements Simulator {
  private wasm: any = null;
  private ecsData: ECSData | null = null;
  private times: number[] = [];
  private colliding = new Uint8Array(0);
  private pairsBuffer = new Int32Array(0);
  private lastCollisionCount = 0;

  init(numEntities: number, _width: number, _height: number, _prng: SeededPRNG) {
    const instance = new WebAssembly.Instance(wasmModule, {
      env: {
        abort: (msg: any, file: any, line: any, col: any) => {
          console.error(`abort called: ${msg} at ${file}:${line}:${col}`);
        }
      }
    });
    this.wasm = instance.exports as any;

    const maxCollisions = 200000;
    this.wasm.init(numEntities, maxCollisions);

    const memoryBuffer = (this.wasm.memory as WebAssembly.Memory).buffer;
    const posX = new Float64Array(memoryBuffer, this.wasm.getPosXPtr(), numEntities);
    const posYwh = new Float64Array(memoryBuffer, this.wasm.getPosYwhPtr(), numEntities * 3);
    const colorId = new Uint8Array(memoryBuffer, this.wasm.getColorIdPtr(), numEntities);
    const vx = new Float64Array(memoryBuffer, this.wasm.getVxPtr(), numEntities);
    const vy = new Float64Array(memoryBuffer, this.wasm.getVyPtr(), numEntities);
    const angle = new Float64Array(memoryBuffer, this.wasm.getAnglePtr(), numEntities);
    const indices = new Int32Array(memoryBuffer, this.wasm.getIndicesPtr(), numEntities);
    const id = new Int32Array(memoryBuffer, this.wasm.getIdPtr(), numEntities);

    this.ecsData = { posX, posYwh, colorId, angle, vx, vy, indices, id };
    this.colliding = new Uint8Array(memoryBuffer, this.wasm.getCollidingPtr(), numEntities);
    this.pairsBuffer = new Int32Array(memoryBuffer, this.wasm.getPairsBufferPtr(), maxCollisions * 2);

    this.lastCollisionCount = 0;
  }

  update(
    width: number,
    height: number,
    speedMultiplier: number,
    behavior: string,
    prng: SeededPRNG
  ): { time: number; collisionCount: number } {
    const start = performance.now();
    let behaviorId = 0; // static
    if (behavior === 'wander') behaviorId = 1;
    else if (behavior === 'erratic') behaviorId = 2;

    const collisionCount = this.wasm.update(
      width,
      height,
      speedMultiplier,
      behaviorId,
      prng.seed
    );

    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    this.lastCollisionCount = collisionCount;

    return { time, collisionCount };
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.ecsData) {
      renderCanvas(
        ctx.canvas,
        ctx,
        this.ecsData,
        this.colliding,
        'ecs',
        this.pairsBuffer,
        this.lastCollisionCount,
        this.ecsData.posX.length
      );
    }
  }

  getTimes() { return this.times; }
  clearTimes() { this.times = []; }

  getPositions(): EntityState[] {
    if (!this.ecsData) return [];
    const { posX, posYwh, vx, vy, angle, colorId } = this.ecsData;
    const len = posX.length;
    const result = new Array<EntityState>(len);
    for (let i = 0; i < len; i++) {
      result[i] = {
        x: posX[i],
        y: posYwh[i * 3 + 0],
        w: posYwh[i * 3 + 1],
        h: posYwh[i * 3 + 2],
        vx: vx[i],
        vy: vy[i],
        angle: angle[i],
        color: ENTITY_COLORS[colorId[i]]
      };
    }
    return result;
  }

  setPositions(positions: EntityState[]) {
    if (!this.ecsData) return;
    const { posX, posYwh, vx, vy, angle, colorId } = this.ecsData;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      posX[i] = p.x;
      posYwh[i * 3 + 0] = p.y;
      posYwh[i * 3 + 1] = p.w;
      posYwh[i * 3 + 2] = p.h;
      vx[i] = p.vx;
      vy[i] = p.vy;
      angle[i] = p.angle;
      colorId[i] = ENTITY_COLORS.indexOf(p.color);
    }
    this.wasm.rebuildTree(positions.length);
  }
}
