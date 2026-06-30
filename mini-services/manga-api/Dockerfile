# ========================================================
# ARGUMENTO DE CONFIGURACIÓN
# Por defecto se compilará con CUDA (para tu PC). 
# Render sobreescribirá esto a "cpu" automáticamente.
# ========================================================
ARG TARGET_ENV=cuda

# --------------------------------------------------------
# CONDICIONAL DE IMAGEN BASE
# Usamos Ubuntu con CUDA si es local, o Slim si es CPU
# --------------------------------------------------------
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS base-cuda
RUN apt-get update && apt-get install -y --no-install-recommends python3.11 python3-pip python3.11-dev python3.11-venv && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && ln -sf /usr/bin/python3.11 /usr/bin/python

FROM python:3.11-slim-bookworm AS base-cpu

# Selecciona la base final según el argumento
FROM base-${TARGET_ENV} AS final

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# Instalar dependencias del sistema comunes
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates libgl1 libglib2.0-0 libsm6 libxext6 \
    libxrender-dev libfreetype6 libfreetype6-dev libpng-dev libssl-dev libffi-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --upgrade pip setuptools wheel

WORKDIR /app
COPY requirements.txt .

# --------------------------------------------------------
# INSTALACIÓN INTELIGENTE DE PYTORCH
# Se vuelve a evaluar el argumento para saber qué descargar
# --------------------------------------------------------
ARG TARGET_ENV
RUN if [ "$TARGET_ENV" = "cuda" ] ; then \
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 ; \
    else \
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu ; \
    fi

# Capas estándar de la API (Compatibles con ambos entornos)
RUN pip install transformers huggingface_hub accelerate safetensors sentencepiece protobuf tiktoken
RUN pip install manga-ocr
RUN pip install opencv-python-headless pillow scikit-image scipy shapely pyclipper freetype-py ImageHash
RUN pip install kornia einops timm open_clip_torch onnxruntime omegaconf
RUN pip install py3langid==0.2.2 langdetect "langcodes[data]" python-bidi arabic-reshaper regex editdistance pyhyphen
RUN pip install requests httpx==0.27.2 aiohttp aioshutil aiofiles websockets
RUN pip install "numpy==1.26.4" pandas networkx
RUN pip install fastapi uvicorn python-multipart starlette marshmallow
RUN pip install deepl openai==1.63.0 groq google-genai || true
RUN pip install python-dotenv loguru rich psutil packaging colorama

COPY . .
RUN python3 patch_optional_imports.py

RUN mkdir -p /app/mini-services/manga-api/models /app/fonts
ENV HF_HOME=/app/mini-services/manga-api/models/hf-cache
ENV TRANSFORMERS_CACHE=/app/mini-services/manga-api/models/hf-cache

# Descarga automática de modelos durante el build
RUN python3 download_models.py

# Exponer el puerto por defecto de Render (10000)
EXPOSE 10000

# Comando por defecto adaptado para escuchar de forma dinámica
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]