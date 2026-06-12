import { SIMULATOR_REGISTRY } from './registry';

const labelYPositions: Record<string, number> = {};

let currentChartMaxLog = -1;
let currentChartMinLog = -1;
let currentChartMaxLin = -1;
let currentChartMinLin = -1;

export function resetChartLabels() {
  Object.keys(labelYPositions).forEach(key => {
    labelYPositions[key] = -1;
  });
  currentChartMaxLog = -1;
  currentChartMinLog = -1;
  currentChartMaxLin = -1;
  currentChartMinLin = -1;
}

// Helper to round maxTime to a clean, readable number
export function getNiceMax(val: number): number {
  if (val <= 0.1) return 0.1;
  if (val <= 0.2) return 0.2;
  if (val <= 0.5) return 0.5;
  if (val <= 1.0) return 1.0;
  if (val <= 2.0) return 2.0;
  if (val <= 5.0) return 5.0;
  if (val <= 10.0) return 10.0;
  if (val <= 20.0) return 20.0;
  if (val <= 50.0) return 50.0;
  if (val <= 100.0) return 100.0;
  if (val <= 200.0) return 200.0;
  if (val <= 500.0) return 500.0;
  return Math.ceil(val / 100) * 100;
}

// Symmetric-Log style ratio calculation: Y coordinate 0 is mapped to 0, 
// Y coordinate up to 25% is mapped linearly [0, minY],
// Y coordinate from 25% to 100% is mapped logarithmically [minY, chartMax].
export function getLogYRatio(val: number, minY: number, chartMax: number): number {
  if (val <= 0) return 0;
  const rBase = 0.25;
  if (val < minY) {
    return rBase * (val / minY);
  } else {
    const logMin = Math.log10(minY);
    const logMax = Math.log10(chartMax);
    const logVal = Math.log10(val);
    const logRatio = (logVal - logMin) / (logMax - logMin);
    return rBase + (1.0 - rBase) * Math.min(1.0, logRatio);
  }
}

// Pure Log scale ratio calculation (clamped to [0, 1.0])
export function getPureLogYRatio(val: number, minY: number, chartMax: number): number {
  if (val <= minY) return 0;
  if (val >= chartMax) return 1.0;
  const logMin = Math.log10(minY);
  const logMax = Math.log10(chartMax);
  const logVal = Math.log10(val);
  return (logVal - logMin) / (logMax - logMin);
}

// Linear scale ratio calculation (clamped to [0, 1.0])
export function getLinearYRatio(val: number, minY: number, chartMax: number): number {
  if (chartMax <= minY) return 0;
  return Math.min(1.0, Math.max(0, (val - minY) / (chartMax - minY)));
}

// === HIGH-PERFORMANCE CUSTOM SVG CHART DRAWING ===
export function drawChartSVG(
  containerId: string,
  simulatorTimes: Record<string, number[]>,
  benchmarkLength: number,
  useLogScale: boolean = true,
  useZeroBaseline: boolean = true
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const formatTimeLabel = (val: number): string => {
    if (val === 0) return "0 ms";
    if (val < 0.001) return `${val.toFixed(4)} ms`;
    if (val < 0.1) return `${val.toFixed(3)} ms`;
    if (val < 1.0) return `${val.toFixed(2)} ms`;
    if (val < 10.0) return `${val.toFixed(1)} ms`;
    return `${val.toFixed(0)} ms`;
  };
  
  const svgW = container.clientWidth || 600;
  const svgH = 250;

  const paddingLeft = 55;
  const paddingRight = 80;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartW = svgW - paddingLeft - paddingRight;
  const chartH = svgH - paddingTop - paddingBottom;

  // Determine scale (y-axis bounds)
  let minTime = Infinity;
  let maxTime = 0.0;

  const updateMinMax = (times: number[]) => {
    if (!times) return;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      if (t > 0) {
        if (t > maxTime) maxTime = t;
        if (t < minTime) minTime = t;
      }
    }
  };

  Object.values(simulatorTimes).forEach(times => {
    updateMinMax(times);
  });

  let getYPos: (val: number) => number;
  const gridValues: number[] = [];
  let chartMax = 0.1;
  let minY = 0.0;

  if (minTime !== Infinity && maxTime > 0) {
    if (useLogScale) {
      if (useZeroBaseline) {
        // Symlog bounds
        const targetMax = getNiceLogMax(maxTime);
        
        if (currentChartMaxLog === -1) {
          currentChartMaxLog = targetMax;
        } else if (targetMax > currentChartMaxLog) {
          currentChartMaxLog = targetMax;
        }
        chartMax = currentChartMaxLog;
        minY = chartMax / 1000;
        
        getYPos = (val: number): number => {
          const ratio = getLogYRatio(val, minY, chartMax);
          return svgH - paddingBottom - (ratio * chartH);
        };

        gridValues.push(0);
        gridValues.push(...getLogGridValues(minY, chartMax));
      } else {
        // Pure Log bounds (dynamic min and max)
        const targetMax = getNiceLogMax(maxTime);
        const targetMin = getNiceLogMin(minTime);

        if (currentChartMaxLog === -1 || currentChartMinLog === -1) {
          currentChartMaxLog = targetMax;
          currentChartMinLog = targetMin;
        } else {
          if (targetMax > currentChartMaxLog) {
            currentChartMaxLog = targetMax;
          }
          if (targetMin < currentChartMinLog) {
            currentChartMinLog = targetMin;
          }
        }
        
        chartMax = currentChartMaxLog;
        minY = currentChartMinLog;
        
        getYPos = (val: number): number => {
          const ratio = getPureLogYRatio(val, minY, chartMax);
          return svgH - paddingBottom - (ratio * chartH);
        };

        gridValues.push(...getLogGridValues(minY, chartMax));
      }
    } else {
      // Linear scale bounds
      if (useZeroBaseline) {
        minY = 0.0;
        const targetMax = maxTime * 1.1; // 10% margin
        if (currentChartMaxLin === -1) {
          currentChartMaxLin = getNiceMax(targetMax);
        } else if (targetMax > currentChartMaxLin) {
          currentChartMaxLin = getNiceMax(targetMax);
        }
        chartMax = currentChartMaxLin;
      } else {
        // Dynamic baseline (10% margins)
        const targetMin = Math.max(0, minTime * 0.9);
        const targetMax = maxTime * 1.1;
        if (currentChartMaxLin === -1 || currentChartMinLin === -1) {
          currentChartMinLin = targetMin;
          currentChartMaxLin = targetMax;
        } else {
          if (targetMin < currentChartMinLin) {
            currentChartMinLin = targetMin;
          }
          if (targetMax > currentChartMaxLin) {
            currentChartMaxLin = targetMax;
          }
        }
        minY = currentChartMinLin;
        chartMax = currentChartMaxLin;
      }

      getYPos = (val: number): number => {
        const ratio = getLinearYRatio(val, minY, chartMax);
        return svgH - paddingBottom - (ratio * chartH);
      };

      // 5 linear grid lines between minY and chartMax
      const numDivisions = 4;
      for (let i = 0; i <= numDivisions; i++) {
        gridValues.push(minY + ((chartMax - minY) * i) / numDivisions);
      }
    }
  } else {
    // Default placeholder bounds (No data yet)
    chartMax = 0.1;
    minY = useLogScale ? 0.0001 : 0.0;
    
    getYPos = (val: number): number => {
      const ratio = useLogScale 
        ? (useZeroBaseline ? getLogYRatio(val, minY, chartMax) : getPureLogYRatio(val, minY, chartMax))
        : getLinearYRatio(val, minY, chartMax);
      return svgH - paddingBottom - (ratio * chartH);
    };

    if (useLogScale) {
      if (useZeroBaseline) {
        gridValues.push(0);
      }
      gridValues.push(...getLogGridValues(minY, chartMax));
    } else {
      const numDivisions = 4;
      for (let i = 0; i <= numDivisions; i++) {
        gridValues.push(minY + ((chartMax - minY) * i) / numDivisions);
      }
    }
  }

  // Path generator function (Downsamples if too many values to render smoothly)
  const buildPathD = (times: number[]) => {
    if (times.length === 0) return "";
    let d = "";
    
    // Downsample path drawing points if times is extremely long to prevent DOM overload
    const step = Math.max(1, Math.floor(times.length / 500)); 
    
    for (let i = 0; i < times.length; i += step) {
      const ratioX = benchmarkLength > 1 ? Math.min(1.0, i / (benchmarkLength - 1)) : 0;
      const xPos = paddingLeft + (ratioX * chartW);
      const yPos = getYPos(times[i]);

      if (i === 0) {
        d += `M ${xPos} ${yPos}`;
      } else {
        d += ` L ${xPos} ${yPos}`;
      }
    }
    return d;
  };

  // Check if SVG already exists in DOM
  let svg = container.querySelector('svg') as SVGSVGElement | null;
  const scaleKey = `${svgW}_${chartMax}_${gridValues.join(',')}_${useLogScale ? 'log' : 'lin'}`;

  // If SVG doesn't exist or client dimensions / scale parameters changed, recreate it
  if (!svg || svg.getAttribute('data-scale') !== scaleKey) {
    container.replaceChildren();

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("data-scale", scaleKey);

    // Draw grid lines and labels
    for (const yVal of gridValues) {
      const yPos = getYPos(yVal);
      const isPowerOf10 = yVal === 0 || Math.abs(Math.log10(yVal) - Math.round(Math.log10(yVal))) < 1e-9;
      const isMajor = useLogScale && isPowerOf10;

      // Line
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", paddingLeft.toString());
      line.setAttribute("y1", yPos.toString());
      line.setAttribute("x2", (svgW - paddingRight).toString());
      line.setAttribute("y2", yPos.toString());
      if (isMajor) {
        line.setAttribute("stroke", "var(--color-text-dim)");
        line.setAttribute("stroke-width", "1.2");
        line.setAttribute("class", "grid-line grid-line-major");
      } else {
        line.setAttribute("stroke", "var(--border-color)");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("class", "grid-line");
      }
      svg.appendChild(line);

      // Label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", (paddingLeft - 8).toString());
      text.setAttribute("y", (yPos + 4).toString());
      text.setAttribute("text-anchor", "end");
      if (isMajor) {
        text.setAttribute("fill", "var(--color-text-secondary)");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("class", "chart-label chart-label-major");
      } else {
        text.setAttribute("fill", "var(--color-text-dim)");
        text.setAttribute("class", "chart-label");
      }
      text.setAttribute("font-size", "10px");
      text.setAttribute("font-family", "JetBrains Mono, monospace");
      text.textContent = formatTimeLabel(yVal);
      svg.appendChild(text);
    }

    // Draw X-axis frame markers
    const numXTicks = 4;
    for (let i = 0; i <= numXTicks; i++) {
      const ratio = i / numXTicks;
      const frameIdx = Math.round(benchmarkLength * ratio);
      const xPos = paddingLeft + (ratio * chartW);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", xPos.toString());
      text.setAttribute("y", (svgH - 10).toString());
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "var(--color-text-dim)");
      text.setAttribute("font-size", "10px");
      text.setAttribute("font-family", "JetBrains Mono, monospace");
      text.setAttribute("class", "chart-label");
      text.textContent = `F${frameIdx}`;
      svg.appendChild(text);
    }

    // Axes base lines
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", paddingLeft.toString());
    xAxis.setAttribute("y1", (svgH - paddingBottom).toString());
    xAxis.setAttribute("x2", (svgW - paddingRight).toString());
    xAxis.setAttribute("y2", (svgH - paddingBottom).toString());
    xAxis.setAttribute("stroke", "var(--color-text-dim)");
    xAxis.setAttribute("stroke-width", "1");
    xAxis.setAttribute("class", "chart-axis");
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("x1", paddingLeft.toString());
    yAxis.setAttribute("y1", paddingTop.toString());
    yAxis.setAttribute("x2", paddingLeft.toString());
    yAxis.setAttribute("y2", (svgH - paddingBottom).toString());
    yAxis.setAttribute("stroke", "var(--color-text-dim)");
    yAxis.setAttribute("stroke-width", "1");
    yAxis.setAttribute("class", "chart-axis");
    svg.appendChild(yAxis);

    const activeSvg = svg;
    // Dynamic paths and labels creation from registry
    SIMULATOR_REGISTRY.forEach(sim => {
      // Path
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", sim.color);
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("class", `line-${sim.id}`);
      activeSvg.appendChild(path);

      // Label text
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("fill", sim.color);
      text.setAttribute("font-size", "10px");
      text.setAttribute("font-family", "JetBrains Mono, monospace");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("class", `label-${sim.id}`);
      text.textContent = sim.name;
      activeSvg.appendChild(text);
    });

    container.appendChild(svg);
  }

  const currentSvg = svg!;
  // Retrieve paths and update their "d" attributes to avoid DOM recreation churn
  SIMULATOR_REGISTRY.forEach(sim => {
    const path = currentSvg.querySelector(`.line-${sim.id}`) as SVGPathElement;
    if (path) {
      const times = simulatorTimes[sim.id] || [];
      path.setAttribute("d", buildPathD(times));
    }
  });

  // 1. Gather active labels and compute target & smoothed Y positions
  const activeLabels = SIMULATOR_REGISTRY
    .map(sim => {
      const times = simulatorTimes[sim.id] || [];
      if (times.length === 0) return null;
      const targetY = getYPos(times[times.length - 1]) + 3;
      const currentY = labelYPositions[sim.id] ?? targetY;
      labelYPositions[sim.id] = currentY * 0.95 + targetY * 0.05;
      return { id: sim.id, targetY, currentY: labelYPositions[sim.id] };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  // 2. Sort current Y positions matching target Y order to prevent crossing
  activeLabels.sort((a, b) => a.targetY - b.targetY);
  const sortedY = activeLabels.map(l => l.currentY).sort((a, b) => a - b);
  activeLabels.forEach((l, i) => l.currentY = sortedY[i]);

  // 3. Relax overlaps (min 10px spacing)
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < activeLabels.length - 1; i++) {
      const overlap = 10 - (activeLabels[i + 1].currentY - activeLabels[i].currentY);
      if (overlap > 0) {
        activeLabels[i].currentY -= overlap * 0.15;
        activeLabels[i + 1].currentY += overlap * 0.15;
      }
    }
  }

  // 4. Update SVG element positions and visibility
  SIMULATOR_REGISTRY.forEach(sim => {
    const label = currentSvg.querySelector(`.label-${sim.id}`) as SVGTextElement;
    if (!label) return;

    const item = activeLabels.find(l => l.id === sim.id);
    if (item) {
      const times = simulatorTimes[sim.id] || [];
      const ratioX = benchmarkLength > 1 ? (times.length - 1) / (benchmarkLength - 1) : 0;
      const xPos = paddingLeft + (ratioX * chartW) + 5;
      const clampedY = Math.max(paddingTop, Math.min(svgH - paddingBottom, item.currentY));

      labelYPositions[sim.id] = clampedY;
      label.setAttribute("x", xPos.toString());
      label.setAttribute("y", clampedY.toString());
      label.style.display = "block";
    } else {
      labelYPositions[sim.id] = -1;
      label.style.display = "none";
    }
  });
}

// Helper to get nice max/min for log scale (1-2.5-5-7.5 sequence)
export function getNiceLogMax(val: number): number {
  if (val <= 0) return 0.1;
  const exponent = Math.floor(Math.log10(val));
  const base = Math.pow(10, exponent);
  const ratio = val / base;
  
  if (ratio <= 1.0) return base;
  if (ratio <= 2.5) return base * 2.5;
  if (ratio <= 5.0) return base * 5;
  if (ratio <= 7.5) return base * 7.5;
  return base * 10;
}

export function getNiceLogMin(val: number): number {
  if (val <= 0) return 0.0001;
  const exponent = Math.floor(Math.log10(val));
  const base = Math.pow(10, exponent);
  const ratio = val / base;
  
  if (ratio >= 7.5) return base * 7.5;
  if (ratio >= 5.0) return base * 5;
  if (ratio >= 2.5) return base * 2.5;
  return base;
}

export function getLogGridValues(minY: number, chartMax: number): number[] {
  const values: number[] = [];
  const startDecade = Math.floor(Math.log10(minY));
  const endDecade = Math.ceil(Math.log10(chartMax));
  
  for (let d = startDecade; d <= endDecade; d++) {
    const base = Math.pow(10, d);
    for (const mult of [1, 2.5, 5, 7.5]) {
      const val = base * mult;
      if (val >= minY * 0.999 && val <= chartMax * 1.001) {
        if (values.length === 0 || values[values.length - 1] < val * 0.999) {
          values.push(val);
        }
      }
    }
  }
  return values;
}
