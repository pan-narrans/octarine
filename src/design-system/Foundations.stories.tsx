import type { Meta, StoryObj } from "@storybook/react-vite";
import "./foundations.css";

const colors = [
  ["--bg-space", "#070B19"],
  ["--bg-sidebar", "#0B1126"],
  ["--bg-card", "rgba(255, 255, 255, 0.03)"],
  ["--border-glow", "rgba(139, 92, 246, 0.15)"],
  ["--border-card", "rgba(255, 255, 255, 0.06)"],
  ["--text-primary", "#F3F4F6"],
  ["--text-secondary", "#9CA3AF"],
  ["--text-muted", "#6B7280"],
  ["--color-violet", "#A78BFA"],
  ["--color-indigo", "#818CF8"],
  ["--color-emerald", "#34D399"],
  ["--color-amber", "#FBBF24"],
  ["--color-rose", "#F87171"],
] as const;

const spacing = [
  ["--space-1", "4px"],
  ["--space-2", "8px"],
  ["--space-3", "12px"],
  ["--space-4", "16px"],
  ["--space-6", "24px"],
  ["--space-8", "32px"],
  ["--space-12", "48px"],
] as const;

const radii = [
  ["--radius-control", "6px"],
  ["--radius-md", "8px"],
  ["--radius-card", "12px"],
  ["--radius-modal", "12px"],
] as const;

function Foundations() {
  return (
    <main className="foundations-reference">
      <header className="foundations-header">
        <p className="foundations-eyebrow">Octarine design system</p>
        <h1>Foundations</h1>
        <p>Implemented tokens rendered directly from the application stylesheet.</p>
      </header>

      <section className="foundations-section" aria-labelledby="colors-heading">
        <h2 id="colors-heading">Colors</h2>
        <div className="foundations-color-grid">
          {colors.map(([token, value]) => (
            <article className="foundations-color" key={token}>
              <div className="foundations-swatch" style={{ background: `var(${token})` }} />
              <strong>{token}</strong>
              <code>{value}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="foundations-section" aria-labelledby="typography-heading">
        <h2 id="typography-heading">Typography</h2>
        <div className="foundations-type-samples">
          <p className="foundations-type-display">Display — Plan with clarity</p>
          <p className="foundations-type-heading">Heading — Today’s priorities</p>
          <p className="foundations-type-body">
            Body — Review the tasks scheduled for this afternoon.
          </p>
          <p className="foundations-type-label">LABEL — PROJECT · CONTEXT · STATUS</p>
          <code>Code — due:2026-08-29 +Octarine @desk</code>
        </div>
      </section>

      <section className="foundations-section" aria-labelledby="spacing-heading">
        <h2 id="spacing-heading">Spacing</h2>
        <div className="foundations-measure-list">
          {spacing.map(([token, value]) => (
            <div className="foundations-measure" key={token}>
              <code>{token}</code>
              <div className="foundations-measure-bar" style={{ width: `var(${token})` }} />
              <span>{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="foundations-section" aria-labelledby="radii-heading">
        <h2 id="radii-heading">Radii</h2>
        <div className="foundations-radius-grid">
          {radii.map(([token, value]) => (
            <article key={token}>
              <div className="foundations-radius" style={{ borderRadius: `var(${token})` }} />
              <code>{token}</code>
              <span>{value}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const meta = {
  title: "Design System/Foundations",
  component: Foundations,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof Foundations>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {};
