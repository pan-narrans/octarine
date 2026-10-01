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
    projectCatalogSize: 2,
    showInactiveProjects: false,
    contexts: ["desk", "focus"],
    tags: ["design", "responsive"],
    onSelectSection: () => undefined,
    onShowInactiveProjectsChange: fn(),
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

export const BetaChannel: Story = {
  args: {
    appVersion: "0.1.0-beta.1",
    updateChannel: "beta",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Beta", { selector: ".sidebar-beta-badge" })).toBeVisible();
    await expect(
      canvas.getByLabelText("Octarine version 0.1.0-beta.1, Beta channel"),
    ).toBeVisible();
  },
};

export const MobileClosed: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};

export const MobileOpen: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }));
    await expect(canvas.getByRole("complementary", { name: "Octarine navigation" })).toBeVisible();
  },
};

export const BetaChannelMobileOpen: Story = {
  tags: ["visual"],
  args: {
    appVersion: "0.1.0-beta.1",
    updateChannel: "beta",
  },
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }));
    await expect(canvas.getByRole("complementary", { name: "Octarine navigation" })).toBeVisible();
  },
};

export const InactiveProjectsHidden: Story = {
  args: {
    projects: ["octarine/ui", "work/current"],
    projectCatalogSize: 4,
    showInactiveProjects: false,
  },
};

export const AllProjectsInactive: Story = {
  args: {
    projects: [],
    projectCatalogSize: 2,
    showInactiveProjects: false,
  },
};

export const InactiveProjectsRevealed: Story = {
  args: {
    projects: ["octarine/ui", "octarine/archive", "work/current", "personal/finished"],
    projectCatalogSize: 4,
    showInactiveProjects: true,
  },
};

export const SelectedInactiveProject: Story = {
  args: {
    selectedSection: "proj:octarine/archive",
    projects: ["octarine/ui", "octarine/archive"],
    projectCatalogSize: 4,
    showInactiveProjects: false,
  },
};

export const ActiveDescendantProject: Story = {
  args: {
    selectedSection: "proj:org",
    projects: ["org/team"],
    projectCatalogSize: 3,
    showInactiveProjects: false,
  },
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

function VisibilityHarness() {
  const [showInactiveProjects, setShowInactiveProjects] = useState(false);
  const activeProjects = ["octarine/ui", "work/current"];
  const allProjects = ["octarine/ui", "octarine/archive", "work/current", "personal/finished"];

  return (
    <SidebarNavigation
      {...meta.args}
      projects={showInactiveProjects ? allProjects : activeProjects}
      projectCatalogSize={allProjects.length}
      showInactiveProjects={showInactiveProjects}
      onShowInactiveProjectsChange={setShowInactiveProjects}
    />
  );
}

export const Interactive: Story = {
  render: () => <InteractionHarness />,
};

export const VisibilityInteractive: Story = {
  render: () => <VisibilityHarness />,
};
