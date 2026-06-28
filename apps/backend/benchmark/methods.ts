import { RagConfig } from './types';

/**
 * 3 phương pháp RAG được so sánh trong benchmark. Mỗi phương pháp là một tổ hợp
 * retriever + các tầng xử lý. Thứ tự giữ nguyên để bảng kết quả ổn định.
 *
 * Lưu ý ánh xạ với hệ thống thật:
 *  - "Hybrid+Rerank+Compress" = đúng pipeline production (hybrid RRF + Cohere + nén).
 *  - "LightRAG+Rerank+Compress" = đồ thị dual-level + rerank + nén.
 *  - "RAPTOR+Step-back+Rerank+Compress" = collapsed-tree trên cây tóm tắt +
 *    step-back prompting + rerank Cohere + nén.
 */
export const METHODS: RagConfig[] = [
  {
    name: 'hybrid-rerank-compress',
    retriever: 'hybrid',
    multiQuery: true,
    stepBack: false,
    rerank: true,
    compress: true,
  },
  {
    name: 'lightrag-rerank-compress',
    retriever: 'graph',
    multiQuery: false,
    stepBack: false,
    rerank: true,
    compress: true,
  },
  {
    name: 'raptor-stepback-rerank-compress',
    retriever: 'raptor',
    multiQuery: false,
    stepBack: true,
    rerank: true,
    compress: true,
  },
];

export function methodByName(name: string): RagConfig | undefined {
  return METHODS.find((m) => m.name === name);
}
