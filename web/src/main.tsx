import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./selene/selene.css";
import "./selene/v2.css";
import "./selene/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
