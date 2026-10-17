import type { Meta, StoryObj } from "@storybook/react-vite";
import { GroupFrame } from "../src/organisms/GroupFrame/GroupFrame";
import { groupId, session } from "./fixtures";

const meta = {
  title: "Lumen/Shell",
  tags: ["a11y"],
  // Storybook's memory router provides the route; use the browser viewport toolbar to see the drawer.
  render: () => {
    if (session.status !== "signedIn") throw new Error("Story fixture requires a signed-in session");
    return <GroupFrame groupId={groupId} session={session}>
      <h1>Course library</h1><p>Continue your lessons.</p>
    </GroupFrame>;
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = {};
export const Drawer: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Open navigation" }));
  },
};
