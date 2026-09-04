# ProofSnap forensics service — HuggingFace Spaces free CPU tier.
# CPU-only, no model weights: the shipped lanes (B, C) are pure signal processing.
FROM python:3.12-slim

# opencv-python-headless still links libglib2.0; libgomp1 is needed by the
# OpenMP-backed numpy/scipy/cv2 wheels. Headless needs no libGL/X11.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Spaces expects UID 1000.
RUN useradd --create-home --uid 1000 appuser
WORKDIR /app

# Requirements first so the (slow) wheel layer caches across source edits.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chown -R appuser:appuser /app
USER appuser

# HuggingFace Spaces routes to 7860.
EXPOSE 7860

# stdlib urllib, so no curl in the image just for a healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7860/v1/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
