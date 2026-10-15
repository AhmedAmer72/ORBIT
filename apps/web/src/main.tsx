import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { Providers } from "@/app/providers";
import { DialogProvider } from "@/components/AppDialog";
import { AppRoutes } from "@/router";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <DialogProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </DialogProvider>
    </Providers>
  </StrictMode>,
);
