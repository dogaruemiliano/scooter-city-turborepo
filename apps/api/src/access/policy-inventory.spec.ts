import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() && !["generated", "node_modules"].includes(e.name)
        ? files(path.join(dir, e.name))
        : e.isFile() && e.name.endsWith(".controller.ts")
          ? [path.join(dir, e.name)]
          : [],
    );
}
const policyNames = new Set([
  "Public",
  "SelfService",
  "RequirePermissions",
  "RequireAllScope",
  "RequireAnyAllScope",
  "RequireSuperAdmin",
]);
function decorators(node: ts.Node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}
function names(node: ts.Node) {
  return decorators(node).map((d) =>
    ts.isCallExpression(d.expression)
      ? d.expression.expression.getText()
      : d.expression.getText(),
  );
}
describe("registered route policy inventory", () => {
  it("every handler declares public, self, permission, or protected policy", () => {
    const missing: string[] = [];
    let count = 0;
    for (const file of files(path.resolve(__dirname, ".."))) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      source.forEachChild((node) => {
        if (!ts.isClassDeclaration(node)) return;
        const classPolicy = names(node).some((n) => policyNames.has(n));
        for (const member of node.members) {
          if (
            !ts.isMethodDeclaration(member) ||
            !names(member).some((n) =>
              ["Get", "Post", "Put", "Patch", "Delete", "All", "Head"].includes(
                n,
              ),
            )
          )
            continue;
          count++;
          if (!classPolicy && !names(member).some((n) => policyNames.has(n)))
            missing.push(`${path.basename(file)}:${member.name.getText()}`);
        }
      });
    }
    expect(count).toBeGreaterThanOrEqual(100);
    expect(missing).toEqual([]);
  });
});
