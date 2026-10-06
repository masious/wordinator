import { Slider } from "@mantine/core";
import { type KeyboardEvent, useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api";
import { AdaptiveDialog, Button } from "../../ui";
import { clampZoom, type CropOutput, MAX_ZOOM, MIN_ZOOM, renderCroppedImage, ZOOM_STEP } from "./crop";
import styles from "./ImageCropper.module.css";

const CENTER: Point = { x: 0, y: 0 };

// Lets a person choose which part of an image is kept. The parent receives the rendered output and decides what to do with it;
// if that promise rejects, the dialog stays open with the selection intact so the person can retry.
export function ImageCropper({ file, output, onCancel, onConfirm }: {
  file: File | null; output: CropOutput; onCancel: () => void; onConfirm: (cropped: File) => Promise<unknown> | void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>(CENTER);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCrop(CENTER); setZoom(MIN_ZOOM); setArea(null); setError("");
    if (!file) { setSource(null); return; }
    const url = URL.createObjectURL(file); setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const save = async () => {
    if (!file) return;
    setSaving(true); setError("");
    try { await onConfirm(await renderCroppedImage(file, area, output)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.code : caught instanceof Error ? caught.message : "generic"); }
    finally { setSaving(false); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom((value) => clampZoom(value + ZOOM_STEP)); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); setZoom((value) => clampZoom(value - ZOOM_STEP)); }
  };

  return <AdaptiveDialog opened={file !== null} onClose={() => { if (!saving) onCancel(); }} title={t("media.cropTitle")}>
    <p className={styles.help}>{t("media.cropHelp")}</p>
    <div className={`${styles.stage} ${output.width === output.height ? styles.square : styles.wide}`} onKeyDown={onKeyDown}>
      {source && <Cropper
        image={source} crop={crop} zoom={zoom} aspect={output.width / output.height} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
        onCropChange={setCrop} onZoomChange={(value) => setZoom(clampZoom(value))} onCropComplete={(_, pixels) => setArea(pixels)}
        showGrid={false} keyboardStep={8} disableAutomaticStylesInjection
        classes={{ containerClassName: styles.container, cropAreaClassName: styles.cropArea, mediaClassName: styles.media }}
        cropperProps={{ role: "group", "aria-label": t("media.cropFrame") }}
      />}
    </div>
    <div className={styles.controls}>
      <Slider className={styles.zoom} label={null} min={MIN_ZOOM} max={MAX_ZOOM} step={ZOOM_STEP} value={zoom} onChange={(value) => setZoom(clampZoom(value))} thumbLabel={t("media.zoom")} aria-label={t("media.zoom")} />
      <Button variant="quiet" onClick={() => { setCrop(CENTER); setZoom(MIN_ZOOM); }}>{t("media.resetCrop")}</Button>
    </div>
    {error && <p className={styles.error} role="alert">{t(`errors.${error}`, { defaultValue: t("errors.generic") })}</p>}
    <div className={styles.actions}>
      <Button variant="quiet" disabled={saving} onClick={onCancel}>{t("common.cancel")}</Button>
      <Button loading={saving} onClick={() => void save()}>{t("media.saveCrop")}</Button>
    </div>
  </AdaptiveDialog>;
}
