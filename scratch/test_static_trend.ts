import { OOPSimulator } from '../src/benchmark_oop';
import { OOPTreeSimulator } from '../src/benchmark_oop_tree';
import { CustomECSSimulator } from '../src/benchmark_custom_ecs';
import { ECSTreeSimulator } from '../src/benchmark_ecs_tree';
import { SeededPRNG } from '../src/prng';

const numEntities = 5000;
const w = 1000;
const h = 800;
const totalFrames = 2000;
const interval = 200;

function runTest(sim: any, name: string, sharedPositions?: any[]) {
  console.log(`\n=== Testing ${name} in Static Mode for ${totalFrames} frames ===`);
  const prng = new SeededPRNG(42);
  sim.init(numEntities, w, h, prng);
  
  if (sharedPositions) {
    sim.setPositions(sharedPositions);
  }

  let intervalTimes: number[] = [];
  
  for (let frame = 1; frame <= totalFrames; frame++) {
    const result = sim.update(w, h, 1.0, 'static', prng);
    intervalTimes.push(result.time);
    
    if (frame % interval === 0) {
      const avg = intervalTimes.reduce((a, b) => a + b, 0) / intervalTimes.length;
      let height = -1;
      if (sim.tree) {
        const root = sim.tree.root;
        if (root !== null && root !== -1) {
          if (typeof root === 'number') {
            height = sim.tree.height[root];
          } else {
            height = root.height;
          }
        }
      }
      console.log(`  Frames ${frame - interval + 1} - ${frame}: Avg Time = ${avg.toFixed(4)} ms${height !== -1 ? `, Tree Height = ${height}` : ''}`);
      intervalTimes = [];
    }
  }
}

const baselineSim = new OOPSimulator();
runTest(baselineSim, "OOP S&P");
const positions = baselineSim.getPositions();

const oopTreeSim = new OOPTreeSimulator();
runTest(oopTreeSim, "OOP Tree", positions);

const ecsSim = new CustomECSSimulator();
runTest(ecsSim, "ECS S&P", positions);

const ecsTreeSim = new ECSTreeSimulator();
runTest(ecsTreeSim, "ECS Tree", positions);
