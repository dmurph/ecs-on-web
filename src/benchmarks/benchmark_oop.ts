import { ENTITY_COLORS, ENTITY_MAX_SPEED, SortMethod } from '../config';
import type { SeededPRNG } from '../prng';
import type { Simulator, EntityState, RenderEntity } from '../simulator';



export class GameEntity {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  name: string;
  inventory: number[];
  
  vx: number;
  vy: number;
  angle: number;

  contacts: GameEntity[] = [];

  constructor(id: number, canvasWidth: number, canvasHeight: number) {
    this.id = id;
    const size = 2 + Math.random() * 3; // Random diameter between 2px and 5px
    this.w = size;
    this.h = size;
    this.x = Math.random() * (canvasWidth - this.w);
    this.y = Math.random() * (canvasHeight - this.h);
    
    const colorIndex = Math.floor(Math.random() * ENTITY_COLORS.length);
    this.color = ENTITY_COLORS[colorIndex];

    this.name = `Entity_${id}_${Math.random()}`;
    this.inventory = new Array(Math.floor(Math.random() * 10)).fill(0);

    this.angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(this.angle) * 1.0;
    this.vy = Math.sin(this.angle) * 1.0;
  }
}

/**
 * Step 1: Update movements
 * Iterates through entities to update positions based on velocity and handle boundary bounces.
 * In traditional OOP, each entity is a separately allocated heap object (`GameEntity`).
 * Traversing `entitiesById` involves chasing object references scattered across memory, which causes frequent CPU cache misses compared to streaming flat ECS arrays.
 */
export function updateMovement(
  entitiesById: GameEntity[],
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG
) {
  const len = entitiesById.length;
  if (behavior === 'wander') {
    for (let i = 0; i < len; i++) {
      const entity = entitiesById[i];
      entity.angle += (prng.next() - 0.5) * 0.4;
      entity.vx = Math.cos(entity.angle) * 1.2 * speedMultiplier;
      entity.vy = Math.sin(entity.angle) * 1.2 * speedMultiplier;

      entity.x += entity.vx;
      entity.y += entity.vy;

      let bounced = false;

      if (entity.x < 0) {
        entity.x = 0;
        entity.angle = Math.PI - entity.angle;
        bounced = true;
      } else if (entity.x + entity.w > canvasWidth) {
        entity.x = canvasWidth - entity.w;
        entity.angle = Math.PI - entity.angle;
        bounced = true;
      }

      if (entity.y < 0) {
        entity.y = 0;
        entity.angle = -entity.angle;
        bounced = true;
      } else if (entity.y + entity.h > canvasHeight) {
        entity.y = canvasHeight - entity.h;
        entity.angle = -entity.angle;
        bounced = true;
      }

      if (bounced) {
        entity.vx = Math.cos(entity.angle) * 1.2 * speedMultiplier;
        entity.vy = Math.sin(entity.angle) * 1.2 * speedMultiplier;
      }
    }
  } else if (behavior === 'erratic') {
    for (let i = 0; i < len; i++) {
      const entity = entitiesById[i];
      entity.x = prng.next() * (canvasWidth - entity.w);
      entity.y = prng.next() * (canvasHeight - entity.h);
    }
  }
}

/**
 * Step 2: Broadphase
 * Identifies potential collision pairs by checking bounding box intersections (Sweep & Prune).
 * Sorts entities along the X-axis, then sweeps adjacent entities until their X coordinates no longer overlap.
 * Sorting and sweeping OOP objects requires dereferencing pointers to access `.x`, `.w`, `.y`, and `.h`, incurring memory indirection overhead.
 */
export function runBroadphase(
  entities: GameEntity[],
  sortMethod: SortMethod = SortMethod.Insertion,
  tempEntities?: GameEntity[]
): number {
  let pairCount = 0;
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    entities[i].contacts = [];
  }

  // 1. Sort entities based on chosen algorithm
  if (sortMethod === SortMethod.Insertion) {
    insertionSortOOP(entities);
  } else if (sortMethod === SortMethod.Quick) {
    quickSortOOP(entities, 0, len - 1);
  } else if (sortMethod === SortMethod.Merge && tempEntities) {
    mergeSortOOP(entities, tempEntities, 0, len - 1);
  } else if (sortMethod === SortMethod.Native) {
    entities.sort((a, b) => a.x - b.x);
  }

  // Sweep
  for (let i = 0; i < len; i++) {
    const a = entities[i];
    const aRight = a.x + a.w;
    for (let j = i + 1; j < len; j++) {
      const b = entities[j];
      if (b.x > aRight) break; // Prune: subsequent entities cannot overlap on X-axis

      if (a.y < b.y + b.h && a.y + a.h > b.y) {
        a.contacts.push(b);
        pairCount++;
      }
    }
  }
  return pairCount;
}

/**
 * Step 3: Narrowphase
 * Resolves exact circle-to-circle collisions and applies elastic bounce impulses.
 * For each candidate overlap from the broadphase, calculates exact Euclidean distance and updates velocity vectors.
 */
export function resolveCollisions(
  entities: GameEntity[],
  isColliding: Uint8Array,
  outPairs: Int32Array
): number {
  let collisionCount = 0;
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    const a = entities[i];
    const contacts = a.contacts;
    const contactsLen = contacts.length;

    for (let j = 0; j < contactsLen; j++) {
      const b = contacts[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = (a.w + b.w) / 2;

      if (distSq < minDist * minDist && distSq > 0.001) {
        isColliding[a.id] = 1;
        isColliding[b.id] = 1;

        if (collisionCount * 2 + 1 < outPairs.length) {
          outPairs[collisionCount * 2] = a.id;
          outPairs[collisionCount * 2 + 1] = b.id;
          collisionCount++;
        }

        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const massA = a.w * a.w;
        const massB = b.w * b.w;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
 
        if (velAlongNormal < 0) {
          const impulse = -(2 * velAlongNormal) / (1 / massA + 1 / massB);
          a.vx -= (impulse / massA) * nx;
          a.vy -= (impulse / massA) * ny;
          b.vx += (impulse / massB) * nx;
          b.vy += (impulse / massB) * ny;

          const speedA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
          if (speedA > ENTITY_MAX_SPEED) {
            a.vx = (a.vx / speedA) * ENTITY_MAX_SPEED;
            a.vy = (a.vy / speedA) * ENTITY_MAX_SPEED;
          }
          const speedB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          if (speedB > ENTITY_MAX_SPEED) {
            b.vx = (b.vx / speedB) * ENTITY_MAX_SPEED;
            b.vy = (b.vy / speedB) * ENTITY_MAX_SPEED;
          }

          a.angle = Math.atan2(a.vy, a.vx);
          b.angle = Math.atan2(b.vy, b.vx);
        }
      }
    }
  }
  return collisionCount;
}

/**
 * Simulator representing a traditional Object-Oriented Programming (OOP) model.
 * 
 * Data Layout: Array of Objects (AoS).
 * Each entity is an instance of `GameEntity` allocated on the heap.
 * The entities array is shuffled after creation to simulate memory fragmentation
 * and reference scattering (cache misses) common in long-running OOP games.
 * 
 * Algorithm: Sweep-and-Prune (S&P) using 1D Insertion Sort along the X-axis.
 */
export class OOPSimulator implements Simulator {
  private sortMethod: SortMethod;

  private entities: GameEntity[] = [];
  private entitiesById: GameEntity[] = [];
  private tempEntities: GameEntity[] = [];
  private times: number[] = [];
  private colliding = new Uint8Array(0);
  private pairsBuffer = new Int32Array(0);
  private maxCollisions = 200000;

  constructor(
    sortMethod: SortMethod = SortMethod.Insertion
  ) {
    this.sortMethod = sortMethod;
  }

  /**
   * Initializes the simulation. Shuffles the main entities list to simulate
   * reference scattering and memory fragmentation on the heap.
   */
  init(numEntities: number, width: number, height: number, prng: SeededPRNG) {
    this.entities = [];
    this.entitiesById = new Array(numEntities);
    for (let i = 0; i < numEntities; i++) {
      const entity = new GameEntity(i, width, height);
      this.entities.push(entity);
      this.entitiesById[i] = entity;
    }
    // Shuffle primary array to break sequential cache hits on memory traversals
    this.entities.sort(() => prng.next() - 0.5);
    this.tempEntities = new Array(numEntities);
    
    this.colliding = new Uint8Array(numEntities);
    this.pairsBuffer = new Int32Array(this.maxCollisions * 2);
  }

  /**
   * Executes a full simulation step, timing all operations:
   * 1. Movement updates (random walks or straight trajectories).
   * 2. Sweep-and-Prune broadphase (sorting along X axis and overlapping sweep).
   * 3. Narrowphase resolution (resolving circle bounces and updating velocities).
   * 
   * We time all three steps because memory lookup overhead affects both broadphase sorting
   * and narrowphase object access patterns.
   */
  update(width: number, height: number, speedMultiplier: number, behavior: string, prng: SeededPRNG): { time: number, collisionCount: number } {
    const start = performance.now();
    // Step 1: Update movements
    updateMovement(this.entitiesById, width, height, speedMultiplier, behavior, prng);
    // Step 2: Broadphase
    runBroadphase(this.entities, this.sortMethod, this.tempEntities);
    
    this.colliding.fill(0);
    // Step 3: Narrowphase
    const collisionCount = resolveCollisions(this.entities, this.colliding, this.pairsBuffer);
    
    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    return { time, collisionCount };
  }

  getRenderEntities(): RenderEntity[] {
    return this.entities;
  }

  getTimes() { return this.times; }
  clearTimes() { this.times = []; }

  /**
   * Extracts the current physics state of all entities.
   * Used for synchronizing state with other simulators.
   */
  getPositions(): EntityState[] {
    return this.entitiesById.map(e => ({
      x: e.x, y: e.y, w: e.w, h: e.h,
      vx: e.vx, vy: e.vy, angle: e.angle,
      color: e.color
    }));
  }

  /**
   * Overwrites entity states. Used to align starting conditions across simulators.
   */
  setPositions(positions: EntityState[]) {
    for (let i = 0; i < this.entitiesById.length; i++) {
      const e = this.entitiesById[i];
      const p = positions[i];
      e.x = p.x; e.y = p.y; e.w = p.w; e.h = p.h;
      e.vx = p.vx; e.vy = p.vy; e.angle = p.angle;
      e.color = p.color;
    }
  }
}

// Aliases for compatibility
export {
  updateMovement as updateOOPMovement,
  runBroadphase as runOOPBroadphase,
  resolveCollisions as resolveOOPPhysics
};

// === INTERNAL SORTING ALGORITHMS ===
function insertionSortRangeOOP(entities: GameEntity[], left: number, right: number) {
  for (let i = left + 1; i <= right; i++) {
    const current = entities[i];
    let j = i - 1;
    while (j >= left && entities[j].x > current.x) {
      entities[j + 1] = entities[j];
      j--;
    }
    entities[j + 1] = current;
  }
}

function insertionSortOOP(entities: GameEntity[]) {
  insertionSortRangeOOP(entities, 0, entities.length - 1);
}

function quickSortOOP(entities: GameEntity[], left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeOOP(entities, left, right);
    return;
  }
  const pivotIdx = partitionOOP(entities, left, right);
  quickSortOOP(entities, left, pivotIdx - 1);
  quickSortOOP(entities, pivotIdx + 1, right);
}

function partitionOOP(entities: GameEntity[], left: number, right: number): number {
  const mid = (left + right) >> 1;
  const tempMid = entities[mid];
  entities[mid] = entities[right];
  entities[right] = tempMid;

  const pivotVal = entities[right].x;
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (entities[j].x < pivotVal) {
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

function mergeSortOOP(entities: GameEntity[], temp: GameEntity[], left: number, right: number) {
  for (let i = 0; i < entities.length; i++) {
    temp[i] = entities[i];
  }
  mergeSortOOPRec(temp, entities, left, right);
}

function mergeSortOOPRec(src: GameEntity[], dst: GameEntity[], left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeOOP(dst, left, right);
    for (let m = left; m <= right; m++) {
      src[m] = dst[m];
    }
    return;
  }
  const mid = (left + right) >> 1;
  mergeSortOOPRec(dst, src, left, mid);
  mergeSortOOPRec(dst, src, mid + 1, right);
  
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (src[i].x <= src[j].x) {
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

