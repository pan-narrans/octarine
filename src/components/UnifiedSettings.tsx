import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Layers, Settings } from "lucide-react";

export type UnifiedSettingsSection = "task-settings" | "perspectives";

export interface UnifiedSettingsProps {
  activeSection: UnifiedSettingsSection;
  onSectionChange: (section: UnifiedSettingsSection) => void;
  panels: Record<UnifiedSettingsSection, ReactNode>;
}

const sections = [
  { id: "task-settings", label: "Task settings", icon: Settings },
  { id: "perspectives", label: "Perspectives", icon: Layers },
] as const;

export function UnifiedSettings({ activeSection, onSectionChange, panels }: UnifiedSettingsProps) {
  const id = useId();
  const tabRefs = useRef<Record<UnifiedSettingsSection, HTMLButtonElement | null>>({
    "task-settings": null,
    perspectives: null,
  });
  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    section: UnifiedSettingsSection,
  ) => {
    const currentIndex = sections.findIndex((candidate) => candidate.id === section);
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (currentIndex + 1) % sections.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (currentIndex - 1 + sections.length) % sections.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? sections.length - 1
              : -1;

    if (nextIndex < 0) return;

    event.preventDefault();
    const nextSection = sections[nextIndex].id;
    onSectionChange(nextSection);
    tabRefs.current[nextSection]?.focus();
  };

  return (
    <section className="unified-settings" aria-labelledby={`${id}-title`}>
      <header className="unified-settings-header">
        <h1 id={`${id}-title`}>Settings</h1>
        <p>Configure task creation and workspace Perspectives.</p>
      </header>

      <div className="unified-settings-layout">
        <nav className="unified-settings-navigation" aria-label="Settings sections">
          <div
            className="unified-settings-tabs"
            role="tablist"
            aria-label="Settings sections"
            aria-orientation="vertical"
          >
            {sections.map(({ id: section, label, icon: Icon }) => (
              <button
                key={section}
                ref={(element) => {
                  tabRefs.current[section] = element;
                }}
                type="button"
                id={`${id}-${section}-tab`}
                className="unified-settings-tab"
                role="tab"
                aria-selected={activeSection === section}
                aria-controls={`${id}-${section}-panel`}
                tabIndex={activeSection === section ? 0 : -1}
                onClick={() => onSectionChange(section)}
                onKeyDown={(event) => handleTabKeyDown(event, section)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {sections.map(({ id: section }) => (
          <div
            key={section}
            id={`${id}-${section}-panel`}
            className="unified-settings-panel"
            role="tabpanel"
            aria-labelledby={`${id}-${section}-tab`}
            tabIndex={activeSection === section ? 0 : -1}
            hidden={activeSection !== section}
          >
            {panels[section]}
          </div>
        ))}
      </div>
    </section>
  );
}
