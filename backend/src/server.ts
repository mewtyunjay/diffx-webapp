import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
