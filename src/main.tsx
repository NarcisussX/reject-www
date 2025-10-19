// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";
import JCode from "./pages/JCode";
import Admin from "./pages/Admin";
import "./styles.css";
import StructureAge from "./pages/StructureAge";
import Watchlist from "./pages/Watchlist";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "j/:jcode", element: <JCode /> },
      { path: "admin", element: <Admin /> },
      { path: "admin/age", element: <StructureAge />},
      { path: "/admin/watchlist", element:  <Watchlist />}
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
