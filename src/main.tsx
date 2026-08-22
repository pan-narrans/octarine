import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { getVisualScenario } from "./dev/visual-scenario";
import "./styles.css";

async function bootstrap() {
  if (import.meta.env.DEV) {
    const visualScenario = getVisualScenario();
    if (visualScenario) {
      const { installVisualFixtures } = await import("./dev/visual-fixtures");
      installVisualFixtures(visualScenario);
    }
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
