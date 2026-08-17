import { writeFileSync } from "node:fs";
import { buildApp } from "../src/fastify-server.ts";

const app = await buildApp();
await app.ready();

const spec = app.swagger();
writeFileSync(
  new URL("../openapi.json", import.meta.url),
  JSON.stringify(spec, null, 2) + "\n",
);

console.log("openapi.json を生成しました");
process.exit(0);
