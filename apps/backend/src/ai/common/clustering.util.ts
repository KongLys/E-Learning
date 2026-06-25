/**
 * K-means tối giản (khoảng cách Euclid trên vector embedding) dùng chung cho
 * mind map và RAPTOR. Seeding tất định (điểm cách đều trên luồng đã sắp thứ tự)
 * để kết quả tái lập được; dừng sớm khi không còn điểm nào đổi cụm.
 */
export function kmeans(vectors: number[][], k: number, iters = 12): number[] {
  const n = vectors.length;
  const dim = vectors[0].length;
  const centroids = Array.from({ length: k }, (_, i) =>
    vectors[Math.floor((i * n) / k)].slice(),
  );
  const assign = new Array(n).fill(0);

  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(vectors[i], centroids[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      counts[assign[i]]++;
      const v = vectors[i];
      const s = sums[assign[i]];
      for (let j = 0; j < dim; j++) s[j] += v[j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c];
      }
    }
    if (!moved && it > 0) break;
  }
  return assign;
}

export function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/** Parse vector pgvector dạng text "[1,2,3]" → number[]; trả null nếu hỏng. */
export function parseEmbedding(text: string | null): number[] | null {
  if (!text) return null;
  const vec = text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(Number);
  if (vec.length === 0 || vec.some(Number.isNaN)) return null;
  return vec;
}
