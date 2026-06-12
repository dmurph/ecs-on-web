export interface UICallbacks {
  onEntityCountChange: (val: number) => void;
  onBehaviorChange: (val: string) => void;
  onSpeedChange: (val: number) => void;
  onLengthChange: (val: number) => void;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onCopy: () => void;
  onToggleSimulator?: (id: string, active: boolean) => void;
  onToggleLogScale?: (active: boolean) => void;
  onToggleZeroBaseline?: (active: boolean) => void;
  onBaselineChange?: (id: string) => void;
}

export const ALL_SIMULATORS = [
  { id: 'oop', name: 'OOP S&P' },
  { id: 'oop-tree', name: 'OOP Tree' },
  { id: 'ecs', name: 'ECS Custom S&P' },
  { id: 'ecs-tree', name: 'ECS Custom Tree' },
  { id: 'bitecs', name: 'bitECS S&P' },
  { id: 'wasm', name: 'WASM ECS S&P' }
];

// DOM Elements
let statusPulse: HTMLElement;
let statusText: HTMLElement;
let entitySlider: HTMLInputElement;
let entityVal: HTMLElement;
let behaviorSelect: HTMLSelectElement;
let coherenceDesc: HTMLElement;
let speedSlider: HTMLInputElement;
let speedVal: HTMLElement;
let lengthSlider: HTMLInputElement;
let lengthVal: HTMLElement;

let btnRun: HTMLButtonElement;
let btnPause: HTMLButtonElement;
let btnReset: HTMLButtonElement;

// Metrics
let oopCurrentTimeEl: HTMLElement;
let oopAvgTimeEl: HTMLElement;
let oopP99TimeEl: HTMLElement;

let oopTreeCurrentTimeEl: HTMLElement;
let oopTreeAvgTimeEl: HTMLElement;
let oopTreeP99TimeEl: HTMLElement;

let ecsCurrentTimeEl: HTMLElement;
let ecsAvgTimeEl: HTMLElement;
let ecsP99TimeEl: HTMLElement;

let ecsTreeCurrentTimeEl: HTMLElement;
let ecsTreeAvgTimeEl: HTMLElement;
let ecsTreeP99TimeEl: HTMLElement;

let bitecsCurrentTimeEl: HTMLElement;
let bitecsAvgTimeEl: HTMLElement;
let bitecsP99TimeEl: HTMLElement;

let wasmCurrentTimeEl: HTMLElement;
let wasmAvgTimeEl: HTMLElement;
let wasmP99TimeEl: HTMLElement;

let btnCopyResults: HTMLButtonElement;
let compareBaselineSelect: HTMLSelectElement;
let speedupValuesContainer: HTMLElement;

let chartFrameIndexEl: HTMLElement;
let chartFrameTotalEl: HTMLElement;

let oopFpsEl: HTMLElement;
let oopTreeFpsEl: HTMLElement;
let ecsFpsEl: HTMLElement;
let ecsTreeFpsEl: HTMLElement;
let bitecsFpsEl: HTMLElement;
let wasmFpsEl: HTMLElement;

// Toggles
let toggleOOP: HTMLInputElement;
let toggleOOPTree: HTMLInputElement;
let toggleECS: HTMLInputElement;
let toggleECSTree: HTMLInputElement;
let toggleBitecs: HTMLInputElement;
let toggleWasm: HTMLInputElement;
let toggleLogScale: HTMLInputElement;
let toggleZeroBaseline: HTMLInputElement;

// Canvases
let canvasOOP: HTMLCanvasElement;
let canvasOOPTree: HTMLCanvasElement;
let canvasECS: HTMLCanvasElement;
let canvasECSTree: HTMLCanvasElement;
let canvasBitecs: HTMLCanvasElement;
let canvasWasm: HTMLCanvasElement;

export function initUI() {
  toggleOOP = document.getElementById('toggle-oop') as HTMLInputElement;
  toggleOOPTree = document.getElementById('toggle-oop-tree') as HTMLInputElement;
  toggleECS = document.getElementById('toggle-ecs') as HTMLInputElement;
  toggleECSTree = document.getElementById('toggle-ecs-tree') as HTMLInputElement;
  toggleBitecs = document.getElementById('toggle-bitecs') as HTMLInputElement;
  toggleWasm = document.getElementById('toggle-wasm') as HTMLInputElement;
  toggleLogScale = document.getElementById('toggle-log-scale') as HTMLInputElement;
  toggleZeroBaseline = document.getElementById('toggle-zero-baseline') as HTMLInputElement;

  statusPulse = document.getElementById('status-pulse')!;
  statusText = document.getElementById('status-text')!;
  entitySlider = document.getElementById('entity-count-slider') as HTMLInputElement;
  entityVal = document.getElementById('entity-count-val')!;
  behaviorSelect = document.getElementById('movement-behavior-select') as HTMLSelectElement;
  coherenceDesc = document.getElementById('coherence-desc')!;
  speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  speedVal = document.getElementById('speed-val')!;
  lengthSlider = document.getElementById('benchmark-frames-slider') as HTMLInputElement;
  lengthVal = document.getElementById('benchmark-frames-val')!;

  btnRun = document.getElementById('btn-run-benchmark') as HTMLButtonElement;
  btnPause = document.getElementById('btn-toggle-pause') as HTMLButtonElement;
  btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  oopCurrentTimeEl = document.getElementById('oop-current-time')!;
  oopAvgTimeEl = document.getElementById('oop-avg-time')!;
  oopP99TimeEl = document.getElementById('oop-p99-time')!;

  oopTreeCurrentTimeEl = document.getElementById('oop-tree-current-time')!;
  oopTreeAvgTimeEl = document.getElementById('oop-tree-avg-time')!;
  oopTreeP99TimeEl = document.getElementById('oop-tree-p99-time')!;

  ecsCurrentTimeEl = document.getElementById('ecs-current-time')!;
  ecsAvgTimeEl = document.getElementById('ecs-avg-time')!;
  ecsP99TimeEl = document.getElementById('ecs-p99-time')!;

  ecsTreeCurrentTimeEl = document.getElementById('ecs-tree-current-time')!;
  ecsTreeAvgTimeEl = document.getElementById('ecs-tree-avg-time')!;
  ecsTreeP99TimeEl = document.getElementById('ecs-tree-p99-time')!;

  bitecsCurrentTimeEl = document.getElementById('bitecs-current-time')!;
  bitecsAvgTimeEl = document.getElementById('bitecs-avg-time')!;
  bitecsP99TimeEl = document.getElementById('bitecs-p99-time')!;

  wasmCurrentTimeEl = document.getElementById('wasm-current-time')!;
  wasmAvgTimeEl = document.getElementById('wasm-avg-time')!;
  wasmP99TimeEl = document.getElementById('wasm-p99-time')!;

  btnCopyResults = document.getElementById('btn-copy-results') as HTMLButtonElement;
  compareBaselineSelect = document.getElementById('compare-baseline-select') as HTMLSelectElement;
  speedupValuesContainer = document.getElementById('speedup-values-container')!;


  chartFrameIndexEl = document.getElementById('chart-frame-index')!;
  chartFrameTotalEl = document.getElementById('chart-frame-total')!;

  oopFpsEl = document.getElementById('oop-fps')!;
  oopTreeFpsEl = document.getElementById('oop-tree-fps')!;
  ecsFpsEl = document.getElementById('ecs-fps')!;
  ecsTreeFpsEl = document.getElementById('ecs-tree-fps')!;
  bitecsFpsEl = document.getElementById('bitecs-fps')!;
  wasmFpsEl = document.getElementById('wasm-fps')!;

  canvasOOP = document.getElementById('canvas-oop') as HTMLCanvasElement;
  canvasOOPTree = document.getElementById('canvas-oop-tree') as HTMLCanvasElement;
  canvasECS = document.getElementById('canvas-ecs') as HTMLCanvasElement;
  canvasECSTree = document.getElementById('canvas-ecs-tree') as HTMLCanvasElement;
  canvasBitecs = document.getElementById('canvas-bitecs') as HTMLCanvasElement;
  canvasWasm = document.getElementById('canvas-wasm') as HTMLCanvasElement;
  resizeCanvases();
}

export function getCanvases() {
  return { canvasOOP, canvasOOPTree, canvasECS, canvasECSTree, canvasBitecs, canvasWasm };
}

export function setupUIListeners(callbacks: UICallbacks) {
  entitySlider.addEventListener('input', () => {
    const val = parseInt(entitySlider.value);
    entityVal.textContent = val.toLocaleString();
    callbacks.onEntityCountChange(val);
  });

  behaviorSelect.addEventListener('change', () => {
    const val = behaviorSelect.value;
    updateCoherenceDesc(val);
    callbacks.onBehaviorChange(val);
  });

  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    speedVal.textContent = val.toFixed(1) + 'x';
    callbacks.onSpeedChange(val);
  });

  lengthSlider.addEventListener('input', () => {
    const val = parseInt(lengthSlider.value);
    lengthVal.textContent = val.toLocaleString() + ' frames';
    chartFrameTotalEl.textContent = val.toString();
    callbacks.onLengthChange(val);
  });

  btnRun.addEventListener('click', callbacks.onRun);
  btnPause.addEventListener('click', callbacks.onPause);
  btnReset.addEventListener('click', callbacks.onReset);
  btnCopyResults.addEventListener('click', callbacks.onCopy);

  compareBaselineSelect.addEventListener('change', () => {
    callbacks.onBaselineChange?.(compareBaselineSelect.value);
  });

  const handleToggle = (id: string, checkbox: HTMLInputElement) => {
    checkbox.addEventListener('change', () => {
      const active = checkbox.checked;
      toggleCardVisibility(id, active);
      callbacks.onToggleSimulator?.(id, active);
    });
  };

  handleToggle('oop', toggleOOP);
  handleToggle('oop-tree', toggleOOPTree);
  handleToggle('ecs', toggleECS);
  handleToggle('ecs-tree', toggleECSTree);
  handleToggle('bitecs', toggleBitecs);
  handleToggle('wasm', toggleWasm);

  toggleLogScale.addEventListener('change', () => {
    callbacks.onToggleLogScale?.(toggleLogScale.checked);
  });

  toggleZeroBaseline.addEventListener('change', () => {
    callbacks.onToggleZeroBaseline?.(toggleZeroBaseline.checked);
  });
}

function updateCoherenceDesc(behavior: string) {
  if (behavior === 'wander') {
    coherenceDesc.innerHTML = `<strong>Wandering</strong> keeps particles moving smoothly. Frame-to-frame positions are almost identical, enabling optimal linear-time sorting.`;
  } else if (behavior === 'erratic') {
    coherenceDesc.innerHTML = `<strong>Erratic</strong> teleports particles randomly each frame. This breaks sorting, forcing insertion sort to run in quadratic <em>O(n²)</em> time.`;
  } else if (behavior === 'static') {
    coherenceDesc.innerHTML = `<strong>Static</strong> locks particles in place. No sorting calculations are performed, isolating the raw sweep overlap checks.`;
  }
}

export function updateUI(numEntities: number, speedMultiplier: number, benchmarkLength: number) {
  entityVal.textContent = numEntities.toLocaleString();
  speedVal.textContent = speedMultiplier.toFixed(1) + 'x';
  lengthVal.textContent = benchmarkLength.toLocaleString() + ' frames';
  chartFrameTotalEl.textContent = benchmarkLength.toString();
}

export function updateStatus(status: string, pulseClass: string) {
  statusText.textContent = status;
  statusPulse.className = `pulse-indicator ${pulseClass}`;
}

export function updateFps(oop: number, oopTree: number, ecs: number, ecsTree: number, bitecs: number, wasm: number) {
  oopFpsEl.textContent = `${oop} FPS`;
  oopTreeFpsEl.textContent = `${oopTree} FPS`;
  ecsFpsEl.textContent = `${ecs} FPS`;
  ecsTreeFpsEl.textContent = `${ecsTree} FPS`;
  bitecsFpsEl.textContent = `${bitecs} FPS`;
  wasmFpsEl.textContent = `${wasm} FPS`;
}

export function setPauseButtonText(text: string) {
  btnPause.textContent = text;
}

export function setButtonDisabledStates(runDisabled: boolean, pauseDisabled: boolean) {
  btnRun.disabled = runDisabled;
  btnPause.disabled = pauseDisabled;
}

export function resetUIElements(
  defaultValues: { entityCount: number; speed: number; length: number; behavior: string },
  activeSims: string[],
  baselineId: string
) {
  oopCurrentTimeEl.textContent = '0.00 ms';
  oopAvgTimeEl.textContent = '0.00 ms';
  oopP99TimeEl.textContent = '0.00 ms';

  oopTreeCurrentTimeEl.textContent = '0.00 ms';
  oopTreeAvgTimeEl.textContent = '0.00 ms';
  oopTreeP99TimeEl.textContent = '0.00 ms';

  ecsCurrentTimeEl.textContent = '0.00 ms';
  ecsAvgTimeEl.textContent = '0.00 ms';
  ecsP99TimeEl.textContent = '0.00 ms';

  ecsTreeCurrentTimeEl.textContent = '0.00 ms';
  ecsTreeAvgTimeEl.textContent = '0.00 ms';
  ecsTreeP99TimeEl.textContent = '0.00 ms';

  bitecsCurrentTimeEl.textContent = '0.00 ms';
  bitecsAvgTimeEl.textContent = '0.00 ms';
  bitecsP99TimeEl.textContent = '0.00 ms';

  wasmCurrentTimeEl.textContent = '0.00 ms';
  wasmAvgTimeEl.textContent = '0.00 ms';
  wasmP99TimeEl.textContent = '0.00 ms';

  renderInitialSpeedups(activeSims, baselineId);
  chartFrameIndexEl.textContent = '0';
  


  oopFpsEl.textContent = '0 FPS';
  oopTreeFpsEl.textContent = '0 FPS';
  ecsFpsEl.textContent = '0 FPS';
  ecsTreeFpsEl.textContent = '0 FPS';
  bitecsFpsEl.textContent = '0 FPS';
  wasmFpsEl.textContent = '0 FPS';

  statusPulse.className = 'pulse-indicator';
  statusText.textContent = 'Ready';

  btnRun.disabled = false;
  btnPause.disabled = true;
  btnPause.textContent = 'Pause';

  // Sync sliders to actual values
  entitySlider.value = defaultValues.entityCount.toString();
  speedSlider.value = defaultValues.speed.toString();
  lengthSlider.value = defaultValues.length.toString();
  behaviorSelect.value = defaultValues.behavior;

  updateCoherenceDesc(defaultValues.behavior);
}

export function updateMetricsDisplay(data: {
  currentFrame: number;
  oopTime: number;
  oopTreeTime: number;
  ecsTime: number;
  ecsTreeTime: number;
  bitecsTime: number;
  wasmTime: number;
  oopCount: number;
  oopTreeCount: number;
  ecsCount: number;
  ecsTreeCount: number;
  bitecsCount: number;
  wasmCount: number;
  oopTimes: number[];
  oopTreeTimes: number[];
  ecsTimes: number[];
  ecsTreeTimes: number[];
  bitecsTimes: number[];
  wasmTimes: number[];
  activeSimulators: string[];
  baselineSimulatorId: string;
}) {
  chartFrameIndexEl.textContent = data.currentFrame.toString();

  oopCurrentTimeEl.textContent = `${data.oopTime.toFixed(3)} ms`;
  oopTreeCurrentTimeEl.textContent = `${data.oopTreeTime.toFixed(3)} ms`;
  ecsCurrentTimeEl.textContent = `${data.ecsTime.toFixed(3)} ms`;
  ecsTreeCurrentTimeEl.textContent = `${data.ecsTreeTime.toFixed(3)} ms`;
  bitecsCurrentTimeEl.textContent = `${data.bitecsTime.toFixed(3)} ms`;
  wasmCurrentTimeEl.textContent = `${data.wasmTime.toFixed(3)} ms`;

  // Calculate Averages
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const averages: Record<string, number> = {
    oop: avg(data.oopTimes),
    'oop-tree': avg(data.oopTreeTimes),
    ecs: avg(data.ecsTimes),
    'ecs-tree': avg(data.ecsTreeTimes),
    bitecs: avg(data.bitecsTimes),
    wasm: avg(data.wasmTimes)
  };

  oopAvgTimeEl.textContent = `${averages.oop.toFixed(3)} ms`;
  oopTreeAvgTimeEl.textContent = `${averages['oop-tree'].toFixed(3)} ms`;
  ecsAvgTimeEl.textContent = `${averages.ecs.toFixed(3)} ms`;
  ecsTreeAvgTimeEl.textContent = `${averages['ecs-tree'].toFixed(3)} ms`;
  bitecsAvgTimeEl.textContent = `${averages.bitecs.toFixed(3)} ms`;
  wasmAvgTimeEl.textContent = `${averages.wasm.toFixed(3)} ms`;

  // Calculate 99th Percentiles
  const p99 = (arr: number[], current: number) => {
    if (!arr.length) return current;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] || current;
  };

  oopP99TimeEl.textContent = `${p99(data.oopTimes, data.oopTime).toFixed(3)} ms`;
  oopTreeP99TimeEl.textContent = `${p99(data.oopTreeTimes, data.oopTreeTime).toFixed(3)} ms`;
  ecsP99TimeEl.textContent = `${p99(data.ecsTimes, data.ecsTime).toFixed(3)} ms`;
  ecsTreeP99TimeEl.textContent = `${p99(data.ecsTreeTimes, data.ecsTreeTime).toFixed(3)} ms`;
  bitecsP99TimeEl.textContent = `${p99(data.bitecsTimes, data.bitecsTime).toFixed(3)} ms`;
  wasmP99TimeEl.textContent = `${p99(data.wasmTimes, data.wasmTime).toFixed(3)} ms`;

  // Calculate Speedups dynamically relative to baseline
  const baselineAvg = data.activeSimulators.includes(data.baselineSimulatorId)
    ? averages[data.baselineSimulatorId]
    : 0;

  speedupValuesContainer.innerHTML = '';
  
  if (data.activeSimulators.length <= 1) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'speedup-row font-mono';
    emptyRow.style.color = 'var(--color-text-dim)';
    emptyRow.style.fontSize = '0.8rem';
    emptyRow.textContent = 'Add active simulators to compare';
    speedupValuesContainer.appendChild(emptyRow);
  } else {
    for (const sim of ALL_SIMULATORS) {
      if (sim.id !== data.baselineSimulatorId && data.activeSimulators.includes(sim.id)) {
        const row = document.createElement('div');
        row.className = 'speedup-row';
        
        const label = document.createElement('span');
        label.textContent = `${sim.name}:`;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'font-mono';
        
        const targetAvg = averages[sim.id];
        if (baselineAvg > 0 && targetAvg > 0) {
          const ratio = baselineAvg / targetAvg;
          valueSpan.textContent = `${ratio.toFixed(1)}x`;
          if (ratio >= 1.05) {
            valueSpan.style.color = 'var(--color-success)';
          } else if (ratio <= 0.95) {
            valueSpan.style.color = 'var(--color-collision)';
          } else {
            valueSpan.style.color = 'var(--color-text-primary)';
          }
        } else {
          valueSpan.textContent = '--';
          valueSpan.style.color = 'var(--color-text-dim)';
        }
        
        row.appendChild(label);
        row.appendChild(valueSpan);
        speedupValuesContainer.appendChild(row);
      }
    }
  }
}

export function handleCopyFeedback(success: boolean) {
  if (success) {
    btnCopyResults.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="check-icon"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    btnCopyResults.classList.add('copied');
    setTimeout(() => {
      btnCopyResults.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      btnCopyResults.classList.remove('copied');
    }, 2000);
  }
}

function resizeCanvases() {
  const containerOOP = canvasOOP.parentElement;
  const containerOOPTree = canvasOOPTree.parentElement;
  const containerECS = canvasECS.parentElement;
  const containerECSTree = canvasECSTree.parentElement;
  const containerBitecs = canvasBitecs.parentElement;
  const containerWasm = canvasWasm.parentElement;
  if (containerOOP && containerOOPTree && containerECS && containerECSTree && containerBitecs && containerWasm) {
    let w = 0;
    let h = 0;
    const containers = [containerOOP, containerOOPTree, containerECS, containerECSTree, containerBitecs, containerWasm];
    for (const container of containers) {
      if (container.clientWidth > 0) {
        w = container.clientWidth;
        h = container.clientHeight;
        break;
      }
    }

    if (w > 0 && h > 0) {
      canvasOOP.width = w;
      canvasOOP.height = h;
      canvasOOPTree.width = w;
      canvasOOPTree.height = h;
      canvasECS.width = w;
      canvasECS.height = h;
      canvasECSTree.width = w;
      canvasECSTree.height = h;
      canvasBitecs.width = w;
      canvasBitecs.height = h;
      canvasWasm.width = w;
      canvasWasm.height = h;
    }
  }
}

export function setupResizeListener(onResize: () => void) {
  window.addEventListener('resize', () => {
    resizeCanvases();
    onResize();
  });
}

export function toggleCardVisibility(id: string, visible: boolean) {
  const canvasCard = document.getElementById(`card-canvas-${id}`);
  const metricCard = document.getElementById(`card-metric-${id}`);
  if (canvasCard) {
    canvasCard.classList.toggle('hidden', !visible);
  }
  if (metricCard) {
    metricCard.classList.toggle('hidden', !visible);
  }
  const legendItem = document.getElementById(`legend-item-${id}`);
  if (legendItem) {
    legendItem.classList.toggle('hidden', !visible);
  }
  resizeCanvases();
}

export function updateBaselineOptions(activeSims: string[], selectedBaselineId: string) {
  compareBaselineSelect.innerHTML = '';
  for (const sim of ALL_SIMULATORS) {
    if (activeSims.includes(sim.id)) {
      const opt = document.createElement('option');
      opt.value = sim.id;
      opt.textContent = sim.name;
      opt.selected = sim.id === selectedBaselineId;
      compareBaselineSelect.appendChild(opt);
    }
  }
}

export function renderInitialSpeedups(activeSims: string[], baselineId: string) {
  speedupValuesContainer.innerHTML = '';
  
  if (activeSims.length <= 1) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'speedup-row font-mono';
    emptyRow.style.color = 'var(--color-text-dim)';
    emptyRow.style.fontSize = '0.8rem';
    emptyRow.textContent = 'Add active simulators to compare';
    speedupValuesContainer.appendChild(emptyRow);
  } else {
    for (const sim of ALL_SIMULATORS) {
      if (sim.id !== baselineId && activeSims.includes(sim.id)) {
        const row = document.createElement('div');
        row.className = 'speedup-row';
        
        const label = document.createElement('span');
        label.textContent = `${sim.name}:`;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'font-mono';
        valueSpan.textContent = '--';
        valueSpan.style.color = 'var(--color-text-dim)';
        
        row.appendChild(label);
        row.appendChild(valueSpan);
        speedupValuesContainer.appendChild(row);
      }
    }
  }
}

