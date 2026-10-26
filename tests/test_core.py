import functools
import http.server
import tempfile
import threading
import unittest
from pathlib import Path

from motel import db, emails, letters, scan

SITE = Path(__file__).parent / "site"
CAND = {"prenom": "Léopold", "nom": "Watchi", "telephone": "07 81 44 34 13", "email": "leo.watchi@gmail.com"}


class Emails(unittest.TestCase):
    def test_extraction(self):
        html = ('<a href="mailto:Contact@Hotel.fr">x</a> info [at] hotel [dot] fr logo@2x.png '
                'noreply@hotel.fr x@sentry.io')
        self.assertEqual(emails.extract_emails(html), {"contact@hotel.fr", "info@hotel.fr"})

    def test_ranking(self):
        site = "https://www.hotel-du-parc.fr"
        ranked = emails.rank({"reservation@hotel-du-parc.fr": "", "contact@hotel-du-parc.fr": "",
                              "direction@hotel-du-parc.fr": "", "recrutement@hotel-du-parc.fr": "/recrutement",
                              "info.resa@hotel-du-parc.fr": ""}, site)
        order = [c["email"].split("@")[0] for c in ranked]
        self.assertEqual(order[:3], ["recrutement", "direction", "contact"])
        self.assertLess(ranked[-1]["score"], 0)

    def test_accor(self):
        self.assertEqual(emails.accor_guesses("https://all.accor.com/hotel/1234/index.fr.shtml")[0], "h1234-gm@accor.com")
        self.assertGreater(emails.score_email("h1234-gm@accor.com")[0], emails.score_email("h1234-sb@accor.com")[0])


class Crawl(unittest.TestCase):
    def test_site(self):
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
        handler.log_message = lambda *a: None
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_port}/index.html"
        h = scan.enrich({"cle": "t", "nom": "Hôtel du Parc", "site": url, "ville": "Lyon"})
        srv.shutdown()
        found = [c["email"] for c in h["emails"]]
        self.assertIn("direction@hotelduparc.fr", found)        # Cloudflare
        self.assertIn("contact@hotelduparc.fr", found)          # [at] [dot]
        self.assertIn("marie.dupont@hotelduparc.fr", found)
        self.assertNotIn("support@ovh.net", found)
        self.assertEqual(found[-1], "reservation@hotelduparc.fr")
        self.assertEqual((h["chambres"], h["etoiles"], h["segment"]), (28, 3, "independant"))


class Letters(unittest.TestCase):
    def test_articles(self):
        self.assertEqual(letters.de_hotel("Hôtel du Parc"), "de l'Hôtel du Parc")
        self.assertEqual(letters.de_hotel("Le Grand Hôtel"), "du Grand Hôtel")
        self.assertEqual(letters.de_hotel("Mercure Lyon Centre"), "de l'hôtel Mercure Lyon Centre")
        self.assertEqual(letters.de_hotel("L'Atelier"), "de L'Atelier")

    def test_segments(self):
        for seg, extra in [("independant", {}), ("intermediaire", {"chambres": 80}),
                           ("groupe", {"marque": "ibis"}), ("luxe", {"etoiles": 5})]:
            h = {"nom": "Hôtel Test", "ville": "Lyon", "segment": seg, **extra}
            objet, corps = letters.build(h, CAND)
            self.assertTrue(corps.startswith("Madame, Monsieur,\n\nJe me permets"))
            self.assertIn("au sein de l'Hôtel Test à Lyon", corps)
            self.assertNotIn("{", corps)
            self.assertIn("Hôtel Test", objet)
            self.assertTrue(corps.rstrip().endswith("leo.watchi@gmail.com"))
        _, c = letters.build({"nom": "Le Royal", "segment": "luxe"}, CAND)
        self.assertNotIn("étoiles étoiles", c)
        self.assertEqual(c.count("Manchester"), 1)

    def test_cv_name(self):
        self.assertEqual(letters.cv_filename("Hôtel / Le Parc", CAND), "CV Léopold Watchi Hôtel Le Parc.pdf")


class Dedup(unittest.TestCase):
    def test_reserve(self):
        con = db.connect(Path(tempfile.mkdtemp()) / "t.db")
        self.assertTrue(db.reserve(con, "Contact@Hotel.fr", 1, "A", "x"))
        self.assertFalse(db.reserve(con, "contact@hotel.fr ", 2, "B", "x"))
        self.assertTrue(db.already_sent(con, "CONTACT@hotel.fr"))
        self.assertEqual(db.sent_today(con), 1)


if __name__ == "__main__":
    unittest.main()
