import re, urllib.request, pathlib
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
WANT = [("PT Serif","700"),("Frank Ruhl Libre","700"),("Noto Sans","400"),("Noto Sans","600"),("Noto Sans Hebrew","400"),("Noto Sans Hebrew","600")]
KEEP = {"latin","cyrillic","hebrew"}
out = pathlib.Path("assets/fonts"); out.mkdir(parents=True, exist_ok=True)
for f in out.glob("*.woff2"): f.unlink()
blocks = []
for fam, wght in WANT:
    url = "https://fonts.googleapis.com/css2?family=" + fam.replace(" ","+") + ":wght@" + wght + "&display=swap"
    css = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read().decode()
    for label, body in re.findall(r"/\*\s*([a-z0-9-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css):
        if label not in KEEP: continue
        src = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", body)
        if not src: continue
        name = (fam.replace(" ","") + "-" + wght + "-" + label + ".woff2")
        (out / name).write_bytes(urllib.request.urlopen(urllib.request.Request(src.group(1), headers=UA)).read())
        blocks.append("/* %s %s %s */\n%s" % (fam, wght, label, body.replace(src.group(1), "../assets/fonts/" + name)))
pathlib.Path("css/fonts.css").write_text("\n".join(blocks))
print("files:", len(list(out.glob('*.woff2'))), "KB:", sum(f.stat().st_size for f in out.glob('*.woff2'))//1024)
