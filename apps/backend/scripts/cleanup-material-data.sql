-- Dọn dữ liệu trước khi đồng bộ schema mới (lesson_ai_toc_pipeline):
-- mindmap cũ scope theo material và toàn bộ chunk sẽ được index lại theo layout TOC mới.
DELETE FROM course_mindmaps;
DELETE FROM course_chunks;
