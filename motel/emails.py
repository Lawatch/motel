"""Extraction des adresses e-mail d'une page et choix de la meilleure adresse.

Règle de choix (à affiner avec les résultats des tests) :
  1. direction / directeur / GM            -> c'est la personne qu'on veut assister
  2. RH / recrutement / emploi / jobs      -> le bon canal pour une candidature
  3. prenom.nom@domaine-de-l-hotel         -> souvent le directeur ou le gérant
  4. contact / info / accueil              -> générique mais lu par l'équipe
  5. réservation / booking / commercial    -> adresses clients, à éviter
  Les adresses techniques (noreply, webmaster, rgpd, prestataires web...) sont exclues.
"""
import re
from urllib.parse import urlparse

EMAIL_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,10}")
# contact [at] hotel [dot] fr, contact(at)hotel.fr, ...
OBFUSCATED_RE = re.compile(
    r"([A-Za-z0-9._%+-]+)\s*[\[\(\{]\s*(?:at|arobase|@)\s*[\]\)\}]\s*"
    r"([A-Za-z0-9-]+(?:\s*(?:[\[\(\{]\s*(?:dot|point)\s*[\]\)\}]|\.)\s*[A-Za-z0-9-]+)+)",
    re.I,
)

FILE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js", ".avif")

EXCLUDE = re.compile(
    r"(no-?reply|ne-?pas-?repondre|donotreply|webmaster|postmaster|mailer-daemon|abuse|"
    r"privacy|rgpd|gdpr|dpo|cnil|unsubscribe|desinscription|example|exemple|votre-?email|"
    r"your-?email|nom@|email@|test@|sentry|wixpress|wordpress|squarespace|godaddy|ovh\.net|"
    r"domain\.com|sitedomain|@2x|@3x)",
    re.I,
)
# Prestataires web / plateformes dont les adresses ne sont jamais celles de l'hôtel
FOREIGN_DOMAINS = {
    "sentry.io", "wix.com", "wixpress.com", "booking.com", "expedia.com", "tripadvisor.com",
    "tripadvisor.fr", "hotels.com", "google.com", "facebook.com", "instagram.com", "w3.org",
    "schema.org", "mailchimp.com", "sendinblue.com", "brevo.com", "d-edge.com", "availpro.com",
    "reservit.com", "synxis.com", "hotelrunner.com", "cloudflare.com", "jquery.com",
}
FREE_MAIL = {"gmail.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "hotmail.fr",
             "hotmail.com", "yahoo.fr", "yahoo.com", "outlook.fr", "outlook.com", "laposte.net",
             "neuf.fr", "live.fr", "icloud.com"}

# (motif sur la partie avant @, points, libellé)
RULES = [
    (r"(^|[._-])(direction|directeur|directrice|director|dg|gm|general-?manager|gerant|gerance|manager|management)([._-]|\d|$)", 50, "direction"),
    (r"(^|[._-])(rh|drh|hr|recrutement|recrutements|recruitment|recrut|jobs?|emplois?|careers?|carrieres?|candidatures?|talents?|people)([._-]|\d|$)", 45, "RH / recrutement"),
    (r"(^|[._-])(resa|reservations?|booking|bookings|reservation-?hotel|sales|commercial|ventes?|events?|evenements?|seminaires?|groupes?|groups|mice|banquets?|restaurant|bar|spa|presse|press|marketing|compta|comptabilite|factur|billing|achats?)([._-]|\d|$)", -40, "adresse client / service"),
    (r"(^|[._-])(contact|info|infos|information|hello|bonjour|accueil|reception|hotel|welcome)([._-]|\d|$)", 20, "contact général"),
]
PERSONAL_RE = re.compile(r"^[a-z]{2,}[._-][a-z]{2,}$")  # prenom.nom
ACCOR_RE = re.compile(r"^h(\d{4})(-[a-z]{2})?@accor\.com$", re.I)


def _decode_cfemail(hexstr):
    try:
        key = int(hexstr[:2], 16)
        return "".join(chr(int(hexstr[i:i + 2], 16) ^ key) for i in range(2, len(hexstr), 2))
    except ValueError:
        return ""


def extract_emails(html):
    """Toutes les adresses trouvées dans un HTML (mailto, texte, obfuscations, Cloudflare)."""
    found = set()
    text = html.replace("&#64;", "@").replace("&commat;", "@").replace("%40", "@")
    for m in EMAIL_RE.findall(text):
        found.add(m)
    for user, dom in OBFUSCATED_RE.findall(text):
        dom = re.sub(r"\s*[\[\(\{]\s*(?:dot|point)\s*[\]\)\}]\s*", ".", dom, flags=re.I)
        found.add(f"{user}@{dom.replace(' ', '')}")
    for hexstr in re.findall(r'data-cfemail="([0-9a-fA-F]+)"', html):
        e = _decode_cfemail(hexstr)
        if EMAIL_RE.fullmatch(e):
            found.add(e)
    clean = set()
    for e in found:
        e = e.strip(".-_").lower()
        if e.endswith(FILE_EXT) or EXCLUDE.search(e):
            continue
        if e.split("@", 1)[1] in FOREIGN_DOMAINS:
            continue
        clean.add(e)
    return clean


def site_domain(url):
    host = urlparse(url if "//" in url else "http://" + url).netloc.lower()
    host = host.split(":")[0]
    return host[4:] if host.startswith("www.") else host


def _root(domain):
    parts = domain.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else domain


def score_email(email, website="", source=""):
    """Retourne (score, raisons). Plus le score est haut, meilleure est l'adresse."""
    local, domain = email.lower().split("@", 1)
    score, why = 0, []
    matched = False
    for pattern, pts, label in RULES:
        if re.search(pattern, local):
            score += pts
            why.append(label)
            matched = True
            break
    if not matched and PERSONAL_RE.match(local) and domain not in FREE_MAIL:
        score += 35
        why.append("adresse nominative")
    if not matched and not why:
        score += 10
        why.append("adresse non identifiée")

    m = ACCOR_RE.match(email)
    if m:
        suffix = (m.group(2) or "").lower()
        if suffix == "-gm":
            score, why = 55, ["direction (Accor GM)"]
        elif suffix in ("-hr", "-rh"):
            score, why = 50, ["RH (Accor)"]
        elif suffix in ("", "-re", "-fo"):
            score, why = 18, ["réception (Accor)"]
        else:
            score, why = -30, ["service Accor (" + suffix[1:].upper() + ")"]

    web = site_domain(website) if website else ""
    if web and _root(domain) == _root(web):
        score += 15
        why.append("même domaine que le site")
    elif domain in FREE_MAIL:
        score += 3
        why.append("messagerie perso (petit établissement ?)")
    elif web:
        score -= 10
        why.append("domaine différent du site")

    src = source.lower()
    if re.search(r"recrut|emploi|carriere|career|job|rejoindre|join", src):
        score += 10
        why.append("trouvée sur la page recrutement")
    elif re.search(r"mention|legal|impressum", src):
        score += 5
        why.append("trouvée dans les mentions légales")
    return score, why


def accor_guesses(website):
    """Les hôtels Accor suivent la convention H1234@accor.com / H1234-GM@accor.com."""
    m = re.search(r"accor\.com/(?:[a-z]{2}/)?hotel/(\d{4})", website or "", re.I)
    if not m:
        return []
    code = m.group(1)
    return [f"h{code}-gm@accor.com", f"h{code}@accor.com"]


def rank(candidates, website=""):
    """candidates: dict email -> source (url de la page). Retourne une liste triée."""
    out = []
    for email, source in candidates.items():
        s, why = score_email(email, website, source)
        out.append({"email": email, "score": s, "raisons": why, "source": source})
    out.sort(key=lambda c: (-c["score"], len(c["email"])))
    return out
