import os
import sys
from huggingface_hub import hf_hub_download

# Leer el token de las variables de entorno de Render
HF_TOKEN = os.getenv("HF_TOKEN", None)

# Definir las rutas donde tu API espera encontrar los modelos
MODELS_DIR = os.path.join("mini-services", "manga-api", "models")

# NOTA: Asegúrate de que los repo_id y filenames coincidan EXACTAMENTE 
# con repositorios reales y existentes en el Hugging Face Hub.
models_to_download = [
    {
        "repo_id": "mantis-vl/comictextdetector", 
        "filename": "comictextdetector.pt",
        "subfolder": "detection"
    },
    {
        "repo_id": "mantis-vl/comictextdetector",
        "filename": "comictextdetector.pt.onnx",
        "subfolder": "detection"
    },
    {
        "repo_id": "advimman/lama",
        "filename": "lama_large_512px.ckpt",
        "subfolder": "inpainting"
    },
    {
        "repo_id": "advimman/lama",
        "filename": "inpainting_lama_mpe.ckpt",
        "subfolder": "inpainting"
    },
    {
        "repo_id": "facebook/m2m100_418m",
        "filename": "model.bin",
        "subfolder": "translators/m2m_100/m2m100_418m"
    }
]

print("Iniciando descarga de modelos desde Hugging Face Hub...")

for model in models_to_download:
    target_dir = os.path.join(MODELS_DIR, model["subfolder"])
    os.makedirs(target_dir, exist_ok=True)
    
    target_path = os.path.join(target_dir, model["filename"])
    
    if not os.path.exists(target_path):
        print(f"Descargando {model['filename']} desde {model['repo_id']}...")
        try:
            # Añadimos el token para evitar errores de restricción (401 / 403)
            downloaded_path = hf_hub_download(
                repo_id=model["repo_id"],
                filename=model["filename"],
                token=HF_TOKEN
            )
            # Mover el archivo descargado a la estructura que espera tu API
            os.replace(downloaded_path, target_path)
            print(f"-> {model['filename']} guardado con éxito.")
        except Exception as e:
            print(f"\n[ERROR CRÍTICO] Falló la descarga de {model['filename']}: {e}")
            print("Verifica que el repo_id y el nombre del archivo sean correctos públicos/privados.")
            sys.exit(1) # Forzar la salida con error para avisar a Docker
    else:
        print(f"{model['filename']} ya existe en el directorio local.")

print("¡Todos los modelos fueron descargados correctamente!")