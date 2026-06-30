import os
import sys
import traceback
from huggingface_hub import hf_hub_download

# Render pasará este token de forma automática
HF_TOKEN = os.getenv("HF_TOKEN", None)
MODELS_DIR = os.path.join("mini-services", "manga-api", "models")

# Apuntamos DIRECTAMENTE a tu repositorio donde ya subiste todo con 'hf sync'
models_to_download = [
    {
        "repo_id": "acsaco/MangaLingo", 
        "filename": "mini-services/manga-api/models/detection/comictextdetector.pt",
        "subfolder": "detection",
        "local_name": "comictextdetector.pt"
    },
    {
        "repo_id": "acsaco/MangaLingo",
        "filename": "mini-services/manga-api/models/detection/comictextdetector.pt.onnx",
        "subfolder": "detection",
        "local_name": "comictextdetector.pt.onnx"
    },
    {
        "repo_id": "acsaco/MangaLingo",
        "filename": "mini-services/manga-api/models/inpainting/lama_large_512px.ckpt",
        "subfolder": "inpainting",
        "local_name": "lama_large_512px.ckpt"
    },
    {
        "repo_id": "acsaco/MangaLingo",
        "filename": "mini-services/manga-api/models/inpainting/inpainting_lama_mpe.ckpt",
        "subfolder": "inpainting",
        "local_name": "inpainting_lama_mpe.ckpt"
    },
    {
        "repo_id": "acsaco/MangaLingo",
        "filename": "mini-services/manga-api/models/translators/m2m_100/m2m100_418m/model.bin",
        "subfolder": "translators/m2m_100/m2m100_418m",
        "local_name": "model.bin"
    }
]

print("Iniciando descarga de modelos desde tu repositorio de Hugging Face...", flush=True)

for model in models_to_download:
    target_dir = os.path.join(MODELS_DIR, model["subfolder"])
    os.makedirs(target_dir, exist_ok=True)
    
    target_path = os.path.join(target_dir, model["local_name"])
    
    if not os.path.exists(target_path):
        print(f"Descargando {model['local_name']} desde {model['repo_id']}...", flush=True)
        try:
            downloaded_path = hf_hub_download(
                repo_id=model["repo_id"],
                filename=model["filename"],
                repo_type="dataset",  # Los buckets se manejan como datasets en el SDK
                token=HF_TOKEN
            )
            os.replace(downloaded_path, target_path)
            print(f"-> {model['local_name']} guardado correctamente.", flush=True)
        except Exception as e:
            print("\n" + "="*50, flush=True)
            print(f"[ERROR CRÍTICO] Falló la descarga de: {model['local_name']}", flush=True)
            print(f"Detalle: {e}", flush=True)
            traceback.print_exc()
            print("="*50 + "\n", flush=True)
            sys.exit(1)
    else:
        print(f"{model['local_name']} ya existe localmente.", flush=True)

print("¡Todos los modelos clonados con éxito!", flush=True)