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
const entrypoint = readFileSync("scripts/container-entrypoint.sh", "utf8");
const compose = readFileSync("compose.yaml", "utf8");

describe("Railway deployment contract", () => {
  it("builds the Dockerfile and starts the supervised single-service runtime", () => {
    expect(railway.build).toMatchObject({
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    });
    expect(railway.deploy).toMatchObject({
      healthcheckPath: "/api/health",
      restartPolicyType: "ON_FAILURE",
    });
    expect(railway.deploy.startCommand).toBeUndefined();
    expect(packageJson.scripts["start:container"]).toBe("tsx scripts/start-container.ts");
    expect(dockerfile).toContain('CMD ["npm", "run", "start:container"]');
  });

  it("fixes mounted-volume ownership before dropping application processes to UID 1000", () => {
    expect(dockerfile).toContain("/app/tsconfig.json ./tsconfig.json");
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/local/bin/callcraft-entrypoint"]');
    expect(entrypoint).toContain("chown 1000:1000 /data");
    expect(entrypoint).toContain("setpriv --reuid=1000 --regid=1000");
    expect(compose).toContain('command: ["node", "server.js"]');
  });
});
