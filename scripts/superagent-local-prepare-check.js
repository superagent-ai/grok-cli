import { existsSync } from "node:fs";

const requiredFiles = ["package.json", "tsconfig.json"];
for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`Missing required project file: ${file}`);
    process.exitCode = 1;
  }
}

console.log("Local prepare check completed without network or secret access.");
