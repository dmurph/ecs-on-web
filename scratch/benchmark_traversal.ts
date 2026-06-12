import { ECSTreeSimulator, FlatAABBTree } from '../src/benchmark_ecs_tree';
import { OOPSimulator } from '../src/benchmark_oop';
import { SeededPRNG } from '../src/prng';

const numEntities = 5000;
const w = 1000;
const h = 800;
const runs = 100;

let recChecks = 0;
let iterChecks = 0;
let iterBothChecks = 0;

// Recursive version
function queryOverlapFlatRec(
  tree: FlatAABBTree,
  nodeA: number,
  nodeB: number,
  callback: (leafA: number, leafB: number) => void
) {
  recChecks++;
  const overlap = tree.minX[nodeA] <= tree.maxX[nodeB] && tree.maxX[nodeA] >= tree.minX[nodeB] &&
                  tree.minY[nodeA] <= tree.maxY[nodeB] && tree.maxY[nodeA] >= tree.minY[nodeB];
  if (!overlap) return;

  const isLeafA = tree.left[nodeA] === -1;
  const isLeafB = tree.left[nodeB] === -1;

  if (isLeafA && isLeafB) {
    callback(nodeA, nodeB);
  } else if (isLeafA) {
    queryOverlapFlatRec(tree, nodeA, tree.left[nodeB], callback);
    queryOverlapFlatRec(tree, nodeA, tree.right[nodeB], callback);
  } else if (isLeafB) {
    queryOverlapFlatRec(tree, tree.left[nodeA], nodeB, callback);
    queryOverlapFlatRec(tree, tree.right[nodeA], nodeB, callback);
  } else {
    if (tree.height[nodeA] > tree.height[nodeB]) {
      queryOverlapFlatRec(tree, tree.left[nodeA], nodeB, callback);
      queryOverlapFlatRec(tree, tree.right[nodeA], nodeB, callback);
    } else {
      queryOverlapFlatRec(tree, nodeA, tree.left[nodeB], callback);
      queryOverlapFlatRec(tree, nodeA, tree.right[nodeB], callback);
    }
  }
}

// Pre-allocated stack for iterative version
const stackA = new Int32Array(512);
const stackB = new Int32Array(512);

function queryOverlapFlatIter(
  tree: FlatAABBTree,
  startNodeA: number,
  startNodeB: number,
  callback: (leafA: number, leafB: number) => void
) {
  let stackPtr = 0;
  stackA[0] = startNodeA;
  stackB[0] = startNodeB;
  stackPtr = 1;

  const minX = tree.minX;
  const minY = tree.minY;
  const maxX = tree.maxX;
  const maxY = tree.maxY;
  const left = tree.left;
  const right = tree.right;
  const height = tree.height;

  while (stackPtr > 0) {
    iterChecks++;
    stackPtr--;
    const nodeA = stackA[stackPtr];
    const nodeB = stackB[stackPtr];

    const overlap = minX[nodeA] <= maxX[nodeB] && maxX[nodeA] >= minX[nodeB] &&
                    minY[nodeA] <= maxY[nodeB] && maxY[nodeA] >= minY[nodeB];
    if (!overlap) continue;

    const isLeafA = left[nodeA] === -1;
    const isLeafB = left[nodeB] === -1;

    if (isLeafA && isLeafB) {
      callback(nodeA, nodeB);
    } else if (isLeafA) {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("Stack overflow");
      }
      stackA[stackPtr] = nodeA;
      stackB[stackPtr] = left[nodeB];
      stackA[stackPtr + 1] = nodeA;
      stackB[stackPtr + 1] = right[nodeB];
      stackPtr += 2;
    } else if (isLeafB) {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("Stack overflow");
      }
      stackA[stackPtr] = left[nodeA];
      stackB[stackPtr] = nodeB;
      stackA[stackPtr + 1] = right[nodeA];
      stackB[stackPtr + 1] = nodeB;
      stackPtr += 2;
    } else {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("Stack overflow");
      }
      if (height[nodeA] > height[nodeB]) {
        stackA[stackPtr] = left[nodeA];
        stackB[stackPtr] = nodeB;
        stackA[stackPtr + 1] = right[nodeA];
        stackB[stackPtr + 1] = nodeB;
      } else {
        stackA[stackPtr] = nodeA;
        stackB[stackPtr] = left[nodeB];
        stackA[stackPtr + 1] = nodeA;
        stackB[stackPtr + 1] = right[nodeB];
      }
      stackPtr += 2;
    }
  }
}

// For fully iterative version we need a version of queryOverlap that increments iterBothChecks
function queryOverlapFlatIterBoth(
  tree: FlatAABBTree,
  startNodeA: number,
  startNodeB: number,
  callback: (leafA: number, leafB: number) => void
) {
  let stackPtr = 0;
  stackA[0] = startNodeA;
  stackB[0] = startNodeB;
  stackPtr = 1;

  const minX = tree.minX;
  const minY = tree.minY;
  const maxX = tree.maxX;
  const maxY = tree.maxY;
  const left = tree.left;
  const right = tree.right;
  const height = tree.height;

  while (stackPtr > 0) {
    iterBothChecks++;
    stackPtr--;
    const nodeA = stackA[stackPtr];
    const nodeB = stackB[stackPtr];

    const overlap = minX[nodeA] <= maxX[nodeB] && maxX[nodeA] >= minX[nodeB] &&
                    minY[nodeA] <= maxY[nodeB] && maxY[nodeA] >= minY[nodeB];
    if (!overlap) continue;

    const isLeafA = left[nodeA] === -1;
    const isLeafB = left[nodeB] === -1;

    if (isLeafA && isLeafB) {
      callback(nodeA, nodeB);
    } else if (isLeafA) {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("Stack overflow");
      }
      stackA[stackPtr] = nodeA;
      stackB[stackPtr] = left[nodeB];
      stackA[stackPtr + 1] = nodeA;
      stackB[stackPtr + 1] = right[nodeB];
      stackPtr += 2;
    } else if (isLeafB) {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("Stack overflow");
      }
      stackA[stackPtr] = left[nodeA];
      stackB[stackPtr] = nodeB;
      stackA[stackPtr + 1] = right[nodeA];
      stackB[stackPtr + 1] = nodeB;
      stackPtr += 2;
    } else {
      if (stackPtr + 2 > stackA.length) {
         throw new Error("Stack overflow");
      }
      if (height[nodeA] > height[nodeB]) {
        stackA[stackPtr] = left[nodeA];
        stackB[stackPtr] = nodeB;
        stackA[stackPtr + 1] = right[nodeA];
        stackB[stackPtr + 1] = nodeB;
      } else {
        stackA[stackPtr] = nodeA;
        stackB[stackPtr] = left[nodeB];
        stackA[stackPtr + 1] = nodeA;
        stackB[stackPtr + 1] = right[nodeB];
      }
      stackPtr += 2;
    }
  }
}

// Run
const prng = new SeededPRNG(42);
const oopSim = new OOPSimulator();
oopSim.init(numEntities, w, h, prng);
const positions = oopSim.getPositions();

const ecsTreeSim = new ECSTreeSimulator();
ecsTreeSim.init(numEntities, w, h, prng);
ecsTreeSim.setPositions(positions);
const tree = (ecsTreeSim as any).tree as FlatAABBTree;

function runBroadphaseRec(tree: FlatAABBTree, callback: (leafA: number, leafB: number) => void) {
  const queryPairs = (node: number) => {
    if (node === -1 || tree.left[node] === -1) return;
    queryOverlapFlatRec(tree, tree.left[node], tree.right[node], callback);
    queryPairs(tree.left[node]);
    queryPairs(tree.right[node]);
  };
  queryPairs(tree.root);
}

function runBroadphaseIter(tree: FlatAABBTree, callback: (leafA: number, leafB: number) => void) {
  const queryPairs = (node: number) => {
    if (node === -1 || tree.left[node] === -1) return;
    queryOverlapFlatIter(tree, tree.left[node], tree.right[node], callback);
    queryPairs(tree.left[node]);
    queryPairs(tree.right[node]);
  };
  queryPairs(tree.root);
}

const mainStack = new Int32Array(512);

function runBroadphaseIterBoth(tree: FlatAABBTree, callback: (leafA: number, leafB: number) => void) {
  let stackPtr = 0;
  if (tree.root === -1 || tree.left[tree.root] === -1) return;
  
  mainStack[0] = tree.root;
  stackPtr = 1;

  const left = tree.left;
  const right = tree.right;

  while (stackPtr > 0) {
    stackPtr--;
    const node = mainStack[stackPtr];

    queryOverlapFlatIterBoth(tree, left[node], right[node], callback);

    const leftChild = left[node];
    const rightChild = right[node];

    if (left[leftChild] !== -1) {
      if (stackPtr + 1 > mainStack.length) throw new Error("Main stack overflow");
      mainStack[stackPtr] = leftChild;
      stackPtr++;
    }
    if (left[rightChild] !== -1) {
      if (stackPtr + 1 > mainStack.length) throw new Error("Main stack overflow");
      mainStack[stackPtr] = rightChild;
      stackPtr++;
    }
  }
}

console.log("Warming up...");
let dummy = 0;
for (let i = 0; i < 10; i++) {
  runBroadphaseRec(tree, () => { dummy++; });
  runBroadphaseIter(tree, () => { dummy++; });
  runBroadphaseIterBoth(tree, () => { dummy++; });
}

console.log("Running benchmark...");

recChecks = 0;
const t0 = performance.now();
for (let i = 0; i < runs; i++) {
  runBroadphaseRec(tree, (a, b) => { dummy += a + b; });
}
const t1 = performance.now();
const recTime = t1 - t0;
console.log(`Recursive: ${recTime.toFixed(2)} ms (avg ${(recTime/runs).toFixed(4)} ms/run, checks/run: ${recChecks/runs})`);

iterChecks = 0;
const t2 = performance.now();
for (let i = 0; i < runs; i++) {
  runBroadphaseIter(tree, (a, b) => { dummy += a + b; });
}
const t3 = performance.now();
const iterTime = t3 - t2;
console.log(`Iterative (overlap only): ${iterTime.toFixed(2)} ms (avg ${(iterTime/runs).toFixed(4)} ms/run, checks/run: ${iterChecks/runs})`);

iterBothChecks = 0;
const t4 = performance.now();
for (let i = 0; i < runs; i++) {
  runBroadphaseIterBoth(tree, (a, b) => { dummy += a + b; });
}
const t5 = performance.now();
const iterBothTime = t5 - t4;
console.log(`Fully Iterative: ${iterBothTime.toFixed(2)} ms (avg ${(iterBothTime/runs).toFixed(4)} ms/run, checks/run: ${iterBothChecks/runs})`);

console.log("Dummy value (ignore):", dummy);
