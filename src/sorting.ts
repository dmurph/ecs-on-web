interface GameEntityLike {
  x: number;
}

// ==========================================
// CUSTOM ECS SORTING
// ==========================================

export function insertionSortCustomECS(indices: Int32Array, posX: Float64Array) {
  const len = indices.length;
  for (let i = 1; i < len; i++) {
    const currIdx = indices[i];
    const currX = posX[currIdx]; 
    let j = i - 1;
    while (j >= 0 && posX[indices[j]] > currX) {
      indices[j + 1] = indices[j];
      j--;
    }
    indices[j + 1] = currIdx;
  }
}

export function quickSortCustomECS(indices: Int32Array, posX: Float64Array, left: number, right: number) {
  if (left >= right) return;
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
  if (left >= right) return;
  const mid = (left + right) >> 1;
  mergeSortCustomECS(indices, posX, temp, left, mid);
  mergeSortCustomECS(indices, posX, temp, mid + 1, right);
  mergeCustomECS(indices, posX, temp, left, mid, right);
}

function mergeCustomECS(indices: Int32Array, posX: Float64Array, temp: Int32Array, left: number, mid: number, right: number) {
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (posX[indices[i]] <= posX[indices[j]]) {
      temp[k++] = indices[i++];
    } else {
      temp[k++] = indices[j++];
    }
  }

  while (i <= mid) {
    temp[k++] = indices[i++];
  }
  while (j <= right) {
    temp[k++] = indices[j++];
  }

  for (let m = left; m <= right; m++) {
    indices[m] = temp[m];
  }
}

// ==========================================
// BITECS SORTING
// ==========================================

export function insertionSortBitecs(entities: Int32Array, posX: Float32Array | Float64Array) {
  const len = entities.length;
  for (let i = 1; i < len; i++) {
    const currId = entities[i];
    const currX = posX[currId];
    let j = i - 1;
    while (j >= 0 && posX[entities[j]] > currX) {
      entities[j + 1] = entities[j];
      j--;
    }
    entities[j + 1] = currId;
  }
}

export function quickSortBitecs(entities: Int32Array, posX: Float32Array | Float64Array, left: number, right: number) {
  if (left >= right) return;
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
  if (left >= right) return;
  const mid = (left + right) >> 1;
  mergeSortBitecs(entities, posX, temp, left, mid);
  mergeSortBitecs(entities, posX, temp, mid + 1, right);
  mergeBitecs(entities, posX, temp, left, mid, right);
}

function mergeBitecs(entities: Int32Array, posX: Float32Array | Float64Array, temp: Int32Array, left: number, mid: number, right: number) {
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (posX[entities[i]] <= posX[entities[j]]) {
      temp[k++] = entities[i++];
    } else {
      temp[k++] = entities[j++];
    }
  }

  while (i <= mid) {
    temp[k++] = entities[i++];
  }
  while (j <= right) {
    temp[k++] = entities[j++];
  }

  for (let m = left; m <= right; m++) {
    entities[m] = temp[m];
  }
}

// ==========================================
// OOP SORTING
// ==========================================

export function insertionSortOOP(entities: GameEntityLike[]) {
  const len = entities.length;
  for (let i = 1; i < len; i++) {
    const current = entities[i];
    let j = i - 1;
    while (j >= 0 && entities[j].x > current.x) {
      entities[j + 1] = entities[j];
      j--;
    }
    entities[j + 1] = current;
  }
}

export function quickSortOOP(entities: GameEntityLike[], left: number, right: number) {
  if (left >= right) return;
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
  if (left >= right) return;
  const mid = (left + right) >> 1;
  mergeSortOOP(entities, temp, left, mid);
  mergeSortOOP(entities, temp, mid + 1, right);
  mergeOOP(entities, temp, left, mid, right);
}

function mergeOOP(entities: GameEntityLike[], temp: GameEntityLike[], left: number, mid: number, right: number) {
  let i = left;
  let j = mid + 1;
  let k = left;

  while (i <= mid && j <= right) {
    if (entities[i].x <= entities[j].x) {
      temp[k++] = entities[i++];
    } else {
      temp[k++] = entities[j++];
    }
  }

  while (i <= mid) {
    temp[k++] = entities[i++];
  }
  while (j <= right) {
    temp[k++] = entities[j++];
  }

  for (let m = left; m <= right; m++) {
    entities[m] = temp[m];
  }
}
