#!/usr/bin/env python3
"""Extract the colour-legend paragraph of every lesson into one JSON file.

The legend is the intro paragraph that says what each colour means
("Colours in this lesson: subjects are green, verbs are blue, ...").
It is usually the 2nd or 3rd paragraph, so it is found by its text, not
its position; the literal 3rd paragraph is recorded too for comparison.

Usage: extract_colour_legends.py OUT.json [lesson.json ...]
Without lesson files it reads every lesson under content/dutch-foundations.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALETTE = ['gray', 'grey', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']
COLOUR_WORD = re.compile(r'\b(' + '|'.join(PALETTE) + r')\b', re.I)
LEGEND_START = re.compile(r'^\s*colou?rs?\b', re.I)


def lesson_files():
    files = glob.glob(os.path.join(ROOT, 'part-*', '*.json'))
    files += glob.glob(os.path.join(ROOT, 'part-*', 'existing', '*.json'))
    return sorted(f for f in files if not os.path.basename(f).startswith('course'))


def walk(blocks):
    for block in blocks:
        yield block
        yield from walk(block.get('children', []))


def plain(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ''.join(x if isinstance(x, str) else x.get('text', '') for x in content)
    return ''


def styled_runs(content):
    if not isinstance(content, list):
        return []
    return [x for x in content if isinstance(x, dict) and x.get('styles')]


def parse_entries(text):
    """Split the legend into clauses and pair each palette colour with its role."""
    entries = []
    body = re.sub(r'^\s*colou?rs?( in this lesson)?\s*:\s*', '', text, flags=re.I)
    for sentence in re.split(r'(?<=[.;])\s+', body):
        for clause in re.split(r',\s*(?:and\s+)?|\s+and\s+(?=[^,]*\b(?:is|are)\b)', sentence):
            colours = [c.lower().replace('grey', 'gray') for c in COLOUR_WORD.findall(clause)]
            if not colours:
                continue
            role = re.sub(r'\b(is|are|stay|marks?)\b', ' ', COLOUR_WORD.sub(' ', clause), flags=re.I)
            role = re.sub(r'\s+', ' ', role).strip(' .;,:—-')
            kind = 'backgroundColor' if re.search(r'highlight|background|\bon\s+yellow', clause, re.I) else 'textColor'
            entries.append({'colours': colours, 'kind': kind, 'role': role, 'clause': clause.strip()})
    return entries


def extract(path):
    lesson = json.load(open(path))
    paragraphs = [b for b in walk(lesson['blocks']) if b['type'] == 'paragraph']
    legend_index = next(
        (i for i, b in enumerate(paragraphs)
         if LEGEND_START.match(plain(b.get('content'))) and COLOUR_WORD.search(plain(b.get('content')))),
        None)
    third = paragraphs[2] if len(paragraphs) > 2 else None
    legend = paragraphs[legend_index] if legend_index is not None else None
    record = {
        'file': os.path.relpath(path, ROOT),
        'lessonId': lesson.get('id'),
        'title': lesson.get('title'),
        'legendFound': legend is not None,
        'legendParagraphNumber': legend_index + 1 if legend is not None else None,
        'thirdParagraphIsLegend': legend is not None and legend is third,
        'thirdParagraph': {'blockId': third['id'], 'text': plain(third.get('content'))} if third else None,
    }
    if legend is not None:
        text = plain(legend.get('content'))
        record['legend'] = {
            'blockId': legend['id'],
            'text': text,
            'styledRuns': [{'text': r['text'], 'styles': r['styles']} for r in styled_runs(legend.get('content'))],
            'entries': parse_entries(text),
        }
    return record


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    files = sys.argv[2:] or lesson_files()
    records = [extract(f) for f in files]
    with open(sys.argv[1], 'w') as out:
        json.dump(records, out, ensure_ascii=False, indent=2)
    found = sum(r['legendFound'] for r in records)
    third = sum(r['thirdParagraphIsLegend'] for r in records)
    print(f'{len(records)} lessons, {found} with a legend, {third} with the legend as 3rd paragraph -> {sys.argv[1]}')


if __name__ == '__main__':
    main()
