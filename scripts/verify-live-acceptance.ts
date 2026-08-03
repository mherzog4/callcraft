import { verifyLiveAcceptance } from "@/src/evals/acceptance";

const result = verifyLiveAcceptance();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.table(
    result.checks.map((check) => ({
      check: check.name,
      result: check.passed ? "PASS" : "FAIL",
      detail: check.detail,
    })),
  );
}
if (!result.passed) process.exitCode = 1;
