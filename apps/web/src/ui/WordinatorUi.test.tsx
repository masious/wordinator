import { MantineProvider, TextInput } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { theme } from "../theme";
import { AdaptiveDialog, ArrowIcon, Button, ConfirmDialog, FieldHelp, NavigationItem, Surface } from ".";

function renderWithTheme(node: React.ReactNode) {
  return render(<MantineProvider theme={theme}>{node}</MantineProvider>);
}

describe("reusable UI contracts", () => {
  it("keeps disabled and loading actions unavailable", () => {
    renderWithTheme(<><Button disabled>Unavailable</Button><Button loading>Saving</Button></>);

    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
  });

  it("renders nested surfaces, icon islands, and active navigation semantics", () => {
    const { container } = renderWithTheme(<>
      <Surface tone="featured"><h2>Featured lesson</h2></Surface>
      <Button trailingIcon={<ArrowIcon />}>Continue</Button>
      <NavigationItem active href="#journal">Journal</NavigationItem>
    </>);

    expect(screen.getByRole("heading", { name: "Featured lesson" }).closest("section")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("associates shared validation help with its field", () => {
    renderWithTheme(<TextInput error={<FieldHelp error id="code-error">Enter a valid invitation code.</FieldHelp>} label="Invitation code" />);

    expect(screen.getByRole("textbox", { name: "Invitation code" })).toHaveAccessibleDescription("Enter a valid invitation code.");
  });

  it("dismisses the adaptive dialog with Escape", async () => {
    function Harness() {
      const [opened, setOpened] = useState(false);
      return <><Button onClick={() => setOpened(true)}>Open dialog</Button><AdaptiveDialog opened={opened} onClose={() => setOpened(false)} title="Adaptive dialog">Dialog body</AdaptiveDialog></>;
    }

    renderWithTheme(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Adaptive dialog" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Adaptive dialog" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("supports an explicit keyboard-reachable cancel action in confirmations", async () => {
    function Harness() {
      const [opened, setOpened] = useState(true);
      return <><Button onClick={() => setOpened(true)}>Open</Button><ConfirmDialog cancelLabel="Keep it" confirmLabel="Delete it" opened={opened} onClose={() => setOpened(false)} onConfirm={() => undefined} title="Delete example?">This cannot be undone.</ConfirmDialog></>;
    }

    renderWithTheme(<Harness />);
    const cancel = await screen.findByRole("button", { name: "Keep it" });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Enter" });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete example?" })).not.toBeInTheDocument());
  });
});
