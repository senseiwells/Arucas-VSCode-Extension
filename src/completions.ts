import * as vscode from "vscode";
import { Lexer, Token, Trace } from "./lexer";
import {
    Break,
    Class,
    ClassBody,
    Constructor,
    Continue,
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
    Void,
    While,
} from "./statements";
import {
    Access,
    Assign,
    Binary,
    Bracket,
    BracketAccess,
    BracketAssign,
    Call,
    ExpressionVisitor,
    FunctionAccess,
    FunctionExpr,
    List,
    Literal,
    MapExpr,
    MemberAccess,
    MemberAssign,
    MemberCall,
    NewAccess,
    NewCall,
    Super,
    This,
    Unary,
    UnpackAssign,
} from "./expressions";
import { ContextScope } from "./context";

export class ArucasCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
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


class CompletionVisitor implements StatementVisitor<void>, ExpressionVisitor<void> {
    private readonly globalScope: ContextScope = new ContextScope();
    private currentScope: ContextScope = this.globalScope;

    private currentClass: string | null = null;

    constructor(statement: Statement) {
        statement.visit(this);
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
        })
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
                staticMethods: []
            });
            // TODO: this.pushScope()
        });
    }

    visitConstructor(konstructor: Constructor): void {
        throw new Error("Method not implemented.");
    }

    visitContinue(kontinue: Continue): void {
        throw new Error("Method not implemented.");
    }

    visitEnum(enumeration: Enum): void {
        throw new Error("Method not implemented.");
    }

    visitExpression(expression: ExpressionStmt): void {
        throw new Error("Method not implemented.");
    }

    visitForeach(foreach: Foreach): void {
        throw new Error("Method not implemented.");
    }

    visitFor(forr: For): void {
        throw new Error("Method not implemented.");
    }

    visitFunction(func: FunctionStmt): void {
        throw new Error("Method not implemented.");
    }

    visitIf(ifs: If): void {
        throw new Error("Method not implemented.");
    }

    visitImport(imported: Import): void {
        throw new Error("Method not implemented.");
    }

    visitInterface(interfaced: Interface): void {
        throw new Error("Method not implemented.");
    }

    visitLocal(local: LocalVar): void {
        throw new Error("Method not implemented.");
    }

    visitReturn(ret: Return): void {
        throw new Error("Method not implemented.");
    }

    visitScope(scope: Scope): void {
        throw new Error("Method not implemented.");
    }

    visitStatements(statements: Statements): void {
        throw new Error("Method not implemented.");
    }

    visitSwitch(switsch: Switch): void {
        throw new Error("Method not implemented.");
    }

    visitThrow(thrown: Throw): void {
        throw new Error("Method not implemented.");
    }

    visitTry(tried: Try): void {
        throw new Error("Method not implemented.");
    }

    visitVoid(voided: Void): void {
        throw new Error("Method not implemented.");
    }

    visitWhile(whilst: While): void {
        throw new Error("Method not implemented.");
    }

    visitAccess(access: Access): void {
        throw new Error("Method not implemented.");
    }

    visitAssign(assign: Assign): void {
        throw new Error("Method not implemented.");
    }

    visitBinary(binary: Binary): void {
        throw new Error("Method not implemented.");
    }

    visitBracketAccess(bracket: BracketAccess): void {
        throw new Error("Method not implemented.");
    }

    visitBracketAssign(bracket: BracketAssign): void {
        throw new Error("Method not implemented.");
    }

    visitBracket(bracket: Bracket): void {
        throw new Error("Method not implemented.");
    }

    visitCall(call: Call): void {
        throw new Error("Method not implemented.");
    }

    visitFunctionAccess(func: FunctionAccess): void {
        throw new Error("Method not implemented.");
    }

    visitFunctionExpr(func: FunctionExpr): void {
        throw new Error("Method not implemented.");
    }

    visitList(list: List): void {
        throw new Error("Method not implemented.");
    }

    visitLiteral(literal: Literal<string | number | boolean | null>): void {
        throw new Error("Method not implemented.");
    }

    visitMap(map: MapExpr): void {
        throw new Error("Method not implemented.");
    }

    visitMemberAccess(member: MemberAccess): void {
        throw new Error("Method not implemented.");
    }

    visitMemberAssign(member: MemberAssign): void {
        throw new Error("Method not implemented.");
    }

    visitMemberCall(member: MemberCall): void {
        throw new Error("Method not implemented.");
    }

    visitNewAcess(acess: NewAccess): void {
        throw new Error("Method not implemented.");
    }

    visitNewCall(call: NewCall): void {
        throw new Error("Method not implemented.");
    }

    visitSuper(zuper: Super): void {
        throw new Error("Method not implemented.");
    }

    visitThis(thiz: This): void {
        throw new Error("Method not implemented.");
    }

    visitUnary(unary: Unary): void {
        throw new Error("Method not implemented.");
    }

    visitUnpack(unpack: UnpackAssign): void {
        throw new Error("Method not implemented.");
    }

    pushScope(start: Trace, end: Trace, block: () => void) {
        const old = this.currentScope;
        try {
            this.currentScope = new ContextScope(
                new vscode.Range(
                    new vscode.Position(start.lineEnd, start.columnEnd), 
                    new vscode.Position(end.lineStart, end.columnStart)
                ),
                old
            );
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
