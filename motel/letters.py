"""Génération de l'objet et du corps du mail à partir de templates/lettre.txt."""
import hashlib
import re
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "templates" / "lettre.txt"
ORDER = ["ouverture", "parcours", "hotellerie", "segment", "langues", "conclusion", "politesse"]
FIELD_RE = re.compile(r"\{(\w+)\}")


def load_template(path=TEMPLATE):
    sections, current, buf = {}, None, []

    def flush():
        if current is not None:
            text = "\n".join(buf).strip("\n")
            sections[current] = [v.strip("\n") for v in re.split(r"^--\s*$", text, flags=re.M) if v.strip()]

    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        m = re.match(r"^\[([\w:]+)\]\s*$", line)
        if m:
            flush()
            current, buf = m.group(1), []
        else:
            buf.append(line)
    flush()
    return sections


def de_hotel(nom):
    """'Hôtel du Parc' -> "de l'Hôtel du Parc", 'Le Grand Hôtel' -> 'du Grand Hôtel', 'Mercure Lyon' -> "de l'hôtel Mercure Lyon"."""
    n = nom.strip()
    low = n.lower()
    if re.match(r"^l['’]", low):
        return "de " + n
    if re.match(r"^(h[oô]tel|auberge|appart|aparth[oô]tel)", low):
        return "de l'" + n
    if low.startswith("le "):
        return "du " + n[3:]
    if low.startswith("les "):
        return "des " + n[4:]
    if low.startswith("la "):
        return "de la " + n[3:]
    return "de l'hôtel " + n


def fields(hotel, candidat):
    nom = hotel["nom"].strip()
    ville = (hotel.get("ville") or "").strip()
    de = de_hotel(nom)
    return {
        "hotel": nom,
        "de_hotel": de,
        "au_sein_de": "au sein " + de,
        "ville": ville,
        "a_ville": f" à {ville}" if ville and ville.lower() not in nom.lower() else "",
        "chambres": str(hotel["chambres"]) if hotel.get("chambres") else "",
        "etoiles": str(hotel["etoiles"]) if hotel.get("etoiles") else "",
        "marque": hotel.get("marque") or "",
        "prenom": candidat.get("prenom", ""),
        "nom": candidat.get("nom", ""),
        "telephone": candidat.get("telephone", ""),
        "email": candidat.get("email", ""),
    }


# Champs optionnels : une variante qui en a besoin est écartée s'ils sont vides
OPTIONAL = {"chambres", "etoiles", "marque", "ville"}


def _pick(variants, f, seed):
    usable = [v for v in variants
              if all(f.get(k) for k in FIELD_RE.findall(v) if k in OPTIONAL)]
    if not usable:
        return None
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return usable[h % len(usable)].format(**f)


def build(hotel, candidat, sections=None):
    """Retourne (objet, corps) pour un hôtel."""
    sections = sections or load_template()
    f = fields(hotel, candidat)
    seg = hotel.get("segment") or "independant"
    seed = hotel["nom"].lower()
    paras = []
    for key in ORDER:
        if key == "segment":
            key = f"segment:{seg}"
        if key == "langues" and seg == "luxe":
            continue
        text = _pick(sections.get(key, []), f, seed + key)
        if text and key == "langues" and paras:
            paras[-1] += " " + text  # une phrase, collée au paragraphe précédent
        elif text:
            paras.append(text)
    objet = _pick(sections["objet"], f, seed + "objet")
    signature = _pick(sections["signature"], f, seed)
    corps = "Madame, Monsieur,\n\n" + "\n\n".join(paras) + "\n\n" + signature
    return objet, corps


def cv_filename(hotel_nom, candidat, ext=".pdf"):
    clean = re.sub(r'[<>:"/\\|?*\n\r\t]+', " ", hotel_nom).strip()
    clean = re.sub(r"\s+", " ", clean)
    return f"CV {candidat.get('prenom', '')} {candidat.get('nom', '')} {clean}{ext}".replace("  ", " ")
