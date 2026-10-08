import json,sys
def txt(c):
    if c is None: return ''
    if isinstance(c,str): return c
    out=''
    for x in c:
        if isinstance(x,str): out+=x
        elif x.get('type')=='link': out+=txt(x.get('content'))
        else: out+=x.get('text','')
    return out
def walk(bs,d=0):
    for b in bs:
        t=b['type']; p=b.get('props',{}) or {}; i='  '*d
        if t=='heading': print(f"{i}{'#'*p.get('level',2)} {txt(b.get('content'))}")
        elif t in('paragraph','bulletListItem','numberedListItem'): print(f"{i}{ {'paragraph':'P','bulletListItem':'-','numberedListItem':'1.'}[t]} {txt(b.get('content'))}")
        elif t=='callout': print(f"{i}[{p.get('variant')}] {txt(b.get('content'))}")
        elif t=='example': print(f"{i}EX {txt(b.get('content'))} | {p.get('translation','')} | {p.get('note','')}")
        elif t=='dialogue':
            turns=p['turns']; turns=json.loads(turns) if isinstance(turns,str) else turns
            for tu in turns: print(f"{i}  {tu['speaker']}: {tu['text']}")
        elif t=='practice':
            dd=p['data']; dd=json.loads(dd) if isinstance(dd,str) else dd
            print(f"{i}PRACTICE: {dd['instruction']}")
            if dd.get('passage'): print(f"{i}  PASSAGE {dd['passage'].get('title')}: {dd['passage']['content']}")
            for it in dd['items']: print(f"{i}  > {it['prompt']} => {it.get('authorsVersion')}" + (f"  ({it['note']})" if it.get('note') else ''))
        elif t=='divider': print(f"{i}---")
        if t not in('dialogue','practice') and b.get('children'): walk(b['children'],d+1)
f=json.load(open(sys.argv[1])); print('TITLE',f['title'],'|',f.get('goal')); walk(f['blocks']); print('IMAGES',f.get('imageIdeas'))
