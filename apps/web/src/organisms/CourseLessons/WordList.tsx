import { PlainText } from "../../molecules/PlainText";
import styles from "./LessonWords.module.css";

export type WordListItem = { term: string; translation: string };

// The term and its meaning, as a vocabulary row shows them. Shared by the panel's rows and the display-only WordList.
export function WordCopy({ term, meaning }: { term: string; meaning: string }) {
  return <>
    <p className={styles.term}>{term}</p>
    <p className={styles.meaning}><PlainText>{meaning}</PlainText></p>
  </>;
}

// A display-only list of words, with no bookmark, pronunciation, or expansion: the story summary's new words.
export function WordList({ items }: { items: readonly WordListItem[] }) {
  return <ul className={styles.list}>
    {items.map((item, index) => <li key={`${index}-${item.term}`} className={styles.word}>
      <div className={styles.copy}><WordCopy term={item.term} meaning={item.translation} /></div>
    </li>)}
  </ul>;
}
