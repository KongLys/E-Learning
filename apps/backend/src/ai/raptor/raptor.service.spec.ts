import { chunkBatches } from './raptor.service';

// PART_CAP = 4000, TOTAL_CAP = 12000 (giữ đồng bộ với hằng số trong raptor.service.ts).
const PART_CAP = 4000;
const TOTAL_CAP = 12000;

const str = (len: number, ch = 'a') => ch.repeat(len);

describe('chunkBatches', () => {
  it('nội dung ngắn (tổng < TOTAL_CAP) → đúng 1 batch, giữ nguyên các đoạn', () => {
    const contents = [str(1000), str(2000), str(3000)];
    const batches = chunkBatches(contents);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(contents);
  });

  it('nội dung dài (tổng > TOTAL_CAP) → ≥2 batch, mỗi batch ≤ TOTAL_CAP', () => {
    // 6 đoạn × 3000 = 18000 ký tự > TOTAL_CAP.
    const contents = Array.from({ length: 6 }, () => str(3000));
    const batches = chunkBatches(contents);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    for (const b of batches) {
      const total = b.reduce((s, p) => s + p.length, 0);
      expect(total).toBeLessThanOrEqual(TOTAL_CAP);
    }
  });

  it('không mất đoạn nào: tổng số phần = số đoạn đầu vào', () => {
    const contents = Array.from({ length: 10 }, (_, i) => str(2500, String(i % 10)));
    const batches = chunkBatches(contents);
    const flat = batches.flat();
    expect(flat).toHaveLength(contents.length);
    // Mỗi đoạn (≤ PART_CAP) xuất hiện đúng theo thứ tự.
    expect(flat).toEqual(contents);
  });

  it('đoạn lẻ dài hơn PART_CAP → bị slice còn PART_CAP', () => {
    const contents = [str(10000)];
    const batches = chunkBatches(contents);
    expect(batches).toHaveLength(1);
    expect(batches[0][0]).toHaveLength(PART_CAP);
  });

  it('mảng rỗng → [[""]]', () => {
    expect(chunkBatches([])).toEqual([['']]);
  });
});
