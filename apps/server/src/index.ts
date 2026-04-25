import { env } from "@my-better-t-app/env/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import transcribeRoute from "./routes/transcribe";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
    maxAge: 600,
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

app.route("/transcribe", transcribeRoute);

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server listening on port ${port}`);
});

export default app;
