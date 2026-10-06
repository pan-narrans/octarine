import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import type { UpdateChannel } from "../../generated/ipc/UpdateChannel";
import type { CustomView } from "../../types";
import {
  ContextsSidebarModule,
  CustomViewsSidebarModule,
  ProjectTreeSidebarModule,
  SmartViewsSidebarModule,
  TagsSidebarModule,
} from "./SidebarModules";

interface SidebarNavigationProps {
  selectedSection: string;
  activeFilePath: string | null;
  customViews: CustomView[];
  projects: string[];
  projectCatalogSize: number;
  showInactiveProjects: boolean;
  contexts: string[];
  tags: string[];
  onSelectSection: (section: string, filter?: string) => void;
  onShowInactiveProjectsChange: (showInactiveProjects: boolean) => void;
  onRenameProject?: (sourceProject: string, destinationProject: string) => Promise<void> | void;
  appVersion?: string;
  updateChannel?: UpdateChannel;
  beforeCollections?: ReactNode;
  footer?: ReactNode;
  contentOverride?: ReactNode;
}

export function SidebarNavigation({
  selectedSection,
  activeFilePath,
  customViews,
  projects,
  projectCatalogSize,
  showInactiveProjects,
  contexts,
  tags,
  onSelectSection,
  onShowInactiveProjectsChange,
  onRenameProject,
  appVersion,
  updateChannel = "stable",
  beforeCollections,
  footer,
  contentOverride,
}: SidebarNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const selectSection = (section: string, filter?: string) => {
    setMobileOpen(false);
    onSelectSection(section, filter);
  };

  const closeAfterNavigation = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".sidebar-project-rename, .sidebar-project-rename-trigger, .file-tree-actions, .file-tree-edit-form",
      )
    ) {
      return;
    }
    if (target.closest(".sidebar-item, .file-tree-row.file")) setMobileOpen(false);
  };

  const sidebar = (
    <aside
      id="octarine-sidebar"
      className={`sidebar ${mobileOpen ? "is-mobile-open" : ""}`}
      aria-label="Octarine navigation"
      onClickCapture={closeAfterNavigation}
    >
      <div className="sidebar-scroll-content">
        <h2 className="sidebar-brand">
          <span className="sidebar-brand-name">Octarine</span>
          <span className="sidebar-brand-mark" aria-hidden="true" />
          {updateChannel === "beta" && <span className="sidebar-beta-badge">Beta</span>}
        </h2>

        {contentOverride ?? (
          <>
            <SmartViewsSidebarModule
              selectedSection={selectedSection}
              activeFilePath={activeFilePath}
              onSelectSection={selectSection}
            />

            {beforeCollections}

            <CustomViewsSidebarModule
              customViews={customViews}
              selectedSection={selectedSection}
              activeFilePath={activeFilePath}
              onSelectSection={selectSection}
            />
            <ProjectTreeSidebarModule
              projects={projects}
              projectCatalogSize={projectCatalogSize}
              showInactiveProjects={showInactiveProjects}
              onShowInactiveProjectsChange={onShowInactiveProjectsChange}
              onRenameProject={onRenameProject}
              selectedSection={selectedSection}
              activeFilePath={activeFilePath}
              onSelectSection={selectSection}
            />
            <ContextsSidebarModule
              values={contexts}
              selectedSection={selectedSection}
              activeFilePath={activeFilePath}
              onSelectSection={selectSection}
            />
            <TagsSidebarModule
              values={tags}
              selectedSection={selectedSection}
              activeFilePath={activeFilePath}
              onSelectSection={selectSection}
            />

            {footer}
          </>
        )}
      </div>

      {appVersion && (
        <div
          className="sidebar-release-identity"
          aria-label={`Octarine version ${appVersion}${
            updateChannel === "beta" ? ", Beta channel" : ""
          }`}
        >
          <span>v{appVersion}</span>
          {updateChannel === "beta" && (
            <>
              <span aria-hidden="true">·</span>
              <span>Beta channel</span>
            </>
          )}
        </div>
      )}
    </aside>
  );

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle"
        aria-controls="octarine-sidebar"
        aria-expanded={mobileOpen}
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} />
      </button>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {sidebar}
    </>
  );
}
