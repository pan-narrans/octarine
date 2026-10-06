import { useCallback } from "react";
import { findPerspectiveModule } from "./registry";
import {
  initialPerspectiveModuleUiState,
  perspectiveModuleStateKey,
  usePerspectiveUiStore,
} from "./perspective-state";
import type {
  PerspectiveDefinition,
  PerspectiveModuleInstance,
  PerspectiveModuleRuntimeContext,
  PerspectiveModuleUiState,
} from "./model";

interface PerspectiveModuleSlotProps {
  perspective: PerspectiveDefinition;
  instance: PerspectiveModuleInstance;
  context: PerspectiveModuleRuntimeContext;
}

function PerspectiveModuleSlot({ perspective, instance, context }: PerspectiveModuleSlotProps) {
  const definition = findPerspectiveModule(instance.type);
  const stateKey = perspectiveModuleStateKey(context.workspaceId, perspective.id, instance.id);
  const storedUiState = usePerspectiveUiStore((state) => state.modules[stateKey]);
  const uiState = storedUiState ?? initialPerspectiveModuleUiState(instance.type);
  const updateUiState = useCallback(
    (patch: Partial<PerspectiveModuleUiState>) =>
      usePerspectiveUiStore.getState().patchModule(stateKey, patch),
    [stateKey],
  );

  if (!definition) {
    return (
      <div className="kanban-empty" role="alert">
        Perspective module type "{instance.type}" is not registered.
      </div>
    );
  }

  const Module = definition.component;
  return (
    <Module
      perspective={perspective}
      instance={instance}
      context={context}
      uiState={uiState}
      onUiStateChange={updateUiState}
    />
  );
}

export interface PerspectiveSidebarProps {
  perspective: PerspectiveDefinition;
  context: PerspectiveModuleRuntimeContext;
  configurationErrors?: readonly string[];
}

/** Renders registry-backed modules in configuration order, without owning app chrome. */
export function PerspectiveSidebar({
  perspective,
  context,
  configurationErrors = [],
}: PerspectiveSidebarProps) {
  return (
    <>
      {configurationErrors.length > 0 && (
        <div className="kanban-empty" role="alert" aria-label="Perspective configuration errors">
          <strong>Perspective configuration needs attention.</strong>
          <ul>
            {configurationErrors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {perspective.sidebar.map((instance) => (
        <PerspectiveModuleSlot
          key={`${perspective.id}:${instance.id}`}
          perspective={perspective}
          instance={instance}
          context={context}
        />
      ))}
    </>
  );
}
