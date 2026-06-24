import type { Simulator } from './simulator';
import { SIMULATOR_REGISTRY } from './registry';
import { renderCanvas } from './renderer';
import { drawChartSVG, resetChartLabels } from './chart';
import {
  canvases,
  updateStatus,
  updateFps,
  setPauseButtonText,
  setButtonDisabledStates,
  resetUIElements,
  updateMetricsDisplay
} from './ui';
import { SeededPRNG } from './prng';

export interface SimulatorWrapper {
  id: string;
  name: string;
  instance: Simulator;
}

export class BenchmarkRunner {
  // Benchmark Parameters
  public numEntities = 5000;
  public movementBehavior = 'wander'; // 'wander' | 'erratic' | 'static'
  public speedMultiplier = 1.0;
  public benchmarkLength = 1000;
  public useLogScale = true;
  public useZeroBaseline = false;
  public baselineSimulatorId = 'oop';

  // Run State
  public isRunning = false;
  public isPaused = false;
  public isWarmingUp = false;
  public warmupFrame = 0;
  public readonly warmupFramesCount = 20;
  public currentFrame = 0;
  public animationFrameId: number | null = null;
  public totalFramesProcessed = 0;

  public simulators: SimulatorWrapper[] = [];
  public activeSimulators: SimulatorWrapper[] = [];
  private prngs: Record<string, SeededPRNG> = {};
  private contexts: Record<string, CanvasRenderingContext2D> = {};

  // FPS tracking
  private lastRenderTime = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor() {
    this.simulators = SIMULATOR_REGISTRY.map(sim => ({
      id: sim.id,
      name: sim.name,
      instance: sim.createInstance()
    }));

    // Seeded PRNGs
    SIMULATOR_REGISTRY.forEach(sim => {
      this.prngs[sim.id] = new SeededPRNG();
    });

    const storedActiveIds = this.getStoredActiveSimulatorIds();
    if (storedActiveIds && storedActiveIds.length > 0) {
      this.activeSimulators = this.simulators.filter(s => storedActiveIds.includes(s.id));
    }
    if (this.activeSimulators.length === 0) {
      this.activeSimulators = this.simulators.filter((_, idx) => SIMULATOR_REGISTRY[idx].activeByDefault);
    }
  }

  private getStoredActiveSimulatorIds(): string[] | null {
    try {
      const val = localStorage.getItem('ecs-benchmark-active-simulators');
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  }

  public initContexts() {
    this.contexts = {};
    SIMULATOR_REGISTRY.forEach(sim => {
      const canvas = canvases[sim.id];
      if (canvas) {
        this.contexts[sim.id] = canvas.getContext('2d')!;
      }
    });
  }

  public initEntities() {
    const firstCanvas = Object.values(canvases)[0];
    const w = firstCanvas ? firstCanvas.width : 1000;
    const h = firstCanvas ? firstCanvas.height : 800;

    for (const sim of this.simulators) {
      sim.instance.init(this.numEntities, w, h, this.prngs[sim.id]);
    }

    // Sync initial positions to ensure identical starting states
    const baselineSim = this.simulators[0];
    if (baselineSim) {
      const baselinePositions = baselineSim.instance.getPositions();
      for (const sim of this.simulators) {
        if (sim !== baselineSim) {
          sim.instance.setPositions(baselinePositions);
        }
      }
    }
  }

  public resetBenchmark() {
    this.isRunning = false;
    this.isPaused = false;
    this.isWarmingUp = false;
    this.warmupFrame = 0;
    this.currentFrame = 0;
    this.totalFramesProcessed = 0;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    for (const sim of this.simulators) {
      sim.instance.clearTimes();
    }

    resetChartLabels();
    this.initEntities();
    
    // Reset UI elements
    resetUIElements(
      {
        entityCount: this.numEntities,
        speed: this.speedMultiplier,
        length: this.benchmarkLength,
        behavior: this.movementBehavior
      },
      this.activeSimulators.map(s => s.id),
      this.baselineSimulatorId
    );

    // Render initial state
    for (const sim of this.activeSimulators) {
      const ctx = this.contexts[sim.id];
      if (ctx) {
        const entities = sim.instance.getRenderEntities();
        if (entities.length > 0) {
          renderCanvas(ctx.canvas, ctx, entities);
        }
      }
    }
    
    this.drawChart();
  }

  public drawChart() {
    const timesMap: Record<string, number[]> = {};
    this.activeSimulators.forEach(sim => {
      timesMap[sim.id] = sim.instance.getTimes();
    });
    
    drawChartSVG('svg-chart-container', timesMap, this.benchmarkLength, this.useLogScale, this.useZeroBaseline);
  }

  public startBenchmark() {
    if (this.isRunning) return;

    if (this.currentFrame >= this.benchmarkLength) {
      this.resetBenchmark();
    }

    this.isRunning = true;
    this.isPaused = false;
    this.isWarmingUp = true;
    this.warmupFrame = 0;
    this.lastRenderTime = performance.now();
    this.fpsTimer = 0;
    this.frameCount = 0;

    updateStatus(`Warmup (0/${this.warmupFramesCount})`, 'running');
    setButtonDisabledStates(true, false);

    this.loop();
  }

  public togglePause() {
    if (!this.isRunning) return;

    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      updateStatus('Paused', 'paused');
      setPauseButtonText('Resume');
    } else {
      updateStatus('Running', 'running');
      setPauseButtonText('Pause');
      this.lastRenderTime = performance.now();
      this.loop();
    }
  }

  private loop() {
    if (!this.isRunning || this.isPaused) return;

    const now = performance.now();
    const dt = now - this.lastRenderTime;
    this.lastRenderTime = now;

    // FPS calculation
    this.fpsTimer += dt;
    this.frameCount++;
    if (this.fpsTimer >= 1000) {
      const fpsMap: Record<string, number> = {};
      SIMULATOR_REGISTRY.forEach(sim => {
        fpsMap[sim.id] = this.activeSimulators.some(s => s.id === sim.id) ? this.frameCount : 0;
      });
      updateFps(fpsMap);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // 1. SEED PRNGS
    const frameSeed = this.totalFramesProcessed + 1;
    for (const sim of this.simulators) {
      this.prngs[sim.id].setSeed(frameSeed);
    }
    this.totalFramesProcessed++;

    // 2. RUN TIMED BENCHMARKS & PHYSICS RESOLUTION
    const firstCanvas = Object.values(canvases)[0];
    const w = firstCanvas ? firstCanvas.width : 1000;
    const h = firstCanvas ? firstCanvas.height : 800;

    const times: Record<string, number> = {};
    for (const sim of this.activeSimulators) {
      const prng = this.prngs[sim.id];
      const result = sim.instance.update(w, h, this.speedMultiplier, this.movementBehavior, prng);
      times[sim.id] = result.time;
    }

    // Handle Warmup vs Recording
    if (this.isWarmingUp) {
      this.warmupFrame++;
      updateStatus(`Warmup (${this.warmupFrame}/${this.warmupFramesCount})`, 'running');
      if (this.warmupFrame >= this.warmupFramesCount) {
        this.isWarmingUp = false;
        for (const s of this.simulators) {
          s.instance.clearTimes();
        }
        updateStatus('Running', 'running');
      }
    } else {
      this.currentFrame++;
      
      const timesMap: Record<string, number> = {};
      const historyMap: Record<string, number[]> = {};
      
      SIMULATOR_REGISTRY.forEach(sim => {
        const instantiatedSim = this.simulators.find(s => s.id === sim.id)!;
        const isActive = this.activeSimulators.includes(instantiatedSim);
        timesMap[sim.id] = isActive ? times[sim.id] : 0;
        historyMap[sim.id] = instantiatedSim.instance.getTimes();
      });

      updateMetricsDisplay({
        currentFrame: this.currentFrame,
        times: timesMap,
        history: historyMap,
        activeSimulators: this.activeSimulators.map(s => s.id),
        baselineSimulatorId: this.baselineSimulatorId
      });

      this.drawChart();
    }

    // 4. RENDER CANVASES
    for (const sim of this.activeSimulators) {
      const ctx = this.contexts[sim.id];
      if (ctx) {
        const entities = sim.instance.getRenderEntities();
        if (entities.length > 0) {
          renderCanvas(ctx.canvas, ctx, entities);
        }
      }
    }

    // Check end condition
    if (this.currentFrame >= this.benchmarkLength) {
      this.finishBenchmark();
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  private finishBenchmark() {
    this.isRunning = false;
    this.isPaused = false;
    updateStatus('Finished', '');
    setButtonDisabledStates(false, true);
    setPauseButtonText('Pause');
  }

  public triggerMetricsUpdate() {
    const timesMap: Record<string, number> = {};
    const historyMap: Record<string, number[]> = {};

    SIMULATOR_REGISTRY.forEach(sim => {
      const instantiatedSim = this.simulators.find(s => s.id === sim.id)!;
      const isActive = this.activeSimulators.includes(instantiatedSim);
      const times = instantiatedSim.instance.getTimes();
      timesMap[sim.id] = isActive ? (times[times.length - 1] || 0) : 0;
      historyMap[sim.id] = times;
    });

    updateMetricsDisplay({
      currentFrame: this.currentFrame,
      times: timesMap,
      history: historyMap,
      activeSimulators: this.activeSimulators.map(s => s.id),
      baselineSimulatorId: this.baselineSimulatorId
    });
  }

  public getResultsMarkdown(): string {
    const coherenceLabel = this.movementBehavior.charAt(0).toUpperCase() + this.movementBehavior.slice(1);
    
    const baselineSim = this.simulators.find(s => s.id === this.baselineSimulatorId);
    const baselineTimes = baselineSim ? baselineSim.instance.getTimes() : [];
    const avgBaseline = baselineTimes.length ? baselineTimes.reduce((a, b) => a + b, 0) / baselineTimes.length : 0;
    const baselineActive = baselineSim ? this.activeSimulators.includes(baselineSim) : false;

    let tableRows = '';
    for (const sim of this.activeSimulators) {
      const times = sim.instance.getTimes();
      const sum = times.reduce((a, b) => a + b, 0);
      const avg = times.length ? sum / times.length : 0;
      const sorted = [...times].sort((a, b) => a - b);
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      
      let speedupText = '1.00x';
      if (sim.id !== this.baselineSimulatorId) {
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
- Entity Count: ${this.numEntities.toLocaleString()}
- Spatial Coherence: ${coherenceLabel}
- Speed Multiplier: ${this.speedMultiplier.toFixed(1)}x
- Benchmark Length: ${this.benchmarkLength} frames`;

    return resultsMarkdown;
  }
}
