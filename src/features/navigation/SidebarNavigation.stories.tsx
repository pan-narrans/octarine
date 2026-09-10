import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { useState } from "react";
import type { CustomView } from "../../types";
import { SidebarNavigation } from "./SidebarNavigation";

const customViews: CustomView[] = [
  {
    line_number: 1,
    title: "Upcoming design work",
    query_raw: 'filter: "project:octarine/ui"',
  },
];

const meta = {
  title: "Navigation/SidebarNavigation",
  component: SidebarNavigation,
  decorators: [
    (Story) => (
      <div style={{ width: "280px", height: "800px", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    selectedSection: "all",
    activeFilePath: null,
    customViews,
    projects: ["octarine/ui", "octarine/docs"],
    contexts: ["desk", "focus"],
    tags: ["design", "responsive"],
    onSelectSection: () => undefined,
  },
} satisfies Meta<typeof SidebarNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ProjectSelected: Story = {
  args: { selectedSection: "proj:octarine/ui" },
};

export const ContextSelected: Story = {
  args: { selectedSection: "ctx:focus" },
};

export const ProjectRenameAvailable: Story = {
  args: {
    selectedSection: "proj:product",
    projects: ["product", "launch", "ui"],
    onRenameProject: fn(),
  },
};

export const ProjectRenameEditing: Story = {
  args: {
    selectedSection: "proj:product",
    projects: ["product", "launch", "ui"],
    onRenameProject: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Rename +product" }));
    const input = canvas.getByRole("textbox", { name: "New name for +product" });
    await userEvent.clear(input);
    await userEvent.type(input, "platform");
    await expect(input).toHaveValue("platform");
  },
};

function InteractionHarness() {
  const [selectedSection, setSelectedSection] = useState("all");
  const [lastSelection, setLastSelection] = useState("all");

  return (
    <>
      <SidebarNavigation
        {...meta.args}
        selectedSection={selectedSection}
        onSelectSection={(section) => {
          setSelectedSection(section);
          setLastSelection(section);
        }}
      />
      <output
        data-testid="last-selection"
        style={{ position: "fixed", left: "300px", top: "16px" }}
      >
        {lastSelection}
      </output>
    </>
  );
}

export const Interactive: Story = {
  render: () => <InteractionHarness />,
};
