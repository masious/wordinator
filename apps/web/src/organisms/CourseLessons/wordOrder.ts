// "Put in order" practice questions list the words to arrange after this prefix, separated by " / " (docs/courses.md#practice-answers).
// Detection is per question and lives only here, in the web app: the answer check is the contracts' `answerMatches` on the whole item,
// which the server repeats for attempts, so no other code needs to know a question is a word order.
const PREFIX = "Put in order:";
const SEPARATOR = " / ";

// The words a word-order prompt lists, or null for any other prompt (including a prefix with no words after it).
export function wordOrderWords(prompt: string): string[] | null {
  const text = prompt.trimStart();
  if (!text.startsWith(PREFIX)) return null;
  const words = text.slice(PREFIX.length).split(SEPARATOR).map((word) => word.trim()).filter(Boolean);
  return words.length ? words : null;
}

// The answer for a word order: the words in their current order, joined by one space.
export const joinWordOrder = (words: readonly string[]) => words.join(" ");

// The words in the order a saved answer spells them, or null when the answer is not exactly those words joined by single spaces in
// some order (a typed answer from before the prompt changed, for example). Words may contain spaces, so the search tries each word
// that the remaining text starts with; repeated words are tried once per spelling.
export function wordOrderFromAnswer(words: readonly string[], answer: string): string[] | null {
  const arrange = (rest: string, left: readonly number[]): string[] | null => {
    if (left.length === 0) return rest === "" ? [] : null;
    const tried = new Set<string>();
    for (const index of left) {
      const word = words[index]!;
      if (tried.has(word) || !rest.startsWith(word)) continue;
      tried.add(word);
      const remaining = left.filter((entry) => entry !== index);
      const after = rest.slice(word.length);
      if (remaining.length === 0) {
        if (after === "") return [word];
        continue;
      }
      if (!after.startsWith(" ")) continue;
      const tail = arrange(after.slice(1), remaining);
      if (tail) return [word, ...tail];
    }
    return null;
  };
  return arrange(answer, words.map((_, index) => index));
}
