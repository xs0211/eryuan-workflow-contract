const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const repository = path.resolve(__dirname, "..");
const destination = path.join(repository, "evidence", "workflow-dialog-qa-fix-v1");
const sourceFiles = [
  "app.js", "index.html", "styles.css", "workbench.js", "workbench.css",
  "relay-model.js", "relay-editor.js", "relay-ui.js", "relay-ui.css", "workbench.test.cjs",
  "relay-model.test.cjs", "relay-editor.test.cjs", "editor-test-helpers.cjs", "desktop-qa.cjs", "desktop-qa.test.cjs", "verify.cjs",
];
const report = {
  status: "failed",
  baseCommit: "23ef629beab623674a07cad4e302bc481a78abf0",
  revisionBaseCommit: "9ed527f521ee0f8f7316da1688becd9c5b7fd692",
  branch: "codex/workflow-dialog-v1.0",
  recordedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  scope: "Node pure functions and VM substitutes; not browser acceptance",
  commands: [],
  sourceFiles: {},
  browser: { status: "not_run", screenshots: [], domAssertions: null, consoleErrors: null, horizontalOverflow: null, networkCallCounts: null },
  visualReview: "pending_human_comparison",
  firstUseReview: "pending_human_walkthrough",
  deployment: "not_run",
  originalSiteIntegration: "not_verified",
  platformExecution: "not_run",
  A2: "blocked",
};

fs.mkdirSync(destination, { recursive: true });
const writeReport = () => fs.writeFileSync(path.join(destination, "verification.json"), JSON.stringify(report, null, 2) + "\n");
writeReport();

function execute(args) {
  const result = spawnSync(process.execPath, args, { cwd: __dirname, encoding: "utf8", timeout: 30000 });
  const output = ((result.stdout || "") + (result.stderr || "")).replaceAll(repository, "<repository>");
  report.commands.push({ command: "node " + args.join(" "), exitCode: result.status, output });
  if (result.error || result.status !== 0) throw new Error("Verification command failed: node " + args.join(" "));
  return output;
}

try {
  for (const file of sourceFiles.filter((name) => /\.(?:c?js)$/.test(name))) execute(["--check", file]);
  const args = ["--test", "--test-reporter=tap", "workbench.test.cjs", "relay-model.test.cjs", "relay-editor.test.cjs", "desktop-qa.test.cjs"];
  const result = spawnSync(process.execPath, args, { cwd: __dirname, encoding: "utf8", timeout: 30000 });
  const output = ((result.stdout || "") + (result.stderr || "")).replaceAll(repository, "<repository>");
  fs.writeFileSync(path.join(destination, "node-tests.tap"), output);
  report.commands.push({ command: "node " + args.join(" "), exitCode: result.status, outputFile: "node-tests.tap" });
  const count = (label) => Number(output.match(new RegExp("^# " + label + " (\\d+)$", "m"))?.[1] ?? -1);
  report.tests = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((label) => [label, count(label)]));
  report.tapSha256 = crypto.createHash("sha256").update(output).digest("hex");
  if (result.error || result.status !== 0 || report.tests.tests < 1 || report.tests.pass !== report.tests.tests || ["fail", "cancelled", "skipped", "todo"].some((label) => report.tests[label] !== 0)) throw new Error("Test summary is incomplete or contains failures/skips");
  for (const file of sourceFiles) {
    const bytes = fs.readFileSync(path.join(__dirname, file));
    report.sourceFiles["prototype/" + file] = { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  }
  report.status = "passed";
} catch (error) {
  report.error = error.message.replaceAll(repository, "<repository>");
  process.exitCode = 1;
} finally {
  writeReport();
  console.log(JSON.stringify({ status: report.status, tests: report.tests, browser: report.browser.status, platformExecution: report.platformExecution }));
}
