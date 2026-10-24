import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Turn = { speaker: string; text: string; translation: string };
type DialogueSource = { blockId: string; turns: Turn[] };
type LessonBlock = { type?: string; id?: string; props?: { turns?: unknown }; children?: LessonBlock[] };
type LessonFile = { blocks: LessonBlock[] };

const root = "content/dutch-foundations";
const sourceByBlock = new Map<string, Turn[]>();
for (const name of readdirSync(join(root, "dialogues")).filter((value) => value.endsWith(".json")).sort()) {
  const source = JSON.parse(readFileSync(join(root, "dialogues", name), "utf8")) as Array<{ dialogues: DialogueSource[] }>;
  for (const lesson of source) for (const dialogue of lesson.dialogues) {
    if (sourceByBlock.has(dialogue.blockId)) throw new Error(`Duplicate dialogue block ${dialogue.blockId}`);
    if (!dialogue.turns.every((turn) => typeof turn.translation === "string" && turn.translation.trim())) throw new Error(`Missing translation in ${dialogue.blockId}`);
    sourceByBlock.set(dialogue.blockId, dialogue.turns);
  }
}

const seen = new Set<string>();
const walk = (blocks: LessonBlock[]): void => {
  for (const block of blocks) {
    if (block.type === "dialogue" && typeof block.id === "string") {
      const sourceTurns = sourceByBlock.get(block.id);
      if (!sourceTurns) throw new Error(`No source translation for lesson dialogue ${block.id}`);
      const rawTurns = block.props?.turns;
      const lessonTurns = Array.isArray(rawTurns) ? rawTurns as Array<{ speaker: string; text: string }> : typeof rawTurns === "string" ? JSON.parse(rawTurns) as Array<{ speaker: string; text: string }> : null;
      if (!lessonTurns) throw new Error(`Invalid lesson turns for ${block.id}`);
      if (lessonTurns.length !== sourceTurns.length) throw new Error(`Turn count mismatch for ${block.id}`);
      block.props.turns = lessonTurns.map((turn, index) => {
        const sourceTurn = sourceTurns[index]!;
        if (turn.speaker !== sourceTurn.speaker || turn.text !== sourceTurn.text) throw new Error(`Turn mismatch for ${block.id}:${index}`);
        return { ...turn, translation: sourceTurn.translation };
      });
      seen.add(block.id);
    }
    if (block.children) walk(block.children);
  }
};

for (const part of readdirSync(root).filter((value) => /^part-[ivx]+$/.test(value)).sort()) {
  const directory = join(root, part);
  for (const name of readdirSync(directory).filter((value) => /^\d.*\.json$/.test(value)).sort()) {
    const path = join(directory, name);
    const file = JSON.parse(readFileSync(path, "utf8")) as LessonFile;
    walk(file.blocks);
    writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
  }
}
for (const blockId of sourceByBlock.keys()) if (!seen.has(blockId)) throw new Error(`Source dialogue not found in lesson files: ${blockId}`);
console.log(`Synced ${seen.size} dialogue blocks and ${[...sourceByBlock.values()].reduce((sum, turns) => sum + turns.length, 0)} turns.`);
