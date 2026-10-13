// Fonts before the tokens (fonts.md): only the weights and subsets the design system uses.
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root mancante in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
