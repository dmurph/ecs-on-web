import { GameEntity } from './benchmark_oop';
import { SeededPRNG } from '../prng';
import type { Simulator, EntityState, RenderEntity } from '../simulator';
import {
  ENTITY_MAX_SPEED,
  TREE_REBALANCE_FRAME_INTERVAL,
  TREE_REBALANCE_PERCENTAGE,
} from '../config';

export class TreeNode {
  id: number;
  aabb: { minX: number; minY: number; maxX: number; maxY: number };
  parent: TreeNode | null = null;
  left: TreeNode | null = null;
  right: TreeNode | null = null;
  entity: TreeGameEntity | null = null; // Direct reference
  height: number = 0;

  constructor(
    id: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ) {
    this.id = id;
    this.aabb = { minX, minY, maxX, maxY };
  }

  isLeaf(): boolean {
    return this.left === null;
  }
}

export class TreeGameEntity extends GameEntity {
  leaf: TreeNode | null = null;
}

export class AABBTree {
  root: TreeNode | null = null;
  nodeIdCounter = 0;
  freeNodes: TreeNode[] = [];

  createNode(minX: number, minY: number, maxX: number, maxY: number): TreeNode {
    if (this.freeNodes.length > 0) {
      const node = this.freeNodes.pop()!;
      node.aabb = { minX, minY, maxX, maxY };
      node.parent = null;
      node.left = null;
      node.right = null;
      node.height = 0;
      node.entity = null;
      return node;
    }
    return new TreeNode(this.nodeIdCounter++, minX, minY, maxX, maxY);
  }

  freeNode(node: TreeNode) {
    this.freeNodes.push(node);
  }

  insertLeaf(leaf: TreeNode) {
    if (this.root === null) {
      this.root = leaf;
      leaf.parent = null;
      return;
    }

    // Find the best sibling for the new leaf
    const leafAABB = leaf.aabb;
    let index = this.root;
    while (!index.isLeaf()) {
      const left = index.left!;
      const right = index.right!;

      const area = getArea(index.aabb);

      // Combined area of index node and leaf
      const combinedAABB = union(index.aabb, leafAABB);
      const combinedArea = getArea(combinedAABB);

      // Cost of creating a new parent for this node and the new leaf
      const cost = 2.0 * combinedArea;

      // Minimum cost of pushing the leaf further down
      const inheritanceCost = 2.0 * (combinedArea - area);

      // Cost of descending left
      let costLeft = 0;
      if (left.isLeaf()) {
        costLeft = getArea(union(left.aabb, leafAABB)) + inheritanceCost;
      } else {
        const oldArea = getArea(left.aabb);
        const newArea = getArea(union(left.aabb, leafAABB));
        costLeft = newArea - oldArea + inheritanceCost;
      }

      // Cost of descending right
      let costRight = 0;
      if (right.isLeaf()) {
        costRight = getArea(union(right.aabb, leafAABB)) + inheritanceCost;
      } else {
        const oldArea = getArea(right.aabb);
        const newArea = getArea(union(right.aabb, leafAABB));
        costRight = newArea - oldArea + inheritanceCost;
      }

      // Descend according to the minimum cost
      if (cost < costLeft && cost < costRight) {
        break;
      }

      if (costLeft < costRight) {
        index = left;
      } else {
        index = right;
      }
    }

    const sibling = index;

    // Create a new parent node
    const oldParent = sibling.parent;
    const newParent = this.createNode(
      Math.min(sibling.aabb.minX, leafAABB.minX),
      Math.min(sibling.aabb.minY, leafAABB.minY),
      Math.max(sibling.aabb.maxX, leafAABB.maxX),
      Math.max(sibling.aabb.maxY, leafAABB.maxY),
    );
    newParent.parent = oldParent;
    newParent.height = sibling.height + 1;

    if (oldParent !== null) {
      // The sibling was not the root
      if (oldParent.left === sibling) {
        oldParent.left = newParent;
      } else {
        oldParent.right = newParent;
      }

      newParent.left = sibling;
      newParent.right = leaf;
      sibling.parent = newParent;
      leaf.parent = newParent;
    } else {
      // The sibling was the root
      newParent.left = sibling;
      newParent.right = leaf;
      sibling.parent = newParent;
      leaf.parent = newParent;
      this.root = newParent;
    }

    // Walk back up the tree refitting AABBs and balancing
    let node: TreeNode | null = leaf.parent;
    while (node !== null) {
      node = balance(this, node);

      node.aabb = union(node.left!.aabb, node.right!.aabb);
      node.height = 1 + Math.max(node.left!.height, node.right!.height);
      node = node.parent;
    }
  }

  removeLeaf(leaf: TreeNode) {
    if (leaf === this.root) {
      this.root = null;
      return;
    }

    const parent = leaf.parent!;
    const grandparent = parent.parent;
    const sibling = parent.left === leaf ? parent.right! : parent.left!;

    if (grandparent !== null) {
      if (grandparent.left === parent) {
        grandparent.left = sibling;
      } else {
        grandparent.right = sibling;
      }
      sibling.parent = grandparent;
      // Clear references and recycle the parent node
      parent.left = null;
      parent.right = null;
      parent.parent = null;
      this.freeNode(parent);

      // Refit AABBs and balance up the tree
      let node: TreeNode | null = grandparent;
      while (node !== null) {
        node = balance(this, node);

        node.aabb = union(node.left!.aabb, node.right!.aabb);
        node.height = 1 + Math.max(node.left!.height, node.right!.height);
        node = node.parent;
      }
    } else {
      this.root = sibling;
      sibling.parent = null;
      // Clear references and recycle the parent node
      parent.left = null;
      parent.right = null;
      parent.parent = null;
      this.freeNode(parent);
    }
  }
}

function union(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
) {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function getArea(aabb: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): number {
  return (aabb.maxX - aabb.minX) * (aabb.maxY - aabb.minY);
}

function overlaps(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}

function balance(tree: AABBTree, i: TreeNode): TreeNode {
  if (i.isLeaf() || i.height < 2) {
    return i;
  }

  const left = i.left!;
  const right = i.right!;

  const balanceFactor = right.height - left.height;

  // Rotate right branch up
  if (balanceFactor > 1) {
    const rightLeft = right.left!;
    const rightRight = right.right!;

    // Rotate right up, i down
    right.left = i;
    right.parent = i.parent;
    i.parent = right;

    if (right.parent !== null) {
      if (right.parent.left === i) {
        right.parent.left = right;
      } else {
        right.parent.right = right;
      }
    } else {
      tree.root = right;
    }

    // Move children
    if (rightLeft.height > rightRight.height) {
      right.right = rightLeft;
      i.right = rightRight;
      rightRight.parent = i;
      i.aabb = union(i.left!.aabb, i.right!.aabb);
      right.aabb = union(right.left!.aabb, right.right!.aabb);

      i.height = 1 + Math.max(i.left!.height, i.right!.height);
      right.height = 1 + Math.max(right.left!.height, right.right!.height);
    } else {
      right.right = rightRight;
      i.right = rightLeft;
      rightLeft.parent = i;
      i.aabb = union(i.left!.aabb, i.right!.aabb);
      right.aabb = union(right.left!.aabb, right.right!.aabb);

      i.height = 1 + Math.max(i.left!.height, i.right!.height);
      right.height = 1 + Math.max(right.left!.height, right.right!.height);
    }

    return right;
  }

  // Rotate left branch up
  if (balanceFactor < -1) {
    const leftLeft = left.left!;
    const leftRight = left.right!;

    // Rotate left up, i down
    left.right = i;
    left.parent = i.parent;
    i.parent = left;

    if (left.parent !== null) {
      if (left.parent.left === i) {
        left.parent.left = left;
      } else {
        left.parent.right = left;
      }
    } else {
      tree.root = left;
    }

    // Move children
    if (leftLeft.height > leftRight.height) {
      left.left = leftLeft;
      i.left = leftRight;
      leftRight.parent = i;
      i.aabb = union(i.left!.aabb, i.right!.aabb);
      left.aabb = union(left.left!.aabb, left.right!.aabb);

      i.height = 1 + Math.max(i.left!.height, i.right!.height);
      left.height = 1 + Math.max(left.left!.height, left.right!.height);
    } else {
      left.left = leftRight;
      i.left = leftLeft;
      leftLeft.parent = i;
      i.aabb = union(i.left!.aabb, i.right!.aabb);
      left.aabb = union(left.left!.aabb, left.right!.aabb);

      i.height = 1 + Math.max(i.left!.height, i.right!.height);
      left.height = 1 + Math.max(left.left!.height, left.right!.height);
    }

    return left;
  }

  return i;
}

/**
 * Step 1: Update movements
 * - Updates positions for traditional OOP objects (`TreeGameEntity`) scattered
 *   across heap memory.
 * - Checks whether an entity escaped its cached leaf bounding box and pushes
 *   escaping nodes to `outMoveBuffer` for spatial tree re-insertion.
 */
export function updateMovement(
  entities: TreeGameEntity[],
  canvasWidth: number,
  canvasHeight: number,
  speedMultiplier: number,
  behavior: string,
  prng: SeededPRNG,
  outMoveBuffer: TreeGameEntity[],
) {
  const len = entities.length;
  outMoveBuffer.length = 0; // Clear it

  if (behavior === 'wander') {
    for (let i = 0; i < len; i++) {
      const entity = entities[i];
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

      // Check bounds: mark entity for re-insertion if it escapes its cached leaf bounds
      const leaf = entity.leaf;
      if (leaf) {
        const minX = entity.x;
        const minY = entity.y;
        const maxX = entity.x + entity.w;
        const maxY = entity.y + entity.h;
        if (
          minX < leaf.aabb.minX ||
          maxX > leaf.aabb.maxX ||
          minY < leaf.aabb.minY ||
          maxY > leaf.aabb.maxY
        ) {
          outMoveBuffer.push(entity);
        }
      }
    }
  } else if (behavior === 'erratic') {
    for (let i = 0; i < len; i++) {
      const entity = entities[i];
      entity.x = prng.next() * (canvasWidth - entity.w);
      entity.y = prng.next() * (canvasHeight - entity.h);

      // Check bounds
      const leaf = entity.leaf;
      if (leaf) {
        const minX = entity.x;
        const minY = entity.y;
        const maxX = entity.x + entity.w;
        const maxY = entity.y + entity.h;
        if (
          minX < leaf.aabb.minX ||
          maxX > leaf.aabb.maxX ||
          minY < leaf.aabb.minY ||
          maxY > leaf.aabb.maxY
        ) {
          outMoveBuffer.push(entity);
        }
      }
    }
  }
}

/**
 * Step 2a: Update tree (Broadphase)
 * - Re-computes bounding boxes and re-inserts heap entities that moved outside
 *   their cached "fat bounds" margin.
 * - Fat bounds margins (e.g., margin = 2.0) buffer minor entity movements,
 *   drastically reducing how often the spatial BVH must balance and restructure
 *   nodes.
 */
export function updateTree(
  tree: AABBTree,
  entities: TreeGameEntity[],
  moveBuffer: TreeGameEntity[],
  movedFrameCount: number,
  prng?: SeededPRNG,
) {
  const numMoves = moveBuffer.length;
  const margin = 2.0; // Fat margin to reduce updates

  for (let k = 0; k < numMoves; k++) {
    const entity = moveBuffer[k];
    const leaf = entity.leaf!;

    tree.removeLeaf(leaf);
    leaf.aabb = {
      minX: entity.x - margin,
      minY: entity.y - margin,
      maxX: entity.x + entity.w + margin,
      maxY: entity.y + entity.h + margin,
    };
    tree.insertLeaf(leaf);
  }

  // Incremental optimization: rebalance according to configured intervals
  if (numMoves > 0 && movedFrameCount % TREE_REBALANCE_FRAME_INTERVAL === 0) {
    const len = entities.length;
    const numToOptimize = Math.max(
      1,
      Math.floor(len * TREE_REBALANCE_PERCENTAGE),
    );
    for (let k = 0; k < numToOptimize; k++) {
      const idx = prng
        ? Math.floor(prng.next() * len)
        : Math.floor(Math.random() * len);
      const leaf = entities[idx].leaf;
      if (leaf) {
        tree.removeLeaf(leaf);
        tree.insertLeaf(leaf);
      }
    }
  }
}

// Shared pre-allocated stacks for iterative tree traversal
const stackA = new Array<TreeNode | null>(1024).fill(null);
const stackB = new Array<TreeNode | null>(1024).fill(null);
const mainStack = new Array<TreeNode | null>(1024).fill(null);

function queryOverlapIter(
  startNodeA: TreeNode,
  startNodeB: TreeNode,
  callback: (nodeA: TreeNode, nodeB: TreeNode) => void,
) {
  let stackPtr = 0;
  stackA[0] = startNodeA;
  stackB[0] = startNodeB;
  stackPtr = 1;

  while (stackPtr > 0) {
    stackPtr--;
    const nodeA = stackA[stackPtr]!;
    const nodeB = stackB[stackPtr]!;

    if (!overlaps(nodeA.aabb, nodeB.aabb)) continue;

    const isLeafA = nodeA.left === null;
    const isLeafB = nodeB.left === null;

    if (isLeafA && isLeafB) {
      callback(nodeA, nodeB);
    } else if (isLeafA) {
      if (stackPtr + 2 > stackA.length) {
        throw new Error('AABBTree: Stack overflow in queryOverlap');
      }
      stackA[stackPtr] = nodeA;
      stackB[stackPtr] = nodeB.left!;
      stackA[stackPtr + 1] = nodeA;
      stackB[stackPtr + 1] = nodeB.right!;
      stackPtr += 2;
    } else if (isLeafB) {
      if (stackPtr + 2 > stackA.length) {
        throw new Error('AABBTree: Stack overflow in queryOverlap');
      }
      stackA[stackPtr] = nodeA.left!;
      stackB[stackPtr] = nodeB;
      stackA[stackPtr + 1] = nodeA.right!;
      stackB[stackPtr + 1] = nodeB;
      stackPtr += 2;
    } else {
      if (stackPtr + 2 > stackA.length) {
        throw new Error('AABBTree: Stack overflow in queryOverlap');
      }
      if (nodeA.height > nodeB.height) {
        stackA[stackPtr] = nodeA.left!;
        stackB[stackPtr] = nodeB;
        stackA[stackPtr + 1] = nodeA.right!;
        stackB[stackPtr + 1] = nodeB;
      } else {
        stackA[stackPtr] = nodeA;
        stackB[stackPtr] = nodeB.left!;
        stackA[stackPtr + 1] = nodeA;
        stackB[stackPtr + 1] = nodeB.right!;
      }
      stackPtr += 2;
    }
  }
}

/**
 * Step 2b: Broadphase
 * - Traverses the dynamic spatial AABB tree (hierarchical BVH) to find
 *   overlapping bounding boxes.
 * - While hierarchical trees have O(N log N) algorithmic complexity, traversing
 *   pointer-linked nodes (`node.left`, `node.right`) causes frequent CPU cache
 *   misses compared to streaming flat ECS arrays.
 */
export function runBroadphase(
  root: TreeNode | null,
  outPairsBuffer: Int32Array,
): number {
  let pairCount = 0;
  if (root === null || root.left === null) return 0;

  let stackPtr = 0;
  mainStack[0] = root;
  stackPtr = 1;

  while (stackPtr > 0) {
    stackPtr--;
    const node = mainStack[stackPtr]!;

    queryOverlapIter(node.left!, node.right!, (nodeA, nodeB) => {
      const a = nodeA.entity!;
      const b = nodeB.entity!;
      if (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      ) {
        if (pairCount * 2 + 1 < outPairsBuffer.length) {
          outPairsBuffer[pairCount * 2] = a.id;
          outPairsBuffer[pairCount * 2 + 1] = b.id;
          pairCount++;
        }
      }
    });

    const leftChild = node.left!;
    const rightChild = node.right!;

    if (leftChild.left !== null) {
      if (stackPtr + 1 > mainStack.length)
        throw new Error('AABBTree: Main stack overflow');
      mainStack[stackPtr] = leftChild;
      stackPtr++;
    }
    if (rightChild.left !== null) {
      if (stackPtr + 1 > mainStack.length)
        throw new Error('AABBTree: Main stack overflow');
      mainStack[stackPtr] = rightChild;
      stackPtr++;
    }
  }

  return pairCount;
}

/**
 * Step 3: Narrowphase
 * - Resolves exact circular collisions and bounce reactions for overlapping
 *   pairs discovered during BVH traversal.
 */
export function resolveCollisions(
  entities: TreeGameEntity[],
  pairsBuffer: Int32Array,
  pairsCount: number,
  isColliding: Uint8Array,
): number {
  let collisionCount = 0;

  for (let i = 0; i < pairsCount; i++) {
    const idA = pairsBuffer[i * 2];
    const idB = pairsBuffer[i * 2 + 1];

    const a = entities[idA];
    const b = entities[idB];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    const minDist = (a.w + b.w) / 2;

    if (distSq < minDist * minDist && distSq > 0.001) {
      isColliding[idA] = 1;
      isColliding[idB] = 1;
      collisionCount++;

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

  return collisionCount;
}

/**
 * Simulator representing an OOP model using a dynamic AABB Tree for broadphase.
 *
 * - Data Layout: Array of Objects (AoS).
 * - Each entity holds a direct reference to its corresponding AABB tree node
 *   (`leaf`).
 * - Each leaf holds a direct reference back to the `entity`.
 *
 * Algorithm: Dynamic AABB Tree with a fat margin (+2.0px). Entities only
 * trigger tree re-insertion when they move outside their fat margin, allowing
 * sub-linear updates during highly coherent motion.
 */
export class OOPTreeSimulator implements Simulator {
  private entities: TreeGameEntity[] = [];
  private entitiesById: TreeGameEntity[] = [];
  private tree: AABBTree | null = null;
  private moveBuffer: TreeGameEntity[] = [];
  private times: number[] = [];
  private colliding = new Uint8Array(0);
  private pairsBuffer = new Int32Array(0);
  private maxCollisions = 200000;
  private frameCount = 0;
  private movedFrameCount = 0;

  /**
   * Initializes entities and builds the dynamic AABB tree.
   * Leaves are created with a fat margin around each entity.
   */
  init(numEntities: number, width: number, height: number, _prng: SeededPRNG) {
    this.entities = [];
    this.entitiesById = new Array(numEntities);
    for (let i = 0; i < numEntities; i++) {
      const entity = new TreeGameEntity(i, width, height);
      this.entities.push(entity);
      this.entitiesById[i] = entity;
    }

    this.tree = new AABBTree();
    // margin of 2.0px allows entities to move slightly without triggering tree re-insertion
    const margin = 2.0;
    for (let i = 0; i < numEntities; i++) {
      const entity = this.entities[i];
      const leaf = this.tree.createNode(
        entity.x - margin,
        entity.y - margin,
        entity.x + entity.w + margin,
        entity.y + entity.h + margin,
      );
      leaf.entity = entity;
      entity.leaf = leaf;
      this.tree.insertLeaf(leaf);
    }

    this.colliding = new Uint8Array(numEntities);
    this.pairsBuffer = new Int32Array(this.maxCollisions * 2);
    this.moveBuffer = [];
    this.frameCount = 0;
    this.movedFrameCount = 0;
  }

  /**
   * Executes a full simulation step, timing all operations:
   * 1. Movement updates (updating entity positions).
   * 2. Tree updates (re-calculating bounds and re-inserting nodes that escaped
   *    fat margins).
   * 3. AABB tree broadphase (recursive overlap search between branches/leaves).
   * 4. Narrowphase resolution (circle overlap checks and bounce impulses).
   *
   * This measures the algorithmic benefit of dynamic AABB trees (sub-linear
   * broadphase updates) vs the overhead of tree traversal pointers and AoS heap
   * lookups.
   */
  update(
    width: number,
    height: number,
    speedMultiplier: number,
    behavior: string,
    prng: SeededPRNG,
  ): { time: number; collisionCount: number } {
    const start = performance.now();
    let collisionCount = 0;
    if (this.tree) {
      this.moveBuffer = [];
      // Step 1: Update movements
      updateMovement(
        this.entities,
        width,
        height,
        speedMultiplier,
        behavior,
        prng,
        this.moveBuffer,
      );
      if (this.moveBuffer.length > 0) {
        this.movedFrameCount++;
      }
      // Step 2a: Update tree (Broadphase)
      updateTree(
        this.tree,
        this.entities,
        this.moveBuffer,
        this.movedFrameCount,
        prng,
      );
      // Step 2b: Broadphase queries
      const pairsCount = runBroadphase(this.tree.root, this.pairsBuffer);

      this.colliding.fill(0);
      // Step 3: Narrowphase
      collisionCount = resolveCollisions(
        this.entities,
        this.pairsBuffer,
        pairsCount,
        this.colliding,
      );
    }
    const end = performance.now();
    const time = end - start;
    this.times.push(time);
    this.frameCount++;
    return { time, collisionCount };
  }

  getRenderEntities(): RenderEntity[] {
    return this.entities;
  }

  getTimes() {
    return this.times;
  }
  clearTimes() {
    this.times = [];
  }

  /**
   * Gets positions for synchronization.
   */
  getPositions(): EntityState[] {
    return this.entitiesById.map((e) => ({
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      vx: e.vx,
      vy: e.vy,
      angle: e.angle,
      color: e.color,
    }));
  }

  /**
   * Sets positions and forces an immediate re-insertion of all leaves in the tree
   * to align the tree nodes with the new synchronized bounds.
   */
  setPositions(positions: EntityState[]) {
    // Clear and build from scratch to ensure identical tree structure
    this.tree = new AABBTree();
    const margin = 2.0;

    for (let i = 0; i < this.entitiesById.length; i++) {
      const e = this.entitiesById[i];
      const p = positions[i];
      e.x = p.x;
      e.y = p.y;
      e.w = p.w;
      e.h = p.h;
      e.vx = p.vx;
      e.vy = p.vy;
      e.angle = p.angle;
      e.color = p.color;

      const leaf = this.tree.createNode(
        e.x - margin,
        e.y - margin,
        e.x + e.w + margin,
        e.y + e.h + margin,
      );
      leaf.entity = e;
      e.leaf = leaf;
      this.tree.insertLeaf(leaf);
    }
  }
}

// Aliases for compatibility
export {
  updateMovement as updateOOPTreeMovement,
  runBroadphase as runOOPTreeBroadphase,
  resolveCollisions as resolveOOPTreePhysics,
};
