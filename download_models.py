import os
from huggingface_hub import hf_hub_download

# Definir las rutas donde tu API espera encontrar los modelos
MODELS_DIR = os.path.join("mini-services", "manga-api", "models")

models_to_download = [
    {
        "repo_id": "mantis-vl/comictextdetector", # Cambiar por el repo real correspondiente
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
        print(f"Descargando {model['filename']}...")
        downloaded_path = hf_hub_download(
            repo_id=model["repo_id"],
            filename=model["filename"]
        )
        # Mover el archivo descargado a la estructura que espera tu API
        os.replace(downloaded_path, target_path)
    else:
        print(f"{model['filename']} ya existe en el directorio local.")

print("¡Todos los modelos fueron descargados correctamente!")