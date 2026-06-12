import { CustomECSSimulator, updateECSMovement, resolveECSPhysics } from '../src/benchmark_custom_ecs';
import { SeededPRNG } from '../src/prng';
import * as fs from 'fs';
import * as path from 'path';

function runECSBroadphaseSort(indices: Int32Array, posX: Float64Array) {
  const len = indices.length;
  for (let i = 1; i < len; i++) {
    const currIdx = indices[i];
    const currX = posX[currIdx]; 
    let j = i - 1;
    while (j >= 0 && posX[indices[j]] > currX) {
      indices[j + 1] = indices[j];
      j--;
    }
    indices[j + 1] = currIdx;
  }
}

function runECSBroadphaseSweep(
  indices: Int32Array,
  posX: Float64Array,
  posYwh: Float64Array,
  outPairs: Int32Array,
  ids: Int32Array
): number {
  let pairCount = 0;
  const len = indices.length;
  const maxPairs = outPairs.length / 2;
  for (let i = 0; i < len; i++) {
    const aIdx = indices[i];
    const ax = posX[aIdx];
    const aRight = ax + posYwh[aIdx * 3 + 1];
    for (let j = i + 1; j < len; j++) {
      const bIdx = indices[j];
      const bx = posX[bIdx]; 
      if (bx > aRight) break;

      const ay = posYwh[aIdx * 3 + 0];
      const ah = posYwh[aIdx * 3 + 2];
      const by = posYwh[bIdx * 3 + 0];
      const bh = posYwh[bIdx * 3 + 2];
      if (ay < by + bh && ay + ah > by) {
        if (pairCount < maxPairs) {
          outPairs[pairCount * 2] = ids[aIdx];
          outPairs[pairCount * 2 + 1] = ids[bIdx];
          pairCount++;
        }
      }
    }
  }
  return pairCount;
}

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
  const maxCollisions = 200000;

  const prngJS = new SeededPRNG();
  const prngWASM = new SeededPRNG();

  // 1. JS ECS Setup
  const jsSim = new CustomECSSimulator();
  jsSim.init(numEntities, width, height, prngJS);
  const jsData = (jsSim as any).ecsData;
  const jsColliding = (jsSim as any).colliding;
  const jsPairsBuffer = (jsSim as any).pairsBuffer;

  // 2. WASM ECS Setup
  wasm.init(numEntities, maxCollisions);
  const memoryBuffer = wasm.memory.buffer;
  const posX = new Float64Array(memoryBuffer, wasm.getPosXPtr(), numEntities);
  const posYwh = new Float64Array(memoryBuffer, wasm.getPosYwhPtr(), numEntities * 3);
  const colorId = new Uint8Array(memoryBuffer, wasm.getColorIdPtr(), numEntities);
  const vx = new Float64Array(memoryBuffer, wasm.getVxPtr(), numEntities);
  const vy = new Float64Array(memoryBuffer, wasm.getVyPtr(), numEntities);
  const angle = new Float64Array(memoryBuffer, wasm.getAnglePtr(), numEntities);
  const indices = new Int32Array(memoryBuffer, wasm.getIndicesPtr(), numEntities);
  const id = new Int32Array(memoryBuffer, wasm.getIdPtr(), numEntities);
  const wasmColliding = new Uint8Array(memoryBuffer, wasm.getCollidingPtr(), numEntities);

  // Sync positions initially
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

  console.log("Starting detailed phase-by-phase benchmark (Erratic, 1000 frames)...");

  let jsMoveTime = 0;
  let jsSortTime = 0;
  let jsSweepTime = 0;
  let jsNarrowTime = 0;

  let wasmMoveTime = 0;
  let wasmSortTime = 0;
  let wasmSweepTime = 0;
  let wasmNarrowTime = 0;

  for (let frame = 0; frame < 1000; frame++) {
    const seed = frame + 1;

    // --- JS ---
    prngJS.setSeed(seed);
    const startJsMove = performance.now();
    updateECSMovement(jsData, width, height, speedMultiplier, 'erratic', prngJS);
    jsMoveTime += (performance.now() - startJsMove);

    const startJsSort = performance.now();
    runECSBroadphaseSort(jsData.indices, jsData.posX);
    jsSortTime += (performance.now() - startJsSort);

    const startJsSweep = performance.now();
    const jsPairCount = runECSBroadphaseSweep(jsData.indices, jsData.posX, jsData.posYwh, jsPairsBuffer, jsData.id);
    jsSweepTime += (performance.now() - startJsSweep);

    const startJsNarrow = performance.now();
    resolveECSPhysics(jsData, jsPairsBuffer, jsPairCount, jsColliding);
    jsNarrowTime += (performance.now() - startJsNarrow);

    // --- WASM ---
    prngWASM.setSeed(seed);
    const startWasmMove = performance.now();
    wasm.updateMovement(width, height, speedMultiplier, 2, prngWASM.seed);
    wasmMoveTime += (performance.now() - startWasmMove);

    const startWasmSort = performance.now();
    wasm.runBroadphaseSort();
    wasmSortTime += (performance.now() - startWasmSort);

    const startWasmSweep = performance.now();
    const wasmPairCount = wasm.runBroadphaseSweep();
    wasmSweepTime += (performance.now() - startWasmSweep);

    const startWasmNarrow = performance.now();
    wasm.resolvePhysics(wasmPairCount);
    wasmNarrowTime += (performance.now() - startWasmNarrow);
    
    // Safety check that collision count matches
    if (jsPairCount !== wasmPairCount) {
      console.error(`Frame ${frame} mismatch: JS pairs = ${jsPairCount}, WASM pairs = ${wasmPairCount}`);
      process.exit(1);
    }
  }

  console.log("\n--- JS ECS Averages ---");
  console.log(`Movement:   ${(jsMoveTime / 1000).toFixed(3)} ms`);
  console.log(`Sort:       ${(jsSortTime / 1000).toFixed(3)} ms`);
  console.log(`Sweep:      ${(jsSweepTime / 1000).toFixed(3)} ms`);
  console.log(`Narrowphase:${(jsNarrowTime / 1000).toFixed(3)} ms`);
  console.log(`Total:      ${((jsMoveTime + jsSortTime + jsSweepTime + jsNarrowTime) / 1000).toFixed(3)} ms`);

  console.log("\n--- WASM ECS Averages ---");
  console.log(`Movement:   ${(wasmMoveTime / 1000).toFixed(3)} ms`);
  console.log(`Sort:       ${(wasmSortTime / 1000).toFixed(3)} ms`);
  console.log(`Sweep:      ${(wasmSweepTime / 1000).toFixed(3)} ms`);
  console.log(`Narrowphase:${(wasmNarrowTime / 1000).toFixed(3)} ms`);
  console.log(`Total:      ${((wasmMoveTime + wasmSortTime + wasmSweepTime + wasmNarrowTime) / 1000).toFixed(3)} ms`);
}

runTest().catch(console.error);
