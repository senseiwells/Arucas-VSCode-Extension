import * as vscode from "vscode";
import { BaseVisitor } from "./node";
import { Class, ClassBody, Enum, Interface, LocalVar, Statement } from "./statements";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Assign } from "./expressions";

export class ArucasSymbolProvider implements vscode.DocumentSymbolProvider {
    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        return new SymbolVisitor(parser.parse()).getSymbols();
    }
}

class SymbolVisitor extends BaseVisitor {
    private readonly global: vscode.DocumentSymbol[] = [];
    private current: vscode.DocumentSymbol[] = this.global;

    constructor(statement: Statement) {
        super();
        statement.visit(this);
    }

    getSymbols() {
        return this.global;
    }

    visitClass(klass: Class): void {
        this.pushSymbol(
            new vscode.DocumentSymbol(
                klass.name.id,
                "",
                vscode.SymbolKind.Class,
                new vscode.Range(
                    klass.token.token.trace.range.start,
                    klass.range.range.end
                ),
                klass.name.token.token.trace.range
            ),
            () => super.visitClass(klass)
        );
    }

    visitEnum(enumeration: Enum): void {
        this.pushSymbol(
            new vscode.DocumentSymbol(
                enumeration.name.id,
                "",
                vscode.SymbolKind.Enum,
                new vscode.Range(
                    enumeration.token.token.trace.range.start,
                    enumeration.range.range.end
                ),
                enumeration.name.token.token.trace.range
            ),
            () => {
                enumeration.enums.forEach((e) => {
                    this.pushSymbol(
                        new vscode.DocumentSymbol(
                            e.name,
                            "",
                            vscode.SymbolKind.EnumMember,
                            e.token.token.trace.range,
                            e.token.token.trace.range
                        )
                    );
                });
                super.visitEnum(enumeration)
            }
        );
    }

    visitClassBody(klass: ClassBody): void {
        klass.fields.forEach((f) => {
            this.pushSymbol(
                new vscode.DocumentSymbol(
                    f.name.id,
                    "",
                    vscode.SymbolKind.Field,
                    f.name.token.token.trace.range,
                    f.name.token.token.trace.range
                ),
                () => f.expression.visit(this)
            );
        });
        klass.staticFields.forEach((f) => {
            this.pushSymbol(
                new vscode.DocumentSymbol(
                    f.name.id,
                    "",
                    vscode.SymbolKind.Field,
                    f.name.token.token.trace.range,
                    f.name.token.token.trace.range
                ),
                () => f.expression.visit(this)
            );
        });
        klass.methods.forEach((m) => {
            this.pushSymbol(
                new vscode.DocumentSymbol(
                    m.name.id,
                    "",
                    vscode.SymbolKind.Method,
                    new vscode.Range(
                        m.token.token.trace.range.start,
                        m.scope.range.end
                    ),
                    m.token.token.trace.range
                ),
                () => m.visit(this)
            );
        });
        klass.staticMethods.forEach((m) => {
            this.pushSymbol(
                new vscode.DocumentSymbol(
                    m.name.id,
                    "",
                    vscode.SymbolKind.Method,
                    new vscode.Range(
                        m.token.token.trace.range.start,
                        m.scope.range.end
                    ),
                    m.name.token.token.trace.range
                ),
                () => m.visit(this)
            );
        });
        klass.constructors.forEach((c) => {
            this.pushSymbol(
                new vscode.DocumentSymbol(
                    c.token.token.content,
                    "",
                    vscode.SymbolKind.Constructor,
                    new vscode.Range(
                        c.token.token.trace.range.start,
                        c.scope.range.end
                    ),
                    c.token.token.trace.range
                ),
                () => c.visit(this)
            );
        });
        klass.operators.forEach((o) => o.visit(this));
        klass.initialisers.forEach((i) => i.visit(this));
    }

    visitInterface(interfaced: Interface): void {
        this.pushSymbol(
            new vscode.DocumentSymbol(
                interfaced.name.id,
                "",
                vscode.SymbolKind.Interface,
                new vscode.Range(
                    interfaced.token.token.trace.range.start,
                    interfaced.scope.range.end
                ),
                interfaced.name.token.token.trace.range
            ),
            () => {
                interfaced.required.forEach((r) => {
                    this.pushSymbol(
                        new vscode.DocumentSymbol(
                            r.name.id,
                            "",
                            vscode.SymbolKind.Function,
                            r.name.token.token.trace.range,
                            r.name.token.token.trace.range
                        )
                    )
                });
                super.visitInterface(interfaced);
            }
        );
    }

    visitAssign(assign: Assign): void {
        this.pushSymbol(
            new vscode.DocumentSymbol(
                assign.name,
                "",
                vscode.SymbolKind.Variable,
                assign.token.token.trace.range,
                assign.token.token.trace.range
            )
        );
        super.visitAssign(assign);
    }

    visitLocal(local: LocalVar): void {
        this.pushSymbol(
            new vscode.DocumentSymbol(
                local.name.id,
                "",
                vscode.SymbolKind.Variable,
                local.name.token.token.trace.range,
                local.name.token.token.trace.range
            )
        );
        super.visitLocal(local);
    }

    pushSymbol(symbol: vscode.DocumentSymbol, block?: () => void) {
        if (symbol.kind !== vscode.SymbolKind.Variable || this.current.find((v) => v.name !== symbol.name)) {
            this.current.push(symbol);
            if (block) {
                const old = this.current;
                try {
                    this.current = symbol.children;
                    block();
                } finally {
                    this.current = old;
                }
            }
        }
    }
}