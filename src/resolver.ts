import { DiagnosticSeverity } from "vscode";
import { Imports } from "./importer";
import { BaseVisitor, Problem } from "./node";
import { Import, Statement } from "./statements";

export class Resolver extends BaseVisitor {
    readonly problems: Problem[] = [];

    constructor(statement: Statement) {
        super();
        statement.visit(this);
    }

    visitImport(imported: Import): void {
        super.visitImport(imported);
        if (!Imports.getImportables().includes(imported.from.path.id)) {
            this.problems.push({
                message: `Unable to resolve import '${imported.from.path.id}'`,
                start: imported.token.token.trace,
                end: imported.from.path.token.token.trace,
                severity: DiagnosticSeverity.Warning
            });
            return;
        }
        if (imported.imports.length === 1 && imported.imports[0].name === "*") {
            return;
        }
        const classes = Imports.getAvailableClasses(imported.from.path.id).map((c) => c.name);
        imported.imports.forEach((i) => {
            if (!classes.includes(i.name)) {
                this.problems.push({
                    message: `Unable to find class '${i.name}' in '${imported.from.path.id}'`,
                    start: i.token.token.trace,
                    end: i.token.token.trace
                });
            }
        });
    }
}