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
  onToggleMultipleSimulators?: (
    toggles: { id: string; active: boolean }[],
  ) => void;
  onToggleLogScale?: (active: boolean) => void;
  onToggleZeroBaseline?: (active: boolean) => void;
  onBaselineChange?: (id: string) => void;
}

import { SIMULATOR_REGISTRY } from './registry';

export interface PresetConfig {
  id: string;
  name: string;
  description: string;
  simulatorIds: string[];
}

export const PRESETS: PresetConfig[] = [
  {
    id: 'h1',
    name: 'H1: Tree vs S&P',
    description:
      'Hypothesis 1: Is an O(N log N) spatial tree always faster than O(N²) Sweep & Prune?',
    simulatorIds: [
      'oop',
      'ecs',
      'ecs-quick',
      'oop-tree',
      'ecs-tree',
      'wasm-tree',
    ],
  },
  {
    id: 'h2',
    name: 'H2: Sorting Strategies',
    description:
      'Hypothesis 2: Is Insertion Sort optimal for mostly-sorted real-time physics data?',
    simulatorIds: ['ecs', 'ecs-quick', 'ecs-merge', 'ecs-native'],
  },
  {
    id: 'h3',
    name: 'H3: JS vs WASM',
    description:
      'Hypothesis 3: Is WebAssembly required to realize the memory locality gains of ECS?',
    simulatorIds: ['ecs-merge', 'wasm-merge', 'ecs-tree', 'wasm-tree'],
  },
  {
    id: 'showdown',
    name: '🏆 Finale: Titan Showdown',
    description:
      'Grand Finale: Pitting the reigning S&P Merge champions head-to-head against the fastest spatial trees.',
    simulatorIds: [
      'oop-tree',
      'ecs-tree',
      'wasm-tree',
      'ecs-merge',
      'wasm-merge',
    ],
  },
  {
    id: 'all',
    name: 'All Simulators',
    description:
      'Sandbox Overview of all available spatial and collision detection benchmarks.',
    simulatorIds: SIMULATOR_REGISTRY.map((s) => s.id),
  },
];

let currentPresetId = 'h1';

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

let btnCopyResults: HTMLButtonElement;
let compareBaselineSelect: HTMLSelectElement;
let speedupValuesContainer: HTMLElement;

let chartFrameIndexEl: HTMLElement;
let chartFrameTotalEl: HTMLElement;
let btnToggleVisualizer: HTMLButtonElement;

// Maps for simulator-specific elements
const currentTimeEls: Record<string, HTMLElement> = {};
const avgTimeEls: Record<string, HTMLElement> = {};
const p99TimeEls: Record<string, HTMLElement> = {};
const fpsEls: Record<string, HTMLElement> = {};
export const canvases: Record<string, HTMLCanvasElement> = {};
const toggles: Record<string, HTMLInputElement> = {};

let toggleLogScale: HTMLInputElement;
let toggleZeroBaseline: HTMLInputElement;

function generatePresets(onSelectPreset: (preset: PresetConfig) => void) {
  const container = document.getElementById('preset-buttons-container');
  const descEl = document.getElementById('preset-desc-text');
  if (!container || !descEl) return;
  container.replaceChildren();

  const currentPreset = PRESETS.find((p) => p.id === currentPresetId);
  if (currentPreset) {
    descEl.textContent = currentPreset.description;
  }

  PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.className = `preset-btn ${preset.id === currentPresetId ? 'active' : ''}`;
    btn.id = `btn-preset-${preset.id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute(
      'aria-selected',
      preset.id === currentPresetId ? 'true' : 'false',
    );
    btn.textContent = preset.name;

    btn.addEventListener('click', () => {
      currentPresetId = preset.id;
      descEl.textContent = preset.description;
      container.querySelectorAll('.preset-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      onSelectPreset(preset);
    });

    container.appendChild(btn);
  });
}

function generateMetricCards(activeSimulatorIds?: string[]) {
  const container = document.getElementById('metrics-cards-pack');
  if (!container) return;
  container.replaceChildren();

  SIMULATOR_REGISTRY.forEach((sim) => {
    const card = document.createElement('div');
    card.className = `metric-card ${sim.id}-card`;
    card.id = `card-metric-${sim.id}`;
    const isActive = activeSimulatorIds
      ? activeSimulatorIds.includes(sim.id)
      : sim.activeByDefault;
    if (!isActive) {
      card.classList.add('hidden');
    }

    const header = document.createElement('label');
    header.className = 'card-header-simple';
    header.htmlFor = `toggle-${sim.id}`;

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '8px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `toggle-${sim.id}`;
    checkbox.checked = isActive;
    leftGroup.appendChild(checkbox);

    const h3 = document.createElement('h3');
    h3.textContent = sim.name;
    leftGroup.appendChild(h3);

    header.appendChild(leftGroup);

    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.backgroundColor = sim.color;
    header.appendChild(dot);
    card.appendChild(header);

    const sourceLink = document.createElement('a');
    sourceLink.className = 'card-source-link';
    sourceLink.href = `https://github.com/dmurph/ecs-on-web/blob/main/src/benchmarks/${sim.sourceFile}`;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = sim.sourceFile;
    card.appendChild(sourceLink);

    const valuesDiv = document.createElement('div');
    valuesDiv.className = 'metric-values';

    const items = [
      { label: 'Current', id: `${sim.id}-current-time` },
      { label: 'Average', id: `${sim.id}-avg-time` },
      { label: '99th %', id: `${sim.id}-p99-time` },
    ];

    items.forEach(({ label, id }) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'metric-item';
      const lbl = document.createElement('span');
      lbl.className = 'metric-label';
      lbl.textContent = label;
      const val = document.createElement('span');
      val.className = 'metric-value font-mono';
      val.id = id;
      val.style.color = sim.color;
      val.textContent = '0.00 ms';
      itemDiv.appendChild(lbl);
      itemDiv.appendChild(val);
      valuesDiv.appendChild(itemDiv);
    });

    card.appendChild(valuesDiv);
    container.appendChild(card);
  });
}

function generateLegend(activeSimulatorIds?: string[]) {
  const container = document.querySelector('.chart-legend')!;
  if (!container) return;
  container.replaceChildren();

  SIMULATOR_REGISTRY.forEach((sim) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.id = `legend-item-${sim.id}`;
    const isActive = activeSimulatorIds
      ? activeSimulatorIds.includes(sim.id)
      : sim.activeByDefault;
    if (!isActive) {
      item.classList.add('hidden');
    }

    const colorSpan = document.createElement('span');
    colorSpan.className = 'legend-color';
    colorSpan.style.backgroundColor = sim.color;

    item.appendChild(colorSpan);
    item.appendChild(document.createTextNode(sim.name));
    container.appendChild(item);
  });
}

function generateCanvases(activeSimulatorIds?: string[]) {
  const container = document.querySelector('.visualizer-grid') as HTMLElement;
  if (!container) return;
  container.style.minHeight = '';
  container.replaceChildren();

  SIMULATOR_REGISTRY.forEach((sim) => {
    const card = document.createElement('div');
    card.className = 'canvas-card';
    card.id = `card-canvas-${sim.id}`;
    const isActive = activeSimulatorIds
      ? activeSimulatorIds.includes(sim.id)
      : sim.activeByDefault;
    if (!isActive) {
      card.classList.add('hidden');
    }

    const header = document.createElement('div');
    header.className = 'canvas-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'canvas-header-left';

    const colorSquare = document.createElement('span');
    colorSquare.className = 'toggle-color-square';
    colorSquare.style.backgroundColor = sim.color;
    headerLeft.appendChild(colorSquare);

    const title = document.createElement('h3');
    title.textContent = sim.name;
    headerLeft.appendChild(title);

    header.appendChild(headerLeft);

    const fpsSpan = document.createElement('span');
    fpsSpan.className = 'render-fps';
    fpsSpan.id = `${sim.id}-fps`;
    fpsSpan.textContent = '0 FPS';
    header.appendChild(fpsSpan);

    card.appendChild(header);

    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'canvas-container';

    const canvas = document.createElement('canvas');
    canvas.id = `canvas-${sim.id}`;
    canvas.width = 1000;
    canvas.height = 800;
    canvasContainer.appendChild(canvas);

    card.appendChild(canvasContainer);
    container.appendChild(card);
  });
}

export function initUI(activeSimulatorIds?: string[]) {
  const activeIds =
    activeSimulatorIds ??
    PRESETS.find((p) => p.id === 'h1')?.simulatorIds ??
    SIMULATOR_REGISTRY.filter((s) => s.activeByDefault).map((s) => s.id);
  const match = PRESETS.find(
    (p) =>
      p.simulatorIds.length === activeIds.length &&
      p.simulatorIds.every((id) => activeIds.includes(id)),
  );
  currentPresetId = match ? match.id : '';

  generateMetricCards(activeIds);
  generateLegend(activeIds);
  generateCanvases(activeIds);

  toggleLogScale = document.getElementById(
    'toggle-log-scale',
  ) as HTMLInputElement;
  toggleZeroBaseline = document.getElementById(
    'toggle-zero-baseline',
  ) as HTMLInputElement;

  statusPulse = document.getElementById('status-pulse')!;
  statusText = document.getElementById('status-text')!;
  entitySlider = document.getElementById(
    'entity-count-slider',
  ) as HTMLInputElement;
  entityVal = document.getElementById('entity-count-val')!;
  behaviorSelect = document.getElementById(
    'movement-behavior-select',
  ) as HTMLSelectElement;
  coherenceDesc = document.getElementById('coherence-desc')!;
  speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  speedVal = document.getElementById('speed-val')!;
  lengthSlider = document.getElementById(
    'benchmark-frames-slider',
  ) as HTMLInputElement;
  lengthVal = document.getElementById('benchmark-frames-val')!;

  btnRun = document.getElementById('btn-run-benchmark') as HTMLButtonElement;
  btnPause = document.getElementById('btn-toggle-pause') as HTMLButtonElement;
  btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  btnCopyResults = document.getElementById(
    'btn-copy-results',
  ) as HTMLButtonElement;
  compareBaselineSelect = document.getElementById(
    'compare-baseline-select',
  ) as HTMLSelectElement;
  speedupValuesContainer = document.getElementById('speedup-values-container')!;

  chartFrameIndexEl = document.getElementById('chart-frame-index')!;
  chartFrameTotalEl = document.getElementById('chart-frame-total')!;
  btnToggleVisualizer = document.getElementById(
    'btn-toggle-visualizer',
  ) as HTMLButtonElement;

  SIMULATOR_REGISTRY.forEach((sim) => {
    toggles[sim.id] = document.getElementById(
      `toggle-${sim.id}`,
    ) as HTMLInputElement;
    currentTimeEls[sim.id] = document.getElementById(`${sim.id}-current-time`)!;
    avgTimeEls[sim.id] = document.getElementById(`${sim.id}-avg-time`)!;
    p99TimeEls[sim.id] = document.getElementById(`${sim.id}-p99-time`)!;
    fpsEls[sim.id] = document.getElementById(`${sim.id}-fps`)!;
    canvases[sim.id] = document.getElementById(
      `canvas-${sim.id}`,
    ) as HTMLCanvasElement;
  });

  resizeCanvases();
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

  if (btnToggleVisualizer) {
    let isVisualizerVisible = false; // Default to not showing
    try {
      const hash = window.location.hash;
      const query = window.location.search;
      isVisualizerVisible =
        hash.includes('vis=expanded') ||
        hash.includes('vis=true') ||
        query.includes('vis=true');
    } catch (e) {}

    const grid = document.querySelector('.visualizer-grid');
    btnToggleVisualizer.textContent = isVisualizerVisible
      ? 'Hide Visualizations'
      : 'Show Bouncing Balls!';
    if (grid) grid.classList.toggle('hidden', !isVisualizerVisible);

    btnToggleVisualizer.addEventListener('click', () => {
      isVisualizerVisible = !isVisualizerVisible;
      try {
        const hashStr = isVisualizerVisible ? '#vis=expanded' : '';
        history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + hashStr,
        );
      } catch (e) {}
      btnToggleVisualizer.textContent = isVisualizerVisible
        ? 'Hide Visualizations'
        : 'Show Bouncing Balls!';
      if (grid) {
        grid.classList.toggle('hidden', !isVisualizerVisible);
        if (isVisualizerVisible) {
          resizeCanvases();
        }
      }
    });
  }

  compareBaselineSelect.addEventListener('change', () => {
    callbacks.onBaselineChange?.(compareBaselineSelect.value);
  });

  const handleToggle = (id: string, checkbox: HTMLInputElement) => {
    checkbox.addEventListener('change', () => {
      const active = checkbox.checked;
      currentPresetId = '';
      document.querySelectorAll('.preset-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      updateCardActiveState(id, active);
      callbacks.onToggleSimulator?.(id, active);
    });
  };

  SIMULATOR_REGISTRY.forEach((sim) => {
    const cb = toggles[sim.id];
    if (cb) {
      handleToggle(sim.id, cb);
    }
  });

  generatePresets((preset) => {
    const updates = SIMULATOR_REGISTRY.map((sim) => ({
      id: sim.id,
      active: preset.simulatorIds.includes(sim.id),
    }));

    updates.forEach(({ id, active }) => {
      const cb = toggles[id];
      if (cb) cb.checked = active;
      toggleCardVisibility(id, active);
    });

    if (callbacks.onToggleMultipleSimulators) {
      callbacks.onToggleMultipleSimulators(updates);
    }
  });

  const btnSelectAll = document.getElementById('btn-select-all');
  const btnSelectNone = document.getElementById('btn-select-none');

  if (btnSelectAll && btnSelectNone) {
    btnSelectAll.addEventListener('click', () => {
      currentPresetId = 'all';
      const descEl = document.getElementById('preset-desc-text');
      const allPreset = PRESETS.find((p) => p.id === 'all');
      if (descEl && allPreset) descEl.textContent = allPreset.description;
      document.querySelectorAll('.preset-btn').forEach((b) => {
        b.classList.toggle('active', b.id === 'btn-preset-all');
        b.setAttribute(
          'aria-selected',
          b.id === 'btn-preset-all' ? 'true' : 'false',
        );
      });

      const updates = SIMULATOR_REGISTRY.map((sim) => ({
        id: sim.id,
        active: true,
      }));
      updates.forEach(({ id }) => {
        const cb = toggles[id];
        if (cb) cb.checked = true;
        toggleCardVisibility(id, true);
      });
      callbacks.onToggleMultipleSimulators?.(updates);
    });

    btnSelectNone.addEventListener('click', () => {
      currentPresetId = '';
      document.querySelectorAll('.preset-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });

      const updates = SIMULATOR_REGISTRY.map((sim) => ({
        id: sim.id,
        active: false,
      }));
      updates.forEach(({ id }) => {
        const cb = toggles[id];
        if (cb) cb.checked = false;
        updateCardActiveState(id, false);
      });
      callbacks.onToggleMultipleSimulators?.(updates);
    });
  }

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

export function updateUI(
  numEntities: number,
  speedMultiplier: number,
  benchmarkLength: number,
) {
  entityVal.textContent = numEntities.toLocaleString();
  speedVal.textContent = speedMultiplier.toFixed(1) + 'x';
  lengthVal.textContent = benchmarkLength.toLocaleString() + ' frames';
  chartFrameTotalEl.textContent = benchmarkLength.toString();
}

export function updateStatus(status: string, pulseClass: string) {
  statusText.textContent = status;
  statusPulse.className = `pulse-indicator ${pulseClass}`;
}

export function updateFps(fpsMap: Record<string, number>) {
  Object.entries(fpsMap).forEach(([id, fps]) => {
    const el = fpsEls[id];
    if (el) {
      el.textContent = `${fps} FPS`;
    }
  });
}

export function setPauseButtonText(text: string) {
  btnPause.textContent = text;
}

export function setButtonDisabledStates(
  runDisabled: boolean,
  pauseDisabled: boolean,
) {
  btnRun.disabled = runDisabled;
  btnPause.disabled = pauseDisabled;
}

export function resetUIElements(
  defaultValues: {
    entityCount: number;
    speed: number;
    length: number;
    behavior: string;
  },
  activeSims: string[],
  baselineId: string,
) {
  SIMULATOR_REGISTRY.forEach((sim) => {
    if (currentTimeEls[sim.id]) currentTimeEls[sim.id].textContent = '0.00 ms';
    if (avgTimeEls[sim.id]) avgTimeEls[sim.id].textContent = '0.00 ms';
    if (p99TimeEls[sim.id]) p99TimeEls[sim.id].textContent = '0.00 ms';
    if (fpsEls[sim.id]) fpsEls[sim.id].textContent = '0 FPS';
  });

  renderInitialSpeedups(activeSims, baselineId);
  chartFrameIndexEl.textContent = '0';

  statusPulse.className = 'pulse-indicator';
  statusText.textContent = 'Ready';

  btnRun.disabled = false;
  btnPause.disabled = true;
  btnPause.textContent = 'Pause';

  entitySlider.value = defaultValues.entityCount.toString();
  speedSlider.value = defaultValues.speed.toString();
  lengthSlider.value = defaultValues.length.toString();
  behaviorSelect.value = defaultValues.behavior;

  updateCoherenceDesc(defaultValues.behavior);
}

export function updateMetricsDisplay(data: {
  currentFrame: number;
  times: Record<string, number>;
  history: Record<string, number[]>;
  activeSimulators: string[];
  baselineSimulatorId: string;
}) {
  chartFrameIndexEl.textContent = data.currentFrame.toString();

  SIMULATOR_REGISTRY.forEach((sim) => {
    const time = data.times[sim.id] ?? 0;
    const currentEl = currentTimeEls[sim.id];
    if (currentEl) {
      currentEl.textContent = `${time.toFixed(3)} ms`;
    }
  });

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const averages: Record<string, number> = {};
  SIMULATOR_REGISTRY.forEach((sim) => {
    const hist = data.history[sim.id] || [];
    const val = avg(hist);
    averages[sim.id] = val;
    const avgEl = avgTimeEls[sim.id];
    if (avgEl) {
      avgEl.textContent = `${val.toFixed(3)} ms`;
    }
  });

  const p99 = (arr: number[], current: number) => {
    if (!arr.length) return current;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] || current;
  };

  SIMULATOR_REGISTRY.forEach((sim) => {
    const hist = data.history[sim.id] || [];
    const val = p99(hist, data.times[sim.id] ?? 0);
    const p99El = p99TimeEls[sim.id];
    if (p99El) {
      p99El.textContent = `${val.toFixed(3)} ms`;
    }
  });

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
    for (const sim of SIMULATOR_REGISTRY) {
      if (
        sim.id !== data.baselineSimulatorId &&
        data.activeSimulators.includes(sim.id)
      ) {
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

function setCopyIcon(success: boolean) {
  const svgStr = success
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="check-icon"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  btnCopyResults.replaceChildren(doc.documentElement);
}

export function handleCopyFeedback(success: boolean) {
  if (success) {
    setCopyIcon(true);
    btnCopyResults.classList.add('copied');
    setTimeout(() => {
      setCopyIcon(false);
      btnCopyResults.classList.remove('copied');
    }, 2000);
  }
}

function resizeCanvases() {
  let w = 0;
  let h = 0;
  for (const sim of SIMULATOR_REGISTRY) {
    const canvas = canvases[sim.id];
    if (canvas) {
      const parent = canvas.parentElement;
      if (parent && parent.clientWidth > 0) {
        w = parent.clientWidth;
        h = parent.clientHeight;
        break;
      }
    }
  }

  if (w === 0 || h === 0) {
    const sectionEl = document.querySelector('.section-output');
    w =
      sectionEl && sectionEl.clientWidth > 0
        ? sectionEl.clientWidth
        : window.innerWidth;
    h = 500;
  }

  if (w > 0 && h > 0) {
    SIMULATOR_REGISTRY.forEach((sim) => {
      const canvas = canvases[sim.id];
      if (canvas) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    });
  }
}

export function setupResizeListener(onResize: () => void) {
  window.addEventListener('resize', () => {
    resizeCanvases();
    onResize();
  });
}

export function updateCardActiveState(id: string, active: boolean) {
  const canvasCard = document.getElementById(`card-canvas-${id}`);
  const metricCard = document.getElementById(`card-metric-${id}`);
  if (canvasCard) canvasCard.classList.toggle('card-inactive', !active);
  if (metricCard) metricCard.classList.toggle('card-inactive', !active);
}

export function toggleCardVisibility(id: string, visible: boolean) {
  const canvasCard = document.getElementById(`card-canvas-${id}`);
  const metricCard = document.getElementById(`card-metric-${id}`);
  if (canvasCard) {
    canvasCard.classList.toggle('hidden', !visible);
    canvasCard.classList.remove('card-inactive');
  }
  if (metricCard) {
    metricCard.classList.toggle('hidden', !visible);
    metricCard.classList.remove('card-inactive');
  }
  const legendItem = document.getElementById(`legend-item-${id}`);
  if (legendItem) {
    legendItem.classList.toggle('hidden', !visible);
  }
  resizeCanvases();
}

export function updateBaselineOptions(
  activeSims: string[],
  selectedBaselineId: string,
) {
  compareBaselineSelect.innerHTML = '';
  for (const sim of SIMULATOR_REGISTRY) {
    if (activeSims.includes(sim.id)) {
      const opt = document.createElement('option');
      opt.value = sim.id;
      opt.textContent = sim.name;
      opt.selected = sim.id === selectedBaselineId;
      compareBaselineSelect.appendChild(opt);
    }
  }
}

export function renderInitialSpeedups(
  activeSims: string[],
  baselineId: string,
) {
  speedupValuesContainer.innerHTML = '';

  if (activeSims.length <= 1) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'speedup-row font-mono';
    emptyRow.style.color = 'var(--color-text-dim)';
    emptyRow.style.fontSize = '0.8rem';
    emptyRow.textContent = 'Add active simulators to compare';
    speedupValuesContainer.appendChild(emptyRow);
  } else {
    for (const sim of SIMULATOR_REGISTRY) {
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
