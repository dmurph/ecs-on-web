import type { Simulator } from './simulator';
import { SIMULATOR_REGISTRY } from './registry';
import { drawChartSVG, resetChartLabels } from './chart';
import {
  initUI,
  setupUIListeners,
  setupResizeListener,
  canvases,
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

const simulators: Simulator[] = SIMULATOR_REGISTRY.map(sim => sim.createInstance());

let activeSimulators: Simulator[] = simulators.filter((_, idx) => SIMULATOR_REGISTRY[idx].activeByDefault);

const prngs: Record<string, SeededPRNG> = {};
SIMULATOR_REGISTRY.forEach(sim => {
  prngs[sim.id] = new SeededPRNG();
});

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
  const firstCanvas = Object.values(canvases)[0];
  const w = firstCanvas ? firstCanvas.width : 1000;
  const h = firstCanvas ? firstCanvas.height : 800;

  for (const sim of simulators) {
    sim.init(numEntities, w, h, prngs[sim.id]);
  }

  // Sync initial positions to ensure identical starting states
  const baselineSim = simulators[0];
  if (baselineSim) {
    const baselinePositions = baselineSim.getPositions();
    for (const sim of simulators) {
      if (sim !== baselineSim) {
        sim.setPositions(baselinePositions);
      }
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
  const timesMap: Record<string, number[]> = {};
  activeSimulators.forEach(sim => {
    timesMap[sim.id] = sim.getTimes();
  });
  
  drawChartSVG('svg-chart-container', timesMap, benchmarkLength, useLogScale, useZeroBaseline);
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
    const fpsMap: Record<string, number> = {};
    SIMULATOR_REGISTRY.forEach(sim => {
      fpsMap[sim.id] = activeSimulators.some(s => s.id === sim.id) ? frameCount : 0;
    });
    updateFps(fpsMap);
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
  const firstCanvas = Object.values(canvases)[0];
  const w = firstCanvas ? firstCanvas.width : 1000;
  const h = firstCanvas ? firstCanvas.height : 800;

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
    
    const timesMap: Record<string, number> = {};
    const historyMap: Record<string, number[]> = {};
    
    SIMULATOR_REGISTRY.forEach(sim => {
      const instantiatedSim = simulators.find(s => s.id === sim.id)!;
      const isActive = activeSimulators.includes(instantiatedSim);
      timesMap[sim.id] = isActive ? times[sim.id] : 0;
      historyMap[sim.id] = instantiatedSim.getTimes();
    });

    updateMetricsDisplay({
      currentFrame,
      times: timesMap,
      history: historyMap,
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

contexts = {};
SIMULATOR_REGISTRY.forEach(sim => {
  const canvas = canvases[sim.id];
  if (canvas) {
    contexts[sim.id] = canvas.getContext('2d')!;
  }
});

function triggerMetricsUpdate() {
  const timesMap: Record<string, number> = {};
  const historyMap: Record<string, number[]> = {};

  SIMULATOR_REGISTRY.forEach(sim => {
    const instantiatedSim = simulators.find(s => s.id === sim.id)!;
    const isActive = activeSimulators.includes(instantiatedSim);
    const times = instantiatedSim.getTimes();
    timesMap[sim.id] = isActive ? (times[times.length - 1] || 0) : 0;
    historyMap[sim.id] = times;
  });

  updateMetricsDisplay({
    currentFrame,
    times: timesMap,
    history: historyMap,
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


