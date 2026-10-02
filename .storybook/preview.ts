import type { Preview } from "@storybook/react-vite";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    viewport: {
      options: {
        ...MINIMAL_VIEWPORTS,
        octarineDesktop: {
          name: "Octarine desktop (1280 × 1024)",
          styles: { width: "1280px", height: "1024px" },
          type: "desktop",
        },
        octarineCompactDesktop: {
          name: "Octarine compact desktop (1000 × 900)",
          styles: { width: "1000px", height: "900px" },
          type: "desktop",
        },
        octarineTablet: {
          name: "Octarine tablet (850 × 1024)",
          styles: { width: "850px", height: "1024px" },
          type: "tablet",
        },
        octarineMobile: {
          name: "Octarine mobile (560 × 1024)",
          styles: { width: "560px", height: "1024px" },
          type: "mobile",
        },
        octarineNarrow: {
          name: "Octarine narrow (360 × 900)",
          styles: { width: "360px", height: "900px" },
          type: "mobile",
        },
      },
    },
  },
};

export default preview;
