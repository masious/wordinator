import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { PracticeFields, practiceFieldsFromPayload, practicePayloadFromFields, type PracticeFieldsValue } from "./PracticeFields";

const initial = practiceFieldsFromPayload({
  instruction: "Vul in.", passage: null,
  items: [{ prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "One kitchen." }],
});

function Harness({ onChange }: { onChange: (value: PracticeFieldsValue) => void }) {
  const [value, setValue] = useState(initial);
  return <MantineProvider><PracticeFields value={value} onChange={(next) => { setValue(next); onChange(next); }} /></MantineProvider>;
}

afterEach(cleanup);

describe("Practice fields", () => {
  it("offers one author's version slot per blank and keeps existing answers and notes", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/^Item 1 prompt/), { target: { value: "… een keuken en … een tuin." } });
    fireEvent.change(screen.getByLabelText(/^Item 1, blank 2/), { target: { value: "er is" } });
    const payload = practicePayloadFromFields(onChange.mock.lastCall![0]);
    expect(payload!.items[0]).toEqual({ prompt: "… een keuken en … een tuin.", authorsVersion: ["Er is", "er is"], note: "One kitchen." });
  });

  it("returns no payload while a required field is empty", () => {
    expect(practicePayloadFromFields({ ...initial, instruction: "" })).toBeNull();
    expect(practicePayloadFromFields(initial)).not.toBeNull();
  });
});
