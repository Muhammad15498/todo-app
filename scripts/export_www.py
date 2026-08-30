#!/usr/bin/env python3
"""Flatten the Flask app into a static www/ folder for Capacitor / APK."""
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parents[1]
www = root / "www"
if www.exists():
    shutil.rmtree(www)
www.mkdir()

html = (root / "templates" / "index.html").read_text()
html = re.sub(
    r"\{\{\s*url_for\('static',\s*filename='([^']+)'\)\s*\}\}",
    r"static/\1",
    html,
)
html = html.replace('href="static/manifest.json"', 'href="manifest.json"')
(www / "index.html").write_text(html)

shutil.copytree(root / "static", www / "static")
shutil.copy(root / "static" / "manifest.json", www / "manifest.json")
shutil.copy(root / "static" / "sw.js", www / "sw.js")

man = (www / "manifest.json").read_text()
man = man.replace('"/static/', '"static/')
man = man.replace('"start_url": "/"', '"start_url": "./index.html"')
man = man.replace('"id": "/"', '"id": "./index.html"')
man = man.replace('"scope": "/"', '"scope": "./"')
(www / "manifest.json").write_text(man)

print("exported", www)
