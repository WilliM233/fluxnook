import { createRoot } from "react-dom/client";
import "./device.css";
import { StubPage } from "./stub-page";

const root = document.getElementById("root");
if (!root) throw new Error("device/index.html has no #root");
createRoot(root).render(<StubPage />);
