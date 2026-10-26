"""Candidatures spontanées - interface locale.  Lancer :  python app.py  puis ouvrir http://localhost:5050"""
import csv
import io
import json
import threading
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from motel import db, letters, mailer, scan

ROOT = Path(__file__).resolve().parent
CFG_PATH = ROOT / "config.json"
if not CFG_PATH.exists():
    raise SystemExit("config.json manquant : copiez config.example.json en config.json et complétez-le.")
CFG = json.loads(CFG_PATH.read_text(encoding="utf-8"))

app = Flask(__name__, static_folder="static")
con = db.connect()
sender = mailer.Sender(CFG, con)
scan_state = {"actif": False, "fait": 0, "total": 0, "recherche": None, "erreur": None}


@app.get("/")
def index():
    return send_from_directory(ROOT / "static", "index.html")


@app.get("/api/etat")
def etat():
    return jsonify(mode_test=CFG.get("mode_test", True), envoyes_aujourdhui=db.sent_today(con),
                   limite=CFG.get("limite_par_jour", 60), score_min=CFG.get("score_minimum_auto", 20),
                   scan=scan_state, envoi=sender.state)


@app.post("/api/scan")
def lancer_scan():
    if scan_state["actif"]:
        return jsonify(erreur="Un scan est déjà en cours"), 409
    ville = (request.json.get("ville") or "").strip()
    limite = int(request.json.get("limite") or 120)
    if not ville:
        return jsonify(erreur="Indiquez une ville"), 400
    scan_state.update(actif=True, fait=0, total=0, recherche=ville, erreur=None)

    def run():
        try:
            def progress(done, total):
                scan_state.update(fait=done, total=total)
            for h in scan.scan(ville, limite, progress):
                db.upsert_hotel(con, h, ville)
        except Exception as e:
            scan_state["erreur"] = str(e)
        finally:
            scan_state["actif"] = False

    threading.Thread(target=run, daemon=True).start()
    return jsonify(ok=True)


@app.post("/api/import")
def importer():
    """Import CSV (colonnes : nom, site, ville, email) quand OpenStreetMap ne suffit pas."""
    f = request.files.get("fichier")
    if not f:
        return jsonify(erreur="Aucun fichier"), 400
    text = f.read().decode("utf-8-sig")
    delim = ";" if text.split("\n", 1)[0].count(";") > text.split("\n", 1)[0].count(",") else ","
    rows = list(csv.DictReader(io.StringIO(text), delimiter=delim))
    label = "import " + f.filename
    scan_state.update(actif=True, fait=0, total=len(rows), recherche=label, erreur=None)

    def run():
        try:
            for i, r in enumerate(rows, 1):
                r = {k.strip().lower(): (v or "").strip() for k, v in r.items() if k}
                if not r.get("nom"):
                    continue
                h = {"cle": "csv:" + (scan.em.site_domain(r["site"]) if r.get("site") else r["nom"].lower()),
                     "nom": r["nom"], "ville": r.get("ville", ""), "adresse": "", "site": r.get("site", ""),
                     "etoiles": scan._int(r.get("etoiles")), "chambres": scan._int(r.get("chambres")),
                     "marque": r.get("marque", ""), "emails_osm": [r["email"].lower()] if r.get("email") else []}
                try:
                    h = scan.enrich(h)
                except Exception:
                    h.update(emails=[], segment=scan.segment(h))
                db.upsert_hotel(con, h, label)
                scan_state["fait"] = i
        finally:
            scan_state["actif"] = False

    threading.Thread(target=run, daemon=True).start()
    return jsonify(ok=True)


@app.get("/api/recherches")
def recherches():
    rows = con.execute("SELECT recherche, COUNT(*) n FROM hotels GROUP BY recherche ORDER BY MAX(id) DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api/hotels")
def hotels():
    deja = db.sent_emails(con)
    out = []
    for h in db.list_hotels(con, request.args.get("recherche")):
        for c in h["emails"]:
            c["deja_envoye"] = c["email"] in deja
        h["deja_envoye"] = (h.get("email_choisi") or "").lower() in deja
        out.append(h)
    return jsonify(out)


@app.get("/api/apercu/<int:hid>")
def apercu(hid):
    h = db.get_hotel(con, hid)
    objet, corps = letters.build(h, CFG["candidat"])
    try:
        ext = mailer.cv_pdf(CFG["cv_path"]).suffix
    except FileNotFoundError:
        ext = ".pdf"
    return jsonify(objet=h.get("objet_perso") or objet, corps=h.get("corps_perso") or corps,
                   perso=bool(h.get("corps_perso") or h.get("objet_perso")),
                   cv=letters.cv_filename(h["nom"], CFG["candidat"], ext), email=h.get("email_choisi"))


@app.post("/api/hotel/<int:hid>")
def modifier(hid):
    data = dict(request.json or {})
    if data.get("email_choisi"):
        data["email_choisi"] = data["email_choisi"].strip().lower()
    for k in ("chambres", "etoiles"):
        if k in data:
            data[k] = scan._int(data[k])
    db.update_hotel(con, hid, **data)
    return jsonify(db.get_hotel(con, hid))


@app.post("/api/envoyer")
def envoyer():
    ids = [int(i) for i in request.json.get("ids", [])]
    deja, vus, ok, refus = db.sent_emails(con), set(), [], []
    for hid in ids:
        h = db.get_hotel(con, hid)
        e = (h.get("email_choisi") or "").lower()
        if not e or e in deja or e in vus or h["statut"] == "envoye":
            refus.append(h["nom"])
            continue
        vus.add(e)
        ok.append(hid)
    reste = CFG.get("limite_par_jour", 60) - db.sent_today(con)
    if not CFG.get("mode_test") and len(ok) > reste:
        refus += [db.get_hotel(con, i)["nom"] for i in ok[reste:]]
        ok = ok[:max(reste, 0)]
    sender.enqueue(ok)
    return jsonify(en_file=len(ok), refuses=refus)


@app.get("/api/historique")
def historique():
    return jsonify(db.history(con))


if __name__ == "__main__":
    try:
        print("CV joint :", mailer.cv_pdf(CFG["cv_path"]))
    except Exception as e:
        print("Attention :", e)
    print("Mode test :", CFG.get("mode_test", True), "- ouvrez http://localhost:5050")
    app.run(port=5050, debug=False)
