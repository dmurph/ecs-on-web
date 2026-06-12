import { CustomECSSimulator } from '../src/benchmark_custom_ecs';
import { SeededPRNG } from '../src/prng';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  const wasmPath = path.join(process.cwd(), 'public/benchmark_wasm_ecs.wasm');
  const buffer = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(buffer, {
    env: {
      abort: (msg: any, file: any, line: any, col: any) => {
        console.error(`abort called: ${msg} at ${file}:${line}:${col}`);
      }
    }
  });
  const wasm = instance.exports as any;

  const numEntities = 5000;
  const width = 1000;
  const height = 800;
  const speedMultiplier = 1.0;

  const prngJS = new SeededPRNG();
  const prngWASM = new SeededPRNG();

  // 1. JS ECS Setup
  const jsSim = new CustomECSSimulator();
  jsSim.init(numEntities, width, height, prngJS);

  // 2. WASM ECS Setup
  wasm.init(numEntities, 200000);
  const memoryBuffer = wasm.memory.buffer;
  const posX = new Float64Array(memoryBuffer, wasm.getPosXPtr(), numEntities);
  const posYwh = new Float64Array(memoryBuffer, wasm.getPosYwhPtr(), numEntities * 3);
  const colorId = new Uint8Array(memoryBuffer, wasm.getColorIdPtr(), numEntities);
  const vx = new Float64Array(memoryBuffer, wasm.getVxPtr(), numEntities);
  const vy = new Float64Array(memoryBuffer, wasm.getVyPtr(), numEntities);
  const angle = new Float64Array(memoryBuffer, wasm.getAnglePtr(), numEntities);
  const indices = new Int32Array(memoryBuffer, wasm.getIndicesPtr(), numEntities);
  const id = new Int32Array(memoryBuffer, wasm.getIdPtr(), numEntities);

  // Sync positions
  const initialPositions = jsSim.getPositions();
  for (let i = 0; i < numEntities; i++) {
    const p = initialPositions[i];
    posX[i] = p.x;
    posYwh[i * 3 + 0] = p.y;
    posYwh[i * 3 + 1] = p.w;
    posYwh[i * 3 + 2] = p.h;
    vx[i] = p.vx;
    vy[i] = p.vy;
    angle[i] = p.angle;
  }

  console.log("Starting benchmark (Erratic)...");

  // Timings for Erratic
  let jsTimeTotal = 0;
  let wasmTimeTotal = 0;

  for (let frame = 0; frame < 1000; frame++) {
    const seed = frame + 1;
    
    // JS step
    prngJS.setSeed(seed);
    const startJS = performance.now();
    jsSim.update(width, height, speedMultiplier, 'erratic', prngJS);
    jsTimeTotal += (performance.now() - startJS);

    // WASM step
    prngWASM.setSeed(seed);
    const startWasm = performance.now();
    wasm.update(width, height, speedMultiplier, 2, prngWASM.seed);
    wasmTimeTotal += (performance.now() - startWasm);
  }

  console.log(`JS ECS (Erratic) Average: ${(jsTimeTotal / 1000).toFixed(3)} ms`);
  console.log(`WASM ECS (Erratic) Average: ${(wasmTimeTotal / 1000).toFixed(3)} ms`);
}

runTest().catch(console.error);
