import { AABBTree, TreeNode, updateTree, runOOPTreeBroadphase } from '../src/benchmark_oop_tree';
import { GameEntity, runOOPBroadphase, resolveOOPPhysics } from '../src/benchmark_oop';

const numEntities = 5000;
const w = 1000;
const h = 800;

// Initialize
const oopEntities: GameEntity[] = [];
const oopTreeEntities: GameEntity[] = [];
const oopTreeEntitiesById: GameEntity[] = new Array(numEntities);

for (let i = 0; i < numEntities; i++) {
  const entity = new GameEntity(i, w, h);
  oopEntities.push(entity);
  
  const treeEntity = new GameEntity(i, w, h);
  treeEntity.x = entity.x;
  treeEntity.y = entity.y;
  treeEntity.w = entity.w;
  treeEntity.h = entity.h;
  oopTreeEntities.push(treeEntity);
  oopTreeEntitiesById[i] = treeEntity;
}

const oopTree = new AABBTree();
const oopTreeLeaves = new Array<TreeNode>(numEntities);
const margin = 2.0;

for (let i = 0; i < numEntities; i++) {
  const entity = oopTreeEntities[i];
  const leaf = oopTree.createNode(
    entity.x - margin,
    entity.y - margin,
    entity.x + entity.w + margin,
    entity.y + entity.h + margin
  );
  leaf.entityId = entity.id;
  oopTreeLeaves[entity.id] = leaf;
  oopTree.insertLeaf(leaf);
}

const oopTreePairsBuffer = new Int32Array(200000 * 2);
const oopTreeColliding = new Uint8Array(numEntities);

// Test Wander Mode
console.log("Benchmarking Wander Mode for 100 frames...");
let totalUpdateTreeTime = 0;
let totalBroadphaseTime = 0;
let totalNarrowphaseTime = 0;
let totalFrames = 100;

for (let frame = 1; frame <= totalFrames; frame++) {
  // Move entities
  for (let i = 0; i < numEntities; i++) {
    oopEntities[i].updateWander(w, h, 1.0);
    // sync
    oopTreeEntitiesById[i].x = oopEntities[i].x;
    oopTreeEntitiesById[i].y = oopEntities[i].y;
  }
  
  // Time updateTree
  const t0 = performance.now();
  updateTree(oopTree, oopTreeLeaves, oopTreeEntities, frame);
  const t1 = performance.now();
  totalUpdateTreeTime += (t1 - t0);
  
  // Time broadphase
  const t2 = performance.now();
  runOOPTreeBroadphase(oopTree.root, oopTreeEntitiesById, oopTreePairsBuffer);
  const t3 = performance.now();
  totalBroadphaseTime += (t3 - t2);
  
  // Time narrowphase
  const t4 = performance.now();
  resolveOOPPhysics(oopTreeEntities, oopTreeColliding, oopTreePairsBuffer);
  const t5 = performance.now();
  totalNarrowphaseTime += (t5 - t4);
}

console.log(`Wander Mode Averages:`);
console.log(`  updateTree: ${(totalUpdateTreeTime / totalFrames).toFixed(3)} ms`);
console.log(`  broadphase: ${(totalBroadphaseTime / totalFrames).toFixed(3)} ms`);
console.log(`  narrowphase: ${(totalNarrowphaseTime / totalFrames).toFixed(3)} ms`);
console.log(`  Total: ${((totalUpdateTreeTime + totalBroadphaseTime + totalNarrowphaseTime) / totalFrames).toFixed(3)} ms`);

// Test Static Mode
console.log("\nBenchmarking Static Mode for 100 frames...");
totalUpdateTreeTime = 0;
totalBroadphaseTime = 0;
totalNarrowphaseTime = 0;

for (let frame = 1; frame <= totalFrames; frame++) {
  // Time updateTree (no moves)
  const t0 = performance.now();
  updateTree(oopTree, oopTreeLeaves, oopTreeEntities, frame);
  const t1 = performance.now();
  totalUpdateTreeTime += (t1 - t0);
  
  // Time broadphase
  const t2 = performance.now();
  runOOPTreeBroadphase(oopTree.root, oopTreeEntitiesById, oopTreePairsBuffer);
  const t3 = performance.now();
  totalBroadphaseTime += (t3 - t2);
  
  // Time narrowphase
  const t4 = performance.now();
  resolveOOPPhysics(oopTreeEntities, oopTreeColliding, oopTreePairsBuffer);
  const t5 = performance.now();
  totalNarrowphaseTime += (t5 - t4);
}

console.log(`Static Mode Averages:`);
console.log(`  updateTree: ${(totalUpdateTreeTime / totalFrames).toFixed(3)} ms`);
console.log(`  broadphase: ${(totalBroadphaseTime / totalFrames).toFixed(3)} ms`);
console.log(`  narrowphase: ${(totalNarrowphaseTime / totalFrames).toFixed(3)} ms`);
console.log(`  Total: ${((totalUpdateTreeTime + totalBroadphaseTime + totalNarrowphaseTime) / totalFrames).toFixed(3)} ms`);
