import { ENTITY_COLORS, ENTITY_MAX_SPEED, SortMethod } from '../config';
import type { SeededPRNG } from '../prng';
import type { Simulator, EntityState, RenderEntity } from '../simulator';



export interface ECSData {
  posX: Float64Array;
  posYwh: Float64Array; // Packed [posY, w, h] for each entity
  colorId: Uint8Array; // Component to store color indexes (contiguously)
  angle: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  indices: Int32Array;
  id: Int32Array; // Original entity ID mapped to each index
}

export function createECSData(numEntities: number, canvasWidth: number, canvasHeight: number): ECSData {
  // posX is isolated to optimize cache line utilization during Sweep-and-Prune sorting
  const posX = new Float64Array(numEntities);
  // posYwh is packed [y, w, h] to load components together during Y-overlap checks
  const posYwh = new Float64Array(numEntities * 3);
  const colorId = new Uint8Array(numEntities);
  const angle = new Float64Array(numEntities);
  const vx = new Float64Array(numEntities);
  const vy = new Float64Array(numEntities);
  const indices = new Int32Array(numEntities);
  const id = new Int32Array(numEntities);

  for (let i = 0; i < numEntities; i++) {
    const size = 2 + Math.random() * 3; // Default fallback size randomization
    posX[i] = Math.random() * (canvasWidth - size);
    posYwh[i * 3 + 0] = Math.random() * (canvasHeight - size); // posY
    posYwh[i * 3 + 1] = size; // w
    posYwh[i * 3 + 2] = size; // h
    colorId[i] = Math.floor(Math.random() * ENTITY_COLORS.length);
    angle[i] = Math.random() * Math.PI * 2;
    vx[i] = Math.cos(angle[i]) * 1.0;
    vy[i] = Math.sin(angle[i]) * 1.0;
    indices[i] = i;
    id[i] = i;
  }

  return { posX, posYwh, colorId, angle, vx, vy, indices, id };
}


export function updateMovement(
  ecsData: ECSData,
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG
) {
  const { posX, posYwh, vx, vy, angle } = ecsData;
  const len = posX.length;

  if (behavior === 'wander') {
    for (let i = 0; i < len; i++) {
      angle[i] += (prng.next() - 0.5) * 0.4;
      vx[i] = Math.cos(angle[i]) * 1.2 * speedMultiplier;
      vy[i] = Math.sin(angle[i]) * 1.2 * speedMultiplier;

      posX[i] += vx[i];
      posYwh[i * 3 + 0] += vy[i]; // posY

      let bounced = false;
      const w = posYwh[i * 3 + 1];
      const h = posYwh[i * 3 + 2];

      if (posX[i] < 0) {
        posX[i] = 0;
        angle[i] = Math.PI - angle[i];
        bounced = true;
      } else if (posX[i] + w > canvasWidth) {
        posX[i] = canvasWidth - w;
        angle[i] = Math.PI - angle[i];
        bounced = true;
      }

      if (posYwh[i * 3 + 0] < 0) {
        posYwh[i * 3 + 0] = 0;
        angle[i] = -angle[i];
        bounced = true;
      } else if (posYwh[i * 3 + 0] + h > canvasHeight) {
        posYwh[i * 3 + 0] = canvasHeight - h;
        angle[i] = -angle[i];
        bounced = true;
      }

      if (bounced) {
        vx[i] = Math.cos(angle[i]) * 1.2 * speedMultiplier;
        vy[i] = Math.sin(angle[i]) * 1.2 * speedMultiplier;
      }
    }
  } else if (behavior === 'erratic') {
    for (let i = 0; i < len; i++) {
      const w = posYwh[i * 3 + 1];
      const h = posYwh[i * 3 + 2];
      posX[i] = prng.next() * (canvasWidth - w);
      posYwh[i * 3 + 0] = prng.next() * (canvasHeight - h);
    }
  }
}

export function runBroadphase(
  indices: Int32Array,
  posX: Float64Array,
  posYwh: Float64Array,
  outPairs: Int32Array,
  ids: Int32Array,
  sortMethod: SortMethod = SortMethod.Insertion,
  tempIndices?: Int32Array
): number {
  let pairCount = 0;
  const len = indices.length;
  const maxPairs = outPairs.length / 2;

  // 1. Sort indices based on chosen algorithm
  if (sortMethod === SortMethod.Insertion) {
    insertionSortCustomECS(indices, posX);
  } else if (sortMethod === SortMethod.Quick) {
    quickSortCustomECS(indices, posX, 0, len - 1);
  } else if (sortMethod === SortMethod.Merge && tempIndices) {
    mergeSortCustomECS(indices, posX, tempIndices, 0, len - 1);
  } else if (sortMethod === SortMethod.Native) {
    indices.sort((a, b) => posX[a] - posX[b]);
  }

  // 2. Sweep: Read X coordinates and Y overlap
  for (let i = 0; i < len; i++) {
    const aIdx = indices[i];
    const ax = posX[aIdx];
    const aRight = ax + posYwh[aIdx * 3 + 1]; // posYwh[aIdx * 3 + 1] is width (w)
    for (let j = i + 1; j < len; j++) {
      const bIdx = indices[j];
      const bx = posX[bIdx]; 
      if (bx > aRight) break; // Prune: subsequent X coordinates cannot overlap

      // Y-axis overlap check (AABB overlap) - reads packed posY, h
      const ay = posYwh[aIdx * 3 + 0];
      const ah = posYwh[aIdx * 3 + 2];
      const by = posYwh[bIdx * 3 + 0];
      const bh = posYwh[bIdx * 3 + 2];
      if (ay < by + bh && ay + ah > by) {
        if (pairCount < maxPairs) {
          outPairs[pairCount * 2] = ids[aIdx];
          outPairs[pairCount * 2 + 1] = ids[bIdx];
          pairCount++;
        }
      }
    }
  }
  return pairCount;
}

export function resolveCollisions(
  ecs: ECSData,
  pairs: Int32Array,
  pairCount: number,
  isColliding: Uint8Array
): number {
  let collisionCount = 0;
  const { posX, posYwh, vx, vy, angle } = ecs;

  for (let i = 0; i < pairCount; i++) {
    const idA = pairs[i * 2];
    const idB = pairs[i * 2 + 1];

    const dx = posX[idB] - posX[idA];
    const dy = posYwh[idB * 3 + 0] - posYwh[idA * 3 + 0];
    const distSq = dx * dx + dy * dy;
    const minDist = (posYwh[idA * 3 + 1] + posYwh[idB * 3 + 1]) / 2; // Radius sum

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

      posX[idA] -= nx * overlap * 0.5;
      posYwh[idA * 3 + 0] -= ny * overlap * 0.5;
      posX[idB] += nx * overlap * 0.5;
      posYwh[idB * 3 + 0] += ny * overlap * 0.5;

      const massA = posYwh[idA * 3 + 1] * posYwh[idA * 3 + 1];
      const massB = posYwh[idB * 3 + 1] * posYwh[idB * 3 + 1];
      const rvx = vx[idB] - vx[idA];
      const rvy = vy[idB] - vy[idA];
      const velAlongNormal = rvx * nx + rvy * ny;
 
      if (velAlongNormal < 0) {
        const impulse = -(2 * velAlongNormal) / (1 / massA + 1 / massB);
        vx[idA] -= (impulse / massA) * nx;
        vy[idA] -= (impulse / massA) * ny;
        vx[idB] += (impulse / massB) * nx;
        vy[idB] += (impulse / massB) * ny;

        const speedA = Math.sqrt(vx[idA] * vx[idA] + vy[idA] * vy[idA]);
        if (speedA > ENTITY_MAX_SPEED) {
          vx[idA] = (vx[idA] / speedA) * ENTITY_MAX_SPEED;
          vy[idA] = (vy[idA] / speedA) * ENTITY_MAX_SPEED;
        }
        const speedB = Math.sqrt(vx[idB] * vx[idB] + vy[idB] * vy[idB]);
        if (speedB > ENTITY_MAX_SPEED) {
          vx[idB] = (vx[idB] / speedB) * ENTITY_MAX_SPEED;
          vy[idB] = (vy[idB] / speedB) * ENTITY_MAX_SPEED;
        }

        angle[idA] = Math.atan2(vy[idA], vx[idA]);
        angle[idB] = Math.atan2(vy[idB], vx[idB]);
      }
    }
  }
  return collisionCount;
}

export function updateMovement(
  ecsData: ECSData,
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG
) {
  const { posX, posYwh, vx, vy, angle } = ecsData;
  const len = posX.length;

  if (behavior === 'wander') {
    for (let i = 0; i < len; i++) {
      angle[i] += (prng.next() - 0.5) * 0.4;
      vx[i] = Math.cos(angle[i]) * 1.2 * speedMultiplier;
      vy[i] = Math.sin(angle[i]) * 1.2 * speedMultiplier;

      posX[i] += vx[i];
      posYwh[i * 3 + 0] += vy[i]; // posY

      let bounced = false;
      const w = posYwh[i * 3 + 1];
      const h = posYwh[i * 3 + 2];

      if (posX[i] < 0) {
        posX[i] = 0;
        angle[i] = Math.PI - angle[i];
        bounced = true;
      } else if (posX[i] + w > canvasWidth) {
        posX[i] = canvasWidth - w;
        angle[i] = Math.PI - angle[i];
        bounced = true;
      }

      if (posYwh[i * 3 + 0] < 0) {
        posYwh[i * 3 + 0] = 0;
        angle[i] = -angle[i];
        bounced = true;
      } else if (posYwh[i * 3 + 0] + h > canvasHeight) {
        posYwh[i * 3 + 0] = canvasHeight - h;
        angle[i] = -angle[i];
        bounced = true;
      }

      if (bounced) {
        vx[i] = Math.cos(angle[i]) * 1.2 * speedMultiplier;
        vy[i] = Math.sin(angle[i]) * 1.2 * speedMultiplier;
      }
    }
  } else if (behavior === 'erratic') {
    for (let i = 0; i < len; i++) {
      const w = posYwh[i * 3 + 1];
      const h = posYwh[i * 3 + 2];
      posX[i] = prng.next() * (canvasWidth - w);
      posYwh[i * 3 + 0] = prng.next() * (canvasHeight - h);
    }
  }
}

/**
 * Simulator representing a custom lightweight Entity Component System (ECS).
 * 
 * Data Layout: Struct of Arrays (SoA).
 * Component data is stored in flat TypedArrays (`posX`, `posYwh`, `vx`, `vy`, `angle`, `colorId`).
 * Accessing components is done by index (entity ID), ensuring contiguous memory
 * reads during systems execution, maximizing CPU cache line usage (L1/L2 hits).
 * 
 * Algorithm: Sweep-and-Prune (S&P) using 1D Insertion Sort of entity index array,
 * checking bounds by indexing directly into component arrays.
 */
export class CustomECSSimulator implements Simulator {
  private sortMethod: SortMethod;

  private ecsData: ECSData | null = null;
  private tempIndices: Int32Array = new Int32Array(0);
  private times: number[] = [];
  private colliding = new Uint8Array(0);
  private pairsBuffer = new Int32Array(0);
  private maxCollisions = 200000;
  private renderEntities: RenderEntity[] = [];

  constructor(
    sortMethod: SortMethod = SortMethod.Insertion
  ) {
    this.sortMethod = sortMethod;
  }

  /**
   * Allocates flat component typed arrays inside ECSData.
   */
  init(numEntities: number, width: number, height: number, _prng: SeededPRNG) {
    this.ecsData = createECSData(numEntities, width, height);
    this.tempIndices = new Int32Array(numEntities);
    this.colliding = new Uint8Array(numEntities);
    this.pairsBuffer = new Int32Array(this.maxCollisions * 2);
    this.renderEntities = new Array(numEntities);
    for (let i = 0; i < numEntities; i++) {
      this.renderEntities[i] = { id: i, x: 0, y: 0, w: 0, h: 0, color: '' };
    }
  }

  /**
   * Executes a full simulation step, timing all operations:
   * 1. Movement updates (updatingposX, posYwh TypedArrays sequentially).
   * 2. Sweep-and-Prune broadphase (sorting indices array using posX elements, and sweeping bounds).
   * 3. Narrowphase resolution (indexing components using colliding pairs to calculate bounces).
   * 
   * This measures the benefits of SoA cache alignment: sequential reads/writes are L1 cache friendly,
   * even though indices mapping causes slight indirection during the sweep.
   */
  update(width: number, height: number, speedMultiplier: number, behavior: string, prng: SeededPRNG): { time: number, collisionCount: number } {
    const start = performance.now();
    let collisionCount = 0;
    if (this.ecsData) {
      updateMovement(this.ecsData, width, height, speedMultiplier, behavior, prng);
      const pairsCount = runBroadphase(
        this.ecsData.indices,
        this.ecsData.posX,
        this.ecsData.posYwh,
        this.pairsBuffer,
        this.ecsData.id,
        this.sortMethod,
        this.tempIndices
      );
      
      this.colliding.fill(0);
      collisionCount = resolveCollisions(this.ecsData, this.pairsBuffer, pairsCount, this.colliding);
    }
    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    return { time, collisionCount };
  }

  getRenderEntities(): RenderEntity[] {
    if (!this.ecsData) return [];
    const len = this.ecsData.posX.length;
    for (let i = 0; i < len; i++) {
      const r = this.renderEntities[i];
      r.id = this.ecsData.id[i];
      r.x = this.ecsData.posX[i];
      r.y = this.ecsData.posYwh[i * 3 + 0];
      r.w = this.ecsData.posYwh[i * 3 + 1];
      r.h = this.ecsData.posYwh[i * 3 + 2];
      r.color = ENTITY_COLORS[this.ecsData.colorId[i]];
    }
    return this.renderEntities;
  }

  getTimes() { return this.times; }
  clearTimes() { this.times = []; }

  /**
   * Translates flat TypedArray component buffers into structured EntityState array
   * for baseline position sync.
   */
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

  /**
   * Overwrites flat component buffers using structured baseline state.
   */
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
  }
}

// Aliases for compatibility
export {
  updateMovement as updateECSMovement,
  runBroadphase as runECSBroadphase,
  resolveCollisions as resolveECSPhysics
};

// === INTERNAL SORTING ALGORITHMS ===
function insertionSortRangeECS(indices: Int32Array, posX: Float64Array | Float32Array, left: number, right: number) {
  for (let i = left + 1; i <= right; i++) {
    const currIdx = indices[i];
    const currX = posX[currIdx];
    let j = i - 1;
    while (j >= left && posX[indices[j]] > currX) {
      indices[j + 1] = indices[j];
      j--;
    }
    indices[j + 1] = currIdx;
  }
}

function insertionSortCustomECS(indices: Int32Array, posX: Float64Array) {
  insertionSortRangeECS(indices, posX, 0, indices.length - 1);
}

function quickSortCustomECS(indices: Int32Array, posX: Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeECS(indices, posX, left, right);
    return;
  }
  const pivotIdx = partitionCustomECS(indices, posX, left, right);
  quickSortCustomECS(indices, posX, left, pivotIdx - 1);
  quickSortCustomECS(indices, posX, pivotIdx + 1, right);
}

function partitionCustomECS(indices: Int32Array, posX: Float64Array, left: number, right: number): number {
  const mid = (left + right) >> 1;
  const tempMid = indices[mid];
  indices[mid] = indices[right];
  indices[right] = tempMid;

  const pivotVal = posX[indices[right]];
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (posX[indices[j]] < pivotVal) {
      i++;
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }
  }
  const temp = indices[i + 1];
  indices[i + 1] = indices[right];
  indices[right] = temp;
  return i + 1;
}

function mergeSortCustomECS(indices: Int32Array, posX: Float64Array, temp: Int32Array, left: number, right: number) {
  temp.set(indices);
  mergeSortCustomECSRec(temp, indices, posX, left, right);
}

function mergeSortCustomECSRec(src: Int32Array, dst: Int32Array, posX: Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeECS(dst, posX, left, right);
    for (let m = left; m <= right; m++) {
      src[m] = dst[m];
    }
    return;
  }
  const mid = (left + right) >> 1;
  mergeSortCustomECSRec(dst, src, posX, left, mid);
  mergeSortCustomECSRec(dst, src, posX, mid + 1, right);
  
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

