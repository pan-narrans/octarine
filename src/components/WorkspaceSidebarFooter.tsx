import { Check, Edit2, Layers, Loader2, Settings, X } from "lucide-react";

interface WorkspaceSidebarFooterProps {
  activeFilePath: string | null;
  selectedSection: string;
  activeVaultPath: string;
  isEditingVault: boolean;
  vaultInput: string;
  savingVault: boolean;
  onOpenSettings: () => void;
  onOpenPerspectives?: () => void;
  onEditVault: () => void;
  onVaultInputChange: (value: string) => void;
  onCancelVaultEdit: () => void;
  onSaveVault: () => void;
}

export function WorkspaceSidebarFooter({
  activeFilePath,
  selectedSection,
  activeVaultPath,
  isEditingVault,
  vaultInput,
  savingVault,
  onOpenSettings,
  onOpenPerspectives,
  onEditVault,
  onVaultInputChange,
  onCancelVaultEdit,
  onSaveVault,
}: WorkspaceSidebarFooterProps) {
  return (
    <div className="sidebar-footer">
      <ul className="sidebar-list sidebar-settings-link">
        <li>
          <button
            type="button"
            className={`sidebar-item ${
              activeFilePath === null && selectedSection === "settings" ? "active" : ""
            }`}
            onClick={onOpenSettings}
          >
            <Settings size={16} /> Task settings
          </button>
        </li>
        {onOpenPerspectives && (
          <li>
            <button
              type="button"
              className={`sidebar-item ${
                activeFilePath === null && selectedSection === "perspectives-settings"
                  ? "active"
                  : ""
              }`}
              onClick={onOpenPerspectives}
            >
              <Layers size={16} /> Perspectives
            </button>
          </li>
        )}
      </ul>

      <div
        style={{
          borderTop: "1px solid var(--border-card)",
          paddingTop: "var(--workspace-sidebar-footer-gap)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: 600,
              letterSpacing: "0.05em",
            }}
          >
            Active Vault Path
          </span>
          {!isEditingVault && (
            <button
              aria-label="Edit vault path"
              onClick={onEditVault}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-violet)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
            >
              <Edit2 size={12} />
            </button>
          )}
        </div>

        {isEditingVault ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input
              className="sidebar-vault-input"
              type="text"
              value={vaultInput}
              onChange={(event) => onVaultInputChange(event.target.value)}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-card)",
                borderRadius: "6px",
                color: "var(--text-primary)",
                padding: "0.4rem 0.6rem",
                fontSize: "0.8rem",
                fontFamily: "monospace",
              }}
              placeholder="~/octarine_vault"
              disabled={savingVault}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                className="sidebar-vault-button"
                onClick={onCancelVaultEdit}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--border-card)",
                  color: "var(--text-muted)",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
                disabled={savingVault}
              >
                <X size={10} /> Cancel
              </button>
              <button
                className="sidebar-vault-button"
                onClick={onSaveVault}
                style={{
                  background: "var(--color-violet)",
                  border: "none",
                  color: "white",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
                disabled={savingVault}
              >
                {savingVault ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}{" "}
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              wordBreak: "break-all",
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
          >
            {activeVaultPath}
          </div>
        )}
      </div>
    </div>
  );
}
