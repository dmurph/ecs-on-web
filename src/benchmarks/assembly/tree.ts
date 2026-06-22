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

function maxI32(a: i32, b: i32): i32 {
  return a > b ? a : b;
}

// Rebalancing parameters mirroring src/config.ts
const TREE_REBALANCE_FRAME_INTERVAL: i32 = 8;
const TREE_REBALANCE_PERCENTAGE: f64 = 0.001; // 0.1%

let movedFrameCount: i32 = 0;
let posX!: StaticArray<f64>;
let posYwh!: StaticArray<f64>; // Packed [posY, w, h]
let colorId!: StaticArray<u8>;
let angle!: StaticArray<f64>;
let vx!: StaticArray<f64>;
let vy!: StaticArray<f64>;
let indices!: StaticArray<i32>;
let id!: StaticArray<i32>;
let colliding!: StaticArray<u8>;
let pairsBuffer!: StaticArray<i32>;
let entityLeaf!: StaticArray<i32>;
let moveBuffer!: StaticArray<i32>;

// Tree structure arrays
let treeMinX!: StaticArray<f64>;
let treeMinY!: StaticArray<f64>;
let treeMaxX!: StaticArray<f64>;
let treeMaxY!: StaticArray<f64>;
let treeParent!: StaticArray<i32>;
let treeLeft!: StaticArray<i32>;
let treeRight!: StaticArray<i32>;
let treeHeight!: StaticArray<i32>;
let treeEntity!: StaticArray<i32>;

let stackA!: StaticArray<i32>;
let stackB!: StaticArray<i32>;
let mainStack!: StaticArray<i32>;

let treeRoot: i32 = -1;
let freeHead: i32 = 0;
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
  entityLeaf = new StaticArray<i32>(numEntities);
  moveBuffer = new StaticArray<i32>(numEntities);

  const maxNodes = numEntities * 2 + 32;
  treeMinX = new StaticArray<f64>(maxNodes);
  treeMinY = new StaticArray<f64>(maxNodes);
  treeMaxX = new StaticArray<f64>(maxNodes);
  treeMaxY = new StaticArray<f64>(maxNodes);
  treeParent = new StaticArray<i32>(maxNodes);
  treeLeft = new StaticArray<i32>(maxNodes);
  treeRight = new StaticArray<i32>(maxNodes);
  treeHeight = new StaticArray<i32>(maxNodes);
  treeEntity = new StaticArray<i32>(maxNodes);

  stackA = new StaticArray<i32>(16384);
  stackB = new StaticArray<i32>(16384);
  mainStack = new StaticArray<i32>(16384);

  for (let i = 0; i < numEntities; i++) {
    unchecked(indices[i] = i);
    unchecked(id[i] = i);
    unchecked(entityLeaf[i] = -1);
  }

  movedFrameCount = 0;
  resetTreeStructure(numEntities);
  buildInitialTree(numEntities);
}

export function rebuildTree(numEntities: i32): void {
  resetTreeStructure(numEntities);
  buildInitialTree(numEntities);
}

function resetTreeStructure(numEntities: i32): void {
  const maxNodes = numEntities * 2 + 32;
  treeRoot = -1;
  freeHead = 0;

  for (let i = 0; i < maxNodes; i++) {
    unchecked(treeParent[i] = -1);
    unchecked(treeLeft[i] = i + 1);
    unchecked(treeRight[i] = -1);
    unchecked(treeHeight[i] = 0);
    unchecked(treeEntity[i] = -1);
  }
  unchecked(treeLeft[maxNodes - 1] = -1);
}

function allocateNode(x0: f64, y0: f64, x1: f64, y1: f64): i32 {
  if (freeHead == -1) return -1;
  const idx = freeHead;
  freeHead = unchecked(treeLeft[idx]);

  unchecked(treeMinX[idx] = x0);
  unchecked(treeMinY[idx] = y0);
  unchecked(treeMaxX[idx] = x1);
  unchecked(treeMaxY[idx] = y1);
  unchecked(treeParent[idx] = -1);
  unchecked(treeLeft[idx] = -1);
  unchecked(treeRight[idx] = -1);
  unchecked(treeHeight[idx] = 0);
  unchecked(treeEntity[idx] = -1);
  return idx;
}

function freeNode(idx: i32): void {
  unchecked(treeParent[idx] = -1);
  unchecked(treeRight[idx] = -1);
  unchecked(treeEntity[idx] = -1);
  unchecked(treeHeight[idx] = 0);

  unchecked(treeLeft[idx] = freeHead);
  freeHead = idx;
}

function refitAABB(idx: i32): void {
  const l = unchecked(treeLeft[idx]);
  const r = unchecked(treeRight[idx]);
  unchecked(treeMinX[idx] = Math.min(unchecked(treeMinX[l]), unchecked(treeMinX[r])));
  unchecked(treeMinY[idx] = Math.min(unchecked(treeMinY[l]), unchecked(treeMinY[r])));
  unchecked(treeMaxX[idx] = Math.max(unchecked(treeMaxX[l]), unchecked(treeMaxX[r])));
  unchecked(treeMaxY[idx] = Math.max(unchecked(treeMaxY[l]), unchecked(treeMaxY[r])));
}

function balanceFlat(i: i32): i32 {
  if (unchecked(treeLeft[i]) == -1 || unchecked(treeHeight[i]) < 2) return i;

  const left = unchecked(treeLeft[i]);
  const right = unchecked(treeRight[i]);
  const balanceFactor = unchecked(treeHeight[right]) - unchecked(treeHeight[left]);

  if (balanceFactor > 1) {
    const rightLeft = unchecked(treeLeft[right]);
    const rightRight = unchecked(treeRight[right]);

    unchecked(treeLeft[right] = i);
    unchecked(treeParent[right] = unchecked(treeParent[i]));
    unchecked(treeParent[i] = right);

    if (unchecked(treeParent[right]) != -1) {
      const p = unchecked(treeParent[right]);
      if (unchecked(treeLeft[p]) == i) unchecked(treeLeft[p] = right);
      else unchecked(treeRight[p] = right);
    } else {
      treeRoot = right;
    }

    if (unchecked(treeHeight[rightLeft]) > unchecked(treeHeight[rightRight])) {
      unchecked(treeRight[right] = rightLeft);
      unchecked(treeRight[i] = rightRight);
      unchecked(treeParent[rightRight] = i);
      refitAABB(i);
      refitAABB(right);
      unchecked(treeHeight[i] = 1 + maxI32(unchecked(treeHeight[treeLeft[i]]), unchecked(treeHeight[treeRight[i]])));
      unchecked(treeHeight[right] = 1 + maxI32(unchecked(treeHeight[treeLeft[right]]), unchecked(treeHeight[treeRight[right]])));
    } else {
      unchecked(treeRight[right] = rightRight);
      unchecked(treeRight[i] = rightLeft);
      unchecked(treeParent[rightLeft] = i);
      refitAABB(i);
      refitAABB(right);
      unchecked(treeHeight[i] = 1 + maxI32(unchecked(treeHeight[treeLeft[i]]), unchecked(treeHeight[treeRight[i]])));
      unchecked(treeHeight[right] = 1 + maxI32(unchecked(treeHeight[treeLeft[right]]), unchecked(treeHeight[treeRight[right]])));
    }
    return right;
  }

  if (balanceFactor < -1) {
    const leftLeft = unchecked(treeLeft[left]);
    const leftRight = unchecked(treeRight[left]);

    unchecked(treeRight[left] = i);
    unchecked(treeParent[left] = unchecked(treeParent[i]));
    unchecked(treeParent[i] = left);

    if (unchecked(treeParent[left]) != -1) {
      const p = unchecked(treeParent[left]);
      if (unchecked(treeLeft[p]) == i) unchecked(treeLeft[p] = left);
      else unchecked(treeRight[p] = left);
    } else {
      treeRoot = left;
    }

    if (unchecked(treeHeight[leftLeft]) > unchecked(treeHeight[leftRight])) {
      unchecked(treeLeft[left] = leftLeft);
      unchecked(treeLeft[i] = leftRight);
      unchecked(treeParent[leftRight] = i);
      refitAABB(i);
      refitAABB(left);
      unchecked(treeHeight[i] = 1 + maxI32(unchecked(treeHeight[treeLeft[i]]), unchecked(treeHeight[treeRight[i]])));
      unchecked(treeHeight[left] = 1 + maxI32(unchecked(treeHeight[treeLeft[left]]), unchecked(treeHeight[treeRight[left]])));
    } else {
      unchecked(treeLeft[left] = leftRight);
      unchecked(treeLeft[i] = leftLeft);
      unchecked(treeParent[leftLeft] = i);
      refitAABB(i);
      refitAABB(left);
      unchecked(treeHeight[i] = 1 + maxI32(unchecked(treeHeight[treeLeft[i]]), unchecked(treeHeight[treeRight[i]])));
      unchecked(treeHeight[left] = 1 + maxI32(unchecked(treeHeight[treeLeft[left]]), unchecked(treeHeight[treeRight[left]])));
    }
    return left;
  }

  return i;
}

function insertLeaf(leaf: i32): void {
  if (treeRoot == -1) {
    treeRoot = leaf;
    unchecked(treeParent[leaf] = -1);
    return;
  }

  const leafMinX = unchecked(treeMinX[leaf]);
  const leafMinY = unchecked(treeMinY[leaf]);
  const leafMaxX = unchecked(treeMaxX[leaf]);
  const leafMaxY = unchecked(treeMaxY[leaf]);

  let index = treeRoot;
  while (unchecked(treeLeft[index]) != -1) {
    const l = unchecked(treeLeft[index]);
    const r = unchecked(treeRight[index]);

    const area = (unchecked(treeMaxX[index]) - unchecked(treeMinX[index])) * (unchecked(treeMaxY[index]) - unchecked(treeMinY[index]));
    const cx0 = Math.min(unchecked(treeMinX[index]), leafMinX);
    const cy0 = Math.min(unchecked(treeMinY[index]), leafMinY);
    const cx1 = Math.max(unchecked(treeMaxX[index]), leafMaxX);
    const cy1 = Math.max(unchecked(treeMaxY[index]), leafMaxY);
    const combinedArea = (cx1 - cx0) * (cy1 - cy0);

    const cost = 2.0 * combinedArea;
    const inheritanceCost = 2.0 * (combinedArea - area);

    let costLeft: f64 = 0;
    const lw = unchecked(treeMaxX[l]) - unchecked(treeMinX[l]);
    const lh = unchecked(treeMaxY[l]) - unchecked(treeMinY[l]);
    const lArea = lw * lh;
    const lcx0 = Math.min(unchecked(treeMinX[l]), leafMinX);
    const lcy0 = Math.min(unchecked(treeMinY[l]), leafMinY);
    const lcx1 = Math.max(unchecked(treeMaxX[l]), leafMaxX);
    const lcy1 = Math.max(unchecked(treeMaxY[l]), leafMaxY);
    const lCombinedArea = (lcx1 - lcx0) * (lcy1 - lcy0);

    if (unchecked(treeLeft[l]) == -1) costLeft = lCombinedArea + inheritanceCost;
    else costLeft = (lCombinedArea - lArea) + inheritanceCost;

    let costRight: f64 = 0;
    const rw = unchecked(treeMaxX[r]) - unchecked(treeMinX[r]);
    const rh = unchecked(treeMaxY[r]) - unchecked(treeMinY[r]);
    const rArea = rw * rh;
    const rcx0 = Math.min(unchecked(treeMinX[r]), leafMinX);
    const rcy0 = Math.min(unchecked(treeMinY[r]), leafMinY);
    const rcx1 = Math.max(unchecked(treeMaxX[r]), leafMaxX);
    const rcy1 = Math.max(unchecked(treeMaxY[r]), leafMaxY);
    const rCombinedArea = (rcx1 - rcx0) * (rcy1 - rcy0);

    if (unchecked(treeLeft[r]) == -1) costRight = rCombinedArea + inheritanceCost;
    else costRight = (rCombinedArea - rArea) + inheritanceCost;

    if (cost < costLeft && cost < costRight) break;

    if (costLeft < costRight) index = l;
    else index = r;
  }

  const sibling = index;
  const oldParent = unchecked(treeParent[sibling]);
  const newParent = allocateNode(
    Math.min(unchecked(treeMinX[sibling]), leafMinX),
    Math.min(unchecked(treeMinY[sibling]), leafMinY),
    Math.max(unchecked(treeMaxX[sibling]), leafMaxX),
    Math.max(unchecked(treeMaxY[sibling]), leafMaxY)
  );

  unchecked(treeParent[newParent] = oldParent);
  unchecked(treeHeight[newParent] = unchecked(treeHeight[sibling]) + 1);

  if (oldParent != -1) {
    if (unchecked(treeLeft[oldParent]) == sibling) unchecked(treeLeft[oldParent] = newParent);
    else unchecked(treeRight[oldParent] = newParent);

    unchecked(treeLeft[newParent] = sibling);
    unchecked(treeRight[newParent] = leaf);
    unchecked(treeParent[sibling] = newParent);
    unchecked(treeParent[leaf] = newParent);
  } else {
    unchecked(treeLeft[newParent] = sibling);
    unchecked(treeRight[newParent] = leaf);
    unchecked(treeParent[sibling] = newParent);
    unchecked(treeParent[leaf] = newParent);
    treeRoot = newParent;
  }

  let node = unchecked(treeParent[leaf]);
  while (node != -1) {
    node = balanceFlat(node);
    refitAABB(node);
    unchecked(treeHeight[node] = 1 + maxI32(unchecked(treeHeight[treeLeft[node]]), unchecked(treeHeight[treeRight[node]])));
    node = unchecked(treeParent[node]);
  }
}

function removeLeaf(leaf: i32): void {
  if (leaf == treeRoot) {
    treeRoot = -1;
    return;
  }

  const parent = unchecked(treeParent[leaf]);
  const grandparent = unchecked(treeParent[parent]);
  const sibling = (unchecked(treeLeft[parent]) == leaf) ? unchecked(treeRight[parent]) : unchecked(treeLeft[parent]);

  if (grandparent != -1) {
    if (unchecked(treeLeft[grandparent]) == parent) unchecked(treeLeft[grandparent] = sibling);
    else unchecked(treeRight[grandparent] = sibling);
    unchecked(treeParent[sibling] = grandparent);
    freeNode(parent);

    let node = grandparent;
    while (node != -1) {
      node = balanceFlat(node);
      refitAABB(node);
      unchecked(treeHeight[node] = 1 + maxI32(unchecked(treeHeight[treeLeft[node]]), unchecked(treeHeight[treeRight[node]])));
      node = unchecked(treeParent[node]);
    }
  } else {
    treeRoot = sibling;
    unchecked(treeParent[sibling] = -1);
    freeNode(parent);
  }
}

function buildInitialTree(numEntities: i32): void {
  const margin: f64 = 2.0;
  for (let i = 0; i < numEntities; i++) {
    const ax = unchecked(posX[i]);
    const ay = unchecked(posYwh[i * 3 + 0]);
    const aw = unchecked(posYwh[i * 3 + 1]);
    const ah = unchecked(posYwh[i * 3 + 2]);

    const leaf = allocateNode(ax - margin, ay - margin, ax + aw + margin, ay + ah + margin);
    unchecked(treeEntity[leaf] = i);
    unchecked(entityLeaf[i] = leaf);
    insertLeaf(leaf);
  }
}

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

function updateMovementTree(width: f64, height: f64, speedMultiplier: f64, behavior: i32, seed: u32): i32 {
  prng.setSeed(seed);
  const len = posX.length;
  let moveCount = 0;

  if (behavior == 1) { // wander
    for (let i = 0; i < len; i++) {
      let currentAngle = unchecked(angle[i]);
      currentAngle += (prng.next() - 0.5) * 0.4;
      unchecked(angle[i] = currentAngle);

      let currentVx = Math.cos(currentAngle) * 1.2 * speedMultiplier;
      let currentVy = Math.sin(currentAngle) * 1.2 * speedMultiplier;
      unchecked(vx[i] = currentVx);
      unchecked(vy[i] = currentVy);

      let px = unchecked(posX[i]) + currentVx;
      let py = unchecked(posYwh[i * 3 + 0]) + currentVy;
      const w = unchecked(posYwh[i * 3 + 1]);
      const h = unchecked(posYwh[i * 3 + 2]);

      let bounced = false;
      if (px < 0.0) { px = 0.0; currentAngle = Math.PI - currentAngle; bounced = true; }
      else if (px + w > width) { px = width - w; currentAngle = Math.PI - currentAngle; bounced = true; }

      if (py < 0.0) { py = 0.0; currentAngle = -currentAngle; bounced = true; }
      else if (py + h > height) { py = height - h; currentAngle = -currentAngle; bounced = true; }

      if (bounced) {
        unchecked(angle[i] = currentAngle);
        unchecked(vx[i] = Math.cos(currentAngle) * 1.2 * speedMultiplier);
        unchecked(vy[i] = Math.sin(currentAngle) * 1.2 * speedMultiplier);
      }

      unchecked(posX[i] = px);
      unchecked(posYwh[i * 3 + 0] = py);

      const leaf = unchecked(entityLeaf[i]);
      if (leaf != -1) {
        if (px < unchecked(treeMinX[leaf]) || px + w > unchecked(treeMaxX[leaf]) ||
            py < unchecked(treeMinY[leaf]) || py + h > unchecked(treeMaxY[leaf])) {
          unchecked(moveBuffer[moveCount++] = i);
        }
      }
    }
  } else if (behavior == 2) { // erratic
    for (let i = 0; i < len; i++) {
      const w = unchecked(posYwh[i * 3 + 1]);
      const h = unchecked(posYwh[i * 3 + 2]);
      let px = prng.next() * (width - w);
      let py = prng.next() * (height - h);
      unchecked(posX[i] = px);
      unchecked(posYwh[i * 3 + 0] = py);

      const leaf = unchecked(entityLeaf[i]);
      if (leaf != -1) {
        if (px < unchecked(treeMinX[leaf]) || px + w > unchecked(treeMaxX[leaf]) ||
            py < unchecked(treeMinY[leaf]) || py + h > unchecked(treeMaxY[leaf])) {
          unchecked(moveBuffer[moveCount++] = i);
        }
      }
    }
  }
  return moveCount;
}

function updateDirtyLeaves(moveCount: i32): void {
  const margin: f64 = 2.0;
  for (let k = 0; k < moveCount; k++) {
    const entityId = unchecked(moveBuffer[k]);
    const leaf = unchecked(entityLeaf[entityId]);

    removeLeaf(leaf);

    const ax = unchecked(posX[entityId]);
    const ay = unchecked(posYwh[entityId * 3 + 0]);
    const aw = unchecked(posYwh[entityId * 3 + 1]);
    const ah = unchecked(posYwh[entityId * 3 + 2]);

    unchecked(treeMinX[leaf] = ax - margin);
    unchecked(treeMinY[leaf] = ay - margin);
    unchecked(treeMaxX[leaf] = ax + aw + margin);
    unchecked(treeMaxY[leaf] = ay + ah + margin);

    insertLeaf(leaf);
  }

  if (moveCount > 0) {
    movedFrameCount++;
  }

  // Global tree optimization based on configuration intervals
  if (moveCount > 0 && movedFrameCount % TREE_REBALANCE_FRAME_INTERVAL == 0) {
    const len = posX.length;
    const numToOptimize = maxI32(1, <i32>Math.floor(<f64>len * TREE_REBALANCE_PERCENTAGE));
    for (let k = 0; k < numToOptimize; k++) {
      const idx = <i32>Math.floor(prng.next() * <f64>len);
      const leaf = unchecked(entityLeaf[idx]);
      if (leaf != -1) {
        removeLeaf(leaf);
        insertLeaf(leaf);
      }
    }
  }
}

function runBroadphaseTree(): i32 {
  if (treeRoot == -1 || unchecked(treeLeft[treeRoot]) == -1) return 0;

  let pairCount = 0;
  const maxPairs = pairsBuffer.length / 2;

  let stackPtr = 0;
  unchecked(mainStack[0] = treeRoot);
  stackPtr = 1;

  while (stackPtr > 0) {
    stackPtr--;
    const node = unchecked(mainStack[stackPtr]);

    let qPtr = 0;
    unchecked(stackA[0] = unchecked(treeLeft[node]));
    unchecked(stackB[0] = unchecked(treeRight[node]));
    qPtr = 1;

    while (qPtr > 0) {
      qPtr--;
      const nA = unchecked(stackA[qPtr]);
      const nB = unchecked(stackB[qPtr]);

      if (unchecked(treeMinX[nA]) <= unchecked(treeMaxX[nB]) && unchecked(treeMaxX[nA]) >= unchecked(treeMinX[nB]) &&
          unchecked(treeMinY[nA]) <= unchecked(treeMaxY[nB]) && unchecked(treeMaxY[nA]) >= unchecked(treeMinY[nB])) {
        
        const isLeafA = unchecked(treeLeft[nA]) == -1;
        const isLeafB = unchecked(treeLeft[nB]) == -1;

        if (isLeafA && isLeafB) {
          const eA = unchecked(treeEntity[nA]);
          const eB = unchecked(treeEntity[nB]);

          const ax = unchecked(posX[eA]);
          const ay = unchecked(posYwh[eA * 3 + 0]);
          const aw = unchecked(posYwh[eA * 3 + 1]);
          const ah = unchecked(posYwh[eA * 3 + 2]);

          const bx = unchecked(posX[eB]);
          const by = unchecked(posYwh[eB * 3 + 0]);
          const bw = unchecked(posYwh[eB * 3 + 1]);
          const bh = unchecked(posYwh[eB * 3 + 2]);

          if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) {
            if (pairCount < maxPairs) {
              unchecked(pairsBuffer[pairCount * 2] = eA);
              unchecked(pairsBuffer[pairCount * 2 + 1] = eB);
              pairCount++;
            }
          }
        } else if (isLeafA) {
          unchecked(stackA[qPtr] = nA);
          unchecked(stackB[qPtr] = unchecked(treeLeft[nB]));
          unchecked(stackA[qPtr + 1] = nA);
          unchecked(stackB[qPtr + 1] = unchecked(treeRight[nB]));
          qPtr += 2;
        } else if (isLeafB) {
          unchecked(stackA[qPtr] = unchecked(treeLeft[nA]));
          unchecked(stackB[qPtr] = nB);
          unchecked(stackA[qPtr + 1] = unchecked(treeRight[nA]));
          unchecked(stackB[qPtr + 1] = nB);
          qPtr += 2;
        } else {
          if (unchecked(treeHeight[nA]) > unchecked(treeHeight[nB])) {
            unchecked(stackA[qPtr] = unchecked(treeLeft[nA]));
            unchecked(stackB[qPtr] = nB);
            unchecked(stackA[qPtr + 1] = unchecked(treeRight[nA]));
            unchecked(stackB[qPtr + 1] = nB);
          } else {
            unchecked(stackA[qPtr] = nA);
            unchecked(stackB[qPtr] = unchecked(treeLeft[nB]));
            unchecked(stackA[qPtr + 1] = nA);
            unchecked(stackB[qPtr + 1] = unchecked(treeRight[nB]));
          }
          qPtr += 2;
        }
      }
    }

    const lChild = unchecked(treeLeft[node]);
    const rChild = unchecked(treeRight[node]);

    if (unchecked(treeLeft[lChild]) != -1) {
      unchecked(mainStack[stackPtr++] = lChild);
    }
    if (unchecked(treeLeft[rChild]) != -1) {
      unchecked(mainStack[stackPtr++] = rChild);
    }
  }

  return pairCount;
}

function resolvePhysics(pairCount: i32): i32 {
  const len = posX.length;
  let collisionCount = 0;
  for (let i = 0; i < len; i++) {
    unchecked(colliding[i] = 0);
  }

  for (let i = 0; i < pairCount; i++) {
    const idA = unchecked(pairsBuffer[i * 2]);
    const idB = unchecked(pairsBuffer[i * 2 + 1]);

    const dx = unchecked(posX[idB]) - unchecked(posX[idA]);
    const dy = unchecked(posYwh[idB * 3 + 0]) - unchecked(posYwh[idA * 3 + 0]);
    const distSq = dx * dx + dy * dy;
    const minDist = (unchecked(posYwh[idA * 3 + 1]) + unchecked(posYwh[idB * 3 + 1])) / 2.0;

    if (distSq < minDist * minDist && distSq > 0.001) {
      unchecked(colliding[idA] = 1);
      unchecked(colliding[idB] = 1);

      unchecked(pairsBuffer[collisionCount * 2] = idA);
      unchecked(pairsBuffer[collisionCount * 2 + 1] = idB);
      collisionCount++;

      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      unchecked(posX[idA] = unchecked(posX[idA]) - nx * overlap * 0.5);
      unchecked(posYwh[idA * 3 + 0] = unchecked(posYwh[idA * 3 + 0]) - ny * overlap * 0.5);
      unchecked(posX[idB] = unchecked(posX[idB]) + nx * overlap * 0.5);
      unchecked(posYwh[idB * 3 + 0] = unchecked(posYwh[idB * 3 + 0]) + ny * overlap * 0.5);

      const wA = unchecked(posYwh[idA * 3 + 1]);
      const wB = unchecked(posYwh[idB * 3 + 1]);
      const massA = wA * wA;
      const massB = wB * wB;
      const rvx = unchecked(vx[idB]) - unchecked(vx[idA]);
      const rvy = unchecked(vy[idB]) - unchecked(vy[idA]);
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0.0) {
        const impulse = -(2.0 * velAlongNormal) / (1.0 / massA + 1.0 / massB);
        let vax = unchecked(vx[idA]) - (impulse / massA) * nx;
        let vay = unchecked(vy[idA]) - (impulse / massA) * ny;
        let vbx = unchecked(vx[idB]) + (impulse / massB) * nx;
        let vby = unchecked(vy[idB]) + (impulse / massB) * ny;

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

        unchecked(vx[idA] = vax);
        unchecked(vy[idA] = vay);
        unchecked(vx[idB] = vbx);
        unchecked(vy[idB] = vby);

        unchecked(angle[idA] = Math.atan2(vay, vax));
        unchecked(angle[idB] = Math.atan2(vby, vbx));
      }
    }
  }

  return collisionCount;
}

export function update(
  width: f64,
  height: f64,
  speedMultiplier: f64,
  behavior: i32,
  seed: u32
): i32 {
  const moveCount = updateMovementTree(width, height, speedMultiplier, behavior, seed);
  updateDirtyLeaves(moveCount);
  const pairCount = runBroadphaseTree();
  return resolvePhysics(pairCount);
}
