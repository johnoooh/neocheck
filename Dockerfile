FROM python:3.11-slim

# Node.js 20 (for 3 of the 4 MCP servers)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first for cache
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# App + MCP servers
COPY . /app

# Build Node MCP servers
RUN cd mcp/CEDARMCP && npm ci && npm run build \
    && cd /app/mcp/imgt-hla-mcp && npm ci && npm run build \
    && cd /app/mcp/clinicaltrialsgov-mcp-server && npm ci && npm run build

# Pre-warm HF model cache so first request is faster (optional; ~28 GB).
# Comment out if Space build time becomes a problem; ZeroGPU caches across runs.
# RUN python -c "from huggingface_hub import snapshot_download; \
#     snapshot_download('Qwen/Qwen3-14B')"

ENV PYTHONPATH=/app \
    STREAMLIT_SERVER_PORT=7860 \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_SERVER_HEADLESS=true

EXPOSE 7860
CMD ["streamlit", "run", "app.py"]
