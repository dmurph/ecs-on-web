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
let SortMethod: any;

const width = 1000;
const height = 800;
const speedMultiplier = 1.0;
const benchmarkLength = 200; // 200 frames

async function runBenchmarkForBehavior(numEntities: number, behavior: 'wander' | 'erratic' | 'static') {
  console.log(`\nRunning benchmark for: ${behavior.toUpperCase()} with ${numEntities} entities...`);
  
  const sims = [
    { instance: new OOPSimulator(SortMethod.Insertion), name: 'OOP S&P (Insertion)' },
    { instance: new OOPSimulator(SortMethod.Quick), name: 'OOP S&P (Quick)' },
    { instance: new OOPSimulator(SortMethod.Merge), name: 'OOP S&P (Merge)' },
    { instance: new OOPSimulator(SortMethod.Native), name: 'OOP S&P (Native)' },
    { instance: new OOPTreeSimulator(), name: 'OOP Tree' },
    
    { instance: new CustomECSSimulator(SortMethod.Insertion), name: 'Custom ECS S&P (Insertion)' },
    { instance: new CustomECSSimulator(SortMethod.Quick), name: 'Custom ECS S&P (Quick)' },
    { instance: new CustomECSSimulator(SortMethod.Merge), name: 'Custom ECS S&P (Merge)' },
    { instance: new CustomECSSimulator(SortMethod.Native), name: 'Custom ECS S&P (Native)' },
    { instance: new ECSTreeSimulator(), name: 'ECS Tree' },
    
    { instance: new BitECSSimulator('insertion'), name: 'bitECS S&P (Insertion)' },
    { instance: new BitECSSimulator('quick'), name: 'bitECS S&P (Quick)' },
    { instance: new BitECSSimulator('merge'), name: 'bitECS S&P (Merge)' },
    { instance: new BitECSSimulator('native'), name: 'bitECS S&P (Native)' },
    
    { instance: new WasmECSSimulator(SortMethod.Insertion), name: 'WASM ECS S&P (Insertion)' },
    { instance: new WasmECSSimulator(SortMethod.Quick), name: 'WASM ECS S&P (Quick)' },
    { instance: new WasmECSSimulator(SortMethod.Merge), name: 'WASM ECS S&P (Merge)' }
  ];

  // Initialize and get initial positions from OOP simulator to sync all of them
  const basePrng = new SeededPRNG(42);
  const oopBase = new OOPSimulator(SortMethod.Insertion);
  oopBase.init(numEntities, width, height, basePrng);
  const initialPositions = oopBase.getPositions();

  // Initialize all simulators with the same initial positions and separate PRNGs
  const prngs = sims.map(() => new SeededPRNG(42));
  sims.forEach((sim, idx) => {
    sim.instance.init(numEntities, width, height, prngs[idx]);
    sim.instance.setPositions(initialPositions);
    sim.instance.clearTimes();
  });

  // Warmup 50 frames
  for (let frame = 0; frame < 50; frame++) {
    const seed = frame + 1;
    sims.forEach((sim, idx) => {
      prngs[idx].setSeed(seed);
      sim.instance.update(width, height, speedMultiplier, behavior, prngs[idx]);
    });
  }

  // Clear times recorded during warmup
  sims.forEach(sim => sim.instance.clearTimes());

  // Run benchmark
  for (let frame = 0; frame < benchmarkLength; frame++) {
    const seed = frame + 1;
    sims.forEach((sim, idx) => {
      prngs[idx].setSeed(seed);
      sim.instance.update(width, height, speedMultiplier, behavior, prngs[idx]);
    });
  }

  // Collect results
  const results = sims.map(sim => {
    const times = sim.instance.getTimes();
    times.sort((a, b) => a - b);
    
    const total = times.reduce((sum, val) => sum + val, 0);
    const avg = total / times.length;
    
    const idx99 = Math.min(times.length - 1, Math.floor(times.length * 0.99));
    const p99 = times[idx99];

    return {
      name: sim.name,
      avg,
      p99
    };
  });

  // Calculate speedup vs OOP S&P (Insertion)
  const oopResult = results.find(r => r.name === 'OOP S&P (Insertion)')!;
  
  console.log(`\n### Results for ${behavior.toUpperCase()} (${numEntities} entities)`);
  console.log(`| System | Avg Frame Time | 99th Percentile | Speedup vs OOP S&P (Insertion) |`);
  console.log(`| :--- | :--- | :--- | :--- |`);
  results.forEach(r => {
    const speedup = oopResult.avg / r.avg;
    console.log(`| ${r.name} | ${r.avg.toFixed(3)} ms | ${r.p99.toFixed(3)} ms | ${speedup.toFixed(2)}x |`);
  });
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

  const configModule = await import('../src/config');
  SortMethod = configModule.SortMethod;

  // Run 5000 entities
  await runBenchmarkForBehavior(5000, 'wander');
  await runBenchmarkForBehavior(5000, 'erratic');
  await runBenchmarkForBehavior(5000, 'static');

  // Run 15000 entities
  await runBenchmarkForBehavior(15000, 'wander');
  await runBenchmarkForBehavior(15000, 'erratic');
  await runBenchmarkForBehavior(15000, 'static');
}

start().catch(console.error);
