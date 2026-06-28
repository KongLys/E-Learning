# Tách dữ liệu sang database mới (cho benchmark)

Mục tiêu: lấy nội dung khóa học từ **DB cũ** sang **DB mới (trống)**, rồi **re-index**
để mọi thông tin chunk/graph/raptor được sinh và lưu ở DB mới — không đụng DB cũ.

> Benchmark (`run.ts`) chỉ ĐỌC database. Thao tác GHI duy nhất là **re-index** ở đây,
> nên ta cô lập nó sang DB mới.

## Kiến trúc

```
DB cũ (nguồn, read-only) ──copy nội dung──▶ DB mới (trống)
   Course/Section/Lesson                       │
   DocumentAsset/VideoAsset                     ├─ migrate-content.ts
   (KHÔNG copy chunk/graph/raptor)              │
                                                ▼
                                        reindex.ts (qua queue)
                                          → course_chunks
                                          → graph_entities/relations
                                          → raptor_nodes
```

File đính kèm nằm trên **MinIO (dùng chung, ngoài DB)** → chỉ copy row asset, indexer
tự tải lại theo `fileUrl`/`markdownUrl`.

## Các bước

Mọi lệnh chạy từ `apps/backend`.

### 1. Tạo schema trên DB mới (đang trống)

DB mới chưa có bảng. Vì DB dev cũ đã *drift* (xem ghi nhớ dự án — không dùng
`prisma migrate dev`), với DB trống ta dùng `db push` đẩy thẳng từ `schema.prisma`.
Trước đó phải bật extension `pgvector` (schema có cột `vector(768)`):

```bash
# bật pgvector trên DB mới
psql "<NEW_DATABASE_URL>" -c "CREATE EXTENSION IF NOT EXISTS vector;"

# tạo toàn bộ bảng từ schema (không cần lịch sử migration)
DATABASE_URL="<NEW_DATABASE_URL>" npx prisma db push
```

### 2. Copy nội dung khóa học (cũ → mới)

```bash
OLD_DATABASE_URL="<OLD_DATABASE_URL>" \
DATABASE_URL="<NEW_DATABASE_URL>" \
  npx ts-node benchmark/migrate-content.ts --courses <courseId1>,<courseId2>
```

Copy: Category (toàn bộ), instructor (User được Course tham chiếu), Course, Section,
Lesson (đặt `moderationStatus='approved'`), VideoAsset, DocumentAsset, Quiz*. **Không**
copy chunk/graph/raptor.

### 3. Re-index trên DB mới

⚠️ **Cô lập Redis.** `reindex.ts` bootstrap nguyên app nên chính nó vừa enqueue vừa
chạy worker. Nếu app production đang chạy và **dùng chung Redis**, worker của nó có thể
nuốt job và ghi nhầm vào **DB cũ**. Vì vậy dùng **Redis riêng** (hoặc số db Redis khác),
hoặc tắt worker production trong lúc reindex.

```bash
DATABASE_URL="<NEW_DATABASE_URL>" \
REDIS_URL="redis://localhost:6379/1" \
GEMINI_API_KEY=... COHERE_API_KEY=... \
  npx ts-node benchmark/reindex.ts --courses <courseId1>,<courseId2>
```

Script sẽ: enqueue index từng bài → chờ chunk xong → chờ graph extraction xong →
`RaptorService.ensureReady(force)` từng khóa → chờ cây RAPTOR `ready`.

> Cần các dịch vụ ngoài như khi chạy app: LlamaParse (parse file), MinIO (tải file),
> Gemini (embed/extract), v.v. — đặt đủ biến môi trường tương ứng.

### 4. Chạy benchmark trên DB mới

Giữ nguyên `DATABASE_URL="<NEW_DATABASE_URL>"` rồi làm theo [README.md](README.md):
`generate-golden.ts` → `run.ts` → `score.py`.

## Lưu ý

- **Chỉ copy đúng các khóa cần benchmark** để DB mới gọn. Không copy enrollment/order/
  review… vì re-index không cần.
- Muốn thêm khóa sau này: chạy lại bước 2–3 với courseId mới (dùng `skipDuplicates`).
- `migrate-content.ts` từ chối chạy nếu `OLD_DATABASE_URL == DATABASE_URL` để tránh tự
  ghi đè.
- Nếu một bài có file PDF/DOCX, indexer sẽ gọi LlamaParse lại (trừ khi `markdownUrl` đã
  cache trên MinIO — khi đó tái dùng, không tốn parse).
