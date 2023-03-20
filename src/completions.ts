import * as vscode from "vscode";
import {
    Class,
    ClassBody,
    Constructor,
    Enum,
    ExpressionStmt,
    For,
    Foreach,
    FunctionStmt,
    If,
    Import,
    Interface,
    LocalVar,
    Return,
    Scope,
    Statement,
    StatementVisitor,
    Statements,
    Switch,
    Throw,
    Try,
    While,
} from "./statements";
import {
    Assign,
    Binary,
    Bracket,
    BracketAccess,
    BracketAssign,
    Call,
    ExpressionVisitor,
    FunctionExpr,
    List,
    MapExpr,
    MemberAccess,
    MemberAssign,
    MemberCall,
    NewCall,
    Unary,
    UnpackAssign,
} from "./expressions";
import { ContextScope, FunctionData } from "./context";
import { Parameter, ScopeRange, Type } from "./node";
import { Lexer } from "./lexer";
import { Parser } from "./parser";

export class ArucasCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        
        const completions = new CompletionVisitor(parser.parse())
        const comps = completions.getCompletions(position);
        return comps;


        // a simple completion item which inserts `Hello World!`
        const simpleCompletion = new vscode.CompletionItem("Hello World!");

        // a completion item that inserts its text as snippet,
        // the `insertText`-property is a `SnippetString` which will be
        // honored by the editor.
        const snippetCompletion = new vscode.CompletionItem(
            "Good part of the day"
        );
        snippetCompletion.insertText = new vscode.SnippetString(
            "Good ${1|morning,afternoon,evening|}. It is ${1}, right?"
        );
        const docs: any = new vscode.MarkdownString(
            "Inserts a snippet that lets you select [link](x.ts)."
        );
        snippetCompletion.documentation = docs;
        docs.baseUri = vscode.Uri.parse("http://example.com/a/b/c/");

        // a completion item that can be accepted by a commit character,
        // the `commitCharacters`-property is set which means that the completion will
        // be inserted and then the character will be typed.
        const commitCharacterCompletion = new vscode.CompletionItem("console");
        commitCharacterCompletion.commitCharacters = ["."];
        commitCharacterCompletion.documentation = new vscode.MarkdownString(
            "Press `.` to get `console.`"
        );

        // a completion item that retriggers IntelliSense when being accepted,
        // the `command`-property is set which the editor will execute after
        // completion has been inserted. Also, the `insertText` is set so that
        // a space is inserted after `new`
        const commandCompletion = new vscode.CompletionItem("new");
        commandCompletion.kind = vscode.CompletionItemKind.Keyword;
        commandCompletion.insertText = "new ";
        commandCompletion.command = {
            command: "editor.action.triggerSuggest",
            title: "Re-trigger completions...",
        };

        // return all completion items as array
        return [
            simpleCompletion,
            snippetCompletion,
            commitCharacterCompletion,
            commandCompletion,
        ];
    }
}

class CompletionVisitor
    implements StatementVisitor<void>, ExpressionVisitor<void>
{
    private readonly globalScope: ContextScope = new ContextScope();
    private currentScope: ContextScope = this.globalScope;

    private currentClass: string | null = null;

    constructor(statement: Statement) {
        statement.visit(this);
    }

    getCompletions(position: vscode.Position): vscode.CompletionItem[] {
        const scope = this.globalScope.getScopeForPosition(position);
        if (!scope) {
            return [];
        }

        const completions: vscode.CompletionItem[] = [];
        scope.getVariables().forEach((v) => {
            completions.push(
                new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable)
            );
        });
        scope.getFunctions().forEach((f) => {
            const completion = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Function);
            completion.detail = this.formatFunction(f);
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
            return `${p.name}: ${p.types.map((t) => t.name).join(" | ")}`;
        }).join(", ");
        return `${func.name}(${parameters})`
    }

    private snippetFunction(func: FunctionData): vscode.SnippetString {
        const parameters = func.parameters.map((p, i) => `\${${i}:${p.name}}`);
        return new vscode.SnippetString(
            `${func.name}(${parameters})$0`
        );
    }

    visitBreak(): void {
        // Do nothing
    }

    visitClassBody(klass: ClassBody): void {
        const className = this.currentClass;
        if (!className) {
            throw new Error("Not in class");
        }
        klass.constructors.forEach((c) => c.visit(this));
        klass.fields.forEach((f) => {
            this.currentScope.addField(className, f);
            f.expression.visit(this);
        });
        klass.methods.forEach((m) => {
            this.currentScope.addMethod(className, m);
            m.visit(this);
        });
        klass.operators.forEach((o) => o.visit(this));
        klass.staticFields.forEach((f) => {
            this.currentScope.addStaticField(className, f);
            f.expression.visit(this);
        });
        klass.staticMethods.forEach((m) => {
            this.currentScope.addStaticMethod(className, m);
            m.visit(this);
        });

        klass.initialisers.forEach((i) => i.visit(this));
    }

    visitClass(klass: Class): void {
        this.pushClass(klass.name.id, () => {
            this.currentScope.addClass({
                name: klass.name.id,
                superclasses: klass.parents,
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
                klass.body.visit(this);
            });
        });
    }

    visitConstructor(konstructor: Constructor): void {
        this.pushScope(konstructor.range, () => {
            this.addParametersToScope(konstructor.parameters);
            konstructor.delegate.args.forEach((a) => a.visit(this));
            konstructor.body.visit(this);
        });
    }

    visitContinue(): void {
        // Do nothing
    }

    visitEnum(enumeration: Enum): void {
        this.pushClass(enumeration.name.id, () => {
            this.currentScope.addEnum({
                enums: enumeration.enums.map((e) => e.name),
                name: enumeration.name.id,
                superclasses: enumeration.parents,
                fields: [],
                methods: [],
                staticFields: [],
                staticMethods: [],
            });
            this.pushScope(enumeration.range, () => {
                enumeration.enums.forEach((e) => {
                    e.args.forEach((a) => a.visit(this));
                });
                enumeration.body.visit(this);
            });
        });
    }

    visitExpression(expression: ExpressionStmt): void {
        expression.expression.visit(this);
    }

    visitForeach(foreach: Foreach): void {
        foreach.iterable.visit(this);
        this.pushScope(foreach.scope, () => {
            foreach.body.visit(this);
        });
    }

    visitFor(forr: For): void {
        this.pushScope(forr.scope, () => {
            forr.initial.visit(this);
            forr.condition.visit(this);
            forr.body.visit(this);
            forr.expression.visit(this);
        });
    }

    visitFunction(func: FunctionStmt): void {
        if (!func.isClass) {
            this.currentScope.addFunction(func);
        }
        this.pushScope(func.scope, () => {
            this.addParametersToScope(func.parameters);
            func.body.visit(this);
        });
    }

    visitIf(ifs: If): void {
        ifs.condition.visit(this);
        ifs.body.visit(this);
        ifs.otherwise.body.visit(this);
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
        local.assignee.visit(this);
    }

    visitReturn(ret: Return): void {
        ret.expression.visit(this);
    }

    visitScope(scope: Scope): void {
        this.pushScope(scope.range, () => {
            scope.statement.visit(this);
        });
    }

    visitStatements(statements: Statements): void {
        statements.statements.forEach((s) => s.visit(this));
    }

    visitSwitch(switsch: Switch): void {
        switsch.condition.visit(this);
        switsch.cases.forEach((cs) => cs.forEach((c) => c.visit(this)));
        switsch.caseStatements.forEach((s) => s.visit(this));
        switsch.defaultStatement?.visit(this);
    }

    visitThrow(thrown: Throw): void {
        thrown.throwable.visit(this);
    }

    visitTry(tried: Try): void {
        tried.body.visit(this);
        tried.catch?.body.visit(this);
        tried.finally.statement.visit(this);
    }

    visitVoid(): void {
        // Do nothing
    }

    visitWhile(whilst: While): void {
        whilst.condition.visit(this);
        whilst.body.visit(this);
    }

    visitAccess(): void {
        // Do nothing
    }

    visitAssign(assign: Assign): void {
        this.currentScope.addRawVariable(assign.name);
        assign.assignee.visit(this);
    }

    visitBinary(binary: Binary): void {
        binary.left.visit(this);
        binary.right.visit(this);
    }

    visitBracketAccess(bracket: BracketAccess): void {
        bracket.expression.visit(this);
        bracket.index.visit(this);
    }

    visitBracketAssign(bracket: BracketAssign): void {
        bracket.expression.visit(this);
        bracket.index.visit(this);
        bracket.assignee.visit(this);
    }

    visitBracket(bracket: Bracket): void {
        bracket.expression.visit(this);
    }

    visitCall(call: Call): void {
        call.expression.visit(this);
        call.args.forEach((a) => a.visit(this));
    }

    visitFunctionAccess(): void {
        // Do nothing
    }

    visitFunctionExpr(func: FunctionExpr): void {
        this.pushScope(func.range, () => {
            this.addParametersToScope(func.parameters);
            func.body.visit(this);
        });
    }

    visitList(list: List): void {
        list.expressions.forEach((e) => e.visit(this));
    }

    visitLiteral(): void {
        // Do nothing
    }

    visitMap(map: MapExpr): void {
        map.expressions.forEach((v, k) => {
            v.visit(this);
            k.visit(this);
        });
    }

    visitMemberAccess(member: MemberAccess): void {
        member.expression.visit(this);
    }

    visitMemberAssign(member: MemberAssign): void {
        member.expression.visit(this);
        member.assignee.visit(this);
    }

    visitMemberCall(member: MemberCall): void {
        member.expression.visit(this);
        member.args.forEach((a) => a.visit(this));
    }

    visitNewAcess(): void {
        // Do nothing
    }

    visitNewCall(call: NewCall): void {
        call.args.forEach((a) => a.visit(this));
    }

    visitSuper(): void {
        // Do nothing
    }

    visitThis(): void {
        // Do nothing
    }

    visitUnary(unary: Unary): void {
        unary.expression.visit(this);
    }

    visitUnpack(unpack: UnpackAssign): void {
        unpack.assignables.forEach((a) => a.visit(this));
        unpack.assignee.visit(this);
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
