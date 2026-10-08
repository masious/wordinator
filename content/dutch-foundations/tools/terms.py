# Prints the vocabulary terms of lesson files: python3 terms.py <file>...
import json, sys
def walk(blocks):
    for b in blocks:
        yield b
        yield from walk(b.get("children", []))
for path in sys.argv[1:]:
    doc = json.load(open(path))
    if "blocks" not in doc:  # skip non-lesson files such as course.json
        continue
    blocks = doc["blocks"]
    terms = []
    for b in walk(blocks):
        if b.get("type") == "vocabulary":
            data = b["props"]["data"]
            data = json.loads(data) if isinstance(data, str) else data
            terms += [w["term"] for w in data["words"]]
    print(f"{path.split('/')[-1]} ({len(terms)}): " + "; ".join(terms))
