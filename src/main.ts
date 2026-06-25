import {
  initUI,
  setupUIListeners,
  setupResizeListener,
  updateUI,
  updateBaselineOptions,
  handleCopyFeedback,
} from './ui';
import { BenchmarkRunner } from './runner';

const runner = new BenchmarkRunner();

// === INITIALIZATION & SETUP ===
initUI(runner.activeSimulators.map((s) => s.id));
updateBaselineOptions(
  runner.activeSimulators.map((s) => s.id),
  runner.baselineSimulatorId,
);
runner.initContexts();

function handleCopy() {
  const markdown = runner.getResultsMarkdown();
  navigator.clipboard
    .writeText(markdown)
    .then(() => {
      handleCopyFeedback(true);
    })
    .catch(() => {
      handleCopyFeedback(false);
    });
}

setupUIListeners({
  onEntityCountChange: (val) => {
    runner.numEntities = val;
    runner.resetBenchmark();
  },
  onBehaviorChange: (val) => {
    runner.movementBehavior = val;
    runner.resetBenchmark();
  },
  onSpeedChange: (val) => {
    runner.speedMultiplier = val;
  },
  onLengthChange: (val) => {
    runner.benchmarkLength = val;
    runner.resetBenchmark();
  },
  onRun: () => runner.startBenchmark(),
  onPause: () => runner.togglePause(),
  onReset: () => {
    runner.resetBenchmark();
    updateUI(
      runner.numEntities,
      runner.speedMultiplier,
      runner.benchmarkLength,
    );
  },
  onCopy: handleCopy,
  onToggleSimulator: (id, active) => {
    const sim = runner.simulators.find((s) => s.id === id)!;
    if (active) {
      if (!runner.activeSimulators.includes(sim)) {
        runner.activeSimulators.push(sim);
      }
    } else {
      runner.activeSimulators = runner.activeSimulators.filter(
        (s) => s !== sim,
      );
    }
    runner.activeSimulators.sort(
      (a, b) => runner.simulators.indexOf(a) - runner.simulators.indexOf(b),
    );

    const activeIds = runner.activeSimulators.map((s) => s.id);
    try {
      localStorage.setItem(
        'ecs-benchmark-active-simulators',
        JSON.stringify(activeIds),
      );
    } catch (e) {}

    // Handle baseline change if current baseline was deactivated
    if (!activeIds.includes(runner.baselineSimulatorId)) {
      if (activeIds.length > 0) {
        runner.baselineSimulatorId = activeIds[0];
      } else {
        runner.baselineSimulatorId = '';
      }
    }
    updateBaselineOptions(activeIds, runner.baselineSimulatorId);

    runner.resetBenchmark();
  },
  onToggleMultipleSimulators: (updates) => {
    updates.forEach(({ id, active }) => {
      const sim = runner.simulators.find((s) => s.id === id)!;
      if (active) {
        if (!runner.activeSimulators.includes(sim)) {
          runner.activeSimulators.push(sim);
        }
      } else {
        runner.activeSimulators = runner.activeSimulators.filter(
          (s) => s !== sim,
        );
      }
    });
    runner.activeSimulators.sort(
      (a, b) => runner.simulators.indexOf(a) - runner.simulators.indexOf(b),
    );

    const activeIds = runner.activeSimulators.map((s) => s.id);
    try {
      localStorage.setItem(
        'ecs-benchmark-active-simulators',
        JSON.stringify(activeIds),
      );
    } catch (e) {}

    // Handle baseline change if current baseline was deactivated
    if (!activeIds.includes(runner.baselineSimulatorId)) {
      if (activeIds.length > 0) {
        runner.baselineSimulatorId = activeIds[0];
      } else {
        runner.baselineSimulatorId = '';
      }
    }
    updateBaselineOptions(activeIds, runner.baselineSimulatorId);

    runner.resetBenchmark();
  },
  onToggleLogScale: (active) => {
    runner.useLogScale = active;
    runner.drawChart();
  },
  onToggleZeroBaseline: (active) => {
    runner.useZeroBaseline = active;
    runner.drawChart();
  },
  onBaselineChange: (id) => {
    runner.baselineSimulatorId = id;
    runner.triggerMetricsUpdate();
  },
});

setupResizeListener(() => {
  runner.resetBenchmark();
  runner.drawChart();
});

runner.resetBenchmark();
updateUI(runner.numEntities, runner.speedMultiplier, runner.benchmarkLength);

// === SCROLL RESTORATION ===
window.addEventListener('beforeunload', () => {
  try {
    sessionStorage.setItem('ecs-benchmark-scroll-y', window.scrollY.toString());
  } catch (e) {}
});

try {
  const savedScrollY = sessionStorage.getItem('ecs-benchmark-scroll-y');
  if (savedScrollY !== null) {
    window.scrollTo(0, parseInt(savedScrollY, 10));
  }
} catch (e) {}

// Handle embed mode (hiding header, footer, etc.)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('embed')) {
  document.body.classList.add('is-embedded');
}

// Notify parent of iframe height changes for dynamic auto-resizing
const resizeObserver = new ResizeObserver(() => {
  const height =
    document.body.scrollHeight || document.documentElement.scrollHeight;
  console.log(
    '[ECS-IFRAME] Sending resize-iframe message with height:',
    height,
  );
  window.parent.postMessage(
    {
      type: 'resize-iframe',
      height: height,
    },
    '*',
  );
});
resizeObserver.observe(document.body);
