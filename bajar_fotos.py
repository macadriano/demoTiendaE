import os
import json
import re
import requests
from urllib.parse import urljoin

BASE_URL = "https://www.electrotecno.ar/"   # importante el slash final
JSON_IN = "productos.json"
OUT_DIR = "fotos"

def safe_filename(name: str) -> str:
    # Limpia caracteres raros para Windows
    name = name.strip()
    name = re.sub(r'[<>:"/\\|?*]+', "_", name)
    name = re.sub(r"\s+", " ", name)
    return name

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(JSON_IN, "r", encoding="utf-8") as f:
        productos = json.load(f)

    headers = {"User-Agent": "Mozilla/5.0"}
    ok, fail, skip = 0, 0, 0

    with requests.Session() as s:
        for p in productos:
            img_rel = p.get("imagen")
            if not img_rel:
                skip += 1
                continue

            img_url = urljoin(BASE_URL, img_rel)

            codigo = p.get("codigo") or "SIN-CODIGO"
            # Si no tiene extensión, igual intentamos .jpg
            ext = os.path.splitext(img_rel)[1] or ".jpg"
            filename = safe_filename(f"{codigo}{ext}")
            path = os.path.join(OUT_DIR, filename)

            if os.path.exists(path) and os.path.getsize(path) > 0:
                skip += 1
                continue

            try:
                r = s.get(img_url, headers=headers, timeout=30)
                if r.status_code != 200 or not r.content:
                    print(f"FAIL {r.status_code} -> {img_url}")
                    fail += 1
                    continue

                with open(path, "wb") as out:
                    out.write(r.content)

                ok += 1
                print(f"OK -> {path}")
            except Exception as e:
                print(f"ERROR -> {img_url}: {e}")
                fail += 1

    print(f"\nDescarga terminada. OK={ok} FAIL={fail} SKIP={skip}")

if __name__ == "__main__":
    main()
