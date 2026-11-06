
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import "./styles/index.css";
  import { installChunkReloadSafetyNet } from "./app/utils/lazyWithReload";
  import { installSelectNumberOnFocus } from "./app/utils/selectNumberOnFocus";

  // Belt-and-suspenders backup for the React.lazy-level guard: any raw
  // dynamic import() that isn't wrapped in lazyWithReload() (e.g. a
  // one-off code-split inside a page component) still self-heals on the
  // next deploy because this global listener catches the same
  // "Failed to fetch dynamically imported module" errors bubbling up
  // through window `error` / `unhandledrejection` events.
  installChunkReloadSafetyNet();
  // Number fields select their value on focus, so it is typed over.
  installSelectNumberOnFocus();

  createRoot(document.getElementById("root")!).render(<App />);
