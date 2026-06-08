FROM python:3.11-slim

WORKDIR /app

# Install CPU-only PyTorch first (smaller image, no CUDA) then the rest.
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Model weights are NOT baked into the image — mount ./models as a volume at runtime.
ENV MODEL_PATH=/app/models \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request,sys; r=urllib.request.urlopen('http://localhost:8000/health'); sys.exit(0 if b'\"model_loaded\": true' in r.read() else 1)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
