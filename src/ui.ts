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
  onToggleMultipleSimulators?: (toggles: { id: string; active: boolean }[]) => void;
  onToggleLogScale?: (active: boolean) => void;
  onToggleZeroBaseline?: (active: boolean) => void;
  onBaselineChange?: (id: string) => void;
}

import { SIMULATOR_REGISTRY } from './registry';

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

// Maps for simulator-specific elements
const currentTimeEls: Record<string, HTMLElement> = {};
const avgTimeEls: Record<string, HTMLElement> = {};
const p99TimeEls: Record<string, HTMLElement> = {};
const fpsEls: Record<string, HTMLElement> = {};
export const canvases: Record<string, HTMLCanvasElement> = {};
const toggles: Record<string, HTMLInputElement> = {};

let toggleLogScale: HTMLInputElement;
let toggleZeroBaseline: HTMLInputElement;

interface ContainerDefinition {
  subgroups: {
    title: string;
    simulatorIds: string[];
  }[];
}

interface GroupDefinition {
  title: string;
  containers: ContainerDefinition[];
}

const UI_GROUPS: GroupDefinition[] = [
  {
    title: 'JavaScript Simulators',
    containers: [
      {
        subgroups: [
          {
            title: 'S&P (OOP):',
            simulatorIds: ['oop', 'oop-quick', 'oop-merge', 'oop-native']
          },
          {
            title: 'S&P (ECS):',
            simulatorIds: ['ecs', 'ecs-quick', 'ecs-merge', 'ecs-native']
          }
        ]
      },
      {
        subgroups: [
          {
            title: 'Spatial Tree:',
            simulatorIds: ['oop-tree', 'ecs-tree']
          }
        ]
      }
    ]
  },
  {
    title: 'WebAssembly Simulators',
    containers: [
      {
        subgroups: [
          {
            title: 'S&P (WASM):',
            simulatorIds: ['wasm', 'wasm-quick', 'wasm-merge']
          }
        ]
      }
    ]
  }
];

function generateToggles(activeSimulatorIds?: string[]) {
  const container = document.querySelector('.toggle-group')!;
  if (!container) return;
  container.innerHTML = '';

  UI_GROUPS.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'toggle-section';

    const header = document.createElement('div');
    header.className = 'toggle-section-header';
    header.textContent = group.title;
    groupEl.appendChild(header);

    const containersList = document.createElement('div');
    containersList.className = 'toggle-containers-list';

    group.containers.forEach(containerDef => {
      const containerEl = document.createElement('div');
      containerEl.className = 'toggle-container';

      containerDef.subgroups.forEach(sub => {
        const subgroupEl = document.createElement('div');
        subgroupEl.className = 'toggle-subgroup';

        const subTitle = document.createElement('span');
        subTitle.className = 'subgroup-title';
        subTitle.textContent = sub.title;
        subgroupEl.appendChild(subTitle);

        const togglesContainer = document.createElement('div');
        togglesContainer.className = 'subgroup-toggles';

        sub.simulatorIds.forEach(simId => {
          const sim = SIMULATOR_REGISTRY.find(s => s.id === simId);
          if (sim) {
            const label = document.createElement('label');
            label.className = 'toggle-label';
            
            let displayName = sim.name;
            if (sim.id.startsWith('oop-') && sim.id !== 'oop-tree') {
              displayName = sim.name.replace('OOP S&P (', '').replace(')', '');
            } else if (sim.id === 'oop') {
              displayName = 'Insertion';
            } else if (sim.id.startsWith('ecs-') && sim.id !== 'ecs-tree') {
              displayName = sim.name.replace('ECS S&P (', '').replace(')', '');
            } else if (sim.id === 'ecs') {
              displayName = 'Insertion';
            } else if (sim.id.startsWith('wasm-')) {
              displayName = sim.name.replace('WASM ECS S&P (', '').replace(')', '');
            } else if (sim.id === 'wasm') {
              displayName = 'Insertion';
            }

            const isChecked = activeSimulatorIds ? activeSimulatorIds.includes(sim.id) : sim.activeByDefault;
            label.innerHTML = `<input type="checkbox" id="toggle-${sim.id}" ${isChecked ? 'checked' : ''} /><span class="toggle-color-square" style="background-color: ${sim.color}"></span>${displayName}`;
            togglesContainer.appendChild(label);
          }
        });

        subgroupEl.appendChild(togglesContainer);
        containerEl.appendChild(subgroupEl);
      });

      containersList.appendChild(containerEl);
    });

    groupEl.appendChild(containersList);
    container.appendChild(groupEl);
  });
}

function generateMetricCards(activeSimulatorIds?: string[]) {
  const container = document.querySelector('.metrics-grid')!;
  if (!container) return;
  
  // Remove all cards that are not the speedup-card
  const cards = container.querySelectorAll('.metric-card');
  cards.forEach(card => {
    if (!card.classList.contains('speedup-card')) {
      card.remove();
    }
  });

  const speedupCard = container.querySelector('.speedup-card')!;
  SIMULATOR_REGISTRY.forEach(sim => {
    const card = document.createElement('div');
    card.className = `metric-card ${sim.id}-card`;
    card.id = `card-metric-${sim.id}`;
    const isActive = activeSimulatorIds ? activeSimulatorIds.includes(sim.id) : sim.activeByDefault;
    if (!isActive) {
      card.classList.add('hidden');
    }
    card.innerHTML = `
      <div class="card-header-simple">
        <h3>${sim.name}</h3>
        <span class="legend-dot" style="background-color: ${sim.color}"></span>
      </div>
      <div class="metric-values">
        <div class="metric-item">
          <span class="metric-label">Current</span>
          <span class="metric-value font-mono" id="${sim.id}-current-time" style="color: ${sim.color}">0.00 ms</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Average</span>
          <span class="metric-value font-mono" id="${sim.id}-avg-time" style="color: ${sim.color}">0.00 ms</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">99th %</span>
          <span class="metric-value font-mono" id="${sim.id}-p99-time" style="color: ${sim.color}">0.00 ms</span>
        </div>
      </div>
    `;
    container.insertBefore(card, speedupCard);
  });
}

function generateLegend(activeSimulatorIds?: string[]) {
  const container = document.querySelector('.chart-legend')!;
  if (!container) return;
  container.innerHTML = '';
  SIMULATOR_REGISTRY.forEach(sim => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.id = `legend-item-${sim.id}`;
    const isActive = activeSimulatorIds ? activeSimulatorIds.includes(sim.id) : sim.activeByDefault;
    if (!isActive) {
      item.classList.add('hidden');
    }
    item.innerHTML = `<span class="legend-color" style="background-color: ${sim.color}"></span>${sim.name}`;
    container.appendChild(item);
  });
}

function generateCanvases(activeSimulatorIds?: string[]) {
  const container = document.querySelector('.visualizer-grid')!;
  if (!container) return;
  container.innerHTML = '';
  SIMULATOR_REGISTRY.forEach(sim => {
    const card = document.createElement('div');
    card.className = 'canvas-card';
    card.id = `card-canvas-${sim.id}`;
    const isActive = activeSimulatorIds ? activeSimulatorIds.includes(sim.id) : sim.activeByDefault;
    if (!isActive) {
      card.classList.add('hidden');
    }
    card.innerHTML = `
      <div class="canvas-header">
        <h3>${sim.name}</h3>
        <span class="render-fps" id="${sim.id}-fps">0 FPS</span>
      </div>
      <div class="canvas-container">
        <canvas id="canvas-${sim.id}" width="1000" height="800"></canvas>
      </div>
    `;
    container.appendChild(card);
  });
}

export function initUI(activeSimulatorIds?: string[]) {
  // Generate dynamic DOM structures
  generateToggles(activeSimulatorIds);
  generateMetricCards(activeSimulatorIds);
  generateLegend(activeSimulatorIds);
  generateCanvases(activeSimulatorIds);

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

  btnCopyResults = document.getElementById('btn-copy-results') as HTMLButtonElement;
  compareBaselineSelect = document.getElementById('compare-baseline-select') as HTMLSelectElement;
  speedupValuesContainer = document.getElementById('speedup-values-container')!;

  chartFrameIndexEl = document.getElementById('chart-frame-index')!;
  chartFrameTotalEl = document.getElementById('chart-frame-total')!;

  // Fill simulator maps
  SIMULATOR_REGISTRY.forEach(sim => {
    toggles[sim.id] = document.getElementById(`toggle-${sim.id}`) as HTMLInputElement;
    currentTimeEls[sim.id] = document.getElementById(`${sim.id}-current-time`)!;
    avgTimeEls[sim.id] = document.getElementById(`${sim.id}-avg-time`)!;
    p99TimeEls[sim.id] = document.getElementById(`${sim.id}-p99-time`)!;
    fpsEls[sim.id] = document.getElementById(`${sim.id}-fps`)!;
    canvases[sim.id] = document.getElementById(`canvas-${sim.id}`) as HTMLCanvasElement;
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

  SIMULATOR_REGISTRY.forEach(sim => {
    const cb = toggles[sim.id];
    if (cb) {
      handleToggle(sim.id, cb);
    }
  });

  const btnSelectAll = document.getElementById('btn-select-all');
  const btnSelectNone = document.getElementById('btn-select-none');

  if (btnSelectAll && btnSelectNone) {
    btnSelectAll.addEventListener('click', () => {
      const updates: { id: string; active: boolean }[] = [];
      SIMULATOR_REGISTRY.forEach(sim => {
        const cb = toggles[sim.id];
        if (cb && !cb.checked) {
          cb.checked = true;
          toggleCardVisibility(sim.id, true);
          updates.push({ id: sim.id, active: true });
        }
      });
      if (updates.length > 0) {
        if (callbacks.onToggleMultipleSimulators) {
          callbacks.onToggleMultipleSimulators(updates);
        } else {
          updates.forEach(u => callbacks.onToggleSimulator?.(u.id, u.active));
        }
      }
    });

    btnSelectNone.addEventListener('click', () => {
      const updates: { id: string; active: boolean }[] = [];
      SIMULATOR_REGISTRY.forEach(sim => {
        const cb = toggles[sim.id];
        if (cb && cb.checked) {
          cb.checked = false;
          toggleCardVisibility(sim.id, false);
          updates.push({ id: sim.id, active: false });
        }
      });
      if (updates.length > 0) {
        if (callbacks.onToggleMultipleSimulators) {
          callbacks.onToggleMultipleSimulators(updates);
        } else {
          updates.forEach(u => callbacks.onToggleSimulator?.(u.id, u.active));
        }
      }
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

export function setButtonDisabledStates(runDisabled: boolean, pauseDisabled: boolean) {
  btnRun.disabled = runDisabled;
  btnPause.disabled = pauseDisabled;
}

export function resetUIElements(
  defaultValues: { entityCount: number; speed: number; length: number; behavior: string },
  activeSims: string[],
  baselineId: string
) {
  SIMULATOR_REGISTRY.forEach(sim => {
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

  // Sync sliders to actual values
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

  SIMULATOR_REGISTRY.forEach(sim => {
    const time = data.times[sim.id] ?? 0;
    const currentEl = currentTimeEls[sim.id];
    if (currentEl) {
      currentEl.textContent = `${time.toFixed(3)} ms`;
    }
  });

  // Calculate Averages
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const averages: Record<string, number> = {};
  SIMULATOR_REGISTRY.forEach(sim => {
    const hist = data.history[sim.id] || [];
    const val = avg(hist);
    averages[sim.id] = val;
    const avgEl = avgTimeEls[sim.id];
    if (avgEl) {
      avgEl.textContent = `${val.toFixed(3)} ms`;
    }
  });

  // Calculate 99th Percentiles
  const p99 = (arr: number[], current: number) => {
    if (!arr.length) return current;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] || current;
  };

  SIMULATOR_REGISTRY.forEach(sim => {
    const hist = data.history[sim.id] || [];
    const val = p99(hist, data.times[sim.id] ?? 0);
    const p99El = p99TimeEls[sim.id];
    if (p99El) {
      p99El.textContent = `${val.toFixed(3)} ms`;
    }
  });

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
    for (const sim of SIMULATOR_REGISTRY) {
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

  if (w > 0 && h > 0) {
    SIMULATOR_REGISTRY.forEach(sim => {
      const canvas = canvases[sim.id];
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
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

