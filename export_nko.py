import json, csv, re

def flat(o, pre=""):
    r = {}
    for k, v in o.items():
        if isinstance(v, dict): r.update(flat(v, pre + k + "."))
        else: r[pre + k] = v
    return r

def load(l):
    try: return json.load(open(f"locales/{l}.json", encoding="utf-8"))
    except Exception: return {}

src = open("src/features/settings/strings.ts", encoding="utf-8").read()

def block(code, nxt):
    a = src.index(f"\n  {code}: {{")
    b = src.index(f"\n  {nxt}: {{", a) if nxt else len(src)
    return src[a:b]

pat = re.compile(r'^\s*([a-z0-9_]+):\s*"((?:[^"\\]|\\.)*)"\s*,', re.M)

def parse(txt):
    return {k: json.loads('"' + v + '"') for k, v in pat.findall(txt)}

sfr = parse(block("fr", "en"))
sbm = parse(block("bm", None))
nq = load("nqo")
nq_set = nq.get("settings", {})
fr, bm = flat(load("fr")), flat(load("bm"))
nqf = flat({k: v for k, v in nq.items() if k != "settings"})

rows = 0
with open("locales/nqo_a_valider.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["source","cle","francais","bambara_latin","nko_actuel","nko_valide","valideur"])
    for k, v in fr.items():
        if not nqf.get(k):
            w.writerow(["locales", k, v, bm.get(k, ""), "", "", ""]); rows += 1
    for k, v in sfr.items():
        if not nq_set.get(k):
            w.writerow(["settings", k, v, sbm.get(k, ""), "", "", ""]); rows += 1
print(rows, "lignes;", len(sfr), "clés Réglages lues")
