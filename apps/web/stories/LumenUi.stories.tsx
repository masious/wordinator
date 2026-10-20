import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Languages, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { Callout } from "../src/molecules/Callout";
import { ProgressMeter } from "../src/molecules/ProgressMeter";
import {
  AdaptiveDialog, Avatar, Button, CheckboxField, Eyebrow, IconButton, LabelChip, PageHeader,
  PasswordField, RadioField, SearchField, SectionHeader, SelectField, Surface, TextAreaField, TextField,
} from "../src/ui";

const meta = { title: "Lumen/Shared UI", tags: ["a11y"] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = { render: () => <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
  <Button>Continue</Button><Button variant="secondary" trailingIcon={<ArrowRight />}>Next lesson</Button>
  <Button variant="quiet">Cancel</Button><Button variant="danger">Delete</Button>
  <Button disabled>Unavailable</Button><Button loading>Saving</Button>
  <IconButton label="Add" tone="default"><Plus aria-hidden="true" /></IconButton>
  <IconButton label="Settings" tone="quiet"><Settings aria-hidden="true" /></IconButton>
  <IconButton label="Add item" tone="primary"><Plus aria-hidden="true" /></IconButton>
  <IconButton label="Search the library" tone="quiet" size="sm" pressed={false}><Languages aria-hidden="true" /></IconButton>
  <IconButton label="Search the library" tone="quiet" size="sm" pressed><Languages aria-hidden="true" /></IconButton>
  <IconButton label="Pinned" pressed><Settings aria-hidden="true" /></IconButton>
</div> };

export const LabelsAndIdentity: Story = { render: () => <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
  <Eyebrow>Your learning space</Eyebrow>
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
    <LabelChip>Draft</LabelChip><LabelChip tone="accent">In progress</LabelChip>
    <LabelChip tone="success">Complete</LabelChip><LabelChip tone="warm">Needs review</LabelChip>
    <LabelChip tone="info">Example</LabelChip>
  </div>
  <div style={{ display: "flex", gap: 12 }}><Avatar name="Ada Learner" /><Avatar name="Bram Tutor" tone="accent" /><Avatar name="Cas" tone="soft" /></div>
</div> };

export const Surfaces: Story = { render: () => <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
  <Surface><h2>Today's lesson</h2><p>Learn the words for your home.</p></Surface>
  <Surface tone="inset"><h2>Review</h2><p>Keep practicing.</p></Surface>
  <Surface tone="featured"><h2>Continue learning</h2><p>Pick up your lesson.</p></Surface>
</div> };

export const FormFields: Story = { render: () => <form style={{ display: "grid", gap: 16, maxWidth: 360 }}>
  <TextField label="Username" placeholder="Your username" />
  <PasswordField label="Password" />
  <TextAreaField label="Bio" />
  <SelectField label="Language" data={["Dutch", "German"]} defaultValue="Dutch" />
  <CheckboxField label="Remember this choice" /><RadioField label="Dutch" name="language" />
</form> };

export const Headers: Story = { render: () => <div style={{ display: "grid", gap: 32 }}>
  <PageHeader eyebrow={<Eyebrow>Your learning space</Eyebrow>} title="Course library" intro="Continue studying at your own pace." actions={<Button>Create course</Button>} />
  <SectionHeader eyebrow={<Eyebrow>Next up</Eyebrow>} title="Recent lessons" description="Pick up where you left off." action={<Button variant="quiet">See more</Button>} />
</div> };

export const Progress: Story = { render: () => <div style={{ display: "grid", gap: 24, maxWidth: 340 }}>
  <ProgressMeter value={60} label="Lesson progress" showLabel />
  <ProgressMeter value={100} label="Course progress" showLabel size="compact" />
</div> };

export const Callouts: Story = { render: () => <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
  <Callout variant="hint" icon="auto"><strong>Try this</strong><p>Use the word in a sentence.</p></Callout>
  <Callout variant="important" icon="auto"><strong>Remember</strong><p>Word order changes in questions.</p></Callout>
  <Callout variant="warning" icon="auto"><strong>Watch out</strong><p>This form is irregular.</p></Callout>
</div> };

export const Dialog: Story = { render: () => <AdaptiveDialog opened onClose={() => undefined} title="Confirm action">
  <p>Would you like to continue?</p><Button>Continue</Button>
</AdaptiveDialog> };

function SearchStory() {
  const [library, setLibrary] = useState(false);
  return <div style={{ display: "grid", gap: 16, maxWidth: 360 }}>
    <SearchField size="xs" aria-label="Search words" placeholder={library ? "Search the library" : "Search this lesson"}
      toggle={{ icon: <Languages aria-hidden="true" />, label: "Search the library", pressed: library, onToggle: () => setLibrary((on) => !on) }} />
    <SearchField size="xs" aria-label="Search" placeholder="Search" />
  </div>;
}
export const SearchFields: Story = { render: () => <SearchStory /> };
