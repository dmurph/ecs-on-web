import { addEntity, addComponent, createWorld } from 'bitecs';
import { SeededPRNG } from '../prng';
import { ENTITY_COLORS, ENTITY_MAX_SPEED } from '../config';
import type { Simulator, EntityState } from '../simulator';
import { renderCanvas } from '../renderer';
import {
  insertionSortCustomECS,
  quickSortCustomECS
} from '../sorting';

// Helper: Insertion sort over a range for subarrays
function insertionSortRangeBitecs(entities: Int32Array, posX: Float64Array, left: number, right: number) {
  for (let i = left + 1; i <= right; i++) {
    const currIdx = entities[i];
    const currX = posX[currIdx];
    let j = i - 1;
    while (j >= left && posX[entities[j]] > currX) {
      entities[j + 1] = entities[j];
      j--;
    }
    entities[j + 1] = currIdx;
  }
}

export function mergeSortBitecs(entities: Int32Array, posX: Float64Array, temp: Int32Array, left: number, right: number) {
  temp.set(entities);
  mergeSortBitecsRec(temp, entities, posX, left, right);
}

function mergeSortBitecsRec(src: Int32Array, dst: Int32Array, posX: Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeBitecs(dst, posX, left, right);
    for (let m = left; m <= right; m++) {
      src[m] = dst[m];
    }
    return;
  }
  const mid = (left + right) >> 1;
  mergeSortBitecsRec(dst, src, posX, left, mid);
  mergeSortBitecsRec(dst, src, posX, mid + 1, right);
  
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (posX[src[i]] <= posX[src[j]]) {
      dst[k++] = src[i++];
    } else {
      dst[k++] = src[j++];
    }
  }

  while (i <= mid) {
    dst[k++] = src[i++];
  }
  while (j <= right) {
    dst[k++] = src[j++];
  }
}

// 1. Component Definitions
export const PositionX = { value: new Float64Array(100000) };
export const PositionYwh = {
  y: new Float64Array(100000),
  w: new Float64Array(100000),
  h: new Float64Array(100000)
};
export const Physics = {
  vx: new Float64Array(100000),
  vy: new Float64Array(100000),
  angle: new Float64Array(100000)
};
export const Style = {
  colorId: new Uint8Array(100000)
};

// 2. Setup World & Entities
export function createBitecsData(world: any, numEntities: number, canvasWidth: number, canvasHeight: number): number[] {
  const entities: number[] = [];
  for (let i = 0; i < numEntities; i++) {
    const eid = addEntity(world);
    addComponent(world, eid, PositionX);
    addComponent(world, eid, PositionYwh);
    addComponent(world, eid, Physics);
    addComponent(world, eid, Style);

    const size = 2 + Math.random() * 3;
    PositionX.value[eid] = Math.random() * (canvasWidth - size);
    PositionYwh.y[eid] = Math.random() * (canvasHeight - size);
    PositionYwh.w[eid] = size;
    PositionYwh.h[eid] = size;

    Style.colorId[eid] = Math.floor(Math.random() * ENTITY_COLORS.length);
    Physics.angle[eid] = Math.random() * Math.PI * 2;
    Physics.vx[eid] = Math.cos(Physics.angle[eid]) * 1.0;
    Physics.vy[eid] = Math.sin(Physics.angle[eid]) * 1.0;

    entities.push(eid);
  }
  return entities;
}

// 3. S&P Broadphase
export function runBroadphase(
  entities: Int32Array,
  outPairs: Int32Array,
  sortType: 'insertion' | 'quick' | 'merge' | 'native' = 'insertion',
  tempEntities?: Int32Array
): number {
  let pairCount = 0;
  const len = entities.length;
  const maxPairs = outPairs.length / 2;

  // 1. Sort entities based on chosen algorithm
  if (sortType === 'insertion') {
    insertionSortCustomECS(entities, PositionX.value);
  } else if (sortType === 'quick') {
    quickSortCustomECS(entities, PositionX.value, 0, len - 1);
  } else if (sortType === 'merge' && tempEntities) {
    mergeSortBitecs(entities, PositionX.value, tempEntities, 0, len - 1);
  } else if (sortType === 'native') {
    entities.sort((a, b) => PositionX.value[a] - PositionX.value[b]);
  }

  // 2. Sweep
  for (let i = 0; i < len; i++) {
    const aId = entities[i];
    const ax = PositionX.value[aId];
    const aw = PositionYwh.w[aId];
    const aRight = ax + aw;

    for (let j = i + 1; j < len; j++) {
      const bId = entities[j];
      const bx = PositionX.value[bId];
      if (bx > aRight) break; // Prune: subsequent X coordinates cannot overlap

      const ay = PositionYwh.y[aId];
      const ah = PositionYwh.h[aId];
      const by = PositionYwh.y[bId];
      const bh = PositionYwh.h[bId];

      if (ay < by + bh && ay + ah > by) {
        if (pairCount < maxPairs) {
          outPairs[pairCount * 2] = aId;
          outPairs[pairCount * 2 + 1] = bId;
          pairCount++;
        }
      }
    }
  }
  return pairCount;
}

// 4. Narrowphase Solver
export function resolveCollisions(
  _entities: number[],
  pairs: Int32Array,
  pairCount: number,
  isColliding: Uint8Array
): number {
  let collisionCount = 0;

  for (let i = 0; i < pairCount; i++) {
    const idA = pairs[i * 2];
    const idB = pairs[i * 2 + 1];

    const dx = PositionX.value[idB] - PositionX.value[idA];
    const dy = PositionYwh.y[idB] - PositionYwh.y[idA];
    const distSq = dx * dx + dy * dy;
    const minDist = (PositionYwh.w[idA] + PositionYwh.w[idB]) / 2; // Radius sum

    if (distSq < minDist * minDist && distSq > 0.001) {
      isColliding[idA] = 1;
      isColliding[idB] = 1;

      pairs[collisionCount * 2] = idA;
      pairs[collisionCount * 2 + 1] = idB;
      collisionCount++;

      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      PositionX.value[idA] -= nx * overlap * 0.5;
      PositionYwh.y[idA] -= ny * overlap * 0.5;
      PositionX.value[idB] += nx * overlap * 0.5;
      PositionYwh.y[idB] += ny * overlap * 0.5;

      const massA = PositionYwh.w[idA] * PositionYwh.w[idA];
      const massB = PositionYwh.w[idB] * PositionYwh.w[idB];
      const rvx = Physics.vx[idB] - Physics.vx[idA];
      const rvy = Physics.vy[idB] - Physics.vy[idA];
      const velAlongNormal = rvx * nx + rvy * ny;
 
      if (velAlongNormal < 0) {
        const impulse = -(2 * velAlongNormal) / (1 / massA + 1 / massB);
        Physics.vx[idA] -= (impulse / massA) * nx;
        Physics.vy[idA] -= (impulse / massA) * ny;
        Physics.vx[idB] += (impulse / massB) * nx;
        Physics.vy[idB] += (impulse / massB) * ny;

        const speedA = Math.sqrt(Physics.vx[idA] * Physics.vx[idA] + Physics.vy[idA] * Physics.vy[idA]);
        if (speedA > ENTITY_MAX_SPEED) {
          Physics.vx[idA] = (Physics.vx[idA] / speedA) * ENTITY_MAX_SPEED;
          Physics.vy[idA] = (Physics.vy[idA] / speedA) * ENTITY_MAX_SPEED;
        }
        const speedB = Math.sqrt(Physics.vx[idB] * Physics.vx[idB] + Physics.vy[idB] * Physics.vy[idB]);
        if (speedB > ENTITY_MAX_SPEED) {
          Physics.vx[idB] = (Physics.vx[idB] / speedB) * ENTITY_MAX_SPEED;
          Physics.vy[idB] = (Physics.vy[idB] / speedB) * ENTITY_MAX_SPEED;
        }

        Physics.angle[idA] = Math.atan2(Physics.vy[idA], Physics.vx[idA]);
        Physics.angle[idB] = Math.atan2(Physics.vy[idB], Physics.vx[idB]);
      }
    }
  }
  return collisionCount;
}

export function updateMovement(
  entities: number[],
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG
) {
  const len = entities.length;
  if (behavior === 'wander') {
    for (let i = 0; i < len; i++) {
      const eid = entities[i];
      Physics.angle[eid] += (prng.next() - 0.5) * 0.4;
      Physics.vx[eid] = Math.cos(Physics.angle[eid]) * 1.2 * speedMultiplier;
      Physics.vy[eid] = Math.sin(Physics.angle[eid]) * 1.2 * speedMultiplier;

      PositionX.value[eid] += Physics.vx[eid];
      PositionYwh.y[eid] += Physics.vy[eid];

      let bounced = false;
      const w = PositionYwh.w[eid];
      const h = PositionYwh.h[eid];

      if (PositionX.value[eid] < 0) {
        PositionX.value[eid] = 0;
        Physics.angle[eid] = Math.PI - Physics.angle[eid];
        bounced = true;
      } else if (PositionX.value[eid] + w > canvasWidth) {
        PositionX.value[eid] = canvasWidth - w;
        Physics.angle[eid] = Math.PI - Physics.angle[eid];
        bounced = true;
      }

      if (PositionYwh.y[eid] < 0) {
        PositionYwh.y[eid] = 0;
        Physics.angle[eid] = -Physics.angle[eid];
        bounced = true;
      } else if (PositionYwh.y[eid] + h > canvasHeight) {
        PositionYwh.y[eid] = canvasHeight - h;
        Physics.angle[eid] = -Physics.angle[eid];
        bounced = true;
      }

      if (bounced) {
        Physics.vx[eid] = Math.cos(Physics.angle[eid]) * 1.2 * speedMultiplier;
        Physics.vy[eid] = Math.sin(Physics.angle[eid]) * 1.2 * speedMultiplier;
      }
    }
  } else if (behavior === 'erratic') {
    for (let i = 0; i < len; i++) {
      const eid = entities[i];
      const w = PositionYwh.w[eid];
      const h = PositionYwh.h[eid];
      PositionX.value[eid] = prng.next() * (canvasWidth - w);
      PositionYwh.y[eid] = prng.next() * (canvasHeight - h);
    }
  }
}

/**
 * Simulator representing a highly optimized third-party ECS framework (bitECS).
 * 
 * Data Layout: Struct of Arrays (SoA).
 * Component arrays are allocated globally in flat TypedArrays by bitECS.
 * Entities are represented as integer IDs (indices) which map directly to component arrays.
 * 
 * Algorithm: Sweep-and-Prune (S&P) using 1D Insertion Sort of integer entity array,
 * querying coordinates directly via component typed arrays.
 */
export class BitECSSimulator implements Simulator {
  private sortType: 'insertion' | 'quick' | 'merge' | 'native';

  private world: any = null;
  private entities: number[] = [];
  private sortedEntities: Int32Array = new Int32Array(0);
  private tempEntities: Int32Array = new Int32Array(0);
  private times: number[] = [];
  private colliding = new Uint8Array(0);
  private pairsBuffer = new Int32Array(0);
  private maxCollisions = 200000;
  private lastCollisionCount = 0;
  private pairsCount = 0;

  constructor(
    sortType: 'insertion' | 'quick' | 'merge' | 'native' = 'insertion'
  ) {
    this.sortType = sortType;
  }

  /**
   * Initializes the bitECS world, registers components, and spawns entity IDs.
   */
  init(numEntities: number, width: number, height: number, _prng: SeededPRNG) {
    this.world = createWorld({
      components: {
        PositionX,
        PositionYwh,
        Physics,
        Style
      }
    });
    this.entities = createBitecsData(this.world, numEntities, width, height);
    this.sortedEntities = new Int32Array(this.entities);
    this.tempEntities = new Int32Array(numEntities);
    
    this.colliding = new Uint8Array(numEntities);
    this.pairsBuffer = new Int32Array(this.maxCollisions * 2);
    this.lastCollisionCount = 0;
    this.pairsCount = 0;
  }

  /**
   * Executes a full simulation step, timing all operations:
   * 1. Movement updates (updating PositionX/PositionYwh/Physics components).
   * 2. Sweep-and-Prune broadphase (sorting entity IDs using PositionX, sweeping bounds).
   * 3. Narrowphase resolution (reading entity components using pair indices to compute bounce impulses).
   * 
   * This benchmarks bitECS's internal SoA components lookup performance compared to
   * the custom ECS implementation and raw OOP pointers.
   */
  update(width: number, height: number, speedMultiplier: number, behavior: string, prng: SeededPRNG): { time: number, collisionCount: number } {
    const start = performance.now();
    updateMovement(this.entities, width, height, speedMultiplier, behavior, prng);
    this.pairsCount = runBroadphase(this.sortedEntities, this.pairsBuffer, this.sortType, this.tempEntities);
    
    this.colliding.fill(0);
    this.lastCollisionCount = resolveCollisions(this.entities, this.pairsBuffer, this.pairsCount, this.colliding);
    
    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    return { time, collisionCount: this.lastCollisionCount };
  }

  /**
   * Renders the bitECS simulation state.
   */
  render(ctx: CanvasRenderingContext2D) {
    renderCanvas(ctx.canvas, ctx, this.entities, this.colliding, 'bitecs', this.pairsBuffer, this.lastCollisionCount, this.entities.length);
  }

  getTimes() { return this.times; }
  clearTimes() { this.times = []; }

  /**
   * Translates flat bitECS component arrays into structured baseline EntityState array.
   */
  getPositions(): EntityState[] {
    const len = this.entities.length;
    const result = new Array<EntityState>(len);
    for (let i = 0; i < len; i++) {
      const eid = this.entities[i];
      result[i] = {
        x: PositionX.value[eid],
        y: PositionYwh.y[eid],
        w: PositionYwh.w[eid],
        h: PositionYwh.h[eid],
        vx: Physics.vx[eid],
        vy: Physics.vy[eid],
        angle: Physics.angle[eid],
        color: ENTITY_COLORS[Style.colorId[eid]]
      };
    }
    return result;
  }

  /**
   * Overwrites flat bitECS component arrays with structured baseline state.
   */
  setPositions(positions: EntityState[]) {
    for (let i = 0; i < this.entities.length; i++) {
      const eid = this.entities[i];
      const p = positions[i];
      PositionX.value[eid] = p.x;
      PositionYwh.y[eid] = p.y;
      PositionYwh.w[eid] = p.w;
      PositionYwh.h[eid] = p.h;
      Physics.vx[eid] = p.vx;
      Physics.vy[eid] = p.vy;
      Physics.angle[eid] = p.angle;
      Style.colorId[eid] = ENTITY_COLORS.indexOf(p.color);
    }
  }
}

// Aliases for compatibility
export {
  updateMovement as updateBitecsMovement,
  runBroadphase as runBitecsBroadphase,
  resolveCollisions as resolveBitecsPhysics
};

