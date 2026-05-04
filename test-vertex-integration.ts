#!/usr/bin/env bun
import { spawn } from "node:child_process";
import process from "node:process";
import { getCurrentModel, getVertexSettings } from "./src/utils/settings";

const settings = getVertexSettings();
const projectId = settings.projectId;
const location = settings.location;
const baseURL = settings.baseURL;
const model = process.env.GROK_MODEL || getCurrentModel();

if (!projectId) {
  console.error(
    "Set GROK_VERTEX_PROJECT_ID, or save vertex.projectId in ~/.grok/user-settings.json, to a Google Cloud project with Vertex AI and the xAI partner model enabled.",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  GROK_USE_VERTEX: "1",
  GROK_VERTEX_PROJECT_ID: projectId,
  GROK_VERTEX_LOCATION: location,
  GROK_VERTEX_BASE_URL: baseURL,
  GROK_VERTEX_DISABLE_TOOLS: "1",
  GROK_MODEL: model,
};

const child = spawn(
  "bun",
  ["run", "src/index.ts", "--prompt", "Reply with exactly: vertex-ok", "--max-tool-rounds", "1", "--format", "json"],
  {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

child.on("close", (code) => {
  if (/Incomplete Response/i.test(stderr) || /Incomplete Response/i.test(stdout)) {
    console.error("Vertex integration failed: streaming produced an Incomplete Response error.");
    if (stderr) console.error(stderr.trim());
    process.exit(1);
  }

  if (code !== 0) {
    console.error(`Vertex integration failed with exit code ${code ?? "unknown"}.`);
    if (stderr) console.error(stderr.trim());
    if (stdout) console.error(stdout.trim());
    process.exit(code ?? 1);
  }

  if (!/vertex-ok/i.test(stdout)) {
    console.error("Vertex integration completed but did not find the expected response text.");
    if (stdout) console.error(stdout.trim());
    process.exit(1);
  }

  console.log(`Vertex integration passed for project ${projectId}, location ${location}, model ${model}.`);
});
