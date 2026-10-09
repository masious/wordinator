import { speechCastKey, type CourseSpeechCastResponse, type SpeechCast, type SpeechVoice } from "@wordinator/contracts";
import { useTranslation } from "react-i18next";
import { SpeechButton } from "../../molecules/Speech";
import { SelectField } from "../../ui";
import styles from "./SpeechCastFields.module.css";

// The course owner's dialogue cast (docs/speech.md#dialogue-cast): a voice per speaker of the course's dialogues, or Automatic,
// and a sample of every voice. Speakers match the cast trimmed and case-insensitively, like the API.
const AUTOMATIC = "automatic";
export const voiceName = (voice: SpeechVoice) => voice.split("-")[2]!.replace(/Neural$/, "");

export function castVoice(cast: SpeechCast, speaker: string) {
  return Object.entries(cast).find(([label]) => speechCastKey(label) === speechCastKey(speaker))?.[1] ?? null;
}

export function withCastVoice(cast: SpeechCast, speaker: string, voice: SpeechVoice | null): SpeechCast {
  const rest = Object.fromEntries(Object.entries(cast).filter(([label]) => speechCastKey(label) !== speechCastKey(speaker)));
  return voice ? { ...rest, [speaker.trim()]: voice } : rest;
}

export function SpeechCastFields({ data, cast, onChange }: { data: CourseSpeechCastResponse; cast: SpeechCast; onChange: (cast: SpeechCast) => void }) {
  const { t } = useTranslation();
  const label = (voice: SpeechVoice, index: number) => index === 0 ? t("courses.cast.narrator", { voice: voiceName(voice) }) : voiceName(voice);
  const options = [{ value: AUTOMATIC, label: t("courses.cast.automatic") }, ...data.voices.map(({ voice }, index) => ({ value: voice, label: label(voice, index) }))];
  return <fieldset className={styles.cast}>
    <legend>{t("courses.cast.title")}</legend>
    <p className={styles.help}>{t("courses.cast.help")}</p>
    <ul className={styles.voices} aria-label={t("courses.cast.voices")}>
      {data.voices.map(({ voice, sample }, index) => <li key={voice}>
        <span>{label(voice, index)}</span>
        <SpeechButton url={sample} label={t("courses.cast.sample", { voice: voiceName(voice) })} />
      </li>)}
    </ul>
    {data.speakers.length
      ? <div className={styles.speakers}>{data.speakers.map((speaker) =>
        <SelectField key={speechCastKey(speaker)} label={t("courses.cast.speakerVoice", { speaker })} data={options} allowDeselect={false}
          value={castVoice(cast, speaker) ?? AUTOMATIC}
          onChange={(value) => onChange(withCastVoice(cast, speaker, value && value !== AUTOMATIC ? value as SpeechVoice : null))} />)}
      </div>
      : <p className={styles.help}>{t("courses.cast.noSpeakers")}</p>}
  </fieldset>;
}
