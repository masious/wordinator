#!/usr/bin/env python3
"""Test whether a lesson's colour legend can be applied deterministically.

For every lesson in the legends file (from extract_colour_legends.py):
1. Collect every coloured inline run in the lesson, per colour and block type.
2. Compare the colours actually used with the colours the legend declares.
3. Build a per-lesson lexicon (word -> colours the author gave it) and replay
   it as a word-matching highlighter over the lesson's own inline text. The
   author's styling is the ground truth, so this measures how well plain
   word matching reproduces it, with no AI and no grammar.
4. Count what the same lexicon would highlight in plain-text surfaces that
   carry no styling today (dialogue turns, practice prompts, vocabulary).

Usage: match_colour_legends.py LEGENDS.json OUT.json OUT.md
"""
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD = re.compile(r"[\w’']+(?:-[\w’']+)*", re.UNICODE)
# Consistency threshold for the strict variant: a word is highlighted only
# when the author coloured it this colour in at least this share of its
# occurrences in example blocks.
STRICT = 0.8


def walk(blocks):
    for block in blocks:
        yield block
        yield from walk(block.get('children', []))


def colour_of(styles):
    if styles.get('textColor') and styles['textColor'] != 'default':
        return styles['textColor']
    if styles.get('backgroundColor') and styles['backgroundColor'] != 'default':
        return 'bg:' + styles['backgroundColor']
    return None


def tokens(content):
    """(word, colour or None) for every word of a block's inline content."""
    if isinstance(content, str):
        content = [content]
    if not isinstance(content, list):
        return
    for item in content:
        if isinstance(item, str):
            text, colour = item, None
        elif (item.get('styles') or {}).get('backgroundColor') == 'gray':
            continue  # a wrong form, shown on gray; never highlighted
        else:
            text, colour = item.get('text', ''), colour_of(item.get('styles') or {})
        for word in WORD.findall(text):
            yield word.lower(), colour


def plain_surfaces(block):
    """Dutch text stored as plain strings in block props (no inline styles)."""
    props = block.get('props') or {}
    if block['type'] == 'dialogue':
        for turn in props.get('turns', []):
            yield 'dialogue', turn.get('text', '')
    elif block['type'] == 'practice':
        for item in (props.get('data') or {}).get('items', []):
            yield 'practice', item.get('prompt', '')
    elif block['type'] == 'vocabulary':
        for word in (props.get('data') or {}).get('words', []):
            yield 'vocabulary', word.get('term', '') + ' ' + word.get('example', '')


def analyse(record):
    lesson = json.load(open(os.path.join(ROOT, record['file'])))
    legend_id = record['legend']['blockId']
    declared = {c for e in record['legend']['entries'] for c in e['colours']}
    declared |= {'bg:' + c for e in record['legend']['entries'] if e['kind'] == 'backgroundColor' for c in e['colours']}

    runs_by_colour = collections.defaultdict(lambda: collections.Counter())
    words_by_colour = collections.defaultdict(collections.Counter)
    occurrences = []  # (word, colour, blockType, blockId)
    plain = []
    for block in walk(lesson['blocks']):
        if block['id'] == legend_id or block['type'] == 'heading':
            continue
        for word, colour in tokens(block.get('content')):
            occurrences.append((word, colour, block['type'], block['id']))
            if colour:
                words_by_colour[colour][word] += 1
        content = block.get('content')
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and colour_of(item.get('styles') or {}):
                    runs_by_colour[colour_of(item['styles'])][block['type']] += 1
        plain.extend(plain_surfaces(block))

    # Counts per block, so a block can be scored with a lexicon built from
    # the rest of the lesson (held out), like an unstyled dialogue would be.
    lexicon = collections.defaultdict(collections.Counter)
    example_total = collections.defaultdict(collections.Counter)
    example_coloured = collections.defaultdict(collections.Counter)
    for word, colour, kind, block_id in occurrences:
        for key in (None, block_id):
            if colour:
                lexicon[key, word][colour] += 1
            if kind == 'example':
                example_total[key][word] += 1
                if colour:
                    example_coloured[key, word][colour] += 1

    def predict(word, strict, held_out=None):
        colours = lexicon[None, word] - lexicon[held_out, word] if held_out else lexicon[None, word]
        if not colours:
            return None
        colour, _ = colours.most_common(1)[0]
        if strict:
            total = example_total[None][word] - (example_total[held_out][word] if held_out else 0)
            coloured = example_coloured[None, word] - (example_coloured[held_out, word] if held_out else collections.Counter())
            if len(colours) > 1 or not total or coloured[colour] / total < STRICT:
                return None
        return colour

    def score(strict, only=None, held_out=False):
        tp = fp = fn = wrong = 0
        for word, colour, kind, block_id in occurrences:
            if only and kind != only:
                continue
            guess = predict(word, strict, block_id if held_out else None)
            if colour and guess == colour:
                tp += 1
            elif colour and guess:
                wrong += 1
            elif colour:
                fn += 1
            elif guess:
                fp += 1
        coloured = tp + wrong + fn
        flagged = tp + wrong + fp
        return {
            'colouredWords': coloured, 'correct': tp, 'wrongColour': wrong, 'missed': fn, 'overHighlighted': fp,
            'precision': round(tp / flagged, 3) if flagged else None,
            'recall': round(tp / coloured, 3) if coloured else None,
        }

    plain_hits = collections.Counter()
    plain_words = collections.Counter()
    for kind, text in plain:
        for word in WORD.findall(text):
            plain_words[kind] += 1
            if predict(word.lower(), True):
                plain_hits[kind] += 1

    used = set(words_by_colour)
    return {
        'file': record['file'],
        'title': record['title'],
        'legendParagraphNumber': record['legendParagraphNumber'],
        'legendEntries': record['legend']['entries'],
        'colourRuns': {c: dict(v) for c, v in sorted(runs_by_colour.items())},
        'wordsByColour': {c: dict(v.most_common()) for c, v in sorted(words_by_colour.items())},
        'declaredButUnused': sorted(c for c in declared if c not in used and not c.startswith('bg:')),
        'usedButUndeclared': sorted(c for c in used if c not in declared and not c.startswith('bg:')),
        'ambiguousWords': {w: dict(c) for (key, w), c in sorted(lexicon.items(), key=lambda x: x[0][1]) if key is None and len(c) > 1},
        'loose': score(False),
        'looseExamplesOnly': score(False, 'example'),
        'strict': score(True),
        'strictExamplesOnly': score(True, 'example'),
        'heldOutExamples': score(False, 'example', True),
        'strictHeldOutExamples': score(True, 'example', True),
        'plainSurfaces': {k: {'words': plain_words[k], 'strictHighlights': plain_hits[k]} for k in plain_words},
    }


def pct(x):
    return '–' if x is None else f'{x * 100:.0f}%'


def report(results, no_legend):
    lines = ['# Colour-legend matching report', '']
    totals = {k: collections.Counter() for k in ('loose', 'looseExamplesOnly', 'strict', 'strictExamplesOnly', 'heldOutExamples', 'strictHeldOutExamples')}
    for r in results:
        for k in totals:
            totals[k].update({m: v for m, v in r[k].items() if isinstance(v, int)})
    lines += ['## Totals', '', '| Variant | Precision | Recall | Correct | Wrong colour | Missed | Over-highlighted |',
              '|---|---|---|---|---|---|---|']
    for k, t in totals.items():
        flagged = t['correct'] + t['wrongColour'] + t['overHighlighted']
        coloured = t['correct'] + t['wrongColour'] + t['missed']
        lines.append(f"| {k} | {pct(t['correct'] / flagged if flagged else None)} | "
                     f"{pct(t['correct'] / coloured if coloured else None)} | {t['correct']} | {t['wrongColour']} | "
                     f"{t['missed']} | {t['overHighlighted']} |")
    lines += ['', f'Lessons without a legend ({len(no_legend)}): ' + ', '.join(no_legend), '',
              '## Per lesson', '',
              '| Lesson | Legend ¶ | Loose P/R | Strict P/R | Strict P/R (examples) | Held-out strict P/R (examples) | Declared, unused | Used, undeclared | Ambiguous words |',
              '|---|---|---|---|---|---|---|---|---|']
    for r in results:
        ambiguous = ', '.join(w + ' (' + '/'.join(c) + ')' for w, c in list(r['ambiguousWords'].items())[:6])
        lines.append(
            f"| {r['file']} | {r['legendParagraphNumber']} | {pct(r['loose']['precision'])}/{pct(r['loose']['recall'])} | "
            f"{pct(r['strict']['precision'])}/{pct(r['strict']['recall'])} | "
            f"{pct(r['strictExamplesOnly']['precision'])}/{pct(r['strictExamplesOnly']['recall'])} | "
            f"{pct(r['strictHeldOutExamples']['precision'])}/{pct(r['strictHeldOutExamples']['recall'])} | "
            f"{', '.join(r['declaredButUnused']) or '–'} | {', '.join(r['usedButUndeclared']) or '–'} | "
            f"{ambiguous or '–'} |")
    return '\n'.join(lines) + '\n'


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    records = json.load(open(sys.argv[1]))
    results = [analyse(r) for r in records if r['legendFound']]
    no_legend = [r['file'] for r in records if not r['legendFound']]
    json.dump(results, open(sys.argv[2], 'w'), ensure_ascii=False, indent=2)
    open(sys.argv[3], 'w').write(report(results, no_legend))
    print(f'{len(results)} lessons analysed -> {sys.argv[2]}, {sys.argv[3]}')


if __name__ == '__main__':
    main()
