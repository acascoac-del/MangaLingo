import os
import sys
import traceback
from huggingface_hub import hf_hub_download

HF_TOKEN = os.getenv("HF_TOKEN", None)
MODELS_DIR = os.path.join("mini-services", "manga-api", "models")

# Repositorios públicos de la comunidad que contienen estos pesos exactos:
models_to_download = [
    {
        "repo_id": "gndctrl/comic-text-detector",  # Repo público real para comictextdetector
        "filename": "comictextdetector.pt",
        "subfolder": "detection"
    },
    {
        "repo_id": "gndctrl/comic-text-detector",
        "filename": "comictextdetector.pt.onnx",
        "subfolder": "detection"
    },
    {
        "repo_id": "Lykon/LaMa-Inpainting",         # Repo público real para LaMa
        "filename": "lama_large_512px.ckpt",
        "subfolder": "inpainting"
    },
    {
        "repo_id": "facebook/m2m100_418m",         # Repo oficial de Facebook
        "filename": "pytorch_model.bin",            # OJO: El archivo oficial se llama pytorch_model.bin, no model.bin
        "subfolder": "translators/m2m_100/m2m100_418m"
    }
]

print("Iniciando descarga de modelos desde Hugging Face Hub...", flush=True)

for model in models_to_download:
    target_dir = os.path.join(MODELS_DIR, model["subfolder"])
    os.makedirs(target_dir, exist_ok=True)
    
    # Si en tu código local esperas que se llame 'model.bin', lo renombramos localmente
    local_filename = "model.bin" if model["filename"] == "pytorch_model.bin" else model["filename"]
    target_path = os.path.join(target_dir, local_filename)
    
    if not os.path.exists(target_path):
        print(f"Descargando {model['filename']} desde {model['repo_id']}...", flush=True)
        try:
            downloaded_path = hf_hub_download(
                repo_id=model["repo_id"],
                filename=model["filename"],
                token=HF_TOKEN
            )
            os.replace(downloaded_path, target_path)
            print(f"-> {local_filename} guardado con éxito.", flush=True)
        except Exception as e:
            print("\n" + "="*50, flush=True)
            print(f"[ERROR CRÍTICO] Falló al descargar: {model['filename']}", flush=True)
            print(f"Detalle del error: {e}", flush=True)
            traceback.print_exc()
            print("="*50 + "\n", flush=True)
            sys.exit(1)
    else:
        print(f"{local_filename} ya existe en el directorio local.", flush=True)

print("¡Todos los modelos fueron procesados!", flush=True)