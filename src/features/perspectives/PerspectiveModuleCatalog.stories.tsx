import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildPerspectiveModuleCatalog } from "./model";
import { PERSPECTIVE_MODULE_REGISTRY } from "./registry";

function PerspectiveModuleCatalog() {
  const catalog = buildPerspectiveModuleCatalog(PERSPECTIVE_MODULE_REGISTRY);

  return (
    <main className="perspective-module-catalog">
      <header>
        <span className="perspective-story-eyebrow">DEVELOPER REFERENCE</span>
        <h1>Perspective modules</h1>
        <p>
          Registry metadata and configuration examples. Catalog generated from runtime registry.
          Every module instance requires unique <code>id</code> and registered semantic{" "}
          <code>type</code>.
        </p>
      </header>
      {catalog.errors.length > 0 && (
        <div className="kanban-empty" role="alert">
          <strong>Module metadata errors</strong>
          <ul>
            {catalog.errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="perspective-module-catalog-grid">
        {catalog.modules.map((module) => (
          <article className="perspective-module-catalog-card" key={module.type}>
            <div className="perspective-module-catalog-heading">
              <div>
                <h2>{module.title}</h2>
                <code>{module.type}</code>
              </div>
              <span>{module.allowMultiple ? "Multiple instances" : "Single instance"}</span>
            </div>
            <p>{module.description}</p>
            <p>
              <strong>Surfaces:</strong> {module.supportedSurfaces.join(", ")}
            </p>
            <h3>Configuration</h3>
            {module.fields.length === 0 ? (
              <p>No module-specific options.</p>
            ) : (
              <dl>
                {module.fields.map((field) => (
                  <div className="perspective-module-field" key={field.key}>
                    <dt>
                      <code>{field.key}</code> {field.required ? "Required" : "Optional"}
                    </dt>
                    <dd>{field.description}</dd>
                    {field.defaultValue !== undefined && (
                      <dd>
                        Default: <code>{field.defaultValue}</code>
                      </dd>
                    )}
                    {field.options && <dd>Options: {field.options.join(", ")}</dd>}
                  </div>
                ))}
              </dl>
            )}
            <h3>Examples</h3>
            {module.examples.map((example) => (
              <details key={example.name}>
                <summary>{example.name}</summary>
                <pre>{JSON.stringify(example.config, null, 2)}</pre>
              </details>
            ))}
          </article>
        ))}
      </div>
    </main>
  );
}

const meta = {
  title: "Perspectives/Module catalog",
  component: PerspectiveModuleCatalog,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PerspectiveModuleCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegistryReference: Story = {};
