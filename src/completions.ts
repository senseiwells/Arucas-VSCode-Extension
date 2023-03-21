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
import { ClassData, ContextScope, FunctionData } from "./context";
import { BaseVisitor, Parameter, ScopeRange, Type } from "./node";
import { Lexer, Token, TokenType } from "./lexer";
import { Parser } from "./parser";
import { BuiltIns } from "./builtins";

export class ArucasCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        
        const visitor = new CompletionVisitor(parser.parse());
        const completions: vscode.CompletionItem[] = [];
        visitor.addExpressionCompletions(
            completions, 
            position, 
            new ReverseExpressionFinder(
                new ReverseTokenIterator(tokens, position)
            )
        )
        return completions;
    }
}

class CompletionVisitor extends BaseVisitor {
    private readonly globalScope: ContextScope = new ContextScope();
    private currentScope: ContextScope = this.globalScope;

    private currentClass: string | null = null;

    constructor(statement: Statement) {
        super();
        statement.visit(this);

        for (const builtin of BuiltIns.builtInClasses) {
            this.globalScope.addClass(builtin);
        }
    }

    addGenericCompletions(completions: vscode.CompletionItem[]) {
        BuiltIns.builtInFunctions.forEach((f) => completions.push(this.functionToCompletion(f)));
        BuiltIns.builtInClasses.forEach((c) => completions.push(this.classToCompletion(c)));
    }

    addScopeCompletions(completions: vscode.CompletionItem[], position: vscode.Position) {
        const scope = this.globalScope.getScopeForPosition(position);
        if (!scope) {
            return;
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
        return;
    }

    addExpressionCompletions(completions: vscode.CompletionItem[], position: vscode.Position, finder: ReverseExpressionFinder) {
        const scope = this.globalScope.getScopeForPosition(position);
        if (!scope) {
            return;
        }

        const chain = finder.getChain();

        const first = chain.pop();
        if (!first) {
            this.addGenericCompletions(completions);
            this.addScopeCompletions(completions, position);
            return;
        }

        const either = first.scope(scope);

        let types: ClassData[];
        if (Array.isArray(either)) {
            types = either;
        } else {
            const clazz = either;
            const next = chain.pop();
            if (!next) {
                // Completions for class
                return;
            }
            types = next.static(clazz, scope);
        }

        let next = chain.pop();
        while (next) {
            types = next.member(types, scope);
            next = chain.pop();
        }

        types.forEach((t) => {
            // TODO:
            t.methods.forEach((m) => completions.push(this.functionToCompletion(m)));
        });
    }

    private classToCompletion(clazz: ClassData): vscode.CompletionItem {
        const completion = new vscode.CompletionItem(clazz.name, vscode.CompletionItemKind.Class);
        completion.documentation = new vscode.MarkdownString(`### ${clazz.name}` + clazz.desc ? "\n\n" + clazz.desc : "");
        return completion;
    }

    private functionToCompletion(func: FunctionData): vscode.CompletionItem {
        const completion = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
        completion.documentation = new vscode.MarkdownString(this.formatFunction(func) + func.desc ? "\n\n" + func.desc : "");
        completion.insertText = this.snippetFunction(func);
        return completion
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
        // TODO: add support to index imports
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
        // TODO: Type inference
        this.currentScope.addRawVariable(local.name.id, ...local.types);
        super.visitLocal(local);
    }

    visitScope(scope: Scope): void {
        this.pushScope(scope.range, () => {
            super.visitScope(scope);
        });
    }

    visitAssign(assign: Assign): void {
        // TODO: Type inference
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

class ReverseTokenIterator {
    private readonly tokens: Token[] = [];

    constructor(
        tokens: Token[],
        position: vscode.Position,
    ) {
        for (const token of tokens) {
            if (token.trace.range.start.isAfterOrEqual(position)) {
                break;
            }
            this.tokens.push(token);
        }
    }

    peek(): Token {
        return this.tokens[this.tokens.length - 1];
    }

    hasNext(): boolean {
        return this.tokens.length !== 0;
    }

    next(): Token {
        const token = this.tokens.pop();
        if (!token) {
            throw new Error("No more tokens!");
        }
        return token;
    }
}

class ReverseExpressionFinder {
    private readonly chain: AbstractExpression[] = [];
    private readonly last: VariableExpression;

    private dot = false;

    constructor(
        private readonly iterator: ReverseTokenIterator
    ) {
        this.last = this.find();
    }

    getChain() {
        return this.chain;
    }

    getLast() {
        return this.last;
    }

    private find(): VariableExpression {
        if (!this.iterator.hasNext()) {
            return new VariableExpression("");
        }

        const first = this.iterator.peek();
        let last: VariableExpression;
        if (first.type === TokenType.Identifier) {
            last = new VariableExpression(first.content);
            this.iterator.next();
        } else {
            last = new VariableExpression("");
        }

        while (this.iterator.hasNext()) {
            const token = this.iterator.next();
            if (token.type === TokenType.Dot) {
                if (this.dot) {
                    return last;
                }
                this.dot = true;
                continue;
            }
            if (this.dot) {
                if (token.type === TokenType.Identifier) {
                    this.chain.push(new VariableExpression(token.content));
                } else if (token.type === TokenType.String) {
                    this.chain.push(new TypedExpression("String"));
                } else if (token.type === TokenType.True || token.type === TokenType.False) {
                    this.chain.push(new TypedExpression("Boolean"));
                } else if (token.type === TokenType.Number) {
                    this.chain.push(new TypedExpression("Number"));
                } else if (token.type === TokenType.Null) {
                    this.chain.push(new TypedExpression("Null"));
                } else if (token.type === TokenType.RightBracket && !this.findBrackets()) {
                    return last;
                } else if (token.type === TokenType.RightCurlyBracket && !this.findCurlyBrackets()) {
                    return last;
                } else if (token.type === TokenType.RightSquareBracket && !this.findSquareBrackets()) {
                    return last;
                }
                this.dot = false;
                continue;
            }
            return last;
        }
        return last;
    }


    private findBrackets(): boolean {
        let hadFirst = false
        let parameters = 0

        let bracketDepth = 0

        while (this.iterator.hasNext()) {
            const token = this.iterator.next();
            if (bracketDepth == 0 && token.type === TokenType.Comma) {
                parameters++;
                continue;
            }
            if (token.type === TokenType.RightBracket || token.type === TokenType.RightCurlyBracket || token.type === TokenType.RightSquareBracket) {
                hadFirst = true;
                bracketDepth++;
                continue;
            }
            if (bracketDepth > 0 && (token.type === TokenType.LeftBracket || token.type === TokenType.LeftCurlyBracket || token.type === TokenType.LeftSquareBracket)) {
                bracketDepth--;
                continue;
            }
            if (token.type === TokenType.LeftBracket) {
                while (this.iterator.hasNext()) {
                    const sub = this.iterator.next();
                    if (sub.type == TokenType.Identifier) {
                        if (hadFirst) {
                            parameters++;
                        }
                        this.chain.push(new FunctionExpression(sub.content, parameters));
                        return true;
                    }
                    this.chain.push(TypedExpression.unknown);
                    return true;
                }
                this.chain.push(TypedExpression.unknown)
                return true
            }
            hadFirst = true
        }
        return false
    }

    private findCurlyBrackets(): boolean {
        let bracketDepth = 0

        while (this.iterator.hasNext()) {
            const token = this.iterator.next();
            if (token.type === TokenType.RightBracket || token.type === TokenType.RightCurlyBracket || token.type === TokenType.RightSquareBracket) {
                bracketDepth++;
                continue;
            }
            if (bracketDepth > 0 && (token.type === TokenType.LeftBracket || token.type === TokenType.LeftCurlyBracket || token.type === TokenType.LeftSquareBracket)) {
                bracketDepth--;
                continue;
            }
            if (token.type == TokenType.LeftCurlyBracket) {
                this.chain.push(new TypedExpression("Map"));
                return true;
            }
        }

        return false
    }

    private findSquareBrackets(): boolean {
        let bracketDepth = 0

        while (this.iterator.hasNext()) {
            const token = this.iterator.next();
            if (token.type === TokenType.RightBracket || token.type === TokenType.RightCurlyBracket || token.type === TokenType.RightSquareBracket) {
                bracketDepth++;
                continue;
            }
            if (bracketDepth > 0 && (token.type === TokenType.LeftBracket || token.type === TokenType.LeftCurlyBracket || token.type === TokenType.LeftSquareBracket)) {
                bracketDepth--;
                continue;
            }
            if (token.type === TokenType.LeftSquareBracket) {
                while (this.iterator.hasNext()) {
                    const sub = this.iterator.next();
                    if (sub.type === TokenType.Identifier) {
                        this.chain.push(TypedExpression.unknown);
                        return true;
                    }
                    this.chain.push(new TypedExpression("List"));
                    return true
                }
                this.chain.push(new TypedExpression("List"));
                return true;
            }
        }

        return false
    }
}

abstract class AbstractExpression {
    abstract scope(scope: ContextScope): ClassData[] | ClassData;

    abstract member(calling: ClassData[], scope: ContextScope): ClassData[];

    abstract static(clazz: ClassData, scope: ContextScope): ClassData[];

    protected stringsToClassData(names: string[], scope: ContextScope): ClassData[] {
        const data: Map<string, ClassData> = new Map();
        for (const name of names) {
            if (name === BuiltIns.objClass.name) {
                continue;
            }
            const clazz = scope.getClass(name);
            if (!clazz) {
                continue;
            }
            data.set(clazz.name, clazz);
            this.stringsToClassData(clazz.superclasses, scope).forEach((c) => {
                data.set(c.name, c);
            });
        }
        data.set(BuiltIns.objClass.name, BuiltIns.objClass);
        return [...data.values()];
    }
}

class VariableExpression extends AbstractExpression {
    constructor(
        readonly name: string
    ) {
        super();
    }

    scope(scope: ContextScope): ClassData | ClassData[] {
        const variable = scope.getVariable(this.name);
        if (variable) {
            const types = variable.types;
            if (!types) {
                return [BuiltIns.objClass];
            }
            return this.stringsToClassData(types, scope);
        }
        const clazz = scope.getClass(this.name);
        if (!clazz) {
            return [BuiltIns.objClass];
        }
        return clazz;
    }

    member(calling: ClassData[], scope: ContextScope): ClassData[] {
        const possible: Map<string, ClassData> = new Map();
        for (const type of calling) {
            const field = type.fields.find((f) => f.name === this.name);
            if (!field?.types) {
                continue;
            }
            for (const type of this.stringsToClassData(field.types, scope)) {
                possible.set(type.name, type);
            }
        }
        return [...possible.values()];
    }

    static(clazz: ClassData, scope: ContextScope): ClassData[] {
        const field = clazz.staticFields.find((f) => f.name === this.name);
        if (!field?.types) {
            return [BuiltIns.objClass];
        }
        return this.stringsToClassData(field.types, scope);
    }
}

class FunctionExpression extends AbstractExpression {
    constructor(
        readonly name: string,
        readonly parameters: number
    ) {
        super();
    }

    scope(scope: ContextScope): ClassData[] {
        const types = scope.getFunction(this.name, this.parameters)?.returns
        if (!types) {
            return [BuiltIns.objClass];
        }
        return this.stringsToClassData(types, scope);
    }

    member(calling: ClassData[], scope: ContextScope): ClassData[] {
        const possible: Map<string, ClassData> = new Map();
        for (const type of calling) {
            const method = type.methods.find((m) => m.name === this.name && m.parameters.length === this.parameters);
            if (!method) {
                continue;
            }
            for (const type of this.stringsToClassData(method.returns, scope)) {
                possible.set(type.name, type);
            }
        }
        return [...possible.values()];
    }

    static(clazz: ClassData, scope: ContextScope): ClassData[] {
        const method = clazz.staticMethods.find((m) => m.name === this.name && m.parameters.length === this.parameters);
        if (!method) {
            return [BuiltIns.objClass];
        }
        return this.stringsToClassData(method.returns, scope);
    }
}

class TypedExpression extends AbstractExpression {
    static readonly unknown = new TypedExpression("Object");

    constructor(
        readonly type: string
    ) {
        super();
    }

    scope(scope: ContextScope): ClassData[] {
        return this.stringsToClassData([this.type], scope);
    }

    member(): ClassData[] {
        throw new Error("Typed expressions cannot be called upon");
    }

    static(): ClassData[] {
        throw new Error("Typed expressions cannot be called upon");
    }
}