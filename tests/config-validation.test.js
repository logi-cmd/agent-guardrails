import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInit } from "../lib/commands/init.js";
import { readConfig, readTaskContract, writeTaskContract } from "../lib/utils.js";

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agent-guardrails-validation-${prefix}-`));
}

function writeConfigRaw(tempDir, content) {
  const configDir = path.join(tempDir, ".agent-guardrails");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "config.json"), content, "utf8");
}

function writeContractRaw(tempDir, content) {
  const contractDir = path.join(tempDir, ".agent-guardrails");
  fs.mkdirSync(contractDir, { recursive: true });
  fs.writeFileSync(path.join(contractDir, "task-contract.json"), content, "utf8");
}

async function readConfigReturnsNullWhenFileMissing() {
  const tempDir = makeTempDir("cfg-missing");
  const result = readConfig(tempDir);
  assert.equal(result, null);
}

async function readConfigThrowsOnMalformedJSON() {
  const tempDir = makeTempDir("cfg-bad-json");
  writeConfigRaw(tempDir, "{ this is not valid JSON }}}");

  assert.throws(
    () => readConfig(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Failed to parse config/);
      assert.ok(err.cause instanceof SyntaxError);
      return true;
    }
  );
}

async function readConfigThrowsOnArrayTopLevel() {
  const tempDir = makeTempDir("cfg-array");
  writeConfigRaw(tempDir, "[1, 2, 3]");

  assert.throws(
    () => readConfig(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /must be a JSON object.*array/);
      return true;
    }
  );
}

async function readConfigThrowsOnPrimitiveTopLevel() {
  const tempDir = makeTempDir("cfg-string");
  writeConfigRaw(tempDir, '"just a string"');

  assert.throws(
    () => readConfig(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /must be a JSON object.*string/);
      return true;
    }
  );
}

async function readConfigAcceptsValidObject() {
  const tempDir = makeTempDir("cfg-valid");
  writeConfigRaw(tempDir, JSON.stringify({ preset: "node-service", checks: {} }));

  const config = readConfig(tempDir);
  assert.equal(config.preset, "node-service");
}

async function readTaskContractReturnsNullWhenFileMissing() {
  const tempDir = makeTempDir("tc-missing");
  const result = readTaskContract(tempDir);
  assert.equal(result, null);
}

async function readTaskContractThrowsOnMalformedJSON() {
  const tempDir = makeTempDir("tc-bad-json");
  writeContractRaw(tempDir, "not json at all!");

  assert.throws(
    () => readTaskContract(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Failed to parse task contract/);
      assert.ok(err.cause instanceof SyntaxError);
      return true;
    }
  );
}

async function readTaskContractThrowsOnArrayTopLevel() {
  const tempDir = makeTempDir("tc-array");
  writeContractRaw(tempDir, "[1,2]");

  assert.throws(
    () => readTaskContract(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /must be a JSON object.*array/);
      return true;
    }
  );
}

async function readTaskContractThrowsOnNonArrayAllowedPaths() {
  const tempDir = makeTempDir("tc-bad-paths");
  writeContractRaw(tempDir, JSON.stringify({ allowedPaths: "src/" }));

  assert.throws(
    () => readTaskContract(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /"allowedPaths" must be an array.*string/);
      return true;
    }
  );
}

async function readTaskContractThrowsOnNonArrayRequiredCommands() {
  const tempDir = makeTempDir("tc-bad-cmds");
  writeContractRaw(tempDir, JSON.stringify({ requiredCommands: "npm test" }));

  assert.throws(
    () => readTaskContract(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /"requiredCommands" must be an array.*string/);
      return true;
    }
  );
}

async function readTaskContractThrowsOnNonStringTask() {
  const tempDir = makeTempDir("tc-bad-task");
  writeContractRaw(tempDir, JSON.stringify({ task: 42 }));

  assert.throws(
    () => readTaskContract(tempDir),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /"task" must be a string.*number/);
      return true;
    }
  );
}

async function readTaskContractNormalizesValidContract() {
  const tempDir = makeTempDir("tc-valid");
  writeContractRaw(tempDir, JSON.stringify({
    task: "Add validation",
    allowedPaths: ["src/"],
    requiredCommands: ["npm test"],
    intendedFiles: ["src/validation.js"]
  }));

  const contract = readTaskContract(tempDir);
  assert.equal(contract.task, "Add validation");
  assert.deepEqual(contract.allowedPaths, ["src/"]);
  assert.deepEqual(contract.requiredCommands, ["npm test"]);
  assert.deepEqual(contract.intendedFiles, ["src/validation.js"]);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.validationProfile, "standard");
  assert.deepEqual(contract.evidencePaths, []);
}

async function readTaskContractWorksWithEmptyObject() {
  const tempDir = makeTempDir("tc-empty");
  writeContractRaw(tempDir, "{}");

  const contract = readTaskContract(tempDir);
  assert.equal(contract.task, "");
  assert.deepEqual(contract.allowedPaths, []);
  assert.deepEqual(contract.requiredCommands, []);
}

export async function run() {
  await readConfigReturnsNullWhenFileMissing();
  await readConfigThrowsOnMalformedJSON();
  await readConfigThrowsOnArrayTopLevel();
  await readConfigThrowsOnPrimitiveTopLevel();
  await readConfigAcceptsValidObject();
  await readTaskContractReturnsNullWhenFileMissing();
  await readTaskContractThrowsOnMalformedJSON();
  await readTaskContractThrowsOnArrayTopLevel();
  await readTaskContractThrowsOnNonArrayAllowedPaths();
  await readTaskContractThrowsOnNonArrayRequiredCommands();
  await readTaskContractThrowsOnNonStringTask();
  await readTaskContractNormalizesValidContract();
  await readTaskContractWorksWithEmptyObject();
}
