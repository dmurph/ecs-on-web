import { OOPSimulator } from '../src/benchmark_oop';
import { OOPTreeSimulator, runOOPTreeBroadphase, setDebugRotations as setOopDebug } from '../src/benchmark_oop_tree';
import { CustomECSSimulator } from '../src/benchmark_custom_ecs';
import { ECSTreeSimulator, runFlatTreeBroadphase, setDebugRotations as setEcsDebug } from '../src/benchmark_ecs_tree';
import { BitECSSimulator } from '../src/benchmark_bitecs';
import { SeededPRNG } from '../src/prng';

const numEntities = 1000;
const w = 1000;
const h = 800;
const totalFrames = 100;
const speedMultiplier = 1.0;
const behavior = 'wander';

const simulators = [
  new OOPSimulator(),
  new OOPTreeSimulator(),
  new CustomECSSimulator(),
  new ECSTreeSimulator(),
  new BitECSSimulator()
];

// Initialize all with the same PRNG seed
const initPrng = new SeededPRNG();
initPrng.setSeed(42);

console.log(`Initializing all simulators with ${numEntities} entities...`);
for (const sim of simulators) {
  // Re-seed before each init to give identical start conditions if the init consumes PRNG
  initPrng.setSeed(42);
  sim.init(numEntities, w, h, initPrng);
}

// Sync all positions to match the OOP simulator baseline exactly
const oopSim = simulators[0];
const baselinePositions = oopSim.getPositions();
for (let i = 1; i < simulators.length; i++) {
  simulators[i].setPositions(baselinePositions);
}

// Enable rotation logs for updates
setOopDebug(false);
setEcsDebug(false);

console.log("Starting simulation parity check...");
let mismatchCount = 0;

for (let frame = 1; frame <= totalFrames; frame++) {
  const framePrng = new SeededPRNG();
  const frameSeed = frame; // same seed formula as in main.ts loop


  const results: Record<string, { collisionCount: number; positions: any[] }> = {};

  for (const sim of simulators) {
    framePrng.setSeed(frameSeed);
    const updateResult = sim.update(w, h, speedMultiplier, behavior, framePrng);
    results[sim.id] = {
      collisionCount: updateResult.collisionCount,
      positions: sim.getPositions()
    };
  }

  // Compare results
  const baselineSP = results['oop'];
  const baselineTree = results['oop-tree'];
  const errors: string[] = [];

  // 1. Verify S&P simulators against OOP S&P baseline
  for (const id of ['ecs', 'bitecs']) {
    const res = results[id];
    if (res.collisionCount !== baselineSP.collisionCount) {
      errors.push(`  - [${id}] Collision count mismatch: expected S&P ${baselineSP.collisionCount}, got ${res.collisionCount}`);
    }
    let posMismatch = 0;
    let sampleLog = '';
    for (let i = 0; i < numEntities; i++) {
      const posA = baselineSP.positions[i];
      const posB = res.positions[i];
      const dx = Math.abs(posA.x - posB.x);
      const dy = Math.abs(posA.y - posB.y);
      const dvx = Math.abs(posA.vx - posB.vx);
      const dvy = Math.abs(posA.vy - posB.vy);
      let dangle = Math.abs(posA.angle - posB.angle);
      dangle = Math.min(dangle, 2 * Math.PI - dangle);

      if (dx > 0.0001 || dy > 0.0001 || dvx > 0.0001 || dvy > 0.0001 || dangle > 0.0001) {
        posMismatch++;
        if (posMismatch <= 3) {
          sampleLog += `\n    Entity ${i} S&P vs ${id}: baseline(pos:[${posA.x.toFixed(4)},${posA.y.toFixed(4)}], vel:[${posA.vx.toFixed(4)},${posA.vy.toFixed(4)}], ang:${posA.angle.toFixed(4)}) vs got(pos:[${posB.x.toFixed(4)},${posB.y.toFixed(4)}], vel:[${posB.vx.toFixed(4)},${posB.vy.toFixed(4)}], ang:${posB.angle.toFixed(4)}), diff(pos:[${dx.toExponential(2)},${dy.toExponential(2)}], vel:[${dvx.toExponential(2)},${dvy.toExponential(2)}], ang:${dangle.toExponential(2)})`;
        }
      }
    }
    if (posMismatch > 0) {
      errors.push(`  - [${id}] State mismatch in ${posMismatch}/${numEntities} entities vs OOP S&P:${sampleLog}`);
    }
  }

  // 2. Verify ECS Tree against OOP Tree baseline
  const ecsTree = results['ecs-tree'];
  if (ecsTree.collisionCount !== baselineTree.collisionCount) {
    errors.push(`  - [ECS Tree] Collision count mismatch vs OOP Tree: expected ${baselineTree.collisionCount}, got ${ecsTree.collisionCount}`);
  }
  let posMismatchTree = 0;
  let sampleLogTree = '';
  for (let i = 0; i < numEntities; i++) {
    const posA = baselineTree.positions[i];
    const posB = ecsTree.positions[i];
    const dx = Math.abs(posA.x - posB.x);
    const dy = Math.abs(posA.y - posB.y);
    const dvx = Math.abs(posA.vx - posB.vx);
    const dvy = Math.abs(posA.vy - posB.vy);
    let dangle = Math.abs(posA.angle - posB.angle);
    dangle = Math.min(dangle, 2 * Math.PI - dangle);

    if (dx > 0.0001 || dy > 0.0001 || dvx > 0.0001 || dvy > 0.0001 || dangle > 0.0001) {
      posMismatchTree++;
      if (posMismatchTree <= 3) {
        sampleLogTree += `\n    Entity ${i} OOPTree vs ECSTree: baseline(pos:[${posA.x.toFixed(4)},${posA.y.toFixed(4)}], vel:[${posA.vx.toFixed(4)},${posA.vy.toFixed(4)}], ang:${posA.angle.toFixed(4)}) vs got(pos:[${posB.x.toFixed(4)},${posB.y.toFixed(4)}], vel:[${posB.vx.toFixed(4)},${posB.vy.toFixed(4)}], ang:${posB.angle.toFixed(4)}), diff(pos:[${dx.toExponential(2)},${dy.toExponential(2)}], vel:[${dvx.toExponential(2)},${dvy.toExponential(2)}], ang:${dangle.toExponential(2)})`;
      }
    }
  }
  if (posMismatchTree > 0) {
    errors.push(`  - [ECS Tree] State mismatch in ${posMismatchTree}/${numEntities} entities vs OOP Tree:${sampleLogTree}`);
  }

  // 3. Verify that Tree broadphase gets the same collision counts as S&P on Frame 1
  if (frame === 1 && baselineTree.collisionCount !== baselineSP.collisionCount) {
    errors.push(`  - [OOP Tree] Collision count mismatch vs OOP S&P on Frame 1: expected ${baselineSP.collisionCount}, got ${baselineTree.collisionCount}`);
  }

  if (errors.length > 0) {
    console.log(`\n❌ Frame ${frame} MISMATCH:`);
    errors.forEach(err => console.log(err));

    // Print broadphase pairs for debugging on the first mismatch
    if (mismatchCount === 0) {
      const oopTreeSim = simulators[1] as any;
      const ecsTreeSim = simulators[3] as any;

      // 1. Run OOP Tree Broadphase manually to collect pairs
      const oopPairs: string[] = [];
      const oopPairsBuffer = new Int32Array(10000);
      const oopTree = oopTreeSim.tree;
      const oopEntitiesById = oopTreeSim.entitiesById;
      const oopCount = runOOPTreeBroadphase(oopTree.root, oopPairsBuffer);
      for (let i = 0; i < oopCount; i++) {
        oopPairs.push(`(${oopPairsBuffer[i * 2]},${oopPairsBuffer[i * 2 + 1]})`);
      }

      // 2. Run ECS Tree Broadphase manually to collect pairs
      const ecsPairs: string[] = [];
      const ecsPairsBuffer = new Int32Array(10000);
      const ecsTree = ecsTreeSim.tree;
      const ecsData = ecsTreeSim.ecsData;
      const ecsCount = runFlatTreeBroadphase(ecsTree, ecsData.posX, ecsData.posYwh, ecsPairsBuffer);
      for (let i = 0; i < ecsCount; i++) {
        ecsPairs.push(`(${ecsPairsBuffer[i * 2]},${ecsPairsBuffer[i * 2 + 1]})`);
      }

      console.log(`\n    Broadphase Pairs Comparison (Frame ${frame}):`);
      console.log(`      OOP Tree Count: ${oopCount}, Pairs: ${oopPairs.slice(0, 30).join(', ')}${oopCount > 30 ? '...' : ''}`);
      console.log(`      ECS Tree Count: ${ecsCount}, Pairs: ${ecsPairs.slice(0, 30).join(', ')}${ecsCount > 30 ? '...' : ''}`);

      // Find differences
      const oopSet = new Set(oopPairs);
      const ecsSet = new Set(ecsPairs);
      const onlyOOP = oopPairs.filter(p => !ecsSet.has(p));
      const onlyECS = ecsPairs.filter(p => !oopSet.has(p));

      if (onlyOOP.length > 0) {
        console.log(`      Only in OOP Tree: ${onlyOOP.join(', ')}`);
      }
      if (onlyECS.length > 0) {
        console.log(`      Only in ECS Tree: ${onlyECS.join(', ')}`);
      }
    }

    mismatchCount++;
    if (mismatchCount > 5) {
      console.log("\nToo many mismatches. Aborting.");
      process.exit(1);
    }
  }
}

if (mismatchCount === 0) {
  console.log("\n✅ Success! All 5 simulators are in perfect synchronization across 100 frames.");
} else {
  console.log(`\n❌ Verification failed with ${mismatchCount} frames mismatching.`);
  process.exit(1);
}
