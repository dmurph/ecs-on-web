import { OOPTreeSimulator, TreeNode } from '../src/benchmark_oop_tree';
import { OOPSimulator, GameEntity } from '../src/benchmark_oop';
import { ECSTreeSimulator, FlatAABBTree } from '../src/benchmark_ecs_tree';
import { SeededPRNG } from '../src/prng';

const numEntities = 5000;
const w = 1000;
const h = 800;

// Helper to check overlaps
function overlaps(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
         a.minY <= b.maxY && a.maxY >= b.minY;
}

// 1. S&P Sweep Count
function runOOPBroadphaseCount(entities: GameEntity[]): { pairs: number, xChecks: number, yChecks: number } {
  let pairCount = 0;
  let xChecks = 0;
  let yChecks = 0;
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    const a = entities[i];
    const aRight = a.x + a.w;
    for (let j = i + 1; j < len; j++) {
      const b = entities[j];
      xChecks++;
      if (b.x > aRight) break;

      yChecks++;
      if (a.y < b.y + b.h && a.y + a.h > b.y) {
        pairCount++;
      }
    }
  }
  return { pairs: pairCount, xChecks, yChecks };
}

// 2. OOP Tree Broadphase Count
let oopTreeCalls = 0;
let oopTreeOverlapChecks = 0;
let oopTreeGeomChecks = 0;

function queryOverlapOOPCount(nodeA: TreeNode, nodeB: TreeNode, callback: (nodeA: TreeNode, nodeB: TreeNode) => void) {
  oopTreeCalls++;
  oopTreeOverlapChecks++;
  if (!overlaps(nodeA.aabb, nodeB.aabb)) return;

  if (nodeA.isLeaf() && nodeB.isLeaf()) {
    callback(nodeA, nodeB);
  } else if (nodeA.isLeaf()) {
    queryOverlapOOPCount(nodeA, nodeB.left!, callback);
    queryOverlapOOPCount(nodeA, nodeB.right!, callback);
  } else if (nodeB.isLeaf()) {
    queryOverlapOOPCount(nodeA.left!, nodeB, callback);
    queryOverlapOOPCount(nodeA.right!, nodeB, callback);
  } else {
    if (nodeA.height > nodeB.height) {
      queryOverlapOOPCount(nodeA.left!, nodeB, callback);
      queryOverlapOOPCount(nodeA.right!, nodeB, callback);
    } else {
      queryOverlapOOPCount(nodeA, nodeB.left!, callback);
      queryOverlapOOPCount(nodeA, nodeB.right!, callback);
    }
  }
}

function runOOPTreeBroadphaseCount(root: TreeNode | null): { pairs: number, calls: number, checks: number, geomChecks: number } {
  oopTreeCalls = 0;
  oopTreeOverlapChecks = 0;
  oopTreeGeomChecks = 0;
  let pairCount = 0;
  if (root === null) return { pairs: 0, calls: 0, checks: 0, geomChecks: 0 };

  const queryPairs = (node: TreeNode | null) => {
    if (node === null || node.isLeaf()) return;
    queryOverlapOOPCount(node.left!, node.right!, (nodeA, nodeB) => {
      oopTreeGeomChecks++;
      const a = nodeA.entity!;
      const b = nodeB.entity!;
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        pairCount++;
      }
    });
    queryPairs(node.left);
    queryPairs(node.right);
  };

  queryPairs(root);
  return { pairs: pairCount, calls: oopTreeCalls, checks: oopTreeOverlapChecks, geomChecks: oopTreeGeomChecks };
}

// 3. ECS Tree Broadphase Count (Recursive)
let ecsTreeCalls = 0;
let ecsTreeOverlapChecks = 0;
let ecsTreeGeomChecks = 0;
let maxChecksInSingleCall = 0;
let currentCallChecks = 0;

function queryOverlapECSCount(
  tree: FlatAABBTree,
  nodeA: number,
  nodeB: number,
  callback: (leafA: number, leafB: number) => void
) {
  ecsTreeCalls++;
  ecsTreeOverlapChecks++;
  currentCallChecks++;

  const overlap = tree.minX[nodeA] <= tree.maxX[nodeB] && tree.maxX[nodeA] >= tree.minX[nodeB] &&
                  tree.minY[nodeA] <= tree.maxY[nodeB] && tree.maxY[nodeA] >= tree.minY[nodeB];
  if (!overlap) return;

  const isLeafA = tree.left[nodeA] === -1;
  const isLeafB = tree.left[nodeB] === -1;

  if (isLeafA && isLeafB) {
    callback(nodeA, nodeB);
  } else if (isLeafA) {
    queryOverlapECSCount(tree, nodeA, tree.left[nodeB], callback);
    queryOverlapECSCount(tree, nodeA, tree.right[nodeB], callback);
  } else if (isLeafB) {
    queryOverlapECSCount(tree, tree.left[nodeA], nodeB, callback);
    queryOverlapECSCount(tree, tree.right[nodeA], nodeB, callback);
  } else {
    if (tree.height[nodeA] > tree.height[nodeB]) {
      queryOverlapECSCount(tree, tree.left[nodeA], nodeB, callback);
      queryOverlapECSCount(tree, tree.right[nodeA], nodeB, callback);
    } else {
      queryOverlapECSCount(tree, nodeA, tree.left[nodeB], callback);
      queryOverlapECSCount(tree, nodeA, tree.right[nodeB], callback);
    }
  }
}

function runECSTreeBroadphaseCount(tree: FlatAABBTree, posX: Float64Array, posYwh: Float64Array): { pairs: number, calls: number, checks: number, geomChecks: number, maxSingleCallChecks: number } {
  ecsTreeCalls = 0;
  ecsTreeOverlapChecks = 0;
  ecsTreeGeomChecks = 0;
  maxChecksInSingleCall = 0;
  let pairCount = 0;

  const queryPairs = (node: number) => {
    if (node === -1 || tree.left[node] === -1) return;
    
    currentCallChecks = 0;
    queryOverlapECSCount(tree, tree.left[node], tree.right[node], (leafA, leafB) => {
      ecsTreeGeomChecks++;
      const idA = tree.entity[leafA];
      const idB = tree.entity[leafB];
      const ax = posX[idA];
      const ay = posYwh[idA * 3 + 0];
      const aw = posYwh[idA * 3 + 1];
      const ah = posYwh[idA * 3 + 2];
      const bx = posX[idB];
      const by = posYwh[idB * 3 + 0];
      const bw = posYwh[idB * 3 + 1];
      const bh = posYwh[idB * 3 + 2];

      if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) {
        pairCount++;
      }
    });
    if (currentCallChecks > maxChecksInSingleCall) {
       maxChecksInSingleCall = currentCallChecks;
    }

    queryPairs(tree.left[node]);
    queryPairs(tree.right[node]);
  };

  queryPairs(tree.root);
  return { pairs: pairCount, calls: ecsTreeCalls, checks: ecsTreeOverlapChecks, geomChecks: ecsTreeGeomChecks, maxSingleCallChecks: maxChecksInSingleCall };
}

// Run comparison
const prng = new SeededPRNG(42);
const oopSim = new OOPSimulator();
oopSim.init(numEntities, w, h, prng);
const positions = oopSim.getPositions();

// S&P
const oopEntities = (oopSim as any).entities as GameEntity[];
oopEntities.sort((a, b) => a.x - b.x);
const spResults = runOOPBroadphaseCount(oopEntities);
console.log("=== OOP S&P Sweep Counts ===");
console.log(`  Pairs Found: ${spResults.pairs}`);
console.log(`  Total Checks: ${spResults.xChecks + spResults.yChecks}`);

// OOP Tree
const oopTreeSim = new OOPTreeSimulator();
oopTreeSim.init(numEntities, w, h, prng);
oopTreeSim.setPositions(positions);
const treeRoot = (oopTreeSim as any).tree.root;
const oopTreeResults = runOOPTreeBroadphaseCount(treeRoot);
console.log("\n=== OOP Tree Broadphase Counts ===");
console.log(`  Pairs Found: ${oopTreeResults.pairs}`);
console.log(`  Total Checks: ${oopTreeResults.checks + oopTreeResults.geomChecks}`);

// ECS Tree
const ecsTreeSim = new ECSTreeSimulator();
ecsTreeSim.init(numEntities, w, h, prng);
ecsTreeSim.setPositions(positions);
const ecsTree = (ecsTreeSim as any).tree as FlatAABBTree;
const ecsData = (ecsTreeSim as any).ecsData;

const ecsTreeResults = runECSTreeBroadphaseCount(ecsTree, ecsData.posX, ecsData.posYwh);
console.log("\n=== ECS Tree Broadphase Counts (Recursive) ===");
console.log(`  Pairs Found: ${ecsTreeResults.pairs}`);
console.log(`  Total Checks: ${ecsTreeResults.checks + ecsTreeResults.geomChecks}`);
console.log(`  Max Checks in Single queryOverlap: ${ecsTreeResults.maxSingleCallChecks}`);
