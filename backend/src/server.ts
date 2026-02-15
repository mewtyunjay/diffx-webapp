// Starts the HTTP server; runtime flow is process boot -> createApp() -> listen(port).
import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
