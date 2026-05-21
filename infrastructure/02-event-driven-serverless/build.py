#!/usr/bin/env python3
"""
Construye el paquete de deployment de Lambda con Pillow para Linux x86_64.

Uso:
    python build.py

Genera:
    lambda/package/   — directorio con handler.py + Pillow instalado
    (Terraform empaqueta este directorio como handler.zip)
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT         = Path(__file__).parent
LAMBDA_DIR   = ROOT / "lambda"
PACKAGE_DIR  = LAMBDA_DIR / "package"
HANDLER_SRC  = LAMBDA_DIR / "handler.py"
REQUIREMENTS = LAMBDA_DIR / "requirements.txt"


def build() -> None:
    print(f"[build] Limpiando {PACKAGE_DIR} ...")
    if PACKAGE_DIR.exists():
        shutil.rmtree(PACKAGE_DIR)
    PACKAGE_DIR.mkdir(parents=True)

    print("[build] Instalando dependencias para manylinux2014_x86_64 ...")
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install",
            "-r", str(REQUIREMENTS),
            "-t", str(PACKAGE_DIR),
            "--platform", "manylinux2014_x86_64",
            "--python-version", "3.12",
            "--only-binary", ":all:",
            "--upgrade",
            "--quiet",
        ],
        check=True,
    )

    print(f"[build] Copiando {HANDLER_SRC.name} ...")
    shutil.copy(HANDLER_SRC, PACKAGE_DIR / HANDLER_SRC.name)

    print(f"[build] Listo → {PACKAGE_DIR}")
    print("[build] Ahora ejecuta: terraform apply")


if __name__ == "__main__":
    build()
