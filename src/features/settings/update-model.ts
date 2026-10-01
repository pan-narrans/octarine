import type { DistributionMethod } from "../../generated/ipc/DistributionMethod";
import type { UpdateInstallStrategy } from "../../generated/ipc/UpdateInstallStrategy";

const distributionLabels: Record<DistributionMethod, string> = {
  direct: "Direct download",
  app_image: "AppImage",
  unknown: "Development build",
};

const strategyDescriptions: Record<UpdateInstallStrategy, string> = {
  self_update: "Octarine downloads, verifies, installs, and restarts after confirmation.",
  unsupported: "Automatic installation is unavailable for this build.",
};

export function distributionLabel(distribution: DistributionMethod): string {
  return distributionLabels[distribution];
}

export function updateStrategyDescription(strategy: UpdateInstallStrategy): string {
  return strategyDescriptions[strategy];
}
