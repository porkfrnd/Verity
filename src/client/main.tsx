import React from "react";
import ReactDOM from "react-dom/client";
import { Home } from "./pages/Home.js";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>
);
