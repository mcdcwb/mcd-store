import { execFileSync } from "node:child_process";

export default function setup() {
  const run = (action: string) => execFileSync(process.execPath, [
    "--import", "tsx", "tests/helpers/frontend-fixture.ts", action
  ], { cwd: "backend", env: process.env, stdio: "pipe", windowsHide: true });
  run("create");
  return () => { run("delete"); };
}
