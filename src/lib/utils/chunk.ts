/**
 * 청크 처리 유틸리티
 * 대용량 배열을 청크로 분할하고 병렬 처리하기 위한 함수들
 */

/**
 * 배열을 지정된 크기의 청크로 분할
 *
 * @example
 * chunkArray([1, 2, 3, 4, 5], 2)
 * // [[1, 2], [3, 4], [5]]
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 청크를 동시 실행 제한하여 병렬 처리
 * 모든 청크를 한 번에 실행하지 않고, concurrency 개수만큼씩 처리
 *
 * @example
 * await processChunksParallel(
 *   [[1,2], [3,4], [5,6], [7,8]],
 *   async (chunk, index) => {
 *     return chunk.map(x => x * index);
 *   },
 *   2 // 동시에 2개씩 처리
 * );
 */
export async function processChunksParallel<T, R>(
  chunks: T[][],
  processor: (chunk: T[], index: number) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  if (concurrency <= 0) {
    throw new Error('Concurrency must be greater than 0');
  }

  const results: R[] = [];

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((chunk, batchIndex) => processor(chunk, i + batchIndex))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * 배열을 청크로 분할하고 순차 처리
 * 각 청크가 완료된 후 다음 청크 처리 (에러 발생 시 중단)
 */
export async function processChunksSequential<T, R>(
  array: T[],
  chunkSize: number,
  processor: (chunk: T[], index: number) => Promise<R>
): Promise<R[]> {
  const chunks = chunkArray(array, chunkSize);
  const results: R[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const result = await processor(chunks[i], i);
    results.push(result);
  }

  return results;
}

/**
 * 배열을 청크로 분할하고 병렬 처리 (에러 수집)
 * 일부 청크가 실패해도 계속 진행
 */
export async function processChunksWithErrors<T, R>(
  array: T[],
  chunkSize: number,
  processor: (chunk: T[], index: number) => Promise<R>,
  concurrency: number = 3
): Promise<{
  results: R[];
  errors: Array<{ index: number; error: Error }>;
}> {
  const chunks = chunkArray(array, chunkSize);
  const results: R[] = [];
  const errors: Array<{ index: number; error: Error }> = [];

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((chunk, batchIndex) => processor(chunk, i + batchIndex))
    );

    batchResults.forEach((result, batchIndex) => {
      const globalIndex = i + batchIndex;
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push({
          index: globalIndex,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        });
      }
    });
  }

  return { results, errors };
}
