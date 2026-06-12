import * as fs from 'fs';
import * as path from 'path';

// Mock global fetch so WASM simulator can load benchmark_wasm_ecs.wasm in Node.js
globalThis.fetch = async (url: any) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  const cleanPath = urlStr.startsWith('/') ? urlStr.slice(1) : urlStr;
  const filePath = path.join(process.cwd(), 'public', cleanPath);
  const buffer = fs.readFileSync(filePath);
  return {
    arrayBuffer: async () => {
      // Return a copy to ensure ArrayBuffer alignment is correct
      const ab = new ArrayBuffer(buffer.length);
      const view = new Uint8Array(ab);
      view.set(buffer);
      return ab;
    }
  } as any;
};

// Global references filled by dynamic import
let OOPSimulator: any;
let OOPTreeSimulator: any;
let CustomECSSimulator: any;
let ECSTreeSimulator: any;
let BitECSSimulator: any;
let WasmECSSimulator: any;
let SeededPRNG: any;

const numEntities = 5000;
const width = 1000;
const height = 800;
const speedMultiplier = 1.0;
const benchmarkLength = 1000;

async function runBenchmarkForBehavior(behavior: 'wander' | 'erratic' | 'static') {
  console.log(`\nRunning benchmark for: ${behavior.toUpperCase()}...`);
  
  const sims = [
    new OOPSimulator(),
    new OOPTreeSimulator(),
    new CustomECSSimulator(),
    new ECSTreeSimulator(),
    new BitECSSimulator(),
    new WasmECSSimulator()
  ];

  // Initialize and get initial positions from OOP simulator to sync all of them
  const basePrng = new SeededPRNG(42);
  const oopBase = new OOPSimulator();
  oopBase.init(numEntities, width, height, basePrng);
  const initialPositions = oopBase.getPositions();

  // Initialize all simulators with the same initial positions and separate PRNGs
  const prngs = sims.map(() => new SeededPRNG(42));
  sims.forEach((sim, idx) => {
    sim.init(numEntities, width, height, prngs[idx]);
    sim.setPositions(initialPositions);
    sim.clearTimes();
  });

  // Warmup 50 frames (to let compilation/optimization warm up)
  for (let frame = 0; frame < 50; frame++) {
    const seed = frame + 1;
    sims.forEach((sim, idx) => {
      prngs[idx].setSeed(seed);
      sim.update(width, height, speedMultiplier, behavior, prngs[idx]);
    });
  }

  // Clear times recorded during warmup
  sims.forEach(sim => sim.clearTimes());

  // Run benchmark for 1000 frames
  for (let frame = 0; frame < benchmarkLength; frame++) {
    const seed = frame + 1;
    sims.forEach((sim, idx) => {
      prngs[idx].setSeed(seed);
      sim.update(width, height, speedMultiplier, behavior, prngs[idx]);
    });
  }

  // Collect results
  const results = sims.map(sim => {
    const times = sim.getTimes();
    times.sort((a, b) => a - b);
    
    const total = times.reduce((sum, val) => sum + val, 0);
    const avg = total / times.length;
    
    // 99th percentile
    const idx99 = Math.min(times.length - 1, Math.floor(times.length * 0.99));
    const p99 = times[idx99];

    return {
      name: sim.name,
      avg,
      p99
    };
  });

  // Calculate speedup vs OOP S&P
  const oopResult = results.find(r => r.name === 'OOP S&P')!;
  
  console.log(`\n| System | Avg Frame Time | 99th Percentile | Speedup vs OOP S&P |`);
  console.log(`| :--- | :--- | :--- | :--- |`);
  results.forEach(r => {
    const speedup = oopResult.avg / r.avg;
    console.log(`| ${r.name} | ${r.avg.toFixed(3)} ms | ${r.p99.toFixed(3)} ms | ${speedup.toFixed(2)}x |`);
  });

  console.log(`\n*Parameters:*`);
  console.log(`- Entity Count: ${numEntities}`);
  console.log(`- Spatial Coherence: ${behavior.charAt(0).toUpperCase() + behavior.slice(1)}`);
  console.log(`- Speed Multiplier: ${speedMultiplier}x`);
  console.log(`- Benchmark Length: ${benchmarkLength} frames`);
}

async function start() {
  const oopModule = await import('../src/benchmark_oop');
  OOPSimulator = oopModule.OOPSimulator;

  const oopTreeModule = await import('../src/benchmark_oop_tree');
  OOPTreeSimulator = oopTreeModule.OOPTreeSimulator;

  const customEcsModule = await import('../src/benchmark_custom_ecs');
  CustomECSSimulator = customEcsModule.CustomECSSimulator;

  const ecsTreeModule = await import('../src/benchmark_ecs_tree');
  ECSTreeSimulator = ecsTreeModule.ECSTreeSimulator;

  const bitecsModule = await import('../src/benchmark_bitecs');
  BitECSSimulator = bitecsModule.BitECSSimulator;

  const wasmEcsModule = await import('../src/benchmark_wasm_ecs');
  WasmECSSimulator = wasmEcsModule.WasmECSSimulator;

  const prngModule = await import('../src/prng');
  SeededPRNG = prngModule.SeededPRNG;

  await runBenchmarkForBehavior('wander');
  await runBenchmarkForBehavior('erratic');
  await runBenchmarkForBehavior('static');
}

start().catch(console.error);
