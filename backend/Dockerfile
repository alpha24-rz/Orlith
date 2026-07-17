FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    tesseract-ocr \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install lightweight CPU PyTorch (~150MB instead of 2.3GB CUDA) first.
# This layer finishes in ~2 minutes and will be CACHED PERMANENTLY by Docker!
RUN pip install --no-cache-dir --default-timeout=1000 --retries 10 \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install heavy scientific & pre-compiled ML wheels in a separate layer.
# Separating this layer prevents long builds and timeouts. Once completed, CACHED PERMANENTLY!
RUN pip install --no-cache-dir --default-timeout=1000 --retries 10 \
    --index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    numpy scipy Pillow opencv-python-headless scikit-image chromadb sentence-transformers easyocr

# Install remaining fast requirements from requirements.txt (FastAPI, pydantic, uvicorn, langchain, etc.)
RUN pip install --no-cache-dir --default-timeout=1000 --retries 10 \
    --index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

COPY . .

# Create a user with UID 1000 to prevent getpwuid key errors
RUN useradd -m -u 1000 user

# Create data directories:
# - /data  : HF Spaces persistent volume mount point (Pro tier) or fallback storage
# - /app/data : fallback when /data is not available
# Both are owned by the non-root user.
RUN mkdir -p /data /app/data/chroma /app/data/uploads && chown -R user:user /app /data

# Set environment variable USER to prevent getpass from querying local user db
ENV USER=user

USER user

EXPOSE 7860

# Deep health check — verifies the /health endpoint is reachable with generous startup period for CPU inference
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:${PORT:-7860}/health || exit 1

# Production: run without --reload, bind dynamically to PORT (defaulting to 7860)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
