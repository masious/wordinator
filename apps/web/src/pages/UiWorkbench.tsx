import { Menu, Popover, Tooltip } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AdaptiveDialog,
  ArrowIcon,
  Avatar,
  Button,
  CheckboxField,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FieldHelp,
  IconButton,
  LabelChip,
  LoadingState,
  MetadataRow,
  NavigationItem,
  PageContainer,
  PageHeader,
  PasswordField,
  RadioField,
  Reveal,
  SectionHeader,
  SelectField,
  SplitLayout,
  StarIcon,
  StatusPanel,
  Surface,
  TextAreaField,
  TextField,
  ThemePreferenceControl,
} from "../ui";
import styles from "./UiWorkbench.module.css";

export function UiWorkbench() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const swatches = [
    ["page", t("ui.swatchPage")], ["surface", t("ui.swatchSurface")],
    ["action", t("ui.swatchAction")], ["support", t("ui.swatchSupport")],
    ["highlight", t("ui.swatchHighlight")], ["info", t("ui.swatchInfo")],
  ] as const;

  return (
    <main className={styles.page}>
      <PageContainer>
        <Reveal>
          <PageHeader
            eyebrow={<LabelChip>{t("ui.eyebrow")}</LabelChip>}
            title={t("ui.title")}
            intro={t("ui.intro")}
            actions={<Button trailingIcon={<ArrowIcon />}>{t("ui.primary")}</Button>}
          />
        </Reveal>

        <div className={styles.inventory}>
          <Reveal className={styles.foundations}>
            <Surface density="reading">
              <SectionHeader eyebrow={<LabelChip>{t("ui.systemLabel")}</LabelChip>} title={t("ui.foundations")} description={t("ui.foundationIntro")} />
              <div className={styles.swatches}>{swatches.map(([token, label]) => (
                <div className={styles.swatch} key={token}>
                  <span aria-hidden="true" className={styles.swatchColor} style={{ background: `var(--color-${token})` }} />
                  <span>{label}</span><code>--color-{token}</code>
                </div>
              ))}</div>
              <div className={styles.typeSpecimen}>
                <p className={styles.displayType}>{t("ui.typeSample")}</p>
                <p>{t("ui.bodySample")}</p>
                <MetadataRow><span>{t("ui.metadataSample")}</span><span>09:42</span></MetadataRow>
              </div>
              <dl className={styles.foundationMetrics}>
                <div><dt>{t("ui.rhythmLabel")}</dt><dd>{t("ui.rhythmValue")}</dd></div>
                <div><dt>{t("ui.radiusLabel")}</dt><dd>{t("ui.radiusValue")}</dd></div>
                <div><dt>{t("ui.motionLabel")}</dt><dd>{t("ui.motionValue")}</dd></div>
                <div><dt>{t("ui.measureLabel")}</dt><dd>{t("ui.measureValue")}</dd></div>
              </dl>
            </Surface>
          </Reveal>

          <Reveal className={styles.themeFoundation} delay={40}>
            <SectionHeader eyebrow={<LabelChip>{t("ui.themeEyebrow")}</LabelChip>} title={t("ui.themeTitle")} description={t("ui.themeIntro")} />
            <div className={styles.themeGrid}>
              <div className={styles.themePreference}><Surface tone="inset"><ThemePreferenceControl /></Surface></div>
              {(["light", "dark"] as const).map((scheme) => (
                <div className={styles.themePreview} data-theme-preview={scheme} key={scheme}>
                  <span className={styles.previewLabel}>{t(`theme.${scheme}`)}</span>
                  <Surface>
                    <div className={styles.themePreviewBody}>
                      <nav aria-label={t("ui.themeNavigationPreview")} className={styles.navigation}>
                        <NavigationItem active href={`#${scheme}-journal`} icon={<StarIcon />}>{t("nav.journal")}</NavigationItem>
                        <NavigationItem href={`#${scheme}-settings`}>{t("nav.settings")}</NavigationItem>
                      </nav>
                      <p className={styles.themeAuthored}>{t("ui.themeAuthored")}</p>
                      <div className={styles.row}><Button>{t("ui.primary")}</Button><Button variant="secondary">{t("ui.secondary")}</Button><Button disabled>{t("ui.disabled")}</Button></div>
                      <TextField error={t("ui.validation")} label={t("ui.invalidField")} value="INV-2026" readOnly />
                      <StatusPanel title={t("ui.infoTitle")}>{t("ui.infoBody")}</StatusPanel>
                      <LoadingState label={t("ui.loadingContent")} />
                    </div>
                  </Surface>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className={styles.actions} delay={70}>
            <Surface tone="featured">
              <SectionHeader title={t("ui.actions")} description={t("ui.actionsIntro")} />
              <div className={styles.actionRows}>
                <div className={styles.row}>
                  <Button trailingIcon={<ArrowIcon />}>{t("ui.primary")}</Button>
                  <Button variant="secondary">{t("ui.secondary")}</Button>
                  <Button variant="quiet">{t("ui.quiet")}</Button>
                  <Button variant="danger">{t("ui.danger")}</Button>
                </div>
                <div className={styles.row}>
                  <Button loading>{t("ui.loading")}</Button>
                  <Button disabled>{t("ui.disabled")}</Button>
                  <Tooltip label={t("ui.favoriteTip")}><IconButton label={t("ui.favorite")}><StarIcon /></IconButton></Tooltip>
                </div>
                <div className={styles.row}>
                  <Button size="sm">{t("ui.small")}</Button><Button size="md">{t("ui.medium")}</Button><Button size="lg">{t("ui.large")}</Button>
                  <IconButton label={t("ui.smallIcon")} size="sm"><StarIcon /></IconButton><IconButton label={t("ui.largeIcon")} size="lg"><StarIcon /></IconButton>
                </div>
              </div>
            </Surface>
          </Reveal>

          <Reveal className={styles.forms} delay={110}>
            <Surface>
              <SectionHeader title={t("ui.forms")} description={t("ui.formsIntro")} />
              <div className={styles.form}>
                <TextField label={t("ui.name")} required placeholder={t("ui.namePlaceholder")} />
                <PasswordField label={t("ui.password")} />
                <TextAreaField label={t("ui.notes")} description={t("ui.help")} minRows={3} />
                <SelectField label={t("ui.language")} data={[t("ui.dutch"), t("ui.german")]} />
                <div className={styles.choiceRow}><CheckboxField label={t("ui.checkbox")} /><RadioField label={t("ui.radio")} /></div>
                <TextField error={<FieldHelp error id="field-error">{t("ui.validation")}</FieldHelp>} label={t("ui.invalidField")} />
                <TextField disabled label={t("ui.disabledField")} value={t("ui.disabledValue")} />
              </div>
            </Surface>
          </Reveal>

          <Reveal className={styles.surfaces} delay={140}>
            <SectionHeader title={t("ui.surfaces")} description={t("ui.surfacesIntro")} />
            <div className={styles.surfaceStack}>
              <Surface><h3>{t("ui.surfaceDefault")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
              <Surface tone="quiet"><h3>{t("ui.surfaceQuiet")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
              <Surface tone="inset"><h3>{t("ui.surfaceInset")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
              <Surface tone="danger"><h3>{t("ui.surfaceDanger")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
            </div>
          </Reveal>

          <Reveal className={styles.feedback} delay={170}>
            <Surface>
              <SectionHeader title={t("ui.feedback")} />
              <div className={styles.feedbackStack}>
                <StatusPanel title={t("ui.infoTitle")}>{t("ui.infoBody")}</StatusPanel>
                <StatusPanel tone="success" title={t("ui.successTitle")} />
                <StatusPanel tone="error" title={t("ui.errorTitle")} />
                <LoadingState label={t("ui.loadingContent")} />
                <EmptyState title={t("ui.emptyTitle")} action={<Button variant="secondary">{t("ui.emptyAction")}</Button>}>{t("ui.emptyBody")}</EmptyState>
                <ErrorState title={t("ui.errorStateTitle")} action={<Button>{t("common.retry")}</Button>}>{t("ui.errorStateBody")}</ErrorState>
              </div>
            </Surface>
          </Reveal>

          <Reveal className={styles.composition} delay={200}>
            <Surface tone="quiet">
              <SectionHeader title={t("ui.composition")} description={t("ui.compositionIntro")} />
              <SplitLayout
                primary={<div className={styles.identity}><Avatar name="Mina Vos" /><div><h3>Mina Vos</h3><p>{t("ui.identityBody")}</p></div></div>}
                secondary={<div><LabelChip>{t("ui.longChip")}</LabelChip><p>{t("ui.longContent")}</p></div>}
              />
              <nav aria-label={t("ui.navigationPreview")} className={styles.navigation}>
                <NavigationItem active href="#journal" icon={<StarIcon />}>{t("nav.journal")}</NavigationItem>
                <NavigationItem href="#members">{t("nav.members")}</NavigationItem>
                <NavigationItem href="#settings">{t("nav.settings")}</NavigationItem>
              </nav>
            </Surface>
          </Reveal>

          <Reveal className={styles.overlays} delay={230}>
            <Surface tone="featured">
              <SectionHeader title={t("ui.overlays")} description={t("ui.overlaysIntro")} />
              <div className={styles.row}>
                <Button onClick={() => setDialog(true)}>{t("ui.openDialog")}</Button>
                <Button variant="danger" onClick={() => setConfirm(true)}>{t("ui.openConfirm")}</Button>
                <Menu><Menu.Target><Button variant="secondary">{t("ui.openMenu")}</Button></Menu.Target><Menu.Dropdown><Menu.Item>{t("ui.menuEdit")}</Menu.Item><Menu.Item color="red">{t("ui.menuRemove")}</Menu.Item></Menu.Dropdown></Menu>
                <Popover width={260} position="bottom" withArrow><Popover.Target><Button variant="quiet">{t("ui.openPopover")}</Button></Popover.Target><Popover.Dropdown>{t("ui.popoverBody")}</Popover.Dropdown></Popover>
              </div>
            </Surface>
          </Reveal>

          <Reveal className={styles.responsive} delay={260}>
            <SectionHeader title={t("ui.responsive")} description={t("ui.responsiveIntro")} />
            <div className={styles.previewGrid}>
              <div className={styles.widePreview}><span>{t("ui.wide")}</span><div><strong>{t("ui.previewTitle")}</strong><Button variant="secondary">{t("ui.previewAction")}</Button></div></div>
              <div className={styles.narrowPreview}><span>{t("ui.narrow")}</span><div><strong>{t("ui.previewTitle")}</strong><Button variant="secondary">{t("ui.previewAction")}</Button></div></div>
            </div>
          </Reveal>
        </div>

        <AdaptiveDialog opened={dialog} onClose={() => setDialog(false)} title={t("ui.dialogTitle")}>
          <p>{t("ui.dialogBody")}</p><div className={styles.dialogActions}><Button onClick={() => setDialog(false)}>{t("ui.close")}</Button></div>
        </AdaptiveDialog>
        <ConfirmDialog cancelLabel={t("common.cancel")} confirmLabel={t("ui.confirm")} opened={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title={t("ui.confirmTitle")}>
          <p>{t("ui.confirmBody")}</p>
        </ConfirmDialog>
      </PageContainer>
    </main>
  );
}
