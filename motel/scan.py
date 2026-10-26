"""Recherche des hôtels (OpenStreetMap) puis des adresses e-mail sur leurs sites."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from . import emails as em

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OSM_UA = "motel-candidatures/1.0 (recherche d'emploi personnelle)"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# Pages où l'on trouve en général les bonnes adresses
LINK_HINTS = re.compile(
    r"contact|mention|legal|recrut|emploi|carriere|career|job|rejoindre|equipe|team|"
    r"about|a-propos|qui-sommes|notre-hotel|l-hotel|nous-trouver|acces|impressum",
    re.I,
)
COMMON_PATHS = ["/contact", "/mentions-legales", "/recrutement", "/fr/contact", "/nous-contacter"]
MAX_PAGES = 7

CHAINS = [
    "ibis", "mercure", "novotel", "sofitel", "pullman", "mgallery", "adagio", "aparthotel adagio",
    "campanile", "kyriad", "premiere classe", "première classe", "golden tulip", "tulip inn",
    "best western", "b&b hotel", "b&b hôtel", "holiday inn", "crowne plaza", "intercontinental",
    "hilton", "doubletree", "hampton", "marriott", "courtyard", "moxy", "ac hotel", "renaissance",
    "radisson", "park inn", "hyatt", "citadines", "okko", "hotelf1", "hôtel f1", "hotel f1",
    "appart'city", "appart city", "fasthotel", "brit hotel", "the originals", "zenitude",
    "odalys", "staycity", "jo&joe", "mama shelter", "greet", "hôtel ibis", "comfort hotel",
    "quality hotel", "clarion", "residence inn", "nemea", "séjours & affaires", "sejours & affaires",
]
CHAIN_DOMAINS = ["accor.com", "marriott.com", "hilton.com", "ihg.com", "bestwestern", "hotel-bb.com",
                 "choicehotels", "louvrehotels.com", "radissonhotels.com", "hyatt.com",
                 "citadines.com", "appartcity.com", "brithotel.fr", "fasthotel.com", "okkohotels.com"]


def _get(url, timeout=8, **kw):
    r = requests.get(url, timeout=timeout, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9"}, **kw)
    if "charset" not in r.headers.get("content-type", "").lower():
        r.encoding = r.apparent_encoding  # sinon les accents sont mal lus ("Ã©toiles")
    return r


# ---------------------------------------------------------------- OpenStreetMap

def geocode(ville):
    r = requests.get(NOMINATIM, params={"q": ville, "format": "json", "limit": 1, "countrycodes": "fr"},
                     headers={"User-Agent": OSM_UA}, timeout=15)
    r.raise_for_status()
    res = r.json()
    if not res:
        raise ValueError(f"Lieu introuvable : {ville}")
    return res[0]


def find_hotels(ville, limite=150):
    """Hôtels d'une ville / d'un arrondissement via Overpass."""
    place = geocode(ville)
    if place.get("osm_type") == "relation":
        zone = f"area({3600000000 + int(place['osm_id'])})->.a;"
        filtre = "(area.a)"
    else:
        s, n, w, e = place["boundingbox"]
        zone = ""
        filtre = f"({s},{w},{n},{e})"
    q = (f'[out:json][timeout:60];{zone}'
         f'(nwr["tourism"="hotel"]{filtre};nwr["tourism"="guest_house"]["website"]{filtre};);out center tags;')
    data = None
    for url in OVERPASS:
        try:
            r = requests.post(url, data={"data": q}, headers={"User-Agent": OSM_UA}, timeout=90)
            r.raise_for_status()
            data = r.json()
            break
        except Exception:
            continue
    if data is None:
        raise RuntimeError("OpenStreetMap (Overpass) ne répond pas, réessayez dans une minute.")

    hotels = []
    for el in data.get("elements", []):
        t = el.get("tags", {})
        name = t.get("name")
        if not name:
            continue
        website = t.get("website") or t.get("contact:website") or t.get("url") or ""
        email = t.get("email") or t.get("contact:email") or ""
        if not website and not email:
            continue
        hotels.append({
            "cle": f"osm:{el['type']}/{el['id']}",
            "nom": name.strip(),
            "ville": t.get("addr:city") or ville.split(",")[0].strip(),
            "adresse": " ".join(x for x in [t.get("addr:housenumber"), t.get("addr:street")] if x),
            "site": website.strip(),
            "etoiles": _int(t.get("stars")),
            "chambres": _int(t.get("rooms")),
            "marque": t.get("brand") or "",
            "emails_osm": [e.strip().lower() for e in re.split(r"[;,\s]+", email) if "@" in e],
        })
    return hotels[:limite]


def _int(v):
    m = re.search(r"\d+", str(v or ""))
    return int(m.group()) if m else None


# ---------------------------------------------------------------- sites web

def crawl_site(website):
    """Visite la page d'accueil + les pages contact / mentions / recrutement.
    Retourne (dict email -> page source, infos détectées)."""
    found, infos = {}, {"chambres": None, "etoiles": None}
    if not website:
        return found, infos
    if not website.startswith("http"):
        website = "http://" + website
    try:
        r = _get(website)
    except Exception:
        return found, infos
    base = r.url
    dom = em.site_domain(base)
    to_visit, seen = [], {base}
    _harvest(r.text, base, found)
    _infos(r.text, infos)

    soup = BeautifulSoup(r.text, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("mailto:"):
            continue
        url = urljoin(base, href).split("#")[0]
        if em.site_domain(url) != dom or url in seen:
            continue
        label = (a.get_text(" ", strip=True) + " " + href)
        if LINK_HINTS.search(label):
            seen.add(url)
            to_visit.append(url)
    for p in COMMON_PATHS:
        url = urljoin(base, p)
        if url not in seen:
            seen.add(url)
            to_visit.append(url)

    # pages recrutement / mentions d'abord, elles donnent les meilleures adresses
    to_visit.sort(key=lambda u: 0 if re.search(r"recrut|emploi|carri|job|mention|legal", u, re.I) else 1)
    for url in to_visit[:MAX_PAGES]:
        try:
            p = _get(url, timeout=6)
            if p.status_code == 200 and "html" in p.headers.get("content-type", "html"):
                _harvest(p.text, p.url, found)
                _infos(p.text, infos)
        except Exception:
            continue
    return found, infos


def _harvest(html, url, found):
    for e in em.extract_emails(html):
        found.setdefault(e, url)
        # une adresse vue sur une page recrutement / mentions garde cette source (plus de points)
        if re.search(r"recrut|emploi|carri|job|mention|legal", url, re.I):
            found[e] = url


def _infos(html, infos):
    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    if not infos["chambres"]:
        m = re.search(r"\b(\d{1,3})\s+(?:chambres|rooms|suites et chambres|chambres et suites)\b", text, re.I)
        if m and 2 <= int(m.group(1)) <= 900:
            infos["chambres"] = int(m.group(1))
    if not infos["etoiles"]:
        m = re.search(r"\b([1-5])\s*(?:étoiles|etoiles|\*|★)", text, re.I)
        if m:
            infos["etoiles"] = int(m.group(1))


# ---------------------------------------------------------------- segmentation

def detect_chain(hotel):
    if hotel.get("marque"):
        return hotel["marque"]
    name = hotel["nom"].lower()
    for c in CHAINS:
        if re.search(r"(^|\W)" + re.escape(c) + r"(\W|$)", name):
            return c.title().replace("B&B Hotel", "B&B Hotels").replace("Ibis", "ibis")
    site = (hotel.get("site") or "").lower()
    for d in CHAIN_DOMAINS:
        if d in site:
            return {"accor.com": "Accor", "marriott.com": "Marriott", "hilton.com": "Hilton",
                    "ihg.com": "IHG", "bestwestern": "Best Western", "hotel-bb.com": "B&B Hotels",
                    "choicehotels": "Choice Hotels", "louvrehotels.com": "Louvre Hotels",
                    "radissonhotels.com": "Radisson", "hyatt.com": "Hyatt"}.get(d, d.split(".")[0].title())
    return ""


def segment(hotel):
    """groupe | luxe | independant | intermediaire  (choisit le modèle de lettre)."""
    if (hotel.get("etoiles") or 0) >= 5:
        return "luxe"
    if hotel.get("marque"):
        return "groupe"
    ch = hotel.get("chambres")
    if ch and ch > 45:
        return "intermediaire"
    if (hotel.get("etoiles") or 0) == 4 and not ch:
        return "intermediaire"
    return "independant"


def enrich(hotel):
    """Crawl + classement des adresses + segmentation pour un hôtel."""
    found, infos = crawl_site(hotel.get("site"))
    for e in hotel.get("emails_osm", []):
        found.setdefault(e, "OpenStreetMap")
    hotel["chambres"] = hotel.get("chambres") or infos["chambres"]
    hotel["etoiles"] = hotel.get("etoiles") or infos["etoiles"]
    hotel["marque"] = detect_chain(hotel)
    ranked = em.rank(found, hotel.get("site", ""))
    known = {c["email"] for c in ranked}
    for g in em.accor_guesses(hotel.get("site")):
        if g not in known:
            s, why = em.score_email(g, hotel["site"])
            ranked.append({"email": g, "score": s - 5, "raisons": why + ["déduite (convention Accor, non vérifiée)"],
                           "source": "déduite"})
    ranked.sort(key=lambda c: -c["score"])
    hotel["emails"] = ranked
    hotel["segment"] = segment(hotel)
    return hotel


def scan(ville, limite, on_progress=None, workers=12):
    hotels = find_hotels(ville, limite)
    total, done, out = len(hotels), 0, []
    if on_progress:
        on_progress(0, total)
    with ThreadPoolExecutor(workers) as pool:
        futs = {pool.submit(enrich, h): h for h in hotels}
        for f in as_completed(futs):
            try:
                out.append(f.result())
            except Exception:
                h = futs[f]
                h.update(emails=[], segment=segment(h))
                out.append(h)
            done += 1
            if on_progress:
                on_progress(done, total)
    return out
