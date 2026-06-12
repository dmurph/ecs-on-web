import type { Simulator } from './simulator';
import { OOPSimulator } from './benchmark_oop';
import { OOPTreeSimulator } from './benchmark_oop_tree';
import { CustomECSSimulator } from './benchmark_custom_ecs';
import { ECSTreeSimulator } from './benchmark_ecs_tree';
import { BitECSSimulator } from './benchmark_bitecs';
import { WasmECSSimulator } from './benchmark_wasm_ecs';
import { drawChartSVG, resetChartLabels } from './chart';
import {
  initUI,
  setupUIListeners,
  setupResizeListener,
  getCanvases,
  updateUI,
  updateStatus,
  updateFps,
  setPauseButtonText,
  setButtonDisabledStates,
  resetUIElements,
  updateMetricsDisplay,
  handleCopyFeedback,
  updateBaselineOptions
} from './ui';
import { SeededPRNG } from './prng';

// === STATE MANAGEMENT ===
let numEntities = 5000;
let movementBehavior = 'wander'; // 'wander' | 'erratic' | 'static'
let speedMultiplier = 1.0;
let benchmarkLength = 1000;
let useLogScale = true;
let useZeroBaseline = false;
let baselineSimulatorId = 'oop';

let isRunning = false;
let isPaused = false;
let isWarmingUp = false;
let warmupFrame = 0;
const warmupFramesCount = 50;
let currentFrame = 0;
let animationFrameId: number | null = null;
let totalFramesProcessed = 0;

const simulators: Simulator[] = [
  new OOPSimulator(),
  new OOPTreeSimulator(),
  new CustomECSSimulator(),
  new ECSTreeSimulator(),
  new BitECSSimulator(),
  new WasmECSSimulator()
];

let activeSimulators: Simulator[] = [...simulators];

const prngs: Record<string, SeededPRNG> = {
  oop: new SeededPRNG(),
  'oop-tree': new SeededPRNG(),
  ecs: new SeededPRNG(),
  'ecs-tree': new SeededPRNG(),
  bitecs: new SeededPRNG(),
  wasm: new SeededPRNG()
};

// FPS tracking for render performance
let lastRenderTime = 0;
let frameCount = 0;
let fpsTimer = 0;

// Canvases and Contexts (initialized in setup)
let contexts: Record<string, CanvasRenderingContext2D> = {};

function getResultsMarkdown(): string {
  const coherenceLabel = movementBehavior.charAt(0).toUpperCase() + movementBehavior.slice(1);
  
  const baselineSim = simulators.find(s => s.id === baselineSimulatorId);
  const baselineTimes = baselineSim ? baselineSim.getTimes() : [];
  const avgBaseline = baselineTimes.length ? baselineTimes.reduce((a, b) => a + b, 0) / baselineTimes.length : 0;
  const baselineActive = baselineSim ? activeSimulators.includes(baselineSim) : false;

  let tableRows = '';
  for (const sim of activeSimulators) {
    const times = sim.getTimes();
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = times.length ? sum / times.length : 0;
    const sorted = [...times].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    
    let speedupText = '1.00x';
    if (sim.id !== baselineSimulatorId) {
      speedupText = (baselineActive && avg > 0 && avgBaseline > 0) 
        ? `${(avgBaseline / avg).toFixed(2)}x` 
        : '--';
    }
    
    tableRows += `| ${sim.name} | ${avg.toFixed(3)} ms | ${p99.toFixed(3)} ms | ${speedupText} |\n`;
  }

  const resultsMarkdown = `| System | Avg Frame Time | 99th Percentile | Speedup vs ${baselineSim ? baselineSim.name : 'Baseline'} |
| :--- | :--- | :--- | :--- |
${tableRows}
*Parameters:*
- Entity Count: ${numEntities.toLocaleString()}
- Spatial Coherence: ${coherenceLabel}
- Speed Multiplier: ${speedMultiplier.toFixed(1)}x
- Benchmark Length: ${benchmarkLength} frames`;

  return resultsMarkdown;
}

function handleCopy() {
  const markdown = getResultsMarkdown();
  navigator.clipboard.writeText(markdown).then(() => {
    handleCopyFeedback(true);
  }).catch(() => {
    handleCopyFeedback(false);
  });
}

// === INITIALIZATION & SETUP ===
function initEntities() {
  const { canvasOOP } = getCanvases();
  const w = canvasOOP.width;
  const h = canvasOOP.height;

  for (const sim of simulators) {
    sim.init(numEntities, w, h, prngs[sim.id]);
  }

  // Sync initial positions to ensure identical starting states
  const oopSim = simulators.find(s => s.id === 'oop')!;
  const oopPositions = oopSim.getPositions();
  for (const sim of simulators) {
    if (sim !== oopSim) {
      sim.setPositions(oopPositions);
    }
  }
}

function resetBenchmark() {
  isRunning = false;
  isPaused = false;
  isWarmingUp = false;
  warmupFrame = 0;
  currentFrame = 0;
  totalFramesProcessed = 0;
  
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  for (const sim of simulators) {
    sim.clearTimes();
  }

  resetChartLabels();
  initEntities();
  
  // Reset UI elements
  resetUIElements(
    {
      entityCount: numEntities,
      speed: speedMultiplier,
      length: benchmarkLength,
      behavior: movementBehavior
    },
    activeSimulators.map(s => s.id),
    baselineSimulatorId
  );

  // Render initial state
  for (const sim of activeSimulators) {
    const ctx = contexts[sim.id];
    if (ctx) {
      sim.render(ctx);
    }
  }
  
  drawChart();
}

function drawChart() {
  const oopTimes = activeSimulators.some(s => s.id === 'oop') ? simulators.find(s => s.id === 'oop')!.getTimes() : [];
  const oopTreeTimes = activeSimulators.some(s => s.id === 'oop-tree') ? simulators.find(s => s.id === 'oop-tree')!.getTimes() : [];
  const ecsTimes = activeSimulators.some(s => s.id === 'ecs') ? simulators.find(s => s.id === 'ecs')!.getTimes() : [];
  const ecsTreeTimes = activeSimulators.some(s => s.id === 'ecs-tree') ? simulators.find(s => s.id === 'ecs-tree')!.getTimes() : [];
  const bitecsTimes = activeSimulators.some(s => s.id === 'bitecs') ? simulators.find(s => s.id === 'bitecs')!.getTimes() : [];
  const wasmTimes = activeSimulators.some(s => s.id === 'wasm') ? simulators.find(s => s.id === 'wasm')!.getTimes() : [];
  
  drawChartSVG('svg-chart-container', oopTimes, oopTreeTimes, ecsTimes, ecsTreeTimes, bitecsTimes, wasmTimes, benchmarkLength, useLogScale, useZeroBaseline);
}

function startBenchmark() {
  if (isRunning) return;

  if (currentFrame >= benchmarkLength) {
    resetBenchmark();
  }

  isRunning = true;
  isPaused = false;
  isWarmingUp = true;
  warmupFrame = 0;
  lastRenderTime = performance.now();
  fpsTimer = 0;
  frameCount = 0;

  updateStatus(`Warmup (0/${warmupFramesCount})`, 'running');
  setButtonDisabledStates(true, false);

  loop();
}

function togglePause() {
  if (!isRunning) return;

  isPaused = !isPaused;
  if (isPaused) {
    updateStatus('Paused', 'paused');
    setPauseButtonText('Resume');
  } else {
    updateStatus('Running', 'running');
    setPauseButtonText('Pause');
    lastRenderTime = performance.now();
    loop();
  }
}

// === MAIN LOOP ===
function loop() {
  if (!isRunning || isPaused) return;

  const now = performance.now();
  const dt = now - lastRenderTime;
  lastRenderTime = now;

  // FPS calculation
  fpsTimer += dt;
  frameCount++;
  if (fpsTimer >= 1000) {
    const getFps = (id: string) => activeSimulators.some(s => s.id === id) ? frameCount : 0;
    updateFps(getFps('oop'), getFps('oop-tree'), getFps('ecs'), getFps('ecs-tree'), getFps('bitecs'), getFps('wasm'));
    frameCount = 0;
    fpsTimer = 0;
  }

  // 1. SEED PRNGS
  const frameSeed = totalFramesProcessed + 1;
  for (const sim of simulators) {
    prngs[sim.id].setSeed(frameSeed);
  }
  totalFramesProcessed++;

  // 2. RUN TIMED BENCHMARKS & PHYSICS RESOLUTION
  const { canvasOOP } = getCanvases();
  const w = canvasOOP.width;
  const h = canvasOOP.height;

  const times: Record<string, number> = {};
  const collisionCounts: Record<string, number> = {};
  for (const sim of activeSimulators) {
    const prng = prngs[sim.id];
    const result = sim.update(w, h, speedMultiplier, movementBehavior, prng);
    times[sim.id] = result.time;
    collisionCounts[sim.id] = result.collisionCount;
  }

  // Handle Warmup vs Recording
  if (isWarmingUp) {
    warmupFrame++;
    updateStatus(`Warmup (${warmupFrame}/${warmupFramesCount})`, 'running');
    if (warmupFrame >= warmupFramesCount) {
      isWarmingUp = false;
      for (const s of simulators) {
        s.clearTimes();
      }
      updateStatus('Running', 'running');
    }
  } else {
    currentFrame++;
    
    const getSimData = (id: string) => {
      const sim = simulators.find(s => s.id === id)!;
      const isActive = activeSimulators.includes(sim);
      return {
        time: isActive ? times[id] : 0,
        count: isActive ? collisionCounts[id] : 0,
        times: sim.getTimes()
      };
    };

    const oopData = getSimData('oop');
    const oopTreeData = getSimData('oop-tree');
    const ecsData = getSimData('ecs');
    const ecsTreeData = getSimData('ecs-tree');
    const bitecsData = getSimData('bitecs');
    const wasmData = getSimData('wasm');

    updateMetricsDisplay({
      currentFrame,
      oopTime: oopData.time,
      oopTreeTime: oopTreeData.time,
      ecsTime: ecsData.time,
      ecsTreeTime: ecsTreeData.time,
      bitecsTime: bitecsData.time,
      wasmTime: wasmData.time,
      oopCount: oopData.count,
      oopTreeCount: oopTreeData.count,
      ecsCount: ecsData.count,
      ecsTreeCount: ecsTreeData.count,
      bitecsCount: bitecsData.count,
      wasmCount: wasmData.count,
      oopTimes: oopData.times,
      oopTreeTimes: oopTreeData.times,
      ecsTimes: ecsData.times,
      ecsTreeTimes: ecsTreeData.times,
      bitecsTimes: bitecsData.times,
      wasmTimes: wasmData.times,
      activeSimulators: activeSimulators.map(s => s.id),
      baselineSimulatorId
    });

    drawChart();
  }

  // 4. RENDER CANVASES
  for (const sim of activeSimulators) {
    const ctx = contexts[sim.id];
    if (ctx) {
      sim.render(ctx);
    }
  }

  // Check end condition
  if (currentFrame >= benchmarkLength) {
    finishBenchmark();
  } else {
    animationFrameId = requestAnimationFrame(loop);
  }
}

function finishBenchmark() {
  isRunning = false;
  isPaused = false;
  updateStatus('Finished', '');
  setButtonDisabledStates(false, true);
  setPauseButtonText('Pause');
}

// === RUN INITIAL SETUP ===
initUI();
updateBaselineOptions(activeSimulators.map(s => s.id), baselineSimulatorId);
const canvases = getCanvases();

contexts = {
  oop: canvases.canvasOOP.getContext('2d')!,
  'oop-tree': canvases.canvasOOPTree.getContext('2d')!,
  ecs: canvases.canvasECS.getContext('2d')!,
  'ecs-tree': canvases.canvasECSTree.getContext('2d')!,
  bitecs: canvases.canvasBitecs.getContext('2d')!,
  wasm: canvases.canvasWasm.getContext('2d')!
};

function triggerMetricsUpdate() {
  const getSimData = (id: string) => {
    const sim = simulators.find(s => s.id === id)!;
    const isActive = activeSimulators.includes(sim);
    return {
      time: isActive ? (sim.getTimes()[sim.getTimes().length - 1] || 0) : 0,
      count: 0,
      times: sim.getTimes()
    };
  };

  const oopData = getSimData('oop');
  const oopTreeData = getSimData('oop-tree');
  const ecsData = getSimData('ecs');
  const ecsTreeData = getSimData('ecs-tree');
  const bitecsData = getSimData('bitecs');
  const wasmData = getSimData('wasm');

  updateMetricsDisplay({
    currentFrame,
    oopTime: oopData.time,
    oopTreeTime: oopTreeData.time,
    ecsTime: ecsData.time,
    ecsTreeTime: ecsTreeData.time,
    bitecsTime: bitecsData.time,
    wasmTime: wasmData.time,
    oopCount: oopData.count,
    oopTreeCount: oopTreeData.count,
    ecsCount: ecsData.count,
    ecsTreeCount: ecsTreeData.count,
    bitecsCount: bitecsData.count,
    wasmCount: wasmData.count,
    oopTimes: oopData.times,
    oopTreeTimes: oopTreeData.times,
    ecsTimes: ecsData.times,
    ecsTreeTimes: ecsTreeData.times,
    bitecsTimes: bitecsData.times,
    wasmTimes: wasmData.times,
    activeSimulators: activeSimulators.map(s => s.id),
    baselineSimulatorId
  });
}

setupUIListeners({
  onEntityCountChange: (val) => {
    numEntities = val;
    resetBenchmark();
  },
  onBehaviorChange: (val) => {
    movementBehavior = val;
    resetBenchmark();
  },
  onSpeedChange: (val) => {
    speedMultiplier = val;
  },
  onLengthChange: (val) => {
    benchmarkLength = val;
    resetBenchmark();
  },
  onRun: startBenchmark,
  onPause: togglePause,
  onReset: () => {
    resetBenchmark();
    updateUI(numEntities, speedMultiplier, benchmarkLength);
  },
  onCopy: handleCopy,
  onToggleSimulator: (id, active) => {
    const sim = simulators.find(s => s.id === id)!;
    if (active) {
      if (!activeSimulators.includes(sim)) {
        activeSimulators.push(sim);
      }
    } else {
      activeSimulators = activeSimulators.filter(s => s !== sim);
    }
    activeSimulators.sort((a, b) => simulators.indexOf(a) - simulators.indexOf(b));

    // Handle baseline change if current baseline was deactivated
    const activeIds = activeSimulators.map(s => s.id);
    if (!activeIds.includes(baselineSimulatorId)) {
      if (activeIds.length > 0) {
        baselineSimulatorId = activeIds[0];
      } else {
        baselineSimulatorId = '';
      }
    }
    updateBaselineOptions(activeIds, baselineSimulatorId);

    resetBenchmark();
  },
  onToggleLogScale: (active) => {
    useLogScale = active;
    drawChart();
  },
  onToggleZeroBaseline: (active) => {
    useZeroBaseline = active;
    drawChart();
  },
  onBaselineChange: (id) => {
    baselineSimulatorId = id;
    triggerMetricsUpdate();
  }
});

setupResizeListener(() => {
  resetBenchmark();
  drawChart();
});

resetBenchmark();
updateUI(numEntities, speedMultiplier, benchmarkLength);

// Handle embed mode (hiding header, footer, etc.)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('embed')) {
  document.body.classList.add('is-embedded');
}

// Notify parent of iframe height changes for dynamic auto-resizing
const resizeObserver = new ResizeObserver(() => {
  const height = document.body.scrollHeight || document.documentElement.scrollHeight;
  console.log('[ECS-IFRAME] Sending resize-iframe message with height:', height);
  window.parent.postMessage({
    type: 'resize-iframe',
    height: height
  }, '*');
});
resizeObserver.observe(document.body);


