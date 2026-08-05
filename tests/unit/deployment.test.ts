import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJsonFile<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`Unable to parse ${path}`, { cause: error });
  }
}

const railway = readJsonFile<{
  build: Record<string, unknown>;
  deploy: Record<string, unknown>;
}>("railway.json");
const packageJson = readJsonFile<{ scripts: Record<string, string> }>("package.json");
const dockerfile = readFileSync("Dockerfile", "utf8");

describe("Railway deployment contract", () => {
  it("builds the Dockerfile and starts the supervised single-service runtime", () => {
    expect(railway.build).toMatchObject({
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    });
    expect(railway.deploy).toMatchObject({
      startCommand: "npm run start:container",
      healthcheckPath: "/api/health",
      restartPolicyType: "ON_FAILURE",
    });
    expect(packageJson.scripts["start:container"]).toBe("tsx scripts/start-container.ts");
  });

  it("ships runtime TypeScript path resolution and uses a non-root container user", () => {
    expect(dockerfile).toContain("/app/tsconfig.json ./tsconfig.json");
    expect(dockerfile).toContain("USER 1000:1000");
  });
});
