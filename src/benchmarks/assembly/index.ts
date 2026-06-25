const ENTITY_MAX_SPEED: f64 = 3.5;

class LCG {
  seed: u32;

  constructor(seed: u32 = 1) {
    this.seed = seed;
  }

  setSeed(seed: u32): void {
    this.seed = seed;
  }

  next(): f64 {
    this.seed = this.seed * 1664525 + 1013904223;
    return <f64>this.seed / 4294967296.0;
  }
}

let posX!: StaticArray<f64>;
let posYwh!: StaticArray<f64>; // Packed [posY, w, h] for each entity
let colorId!: StaticArray<u8>;
let angle!: StaticArray<f64>;
let vx!: StaticArray<f64>;
let vy!: StaticArray<f64>;
let indices!: StaticArray<i32>;
let id!: StaticArray<i32>;
let colliding!: StaticArray<u8>;
let pairsBuffer!: StaticArray<i32>;
let tempIndices!: StaticArray<i32>;

let prng: LCG = new LCG(1);

export function init(numEntities: i32, maxCollisions: i32): void {
  posX = new StaticArray<f64>(numEntities);
  posYwh = new StaticArray<f64>(numEntities * 3);
  colorId = new StaticArray<u8>(numEntities);
  angle = new StaticArray<f64>(numEntities);
  vx = new StaticArray<f64>(numEntities);
  vy = new StaticArray<f64>(numEntities);
  indices = new StaticArray<i32>(numEntities);
  id = new StaticArray<i32>(numEntities);
  colliding = new StaticArray<u8>(numEntities);
  pairsBuffer = new StaticArray<i32>(maxCollisions * 2);
  tempIndices = new StaticArray<i32>(numEntities);

  // Initialize indices and id arrays
  for (let i = 0; i < numEntities; i++) {
    unchecked(indices[i] = i);
    unchecked(id[i] = i);
  }
}

// Getters for pointers (in StaticArray, casting to usize yields the data pointer directly)
export function getPosXPtr(): usize { return changetype<usize>(posX); }
export function getPosYwhPtr(): usize { return changetype<usize>(posYwh); }
export function getColorIdPtr(): usize { return changetype<usize>(colorId); }
export function getAnglePtr(): usize { return changetype<usize>(angle); }
export function getVxPtr(): usize { return changetype<usize>(vx); }
export function getVyPtr(): usize { return changetype<usize>(vy); }
export function getIndicesPtr(): usize { return changetype<usize>(indices); }
export function getIdPtr(): usize { return changetype<usize>(id); }
export function getCollidingPtr(): usize { return changetype<usize>(colliding); }
export function getPairsBufferPtr(): usize { return changetype<usize>(pairsBuffer); }

/**
 * Step 1: Update movements
 * - Updates entity positions and handles boundary bounces in bare-metal
 *   WebAssembly memory.
 * - StaticArray component stores (`posX`, `posYwh`, `vx`, `vy`) ensure strict
 *   contiguous memory layout without runtime GC pauses.
 */
export function updateMovement(
  width: f64,
  height: f64,
  speedMultiplier: f64,
  behavior: i32,
  seed: u32
): void {
  prng.setSeed(seed);
  const localPosX = posX;
  const localPosYwh = posYwh;
  const localVx = vx;
  const localVy = vy;
  const localAngle = angle;
  const len = localPosX.length;

  if (behavior == 1) { // wander
    for (let i = 0; i < len; i++) {
      let currentAngle = unchecked(localAngle[i]);
      currentAngle += (prng.next() - 0.5) * 0.4;
      unchecked(localAngle[i] = currentAngle);

      let currentVx = Math.cos(currentAngle) * 1.2 * speedMultiplier;
      let currentVy = Math.sin(currentAngle) * 1.2 * speedMultiplier;
      unchecked(localVx[i] = currentVx);
      unchecked(localVy[i] = currentVy);

      let px = unchecked(localPosX[i]) + currentVx;
      let py = unchecked(localPosYwh[i * 3 + 0]) + currentVy;

      let bounced = false;
      const w = unchecked(localPosYwh[i * 3 + 1]);
      const h = unchecked(localPosYwh[i * 3 + 2]);

      if (px < 0.0) {
        px = 0.0;
        currentAngle = Math.PI - currentAngle;
        bounced = true;
      } else if (px + w > width) {
        px = width - w;
        currentAngle = Math.PI - currentAngle;
        bounced = true;
      }

      if (py < 0.0) {
        py = 0.0;
        currentAngle = -currentAngle;
        bounced = true;
      } else if (py + h > height) {
        py = height - h;
        currentAngle = -currentAngle;
        bounced = true;
      }

      unchecked(localPosX[i] = px);
      unchecked(localPosYwh[i * 3 + 0] = py);

      if (bounced) {
        unchecked(localAngle[i] = currentAngle);
        unchecked(localVx[i] = Math.cos(currentAngle) * 1.2 * speedMultiplier);
        unchecked(localVy[i] = Math.sin(currentAngle) * 1.2 * speedMultiplier);
      }
    }
  } else if (behavior == 2) { // erratic
    for (let i = 0; i < len; i++) {
      const w = unchecked(localPosYwh[i * 3 + 1]);
      const h = unchecked(localPosYwh[i * 3 + 2]);
      unchecked(localPosX[i] = prng.next() * (width - w));
      unchecked(localPosYwh[i * 3 + 0] = prng.next() * (height - h));
    }
  }
}

/**
 * Step 2a: Broadphase (Sweep & Prune Sort)
 * - Sorts 1D entity indices along the X-axis.
 * - Supports Insertion Sort (optimal for smooth wandering motion), Quicksort,
 *   and zero-copy Merge Sort.
 * - Merge Sort is recommended as the engine default because it guarantees
 *   consistent O(N log N) performance during chaotic or erratic motion,
 *   preventing O(N^2) quadratic meltdowns.
 */
export function runBroadphaseSort(sortType: i32): void {
  const localIndices = indices;
  const localPosX = posX;
  const len = localPosX.length;
  
  if (sortType == 0) { // insertion
    for (let i = 1; i < len; i++) {
      const currIdx = unchecked(localIndices[i]);
      const currX = unchecked(localPosX[currIdx]);
      let j = i - 1;
      while (j >= 0) {
        const prevIdx = unchecked(localIndices[j]);
        if (unchecked(localPosX[prevIdx]) <= currX) break;
        unchecked(localIndices[j + 1] = prevIdx);
        j--;
      }
      unchecked(localIndices[j + 1] = currIdx);
    }
  } else if (sortType == 1) { // quick
    quickSort(0, len - 1);
  } else if (sortType == 2) { // merge
    for (let i = 0; i < len; i++) {
      unchecked(tempIndices[i] = indices[i]);
    }
    mergeSortPingPongRec(tempIndices, indices, 0, len - 1);
  }
}

/**
 * Step 2b: Broadphase (Sweep & Prune Sweep)
 * - Sweeps adjacent sorted entities to find overlapping bounding boxes on X and
 *   Y axes.
 * - Streaming contiguous memory sequentially maximizes CPU L1 cache line
 *   utilization.
 */
export function runBroadphaseSweep(): i32 {
  const localIndices = indices;
  const localPosX = posX;
  const localPosYwh = posYwh;
  const localId = id;
  const localPairsBuffer = pairsBuffer;

  const len = localPosX.length;
  let pairCount = 0;
  const maxPairs = localPairsBuffer.length / 2;

  // Sweep
  for (let i = 0; i < len; i++) {
    const aIdx = unchecked(localIndices[i]);
    const ax = unchecked(localPosX[aIdx]);
    const aRight = ax + unchecked(localPosYwh[aIdx * 3 + 1]);
    const ay = unchecked(localPosYwh[aIdx * 3 + 0]);
    const ah = unchecked(localPosYwh[aIdx * 3 + 2]);

    for (let j = i + 1; j < len; j++) {
      const bIdx = unchecked(localIndices[j]);
      const bx = unchecked(localPosX[bIdx]);
      if (bx > aRight) break;

      const by = unchecked(localPosYwh[bIdx * 3 + 0]);
      const bh = unchecked(localPosYwh[bIdx * 3 + 2]);

      if (ay < by + bh && ay + ah > by) {
        if (pairCount < maxPairs) {
          unchecked(localPairsBuffer[pairCount * 2] = unchecked(localId[aIdx]));
          unchecked(localPairsBuffer[pairCount * 2 + 1] = unchecked(localId[bIdx]));
          pairCount++;
        }
      }
    }
  }

  return pairCount;
}


/**
 * Step 3: Narrowphase (Physics Solver)
 * - Resolves exact circle-to-circle collisions and applies elastic bounce
 *   impulses.
 * - Accesses component data directly by entity ID index in bare-metal
 *   StaticArray memory.
 */
export function resolvePhysics(pairCount: i32): i32 {
  const localPosX = posX;
  const localPosYwh = posYwh;
  const localVx = vx;
  const localVy = vy;
  const localAngle = angle;
  const localColliding = colliding;
  const localPairsBuffer = pairsBuffer;

  const len = localPosX.length;
  let collisionCount = 0;
  for (let i = 0; i < len; i++) {
    unchecked(localColliding[i] = 0);
  }

  for (let i = 0; i < pairCount; i++) {
    const idA = unchecked(localPairsBuffer[i * 2]);
    const idB = unchecked(localPairsBuffer[i * 2 + 1]);

    const dx = unchecked(localPosX[idB]) - unchecked(localPosX[idA]);
    const dy = unchecked(localPosYwh[idB * 3 + 0]) - unchecked(localPosYwh[idA * 3 + 0]);
    const distSq = dx * dx + dy * dy;
    const minDist = (unchecked(localPosYwh[idA * 3 + 1]) + unchecked(localPosYwh[idB * 3 + 1])) / 2.0;

    if (distSq < minDist * minDist && distSq > 0.001) {
      unchecked(localColliding[idA] = 1);
      unchecked(localColliding[idB] = 1);

      unchecked(localPairsBuffer[collisionCount * 2] = idA);
      unchecked(localPairsBuffer[collisionCount * 2 + 1] = idB);
      collisionCount++;

      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      unchecked(localPosX[idA] = unchecked(localPosX[idA]) - nx * overlap * 0.5);
      unchecked(localPosYwh[idA * 3 + 0] = unchecked(localPosYwh[idA * 3 + 0]) - ny * overlap * 0.5);
      unchecked(localPosX[idB] = unchecked(localPosX[idB]) + nx * overlap * 0.5);
      unchecked(localPosYwh[idB * 3 + 0] = unchecked(localPosYwh[idB * 3 + 0]) + ny * overlap * 0.5);

      const wA = unchecked(localPosYwh[idA * 3 + 1]);
      const wB = unchecked(localPosYwh[idB * 3 + 1]);
      const massA = wA * wA;
      const massB = wB * wB;
      const rvx = unchecked(localVx[idB]) - unchecked(localVx[idA]);
      const rvy = unchecked(localVy[idB]) - unchecked(localVy[idA]);
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0.0) {
        const impulse = -(2.0 * velAlongNormal) / (1.0 / massA + 1.0 / massB);
        let vax = unchecked(localVx[idA]) - (impulse / massA) * nx;
        let vay = unchecked(localVy[idA]) - (impulse / massA) * ny;
        let vbx = unchecked(localVx[idB]) + (impulse / massB) * nx;
        let vby = unchecked(localVy[idB]) + (impulse / massB) * ny;

        const speedA = Math.sqrt(vax * vax + vay * vay);
        if (speedA > ENTITY_MAX_SPEED) {
          vax = (vax / speedA) * ENTITY_MAX_SPEED;
          vay = (vay / speedA) * ENTITY_MAX_SPEED;
        }
        const speedB = Math.sqrt(vbx * vbx + vby * vby);
        if (speedB > ENTITY_MAX_SPEED) {
          vbx = (vbx / speedB) * ENTITY_MAX_SPEED;
          vby = (vby / speedB) * ENTITY_MAX_SPEED;
        }

        unchecked(localVx[idA] = vax);
        unchecked(localVy[idA] = vay);
        unchecked(localVx[idB] = vbx);
        unchecked(localVy[idB] = vby);

        unchecked(localAngle[idA] = Math.atan2(vay, vax));
        unchecked(localAngle[idB] = Math.atan2(vby, vbx));
      }
    }
  }

  return collisionCount;
}

// Main update function calling individual phases
export function update(
  width: f64,
  height: f64,
  speedMultiplier: f64,
  behavior: i32,
  seed: u32,
  sortType: i32,
): i32 {
  // Step 1: Update movements
  updateMovement(width, height, speedMultiplier, behavior, seed);
  // Step 2a: Broadphase (sort)
  runBroadphaseSort(sortType);
  // Step 2b: Broadphase (sweep)
  const pairCount = runBroadphaseSweep();
  // Step 3: Narrowphase
  return resolvePhysics(pairCount);
}

// Insertion Sort range helper
function insertionSortRange(arr: StaticArray<i32>, left: i32, right: i32): void {
  const localPosX = posX;
  for (let i = left + 1; i <= right; i++) {
    const currIdx = unchecked(arr[i]);
    const currX = unchecked(localPosX[currIdx]);
    let j = i - 1;
    while (j >= left) {
      const prevIdx = unchecked(arr[j]);
      if (unchecked(localPosX[prevIdx]) <= currX) break;
      unchecked(arr[j + 1] = prevIdx);
      j--;
    }
    unchecked(arr[j + 1] = currIdx);
  }
}

// Quick Sort
function quickSort(left: i32, right: i32): void {
  if (right - left < 12) {
    insertionSortRange(indices, left, right);
    return;
  }
  const pivotIdx = partition(left, right);
  quickSort(left, pivotIdx - 1);
  quickSort(pivotIdx + 1, right);
}

function partition(left: i32, right: i32): i32 {
  const mid = (left + right) >> 1;
  const tempMid = unchecked(indices[mid]);
  unchecked(indices[mid] = indices[right]);
  unchecked(indices[right] = tempMid);

  const pivotVal = unchecked(posX[indices[right]]);
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (unchecked(posX[indices[j]]) < pivotVal) {
      i++;
      const temp = unchecked(indices[i]);
      unchecked(indices[i] = indices[j]);
      unchecked(indices[j] = temp);
    }
  }
  const temp = unchecked(indices[i + 1]);
  unchecked(indices[i + 1] = indices[right]);
  unchecked(indices[right] = temp);
  return i + 1;
}

// Merge Sort (Ping-Pong / Double-Buffering)
function mergeSortPingPongRec(src: StaticArray<i32>, dst: StaticArray<i32>, left: i32, right: i32): void {
  if (right - left < 12) {
    insertionSortRange(dst, left, right);
    for (let m = left; m <= right; m++) {
      unchecked(src[m] = dst[m]);
    }
    return;
  }
  
  const mid = (left + right) >> 1;
  mergeSortPingPongRec(dst, src, left, mid);
  mergeSortPingPongRec(dst, src, mid + 1, right);
  
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    const idxI = unchecked(src[i]);
    const idxJ = unchecked(src[j]);
    if (unchecked(posX[idxI]) <= unchecked(posX[idxJ])) {
      unchecked(dst[k++] = idxI);
      i++;
    } else {
      unchecked(dst[k++] = idxJ);
      j++;
    }
  }

  while (i <= mid) {
    unchecked(dst[k++] = unchecked(src[i++]));
  }
  while (j <= right) {
    unchecked(dst[k++] = unchecked(src[j++]));
  }
}
