# Instalación en Windows

Existen dos formas de instalar y correr MangaLingo en Windows: usando **Docker** (recomendado, más rápido y menos propenso a errores) o de forma **Manual** usando PowerShell.

---

## Opción 1: Usando Docker (Recomendado)

### Requisitos previos
1. Tener instalado [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/).
2. Abrir Docker Desktop y asegurarse de que el motor de Docker esté corriendo.

### Pasos
1. Abre una terminal (PowerShell o CMD) en la carpeta del proyecto `D:\chevi\manga-translator-project`.
2. Ejecuta el siguiente comando para construir y levantar los contenedores:
   ```powershell
   docker compose build
   docker compose up -d
   ```
3. ¡Listo! 
   - El frontend estará disponible en `http://localhost:3000`
   - La API del backend estará disponible en `http://localhost:8000`

Para ver los logs (por si algo falla), puedes usar `docker compose logs -f`.
Para detener el servidor, usa `docker compose down`.

---

## Opción 2: Instalación Manual (PowerShell)

Si prefieres no usar Docker, puedes levantar los servicios manualmente.

### Requisitos previos

1. **Python 3.10, 3.11 o 3.12** — descarga de <https://www.python.org/downloads/>
   - Durante la instalación, marca "Add Python to PATH".
   - Verifica: abre PowerShell y ejecuta `python --version`

2. **Node.js 20+** y **Bun**:
   - Instala Node.js desde <https://nodejs.org/>
   - Luego instala Bun: `npm install -g bun`
   - Verifica: `bun --version`

3. **~5 GB libres en disco** (para los pesos de modelos ML que se descargan automáticamente).

4. **Permisos de ejecución de scripts** en PowerShell (solo la primera vez):
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

### Pasos

#### Paso 1: Levanta el backend Python (manga-api)

Abre una terminal PowerShell en la raíz del proyecto y ejecuta:

```powershell
cd mini-services\manga-api

# Crear entorno virtual
python -m venv .venv

# Activar entorno virtual
.\.venv\Scripts\Activate.ps1

# Actualizar pip
python -m pip install --upgrade pip

# Instalar dependencias ML (esto tardará un rato y descargará ~3 GB)
pip install -r requirements.txt

# Iniciar el servicio (puerto 8000)
python main.py
```

Cuando veas `Uvicorn running on http://0.0.0.0:8000`, el backend estará listo. **Deja esta terminal abierta.**

#### Paso 2: Levanta el frontend Next.js

**Abre una NUEVA terminal PowerShell** (no cierres la del backend):

```powershell
# En la raíz del proyecto
bun install
bun run dev
```

Cuando diga `Ready in ... http://localhost:3000`, abre <http://localhost:3000> en tu navegador.

---

## Instalación de la Extensión Chrome

1. La extensión ya viene empaquetada en el archivo `public\mangalingo-extension.zip`.
2. Descomprímela en una carpeta permanente (por ejemplo `C:\manga-extension`).
3. Abre Chrome y ve a la dirección `chrome://extensions`.
4. Activa el **Modo desarrollador** (arriba a la derecha).
5. Haz clic en **Cargar descomprimida** y selecciona la carpeta donde la descomprimiste.
6. ¡Listo! Haz click derecho sobre cualquier imagen en cualquier web y selecciona **Traducir manga**.

> **Uso con Hugging Face Spaces**:
> Si vas a subir este proyecto a Hugging Face (por ejemplo a `https://acsaco-manga-translator.hf.space`), puedes hacer que la extensión lo utilice como motor remoto.
> Simplemente pulsa el icono de la extensión en Chrome, ve a la pestaña **Ajustes** ⚙️ y cambia la **API base** a la URL de tu espacio en Hugging Face.
