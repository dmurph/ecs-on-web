interface GameEntityLike {
  x: number;
}

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

function insertionSortRangeOOP(entities: GameEntityLike[], left: number, right: number) {
  for (let i = left + 1; i <= right; i++) {
    const current = entities[i];
    let j = i - 1;
    while (j >= left && entities[j].x > current.x) {
      entities[j + 1] = entities[j];
      j--;
    }
    entities[j + 1] = current;
  }
}

// ==========================================
// CUSTOM ECS SORTING
// ==========================================

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

export function mergeSortCustomECS(indices: Int32Array, posX: Float64Array, temp: Int32Array, left: number, right: number) {
  // Initialize ping-pong copy
  temp.set(indices);
  mergeSortCustomECSRec(temp, indices, posX, left, right);
}

function mergeSortCustomECSRec(src: Int32Array, dst: Int32Array, posX: Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeECS(dst, posX, left, right);
    for (let m = left; m <= right; m++) {
      src[m] = dst[m];
    }
    return;
  }
  const mid = (left + right) >> 1;
  mergeSortCustomECSRec(dst, src, posX, left, mid);
  mergeSortCustomECSRec(dst, src, posX, mid + 1, right);
  
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (posX[src[i]] <= posX[src[j]]) {
      dst[k++] = src[i++];
    } else {
      dst[k++] = src[j++];
    }
  }

  while (i <= mid) {
    dst[k++] = src[i++];
  }
  while (j <= right) {
    dst[k++] = src[j++];
  }
}

// ==========================================
// BITECS SORTING
// ==========================================

export function insertionSortBitecs(entities: Int32Array, posX: Float32Array | Float64Array) {
  insertionSortRangeECS(entities, posX, 0, entities.length - 1);
}

export function quickSortBitecs(entities: Int32Array, posX: Float32Array | Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeECS(entities, posX, left, right);
    return;
  }
  const pivotIdx = partitionBitecs(entities, posX, left, right);
  quickSortBitecs(entities, posX, left, pivotIdx - 1);
  quickSortBitecs(entities, posX, pivotIdx + 1, right);
}

function partitionBitecs(entities: Int32Array, posX: Float32Array | Float64Array, left: number, right: number): number {
  const mid = (left + right) >> 1;
  const tempMid = entities[mid];
  entities[mid] = entities[right];
  entities[right] = tempMid;

  const pivotVal = posX[entities[right]];
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (posX[entities[j]] < pivotVal) {
      i++;
      const temp = entities[i];
      entities[i] = entities[j];
      entities[j] = temp;
    }
  }
  const temp = entities[i + 1];
  entities[i + 1] = entities[right];
  entities[right] = temp;
  return i + 1;
}

export function mergeSortBitecs(entities: Int32Array, posX: Float32Array | Float64Array, temp: Int32Array, left: number, right: number) {
  temp.set(entities);
  mergeSortBitecsRec(temp, entities, posX, left, right);
}

function mergeSortBitecsRec(src: Int32Array, dst: Int32Array, posX: Float32Array | Float64Array, left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeECS(dst, posX, left, right);
    for (let m = left; m <= right; m++) {
      src[m] = dst[m];
    }
    return;
  }
  const mid = (left + right) >> 1;
  mergeSortBitecsRec(dst, src, posX, left, mid);
  mergeSortBitecsRec(dst, src, posX, mid + 1, right);
  
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (posX[src[i]] <= posX[src[j]]) {
      dst[k++] = src[i++];
    } else {
      dst[k++] = src[j++];
    }
  }

  while (i <= mid) {
    dst[k++] = src[i++];
  }
  while (j <= right) {
    dst[k++] = src[j++];
  }
}

// ==========================================
// OOP SORTING
// ==========================================

export function insertionSortOOP(entities: GameEntityLike[]) {
  insertionSortRangeOOP(entities, 0, entities.length - 1);
}

export function quickSortOOP(entities: GameEntityLike[], left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeOOP(entities, left, right);
    return;
  }
  const pivotIdx = partitionOOP(entities, left, right);
  quickSortOOP(entities, left, pivotIdx - 1);
  quickSortOOP(entities, pivotIdx + 1, right);
}

function partitionOOP(entities: GameEntityLike[], left: number, right: number): number {
  const mid = (left + right) >> 1;
  const tempMid = entities[mid];
  entities[mid] = entities[right];
  entities[right] = tempMid;

  const pivotVal = entities[right].x;
  let i = left - 1;
  for (let j = left; j < right; j++) {
    if (entities[j].x < pivotVal) {
      i++;
      const temp = entities[i];
      entities[i] = entities[j];
      entities[j] = temp;
    }
  }
  const temp = entities[i + 1];
  entities[i + 1] = entities[right];
  entities[right] = temp;
  return i + 1;
}

export function mergeSortOOP(entities: GameEntityLike[], temp: GameEntityLike[], left: number, right: number) {
  for (let i = 0; i < entities.length; i++) {
    temp[i] = entities[i];
  }
  mergeSortOOPRec(temp, entities, left, right);
}

function mergeSortOOPRec(src: GameEntityLike[], dst: GameEntityLike[], left: number, right: number) {
  if (right - left < 12) {
    insertionSortRangeOOP(dst, left, right);
    for (let m = left; m <= right; m++) {
      src[m] = dst[m];
    }
    return;
  }
  const mid = (left + right) >> 1;
  mergeSortOOPRec(dst, src, left, mid);
  mergeSortOOPRec(dst, src, mid + 1, right);
  
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (src[i].x <= src[j].x) {
      dst[k++] = src[i++];
    } else {
      dst[k++] = src[j++];
    }
  }

  while (i <= mid) {
    dst[k++] = src[i++];
  }
  while (j <= right) {
    dst[k++] = src[j++];
  }
}
