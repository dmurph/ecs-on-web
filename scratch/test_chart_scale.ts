import { getNiceMax, getLinearYRatio, getPureLogYRatio, getLogGridValues } from '../src/chart';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    process.exit(1);
  }
}

console.log("Running automated tests for chart scale calculations...");

// 1. Test getNiceMax
console.log("\nTesting getNiceMax...");
assert(getNiceMax(0.05) === 0.1, "0.05 -> 0.1");
assert(getNiceMax(0.15) === 0.2, "0.15 -> 0.2");
assert(getNiceMax(0.35) === 0.5, "0.35 -> 0.5");
assert(getNiceMax(0.8) === 1.0, "0.8 -> 1.0");
assert(getNiceMax(1.5) === 2.0, "1.5 -> 2.0");
assert(getNiceMax(4.2) === 5.0, "4.2 -> 5.0");
assert(getNiceMax(8.0) === 10.0, "8.0 -> 10.0");
assert(getNiceMax(15.0) === 20.0, "15.0 -> 20.0");
assert(getNiceMax(45.0) === 50.0, "45.0 -> 50.0");
assert(getNiceMax(75.0) === 100.0, "75.0 -> 100.0");
assert(getNiceMax(150.0) === 200.0, "150.0 -> 200.0");
assert(getNiceMax(350.0) === 500.0, "350.0 -> 500.0");
assert(getNiceMax(650.0) === 700.0, "650.0 -> 700");
console.log("✅ getNiceMax tests passed!");

// 2. Test getLinearYRatio with zero baseline
console.log("\nTesting getLinearYRatio (Zero Baseline)...");
assert(getLinearYRatio(0, 0, 10) === 0, "0/10 -> 0");
assert(getLinearYRatio(5, 0, 10) === 0.5, "5/10 -> 0.5");
assert(getLinearYRatio(10, 0, 10) === 1.0, "10/10 -> 1.0");
assert(getLinearYRatio(15, 0, 10) === 1.0, "15/10 (overflow) -> 1.0");
assert(getLinearYRatio(-5, 0, 10) === 0, "-5/10 (underflow) -> 0");
console.log("✅ getLinearYRatio (Zero Baseline) tests passed!");

// 3. Test getLinearYRatio with dynamic baseline
console.log("\nTesting getLinearYRatio (Dynamic Baseline)...");
assert(getLinearYRatio(2, 2, 10) === 0, "2 -> 0.0");
assert(getLinearYRatio(6, 2, 10) === 0.5, "6 (halfway between 2 and 10) -> 0.5");
assert(getLinearYRatio(10, 2, 10) === 1.0, "10 -> 1.0");
assert(getLinearYRatio(12, 2, 10) === 1.0, "12 (overflow) -> 1.0");
assert(getLinearYRatio(1, 2, 10) === 0, "1 (underflow) -> 0.0");
console.log("✅ getLinearYRatio (Dynamic Baseline) tests passed!");

// 4. Test getPureLogYRatio (Pure Log Scale without 0 baseline)
console.log("\nTesting getPureLogYRatio (Pure Log)...");
const minY = 0.0001;
const chartMax = 0.1;
assert(getPureLogYRatio(0.0001, minY, chartMax) === 0.0, "minY (0.0001) -> 0.0");
assert(Math.abs(getPureLogYRatio(0.001, minY, chartMax) - 1/3) < 1e-9, "0.001 -> 0.333");
assert(Math.abs(getPureLogYRatio(0.01, minY, chartMax) - 2/3) < 1e-9, "0.01 -> 0.666");
assert(getPureLogYRatio(0.1, minY, chartMax) === 1.0, "chartMax (0.1) -> 1.0");
assert(getPureLogYRatio(0.00005, minY, chartMax) === 0.0, "0.00005 (below minY) -> 0.0");
assert(getPureLogYRatio(0.5, minY, chartMax) === 1.0, "0.5 (above chartMax) -> 1.0");
console.log("✅ getPureLogYRatio (Pure Log) tests passed!");

// 5. Test getLogGridValues
console.log("\nTesting getLogGridValues...");

// Narrow range: wasm benchmark 1ms to 1.5ms case (chart bounds 0.95 to 1.55)
const gridNarrow = getLogGridValues(0.95, 1.55);
console.log("Grid (0.95 to 1.55):", gridNarrow);
assert(gridNarrow.length === 6, "Should have 6 ticks");
assert(gridNarrow[0] === 1.0, "1.0");
assert(gridNarrow[1] === 1.1, "1.1");
assert(gridNarrow[5] === 1.5, "1.5");

// Narrow range: 1.1ms to 2.1ms case (chart bounds 1.0 to 2.2)
const gridNarrow2 = getLogGridValues(1.0, 2.2);
console.log("Grid (1.0 to 2.2):", gridNarrow2);
assert(gridNarrow2.length === 13, "Should have 13 ticks");
assert(gridNarrow2[0] === 1.0, "1.0");
assert(gridNarrow2[1] === 1.1, "1.1");
assert(gridNarrow2[12] === 2.2, "2.2");

// Very narrow range: 0.95ms to 1.05ms (chart bounds 0.94 to 1.06)
const gridVeryNarrow = getLogGridValues(0.94, 1.06);
console.log("Grid (0.94 to 1.06):", gridVeryNarrow);
assert(gridVeryNarrow.length === 13, "Should have 13 ticks");
assert(gridVeryNarrow[0] === 0.94, "0.94");
assert(gridVeryNarrow[6] === 1.0, "1.0");
assert(gridVeryNarrow[12] === 1.06, "1.06");

// Wide range: 0.01 to 1.0 (range ratio = 100)
const gridWide1 = getLogGridValues(0.01, 1.0);
console.log("Grid (0.01 to 1.0):", gridWide1);
assert(gridWide1.length === 19, "Should have 19 lines");
assert(gridWide1[0] === 0.01, "0.01");
assert(gridWide1[9] === 0.1, "0.1");
assert(gridWide1[18] === 1.0, "1.0");

// Wide range: 0.005 to 5.0 (range ratio = 1000)
const gridWide2 = getLogGridValues(0.005, 5.0);
console.log("Grid (0.005 to 5.0):", gridWide2);
assert(gridWide2.length === 28, "Should have 28 lines");
assert(gridWide2[0] === 0.005, "0.005");
assert(gridWide2[27] === 5.0, "5.0");

console.log("✅ getLogGridValues tests passed!");

console.log("\n🎉 All automated tests for scale math passed successfully!");
