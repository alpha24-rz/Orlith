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

# Install lightweight CPU-only PyTorch first (~150MB instead of 2.2GB CUDA PyTorch)
# This prevents pip from pulling down massive CUDA wheels during requirements installation.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install heavy scientific & ML packages separately with CPU fallback to optimize layer caching
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    numpy scipy Pillow opencv-python-headless easyocr sentence-transformers chromadb

# Install remaining dependencies from official PyPI CDN at high speed with CPU fallback
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

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
