import { checkRepository } from "./check.ts";

const root = process.argv[2] ?? ".";
const { problems, notImplemented } = checkRepository(root);

for (const file of notImplemented) console.log(`${file}: not implemented yet, so its tests aren't required`);
for (const problem of problems) console.error(problem);
console.log(problems.length === 0 ? "Spec coverage: OK" : `Spec coverage: ${problems.length} problems`);
process.exitCode = problems.length === 0 ? 0 : 1;
