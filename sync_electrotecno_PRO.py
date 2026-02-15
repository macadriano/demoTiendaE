import os
import re
import json
import hashlib
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

HOME_URL = "https://www.electrotecno.ar/"
LOGIN_URL = "https://www.electrotecno.ar/index.php"
CATALOGO_URL = "https://www.electrotecno.ar/catalogo2022x3.php"

OUT_JSON = "productos.json"
OUT_JSON_PREV = "productos_prev.json"
OUT_IMG_DIR = "fotos"

FOTO_PREFIX = "ET_"   # prefijo PRO

# ---------------- UTIL ---------------- #

def safe_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]+', "_", name)
    name = re.sub(r"\s+", "_", name)
    return name.strip()

def hash_text(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()

def parse_price(text: str | None):
    if not text:
        return None

    # Busca un "bloque" numérico: 1.550.000 / 13,300 / 1550000 etc.
    m = re.search(r"(\d[\d\.\,]*)", text)
    if not m:
        return None

    raw = m.group(1)

    # Para ARS, quedate solo con dígitos (miles con . o , da igual)
    digits = re.sub(r"\D", "", raw)
    return int(digits) if digits else None


# ---------------- LOGIN ---------------- #

def login(session, clave):
    session.get(HOME_URL)
    files = {
        "clave": (None, clave),
        "enviar": (None, "Ingresar"),
    }
    r = session.post(LOGIN_URL, files=files, allow_redirects=False)
    if r.status_code not in (301, 302, 303):
        raise RuntimeError("Login falló")

# ---------------- FETCH ---------------- #

def fetch_catalog(session):
    r = session.get(CATALOGO_URL)
    if "No ingreso clave" in r.text:
        raise RuntimeError("No autenticado")
    return r.text

# ---------------- PARSE ---------------- #

def extract_products(html):
    soup = BeautifulSoup(html, "lxml")
    productos = []

    for box in soup.select("div.caja_producto"):
        nombre_el = box.select_one("h1")
        if not nombre_el:
            continue

        nombre = nombre_el.get_text(strip=True)
        codigo = None

        text = box.get_text("\n", strip=True)
        for line in text.split("\n"):
            if "Codigo:" in line or "Código:" in line:
                codigo = line.split(":")[-1].strip()

        precio_el = box.select_one("strong.caja_precio_noimptk")
        precio_texto = precio_el.get_text(strip=True) if precio_el else None
        precio_valor = parse_price(precio_texto)

        img_match = re.search(r"(fotos/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp))",
                              str(box), re.IGNORECASE)
        imagen_rel = img_match.group(1) if img_match else None

        productos.append({
            "codigo": codigo,
            "nombre": nombre,
            "precio": precio_valor,
            "imagen": imagen_rel
        })

    return productos

# ---------------- COMPARACIÓN PRO ---------------- #

def compare_products(new, old):
    old_dict = {p["codigo"]: p for p in old if p.get("codigo")}
    nuevos = []
    cambios_precio = []

    for p in new:
        codigo = p.get("codigo")
        if not codigo:
            continue

        if codigo not in old_dict:
            nuevos.append(p)
        else:
            if p["precio"] != old_dict[codigo].get("precio"):
                cambios_precio.append(p)

    return nuevos, cambios_precio

# ---------------- DESCARGA PRO ---------------- #

def download_images(session, productos):
    os.makedirs(OUT_IMG_DIR, exist_ok=True)

    ok = 0
    skip = 0

    for p in productos:
        if not p.get("imagen"):
            skip += 1
            continue

        url = urljoin(HOME_URL, p["imagen"])
        ext = os.path.splitext(p["imagen"])[1]
        filename = safe_filename(FOTO_PREFIX + (p["codigo"] or p["nombre"])) + ext
        path = os.path.join(OUT_IMG_DIR, filename)

        if os.path.exists(path):
            skip += 1
            continue

        r = session.get(url)
        if r.status_code == 200:
            with open(path, "wb") as f:
                f.write(r.content)
            ok += 1

    print(f"IMÁGENES NUEVAS: OK={ok} SKIP_EXISTENTES={skip}")

# ---------------- MAIN ---------------- #

def main():
    clave = os.environ.get("ELECTROTECNO_CLAVE")
    if not clave:
        raise SystemExit("set ELECTROTECNO_CLAVE=ele24")

    with requests.Session() as s:
        print("Login...")
        login(s, clave)

        print("Bajando catálogo...")
        html = fetch_catalog(s)

        print("Parseando...")
        productos = extract_products(html)
        print("Productos:", len(productos))

        # cargar anterior si existe
        old = []
        if os.path.exists(OUT_JSON_PREV):
            with open(OUT_JSON_PREV, "r", encoding="utf-8") as f:
                old = json.load(f)

        nuevos, cambios = compare_products(productos, old)

        print("Productos nuevos:", len(nuevos))
        print("Productos con cambio de precio:", len(cambios))

        # guardar actual
        with open(OUT_JSON, "w", encoding="utf-8") as f:
            json.dump(productos, f, indent=2, ensure_ascii=False)

        # mover a prev
        if os.path.exists(OUT_JSON):
            with open(OUT_JSON_PREV, "w", encoding="utf-8") as f:
                json.dump(productos, f, indent=2, ensure_ascii=False)

        print("Descargando imágenes nuevas...")
        download_images(s, nuevos)

    print("SYNC PRO COMPLETO ✅")

if __name__ == "__main__":
    main()
