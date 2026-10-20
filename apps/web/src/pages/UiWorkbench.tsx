import { Menu, Popover, SegmentedControl, Tooltip } from "@mantine/core";
import { BookOpen, ChevronRight, Clock, Languages, Sparkles, Volume2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProgressMeter } from "../molecules/ProgressMeter";
import {
  AdaptiveDialog,
  ArrowIcon,
  Avatar,
  Button,
  ButtonGroup,
  CheckboxField,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Eyebrow,
  FieldHelp,
  IconButton,
  LabelChip,
  LoadingState,
  MetadataItem,
  MetadataRow,
  NavigationItem,
  PasswordField,
  RadioField,
  SearchField,
  SectionHeader,
  SelectField,
  StarIcon,
  StatusPanel,
  Surface,
  TextAreaField,
  TextField,
  ThemePreferenceControl,
} from "../ui";
import styles from "./UiWorkbench.module.css";

// A numbered workbench section: the number, title, and intro beside each other, then the section's panels.
function WorkbenchSection({ number, title, intro, children }: { number: string; title: string; intro: string; children: ReactNode }) {
  return <section className={styles.section} aria-labelledby={`ui-section-${number}`}>
    <header className={styles.sectionHeading}>
      <span aria-hidden="true">{number}</span>
      <div><h2 id={`ui-section-${number}`}>{title}</h2><p>{intro}</p></div>
    </header>
    {children}
  </section>;
}

export function UiWorkbench() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [view, setView] = useState("week");
  const [library, setLibrary] = useState(false);
  const swatches = [
    ["foreground", t("ui.swatchInk")], ["page", t("ui.swatchCanvas")], ["surface-raised", t("ui.swatchPaper")],
    ["action", t("ui.swatchAccent")], ["info-soft", t("ui.swatchBlue")], ["support-soft", t("ui.swatchLime")],
  ] as const;

  return (
    <main className={styles.page}>
      <div className={styles.workbench}>
        <header className={styles.hero}>
          <div>
            <Eyebrow>{t("ui.eyebrow")}</Eyebrow>
            <h1>{t("ui.title")}</h1>
            <p>{t("ui.intro")}</p>
          </div>
          <div aria-hidden="true" className={styles.heroMark}><Sparkles size={28} /><span>{t("ui.mark")}</span></div>
        </header>

        <WorkbenchSection number="01" title={t("ui.foundations")} intro={t("ui.foundationIntro")}>
          <Surface>
            <div className={styles.swatches}>{swatches.map(([token, label]) => (
              <div className={styles.swatch} key={token}>
                <span aria-hidden="true" style={{ background: `var(--color-${token})` }} />
                <strong>{label}</strong><code>--color-{token}</code>
              </div>
            ))}</div>
            <div className={styles.typeSpecimen}>
              <div><span>{t("ui.typeDisplay")}</span><p className={styles.displaySample}>{t("ui.displaySample")}</p></div>
              <div><span>{t("ui.typeHeading")}</span><p className={styles.headingSample}>{t("ui.headingSample")}</p></div>
              <div><span>{t("ui.typeBody")}</span><p>{t("ui.bodySample")}</p></div>
              <div><span>{t("ui.typeLabel")}</span><Eyebrow>{t("ui.labelSample")}</Eyebrow></div>
            </div>
          </Surface>
        </WorkbenchSection>

        <WorkbenchSection number="02" title={t("ui.controls")} intro={t("ui.controlsIntro")}>
          <div className={styles.controlGrid}>
            <Surface className={styles.demo}>
              <h3>{t("ui.buttonsTitle")}</h3>
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
                <IconButton label={t("ui.groupReview")} tone="quiet"><Volume2 size={18} /></IconButton>
                <IconButton label={t("ui.groupContinue")} tone="primary"><ChevronRight size={18} /></IconButton>
                <IconButton label={t("ui.searchLibraryToggle")} tone="quiet" pressed={library} onClick={() => setLibrary((on) => !on)}><Languages size={18} /></IconButton>
              </div>
              <div className={styles.row}>
                <Button size="sm">{t("ui.small")}</Button><Button size="md">{t("ui.medium")}</Button><Button size="lg">{t("ui.large")}</Button>
              </div>
              <ButtonGroup label={t("ui.groupLesson")}>
                <Button>{t("ui.groupContinue")}</Button>
                <Button variant="secondary">{t("ui.groupReview")}</Button>
                <Button variant="secondary">{t("ui.groupPractice")}</Button>
              </ButtonGroup>
            </Surface>
            <Surface className={styles.demo}>
              <h3>{t("ui.fieldsTitle")}</h3>
              <SearchField aria-label={t("ui.searchLabel")} placeholder={t("ui.searchPlaceholder")} />
              <SearchField aria-label={library ? t("ui.librarySearchLabel") : t("ui.scopedSearchLabel")}
                placeholder={library ? t("ui.librarySearchPlaceholder") : t("ui.scopedSearchPlaceholder")}
                toggle={{ icon: <Languages aria-hidden="true" />, label: t("ui.searchLibraryToggle"), pressed: library, onToggle: () => setLibrary((on) => !on) }} />
              <SegmentedControl aria-label={t("ui.groupView")} value={view} onChange={setView} fullWidth
                data={[{ value: "day", label: t("ui.groupDay") }, { value: "week", label: t("ui.groupWeek") }, { value: "month", label: t("ui.groupMonth") }]} />
              <SegmentedControl aria-label={t("ui.compactView")} size="xs" value={view} onChange={setView}
                data={[{ value: "week", label: t("ui.groupWeek") }, { value: "month", label: t("ui.groupMonth") }]} />
              <ProgressMeter value={64} label={t("ui.progressSample")} showLabel />
              <ProgressMeter value={100} label={t("ui.lessonSample")} showLabel />
            </Surface>
            <Surface className={styles.demo}>
              <h3>{t("ui.identityTitle")}</h3>
              <div className={styles.row}>
                <LabelChip>{t("ui.badgeDefault")}</LabelChip>
                <LabelChip tone="accent">{t("ui.badgeAccent")}</LabelChip>
                <LabelChip tone="success">{t("ui.badgeSuccess")}</LabelChip>
                <LabelChip tone="warm">{t("ui.badgeWarm")}</LabelChip>
                <LabelChip tone="info">{t("ui.badgeInfo")}</LabelChip>
              </div>
              <div className={styles.row}>
                <Avatar name={t("ui.userName")} />
                <Avatar name={t("ui.tutorName")} tone="accent" />
                <Avatar name={t("ui.userName")} tone="soft" />
              </div>
              <MetadataRow>
                <MetadataItem icon={<BookOpen />}>{t("ui.metadataLessons")}</MetadataItem>
                <MetadataItem icon={<Clock />}>{t("ui.metadataWords")}</MetadataItem>
              </MetadataRow>
              <LabelChip>{t("ui.longChip")}</LabelChip>
            </Surface>
          </div>
        </WorkbenchSection>

        <WorkbenchSection number="03" title={t("ui.patterns")} intro={t("ui.patternsIntro")}>
          <div className={styles.patternGrid}>
            <div className={styles.pattern}>
              <span className={styles.patternLabel}>{t("ui.patternCourse")}</span>
              <article className={styles.courseCard}>
                <div aria-hidden="true" className={styles.courseArt}><span className={styles.courseShape} /><span className={styles.courseGlyph}><BookOpen size={28} /></span></div>
                <div className={styles.courseBody}>
                  <LabelChip tone="accent">{t("ui.courseLevel")}</LabelChip>
                  <h3>{t("ui.courseTitle")}</h3>
                  <MetadataRow><MetadataItem icon={<BookOpen />}>{t("ui.courseLessons")}</MetadataItem></MetadataRow>
                  <ProgressMeter value={68} label={t("ui.progressSample")} showLabel />
                </div>
              </article>
            </div>
            <div className={styles.pattern}>
              <span className={styles.patternLabel}>{t("ui.patternReference")}</span>
              <article className={styles.referenceItem}>
                <div className={styles.referenceTop}><LabelChip tone="accent">{t("ui.referenceNumber")}</LabelChip><IconButton label={t("ui.groupReview")}><Volume2 size={16} /></IconButton></div>
                <h4>{t("ui.referenceTerm")}</h4>
                <p>{t("ui.referenceMeaning")}</p>
              </article>
            </div>
          </div>
          <div className={styles.pattern}>
            <span className={styles.patternLabel}>{t("ui.patternConversation")}</span>
            <div className={styles.conversation}>
              <div className={styles.turn}>
                <Avatar name={t("ui.tutorName")} tone="accent" />
                <div className={styles.turnContent}><p className={styles.turnMeta}>{t("ui.tutorName")}</p><p>{t("ui.tutorTurn")}</p></div>
              </div>
              <div className={`${styles.turn} ${styles.turnUser}`}>
                <Avatar name={t("ui.userName")} />
                <div className={styles.turnContent}><p>{t("ui.userTurn")}</p></div>
              </div>
            </div>
          </div>
        </WorkbenchSection>

        <WorkbenchSection number="04" title={t("ui.themeTitle")} intro={t("ui.themeIntro")}>
          <div className={styles.themeGrid}>
            <Surface tone="inset"><ThemePreferenceControl /></Surface>
            {(["light", "dark"] as const).map((scheme) => (
              <div className={styles.themePreview} data-theme-preview={scheme} key={scheme}>
                <span className={styles.patternLabel}>{t(`theme.${scheme}`)}</span>
                <Surface>
                  <div className={styles.stack}>
                    <nav aria-label={t("ui.themeNavigationPreview")} className={styles.navigation}>
                      <NavigationItem active href={`#${scheme}-journal`} icon={<StarIcon />}>{t("nav.journal")}</NavigationItem>
                      <NavigationItem href={`#${scheme}-settings`}>{t("nav.settings")}</NavigationItem>
                    </nav>
                    <p className={styles.authored}>{t("ui.themeAuthored")}</p>
                    <div className={styles.row}><Button>{t("ui.primary")}</Button><Button variant="secondary">{t("ui.secondary")}</Button><Button disabled>{t("ui.disabled")}</Button></div>
                    <TextField error={t("ui.validation")} label={t("ui.invalidField")} value="INV-2026" readOnly />
                    <ProgressMeter value={42} label={t("ui.progressSample")} showLabel />
                    <StatusPanel title={t("ui.infoTitle")}>{t("ui.infoBody")}</StatusPanel>
                    <LoadingState label={t("ui.loadingContent")} />
                  </div>
                </Surface>
              </div>
            ))}
          </div>
        </WorkbenchSection>

        <WorkbenchSection number="05" title={t("ui.inventory")} intro={t("ui.inventoryIntro")}>
          <div className={styles.inventory}>
            <Surface className={styles.demo}>
              <SectionHeader title={t("ui.forms")} description={t("ui.formsIntro")} />
              <TextField label={t("ui.name")} required placeholder={t("ui.namePlaceholder")} />
              <PasswordField label={t("ui.password")} />
              <TextAreaField label={t("ui.notes")} description={t("ui.help")} minRows={3} />
              <SelectField label={t("ui.language")} data={[t("ui.dutch"), t("ui.german")]} />
              <div className={styles.row}><CheckboxField label={t("ui.checkbox")} /><RadioField label={t("ui.radio")} /></div>
              <TextField error={<FieldHelp error id="field-error">{t("ui.validation")}</FieldHelp>} label={t("ui.invalidField")} />
              <TextField disabled label={t("ui.disabledField")} value={t("ui.disabledValue")} />
            </Surface>
            <div className={styles.stack}>
              <SectionHeader title={t("ui.surfaces")} description={t("ui.surfacesIntro")} />
              <div className={styles.surfaceGrid}>
                <Surface><h3>{t("ui.surfaceDefault")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
                <Surface tone="quiet"><h3>{t("ui.surfaceQuiet")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
                <Surface tone="inset"><h3>{t("ui.surfaceInset")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
                <Surface tone="featured"><h3>{t("ui.surfaceFeatured")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
                <Surface tone="danger"><h3>{t("ui.surfaceDanger")}</h3><p>{t("ui.surfaceBody")}</p></Surface>
              </div>
              <Surface className={styles.demo}>
                <SectionHeader title={t("ui.overlays")} description={t("ui.overlaysIntro")} />
                <div className={styles.row}>
                  <Button onClick={() => setDialog(true)}>{t("ui.openDialog")}</Button>
                  <Button variant="danger" onClick={() => setConfirm(true)}>{t("ui.openConfirm")}</Button>
                  <Menu><Menu.Target><Button variant="secondary">{t("ui.openMenu")}</Button></Menu.Target><Menu.Dropdown><Menu.Item>{t("ui.menuEdit")}</Menu.Item><Menu.Item color="red">{t("ui.menuRemove")}</Menu.Item></Menu.Dropdown></Menu>
                  <Popover width={260} position="bottom" withArrow><Popover.Target><Button variant="quiet">{t("ui.openPopover")}</Button></Popover.Target><Popover.Dropdown>{t("ui.popoverBody")}</Popover.Dropdown></Popover>
                </div>
              </Surface>
              <Surface className={styles.demo}>
                <SectionHeader title={t("ui.feedback")} />
                <StatusPanel title={t("ui.infoTitle")}>{t("ui.infoBody")}</StatusPanel>
                <StatusPanel tone="success" title={t("ui.successTitle")} />
                <StatusPanel tone="error" title={t("ui.errorTitle")} />
                <LoadingState label={t("ui.loadingContent")} />
                <EmptyState title={t("ui.emptyTitle")} action={<Button variant="secondary">{t("ui.emptyAction")}</Button>}>{t("ui.emptyBody")}</EmptyState>
                <ErrorState title={t("ui.errorStateTitle")} action={<Button>{t("common.retry")}</Button>}>{t("ui.errorStateBody")}</ErrorState>
                <p className={styles.authored}>{t("ui.longContent")}</p>
              </Surface>
            </div>
          </div>
        </WorkbenchSection>

        <nav aria-label={t("ui.navigationPreview")} className={styles.navigation}>
          <NavigationItem active href="#journal" icon={<StarIcon />}>{t("nav.journal")}</NavigationItem>
          <NavigationItem href="#settings">{t("nav.settings")}</NavigationItem>
        </nav>

        <AdaptiveDialog opened={dialog} onClose={() => setDialog(false)} title={t("ui.dialogTitle")}>
          <p>{t("ui.dialogBody")}</p><div className={styles.row}><Button onClick={() => setDialog(false)}>{t("ui.close")}</Button></div>
        </AdaptiveDialog>
        <ConfirmDialog cancelLabel={t("common.cancel")} confirmLabel={t("ui.confirm")} opened={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title={t("ui.confirmTitle")}>
          <p>{t("ui.confirmBody")}</p>
        </ConfirmDialog>
      </div>
    </main>
  );
}
