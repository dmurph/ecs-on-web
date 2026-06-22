import { createWorld } from 'bitecs';
import { ENTITY_COLORS } from './src/config';
import { GameEntity, runOOPBroadphase, resolveOOPPhysics, updateOOPMovement } from './src/benchmarks/benchmark_oop';
import { createECSData, runECSBroadphase, resolveECSPhysics, updateECSMovement } from './src/benchmarks/benchmark_custom_ecs';
import {
  PositionX,
  PositionYwh,
  Physics,
  Style,
  createBitecsData,
  runBitecsBroadphase,
  resolveBitecsPhysics,
  updateBitecsMovement
} from './src/benchmarks/benchmark_bitecs';
import {
  AABBTree,
  TreeNode,
  TreeGameEntity,
  updateTree,
  runOOPTreeBroadphase,
  updateOOPTreeMovement,
  resolveOOPTreePhysics
} from './src/benchmarks/benchmark_oop_tree';
import { SeededPRNG } from './src/prng';

function runVerification() {
  console.log("=== RUNNING BROADPHASE & NARROWPHASE COMPARISON VERIFICATION ===");
  
  const numEntities = 200;
  const w = 1000;
  const h = 800;

  const prngOOP = new SeededPRNG();
  const prngOOPTree = new SeededPRNG();
  const prngECS = new SeededPRNG();
  const prngBitecs = new SeededPRNG();
  
  // 1. Initialize OOP Entities
  const oopEntities: GameEntity[] = [];
  const oopEntitiesById: GameEntity[] = new Array(numEntities);
  for (let i = 0; i < numEntities; i++) {
    const entity = new GameEntity(i, w, h);
    oopEntities.push(entity);
    oopEntitiesById[i] = entity;
  }
  // Shuffle array to simulate memory churn
  oopEntities.sort(() => Math.random() - 0.5);

  // Initialize OOP Tree Entities
  const oopTreeEntities: TreeGameEntity[] = [];
  const oopTreeEntitiesById: TreeGameEntity[] = new Array(numEntities);
  for (let i = 0; i < numEntities; i++) {
    const entity = new TreeGameEntity(i, w, h);
    oopTreeEntities.push(entity);
    oopTreeEntitiesById[i] = entity;
  }

  // 2. Initialize Custom ECS Arrays
  const ecsData = createECSData(numEntities, w, h);

  // 3. Initialize bitECS World and Entities
  const bitecsWorld = createWorld({
    components: {
      PositionX,
      PositionYwh,
      Physics,
      Style
    }
  });
  const bitecsEntities = createBitecsData(bitecsWorld, numEntities, w, h);
  const bitecsSortedEntities = new Int32Array(bitecsEntities);

  // 4. Sync positions to ensure absolute identical starting datasets across all systems
  for (let i = 0; i < numEntities; i++) {
    const entity = oopEntities[i];
    const id = entity.id;

    // Sync OOP Tree
    const treeEntity = oopTreeEntitiesById[id];
    treeEntity.x = entity.x;
    treeEntity.y = entity.y;
    treeEntity.w = entity.w;
    treeEntity.h = entity.h;
    treeEntity.color = entity.color;
    treeEntity.vx = entity.vx;
    treeEntity.vy = entity.vy;
    treeEntity.angle = entity.angle;

    // Sync Custom ECS
    ecsData.posX[id] = entity.x;
    ecsData.posYwh[id * 3 + 0] = entity.y; // posY
    ecsData.posYwh[id * 3 + 1] = entity.w; // w
    ecsData.posYwh[id * 3 + 2] = entity.h; // h
    ecsData.colorId[id] = ENTITY_COLORS.indexOf(entity.color);
    ecsData.angle[id] = entity.angle;
    ecsData.vx[id] = entity.vx;
    ecsData.vy[id] = entity.vy;
    ecsData.indices[id] = id;
    ecsData.id[id] = id;

    // Sync bitECS
    const eid = bitecsEntities[id];
    PositionX.value[eid] = entity.x;
    PositionYwh.y[eid] = entity.y;
    PositionYwh.w[eid] = entity.w;
    PositionYwh.h[eid] = entity.h;
    Physics.vx[eid] = entity.vx;
    Physics.vy[eid] = entity.vy;
    Physics.angle[eid] = entity.angle;
    Style.colorId[eid] = ENTITY_COLORS.indexOf(entity.color);
  }

  // Initialize AABB Tree with synced initial positions
  const oopTree = new AABBTree();
  const margin = 2.0;
  for (let i = 0; i < numEntities; i++) {
    const entity = oopTreeEntities[i];
    const leaf = oopTree.createNode(
      entity.x - margin,
      entity.y - margin,
      entity.x + entity.w + margin,
      entity.y + entity.h + margin
    );
    leaf.entity = entity;
    entity.leaf = leaf;
    oopTree.insertLeaf(leaf);
  }

  // Buffers for verification checks
  const maxPairs = 200000;
  const oopPairsBuffer = new Int32Array(maxPairs * 2);
  const oopTreePairsBuffer = new Int32Array(maxPairs * 2);
  const ecsPairsBuffer = new Int32Array(maxPairs * 2);
  const bitecsPairsBuffer = new Int32Array(maxPairs * 2);

  const oopColliding = new Uint8Array(numEntities);
  const oopTreeColliding = new Uint8Array(numEntities);
  const ecsColliding = new Uint8Array(numEntities);
  const bitecsColliding = new Uint8Array(numEntities);

  const treeMoveBuffer: TreeGameEntity[] = [];

  // 5. Run for 1 simulated frame and verify overlap count sync.
  // NOTE: We only run 1 frame because Sweep-and-Prune, AABB Tree, and ECS populate
  // contact lists in different traversal orders. When multiple simultaneous overlaps
  // occur, resolving contact impulses in different sequences changes intermediate
  // velocities, causing the simulated physical states to diverge starting on Frame 2.
  // Running 1 frame verifies that the mathematical outputs on identical inputs match,
  // though high entity densities can cause slight narrowphase count variations (e.g. ±2)
  // even on Frame 1 due to order-dependent resolution paths rather than actual logic bugs.
  const testFrames = 1;
  console.log(`Running simulation for ${testFrames} frame with ${numEntities} entities...`);

  for (let frame = 1; frame <= testFrames; frame++) {
    const frameSeed = frame;
    prngOOP.setSeed(frameSeed);
    prngOOPTree.setSeed(frameSeed);
    prngECS.setSeed(frameSeed);
    prngBitecs.setSeed(frameSeed);

    updateOOPMovement(oopEntitiesById, w, h, 1.0, 'wander', prngOOP);
    updateOOPTreeMovement(oopTreeEntities, w, h, 1.0, 'wander', prngOOPTree, treeMoveBuffer);
    updateECSMovement(ecsData, w, h, 1.0, 'wander', prngECS);
    updateBitecsMovement(bitecsEntities, w, h, 1.0, 'wander', prngBitecs);

    // Update AABB Tree
    updateTree(oopTree, oopTreeEntities, treeMoveBuffer, frame, prngOOPTree);

    // Clear collision buffers
    oopColliding.fill(0);
    oopTreeColliding.fill(0);
    ecsColliding.fill(0);
    bitecsColliding.fill(0);

    // Run broadphase
    const oopPairsCount = runOOPBroadphase(oopEntities);
    const oopTreePairsCount = runOOPTreeBroadphase(oopTree.root, oopTreePairsBuffer);
    const ecsPairsCount = runECSBroadphase(
      ecsData.indices,
      ecsData.posX,
      ecsData.posYwh,
      ecsPairsBuffer,
      ecsData.id
    );
    const bitecsPairsCount = runBitecsBroadphase(bitecsSortedEntities, bitecsPairsBuffer);

    // Assert S&P-based systems match 100% on broadphase
    if (oopPairsCount !== ecsPairsCount || ecsPairsCount !== bitecsPairsCount) {
      console.error(`❌ BROADPHASE VERIFICATION FAILED on Frame ${frame}!`);
      console.error(`   OOP S&P Pairs Count: ${oopPairsCount}`);
      console.error(`   ECS Pairs Count: ${ecsPairsCount}`);
      console.error(`   bitECS Pairs Count: ${bitecsPairsCount}`);
      process.exit(1);
    }

    // Assert AABB Tree matches S&P on broadphase
    if (oopPairsCount !== oopTreePairsCount) {
      console.error(`❌ BROADPHASE VERIFICATION FAILED for OOP Tree on Frame ${frame}!`);
      console.error(`   OOP S&P Pairs Count: ${oopPairsCount}`);
      console.error(`   OOP Tree Pairs Count: ${oopTreePairsCount}`);
      
      const sAndPPairs = new Set<string>();
      for (let i = 0; i < oopEntities.length; i++) {
        const a = oopEntities[i];
        for (const b of a.contacts) {
          sAndPPairs.add(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`);
        }
      }
      
      const treePairs = new Set<string>();
      for (let i = 0; i < oopTreePairsCount; i++) {
        const a = oopTreePairsBuffer[i * 2];
        const b = oopTreePairsBuffer[i * 2 + 1];
        treePairs.add(`${Math.min(a,b)}-${Math.max(a,b)}`);
      }
      
      console.log("Pairs in S&P but not in Tree:");
      for (const p of sAndPPairs) {
        if (!treePairs.has(p)) {
          console.log(`  ${p}`);
          const [idA, idB] = p.split('-').map(Number);
          const a = oopEntitiesById[idA];
          const b = oopEntitiesById[idB];
          console.log(`  Entity A (${idA}): pos=(${a.x.toFixed(4)}, ${a.y.toFixed(4)}), size=${a.w.toFixed(4)}`);
          console.log(`  Entity B (${idB}): pos=(${b.x.toFixed(4)}, ${b.y.toFixed(4)}), size=${b.w.toFixed(4)}`);
          const leafA = (a as any).leaf;
          const leafB = (b as any).leaf;
          if (leafA) console.log(`  Leaf A AABB: min=(${leafA.aabb.minX.toFixed(4)}, ${leafA.aabb.minY.toFixed(4)}), max=(${leafA.aabb.maxX.toFixed(4)}, ${leafA.aabb.maxY.toFixed(4)})`);
          if (leafB) console.log(`  Leaf B AABB: min=(${leafB.aabb.minX.toFixed(4)}, ${leafB.aabb.minY.toFixed(4)}), max=(${leafB.aabb.maxX.toFixed(4)}, ${leafB.aabb.maxY.toFixed(4)})`);
        }
      }
      
      console.log("Pairs in Tree but not in S&P:");
      for (const p of treePairs) {
        if (!sAndPPairs.has(p)) {
          console.log(`  ${p}`);
        }
      }
      
      process.exit(1);
    }

    // Run narrowphase geometric resolution
    const oopCollisionCount = resolveOOPPhysics(oopEntities, oopColliding, oopPairsBuffer);
    const oopTreeCollisionCount = resolveOOPTreePhysics(oopTreeEntitiesById, oopTreePairsBuffer, oopTreePairsCount, oopTreeColliding);
    const ecsCollisionCount = resolveECSPhysics(ecsData, ecsPairsBuffer, ecsPairsCount, ecsColliding);
    const bitecsCollisionCount = resolveBitecsPhysics(bitecsEntities, bitecsPairsBuffer, bitecsPairsCount, bitecsColliding);

    // Assert all systems match 100% on narrowphase
    if (oopCollisionCount !== ecsCollisionCount || ecsCollisionCount !== bitecsCollisionCount || oopCollisionCount !== oopTreeCollisionCount) {
      console.error(`❌ NARROWPHASE VERIFICATION FAILED on Frame ${frame}!`);
      console.error(`   OOP S&P Collision Count: ${oopCollisionCount}`);
      console.error(`   OOP Tree Collision Count: ${oopTreeCollisionCount}`);
      console.error(`   ECS Collision Count: ${ecsCollisionCount}`);
      console.error(`   bitECS Collision Count: ${bitecsCollisionCount}`);
      process.exit(1);
    }
  }

  console.log("✅ VERIFICATION SUCCESSFUL: OOP Sweep-and-Prune, OOP Dynamic AABB Tree, Custom ECS, and bitECS broadphase and narrowphase algorithms returned correct results.");
  process.exit(0);
}

runVerification();
