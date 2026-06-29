# MangaLingo — Proyecto completo

Pipeline de traducción de manga end-to-end en un solo request: **detección de globos + OCR + inpainting + traducción multilenguaje + renderizado final**. Incluye API propia, demo web pública y extensión Chrome Manifest V3.

Powered by [MangaLingo engine](https://github.com/zyddnys/MangaLingo).

---

## Opciones de Instalación

Puedes levantar el servidor de MangaLingo de dos maneras principales: mediante **Docker (Recomendado)** o mediante **PowerShell/Bash (Manual)**. 
Además, puedes alojar el servidor en **Hugging Face Spaces** y conectarte a él desde la extensión de Chrome.

### Opción 1: Docker (Recomendado)

Esta es la forma más fácil y rápida de instalar MangaLingo. Contiene todo lo necesario y no requiere instalar Python ni Node.js manualmente.

> ⚠️ **Requisitos previos**:
> - **Docker Desktop** (en Windows/Mac) o Docker Engine (en Linux).

1. Abre una terminal (PowerShell o Bash) en la carpeta del proyecto.
2. Construye y levanta los contenedores:
```bash
docker compose build
docker compose up -d
```
3. ¡Listo! 
   - El frontend estará disponible en `http://localhost:3000`
   - La API del traductor estará disponible en `http://localhost:8000`

Para detener el servidor, ejecuta: `docker compose down`

---

### Opción 2: Instalación Manual (PowerShell / Bash)

> ⚠️ **Requisitos previos**:
> - **Python 3.10+** (recomendado 3.11 o 3.12).
> - **Node.js 20+** y **Bun** (`npm install -g bun`).

#### 1. Backend Python (manga-api)

**Windows (PowerShell):**
```powershell
cd mini-services\manga-api

# Crear y activar entorno virtual
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# (Si da error de ejecución: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned)

# Actualizar pip e instalar dependencias ML
python -m pip install --upgrade pip
pip install -r requirements.txt

# Iniciar el servicio (puerto 8000)
python main.py
```

**Linux / macOS (Bash):**
```bash
cd mini-services/manga-api
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

> En el primer request, el pipeline descargará automáticamente los modelos base (~1.1 GB).

#### 2. Frontend Next.js

Abre otra terminal en la raíz del proyecto:
```bash
bun install
bun run dev    # Estará en http://localhost:3000
```

---

## 🚀 Despliegue en Hugging Face Spaces (https://huggingface.co/spaces/acsaco)

Dado que este proyecto está "dockerizado" (`Dockerfile` incluido), está perfectamente listo para subirse a Hugging Face Spaces como un **Docker Space**.

### ¿Cómo usar la extensión con Hugging Face?
Una vez que hayas desplegado tu servidor en Hugging Face, puedes usar la extensión de Chrome de MangaLingo para traducir cualquier manga apuntando a tu servidor en la nube en lugar de tu PC local. ¡Esto te permite usar la extensión sin tener que prender el servidor local!

1. Instala la extensión de Chrome (instrucciones abajo).
2. Haz clic en el ícono de la extensión de MangaLingo para abrir el menú (Popup).
3. Ve a la pestaña **Ajustes** (ícono de engranaje ⚙️).
4. En el campo **API base**, borra `http://localhost:3000` y escribe la URL de tu espacio de Hugging Face.
   - *Ejemplo:* `https://acsaco-manga-translator.hf.space`
5. ¡Guarda los ajustes! Ahora la extensión enviará las traducciones a tu servidor en Hugging Face.

---

## 🧩 Instalación de la Extensión Chrome

1. **Ya viene pre-empaquetada** en `public/mangalingo-extension.zip` — no necesitas empaquetarla tú.
2. Descomprime ese ZIP en una carpeta permanente (por ejemplo `C:\manga-extension`).
3. Abre Chrome y entra a `chrome://extensions`.
4. Activa **Modo desarrollador** (arriba a la derecha).
5. Click en **Cargar descomprimida** → selecciona la carpeta donde descomprimiste.
6. ¡Listo! Click derecho sobre cualquier imagen → "Traducir manga".

---

## 🛠️ Pipeline en producción

| Setting | Valor recomendado |
|---|---|
| Detector | `ctd` |
| OCR | `manga_ocr` |
| Translator | `xiaomi` (MiMo) o `groq` |
| Inpainter | `lama_large` |
| Renderer | `manga2eng_pillow` (soluciona colisiones) |

En GPU (NVIDIA con CUDA), el pipeline completo tarda ~3-5s por imagen. En CPU, tarda ~15-30s por imagen.

---

## Licencia

El código de MangaLingo engine está bajo la licencia MIT. El resto del proyecto (frontend, extensión, wrapper API) es código abierto.
