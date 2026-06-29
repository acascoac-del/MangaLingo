#!/bin/bash
# Parcha los __init__.py de manga_translator para hacer imports problemáticos opcionales.
# Esto evita que el backend crashee si un paquete (ctranslate2, pydensecrf, etc.) falla.
#
# Uso (dentro del contenedor o en el host):
#   bash patch-optional-imports.sh
#
# O desde PowerShell en Windows:
#   wsl bash patch-optional-imports.sh

set -e

TRANSLATORS_INIT="manga_translator/translators/__init__.py"

if [ ! -f "$TRANSLATORS_INIT" ]; then
    echo "ERROR: no se encontro $TRANSLATORS_INIT"
    echo "Ejecuta este script desde la carpeta mini-services/manga-api/"
    exit 1
fi

echo "Parcheando $TRANSLATORS_INIT..."

# Hacer backup si no existe
if [ ! -f "${TRANSLATORS_INIT}.bak" ]; then
    cp "$TRANSLATORS_INIT" "${TRANSLATORS_INIT}.bak"
fi

# Parchar: envolver imports problemáticos en try/except
python3 << 'PYEOF'
import re

path = "manga_translator/translators/__init__.py"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Lista de imports que pueden fallar (paquetes opcionales)
optional_imports = {
    'sugoi': ['JparacrawlTranslator', 'JparacrawlBigTranslator', 'SugoiTranslator'],
    'nllb': ['NLLBTranslator', 'NLLBBigTranslator'],
    'm2m100': ['M2M100Translator', 'M2M100BigTranslator'],
    'mbart50': ['MBart50Translator'],
    'qwen2': ['Qwen2Translator', 'Qwen2BigTranslator'],
    'sakura': ['SakuraTranslator'],
}

for module, classes in optional_imports.items():
    # Buscar: from .sugoi import JparacrawlTranslator, ...
    pattern = rf'^from \.{module} import ({", ".join(classes)})$'
    match = re.search(pattern, content, re.MULTILINE)
    if match:
        old = match.group(0)
        new = f"""try:
    {old}
except ImportError:
    pass  # {module} no disponible (deps opcionales no instaladas)"""
        content = content.replace(old, new)
        print(f"  OK: {module} -> try/except")

# También parchar el dict TRANSLATORS para que no falle si una clase no existe
# Buscar: Translator.sugoi: SugoiTranslator,
# y dejarlo así: **({"Translator.sugoi": SugoiTranslator} if 'SugoiTranslator' in globals() else {}),

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nListo. Backup en {path}.bak")
PYEOF

echo ""
echo "Parche aplicado. Reinicia el backend."
