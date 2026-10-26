"""Stockage SQLite : hôtels scannés + adresses déjà contactées (jamais deux fois la même)."""
import json
import sqlite3
import threading
from datetime import date, datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "motel.db"
_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS hotels (
  id INTEGER PRIMARY KEY,
  cle TEXT UNIQUE,
  nom TEXT, ville TEXT, adresse TEXT, site TEXT,
  etoiles INTEGER, chambres INTEGER, marque TEXT, segment TEXT,
  emails TEXT DEFAULT '[]',
  email_choisi TEXT,
  statut TEXT DEFAULT 'nouveau',      -- nouveau | envoye | ignore | erreur
  objet_perso TEXT, corps_perso TEXT,
  recherche TEXT, scanne_le TEXT
);
CREATE TABLE IF NOT EXISTS envois (
  email TEXT PRIMARY KEY,             -- en minuscules : clé anti-doublon
  hotel_id INTEGER, hotel_nom TEXT,
  objet TEXT, envoye_le TEXT
);
"""


def connect(path=None):
    con = sqlite3.connect(path or DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def upsert_hotel(con, h, recherche):
    with _lock:
        row = con.execute("SELECT id, statut, email_choisi FROM hotels WHERE cle=?", (h["cle"],)).fetchone()
        best = h["emails"][0]["email"] if h.get("emails") else None
        vals = (h["nom"], h.get("ville"), h.get("adresse"), h.get("site"), h.get("etoiles"), h.get("chambres"),
                h.get("marque"), h.get("segment"), json.dumps(h.get("emails", []), ensure_ascii=False),
                recherche, datetime.now().isoformat(timespec="seconds"))
        if row:
            con.execute("""UPDATE hotels SET nom=?, ville=?, adresse=?, site=?, etoiles=?, chambres=?, marque=?,
                           segment=?, emails=?, recherche=?, scanne_le=? WHERE id=?""", vals + (row["id"],))
            if not row["email_choisi"]:
                con.execute("UPDATE hotels SET email_choisi=? WHERE id=?", (best, row["id"]))
        else:
            con.execute("""INSERT INTO hotels (nom, ville, adresse, site, etoiles, chambres, marque, segment, emails,
                           recherche, scanne_le, cle, email_choisi) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        vals + (h["cle"], best))
        con.commit()


def hotel_dict(row):
    d = dict(row)
    d["emails"] = json.loads(d["emails"] or "[]")
    return d


def get_hotel(con, hid):
    row = con.execute("SELECT * FROM hotels WHERE id=?", (hid,)).fetchone()
    return hotel_dict(row) if row else None


def list_hotels(con, recherche=None):
    q, args = "SELECT * FROM hotels", ()
    if recherche:
        q, args = q + " WHERE recherche=?", (recherche,)
    return [hotel_dict(r) for r in con.execute(q + " ORDER BY id DESC", args)]


def update_hotel(con, hid, **fields):
    allowed = {"email_choisi", "statut", "objet_perso", "corps_perso", "segment", "chambres", "etoiles", "marque", "nom"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if not fields:
        return
    with _lock:
        con.execute(f"UPDATE hotels SET {', '.join(k + '=?' for k in fields)} WHERE id=?", (*fields.values(), hid))
        con.commit()


def already_sent(con, email):
    return con.execute("SELECT 1 FROM envois WHERE email=?", ((email or "").strip().lower(),)).fetchone() is not None


def sent_emails(con):
    return {r[0] for r in con.execute("SELECT email FROM envois")}


def reserve(con, email, hotel_id, hotel_nom, objet):
    """Réserve l'adresse avant l'envoi. False si elle a déjà été utilisée (anti-doublon atomique)."""
    with _lock:
        try:
            con.execute("INSERT INTO envois (email, hotel_id, hotel_nom, objet, envoye_le) VALUES (?,?,?,?,?)",
                        (email.strip().lower(), hotel_id, hotel_nom, objet, datetime.now().isoformat(timespec="seconds")))
            con.commit()
            return True
        except sqlite3.IntegrityError:
            return False


def release(con, email):
    """Annule la réservation si l'envoi a échoué (l'adresse pourra être réessayée)."""
    with _lock:
        con.execute("DELETE FROM envois WHERE email=?", (email.strip().lower(),))
        con.commit()


def sent_today(con):
    return con.execute("SELECT COUNT(*) FROM envois WHERE envoye_le LIKE ?", (date.today().isoformat() + "%",)).fetchone()[0]


def history(con):
    return [dict(r) for r in con.execute("SELECT * FROM envois ORDER BY envoye_le DESC")]
