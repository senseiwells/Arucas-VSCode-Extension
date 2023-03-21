import * as vscode from "vscode";
import {
    Class,
    ClassBody,
    Constructor,
    Enum,
    For,
    Foreach,
    FunctionStmt,
    Import,
    Interface,
    LocalVar,
    Scope,
    Statement 
} from "./statements";
import { Assign, FunctionExpr } from "./expressions";
import { ContextScope, FunctionData } from "./context";
import { BaseVisitor, Parameter, ScopeRange, Type } from "./node";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { BuiltIns } from "./builtins";

export class ArucasCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        
        const completions = new CompletionVisitor(parser.parse())
        const comps = completions.getCompletions([], position);
        return comps;
    }
}

class CompletionVisitor extends BaseVisitor {
    private readonly globalScope: ContextScope = new ContextScope();
    private currentScope: ContextScope = this.globalScope;

    private currentClass: string | null = null;

    constructor(statement: Statement) {
        super();
        statement.visit(this);
    }

    getCompletions(completions: vscode.CompletionItem[], position: vscode.Position): vscode.CompletionItem[] {
        BuiltIns.builtInFunctions.forEach((f) => {
            const completion = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Function);
            completion.documentation = new vscode.MarkdownString(this.formatFunction(f) + "\n\n" + f.desc);
            completion.insertText = this.snippetFunction(f);
            completions.push(completion);
        });
        BuiltIns.builtInClasses.forEach((c) => {
            const completion = new vscode.CompletionItem(c.name, vscode.CompletionItemKind.Class);
            completion.documentation = new vscode.MarkdownString(`### ${c.name}\n\n${c.desc}`)
            completions.push(
                completion
            );
        });

        const scope = this.globalScope.getScopeForPosition(position);
        if (!scope) {
            return completions;
        }

        scope.getVariables().forEach((v) => {
            completions.push(
                new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable)
            );
        });
        scope.getFunctions().forEach((f) => {
            const completion = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Function);
            completion.documentation = new vscode.MarkdownString(this.formatFunction(f));
            completion.insertText = this.snippetFunction(f);
            completions.push(completion);
        });
        scope.getClasses().forEach((c) => {
            completions.push(
                new vscode.CompletionItem(c.name, vscode.CompletionItemKind.Class)
            );
        });
        scope.getInterfaces().forEach((i) => {
            completions.push(
                new vscode.CompletionItem(i.name, vscode.CompletionItemKind.Interface)
            );
        });
        scope.getEnums().forEach((e) => {
            completions.push(
                new vscode.CompletionItem(e.name, vscode.CompletionItemKind.Enum)
            );
        });
        return completions;
    }

    private formatFunction(func: FunctionData): string {
        const parameters = func.parameters.map((p) => {
            return `${p.name}: ${p.types.join(" | ")}`;
        }).join(", ");
        return `### \`${func.name}(${parameters}): ${func ? func.returns.join(" | ") : "Object"}\``
    }

    private snippetFunction(func: FunctionData): vscode.SnippetString {
        const parameters = func.parameters.map((p, i) => `\${${i + 1}:${p.name}}`);
        return new vscode.SnippetString(
            `${func.name}(${parameters})$0`
        );
    }

    visitClassBody(klass: ClassBody): void {
        const className = this.currentClass;
        if (!className) {
            throw new Error("Not in class");
        }
        klass.fields.forEach((f) => {
            this.currentScope.addField(className, f);
        });
        klass.methods.forEach((m) => {
            this.currentScope.addMethod(className, m);
        });
        klass.staticFields.forEach((f) => {
            this.currentScope.addStaticField(className, f);
        });
        klass.staticMethods.forEach((m) => {
            this.currentScope.addStaticMethod(className, m);
        });

        super.visitClassBody(klass);
    }

    visitClass(klass: Class): void {
        this.pushClass(klass.name.id, () => {
            this.currentScope.addClass({
                name: klass.name.id,
                superclasses: klass.parents.map((t) => t.name),
                fields: [],
                methods: [],
                staticFields: [],
                staticMethods: [],
            });
            this.pushScope(klass.range, () => {
                this.currentScope.addRawVariable(
                    "this",
                    new Type(klass.name.id, klass.token)
                );
                this.currentScope.addRawVariable("super", ...klass.parents);
                super.visitClass(klass);
            });
        });
    }

    visitConstructor(konstructor: Constructor): void {
        this.pushScope(konstructor.scope, () => {
            this.addParametersToScope(konstructor.parameters);
            super.visitConstructor(konstructor);
        });
    }

    visitEnum(enumeration: Enum): void {
        this.pushClass(enumeration.name.id, () => {
            this.currentScope.addEnum({
                enums: enumeration.enums.map((e) => e.name),
                name: enumeration.name.id,
                superclasses: enumeration.parents.map((t) => t.name),
                fields: [],
                methods: [],
                staticFields: [],
                staticMethods: [],
            });
            this.pushScope(enumeration.range, () => {
                super.visitEnum(enumeration);
            });
        });
    }

    visitForeach(foreach: Foreach): void {
        foreach.iterable.visit(this);
        this.pushScope(foreach.scope, () => {
            foreach.body.visit(this);
        });
    }

    visitFor(forr: For): void {
        this.pushScope(forr.scope, () => {
            super.visitFor(forr);
        });
    }

    visitFunction(func: FunctionStmt): void {
        if (!func.isClass) {
            this.currentScope.addFunction(func);
        }
        this.pushScope(func.scope, () => {
            this.addParametersToScope(func.parameters);
            super.visitFunction(func);
        });
    }

    visitImport(imported: Import): void {
        // TODO:
        imported.imports;
    }

    visitInterface(interfaced: Interface): void {
        this.currentScope.addInterface({
            name: interfaced.name.id,
            methods: [],
        });
        for (const method of interfaced.required) {
            this.currentScope.addInterfaceMethod(interfaced.name.id, method);
        }
    }

    visitLocal(local: LocalVar): void {
        this.currentScope.addRawVariable(local.name.id, ...local.types);
        super.visitLocal(local);
    }

    visitScope(scope: Scope): void {
        this.pushScope(scope.range, () => {
            super.visitScope(scope);
        });
    }

    visitAssign(assign: Assign): void {
        this.currentScope.addRawVariable(assign.name);
        super.visitAssign(assign);
    }

    visitFunctionExpr(func: FunctionExpr): void {
        this.pushScope(func.range, () => {
            this.addParametersToScope(func.parameters);
            super.visitFunctionExpr(func);
        });
    }

    addParametersToScope(parameters: Parameter[]) {
        for (const parameter of parameters) {
            this.currentScope.addRawVariable(
                parameter.name,
                ...parameter.types
            );
        }
    }

    pushScope(range: ScopeRange, block: () => void) {
        const old = this.currentScope;
        try {
            this.currentScope = new ContextScope(range.range, old);
            old.addChild(this.currentScope);
            block();
        } finally {
            this.currentScope = old;
        }
    }

    pushClass(name: string, block: () => void) {
        const previous = this.currentClass;
        try {
            this.currentClass = name;
            block();
        } finally {
            this.currentClass = previous;
        }
    }
}
