"""Parcha los __init__.py de manga_translator para hacer imports opcionales.
Esto evita que el backend crashee si un paquete (ctranslate2, pydensecrf, etc.)
no está instalado.
"""
import re
import sys

# Lista de imports que pueden fallar
OPTIONAL_IMPORTS = {
    'translators/__init__.py': {
        'sakura': ['SakuraTranslator'],
    },
}

for rel_path, modules in OPTIONAL_IMPORTS.items():
    try:
        with open(rel_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"  SKIP: {rel_path} no encontrado")
        continue

    original = content
    for module, classes in modules.items():
        # Buscar: from .sugoi import JparacrawlTranslator, JparacrawlBigTranslator, SugoiTranslator
        pattern = rf'^from \.{module} import ({", ".join(classes)})$'
        match = re.search(pattern, content, re.MULTILINE)
        if match:
            old = match.group(0)
            new = f"try:\n    {old}\nexcept ImportError:\n    pass  # {module} opcional"
            content = content.replace(old, new)
            print(f"  OK: {rel_path} -> {module} envuelto en try/except")

    if content != original:
        with open(rel_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  Guardado: {rel_path}")
    else:
        print(f"  Sin cambios: {rel_path}")

print("Parche aplicado correctamente.")
