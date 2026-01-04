import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { resolveDataDir } from "./db.js";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = resolveDataDir();

dotenv.config({ path: path.join(dataDir, "secrets.env") });

const port = process.env.PORT || 3000;

createApp()
  .then((app) => {
    app.listen(port, () => {
      console.log(`BMI tracker running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
