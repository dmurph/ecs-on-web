import { addEntity, addComponent, createWorld, query } from 'bitecs';
import { SeededPRNG } from '../prng';
import { ENTITY_COLORS, ENTITY_MAX_SPEED } from '../config';
import type { Simulator, EntityState, RenderEntity } from '../simulator';

export interface BitecsStore {
  world: any;
  entities: number[];
  PositionX: { value: Float64Array };
  PositionYwh: { y: Float64Array; w: Float64Array; h: Float64Array };
  Physics: { vx: Float64Array; vy: Float64Array; angle: Float64Array };
  Style: { colorId: Uint8Array };
}

/**
 * Step 1: Update movements
 * Updates entity positions and handles boundary bounces using bitECS component stores.
 * In bitECS, component properties (`PositionX`, `PositionYwh`, `Physics`) are backed by flat TypedArrays (Structure of Arrays).
 * Iterating over entity IDs accesses contiguous memory, keeping CPU L1/L2 cache lines warm.
 */
export function updateMovement(
  store: BitecsStore,
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG,
) {
  const { world, PositionX, PositionYwh, Physics } = store;
  if (behavior === 'wander') {
    for (const eid of query(world, [PositionX, PositionYwh, Physics])) {
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
    for (const eid of query(world, [PositionX, PositionYwh, Physics])) {
      const w = PositionYwh.w[eid];
      const h = PositionYwh.h[eid];
      PositionX.value[eid] = prng.next() * (canvasWidth - w);
      PositionYwh.y[eid] = prng.next() * (canvasHeight - h);
    }
  }
}

export function createBitecsData(
  world: any,
  numEntities: number,
  canvasWidth: number,
  canvasHeight: number,
): BitecsStore {
  const PositionX = { value: new Float64Array(numEntities) };
  const PositionYwh = {
    y: new Float64Array(numEntities),
    w: new Float64Array(numEntities),
    h: new Float64Array(numEntities),
  };
  const Physics = {
    vx: new Float64Array(numEntities),
    vy: new Float64Array(numEntities),
    angle: new Float64Array(numEntities),
  };
  const Style = {
    colorId: new Uint8Array(numEntities),
  };

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
  return { world, entities, PositionX, PositionYwh, Physics, Style };
}

/**
 * Step 2: Broadphase
 * Sweep & Prune broadphase using bitECS component arrays.
 * Accesses `PositionX.value` directly to sort and sweep entity IDs with high memory locality.
 */
export function runBroadphase(
  store: BitecsStore,
  entities: Int32Array,
  outPairs: Int32Array,
  sortType: 'insertion' | 'quick' | 'merge' | 'native' = 'insertion',
  tempEntities?: Int32Array,
): number {
  let pairCount = 0;
  const len = entities.length;
  const maxPairs = outPairs.length / 2;
  const { PositionX, PositionYwh } = store;

  // 1. Sort entities based on chosen algorithm
  if (sortType === 'insertion') {
    insertionSortBitecs(entities, PositionX.value);
  } else if (sortType === 'quick') {
    quickSortBitecs(entities, PositionX.value, 0, len - 1);
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

/**
 * Step 3: Narrowphase
 * Resolves exact circle overlaps and applies bounce velocity impulses.
 * Indexes directly into bitECS TypedArray component stores using candidate collision pairs.
 */
export function resolveCollisions(
  store: BitecsStore,
  pairs: Int32Array,
  pairCount: number,
  isColliding?: Uint8Array,
): number {
  let collisionCount = 0;
  const { PositionX, PositionYwh, Physics } = store;

  for (let i = 0; i < pairCount; i++) {
    const idA = pairs[i * 2];
    const idB = pairs[i * 2 + 1];

    const dx = PositionX.value[idB] - PositionX.value[idA];
    const dy = PositionYwh.y[idB] - PositionYwh.y[idA];
    const distSq = dx * dx + dy * dy;
    const minDist = (PositionYwh.w[idA] + PositionYwh.w[idB]) / 2; // Radius sum

    if (distSq < minDist * minDist && distSq > 0.001) {
      if (isColliding) {
        isColliding[idA] = 1;
        isColliding[idB] = 1;
      }

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

        const speedA = Math.sqrt(
          Physics.vx[idA] * Physics.vx[idA] + Physics.vy[idA] * Physics.vy[idA],
        );
        if (speedA > ENTITY_MAX_SPEED) {
          Physics.vx[idA] = (Physics.vx[idA] / speedA) * ENTITY_MAX_SPEED;
          Physics.vy[idA] = (Physics.vy[idA] / speedA) * ENTITY_MAX_SPEED;
        }
        const speedB = Math.sqrt(
          Physics.vx[idB] * Physics.vx[idB] + Physics.vy[idB] * Physics.vy[idB],
        );
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

  private store: BitecsStore | null = null;
  private sortedEntities: Int32Array = new Int32Array(0);
  private tempEntities: Int32Array = new Int32Array(0);
  private times: number[] = [];
  private pairsBuffer = new Int32Array(0);
  private maxCollisions = 200000;
  private renderEntities: RenderEntity[] = [];

  constructor(
    sortType: 'insertion' | 'quick' | 'merge' | 'native' = 'insertion',
  ) {
    this.sortType = sortType;
  }

  init(numEntities: number, width: number, height: number, _prng: SeededPRNG) {
    const world = createWorld();
    this.store = createBitecsData(world, numEntities, width, height);
    this.sortedEntities = new Int32Array(this.store.entities);
    this.tempEntities = new Int32Array(numEntities);

    this.pairsBuffer = new Int32Array(this.maxCollisions * 2);
    this.renderEntities = new Array(numEntities);
    for (let i = 0; i < numEntities; i++) {
      this.renderEntities[i] = { id: i, x: 0, y: 0, w: 0, h: 0, color: '' };
    }
  }

  update(
    width: number,
    height: number,
    speedMultiplier: number,
    behavior: string,
    prng: SeededPRNG,
  ): { time: number; collisionCount: number } {
    const start = performance.now();
    let collisionCount = 0;
    if (this.store) {
      // Step 1: Update movements
      updateMovement(
        this.store,
        width,
        height,
        speedMultiplier,
        behavior,
        prng,
      );
      // Step 2: Broadphase
      const pairsCount = runBroadphase(
        this.store,
        this.sortedEntities,
        this.pairsBuffer,
        this.sortType,
        this.tempEntities,
      );

      // Step 3: Narrowphase
      collisionCount = resolveCollisions(
        this.store,
        this.pairsBuffer,
        pairsCount,
      );
    }
    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    return { time, collisionCount };
  }

  getRenderEntities(): RenderEntity[] {
    if (!this.store) return [];
    const { PositionX, PositionYwh, Style, entities } = this.store;
    const len = entities.length;
    for (let i = 0; i < len; i++) {
      const eid = entities[i];
      const r = this.renderEntities[i];
      r.id = eid;
      r.x = PositionX.value[eid];
      r.y = PositionYwh.y[eid];
      r.w = PositionYwh.w[eid];
      r.h = PositionYwh.h[eid];
      r.color = ENTITY_COLORS[Style.colorId[eid]];
    }
    return this.renderEntities;
  }

  getTimes() {
    return this.times;
  }
  clearTimes() {
    this.times = [];
  }

  getPositions(): EntityState[] {
    if (!this.store) return [];
    const { PositionX, PositionYwh, Physics, Style, entities } = this.store;
    const len = entities.length;
    const result = new Array<EntityState>(len);
    for (let i = 0; i < len; i++) {
      const eid = entities[i];
      result[i] = {
        x: PositionX.value[eid],
        y: PositionYwh.y[eid],
        w: PositionYwh.w[eid],
        h: PositionYwh.h[eid],
        vx: Physics.vx[eid],
        vy: Physics.vy[eid],
        angle: Physics.angle[eid],
        color: ENTITY_COLORS[Style.colorId[eid]],
      };
    }
    return result;
  }

  setPositions(positions: EntityState[]) {
    if (!this.store) return;
    const { PositionX, PositionYwh, Physics, Style, entities } = this.store;
    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i];
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
  resolveCollisions as resolveBitecsPhysics,
};

// Helper: Insertion sort over a range for subarrays
function insertionSortRangeBitecs(
  entities: Int32Array,
  posX: Float64Array,
  left: number,
  right: number,
) {
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

export function insertionSortBitecs(entities: Int32Array, posX: Float64Array) {
  insertionSortRangeBitecs(entities, posX, 0, entities.length - 1);
}

export function quickSortBitecs(
  entities: Int32Array,
  posX: Float64Array,
  left: number,
  right: number,
) {
  if (right - left < 12) {
    insertionSortRangeBitecs(entities, posX, left, right);
    return;
  }
  const pivotIdx = partitionBitecs(entities, posX, left, right);
  quickSortBitecs(entities, posX, left, pivotIdx - 1);
  quickSortBitecs(entities, posX, pivotIdx + 1, right);
}

function partitionBitecs(
  entities: Int32Array,
  posX: Float64Array,
  left: number,
  right: number,
): number {
  const mid = (left + right) >> 1;
  const tempMid = entities[mid];
  entities[mid] = entities[right];
  entities[right] = tempMid;

  const pivotVal = posX[entities[right]];
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (posX[entities[j]] < pivotVal) {
      i++;
      const temp = entities[i];
      entities[i] = entities[j];
      entities[j] = temp;
    }
  }
  const temp = entities[i + 1];
  entities[i + 1] = entities[right];
  entities[right] = temp;
  return i + 1;
}

export function mergeSortBitecs(
  entities: Int32Array,
  posX: Float64Array,
  temp: Int32Array,
  left: number,
  right: number,
) {
  temp.set(entities);
  mergeSortBitecsRec(temp, entities, posX, left, right);
}

function mergeSortBitecsRec(
  src: Int32Array,
  dst: Int32Array,
  posX: Float64Array,
  left: number,
  right: number,
) {
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
