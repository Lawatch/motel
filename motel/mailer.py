"""Préparation du CV et envoi des mails (file d'attente en arrière-plan)."""
import queue
import random
import shutil
import smtplib
import subprocess
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from . import db, letters

ROOT = Path(__file__).resolve().parent.parent


def cv_pdf(cv_path):
    """Convertit le CV .docx en PDF (LibreOffice) et le met en cache. Retourne le chemin à joindre."""
    src = (ROOT / cv_path) if not Path(cv_path).is_absolute() else Path(cv_path)
    if not src.exists():
        raise FileNotFoundError(f"CV introuvable : {src}")
    if src.suffix.lower() == ".pdf":
        return src
    pdf = ROOT / "data" / (src.stem + ".pdf")
    if pdf.exists() and pdf.stat().st_mtime >= src.stat().st_mtime:
        return pdf
    office = shutil.which("soffice") or shutil.which("libreoffice")
    if not office:
        for p in ["/Applications/LibreOffice.app/Contents/MacOS/soffice",
                  r"C:\Program Files\LibreOffice\program\soffice.exe"]:
            if Path(p).exists():
                office = p
    if not office:
        return src  # pas de LibreOffice : on joindra le .docx
    subprocess.run([office, "--headless", "--convert-to", "pdf", "--outdir", str(pdf.parent), str(src)],
                   check=True, capture_output=True, timeout=120)
    return pdf


def build_message(cfg, hotel, to, objet, corps, cv):
    cand = cfg["candidat"]
    msg = EmailMessage()
    msg["From"] = formataddr((f"{cand['prenom']} {cand['nom']}", cfg["smtp"]["user"]))
    msg["To"] = to
    msg["Subject"] = objet
    msg["Reply-To"] = cand.get("email") or cfg["smtp"]["user"]
    msg["Message-ID"] = make_msgid(domain=cfg["smtp"]["user"].split("@")[-1])
    msg.set_content(corps)
    name = letters.cv_filename(hotel["nom"], cand, cv.suffix)
    sub = "pdf" if cv.suffix.lower() == ".pdf" else "vnd.openxmlformats-officedocument.wordprocessingml.document"
    msg.add_attachment(cv.read_bytes(), maintype="application", subtype=sub, filename=name)
    return msg, name


class Sender:
    """Envoie les mails un par un avec un délai aléatoire, sans jamais réutiliser une adresse."""

    def __init__(self, cfg, con):
        self.cfg, self.con = cfg, con
        self.q = queue.Queue()
        self.state = {"en_attente": 0, "envoyes": 0, "erreurs": [], "en_cours": None}
        threading.Thread(target=self._run, daemon=True).start()

    def enqueue(self, hotel_ids):
        for hid in hotel_ids:
            self.q.put(hid)
            self.state["en_attente"] += 1

    def _run(self):
        while True:
            hid = self.q.get()
            self.state["en_attente"] -= 1
            try:
                sent = self._send_one(hid)
            except Exception as e:  # on note l'erreur et on passe au suivant
                sent = False
                self.state["erreurs"].append(f"#{hid} : {e}")
                db.update_hotel(self.con, hid, statut="erreur")
            self.state["en_cours"] = None
            if sent and not self.q.empty():
                lo, hi = self.cfg.get("delai_entre_envois_sec", [8, 20])
                time.sleep(random.uniform(lo, hi))

    def _send_one(self, hid):
        cfg = self.cfg
        hotel = db.get_hotel(self.con, hid)
        if not hotel or hotel["statut"] == "envoye":
            return False
        to = (hotel.get("email_choisi") or "").strip().lower()
        if not to:
            raise ValueError("pas d'adresse choisie")
        if db.sent_today(self.con) >= cfg.get("limite_par_jour", 60) and not cfg.get("mode_test"):
            raise RuntimeError("limite quotidienne atteinte")
        self.state["en_cours"] = hotel["nom"]
        objet, corps = letters.build(hotel, cfg["candidat"])
        objet = hotel.get("objet_perso") or objet
        corps = hotel.get("corps_perso") or corps
        cv = cv_pdf(cfg["cv_path"])

        test = cfg.get("mode_test", True)
        if test:
            dest, objet = cfg.get("adresse_test") or cfg["smtp"]["user"], f"[TEST -> {to}] {objet}"
        else:
            if not db.reserve(self.con, to, hid, hotel["nom"], objet):
                db.update_hotel(self.con, hid, statut="ignore")
                raise RuntimeError(f"{to} a déjà reçu une candidature : envoi annulé")
            dest = to

        msg, cv_name = build_message(cfg, hotel, dest, objet, corps, cv)
        try:
            self._smtp_send(msg)
        except Exception:
            if not test:
                db.release(self.con, to)
            raise
        if cfg.get("sauver_copie_cv", True):
            out = ROOT / "sortie" / "CV"
            out.mkdir(parents=True, exist_ok=True)
            (out / cv_name).write_bytes(cv.read_bytes())
        if not test:
            db.update_hotel(self.con, hid, statut="envoye")
        self.state["envoyes"] += 1
        return True

    def _smtp_send(self, msg):
        s = self.cfg["smtp"]
        if int(s.get("port", 465)) == 465:
            server = smtplib.SMTP_SSL(s["host"], 465, timeout=30)
        else:
            server = smtplib.SMTP(s["host"], int(s["port"]), timeout=30)
            server.starttls()
        with server:
            server.login(s["user"], s["password"])
            server.send_message(msg)
