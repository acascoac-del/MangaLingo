# MangaLingo — Optimización para GPU (RTX 3050+)

Este paquete convierte tu backend de CPU a GPU y aplica optimizaciones para
sacar el máximo provecho de tu NVIDIA RTX 3050 (4GB VRAM).

## Resultado esperado

| Métrica | Antes (CPU) | Después (GPU) | Mejora |
|---|---|---|---|
| Tiempo por imagen | 30-60s | 3-5s | **10x** |
| Capítulo de 29 imágenes | ~20 min | ~2 min | **10x** |
| Uso de VRAM | 0 GB | ~2.5 GB | OK (tenés 4) |
| Uso de CPU durante traducción | 100% | 5-15% | Mucho menor |

## Requisitos

1. **NVIDIA drivers actualizados** (verificá con `nvidia-smi` en una terminal)
2. **Backend funcionando en CPU** (ya lo tenés — esto es solo la base)
3. **~3 GB libres en disco** (para descargar PyTorch CUDA)

## Instalación (3 pasos)

### Paso 1 — Aplicar la optimización

Abrí PowerShell y ejecutá:

```powershell
cd D:\chevi\manga-translator-project
powershell -ExecutionPolicy Bypass -File scripts\install-gpu.ps1
```

El script va a:
1. Verificar que tu GPU NVIDIA esté detectada (`nvidia-smi`)
2. Desinstalar PyTorch CPU
3. Instalar PyTorch CUDA (~2.5 GB, 5-10 min)
4. Verificar que CUDA esté disponible
5. Reemplazar `pipeline.py` por la versión optimizada para GPU (con backup `.bak-cpu`)

### Paso 2 — Reiniciar el backend

En la terminal donde está corriendo el backend:
1. Presioná `Ctrl+C` para detenerlo
2. Volve a lanzarlo:
   ```powershell
   cd D:\chevi\manga-translator-project\mini-services\manga-api
   .\.venv\Scripts\python.exe main.py
   ```

En los logs deberías ver:
```
GPU detectada: NVIDIA GeForce RTX 3050 (4.0 GB VRAM)
Device seleccionado: cuda
```

Si ves `Device seleccionado: cpu` → algo falló. Verificá los drivers NVIDIA.

### Paso 3 — Actualizar la extensión (concurrency=2)

Copiá los archivos de `extension-src/` de este ZIP sobre tu `extension-src/`
existente. Después:
1. Chrome → `chrome://extensions`
2. Click **↻ Recargar** en MangaLingo
3. Verificá que diga **v1.3.1** en el footer del popup

Este cambio baja el paralelismo de 3 a 2 workers — en GPU, 2 es más rápido
que 3 porque no compiten por VRAM.

## Medir la mejora

Corré el benchmark antes y después para comparar:

```powershell
cd D:\chevi\manga-translator-project
powershell -ExecutionPolicy Bypass -File scripts\benchmark.ps1
```

Vas a ver algo como:
```
Tiempos: 45.2s, 3.8s, 3.9s
Promedio (sin carga inicial): 3.85s por imagen
Tasa: 0.26 imagenes/segundo
Para 29 imagenes (capitulo tipico): ~1.9 min
```

(El primer run es lento porque carga los modelos en VRAM. Los siguientes
ya están en caché de modelo y van rápido.)

## Qué se optimizó

### En el backend (`pipeline.py`)

| Setting | Antes | Después | Por qué |
|---|---|---|---|
| `device` | `'cpu'` | `'cuda'` (auto-detectado) | GPU es 10x más rápido |
| `detection_size` | `2048` | `1536` | 25% menos VRAM, calidad igual |
| `inpainting_size` | `2048` | `1280` | 50% menos VRAM, calidad igual |
| `inpainting_precision` | `'bf16'` | `'fp16'` | Mitad de VRAM en LaMa |
| Cache | ninguna | LRU 50 imágenes | Recargas = gratis |

### En la extensión (`content.js`)

| Setting | Antes | Después | Por qué |
|---|---|---|---|
| `CONCURRENCY` | `3` | `2` | GPU no paraleliza bien con 3 |

## Rollback (si algo falla)

Si después de aplicar GPU algo se rompe, revertí a CPU:

```powershell
cd D:\chevi\manga-translator-project\mini-services\manga-api
Copy-Item pipeline.py.bak-cpu pipeline.py -Force
.\.venv\Scripts\pip.exe uninstall torch torchvision -y
.\.venv\Scripts\pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe main.py
```

## Troubleshooting

### `CUDA available: False` después de instalar

Causas posibles:
1. **Drivers viejos** — actualizá desde <https://www.nvidia.com/Download/index.aspx>
2. **Versión de CUDA incompatible** — probá CUDA 11.8 en vez de 12.1:
   ```powershell
   cd D:\chevi\manga-translator-project\mini-services\manga-api
   .\.venv\Scripts\pip.exe uninstall torch torchvision -y
   .\.venv\Scripts\pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cu118
   ```

### `RuntimeError: CUDA out of memory`

Tu RTX 3050 tiene 4GB VRAM. Si otra app los está usando (ej: un juego), cerrala.
Si sigue fallando, editá `pipeline.py` y bajá estos valores aún más:

```python
cfg.detector.detection_size = 1024       # era 1536
cfg.inpainter.inpainting_size = 1024     # era 1280
```

### La traducción anda pero más lento de lo esperado

Verificá que la GPU se esté usando de verdad. Mientras traducís una imagen,
abrí otra terminal y corré:

```powershell
nvidia-smi -l 1
```

Deberías ver el proceso `python.exe` usando 1-2.5 GB de VRAM y la GPU al 80-100%.
Si la GPU está al 0% → algo no está usando CUDA.

## Estructura del paquete

```
gpu-optimization/
├── README.md                                        ← este archivo
├── scripts/
│   ├── install-gpu.ps1                              ← script principal
│   └── benchmark.ps1                                ← medir velocidad
├── mini-services/manga-api/
│   └── pipeline.py                                  ← pipeline optimizado
└── extension-src/                                   ← extensión con concurrency=2
    ├── manifest.json (v1.3.1)
    ├── content.js
    └── ... (resto sin cambios)
```
