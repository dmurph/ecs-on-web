// Helper: Insertion sort over a range for subarrays
function insertionSortRangeECS(indices: Int32Array, posX: Float64Array | Float32Array, left: number, right: number) {
  for (let i = left + 1; i <= right; i++) {
    const currIdx = indices[i];
    const currX = posX[currIdx];
    let j = i - 1;
    while (j >= left && posX[indices[j]] > currX) {
      indices[j + 1] = indices[j];
      j--;
    }
    indices[j + 1] = currIdx;
  }
}

export function insertionSortCustomECS(indices: Int32Array, posX: Float64Array) {
  insertionSortRangeECS(indices, posX, 0, indices.length - 1);
}

export function quickSortCustomECS(indices: Int32Array, posX: Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeECS(indices, posX, left, right);
    return;
  }
  const pivotIdx = partitionCustomECS(indices, posX, left, right);
  quickSortCustomECS(indices, posX, left, pivotIdx - 1);
  quickSortCustomECS(indices, posX, pivotIdx + 1, right);
}

function partitionCustomECS(indices: Int32Array, posX: Float64Array, left: number, right: number): number {
  const mid = (left + right) >> 1;
  const tempMid = indices[mid];
  indices[mid] = indices[right];
  indices[right] = tempMid;

  const pivotVal = posX[indices[right]];
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (posX[indices[j]] < pivotVal) {
      i++;
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }
  }
  const temp = indices[i + 1];
  indices[i + 1] = indices[right];
  indices[right] = temp;
  return i + 1;
}
