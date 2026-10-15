import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSuperuserArgs, USAGE } from "./superuser.mjs";

// Run with `node --test scripts/`. Argument parsing for `pnpm superuser` (docs/operations.md#superuser-command).

test("accepts one target, one action, and one email in any order, normalizing the email", () => {
  assert.deepEqual(parseSuperuserArgs(["--local", "--grant", "Ada@Example.test"]), { target: "--local", grant: true, email: "ada@example.test" });
  assert.deepEqual(parseSuperuserArgs(["--revoke", " ada@example.test ", "--remote"]), { target: "--remote", grant: false, email: "ada@example.test" });
});

test("refuses a missing or doubled target or action, and extra arguments", () => {
  for (const args of [
    [],
    ["--grant", "ada@example.test"],
    ["--local", "ada@example.test"],
    ["--local", "--remote", "--grant", "ada@example.test"],
    ["--local", "--grant", "--revoke", "ada@example.test"],
    ["--local", "--local", "--grant", "ada@example.test"],
    ["--local", "--grant"],
    ["--local", "--grant", "ada@example.test", "extra"],
    ["--local", "--grant", "ada@example.test", "--force"],
    ["--production", "--grant", "ada@example.test"],
  ]) assert.deepEqual(parseSuperuserArgs(args), { error: USAGE }, args.join(" "));
});

test("refuses something that is not an email", () => {
  assert.equal(parseSuperuserArgs(["--local", "--grant", "ada"]).error, "Enter a valid email address.");
  assert.equal(parseSuperuserArgs(["--local", "--grant", "-x@y.z"]).error, "Enter a valid email address.");
});
