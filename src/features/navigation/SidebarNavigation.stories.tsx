import type { Meta, StoryObj } from "@storybook/react-vite";
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
