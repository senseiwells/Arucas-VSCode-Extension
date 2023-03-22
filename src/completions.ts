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
import { Access, Assign, Assignable, Call, Expression, FunctionAccess, FunctionExpr, Literal, MemberAccess, MemberCall, NewCall } from "./expressions";
import { ClassData, ContextScope, EnumData, FunctionData, InterfaceData, VariableData } from "./context";
import { BaseVisitor, Parameter, ScopeRange, Type } from "./node";
import { Lexer, Token, TokenType } from "./lexer";
import { Parser } from "./parser";
import { BuiltIns } from "./builtins";
import { Imports } from "./importer";

export class ArucasCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        
        const completions: vscode.CompletionItem[] = [];
        if (KeywordCompletions.addCompletions(completions, tokens, position)) {
            return completions;
        }

        const visitor = new CompletionVisitor(parser.parse(), true);
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

export class KeywordCompletions {
    static addCompletions(completions: vscode.CompletionItem[], tokens: Token[], position: vscode.Position): boolean {
        const iterator = new ReverseTokenIterator(tokens, position);
        if (iterator.hasNext()) {
            let last = iterator.peek().type;
            if (last === TokenType.From) {
                this.addImportCompletions("", completions);
                return true;
            }
            if (last !== TokenType.Dot && last !== TokenType.Identifier) {
                return false;
            }
            let path = "";
            while (iterator.hasNext()) {
                const next = iterator.next();
                const nextType = next.type;
                if (nextType === TokenType.From) {
                    if (last === TokenType.Identifier) {
                        this.addImportCompletions(path, completions);
                        return true;
                    } else {
                        return false;
                    }
                }
                if (nextType !== TokenType.Dot && nextType !== TokenType.Identifier) {
                    return false;
                }
                path = next.content + path;
                last = nextType;
            }
        }
        return false;
    }

    private static addImportCompletions(starts: string, completions: vscode.CompletionItem[]) {
        const lastPeriod = starts.lastIndexOf(".") + 1;
        Imports.getImportables().filter((i) => i.startsWith(starts)).forEach((i) => {
            const item = new vscode.CompletionItem(
                i.substring(lastPeriod), vscode.CompletionItemKind.Reference
            );
            completions.push(item);
        });
    }
}

export class CompletionVisitor extends BaseVisitor {
    private readonly globalScope: ContextScope = new ContextScope();
    private currentScope: ContextScope = this.globalScope;

    readonly definedClasses: ClassData[] = [];

    private currentClass: string | null = null;

    constructor(statement: Statement, private shouldGuessTypes = false) {
        super();

        for (const builtin of BuiltIns.builtInClasses) {
            this.globalScope.addClass(builtin);
        }
        for (const builtin of BuiltIns.builtInFunctions) {
            this.globalScope.addFunction(builtin);
        }
        
        statement.visit(this);
    }

    addScopeCompletions(completions: vscode.CompletionItem[], position: vscode.Position) {
        const scope = this.globalScope.getScopeForPosition(position) ?? this.globalScope;

        scope.getVariables().forEach(
            (v) => completions.push(this.variableToCompletion(v))
        );
        scope.getFunctions().forEach(
            (f) => completions.push(this.functionToCompletion(f))
        );
        scope.getClasses().forEach(
            (c) => completions.push(this.classToCompletion(c))
        );
        scope.getInterfaces().forEach(
            (i) => completions.push(this.interfaceToCompletion(i))
        );
        scope.getEnums().forEach(
            (c) => completions.push(this.classToCompletion(c))
        );
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
                clazz.staticMethods.forEach((m) => completions.push(this.functionToCompletion(m, clazz.name)));
                clazz.staticFields.forEach((f) => completions.push(this.fieldToCompletion(clazz.name, f)));
                completions.push(
                    new vscode.CompletionItem(
                        "type",
                        vscode.CompletionItemKind.Field
                    )
                );
                return;
            }
            types = next.static(clazz, scope);
        }

        let next = chain.pop();
        while (next) {
            types = next.member(types, scope);
            next = chain.pop();
        }

        const duplicates: Set<string> = new Set();

        types.forEach((t) => {
            t.fields.forEach((f) => {
                const id = "%" + f.name;
                if (!duplicates.has(id)) {
                    completions.push(this.fieldToCompletion(`<${t.name}>`, f));
                    duplicates.add(id);
                }
            });
            t.methods.forEach((m) => {
                const id = "~" + m.name + m.parameters;
                if (!duplicates.has(id)) {
                    completions.push(this.functionToCompletion(m, `<${t.name}>`));
                    duplicates.add(id);
                }
            });
        });
    }

    private fieldToCompletion(className: string, variable: VariableData): vscode.CompletionItem {
        const completion = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Field);
        completion.documentation = new vscode.MarkdownString(`### \`${className}.${variable.name}\`` + (variable.desc ? "\n\n" + variable.desc : ""));
        return completion;
    }

    private variableToCompletion(variable: VariableData): vscode.CompletionItem {
        const completion = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Variable);
        completion.documentation = new vscode.MarkdownString(`### \`${variable.name}\`` + (variable.desc ? "\n\n" + variable.desc : ""));
        return completion;
    }

    private classToCompletion(clazz: ClassData): vscode.CompletionItem {
        const completion = new vscode.CompletionItem(clazz.name, vscode.CompletionItemKind.Class);
        completion.documentation = new vscode.MarkdownString(`### \`${clazz.name}\`` + (clazz.desc ? "\n\n" + clazz.desc : ""));
        return completion;
    }

    private interfaceToCompletion(inter: InterfaceData) {
        const completion = new vscode.CompletionItem(inter.name, vscode.CompletionItemKind.Interface);
        completion.documentation = new vscode.MarkdownString(`### \`${inter.name}\`` + (inter.desc ? "\n\n" + inter.desc : ""));
        return completion;
    }

    private functionToCompletion(func: FunctionData, prefix?: string): vscode.CompletionItem {
        const parameters = func.parameters.map((p) => {
            return `${p.name}: ${p.types.join(" | ")}`;
        }).join(", ");
        const fnName = `### \`${prefix ? prefix + "." : ""}${func.name}(${parameters}): ${func ? func.returns.join(" | ") : "Object"}\``
        const completion = new vscode.CompletionItem(func.name, prefix ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Function);
        completion.documentation = new vscode.MarkdownString(fnName + (func.desc ? "\n\n" + func.desc : ""));
        completion.insertText = this.snippetFunction(func);
        return completion
    }

    private snippetFunction(func: FunctionData): vscode.SnippetString {
        const parameters = func.parameters.map((p, i) => `\${${i + 1}:${p.name}}`);
        return new vscode.SnippetString(
            `${func.name}(${parameters.join(", ")})$0`
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
            const data: ClassData = {
                name: klass.name.id,
                superclasses: klass.parents.map((t) => t.name),
                fields: [],
                methods: [],
                staticFields: [],
                staticMethods: [],
            };
            this.currentScope.addClass(data);
            if (this.currentScope === this.globalScope) {
                this.definedClasses.push(data);
            }
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
            const data: EnumData = {
                enums: enumeration.enums.map((e) => e.name),
                name: enumeration.name.id,
                superclasses: enumeration.parents.map((t) => t.name),
                fields: [],
                methods: [],
                staticFields: [],
                staticMethods: [],
            };
            if (this.currentScope === this.globalScope) {
                this.definedClasses.push(data);
            }
            this.currentScope.addEnum(data);
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
            this.currentScope.addFunctionStmt(func);
        }
        this.pushScope(func.scope, () => {
            this.addParametersToScope(func.parameters);
            super.visitFunction(func);
        });
    }

    visitImport(imported: Import): void {
        Imports.getImported(imported).forEach((c) => {
            if (isEnum(c)) {
                this.currentScope.addEnum(c);
            } else {
                this.currentScope.addClass(c);
            }
        });
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
        if (local.types.length !== 0) {
            this.currentScope.addRawVariable(local.name.id, ...local.types);
        } else {
            this.currentScope.addRawSVariable(local.name.id, this.guessType(local.assignee));
        }
        super.visitLocal(local);
    }

    visitScope(scope: Scope): void {
        this.pushScope(scope.range, () => {
            super.visitScope(scope);
        });
    }

    visitAssign(assign: Assign): void {
        this.currentScope.addRawSVariable(assign.name, this.guessType(assign.assignee));
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

    private guessType(expression: Expression): string[] {
        if (!this.shouldGuessTypes) {
            return [];
        }
        if (expression instanceof Literal) {
            switch (typeof expression.literal) {
                case "boolean": return ["Boolean"];
                case "number": return ["Number"];
                case "string": return ["String"];
                default: return ["Null"];
            }
        }
        if (expression instanceof Call) {
            if (expression.expression instanceof FunctionAccess) {
                const func = this.currentScope.getFunction(expression.expression.name, expression.args.length);
                if (func) {
                    return func.returns;
                }
            }
            return [];
        } 
        if (expression instanceof Access) {
            const type = this.currentScope.getVariableType(expression.name);
            return type ?? [];
        }
        if (expression instanceof MemberAccess) {
            if (expression.expression instanceof Access) {
                let clazz = this.currentScope.getClass(expression.expression.name);
                if (!clazz) {
                    clazz = this.currentScope.getEnum(expression.expression.name);
                    if (!clazz) {
                        return this.fieldsFor(expression);
                    }
                }
                const f = clazz.staticFields.find((f) => f.name === expression.name);
                return f?.types ?? [];
            }
            return this.fieldsFor(expression);
        }
        if (expression instanceof MemberCall) {
            if (expression.expression instanceof Access) {
                let clazz = this.currentScope.getClass(expression.expression.name);
                if (!clazz) {
                    clazz = this.currentScope.getEnum(expression.expression.name);
                    if (!clazz) {
                        return this.methodsFor(expression);
                    }
                }
                const m = clazz.staticMethods.find((m) => m.name === expression.name && m.parameters.length === expression.args.length);
                return m?.returns ?? [];
            }
            return this.methodsFor(expression);
        }

        if (expression instanceof NewCall) {
            return [expression.name.id];
        }
        if (expression instanceof FunctionAccess) {
            return ["Function"];
        }

        if (expression instanceof Assignable) {
            return this.guessType(expression.assignee);
        }

        return [];
    }

    private methodsFor(expression: MemberCall) {
        const types = this.guessType(expression.expression);
        const possible: string[] = [];
        for (const type of types) {
            let clazz = this.currentScope.getClass(type);
            if (!clazz) {
                clazz = this.currentScope.getEnum(type);
                if (!clazz) {
                    const inter = this.currentScope.getInterface(type);
                    if (!inter) {
                        continue;
                    }
                    const m = inter.methods.find((m) => m.name === expression.name && m.parameters.length === expression.args.length);
                    if (m?.returns) {
                        possible.push(...m.returns);
                    }
                    continue;
                }
            }
            const m = this.findMethod(clazz, expression.name, expression.args.length);
            if (m?.returns) {
                possible.push(...m.returns);
            }
        }
        return possible;
    }

    private findMethod(clazz: ClassData, name: string, params: number): FunctionData | undefined {
        const m = clazz.methods.find((m) => m.name === name && m.parameters.length === params);
        if (m) {
            return m;
        }
        if (clazz.name !== "Object") {
            for (const zuper of clazz.superclasses) {
                const clazz = this.currentScope.getClass(zuper);
                if (clazz) {
                    const method = this.findMethod(clazz, name, params);
                    if (method) {
                        return method;
                    }
                }
            }
        }
    }

    private fieldsFor(expression: MemberAccess) {
        const types = this.guessType(expression.expression);
        const possible: string[] = [];
        for (const type of types) {
            let clazz = this.currentScope.getClass(type);
            if (!clazz) {
                clazz = this.currentScope.getEnum(type);
                if (!clazz) {
                    continue;
                }
            }
            const f = this.findField(clazz, expression.name);
            if (f?.types) {
                possible.push(...f.types);
            }
        }
        return possible;
    }

    private findField(clazz: ClassData, name: string): VariableData | undefined {
        const f = clazz.fields.find((f) => f.name === name);
        if (f) {
            return f;
        }
        if (clazz.name !== "Object") {
            for (const zuper of clazz.superclasses) {
                const clazz = this.currentScope.getClass(zuper);
                if (clazz) {
                    const field = this.findField(clazz, name);
                    if (field) {
                        return field;
                    }
                }
            }
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
                if (token.type === TokenType.Identifier || token.type === TokenType.This || token.type === TokenType.Super) {
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
                        if (this.iterator.hasNext()) {
                            const next = this.iterator.peek();
                            if (next.type === TokenType.New) {
                                this.iterator.next();
                                this.chain.push(new TypedExpression(sub.content));
                                return true;
                            }
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
            let clazz = scope.getClass(name);
            if (!clazz) {
                clazz = scope.getEnum(name);
                if (!clazz) {
                    const inter = scope.getInterface(name);
                    if (!inter) {
                        continue;
                    }
                    // Fake class
                    clazz = {
                        name: inter.name,
                        methods: inter.methods,
                        desc: inter.desc,
                        fields: [],
                        staticFields: [],
                        staticMethods: [],
                        superclasses: []
                    };
                }
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
        if (this.name === "type") {
            return this.stringsToClassData(["Type"], scope);
        }
        if (isEnum(clazz)) {
            const element = clazz.enums.find((f) => f === this.name);
            if (element) {
                return this.stringsToClassData([clazz.name], scope);
            }
        }
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

function isEnum(object: unknown): object is EnumData {
    if (object && typeof object === "object") {
        return "enums" in object;
    }
    return false;
}