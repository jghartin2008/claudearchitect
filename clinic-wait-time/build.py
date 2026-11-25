"""Build index.html from page.template.html and an initial state.
The page embeds its own template (SRC) so staff can republish it with new state."""
import json, sys, pathlib
here = pathlib.Path(__file__).parent
T = (here / "page.template.html").read_text(encoding="utf-8")
def safe(v):
    return json.dumps(v, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
wk = [480, 1020]
state = {"name": "Community Health Clinic (demo)", "phone": "(555) 010-0199", "tz": "America/New_York",
         "hours": {"sun": None, "mon": wk, "tue": wk, "wed": wk, "thu": wk, "fri": wk, "sat": [540, 780]},
         "override": None, "wait": None, "updatedAt": None}
if len(sys.argv) > 2: state = json.loads(sys.argv[2])
out = T.replace("@@SRC@@", safe(T), 1).replace("@@STATE@@", safe(state), 1)
dest = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else here / "index.html")
dest.write_text(out, encoding="utf-8")
print(f"wrote {dest} ({len(out.encode('utf-8'))} bytes)")
