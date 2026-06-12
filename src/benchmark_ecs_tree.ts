import { ENTITY_COLORS, ENTITY_MAX_SPEED } from './config';
import { SeededPRNG } from './prng';
import type { Simulator, EntityState } from './simulator';
import { renderCanvas } from './renderer';
import type { ECSData } from './benchmark_custom_ecs';
export let debugRotations = false;
export function setDebugRotations(val: boolean) {
  debugRotations = val;
}

/**
 * A highly optimized, flat pre-allocated AABB Tree using TypedArrays (SoA layout).
 * 
 * Instead of allocating TreeNode objects on the heap, all nodes are referenced
 * by integer indices in contiguous arrays.
 */
export class FlatAABBTree {
  maxNodes: number;
  
  // Node bounds
  minX: Float64Array;
  minY: Float64Array;
  maxX: Float64Array;
  maxY: Float64Array;
  
  // Node structure pointers (indices)
  parent: Int32Array;
  left: Int32Array;
  right: Int32Array;
  height: Int32Array;
  
  // Link leaf node to entity ID. For internal nodes, this is -1.
  entity: Int32Array;

  root: number = -1;
  freeHead: number = 0;

  constructor(maxEntities: number) {
    // A binary tree with N leaves has 2N - 1 nodes.
    this.maxNodes = maxEntities * 2 + 10; // Add padding to be safe
    
    this.minX = new Float64Array(this.maxNodes);
    this.minY = new Float64Array(this.maxNodes);
    this.maxX = new Float64Array(this.maxNodes);
    this.maxY = new Float64Array(this.maxNodes);
    
    this.parent = new Int32Array(this.maxNodes).fill(-1);
    this.left = new Int32Array(this.maxNodes).fill(-1);
    this.right = new Int32Array(this.maxNodes).fill(-1);
    this.height = new Int32Array(this.maxNodes).fill(0);
    this.entity = new Int32Array(this.maxNodes).fill(-1);

    // Initialize free list chain: left[i] points to next free index.
    for (let i = 0; i < this.maxNodes - 1; i++) {
      this.left[i] = i + 1;
    }
    this.left[this.maxNodes - 1] = -1; // End of chain
  }

  /**
   * Allocates a node from the free list.
   */
  allocateNode(x0: number, y0: number, x1: number, y1: number): number {
    if (this.freeHead === -1) {
      throw new Error("FlatAABBTree: Out of free nodes!");
    }
    const idx = this.freeHead;
    this.freeHead = this.left[idx]; // Pop from free list

    this.minX[idx] = x0;
    this.minY[idx] = y0;
    this.maxX[idx] = x1;
    this.maxY[idx] = y1;
    this.parent[idx] = -1;
    this.left[idx] = -1;
    this.right[idx] = -1;
    this.height[idx] = 0;
    this.entity[idx] = -1;
    return idx;
  }

  /**
   * Recycles a node back to the free list.
   */
  freeNode(idx: number) {
    this.parent[idx] = -1;
    this.right[idx] = -1;
    this.entity[idx] = -1;
    this.height[idx] = 0;

    this.left[idx] = this.freeHead; // Push to free list
    this.freeHead = idx;
  }

  /**
   * Inserts a leaf node into the tree, balancing it using AVL-like rotations.
   */
  insertLeaf(leaf: number) {
    if (this.root === -1) {
      this.root = leaf;
      this.parent[leaf] = -1;
      return;
    }

    // Find the best sibling for the new leaf
    const leafMinX = this.minX[leaf];
    const leafMinY = this.minY[leaf];
    const leafMaxX = this.maxX[leaf];
    const leafMaxY = this.maxY[leaf];

    let index = this.root;
    while (this.left[index] !== -1) { // While not a leaf
      const l = this.left[index];
      const r = this.right[index];

      // Cost of index node
      const w = this.maxX[index] - this.minX[index];
      const h = this.maxY[index] - this.minY[index];
      const area = w * h;

      // Combined area
      const cx0 = Math.min(this.minX[index], leafMinX);
      const cy0 = Math.min(this.minY[index], leafMinY);
      const cx1 = Math.max(this.maxX[index], leafMaxX);
      const cy1 = Math.max(this.maxY[index], leafMaxY);
      const combinedArea = (cx1 - cx0) * (cy1 - cy0);

      // Cost of creating a new parent for this node and the new leaf
      const cost = 2.0 * combinedArea;

      // Minimum cost of pushing the leaf further down
      const inheritanceCost = 2.0 * (combinedArea - area);

      // Cost of descending left
      let costLeft = 0;
      const lw = this.maxX[l] - this.minX[l];
      const lh = this.maxY[l] - this.minY[l];
      const lArea = lw * lh;
      const lcx0 = Math.min(this.minX[l], leafMinX);
      const lcy0 = Math.min(this.minY[l], leafMinY);
      const lcx1 = Math.max(this.maxX[l], leafMaxX);
      const lcy1 = Math.max(this.maxY[l], leafMaxY);
      const lCombinedArea = (lcx1 - lcx0) * (lcy1 - lcy0);
      
      if (this.left[l] === -1) { // Left is leaf
        costLeft = lCombinedArea + inheritanceCost;
      } else {
        costLeft = (lCombinedArea - lArea) + inheritanceCost;
      }

      // Cost of descending right
      let costRight = 0;
      const rw = this.maxX[r] - this.minX[r];
      const rh = this.maxY[r] - this.minY[r];
      const rArea = rw * rh;
      const rcx0 = Math.min(this.minX[r], leafMinX);
      const rcy0 = Math.min(this.minY[r], leafMinY);
      const rcx1 = Math.max(this.maxX[r], leafMaxX);
      const rcy1 = Math.max(this.maxY[r], leafMaxY);
      const rCombinedArea = (rcx1 - rcx0) * (rcy1 - rcy0);

      if (this.left[r] === -1) { // Right is leaf
        costRight = rCombinedArea + inheritanceCost;
      } else {
        costRight = (rCombinedArea - rArea) + inheritanceCost;
      }

      // Descend according to the minimum cost
      if (cost < costLeft && cost < costRight) {
        break;
      }

      if (costLeft < costRight) {
        index = l;
      } else {
        index = r;
      }
    }

    const sibling = index;

    // Create a new parent node
    const oldParent = this.parent[sibling];
    const newParent = this.allocateNode(
      Math.min(this.minX[sibling], leafMinX),
      Math.min(this.minY[sibling], leafMinY),
      Math.max(this.maxX[sibling], leafMaxX),
      Math.max(this.maxY[sibling], leafMaxY)
    );
    this.parent[newParent] = oldParent;
    this.height[newParent] = this.height[sibling] + 1;

    if (oldParent !== -1) {
      if (this.left[oldParent] === sibling) {
        this.left[oldParent] = newParent;
      } else {
        this.right[oldParent] = newParent;
      }

      this.left[newParent] = sibling;
      this.right[newParent] = leaf;
      this.parent[sibling] = newParent;
      this.parent[leaf] = newParent;
    } else {
      this.left[newParent] = sibling;
      this.right[newParent] = leaf;
      this.parent[sibling] = newParent;
      this.parent[leaf] = newParent;
      this.root = newParent;
    }

    // Walk back up the tree refitting AABBs and balancing
    let node = this.parent[leaf];
    while (node !== -1) {
      node = balanceFlat(this, node);
      refitAABB(this, node);
      this.height[node] = 1 + Math.max(this.height[this.left[node]], this.height[this.right[node]]);
      node = this.parent[node];
    }
  }

  /**
   * Removes a leaf node from the tree and recycles its parent node.
   */
  removeLeaf(leaf: number) {
    if (leaf === this.root) {
      this.root = -1;
      return;
    }

    const parent = this.parent[leaf];
    const grandparent = this.parent[parent];
    const sibling = (this.left[parent] === leaf) ? this.right[parent] : this.left[parent];

    if (grandparent !== -1) {
      if (this.left[grandparent] === parent) {
        this.left[grandparent] = sibling;
      } else {
        this.right[grandparent] = sibling;
      }
      this.parent[sibling] = grandparent;
      this.freeNode(parent);

      // Refit AABBs and balance up the tree
      let node = grandparent;
      while (node !== -1) {
        node = balanceFlat(this, node);
        refitAABB(this, node);
        this.height[node] = 1 + Math.max(this.height[this.left[node]], this.height[this.right[node]]);
        node = this.parent[node];
      }
    } else {
      this.root = sibling;
      this.parent[sibling] = -1;
      this.freeNode(parent);
    }
  }
}

/**
 * Refits the AABB bounds of an internal node to fully enclose its left and right children.
 */
function refitAABB(tree: FlatAABBTree, idx: number) {
  const l = tree.left[idx];
  const r = tree.right[idx];
  tree.minX[idx] = Math.min(tree.minX[l], tree.minX[r]);
  tree.minY[idx] = Math.min(tree.minY[l], tree.minY[r]);
  tree.maxX[idx] = Math.max(tree.maxX[l], tree.maxX[r]);
  tree.maxY[idx] = Math.max(tree.maxY[l], tree.maxY[r]);
}

/**
 * Standard AVL-style balancing rotations for the flat AABB tree.
 */
function balanceFlat(tree: FlatAABBTree, i: number): number {
  if (tree.left[i] === -1 || tree.height[i] < 2) {
    return i;
  }

  const left = tree.left[i];
  const right = tree.right[i];

  const balanceFactor = tree.height[right] - tree.height[left];

  // Rotate right branch up
  if (balanceFactor > 1) {
    const rightLeft = tree.left[right];
    const rightRight = tree.right[right];

    // Rotate right up, i down
    tree.left[right] = i;
    tree.parent[right] = tree.parent[i];
    tree.parent[i] = right;

    if (tree.parent[right] !== -1) {
      const p = tree.parent[right];
      if (tree.left[p] === i) {
        tree.left[p] = right;
      } else {
        tree.right[p] = right;
      }
    } else {
      tree.root = right;
    }

    // Move children
    if (tree.height[rightLeft] > tree.height[rightRight]) {
      tree.right[right] = rightLeft;
      tree.right[i] = rightRight;
      tree.parent[rightRight] = i;
      
      refitAABB(tree, i);
      refitAABB(tree, right);

      tree.height[i] = 1 + Math.max(tree.height[tree.left[i]], tree.height[tree.right[i]]);
      tree.height[right] = 1 + Math.max(tree.height[tree.left[right]], tree.height[tree.right[right]]);
    } else {
      tree.right[right] = rightRight;
      tree.right[i] = rightLeft;
      tree.parent[rightLeft] = i;

      refitAABB(tree, i);
      refitAABB(tree, right);

      tree.height[i] = 1 + Math.max(tree.height[tree.left[i]], tree.height[tree.right[i]]);
      tree.height[right] = 1 + Math.max(tree.height[tree.left[right]], tree.height[tree.right[right]]);
    }

    if (debugRotations) {
      console.log(`[ECS] Rotate Right at node ${i}, balanceFactor: ${balanceFactor}`);
    }
    return right;
  }

  // Rotate left branch up
  if (balanceFactor < -1) {
    const leftLeft = tree.left[left];
    const leftRight = tree.right[left];

    // Rotate left up, i down
    tree.right[left] = i;
    tree.parent[left] = tree.parent[i];
    tree.parent[i] = left;

    if (tree.parent[left] !== -1) {
      const p = tree.parent[left];
      if (tree.left[p] === i) {
        tree.left[p] = left;
      } else {
        tree.right[p] = left;
      }
    } else {
      tree.root = left;
    }

    // Move children
    if (tree.height[leftLeft] > tree.height[leftRight]) {
      tree.left[left] = leftLeft;
      tree.left[i] = leftRight;
      tree.parent[leftRight] = i;
      
      refitAABB(tree, i);
      refitAABB(tree, left);

      tree.height[i] = 1 + Math.max(tree.height[tree.left[i]], tree.height[tree.right[i]]);
      tree.height[left] = 1 + Math.max(tree.height[tree.left[left]], tree.height[tree.right[left]]);
    } else {
      tree.left[left] = leftRight;
      tree.left[i] = leftLeft;
      tree.parent[leftLeft] = i;

      refitAABB(tree, i);
      refitAABB(tree, left);

      tree.height[i] = 1 + Math.max(tree.height[tree.left[i]], tree.height[tree.right[i]]);
      tree.height[left] = 1 + Math.max(tree.height[tree.left[left]], tree.height[tree.right[left]]);
    }

    if (debugRotations) {
      console.log(`[ECS] Rotate Left at node ${i}, balanceFactor: ${balanceFactor}`);
    }
    return left;
  }

  return i;
}

/**
 * Flat Tree Broadphase functions.
 */
// Shared pre-allocated stacks for iterative tree traversal
const stackA = new Int32Array(1024);
const stackB = new Int32Array(1024);
const mainStack = new Int32Array(1024);

function queryOverlapFlatIter(
  tree: FlatAABBTree,
  startNodeA: number,
  startNodeB: number,
  callback: (leafA: number, leafB: number) => void
) {
  let stackPtr = 0;
  stackA[0] = startNodeA;
  stackB[0] = startNodeB;
  stackPtr = 1;

  const minX = tree.minX;
  const minY = tree.minY;
  const maxX = tree.maxX;
  const maxY = tree.maxY;
  const left = tree.left;
  const right = tree.right;
  const height = tree.height;

  while (stackPtr > 0) {
    stackPtr--;
    const nodeA = stackA[stackPtr];
    const nodeB = stackB[stackPtr];

    const overlap = minX[nodeA] <= maxX[nodeB] && maxX[nodeA] >= minX[nodeB] &&
                    minY[nodeA] <= maxY[nodeB] && maxY[nodeA] >= minY[nodeB];
    if (!overlap) continue;

    const isLeafA = left[nodeA] === -1;
    const isLeafB = left[nodeB] === -1;

    if (isLeafA && isLeafB) {
      callback(nodeA, nodeB);
    } else if (isLeafA) {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("FlatAABBTree: Stack overflow in queryOverlap");
      }
      stackA[stackPtr] = nodeA;
      stackB[stackPtr] = left[nodeB];
      stackA[stackPtr + 1] = nodeA;
      stackB[stackPtr + 1] = right[nodeB];
      stackPtr += 2;
    } else if (isLeafB) {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("FlatAABBTree: Stack overflow in queryOverlap");
      }
      stackA[stackPtr] = left[nodeA];
      stackB[stackPtr] = nodeB;
      stackA[stackPtr + 1] = right[nodeA];
      stackB[stackPtr + 1] = nodeB;
      stackPtr += 2;
    } else {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("FlatAABBTree: Stack overflow in queryOverlap");
      }
      if (height[nodeA] > height[nodeB]) {
        stackA[stackPtr] = left[nodeA];
        stackB[stackPtr] = nodeB;
        stackA[stackPtr + 1] = right[nodeA];
        stackB[stackPtr + 1] = nodeB;
      } else {
        stackA[stackPtr] = nodeA;
        stackB[stackPtr] = left[nodeB];
        stackA[stackPtr + 1] = nodeA;
        stackB[stackPtr + 1] = right[nodeB];
      }
      stackPtr += 2;
    }
  }
}

/**
 * Timed broadphase function that starts tree queries and fills pairs buffer.
 * Fully iterative implementation using pre-allocated stacks.
 */
export function runBroadphase(
  tree: FlatAABBTree,
  posX: Float64Array,
  posYwh: Float64Array,
  outPairsBuffer: Int32Array
): number {
  let pairCount = 0;
  if (tree.root === -1 || tree.left[tree.root] === -1) return 0;

  let stackPtr = 0;
  mainStack[0] = tree.root;
  stackPtr = 1;

  const left = tree.left;
  const right = tree.right;

  while (stackPtr > 0) {
    stackPtr--;
    const node = mainStack[stackPtr];

    queryOverlapFlatIter(tree, left[node], right[node], (leafA, leafB) => {
      // Leaf node index to entity ID
      const entityA = tree.entity[leafA];
      const entityB = tree.entity[leafB];

      const ax = posX[entityA];
      const ay = posYwh[entityA * 3 + 0];
      const aw = posYwh[entityA * 3 + 1];
      const ah = posYwh[entityA * 3 + 2];

      const bx = posX[entityB];
      const by = posYwh[entityB * 3 + 0];
      const bw = posYwh[entityB * 3 + 1];
      const bh = posYwh[entityB * 3 + 2];

      if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) {
        if (pairCount * 2 + 1 < outPairsBuffer.length) {
          outPairsBuffer[pairCount * 2] = entityA;
          outPairsBuffer[pairCount * 2 + 1] = entityB;
          pairCount++;
        }
      }
    });

    const leftChild = left[node];
    const rightChild = right[node];

    if (left[leftChild] !== -1) {
      if (stackPtr + 1 > mainStack.length) throw new Error("FlatAABBTree: Main stack overflow");
      mainStack[stackPtr] = leftChild;
      stackPtr++;
    }
    if (left[rightChild] !== -1) {
      if (stackPtr + 1 > mainStack.length) throw new Error("FlatAABBTree: Main stack overflow");
      mainStack[stackPtr] = rightChild;
      stackPtr++;
    }
  }

  return pairCount;
}

/**
 * Updates coordinates sequentially in flat TypedArrays.
 * Checks leaf bounds, pushing moved entity indices to `outMoveBuffer`.
 */
export function updateMovement(
  posX: Float64Array,
  posYwh: Float64Array,
  vx: Float64Array,
  vy: Float64Array,
  angle: Float64Array,
  entityLeaf: Int32Array,
  treeMinX: Float64Array,
  treeMinY: Float64Array,
  treeMaxX: Float64Array,
  treeMaxY: Float64Array,
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG,
  outMoveBuffer: Int32Array,
  outMoveCount: { count: number }
) {
  const len = posX.length;
  outMoveCount.count = 0;

  if (behavior === 'wander') {
    for (let i = 0; i < len; i++) {
      angle[i] += (prng.next() - 0.5) * 0.4;
      vx[i] = Math.cos(angle[i]) * 1.2 * speedMultiplier;
      vy[i] = Math.sin(angle[i]) * 1.2 * speedMultiplier;

      posX[i] += vx[i];
      posYwh[i * 3 + 0] += vy[i]; // posY

      const w = posYwh[i * 3 + 1];
      const h = posYwh[i * 3 + 2];

      let bounced = false;

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

      // Out-of-bounds leaf check: mark index for re-insertion if it escapes cached bounds
      const leaf = entityLeaf[i];
      if (leaf !== -1) {
        if (
          posX[i] < treeMinX[leaf] || posX[i] + w > treeMaxX[leaf] ||
          posYwh[i * 3 + 0] < treeMinY[leaf] || posYwh[i * 3 + 0] + h > treeMaxY[leaf]
        ) {
          outMoveBuffer[outMoveCount.count++] = i; // Push entity index to update
        }
      }
    }
  } else if (behavior === 'erratic') {
    for (let i = 0; i < len; i++) {
      const w = posYwh[i * 3 + 1];
      const h = posYwh[i * 3 + 2];
      
      posX[i] = prng.next() * (canvasWidth - w);
      posYwh[i * 3 + 0] = prng.next() * (canvasHeight - h);

      // Out-of-bounds leaf check
      const leaf = entityLeaf[i];
      if (leaf !== -1) {
        if (
          posX[i] < treeMinX[leaf] || posX[i] + w > treeMaxX[leaf] ||
          posYwh[i * 3 + 0] < treeMinY[leaf] || posYwh[i * 3 + 0] + h > treeMaxY[leaf]
        ) {
          outMoveBuffer[outMoveCount.count++] = i;
        }
      }
    }
  }
}

/**
 * Re-inserts moved tree leaves and performs incremental optimizations.
 */
export function updateTree(
  tree: FlatAABBTree,
  posX: Float64Array,
  posYwh: Float64Array,
  entityLeaf: Int32Array,
  moveBuffer: Int32Array,
  moveCount: number,
  frameCount: number,
  prng?: SeededPRNG
) {
  const margin = 2.0; // Fat bounds margin

  for (let k = 0; k < moveCount; k++) {
    const entityId = moveBuffer[k];
    const leaf = entityLeaf[entityId];

    tree.removeLeaf(leaf);

    const w = posYwh[entityId * 3 + 1];
    const h = posYwh[entityId * 3 + 2];

    tree.minX[leaf] = posX[entityId] - margin;
    tree.minY[leaf] = posYwh[entityId * 3 + 0] - margin;
    tree.maxX[leaf] = posX[entityId] + w + margin;
    tree.maxY[leaf] = posYwh[entityId * 3 + 0] + h + margin;

    tree.insertLeaf(leaf);
  }

  // Optimize tree globally: re-insert 1% of nodes every 8 frames.
  if (moveCount > 0 && frameCount % 8 === 0) {
    const len = posX.length;
    const numToOptimize = Math.max(10, Math.floor(len * 0.01));
    for (let k = 0; k < numToOptimize; k++) {
      const entityId = prng ? Math.floor(prng.next() * len) : Math.floor(Math.random() * len);
      const leaf = entityLeaf[entityId];
      if (leaf !== -1) {
        tree.removeLeaf(leaf);
        tree.insertLeaf(leaf);
      }
    }
  }
}

/**
 * Solves collisions for overlapping circles (SoA style).
 */
export function resolveCollisions(
  posX: Float64Array,
  posYwh: Float64Array,
  vx: Float64Array,
  vy: Float64Array,
  angle: Float64Array,
  pairsBuffer: Int32Array,
  pairsCount: number,
  isColliding: Uint8Array
): number {
  let collisionCount = 0;

  for (let i = 0; i < pairsCount; i++) {
    const idA = pairsBuffer[i * 2];
    const idB = pairsBuffer[i * 2 + 1];

    const ax = posX[idA];
    const ay = posYwh[idA * 3 + 0];
    const aw = posYwh[idA * 3 + 1];

    const bx = posX[idB];
    const by = posYwh[idB * 3 + 0];
    const bw = posYwh[idB * 3 + 1];

    const dx = bx - ax;
    const dy = by - ay;
    const distSq = dx * dx + dy * dy;
    const minDist = (aw + bw) / 2;

    if (distSq < minDist * minDist && distSq > 0.001) {
      isColliding[idA] = 1;
      isColliding[idB] = 1;

      collisionCount++;

      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      posX[idA] -= nx * overlap * 0.5;
      posYwh[idA * 3 + 0] -= ny * overlap * 0.5;
      posX[idB] += nx * overlap * 0.5;
      posYwh[idB * 3 + 0] += ny * overlap * 0.5;

      const massA = aw * aw;
      const massB = bw * bw;
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

/**
 * Simulator representing a Custom flat ECS engine using a pre-allocated flat AABB Tree for broadphase.
 */
export class ECSTreeSimulator implements Simulator {

  private ecsData: ECSData | null = null;
  private entityLeaf: Int32Array = new Int32Array(0); // maps entity id to tree leaf node idx
  private tree: FlatAABBTree | null = null;
  
  // Buffers
  private moveBuffer: Int32Array = new Int32Array(0);
  private moveCount = { count: 0 };
  private times: number[] = [];
  private colliding = new Uint8Array(0);
  private pairsBuffer = new Int32Array(0);
  private maxCollisions = 200000;
  private lastCollisionCount = 0;
  private pairsCount = 0;
  private frameCount = 0;

  init(numEntities: number, _width: number, _height: number, _prng: SeededPRNG) {
    // 1. Spawns standard SoA component arrays
    const posX = new Float64Array(numEntities);
    const posYwh = new Float64Array(numEntities * 3);
    const vx = new Float64Array(numEntities);
    const vy = new Float64Array(numEntities);
    const angle = new Float64Array(numEntities);
    const colorId = new Uint8Array(numEntities);
    const indices = new Int32Array(numEntities);
    const id = new Int32Array(numEntities);

    for (let i = 0; i < numEntities; i++) {
      id[i] = i;
      indices[i] = i;
      // Dimensions
      posYwh[i * 3 + 1] = 8.0; // w
      posYwh[i * 3 + 2] = 8.0; // h
    }

    this.ecsData = { posX, posYwh, vx, vy, angle, colorId, indices, id };
    
    // 2. Allocate Leaf mapping and flat tree nodes
    this.entityLeaf = new Int32Array(numEntities).fill(-1);
    this.tree = new FlatAABBTree(numEntities);
    this.moveBuffer = new Int32Array(numEntities);
    this.moveCount = { count: 0 };

    // Initialize tree leaves with flat values
    // margin of 2.0px allows entities to move slightly without triggering tree re-insertion
    const margin = 2.0;
    for (let i = 0; i < numEntities; i++) {
      const leafIdx = this.tree.allocateNode(
        posX[i] - margin,
        posYwh[i * 3 + 0] - margin,
        posX[i] + posYwh[i * 3 + 1] + margin,
        posYwh[i * 3 + 0] + posYwh[i * 3 + 2] + margin
      );
      this.tree.entity[leafIdx] = i;
      this.entityLeaf[i] = leafIdx;
      this.tree.insertLeaf(leafIdx);
    }

    this.colliding = new Uint8Array(numEntities);
    this.pairsBuffer = new Int32Array(this.maxCollisions * 2);
    this.lastCollisionCount = 0;
    this.pairsCount = 0;
    this.frameCount = 0;
  }

  update(width: number, height: number, speedMultiplier: number, behavior: string, prng: SeededPRNG): { time: number, collisionCount: number } {
    const start = performance.now();
    this.pairsCount = 0;

    if (this.ecsData && this.tree) {
      // 1. Move System
      updateMovement(
        this.ecsData.posX,
        this.ecsData.posYwh,
        this.ecsData.vx,
        this.ecsData.vy,
        this.ecsData.angle,
        this.entityLeaf,
        this.tree.minX,
        this.tree.minY,
        this.tree.maxX,
        this.tree.maxY,
        width,
        height,
        speedMultiplier,
        behavior,
        prng,
        this.moveBuffer,
        this.moveCount
      );

      // 2. Re-insert dirty leaves in flat tree
      updateTree(
        this.tree,
        this.ecsData.posX,
        this.ecsData.posYwh,
        this.entityLeaf,
        this.moveBuffer,
        this.moveCount.count,
        this.frameCount,
        prng
      );

      // 3. Flat Tree Broadphase
      this.pairsCount = runBroadphase(
        this.tree,
        this.ecsData.posX,
        this.ecsData.posYwh,
        this.pairsBuffer
      );

      // 4. ECS Narrowphase
      this.colliding.fill(0);
      this.lastCollisionCount = resolveCollisions(
        this.ecsData.posX,
        this.ecsData.posYwh,
        this.ecsData.vx,
        this.ecsData.vy,
        this.ecsData.angle,
        this.pairsBuffer,
        this.pairsCount,
        this.colliding
      );
    }

    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    this.frameCount++;
    return { time, collisionCount: this.lastCollisionCount };
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.ecsData) {
      renderCanvas(ctx.canvas, ctx, this.ecsData, this.colliding, 'ecs', this.pairsBuffer, this.pairsCount, this.ecsData.posX.length);
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

    // Clear and build from scratch to ensure identical tree structure
    this.entityLeaf.fill(-1);
    this.tree = new FlatAABBTree(positions.length);
    const margin = 2.0;

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

      const leafIdx = this.tree.allocateNode(
        p.x - margin,
        p.y - margin,
        p.x + p.w + margin,
        p.y + p.h + margin
      );
      this.tree.entity[leafIdx] = i;
      this.entityLeaf[i] = leafIdx;
      this.tree.insertLeaf(leafIdx);
    }
  }
}

// Aliases for compatibility
export {
  updateMovement as updateECSTreeMovement,
  updateTree as updateTreeFlat,
  runBroadphase as runFlatTreeBroadphase,
  resolveCollisions as resolveECSTreePhysics
};
