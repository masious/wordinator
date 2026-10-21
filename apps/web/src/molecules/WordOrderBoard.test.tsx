import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { WordOrderBoard } from "./WordOrderBoard";

function Harness({ chunks, onChange, ...rest }: { chunks: string[]; onChange?: (order: number[]) => void } & Partial<Parameters<typeof WordOrderBoard>[0]>) {
  const [order, setOrder] = useState<number[]>([]);
  return <MantineProvider><WordOrderBoard {...rest} chunks={chunks} order={order} onChange={(next) => { setOrder(next); onChange?.(next); }} /></MantineProvider>;
}
const answerNames = () => within(screen.getByRole("list", { name: "Your sentence" })).queryAllByRole("button").map((button) => button.textContent);

describe("WordOrderBoard", () => {
  afterEach(cleanup);

  it("places a pool chip by click and returns a placed chip", () => {
    const onChange = vi.fn();
    render(<Harness chunks={["a", "b"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add “b”" }));
    expect(onChange).toHaveBeenLastCalledWith([1]);
    expect(answerNames()).toEqual(["b"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove “b”, place 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(answerNames()).toEqual([]);
  });

  it("keeps repeated chunks distinct by position", () => {
    render(<Harness chunks={["ja", "ja", "nee"]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add “ja”" })[1]!);
    expect(screen.getAllByRole("button", { name: "Add “ja”" })).toHaveLength(1);
    expect(answerNames()).toEqual(["ja"]);
  });

  it("moves a placed chip with the arrow keys, keeps focus on it, and stops at the ends", () => {
    const onChange = vi.fn();
    render(<Harness chunks={["a", "b", "c"]} onChange={onChange} />);
    for (const word of ["a", "b", "c"]) fireEvent.click(screen.getByRole("button", { name: `Add “${word}”` }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Remove “a”, place 1" }), { key: "ArrowRight" });
    expect(answerNames()).toEqual(["b", "a", "c"]);
    expect(screen.getByRole("button", { name: "Remove “a”, place 2" })).toHaveFocus();
    const calls = onChange.mock.calls.length;
    fireEvent.keyDown(screen.getByRole("button", { name: "Remove “c”, place 3" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it("drags between the pool and the answer row", () => {
    render(<Harness chunks={["a", "b", "c"]} />);
    const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    fireEvent.click(screen.getByRole("button", { name: "Add “a”" }));
    fireEvent.dragStart(screen.getByRole("button", { name: "Add “c”" }), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole("button", { name: "Remove “a”, place 1" }), { dataTransfer: transfer });
    expect(answerNames()).toEqual(["c", "a"]);
    fireEvent.dragStart(screen.getByRole("button", { name: "Remove “c”, place 1" }), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole("list", { name: "Pieces" }), { dataTransfer: transfer });
    expect(answerNames()).toEqual(["a"]);
  });

  it("disables every chip when disabled, and shows a settled answer without the pool", () => {
    const { unmount } = render(<Harness chunks={["a", "b"]} disabled />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    unmount();
    render(<Harness chunks={["a", "b"]} answered={["b", "a"]} />);
    expect(answerNames()).toEqual(["b", "a"]);
    expect(screen.queryByRole("list", { name: "Pieces" })).not.toBeInTheDocument();
  });

  it("focuses the first chip on autoFocus and marks it for a parent that moves focus itself", () => {
    const { unmount } = render(<Harness chunks={["a", "b"]} autoFocus />);
    expect(screen.getByRole("button", { name: "Add “a”" })).toHaveFocus();
    unmount();
    render(<Harness chunks={["a", "b"]} initialFocus />);
    expect(screen.getByRole("button", { name: "Add “a”" })).toHaveAttribute("data-autofocus");
    expect(screen.getByRole("button", { name: "Add “b”" })).not.toHaveAttribute("data-autofocus");
  });
});
