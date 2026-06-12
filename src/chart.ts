let labelY_oop = -1;
let labelY_oop_tree = -1;
let labelY_ecs = -1;
let labelY_ecs_tree = -1;
let labelY_bitecs = -1;
let labelY_wasm = -1;

let currentChartMaxLog = -1;
let currentChartMinLog = -1;
let currentChartMaxLin = -1;
let currentChartMinLin = -1;

export function resetChartLabels() {
  labelY_oop = -1;
  labelY_oop_tree = -1;
  labelY_ecs = -1;
  labelY_ecs_tree = -1;
  labelY_bitecs = -1;
  labelY_wasm = -1;
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
  oopTimes: number[],
  oopTreeTimes: number[],
  ecsTimes: number[],
  ecsTreeTimes: number[],
  bitecsTimes: number[],
  wasmTimes: number[],
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
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      if (t > 0) {
        if (t > maxTime) maxTime = t;
        if (t < minTime) minTime = t;
      }
    }
  };

  updateMinMax(oopTimes);
  updateMinMax(oopTreeTimes);
  updateMinMax(ecsTimes);
  updateMinMax(ecsTreeTimes);
  updateMinMax(bitecsTimes);
  updateMinMax(wasmTimes);

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

    // OOP path
    const oopPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    oopPath.setAttribute("fill", "none");
    oopPath.setAttribute("stroke", "var(--color-oop)");
    oopPath.setAttribute("stroke-width", "2.5");
    oopPath.setAttribute("stroke-linecap", "round");
    oopPath.setAttribute("stroke-linejoin", "round");
    oopPath.setAttribute("class", "line-oop");
    svg.appendChild(oopPath);

    // OOP Tree path
    const oopTreePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    oopTreePath.setAttribute("fill", "none");
    oopTreePath.setAttribute("stroke", "var(--color-oop-tree)");
    oopTreePath.setAttribute("stroke-width", "2.5");
    oopTreePath.setAttribute("stroke-linecap", "round");
    oopTreePath.setAttribute("stroke-linejoin", "round");
    oopTreePath.setAttribute("class", "line-oop-tree");
    svg.appendChild(oopTreePath);

    // ECS path
    const ecsPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    ecsPath.setAttribute("fill", "none");
    ecsPath.setAttribute("stroke", "var(--color-ecs)");
    ecsPath.setAttribute("stroke-width", "2.5");
    ecsPath.setAttribute("stroke-linecap", "round");
    ecsPath.setAttribute("stroke-linejoin", "round");
    ecsPath.setAttribute("class", "line-ecs");
    svg.appendChild(ecsPath);

    // ECS Tree path
    const ecsTreePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    ecsTreePath.setAttribute("fill", "none");
    ecsTreePath.setAttribute("stroke", "var(--color-ecs-tree)");
    ecsTreePath.setAttribute("stroke-width", "2.5");
    ecsTreePath.setAttribute("stroke-linecap", "round");
    ecsTreePath.setAttribute("stroke-linejoin", "round");
    ecsTreePath.setAttribute("class", "line-ecs-tree");
    svg.appendChild(ecsTreePath);

    // bitECS path
    const bitecsPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    bitecsPath.setAttribute("fill", "none");
    bitecsPath.setAttribute("stroke", "var(--color-bitecs)");
    bitecsPath.setAttribute("stroke-width", "2.5");
    bitecsPath.setAttribute("stroke-linecap", "round");
    bitecsPath.setAttribute("stroke-linejoin", "round");
    bitecsPath.setAttribute("class", "line-bitecs");
    svg.appendChild(bitecsPath);

    // WASM path
    const wasmPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    wasmPath.setAttribute("fill", "none");
    wasmPath.setAttribute("stroke", "var(--color-wasm)");
    wasmPath.setAttribute("stroke-width", "2.5");
    wasmPath.setAttribute("stroke-linecap", "round");
    wasmPath.setAttribute("stroke-linejoin", "round");
    wasmPath.setAttribute("class", "line-wasm");
    svg.appendChild(wasmPath);

    // OOP label
    const oopText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    oopText.setAttribute("fill", "var(--color-oop)");
    oopText.setAttribute("font-size", "10px");
    oopText.setAttribute("font-family", "JetBrains Mono, monospace");
    oopText.setAttribute("font-weight", "bold");
    oopText.setAttribute("class", "label-oop");
    oopText.textContent = "OOP S&P";
    svg.appendChild(oopText);

    // OOP Tree label
    const oopTreeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    oopTreeText.setAttribute("fill", "var(--color-oop-tree)");
    oopTreeText.setAttribute("font-size", "10px");
    oopTreeText.setAttribute("font-family", "JetBrains Mono, monospace");
    oopTreeText.setAttribute("font-weight", "bold");
    oopTreeText.setAttribute("class", "label-oop-tree");
    oopTreeText.textContent = "OOP Tree";
    svg.appendChild(oopTreeText);

    // ECS label
    const ecsText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    ecsText.setAttribute("fill", "var(--color-ecs)");
    ecsText.setAttribute("font-size", "10px");
    ecsText.setAttribute("font-family", "JetBrains Mono, monospace");
    ecsText.setAttribute("font-weight", "bold");
    ecsText.setAttribute("class", "label-ecs");
    ecsText.textContent = "ECS Custom S&P";
    svg.appendChild(ecsText);

    // ECS Tree label
    const ecsTreeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    ecsTreeText.setAttribute("fill", "var(--color-ecs-tree)");
    ecsTreeText.setAttribute("font-size", "10px");
    ecsTreeText.setAttribute("font-family", "JetBrains Mono, monospace");
    ecsTreeText.setAttribute("font-weight", "bold");
    ecsTreeText.setAttribute("class", "label-ecs-tree");
    ecsTreeText.textContent = "ECS Custom Tree";
    svg.appendChild(ecsTreeText);

    // bitECS label
    const bitecsText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    bitecsText.setAttribute("fill", "var(--color-bitecs)");
    bitecsText.setAttribute("font-size", "10px");
    bitecsText.setAttribute("font-family", "JetBrains Mono, monospace");
    bitecsText.setAttribute("font-weight", "bold");
    bitecsText.setAttribute("class", "label-bitecs");
    bitecsText.textContent = "bitECS S&P";
    svg.appendChild(bitecsText);

    // WASM label
    const wasmText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    wasmText.setAttribute("fill", "var(--color-wasm)");
    wasmText.setAttribute("font-size", "10px");
    wasmText.setAttribute("font-family", "JetBrains Mono, monospace");
    wasmText.setAttribute("font-weight", "bold");
    wasmText.setAttribute("class", "label-wasm");
    wasmText.textContent = "WASM ECS S&P";
    svg.appendChild(wasmText);

    container.appendChild(svg);
  }

  // Retrieve paths and update their "d" attributes to avoid DOM recreation churn
  const lineOOP = svg.querySelector('.line-oop') as SVGPathElement;
  const lineOOPTree = svg.querySelector('.line-oop-tree') as SVGPathElement;
  const lineECS = svg.querySelector('.line-ecs') as SVGPathElement;
  const lineECSTree = svg.querySelector('.line-ecs-tree') as SVGPathElement;
  const lineBitecs = svg.querySelector('.line-bitecs') as SVGPathElement;
  const lineWasm = svg.querySelector('.line-wasm') as SVGPathElement;

  if (lineOOP) {
    lineOOP.setAttribute("d", buildPathD(oopTimes));
  }
  if (lineOOPTree) {
    lineOOPTree.setAttribute("d", buildPathD(oopTreeTimes));
  }
  if (lineECS) {
    lineECS.setAttribute("d", buildPathD(ecsTimes));
  }
  if (lineECSTree) {
    lineECSTree.setAttribute("d", buildPathD(ecsTreeTimes));
  }
  if (lineBitecs) {
    lineBitecs.setAttribute("d", buildPathD(bitecsTimes));
  }
  if (lineWasm) {
    lineWasm.setAttribute("d", buildPathD(wasmTimes));
  }

  // Retrieve text labels and update their positions dynamically
  const labelOOP = svg.querySelector('.label-oop') as SVGTextElement;
  const labelOOPTree = svg.querySelector('.label-oop-tree') as SVGTextElement;
  const labelECS = svg.querySelector('.label-ecs') as SVGTextElement;
  const labelECSTree = svg.querySelector('.label-ecs-tree') as SVGTextElement;
  const labelBitecs = svg.querySelector('.label-bitecs') as SVGTextElement;
  const labelWasm = svg.querySelector('.label-wasm') as SVGTextElement;

  if (oopTimes.length > 0) {
    const lastIdx = oopTimes.length - 1;
    const ratioX = benchmarkLength > 1 ? lastIdx / (benchmarkLength - 1) : 0;
    const xPos = paddingLeft + (ratioX * chartW) + 5;
    const targetY = getYPos(oopTimes[lastIdx]) + 3;
    if (labelY_oop === -1) {
      labelY_oop = targetY;
    } else {
      labelY_oop = labelY_oop * 0.95 + targetY * 0.05;
    }
    if (labelOOP) {
      labelOOP.setAttribute("x", xPos.toString());
      labelOOP.setAttribute("y", labelY_oop.toString());
      labelOOP.style.display = "block";
    }
  } else {
    labelY_oop = -1;
    if (labelOOP) {
      labelOOP.style.display = "none";
    }
  }

  if (oopTreeTimes.length > 0) {
    const lastIdx = oopTreeTimes.length - 1;
    const ratioX = benchmarkLength > 1 ? lastIdx / (benchmarkLength - 1) : 0;
    const xPos = paddingLeft + (ratioX * chartW) + 5;
    const targetY = getYPos(oopTreeTimes[lastIdx]) + 3;
    if (labelY_oop_tree === -1) {
      labelY_oop_tree = targetY;
    } else {
      labelY_oop_tree = labelY_oop_tree * 0.95 + targetY * 0.05;
    }
    if (labelOOPTree) {
      labelOOPTree.setAttribute("x", xPos.toString());
      labelOOPTree.setAttribute("y", labelY_oop_tree.toString());
      labelOOPTree.style.display = "block";
    }
  } else {
    labelY_oop_tree = -1;
    if (labelOOPTree) {
      labelOOPTree.style.display = "none";
    }
  }

  if (ecsTimes.length > 0) {
    const lastIdx = ecsTimes.length - 1;
    const ratioX = benchmarkLength > 1 ? lastIdx / (benchmarkLength - 1) : 0;
    const xPos = paddingLeft + (ratioX * chartW) + 5;
    const targetY = getYPos(ecsTimes[lastIdx]) + 3;
    if (labelY_ecs === -1) {
      labelY_ecs = targetY;
    } else {
      labelY_ecs = labelY_ecs * 0.95 + targetY * 0.05;
    }
    if (labelECS) {
      labelECS.setAttribute("x", xPos.toString());
      labelECS.setAttribute("y", labelY_ecs.toString());
      labelECS.style.display = "block";
    }
  } else {
    labelY_ecs = -1;
    if (labelECS) {
      labelECS.style.display = "none";
    }
  }

  if (ecsTreeTimes.length > 0) {
    const lastIdx = ecsTreeTimes.length - 1;
    const ratioX = benchmarkLength > 1 ? lastIdx / (benchmarkLength - 1) : 0;
    const xPos = paddingLeft + (ratioX * chartW) + 5;
    const targetY = getYPos(ecsTreeTimes[lastIdx]) + 3;
    if (labelY_ecs_tree === -1) {
      labelY_ecs_tree = targetY;
    } else {
      labelY_ecs_tree = labelY_ecs_tree * 0.95 + targetY * 0.05;
    }
    if (labelECSTree) {
      labelECSTree.setAttribute("x", xPos.toString());
      labelECSTree.setAttribute("y", labelY_ecs_tree.toString());
      labelECSTree.style.display = "block";
    }
  } else {
    labelY_ecs_tree = -1;
    if (labelECSTree) {
      labelECSTree.style.display = "none";
    }
  }

  if (bitecsTimes.length > 0) {
    const lastIdx = bitecsTimes.length - 1;
    const ratioX = benchmarkLength > 1 ? lastIdx / (benchmarkLength - 1) : 0;
    const xPos = paddingLeft + (ratioX * chartW) + 5;
    const targetY = getYPos(bitecsTimes[lastIdx]) + 3;
    if (labelY_bitecs === -1) {
      labelY_bitecs = targetY;
    } else {
      labelY_bitecs = labelY_bitecs * 0.95 + targetY * 0.05;
    }
    if (labelBitecs) {
      labelBitecs.setAttribute("x", xPos.toString());
      labelBitecs.setAttribute("y", labelY_bitecs.toString());
      labelBitecs.style.display = "block";
    }
  } else {
    labelY_bitecs = -1;
    if (labelBitecs) {
      labelBitecs.style.display = "none";
    }
  }

  if (wasmTimes.length > 0) {
    const lastIdx = wasmTimes.length - 1;
    const ratioX = benchmarkLength > 1 ? lastIdx / (benchmarkLength - 1) : 0;
    const xPos = paddingLeft + (ratioX * chartW) + 5;
    const targetY = getYPos(wasmTimes[lastIdx]) + 3;
    if (labelY_wasm === -1) {
      labelY_wasm = targetY;
    } else {
      labelY_wasm = labelY_wasm * 0.95 + targetY * 0.05;
    }
    if (labelWasm) {
      labelWasm.setAttribute("x", xPos.toString());
      labelWasm.setAttribute("y", labelY_wasm.toString());
      labelWasm.style.display = "block";
    }
  } else {
    labelY_wasm = -1;
    if (labelWasm) {
      labelWasm.style.display = "none";
    }
  }
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
