# Dockerfile para MangaLingo API con soporte GPU NVIDIA CUDA
# Optimizado para RTX 3050 (4GB VRAM) pero funciona con cualquier GPU CUDA

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

# Evitar prompts interactivos
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# Instalar Python 3.11 + deps del sistema (OpenCV, freetype, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip \
    python3.11-dev \
    git \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libfreetype6 \
    libfreetype6-dev \
    libpng-dev \
    libssl-dev \
    libffi-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Upgrade pip
RUN python3 -m pip install --upgrade pip setuptools wheel

# Directorio de trabajo
WORKDIR /app

# Copiar requirements primero (mejor caching de capas Docker)
COPY requirements.txt .

# ============================================
# INSTALACIÓN POR CAPAS — si una falla, las otras continúan
# ============================================

# Capa 1: PyTorch CUDA (lo más importante, ~2.5 GB)
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

# Capa 2: transformers + huggingface (requerido por manga_ocr, detección, etc.)
RUN pip install transformers huggingface_hub accelerate safetensors \
    sentencepiece protobuf tiktoken
RUN pip install transformers huggingface_hub accelerate safetensors \
    sentencepiece protobuf tiktoken

# Capa 4: manga-ocr (el OCR principal)
RUN pip install manga-ocr

# Capa 5: CV / image processing
RUN pip install opencv-python-headless pillow scikit-image scipy \
    shapely pyclipper freetype-py ImageHash

# Capa 6: ML extras
RUN pip install kornia einops timm open_clip_torch onnxruntime omegaconf

# Capa 7: Idiomas / text utils
RUN pip install py3langid==0.2.2 langdetect "langcodes[data]" \
    python-bidi arabic-reshaper regex editdistance pyhyphen

# Capa 8: Network / async
RUN pip install requests httpx==0.27.2 aiohttp aioshutil aiofiles \
    websockets

# Capa 9: Data
RUN pip install "numpy==1.26.4" pandas networkx

# Capa 10: API server
RUN pip install fastapi uvicorn python-multipart starlette marshmallow

# Capa 11: Translators con API keys (opcionales, no fallan el build si fallan)
RUN pip install deepl openai==1.63.0 groq google-genai || true

# Capa 12: Utils
RUN pip install python-dotenv loguru rich psutil packaging colorama \
    marshmallow

# Capa 13: requirements.txt por si quedó algo (no falla el build)
RUN pip install -r requirements.txt || true

# Copiar el código del proyecto
COPY . .

# Parchar imports opcionales en manga_translator para que el backend no crashee
# si un paquete (ctranslate2, pydensecrf, etc.) no está instalado
RUN python3 patch_optional_imports.py

# Crear directorio para modelos (se montará como volume)
RUN mkdir -p /app/models /app/fonts

# Variables de entorno para HuggingFace cache
ENV HF_HOME=/app/models/hf-cache
ENV TRANSFORMERS_CACHE=/app/models/hf-cache

# Exponer puerto
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Comando por defecto
CMD ["python3", "-u", "main.py"]
