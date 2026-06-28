"""
Chấm điểm generation bằng RAGAS từ results/<method>.jsonl (do run.ts sinh).

LLM-judge mặc định dùng Anthropic Haiku (RAGAS_JUDGE=anthropic); embeddings vẫn
chạy trên Ollama local vì Anthropic không có API embeddings. Đặt RAGAS_JUDGE=ollama
để chấm hoàn toàn local (không tốn token).

Metric:
  - faithfulness        : câu trả lời có bám ngữ cảnh không (chống bịa).   [chỉ LLM]
  - answer_relevancy    : câu trả lời có đúng trọng tâm câu hỏi không.     [LLM + embeddings]
  - context_precision   : ngữ cảnh truy hồi có liên quan/đúng thứ tự không. [chỉ LLM]
  - context_recall      : ngữ cảnh có đủ thông tin để suy ra đáp án tham chiếu không. [chỉ LLM]

Cần: ragas>=0.2, langchain-ollama, langchain-anthropic, datasets, pandas.
Ollama phải đang chạy (cho embeddings). Judge Anthropic cần ANTHROPIC_API_KEY.
Chạy (từ apps/backend):
  pip install -r benchmark/requirements.txt
  python benchmark/score.py            # tất cả method, mọi câu
  python benchmark/score.py --limit 10 # mỗi method chỉ chấm 10 câu (nhanh)

Biến môi trường:
  RAGAS_JUDGE       anthropic (mặc định) | ollama
  ANTHROPIC_API_KEY khoá API (bắt buộc khi RAGAS_JUDGE=anthropic)
  ANTHROPIC_JUDGE_MODEL  model judge (mặc định claude-haiku-4-5)
  OLLAMA_CHAT_MODEL      model judge khi RAGAS_JUDGE=ollama (mặc định qwen2.5:7b)
  OLLAMA_EMBED_MODEL     model embeddings (mặc định nomic-embed-text)

⚠ Haiku tính tiền theo token (~$1/MTok in, $5/MTok out). RAGAS gọi ~8–10 lượt
  LLM/câu; chạy --limit 5 trước để đo token thực tế rồi nhân lên.
"""
import argparse
import glob
import json
import os
import sys
from pathlib import Path

# Console Windows mặc định cp1252 — ép UTF-8 để in được ▶/✓ (tránh crash encode).
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

RESULTS_DIR = Path(__file__).parent / "results"


def load_records(path, limit=None):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows[:limit] if limit else rows


def build_judge():
    """LLM-judge (Anthropic Haiku hoặc Ollama) + embeddings (luôn Ollama local).

    Anthropic không có API embeddings nên answer_relevancy luôn dùng Ollama; chỉ
    LLM-judge mới chuyển sang Haiku khi RAGAS_JUDGE=anthropic (mặc định).
    """
    from langchain_ollama import OllamaEmbeddings
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper

    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    embed_model = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    judge = os.environ.get("RAGAS_JUDGE", "anthropic").lower()

    if judge == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "RAGAS_JUDGE=anthropic cần ANTHROPIC_API_KEY. "
                "Đặt RAGAS_JUDGE=ollama để chấm hoàn toàn local."
            )
        from langchain_anthropic import ChatAnthropic

        model = os.environ.get("ANTHROPIC_JUDGE_MODEL", "claude-haiku-4-5")
        chat = ChatAnthropic(model=model, temperature=0, max_tokens=1024)
        print(f"  judge LLM: Anthropic {model} | embeddings: Ollama {embed_model}")
    else:
        from langchain_ollama import ChatOllama

        chat_model = os.environ.get("OLLAMA_CHAT_MODEL", "qwen2.5:7b")
        chat = ChatOllama(model=chat_model, base_url=base_url, temperature=0)
        print(f"  judge LLM: Ollama {chat_model} | embeddings: Ollama {embed_model}")

    llm = LangchainLLMWrapper(chat)
    embeddings = LangchainEmbeddingsWrapper(
        OllamaEmbeddings(model=embed_model, base_url=base_url)
    )
    return llm, embeddings


def score_method(path, llm, embeddings, limit=None):
    from ragas import evaluate
    from ragas.dataset_schema import EvaluationDataset, SingleTurnSample
    from ragas.metrics import (
        Faithfulness,
        ResponseRelevancy,
        LLMContextPrecisionWithReference,
        LLMContextRecall,
    )
    from ragas.run_config import RunConfig

    records = load_records(path, limit)
    if not records:
        return None
    samples = [
        SingleTurnSample(
            user_input=r["question"],
            response=r.get("answer", "") or " ",
            retrieved_contexts=r.get("contexts", []) or [" "],
            reference=r.get("groundTruthAnswer", "") or " ",
        )
        for r in records
    ]
    dataset = EvaluationDataset(samples=samples)
    metrics = [
        Faithfulness(),
        ResponseRelevancy(),
        LLMContextPrecisionWithReference(),
        LLMContextRecall(),
    ]
    # max_workers thấp để không làm nghẽn Ollama local; timeout rộng cho 7B.
    run_config = RunConfig(max_workers=2, timeout=600)
    result = evaluate(
        dataset=dataset,
        metrics=metrics,
        llm=llm,
        embeddings=embeddings,
        run_config=run_config,
        raise_exceptions=False,
    )
    df = result.to_pandas()
    means = {}
    for col in df.columns:
        try:
            means[col] = float(df[col].astype(float).mean(skipna=True))
        except (ValueError, TypeError):
            continue
    return means


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="số câu/method tối đa")
    args = ap.parse_args()

    files = sorted(glob.glob(str(RESULTS_DIR / "*.jsonl")))
    if not files:
        print(f"Không có .jsonl trong {RESULTS_DIR}. Chạy run.ts trước.")
        sys.exit(1)

    llm, embeddings = build_judge()
    rows = {}
    for path in files:
        method = Path(path).stem
        print(f"▶ RAGAS (Ollama): {method}")
        try:
            means = score_method(path, llm, embeddings, args.limit)
            if means:
                rows[method] = means
        except Exception as e:  # noqa: BLE001
            print(f"  lỗi {method}: {e}")

    if not rows:
        print("Không chấm được method nào.")
        sys.exit(1)

    metric_names = sorted({m for v in rows.values() for m in v})
    with open(RESULTS_DIR / "ragas-summary.csv", "w", encoding="utf-8") as f:
        f.write("method," + ",".join(metric_names) + "\n")
        for method, v in rows.items():
            f.write(
                method + "," + ",".join(f"{v.get(m, float('nan')):.4f}" for m in metric_names) + "\n"
            )
    with open(RESULTS_DIR / "ragas-summary.md", "w", encoding="utf-8") as f:
        f.write("| method | " + " | ".join(metric_names) + " |\n")
        f.write("|" + "---|" * (len(metric_names) + 1) + "\n")
        for method, v in rows.items():
            f.write(
                "| " + method + " | " + " | ".join(f"{v.get(m, float('nan')):.3f}" for m in metric_names) + " |\n"
            )
    print(f"\n✓ Đã ghi ragas-summary.csv / .md vào {RESULTS_DIR}")
    with open(RESULTS_DIR / "ragas-summary.md", encoding="utf-8") as f:
        print("\n" + f.read())


if __name__ == "__main__":
    main()
