#!/usr/bin/env node
// firebase.json predeploy hook: aborts `firebase deploy` if the target
// project isn't a demo/emulator project and APP_CHECK_ENFORCE=true isn't
// set in the env file that actually gets deployed. Without this, the gap
// only shows up as a warning buried in Cloud Functions logs after the fact.
const fs = require("fs");
const path = require("path");

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

if (!projectId) {
  console.warn("check-app-check-enforce: GCLOUD_PROJECT not set, skipping gate.");
  process.exit(0);
}

if (projectId.startsWith("demo-")) {
  process.exit(0);
}

const functionsDir = path.join(__dirname, "..");
const candidateFiles = [path.join(functionsDir, `.env.${projectId}`), path.join(functionsDir, ".env")];

const enforced = candidateFiles.some((file) => {
  if (!fs.existsSync(file)) return false;
  return /^APP_CHECK_ENFORCE\s*=\s*true\s*$/m.test(fs.readFileSync(file, "utf8"));
});

if (!enforced) {
  console.error(
    `\nBLOCKED: deploying to "${projectId}" without APP_CHECK_ENFORCE=true in functions/.env` +
      ` or functions/.env.${projectId}.\n` +
      "App Check would be silently disabled in production. Set it to true (after configuring\n" +
      "App Check — see README 'App Check setup') or remove this check if that's intentional.\n"
  );
  process.exit(1);
}

console.log(`check-app-check-enforce: OK (${projectId})`);
