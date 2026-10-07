import { SegmentedControl, Slider } from "@mantine/core";
import { lessonImageUploadResponseSchema, type LessonImageUploadResponse } from "@wordinator/contracts/lesson-document";
import { useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api";
import { clampZoom, MAX_ZOOM, MIN_ZOOM, renderLessonImage, ZOOM_STEP } from "../ImageCropper/crop";
import cropStyles from "../ImageCropper/ImageCropper.module.css";
import { AdaptiveDialog, Button } from "../../ui";
import styles from "./LessonEditor.module.css";

const CENTER: Point = { x: 0, y: 0 };
// react-easy-crop always crops to a fixed ratio, so "whole" uses the image's own ratio and keeps everything.
const ASPECTS = { whole: null, landscape: 4 / 3, wide: 16 / 9, square: 1, portrait: 3 / 4 } as const;
type Aspect = keyof typeof ASPECTS;

async function uploadLessonImage(path: string, file: File): Promise<LessonImageUploadResponse> {
  const form = new FormData(); form.set("image", file);
  const response = await fetch(`${path}/images`, { method: "POST", body: form });
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return lessonImageUploadResponseSchema.parse(data);
  const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
  throw new ApiError(response.status, error?.code ?? "UNKNOWN_ERROR", error?.message ?? "Something went wrong.");
}

// Every lesson image passes through here: the author may crop it, it is re-encoded on this device (dropping metadata and
// fitting the upload limit), and uploaded to this lesson. Errors keep the dialog open so the author can retry.
export function LessonImageDialog({ path, file, onUploaded, onCancel }: {
  path: string; file: File | null; onUploaded: (image: LessonImageUploadResponse) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<{ url: string; ratio: number } | null>(null);
  const [aspect, setAspect] = useState<Aspect>("whole");
  const [crop, setCrop] = useState<Point>(CENTER);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAspect("whole"); setCrop(CENTER); setZoom(MIN_ZOOM); setArea(null); setError(""); setSource(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setSource({ url, ratio: image.naturalWidth / image.naturalHeight });
    image.onerror = () => setError("IMAGE_TYPE_INVALID");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const whole = aspect === "whole" && zoom === MIN_ZOOM;
  const save = async () => {
    if (!file) return;
    setSaving(true); setError("");
    try { onUploaded(await uploadLessonImage(path, await renderLessonImage(file, whole ? null : area))); }
    catch (caught) { setError(caught instanceof ApiError ? caught.code : caught instanceof Error ? caught.message : "generic"); }
    finally { setSaving(false); }
  };

  return <AdaptiveDialog opened={file !== null} onClose={() => { if (!saving) onCancel(); }} title={t("courses.editor.image.title")}>
    <div className={styles.imageDialog}>
      <p className={cropStyles.help}>{t("courses.editor.image.help")}</p>
      <SegmentedControl fullWidth value={aspect} onChange={(value) => { setAspect(value as Aspect); setCrop(CENTER); setZoom(MIN_ZOOM); }}
        aria-label={t("courses.editor.image.aspect")}
        data={(Object.keys(ASPECTS) as Aspect[]).map((value) => ({ value, label: t(`courses.editor.image.aspects.${value}`) }))} />
      <div className={`${cropStyles.stage} ${cropStyles.wide}`}>
        {source && <Cropper
          image={source.url} crop={crop} zoom={zoom} aspect={ASPECTS[aspect] ?? source.ratio} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
          onCropChange={setCrop} onZoomChange={(value) => setZoom(clampZoom(value))} onCropComplete={(_, pixels) => setArea(pixels)}
          showGrid={false} keyboardStep={8} disableAutomaticStylesInjection objectFit="contain"
          classes={{ containerClassName: cropStyles.container, cropAreaClassName: cropStyles.cropArea, mediaClassName: cropStyles.media }}
          cropperProps={{ role: "group", "aria-label": t("media.cropFrame") }}
        />}
      </div>
      <div className={cropStyles.controls}>
        <Slider className={cropStyles.zoom} label={null} min={MIN_ZOOM} max={MAX_ZOOM} step={ZOOM_STEP} value={zoom} onChange={(value) => setZoom(clampZoom(value))} thumbLabel={t("media.zoom")} aria-label={t("media.zoom")} />
        <Button variant="quiet" onClick={() => { setAspect("whole"); setCrop(CENTER); setZoom(MIN_ZOOM); }}>{t("media.resetCrop")}</Button>
      </div>
      <p className={cropStyles.help}>{t("media.publicNotice")} {t("courses.editor.image.altHelp")}</p>
      {error && <p className={cropStyles.error} role="alert">{t(`errors.${error}`, { defaultValue: t("errors.generic") })}</p>}
      <div className={cropStyles.actions}>
        <Button variant="quiet" disabled={saving} onClick={onCancel}>{t("common.cancel")}</Button>
        <Button loading={saving} disabled={!source} onClick={() => void save()}>{t("courses.editor.image.insert")}</Button>
      </div>
    </div>
  </AdaptiveDialog>;
}
