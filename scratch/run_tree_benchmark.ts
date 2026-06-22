import * as fs from 'fs';
import * as path from 'path';

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

async function start() {
  const oopModule = await import('../src/benchmark_oop');
  const ecsTreeModule = await import('../src/benchmark_ecs_tree');
  const wasmTreeModule = await import('../src/benchmark_wasm_tree');
  const prngModule = await import('../src/prng');
  const configModule = await import('../src/config');

  const OOPSimulator = oopModule.OOPSimulator;
  const ECSTreeSimulator = ecsTreeModule.ECSTreeSimulator;
  const WasmTreeSimulator = wasmTreeModule.WasmTreeSimulator;
  const SeededPRNG = prngModule.SeededPRNG;
  const SortMethod = configModule.SortMethod;

  const numEntities = 15000;
  const width = 1000;
  const height = 800;
  const benchmarkLength = 50; // 50 frames

  for (const behavior of ['wander', 'erratic', 'static']) {
    console.log(`\n=== Testing ${behavior.toUpperCase()} (${numEntities} entities, 50 frames) ===`);
    
    const basePrng = new SeededPRNG(42);
    const oopBase = new OOPSimulator(SortMethod.Insertion);
    oopBase.init(numEntities, width, height, basePrng);
    const initialPositions = oopBase.getPositions();

    const sims = [
      { instance: new ECSTreeSimulator(), name: 'JS ECS Tree' },
      { instance: new WasmTreeSimulator(), name: 'WASM Tree' }
    ];

    const prngs = sims.map(() => new SeededPRNG(42));
    sims.forEach((sim, idx) => {
      sim.instance.init(numEntities, width, height, prngs[idx]);
      sim.instance.setPositions(initialPositions);
      sim.instance.clearTimes();
    });

    // Warmup 10 frames
    for (let f = 0; f < 10; f++) {
      sims.forEach((sim, idx) => {
        prngs[idx].setSeed(f + 1);
        sim.instance.update(width, height, 1.0, behavior, prngs[idx]);
      });
    }
    sims.forEach(sim => sim.instance.clearTimes());

    // Run 50 frames
    for (let f = 0; f < benchmarkLength; f++) {
      sims.forEach((sim, idx) => {
        prngs[idx].setSeed(f + 11);
        sim.instance.update(width, height, 1.0, behavior, prngs[idx]);
      });
    }

    const jsAvg = sims[0].instance.getTimes().reduce((a: number, b: number) => a + b, 0) / benchmarkLength;
    const wasmAvg = sims[1].instance.getTimes().reduce((a: number, b: number) => a + b, 0) / benchmarkLength;
    const speedup = jsAvg / wasmAvg;

    console.log(`JS ECS Tree : ${jsAvg.toFixed(3)} ms/frame`);
    console.log(`WASM Tree   : ${wasmAvg.toFixed(3)} ms/frame`);
    console.log(`Speedup     : ${speedup.toFixed(2)}x vs JS ECS Tree`);
  }
}

start().catch(console.error);
