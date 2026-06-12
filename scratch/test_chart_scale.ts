import { getNiceMax, getLogYRatio, getPureLogYRatio, getLinearYRatio, getNiceLogMax, getNiceLogMin, getLogGridValues } from '../src/chart';


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

// 4. Test getLogYRatio (Symmetric Log Scale with 0 baseline)
console.log("\nTesting getLogYRatio (Symmetric Log)...");
const minY = 0.0001; // lowest decade
const chartMax = 0.1; // top decade

// Case A: 0
assert(getLogYRatio(0, minY, chartMax) === 0, "0 -> 0.0");

// Case B: Exactly at minY
assert(Math.abs(getLogYRatio(minY, minY, chartMax) - 0.25) < 1e-9, "minY (0.0001) -> 0.25");

// Case C: Linear spacing below minY
assert(Math.abs(getLogYRatio(minY / 2, minY, chartMax) - 0.125) < 1e-9, "minY/2 (0.00005) -> 0.125");

// Case D: Decade steps above minY (must be equally spaced at 0.25, 0.50, 0.75, 1.0)
const ratioDecade1 = getLogYRatio(0.0001, minY, chartMax); // 10^-4
const ratioDecade2 = getLogYRatio(0.001, minY, chartMax);  // 10^-3
const ratioDecade3 = getLogYRatio(0.01, minY, chartMax);   // 10^-2
const ratioDecade4 = getLogYRatio(0.1, minY, chartMax);    // 10^-1

assert(Math.abs(ratioDecade1 - 0.25) < 1e-9, "10^-4 -> 0.25");
assert(Math.abs(ratioDecade2 - 0.50) < 1e-9, "10^-3 -> 0.50");
assert(Math.abs(ratioDecade3 - 0.75) < 1e-9, "10^-2 -> 0.75");
assert(Math.abs(ratioDecade4 - 1.00) < 1e-9, "10^-1 -> 1.00");

// Verify equal interval sizing
assert(Math.abs((ratioDecade2 - ratioDecade1) - 0.25) < 1e-9, "Interval 1 spacing is 0.25");
assert(Math.abs((ratioDecade3 - ratioDecade2) - 0.25) < 1e-9, "Interval 2 spacing is 0.25");
assert(Math.abs((ratioDecade4 - ratioDecade3) - 0.25) < 1e-9, "Interval 3 spacing is 0.25");

// Case E: Overflow clamps to 1.0
assert(getLogYRatio(0.5, minY, chartMax) === 1.0, "0.5 (above chartMax 0.1) -> 1.0");
console.log("✅ getLogYRatio (Symmetric Log) tests passed!");

// 5. Test getPureLogYRatio (Pure Log Scale without 0 baseline)
console.log("\nTesting getPureLogYRatio (Pure Log)...");
assert(getPureLogYRatio(0.0001, minY, chartMax) === 0.0, "minY (0.0001) -> 0.0");
assert(Math.abs(getPureLogYRatio(0.001, minY, chartMax) - 1/3) < 1e-9, "0.001 -> 0.333");
assert(Math.abs(getPureLogYRatio(0.01, minY, chartMax) - 2/3) < 1e-9, "0.01 -> 0.666");
assert(getPureLogYRatio(0.1, minY, chartMax) === 1.0, "chartMax (0.1) -> 1.0");
assert(getPureLogYRatio(0.00005, minY, chartMax) === 0.0, "0.00005 (below minY) -> 0.0");
assert(getPureLogYRatio(0.5, minY, chartMax) === 1.0, "0.5 (above chartMax) -> 1.0");
console.log("✅ getPureLogYRatio (Pure Log) tests passed!");

// 6. Test getNiceLogMax
console.log("\nTesting getNiceLogMax...");
assert(getNiceLogMax(0.05) === 0.05, "0.05 -> 0.05 (exact)");
assert(getNiceLogMax(0.07) === 0.075, "0.07 -> 0.075");
assert(getNiceLogMax(0.15) === 0.25, "0.15 -> 0.25");
assert(getNiceLogMax(0.3) === 0.5, "0.3 -> 0.5");
assert(getNiceLogMax(0.6) === 0.75, "0.6 -> 0.75");
assert(getNiceLogMax(0.8) === 1.0, "0.8 -> 1.0");
assert(getNiceLogMax(1.5) === 2.5, "1.5 -> 2.5");
assert(getNiceLogMax(4.2) === 5.0, "4.2 -> 5.0");
assert(getNiceLogMax(6.0) === 7.5, "6.0 -> 7.5");
assert(getNiceLogMax(8.0) === 10.0, "8.0 -> 10.0");
assert(getNiceLogMax(15.0) === 25.0, "15.0 -> 25.0");
assert(getNiceLogMax(45.0) === 50.0, "45.0 -> 50.0");
assert(getNiceLogMax(75.0) === 75.0, "75.0 -> 75.0 (exact)");
console.log("✅ getNiceLogMax tests passed!");

// 7. Test getNiceLogMin
console.log("\nTesting getNiceLogMin...");
assert(getNiceLogMin(0.07) === 0.05, "0.07 -> 0.05");
assert(getNiceLogMin(0.08) === 0.075, "0.08 -> 0.075");
assert(getNiceLogMin(0.04) === 0.025, "0.04 -> 0.025");
assert(getNiceLogMin(0.15) === 0.1, "0.15 -> 0.1");
assert(getNiceLogMin(0.3) === 0.25, "0.3 -> 0.25");
assert(getNiceLogMin(0.8) === 0.75, "0.8 -> 0.75");
assert(getNiceLogMin(1.5) === 1.0, "1.5 -> 1.0");
assert(getNiceLogMin(4.2) === 2.5, "4.2 -> 2.5");
assert(getNiceLogMin(5.0) === 5.0, "5.0 -> 5.0 (exact)");
assert(getNiceLogMin(8.0) === 7.5, "8.0 -> 7.5");
assert(getNiceLogMin(15.0) === 10.0, "15.0 -> 10.0");
console.log("✅ getNiceLogMin tests passed!");

// 8. Test getLogGridValues
console.log("\nTesting getLogGridValues...");
const grid1 = getLogGridValues(0.01, 1.0);
console.log("Grid (0.01 to 1.0):", grid1);
assert(grid1.length === 9, "Should have 9 lines");
assert(Math.abs(grid1[0] - 0.01) < 1e-9, "0.01");
assert(Math.abs(grid1[1] - 0.025) < 1e-9, "0.025");
assert(Math.abs(grid1[2] - 0.05) < 1e-9, "0.05");
assert(Math.abs(grid1[3] - 0.075) < 1e-9, "0.075");
assert(Math.abs(grid1[4] - 0.1) < 1e-9, "0.1");
assert(Math.abs(grid1[5] - 0.25) < 1e-9, "0.25");
assert(Math.abs(grid1[6] - 0.5) < 1e-9, "0.5");
assert(Math.abs(grid1[7] - 0.75) < 1e-9, "0.75");
assert(Math.abs(grid1[8] - 1.0) < 1e-9, "1.0");

const grid2 = getLogGridValues(0.005, 5.0);
console.log("Grid (0.005 to 5.0):", grid2);
assert(grid2.length === 13, "Should have 13 lines");
assert(Math.abs(grid2[0] - 0.005) < 1e-9, "First is 0.005");
assert(Math.abs(grid2[12] - 5.0) < 1e-9, "Last is 5.0");

console.log("✅ getLogGridValues tests passed!");

console.log("\n🎉 All automated tests for scale math passed successfully!");
