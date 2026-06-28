# Benchmark các kỹ thuật RAG

So sánh 5 phương pháp RAG đang/được dựng trong hệ thống trên cùng một bộ dữ liệu,
đo cả **chất lượng truy hồi** (TypeScript) lẫn **chất lượng sinh** (RAGAS/Python).

## Các phương pháp ([methods.ts](methods.ts))

| Tên (`--methods`) | Retriever | multi-query | step-back | rerank | compress |
|---|---|---|---|---|---|
| `naive` | vector ANN thuần | – | – | – | – |
| `hybrid-rerank-compress` | hybrid (vector+BM25, RRF) | ✓ | – | ✓ | ✓ |
| `lightrag` | đồ thị dual-level | – | – | – | – |
| `lightrag-rerank-compress` | đồ thị dual-level | – | – | ✓ | ✓ |
| `raptor-stepback` | RAPTOR collapsed-tree | – | ✓ | – | – |

> `hybrid-rerank-compress` = đúng pipeline production trong [rag.service.ts](../src/ai/rag/rag.service.ts).

## Yêu cầu dữ liệu

Các phương pháp truy hồi vào dữ liệu đã index của một khóa học:
- **vector/hybrid**: bảng `course_chunks` (đã có khi xuất bản khóa).
- **lightrag**: bảng `graph_entities` / `graph_relations` → cần đã chạy graph extraction.
- **raptor**: bảng `raptor_nodes` → cần cây RAPTOR đã `ready` (gọi `RaptorService.ensureReady`).

Đảm bảo khóa học dùng để benchmark đã được index đầy đủ cả 3 nguồn trên, nếu không
phương pháp tương ứng sẽ trả pool rỗng.

## Quy trình

Mọi lệnh chạy từ thư mục `apps/backend`. Cần các biến môi trường như khi chạy app
(`DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY`, `COHERE_API_KEY`).

### 1. Sinh bộ dữ liệu vàng (synthetic, rồi rà soát tay)

Khuyến nghị dùng generator HỖN HỢP — sinh đủ 8 kiểu câu hỏi, mặc định 75 câu cân
bằng để đo cả độ khó lẫn năng lực tóm tắt/đa-nguồn:

```bash
npx ts-node benchmark/generate-golden-mixed.ts --course <courseId>
# tùy chọn ghi đè số lượng: --counts single=10,topic-multi=8
```

| `type` | mặc định | chunk vàng (`relevantChunkIds`) |
|---|---|---|
| `single` | 18 | 1 chunk |
| `multi-concrete` | 18 | nhiều chunk liền nhau cùng bài |
| `multi-abstract` | 18 | chunk từ bài khác nhau cùng phần |
| `lesson-summary` | 5 | mọi chunk của 1 bài |
| `section-summary` | 5 | mọi chunk của 1 phần |
| `course-summary` | 1 | tập chunk đại diện toàn khóa (≤40) |
| `topic-single` | 5 | `GraphEntity.chunkIds` — chủ đề gói trong 1 bài |
| `topic-multi` | 5 | `GraphEntity.chunkIds` — chủ đề trải nhiều bài |

> Các kiểu `*-summary` và `topic-*` cần khóa đã dựng **RAPTOR** (`raptor_nodes`) và
> chạy **graph extraction** (`graph_entities`); thiếu nguồn nào thì kiểu tương ứng
> sinh thiếu và in cảnh báo (không crash). Có thể chạy `reindex.ts` / `reindex-graph.ts`
> trước. Generator đơn giản hơn (1 chunk/câu, không gắn `type`):
> `npx ts-node benchmark/generate-golden.ts --course <courseId> --n 60`.

→ cả hai ghi `benchmark/data/golden-set.draft.json`. **Mở ra rà soát**: xóa câu mơ
hồ, và nếu một câu trả lời cần nhiều chunk thì bổ sung id vào `relevantChunkIds`. Khi
xong, đổi tên thành `benchmark/data/golden-set.json`.

Định dạng mỗi mục:
```json
{ "id": "g001", "courseId": "...", "type": "topic-multi", "question": "...",
  "groundTruthAnswer": "...", "relevantChunkIds": ["chunkId1", "chunkId2"],
  "scope": { "sectionId": "..." } }
```

### 2. Chạy benchmark (TS) — sinh kết quả + metric truy hồi

```bash
npx ts-node benchmark/run.ts                         # tất cả method
npx ts-node benchmark/run.ts --methods naive,lightrag --k 5 --limit 20
```

Đầu ra trong `benchmark/results/`:
- `<method>.jsonl` — mỗi dòng một bản ghi (question, contexts, answer, retrieved ids…).
- `retrieval-summary.md` / `.csv` — Recall@k, MRR, nDCG@k, Precision@k, HitRate, latency, số lần gọi LLM.

### 3. Chấm chất lượng sinh (RAGAS/Python)

```bash
pip install -r benchmark/requirements.txt
python benchmark/score.py              # judge chạy trên Ollama (qwen2.5:7b)
python benchmark/score.py --limit 10   # mỗi method chỉ 10 câu (thử nhanh)
```

→ `benchmark/results/ragas-summary.md` / `.csv` với faithfulness, answer_relevancy,
context_precision, context_recall theo từng phương pháp.

> Judge dùng **Ollama** (`OLLAMA_CHAT_MODEL` + `OLLAMA_EMBED_MODEL`) nên không cần
> API key, nhưng 7B chấm chậm (~20–40 phút/run đầy đủ). Dùng `--limit` để thử nhanh.

### 4. Báo cáo trực quan (HTML)

```bash
npx ts-node benchmark/report.ts
```

→ `benchmark/results/report.html` — mở bằng trình duyệt (tự chứa, không cần internet):
bảng tổng hợp tô màu best/worst, biểu đồ cột so sánh từng metric (retrieval + RAGAS),
và drill-down HIT/MISS từng câu hỏi. Gộp cả `retrieval-summary.csv` lẫn
`ragas-summary.csv` (RAGAS tùy chọn — thiếu vẫn render phần retrieval).

## Ghi chú phương pháp luận

- **Retrieval metric** (TS) dựa trên `relevantChunkIds` vàng — RAPTOR map node về leaf
  chunk id nên so sánh đồng nhất với các retriever theo chunk.
- **`contexts`** ghi ra là các passage ĐÃ truy hồi (trước khi nén). Khi bật `compress`,
  câu trả lời dùng bản nén còn RAGAS context-metric vẫn chấm trên passage gốc — phản
  ánh đúng đơn vị truy hồi.
- Golden synthetic dễ thiên lệch "1 chunk/câu". `generate-golden-mixed.ts` đã cân
  bằng bằng các kiểu đa-chunk (`multi-*`), tóm tắt (`*-summary`) và chủ đề đa-bài
  (`topic-*`) để công bằng hơn với RAPTOR/LightRAG (vốn mạnh ở multi-hop/tổng hợp).
- Câu `section-summary`/`course-summary` có **tập vàng lớn** (mọi/đa số chunk của
  phần/khóa) nên Recall@k của retriever phẳng (naive/hybrid) sẽ thấp theo bản chất —
  đây chính là chỗ RAPTOR (map một node tóm tắt về nhiều chunk lá) ăn điểm. Đọc
  metric theo `type` ở `report.html` thay vì chỉ nhìn trung bình toàn cục.
