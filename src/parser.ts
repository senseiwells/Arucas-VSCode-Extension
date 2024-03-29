/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/naming-convention */

import { Range } from "vscode";
import {
    Access,
    Assignable,
    Binary,
    Bracket,
    BracketAccess,
    Call,
    Expression,
    FunctionExpr,
    List,
    Literal,
    MapExpr,
    MemberAccess,
    NewAccess,
    Super,
    This,
    ToAssignable,
    ToCallable,
    Unary,
    UnpackAssign,
    VoidExpr,
} from "./expressions";
import { Token, TokenType, Trace } from "./lexer";
import {
    Catch,
    ConstructorDelegate,
    Else,
    EnumMember,
    Finally,
    From,
    Id,
    InterfaceMethod,
    Parameter,
    PossibleModifier,
    Problem,
    ScopeRange,
    Type,
    Variable,
} from "./node";
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
    Statements,
    Switch,
    Throw,
    Try,
    Void,
    While,
} from "./statements";

export interface SemanticToken {
    token: Token;
    type?: SemanticTokenType;
    modifiers?: SemanticTokenModifier[];
}

export enum SemanticTokenType {
    Class = "class",
    Enum = "enum",
    Interface = "interface",
    Parameter = "parameter",
    Variable = "variable",
    Property = "property",
    EnumMember = "enumMember",
    Function = "function",
    Method = "method",
    String = "string",
    Keyword = "keyword",
    KeywordOther = "storage",
    Number = "number",
    Operator = "operator"
}

export enum SemanticTokenModifier {
    Declaration = "declaration",
    Private = "private", 
    Readonly = "readonly",
    Static = "static",
    Modification = "modification",
}

class ParseError extends Error {
    constructor(readonly start: SemanticToken, readonly message: string) {
        super(message);
    }
}

class TokenReader {
    private index = 0;

    constructor(private readonly tokens: Token[]) {}

    advance(amount = 1) {
        this.index = this.getOffset(amount);
        return this.tokens[this.index];
    }

    receded(amount = 1) {
        return this.advance(-amount);
    }

    peek(amount = 0) {
        return this.tokens[this.getOffset(amount)];
    }

    peekType(amount = 0) {
        return this.peek(amount).type;
    }

    match(...types: TokenType[]) {
        const token = this.peek();
        if (types.includes(token.type)) {
            this.advance();
            return token;
        }
        return null;
    }

    isMatch(...types: TokenType[]) {
        return this.match(...types) !== null;
    }

    isAtEnd() {
        return this.peekType() === TokenType.Eof;
    }

    isInBounds(offset: number) {
        const offsetIndex = this.index + offset;
        return offsetIndex < this.tokens.length && offsetIndex >= 0;
    }

    private getOffset(offset: number): number {
        const offsetIndex = this.index + offset;
        if (offsetIndex >= this.tokens.length && offsetIndex < 0) {
            throw new RangeError(`Index ${offsetIndex} is out of bounds!`);
        }
        return offsetIndex;
    }
}

export class Parser extends TokenReader {
    private readonly errors: Problem[] = [];

    private canUnpack = true;
    private parsed = false;

    constructor(tokens: Token[]) {
        super(tokens);
    }

    parse(): Statements {
        if (this.parsed) {
            throw new Error("Already consumed parser!");
        }
        this.parsed = true;
        const first = this.peek();
        const statments: Statement[] = [];
        while (!this.isAtEnd()) {
            statments.push(this.declaration());
        }
        return new Statements(statments, { token: first });
    }

    problems(): Problem[] {
        return this.errors;
    }

    declaration(): Statement {
        try {
            switch (this.peekType()) {
                case TokenType.Local:
                    return this.localDeclaration();
                case TokenType.Fun:
                    return this.functionDeclaration(false);
                case TokenType.Class:
                    return this.classDeclaration();
                case TokenType.Enum:
                    return this.enumDeclaration();
                case TokenType.Interface:
                    return this.interfaceDeclaration();
                default:
                    return this.statement();
            }
        } catch (e) {
            if (e instanceof ParseError) {
                this.errorSkip(e);
                return new Void(e.start);
            } else {
                throw e;
            }
        }
    }

    localDeclaration(): Statement {
        const local = this.checkAsSemantic(
            TokenType.Local,
            SemanticTokenType.KeywordOther
        );
        const id = this.checkAsSemantic(
            TokenType.Identifier,
            SemanticTokenType.Variable,
            [SemanticTokenModifier.Declaration],
            "Expected variable name"
        );
        const types = this.typeHint();
        this.checkSoft(
            TokenType.AssignOperator,
            "Expected '=' after variable name"
        );
        const expr = this.expression();
        this.checkSoft(
            TokenType.Semicolon,
            "Expected ';' after local variable declaration"
        );
        return new LocalVar(new Id(id.token.content, id), expr, types, local);
    }

    classDeclaration(): Statement {
        const clazz = this.checkAsSemantic(
            TokenType.Class,
            SemanticTokenType.KeywordOther
        );
        const id = this.checkAsSemantic(
            TokenType.Identifier,
            SemanticTokenType.Class,
            [SemanticTokenModifier.Declaration],
            "Expected class name"
        );
        const superclasses: Type[] = [];
        if (this.isMatch(TokenType.Colon)) {
            do {
                const superclass = this.checkAsSemantic(
                    TokenType.Identifier,
                    SemanticTokenType.Class,
                    undefined,
                    "Expected super class name"
                );
                superclasses.push(
                    new Type(superclass.token.content, superclass)
                );
            } while (this.isMatch(TokenType.Comma));
        }
        const type = superclasses.length ? "super class" : "class";
        this.checkSoft(
            TokenType.LeftCurlyBracket,
            `Expected '{' after ${type} name`
        );
        const start = this.peek(-1);
        const body = this.classBody(id.token.content);
        return new Class(
            new Id(id.token.content, id),
            superclasses,
            body,
            new ScopeRange(
                new Range(start.trace.range.start, this.peek(-1).trace.range.end)
            ),
            clazz
        );
    }

    enumDeclaration(): Statement {
        const enumeration = this.checkAsSemantic(
            TokenType.Enum,
            SemanticTokenType.KeywordOther
        );
        const id = this.checkAsSemantic(
            TokenType.Identifier,
            SemanticTokenType.Enum,
            [SemanticTokenModifier.Declaration],
            "Expected enum name"
        );
        const superclasses: Type[] = [];
        if (this.isMatch(TokenType.Colon)) {
            do {
                const superclass = this.checkAsSemantic(
                    TokenType.Identifier,
                    SemanticTokenType.Class,
                    undefined,
                    "Expected super class name"
                );
                superclasses.push(
                    new Type(superclass.token.content, superclass)
                );
            } while (this.isMatch(TokenType.Comma));
        }
        this.checkSoft(TokenType.LeftCurlyBracket, "Expected '{' after enum name");
        const start = this.peek(-1);
        const enums: EnumMember[] = [];
        while (true) {
            if (this.peekType() !== TokenType.Identifier) {
                break;
            }
            const member = this.checkAsSemantic(
                TokenType.Identifier,
                SemanticTokenType.EnumMember,
                [
                    SemanticTokenModifier.Declaration,
                    SemanticTokenModifier.Readonly,
                ]
            );
            if (enums.find((v) => v.name === member.token.content)) {
                this.softError(
                    `Enum cannot have a duplicate constant: '${member.token.content}'`,
                    member.token
                );
            }
            if (member.token.content === "type") {
                this.softError("Enum cannot define constant 'type'", member.token);
            }

            let args: Expression[] = [];
            if (this.isMatch(TokenType.LeftBracket)) {
                args =
                    this.peekType() === TokenType.RightBracket
                        ? []
                        : this.expressions();
                this.checkSoft(
                    TokenType.RightBracket,
                    "Expected ')' after enum arguments"
                );
            }
            enums.push(new EnumMember(member.token.content, args, member));
            this.isMatch(TokenType.Comma);
        }
        let body: Statement;
        if (!this.isMatch(TokenType.Semicolon)) {
            this.checkSoft(
                TokenType.RightCurlyBracket,
                "Expected '}' or ';' after enums"
            );
            body = new Void({ token: this.peek(-1) });
        } else {
            body = this.classBody(id.token.content);
        }
        return new Enum(
            new Id(id.token.content, id),
            superclasses,
            enums,
            body,
            new ScopeRange(
                new Range(start.trace.range.start, this.peek(-1).trace.range.end)
            ),
            enumeration
        );
    }

    interfaceDeclaration(): Statement {
        const inter = this.checkAsSemantic(
            TokenType.Interface,
            SemanticTokenType.KeywordOther
        );
        const id = this.checkAsSemantic(
            TokenType.Identifier,
            SemanticTokenType.Interface,
            [SemanticTokenModifier.Declaration],
            "Expected interface name"
        );
        this.checkSoft(
            TokenType.LeftCurlyBracket,
            "Expected '{' after interface name"
        );
        const start = this.peek(-1);
        const functions: InterfaceMethod[] = [];
        while (!this.isMatch(TokenType.RightCurlyBracket)) {
            const fun = this.checkAsSemantic(
                TokenType.Fun,
                SemanticTokenType.KeywordOther,
                undefined,
                "Expected function blueprint in interface"
            );
            const funId = this.checkAsSemantic(
                TokenType.Identifier,
                SemanticTokenType.Method,
                [SemanticTokenModifier.Declaration],
                "Expected function blueprint in interface"
            );
            this.checkSoft(
                TokenType.LeftBracket,
                "Expected '(' after function name"
            );
            let parameters: Parameter[];
            if (!this.isMatch(TokenType.RightBracket)) {
                parameters = this.functionParameters()[0];
            } else {
                parameters = [];
            }
            const hints = this.typeHint();
            this.checkSoft(
                TokenType.Semicolon,
                "Expected ';' after interface function"
            )
            functions.push(
                new InterfaceMethod(
                    new Id(funId.token.content, funId),
                    parameters,
                    hints,
                    fun
                )
            );
        }
        return new Interface(
            new Id(id.token.content, id), 
            functions, 
            new ScopeRange(
                new Range(start.trace.range.start, this.peek(-1).trace.range.end)
            ),
            inter
        );
    }

    classBody(name: string): ClassBody {
        const start = this.peek();
        const fields: Variable[] = [];
        const staticFields: Variable[] = [];
        const initialisers: Statement[] = [];
        const constructors: Constructor[] = [];
        const methods: FunctionStmt[] = [];
        const staticMethods: FunctionStmt[] = [];
        const operators: FunctionStmt[] = [];
        while (!this.isMatch(TokenType.RightCurlyBracket)) {
            let isPrivate: PossibleModifier = null;
            let isStatic: PossibleModifier = null;
            let readonly: PossibleModifier = null;
            const modifiers = [SemanticTokenModifier.Declaration];
            if (this.isMatch(TokenType.Private)) {
                modifiers.push(SemanticTokenModifier.Private);
                isPrivate = {
                    token: this.peek(-1),
                    type: SemanticTokenType.KeywordOther,
                };
            }
            if (this.isMatch(TokenType.Static)) {
                modifiers.push(SemanticTokenModifier.Static);
                isStatic = {
                    token: this.peek(-1),
                    type: SemanticTokenType.KeywordOther,
                };
            }
            if (this.isMatch(TokenType.Readonly)) {
                modifiers.push(SemanticTokenModifier.Readonly);
                readonly = {
                    token: this.peek(-1),
                    type: SemanticTokenType.KeywordOther,
                };
            }

            const current = this.peek();
            switch (current.type) {
                case TokenType.Var: {
                    this.advance();
                    const id = this.checkAsSemantic(
                        TokenType.Identifier,
                        SemanticTokenType.Property,
                        modifiers,
                        "Expected field name after 'var'"
                    );
                    const targetted = isStatic ? staticFields : fields;
                    if (targetted.find((v) => v.name.id === id.token.content)) {
                        this.softError("Class cannot contain duplicate field name", id.token);
                    }
                    if (isStatic && id.token.content === "type") {
                        this.softError("Class cannot define static field 'type'", id.token);
                    }
                    const hint = this.typeHint();
                    let expr: Expression;
                    if (this.isMatch(TokenType.AssignOperator)) {
                        expr = this.expression();
                        this.checkSoft(
                            TokenType.Semicolon,
                            "Expected ';' after field assignment"
                        );
                    } else if (this.isMatch(TokenType.Semicolon)) {
                        expr = new VoidExpr({ token: this.peek(-1) });
                    } else {
                        expr = new VoidExpr({ token: this.peek(-1) });
                        this.softError(
                            "Expected ';' or assignment after field declaration"
                        );
                    }
                    targetted.push(
                        new Variable(
                            new Id(id.token.content, id),
                            readonly,
                            isPrivate,
                            expr,
                            hint,
                            { 
                                token: current, 
                                type: SemanticTokenType.KeywordOther 
                            }
                        )
                    );
                    break;
                }
                case TokenType.Identifier: {
                    const id = this.checkAsSemantic(
                        TokenType.Identifier, 
                        SemanticTokenType.Class, 
                        [SemanticTokenModifier.Declaration, ...modifiers]
                    );
                    if (isStatic) {
                        this.softError("Class constructor cannot be static", id.token);
                    }
                    if (readonly) {
                        this.softError("Class constructor cannot be readonly", id.token);
                    }
                    if (id.token.content !== name) {
                        this.softError("Constructor must have the same name as the class", id.token);
                    }

                    this.checkSoft(TokenType.LeftBracket, "Expected '(' after constructor");
                    const [parameters, varargs] = this.functionParameters();
                    let delegate: ConstructorDelegate;
                    if (this.isMatch(TokenType.Colon)) {
                        const next = this.peek();
                        if (next.type !== TokenType.This && next.type !== TokenType.Super) {
                            this.softError("Expected 'this' or 'super' after constructor call");
                            delegate = new ConstructorDelegate([], { token: this.peek() });
                        } else {
                            this.advance();
                            this.checkSoft(TokenType.LeftBracket, `Expected '(' after ${next.content}`);
                            const expressions = this.peekType() === TokenType.RightBracket ? [] : this.expressions();
                            this.checkSoft(TokenType.RightBracket, "Expected closing ')'");
                            delegate = new ConstructorDelegate(expressions, {
                                token: next,
                                type: SemanticTokenType.KeywordOther
                            })
                        }
                    } else {
                        delegate = new ConstructorDelegate([], { token: this.peek() });
                    }

                    const body = this.statement();
                    constructors.push(
                        new Constructor(
                            parameters, 
                            varargs, 
                            isPrivate, 
                            delegate, 
                            body,
                            new ScopeRange(
                                new Range(id.token.trace.range.start, this.peek(-1).trace.range.end)
                            ),
                            id
                        )
                    );
                    break;
                }
                case TokenType.Fun: {
                    if (readonly) {
                        this.softError("Class function cannot be readonly", current);
                    }
                    (isStatic ? staticMethods : methods).push(this.functionDeclaration(true, isPrivate, ...modifiers));
                    break;
                }
                case TokenType.Operator: {
                    const operator = this.checkAsSemantic(TokenType.Operator, SemanticTokenType.KeywordOther);
                    if (isStatic) {
                        this.softError("Operator method cannot be static", current);
                    }
                    if (readonly) {
                        this.softError("Operator method cannot be readonly", current);
                    }
                    if (isPrivate) {
                        this.softError("Operator method cannot be private", current);
                    }

                    const next = this.peek();
                    this.advance();
                    let typeAsString: string;
                    if (next.type === TokenType.LeftSquareBracket) {
                        this.checkSoft(TokenType.RightSquareBracket, "Expected closing ']'");
                        typeAsString = "[]";
                    } else {
                        typeAsString = next.content;
                    }

                    this.checkSoft(TokenType.LeftBracket, "Expected '(' after operator");
                    const [parameters, varargs] = this.functionParameters();
                    const count = varargs ? -1 : parameters.length;

                    if (!this.isOverridable(count, next.type)) {
                        this.softError(`No such operator '${typeAsString}' with ${count} parameters`, next);
                    }

                    const returns = this.typeHint();
                    const body = this.statement();

                    const fun = new FunctionStmt(
                        new Id(typeAsString, { token: next }), 
                        true, 
                        isPrivate, 
                        parameters, 
                        varargs, 
                        returns, 
                        body, 
                        new ScopeRange(
                            new Range(operator.token.trace.range.end, this.peek(-1).trace.range.end)
                        ),
                        operator
                    );
                    operators.push(fun);
                    break;
                }
                case TokenType.LeftCurlyBracket: {
                    if (!isStatic) {
                        this.softError("Class initializer must be preceded by 'static'", current);
                    }
                    if (readonly) {
                        this.softError("Class initializer cannot be readonly", current)
                    }
                    if (isPrivate) {
                        this.softError("Class initializer cannot be private", current)
                    }
                    initialisers.push(this.scopedStatement());
                    break;
                }
                default: {
                    this.error(
                        "Unexpected token in class statement: " + current.content,
                        current
                    );
                }
            }
        }
        return new ClassBody(
            fields,
            staticFields,
            initialisers,
            constructors,
            methods,
            staticMethods,
            operators,
            { token: start }
        );
    }

    functionDeclaration(
        isClass: boolean,
        isPrivate: PossibleModifier = null,
        ...modifiers: SemanticTokenModifier[]
    ): FunctionStmt {
        if (!modifiers.includes(SemanticTokenModifier.Declaration)) {
            modifiers.push(SemanticTokenModifier.Declaration);
        }
        const fun = this.checkAsSemantic(
            TokenType.Fun,
            SemanticTokenType.KeywordOther
        );
        const id = this.checkAsSemantic(
            TokenType.Identifier,
            isClass ? SemanticTokenType.Method : SemanticTokenType.Function,
            modifiers,
            "Expected function name"
        );
        this.checkSoft(TokenType.LeftBracket, "Expeced '(' after function name");

        const [parameters, varargs] = this.functionParameters();
        const returns = this.typeHint();
        const body = this.statement();

        return new FunctionStmt(
            new Id(id.token.content, id),
            isClass,
            isPrivate,
            parameters,
            varargs,
            returns,
            body,
            new ScopeRange(
                new Range(fun.token.trace.range.end, this.peek(-1).trace.range.end)
            ),
            fun
        );
    }

    functionParameters(): [Parameter[], boolean] {
        const parameters: Parameter[] = [];
        let isVarargs = false;
        this.pushUnpack(false, () => {
            let isFirst = true;
            while (
                !this.isMatch(TokenType.RightBracket) &&
                (isFirst || this.isMatch(TokenType.Comma))
            ) {
                const id = this.checkAsSemantic(
                    TokenType.Identifier,
                    SemanticTokenType.Parameter,
                    [SemanticTokenModifier.Declaration],
                    "Expected argument name"
                );

                if (this.isMatch(TokenType.Arbitrary)) {
                    this.checkSoft(TokenType.RightBracket);
                    parameters.push(new Parameter(id.token.content, [], id));
                    isVarargs = true;
                    return;
                }

                parameters.push(
                    new Parameter(id.token.content, this.typeHint(), id)
                );
                isFirst = false;
            }
        });
        return [parameters, isVarargs];
    }

    typeHint(): Type[] {
        const types: Type[] = [];
        if (this.isMatch(TokenType.Colon)) {
            do {
                const id = this.checkAsSemantic(
                    TokenType.Identifier,
                    SemanticTokenType.Class,
                    undefined,
                    "Expected class name"
                );
                types.push(new Type(id.token.content, id));
            } while (this.isMatch(TokenType.BitOr));
        }
        return types;
    }

    scopedStatement(): Statement {
        switch (this.peekType()) {
            case TokenType.LeftCurlyBracket:
                return this.scope();
            default: {
                const start = this.peek();
                return new Scope(
                    this.statement(), 
                    new ScopeRange(
                        new Range(start.trace.range.start, this.peek(-1).trace.range.end)
                    ), 
                    { token: start }
                );
            }
        }
    }

    scope(): Statement {
        const start = this.peek();
        const statements = this.statements();
        if (statements instanceof Void) {
            return statements;
        }
        return new Scope(
            statements,
            new ScopeRange(
                new Range(start.trace.range.start, this.peek(-1).trace.range.end)
            ), 
            { token: start }
        );
    }

    statements(): Statement {
        const start = this.checkAsSemantic(TokenType.LeftCurlyBracket);

        if (this.isMatch(TokenType.RightCurlyBracket)) {
            return new Void(start);
        }

        const statements: Statement[] = [];
        do {
            statements.push(this.declaration());
        } while (!this.isMatch(TokenType.RightCurlyBracket) && !this.isAtEnd());

        return new Statements(statements, start);
    }

    statement(): Statement {
        switch (this.peekType()) {
            case TokenType.If:
                return this.ifStatement();
            case TokenType.Switch:
                return this.switchStatement();
            case TokenType.While:
                return this.whileStatement();
            case TokenType.For:
                return this.forStatement();
            case TokenType.Foreach:
                return this.foreachStatement();
            case TokenType.Try:
                return this.tryStatement();
            case TokenType.Throw:
                return this.throwStatement();
            case TokenType.Return:
                return this.returnStatement();
            case TokenType.Continue:
                return this.continueStatement();
            case TokenType.Break:
                return this.breakStatement();
            case TokenType.Import:
                return this.importStatement();
            case TokenType.Semicolon:
                return new Void({ token: this.advance() });
            case TokenType.LeftCurlyBracket:
                return this.scopedStatement();
            default:
                return this.expressionStatement();
        }
    }

    ifStatement() {
        const iff = this.checkAsSemantic(
            TokenType.If,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'if'");
        const condition = this.expression();
        this.checkSoft(TokenType.RightBracket, "Expected ')' after if condition");
        const body = this.scopedStatement();
        const next = this.peek();
        let otherwise: Else;
        if (next.type === TokenType.Else) {
            this.advance();
            otherwise = new Else(this.scopedStatement(), {
                token: next,
                type: SemanticTokenType.Keyword,
            });
        } else {
            otherwise = new Else(new Void({ token: next }), { token: next });
        }
        return new If(condition, body, otherwise, iff);
    }

    switchStatement() {
        const sw = this.checkAsSemantic(
            TokenType.Switch,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'switch'");
        const condition = this.expression();
        this.checkSoft(
            TokenType.RightBracket,
            "Expected ')' after switch condition"
        );
        this.checkSoft(
            TokenType.LeftCurlyBracket,
            "Expceted '{' after switch condition"
        );

        const cases: Expression[][] = [];
        const caseStatements: Statement[] = [];
        let def: Statement | null = null;

        while (!this.isMatch(TokenType.RightCurlyBracket)) {
            const current = this.peek();
            if (current.type === TokenType.Default) {
                this.advance();
                if (def !== null) {
                    this.softError(
                        "Switch statement can only have one default case",
                        current
                    );
                }
                this.checkSoft(TokenType.Pointer, "Expected '->' after 'default'");
                def = this.scopedStatement();
                continue;
            }
            this.checkAsSemantic(
                TokenType.Case,
                SemanticTokenType.Keyword,
                undefined,
                "Expected 'case' or 'default' in switch body"
            );
            const subcases = this.expressions();
            this.checkSoft(
                TokenType.Pointer,
                "Expected '->' after 'case' expressions"
            );
            const statement = this.scopedStatement();
            cases.push(subcases);
            caseStatements.push(statement);
        }

        return new Switch(condition, cases, caseStatements, def, sw);
    }

    whileStatement() {
        const whil = this.checkAsSemantic(
            TokenType.While,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'while'");
        const condition = this.expression();
        this.checkSoft(
            TokenType.RightBracket,
            "Expected ')' after while condition"
        );
        const body = this.scopedStatement();
        return new While(condition, body, whil);
    }

    forStatement() {
        const fo = this.checkAsSemantic(
            TokenType.For,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'for'");
        let initial: Statement;
        switch (this.peekType()) {
            case TokenType.Local:
                initial = this.localDeclaration();
                break;
            case TokenType.Semicolon:
                initial = new Void({ token: this.advance() });
                break;
            default:
                initial = this.expressionStatement();
        }
        const condition =
            this.peekType() === TokenType.Semicolon
                ? new Literal(true, { token: this.advance() })
                : this.expression();
        this.checkSoft(TokenType.Semicolon, "Expected ';' after for condition");
        const end =
            this.peekType() === TokenType.RightBracket
                ? new VoidExpr({ token: this.advance() })
                : this.expression();
        this.checkSoft(TokenType.RightBracket, "Expected ')' after for expression");
        const body = this.statement();
        return new For(
            initial,
            condition, 
            end,
            body, 
            new ScopeRange(
                new Range(fo.token.trace.range.end, this.peek(-1).trace.range.end)
            ),
            fo
        );
    }

    foreachStatement() {
        const foreach = this.checkAsSemantic(
            TokenType.Foreach,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'foreach'");
        const id = this.checkAsSemantic(
            TokenType.Identifier,
            SemanticTokenType.Variable,
            [SemanticTokenModifier.Declaration],
            "Expected foreach variable name after '('"
        );
        this.checkSoft(
            TokenType.Colon,
            "Expected ':' between variable name and iterator expression"
        );
        const iter = this.expression();
        this.checkSoft(
            TokenType.RightBracket,
            "Expected ')' after iterator expression"
        );
        const body = this.statement();
        return new Foreach(
            new Id(id.token.content, id), 
            iter, 
            body, 
            new ScopeRange(
                new Range(foreach.token.trace.range.end, this.peek(-1).trace.range.end)
            ),
            foreach
        );
    }

    tryStatement() {
        const tr = this.checkAsSemantic(
            TokenType.Try,
            SemanticTokenType.Keyword
        );
        const body = this.scopedStatement();
        let catc: Catch | null = null;
        const current = this.peek();
        if (current.type === TokenType.Catch) {
            this.advance();
            this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'catch'");
            const id = this.checkAsSemantic(
                TokenType.Identifier,
                SemanticTokenType.Variable,
                [SemanticTokenModifier.Declaration],
                "Expected catch variable name after '('"
            );
            const parameter = new Parameter(
                id.token.content,
                this.typeHint(),
                id
            );
            this.checkSoft(
                TokenType.RightBracket,
                "Expected ')' after catch parameter"
            );
            const catchBody = this.statement();
            catc = new Catch(catchBody, parameter, {
                token: current,
                type: SemanticTokenType.Keyword,
            });
        }
        let final: Finally;
        const next = this.peek();
        if (next.type === TokenType.Finally) {
            this.advance();
            final = new Finally(this.scopedStatement(), {
                token: next,
                type: SemanticTokenType.Keyword,
            });
        } else {
            final = new Finally(new Void({ token: next }), { token: next });
        }
        return new Try(body, catc, final, tr);
    }

    throwStatement() {
        const thr = this.checkAsSemantic(
            TokenType.Throw,
            SemanticTokenType.Keyword
        );
        const expression = this.expression();
        this.checkSoft(TokenType.Semicolon, "Expected ';' after throw expression");
        return new Throw(expression, thr);
    }

    returnStatement() {
        const ret = this.checkAsSemantic(
            TokenType.Return,
            SemanticTokenType.Keyword
        );
        if (this.isMatch(TokenType.Semicolon)) {
            return new Return(new VoidExpr({ token: this.peek(-1) }), ret);
        }
        const expression = this.expression();
        this.checkSoft(TokenType.Semicolon, "Expected ';' after return expression");
        return new Return(expression, ret);
    }

    continueStatement() {
        const cont = this.checkAsSemantic(
            TokenType.Continue,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.Semicolon, "Expected ';' after 'continue'");
        return new Continue(cont);
    }

    breakStatement() {
        const brek = this.checkAsSemantic(
            TokenType.Break,
            SemanticTokenType.Keyword
        );
        this.checkSoft(TokenType.Semicolon, "Expected ';' after 'break'");
        return new Break(brek);
    }

    importStatement() {
        const imp = this.checkAsSemantic(
            TokenType.Import,
            SemanticTokenType.KeywordOther
        );
        this.isMatch(TokenType.Local);
        const names: Type[] = [];
        if (!this.isMatch(TokenType.Multiply)) {
            do {
                const id = this.checkAsSemantic(
                    TokenType.Identifier,
                    SemanticTokenType.Class
                );
                names.push(new Type(id.token.content, id));
            } while (this.isMatch(TokenType.Comma));
        } else {
            names.push(new Type("*", { token: this.peek(-1) }));
        }
        const from = this.checkAsSemantic(
            TokenType.From,
            SemanticTokenType.KeywordOther,
            undefined,
            "Expected 'from' after import names"
        );
        let builder = new String(
            this.check(TokenType.Identifier, "Expected module name").content
        );
        const first = this.peek(-1).trace;
        while (this.isMatch(TokenType.Dot)) {
            builder += "."
            builder += this.check(
                TokenType.Identifier,
                "Expected submodule name after '.'"
            ).content;
        }
        const last = this.peek().trace;
        this.checkSoft(TokenType.Semicolon, "Expected ';' after module name");
        const idToken: SemanticToken = {
            token: new Token(
                TokenType.Identifier,
                new Trace(
                    new Range(
                        first.range.start,
                        last.range.end
                    ),
                    first.offset,
                    last.offset - first.offset
                ),
                builder.toString()
            ),
            type: SemanticTokenType.Class
        };
        return new Import(
            names,
            new From(new Id(builder.toString(), idToken), from),
            imp
        );
    }

    expressionStatement(): Statement {
        const start = this.peek();
        const expression = this.pushUnpack(true, () => {
            return this.expression();
        });
        this.checkSoft(TokenType.Semicolon, "Expected ';' after expression");
        return new ExpressionStmt(expression, { token: start });
    }

    expression(): Expression {
        return this.assignment();
    }

    assignment(): Expression {
        const left = this.logicalOr();
        if (this.canUnpack && this.peekType() === TokenType.Comma) {
            return this.unpackAssignment(left);
        }

        if (this.isMatch(TokenType.AssignOperator)) {
            if (!this.isAssignable(left)) {
                this.error(`Cannot assign ${left}`);
            }
            return left.toAssignable(this.assignment());
        }

        const assignType = this.convertAssignment(this.peekType());
        if (assignType !== null) {
            this.advance();
            return this.binaryAssignment(left, assignType, this.assignment());
        }

        return left;
    }

    unpackAssignment(first: Expression): Expression {
        const assignables: Assignable[] = [];
        let next = first;
        do {
            if (!this.isAssignable(next)) {
                this.error(`Cannot assign '${next}'`);
            }
            assignables.push(next.toAssignable(new Literal(null, first.token)));

            if (this.isMatch(TokenType.Comma)) {
                next = this.logicalOr();
            } else {
                break;
            }
        } while (true);
        const assign = this.checkAsSemantic(
            TokenType.AssignOperator,
            undefined,
            undefined,
            "Expected '=' after unpack variables"
        );
        const assignee = this.expression();
        return new UnpackAssign(assignables, assignee, assign);
    }

    logicalOr(): Expression {
        let left = this.logicalAnd();
        while (true) {
            const current = this.peek();
            if (current.type === TokenType.Or) {
                this.advance();
                const right = this.logicalAnd();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    logicalAnd(): Expression {
        let left = this.bitOr();
        while (true) {
            const current = this.peek();
            if (current.type === TokenType.And) {
                this.advance();
                const right = this.bitOr();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    bitOr(): Expression {
        let left = this.xor();
        while (true) {
            const current = this.peek();
            if (current.type === TokenType.BitOr) {
                this.advance();
                const right = this.xor();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    xor(): Expression {
        let left = this.bitAnd();
        while (true) {
            const current = this.peek();
            if (current.type === TokenType.Xor) {
                this.advance();
                const right = this.bitAnd();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    bitAnd(): Expression {
        let left = this.equality();
        while (true) {
            const current = this.peek();
            if (current.type === TokenType.BitAnd) {
                this.advance();
                const right = this.equality();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    equality(): Expression {
        let left = this.relational();
        while (true) {
            const current = this.peek();
            if (
                current.type === TokenType.Equals ||
                current.type === TokenType.NotEquals
            ) {
                this.advance();
                const right = this.relational();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    relational(): Expression {
        let left = this.shift();
        while (true) {
            const current = this.peek();
            if (
                current.type === TokenType.LessThan ||
                current.type === TokenType.MoreThan ||
                current.type === TokenType.LessThanEqual ||
                current.type === TokenType.MoreThanEqual
            ) {
                this.advance();
                const right = this.shift();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    shift(): Expression {
        let left = this.additive();
        while (true) {
            const current = this.peek();
            if (
                current.type === TokenType.ShiftLeft ||
                current.type === TokenType.ShiftRight
            ) {
                this.advance();
                const right = this.additive();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    additive(): Expression {
        let left = this.multiplicative();
        while (true) {
            const current = this.peek();
            if (
                current.type === TokenType.Plus ||
                current.type === TokenType.Minus
            ) {
                this.advance();
                const right = this.multiplicative();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    multiplicative(): Expression {
        let left = this.unary();
        while (true) {
            const current = this.peek();
            if (
                current.type === TokenType.Multiply ||
                current.type === TokenType.Divide
            ) {
                this.advance();
                const right = this.unary();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    unary(): Expression {
        const current = this.peek();
        if (
            current.type === TokenType.Not ||
            current.type === TokenType.Plus ||
            current.type === TokenType.Minus
        ) {
            this.advance();
            const unary = this.unary();
            return new Unary(unary, { token: current });
        }
        return this.power();
    }

    power(): Expression {
        let left = this.post();
        while (true) {
            const current = this.peek();
            if (current.type === TokenType.Power) {
                this.advance();
                const right = this.unary();
                left = new Binary(left, right, { token: current });
            } else {
                break;
            }
        }
        return left;
    }

    post(): Expression {
        let expression = this.atom();
        let repeat = true;
        while (repeat) {
            const current = this.peek();
            switch (current.type) {
                case TokenType.LeftBracket: {
                    this.advance();
                    let args: Expression[] = [];
                    if (!this.isMatch(TokenType.RightBracket)) {
                        args = this.expressions();
                        this.checkSoft(
                            TokenType.RightBracket,
                            "Expected ')' after call arguments"
                        );
                    }
                    expression = this.isCallable(expression)
                        ? expression.toCallable(args)
                        : new Call(expression, args, { token: current });
                    break;
                }
                case TokenType.LeftSquareBracket: {
                    this.advance();
                    const index = this.expression();
                    this.checkSoft(
                        TokenType.RightSquareBracket,
                        "Expected '[' after index"
                    );
                    expression = new BracketAccess(expression, index, {
                        token: current,
                    });
                    break;
                }
                case TokenType.Dot: {
                    this.advance();
                    const id = this.checkAsSemantic(
                        TokenType.Identifier,
                        SemanticTokenType.Property,
                        undefined,
                        "Expected field name after '.'"
                    );
                    expression = new MemberAccess(
                        expression,
                        id.token.content,
                        id
                    );
                    break;
                }
                case TokenType.Increment:
                    expression = this.binaryAssignment(
                        expression,
                        TokenType.Plus,
                        new Literal(1, { token: this.peek() })
                    );
                    this.advance();
                    break;
                case TokenType.Decrement:
                    expression = this.binaryAssignment(
                        expression,
                        TokenType.Minus,
                        new Literal(1, { token: this.peek() })
                    );
                    this.advance();
                    break;
                default:
                    repeat = false;
            }
        }
        return expression;
    }

    atom(): Expression {
        const current = this.peek();
        switch (current.type) {
            case TokenType.False:
            case TokenType.True:
                this.advance();
                return new Literal(current.type === TokenType.True, {
                    token: current,
                    type: SemanticTokenType.KeywordOther,
                });
            case TokenType.Null:
                this.advance();
                return new Literal(null, {
                    token: current,
                    type: SemanticTokenType.KeywordOther,
                });
            case TokenType.Identifier:
                this.advance();
                return new Access(current.content, {
                    token: current,
                    type: SemanticTokenType.Variable,
                });
            case TokenType.Number:
                this.advance();
                return new Literal(Number(current.content), {
                    token: current,
                    type: SemanticTokenType.Number,
                });
            case TokenType.String:
                this.advance();
                return new Literal(
                    current.content.substring(1, current.content.length - 1),
                    {
                        token: current,
                        type: SemanticTokenType.String,
                    }
                );
            case TokenType.This:
                this.advance();
                return new This({
                    token: current,
                    type: SemanticTokenType.KeywordOther,
                });
            case TokenType.Super:
                this.advance();
                return new Super({
                    token: current,
                    type: SemanticTokenType.KeywordOther,
                });
            case TokenType.LeftSquareBracket:
                return this.listLiteral();
            case TokenType.LeftCurlyBracket:
                return this.mapLiteral();
            case TokenType.LeftBracket: {
                this.advance();
                const expression = this.expression();
                this.checkSoft(
                    TokenType.RightBracket,
                    "Expected ')' after expression"
                );
                return new Bracket(expression, { token: current });
            }
            case TokenType.Fun:
                return this.functionExpression();
            case TokenType.New: {
                this.advance();
                const id = this.checkAsSemantic(
                    TokenType.Identifier,
                    SemanticTokenType.Class,
                    undefined,
                    "Expected class name after 'new'"
                );
                return new NewAccess(new Id(id.token.content, id), {
                    token: current,
                    type: SemanticTokenType.KeywordOther,
                });
            }
            default:
                this.error();
        }
    }

    expressions(): Expression[] {
        const expressions: Expression[] = [];
        this.pushUnpack(false, () => {
            do {
                expressions.push(this.expression());
            } while (this.isMatch(TokenType.Comma));
        });
        return expressions;
    }

    listLiteral() {
        const start = this.checkAsSemantic(TokenType.LeftSquareBracket);
        if (!this.isMatch(TokenType.RightSquareBracket)) {
            const expressions = this.expressions();
            this.checkSoft(
                TokenType.RightSquareBracket,
                "Expected closing ']' after list expressions"
            );
            return new List(expressions, start);
        }
        return new List([], start);
    }

    mapLiteral() {
        const start = this.checkAsSemantic(TokenType.LeftCurlyBracket);
        const map = new Map<Expression, Expression>();
        this.pushUnpack(false, () => {
            if (!this.isMatch(TokenType.RightCurlyBracket)) {
                do {
                    const key = this.expression();
                    this.checkSoft(
                        TokenType.Colon,
                        "Expected ':' between key and value in a map"
                    );
                    map.set(key, this.expression());
                } while (this.isMatch(TokenType.Comma));
                this.checkSoft(
                    TokenType.RightCurlyBracket,
                    "Expected closing '}' after map expression"
                );
            }
        });
        return new MapExpr(map, start);
    }

    functionExpression() {
        const fun = this.checkAsSemantic(
            TokenType.Fun,
            SemanticTokenType.KeywordOther
        );
        this.checkSoft(TokenType.LeftBracket, "Expected '(' after 'fun'");
        const [parameters, varargs] = this.functionParameters();
        const returns = this.typeHint();
        let body: Statement;
        if (this.peekType() === TokenType.LeftCurlyBracket) {
            body = this.statement();
        } else {
            const start = this.peek();
            body = new Return(this.expression(), { token: start });
        }
        return new FunctionExpr(
            parameters, 
            varargs, 
            returns, 
            body, 
            new ScopeRange(
                new Range(fun.token.trace.range.end, this.peek(-1).trace.range.end)
            ),
            fun
        );
    }

    binaryAssignment(
        expression: Expression,
        type: TokenType,
        other: Expression
    ) {
        if (!this.isAssignable(expression)) {
            this.error("Cannot modify a non assignable expression");
        }
        const token = new Token(type, this.peek(-1).trace, type.toString());
        return expression.toAssignable(
            new Binary(expression, other, { token: token })
        );
    }

    convertAssignment(type: TokenType) {
        switch (type) {
            case TokenType.PlusAssign:
                return TokenType.Plus;
            case TokenType.MinusAssign:
                return TokenType.Minus;
            case TokenType.MultiplyAssign:
                return TokenType.Multiply;
            case TokenType.DivideAssign:
                return TokenType.Divide;
            case TokenType.PowerAssign:
                return TokenType.Power;
            case TokenType.AndAssign:
                return TokenType.BitAnd;
            case TokenType.OrAssign:
                return TokenType.BitOr;
            case TokenType.XorAssign:
                return TokenType.Xor;
        }
        return null;
    }

    isOverridable(parameters: number, type: TokenType) {
        if (parameters === 0) {
            switch (type) {
                case TokenType.Not:
                case TokenType.Plus:
                case TokenType.Minus:
                    return true;
            }
            return false;
        }
        if (parameters === 1) {
            switch (type) {
                case TokenType.Plus:
                case TokenType.Minus:
                case TokenType.Multiply:
                case TokenType.Divide:
                case TokenType.Power:
                case TokenType.LessThan:
                case TokenType.LessThanEqual:
                case TokenType.MoreThan:
                case TokenType.MoreThanEqual:
                case TokenType.Equals:
                case TokenType.NotEquals:
                case TokenType.And:
                case TokenType.Or:
                case TokenType.Xor:
                case TokenType.ShiftLeft:
                case TokenType.ShiftRight:
                case TokenType.BitAnd:
                case TokenType.BitOr:
                case TokenType.LeftSquareBracket:
                    return true;
            }   
            return false;
        }
        if (parameters === 2) {
            return type === TokenType.LeftSquareBracket;
        }
        return false;
    }

    checkAsSemantic(
        type: TokenType,
        semantic?: SemanticTokenType,
        modifiers?: SemanticTokenModifier[],
        message?: string
    ): SemanticToken {
        const token = this.check(type, message);
        return {
            token: token,
            type: semantic,
            modifiers: modifiers,
        };
    }

    check(type: TokenType, message?: string): Token {
        const current = this.peek();
        if (current.type !== type) {
            this.error(
                message ??
                    `Unexpected token ${current.content}, expected type: ${type}`,
                current
            );
        }
        this.advance();
        return current;
    }
    
    checkSoft(type: TokenType, message?: string): void {
        const current = this.peek();
        if (current.type !== type) {
            this.softError(
                message ??
                    `Unexpected token ${current.content}, expected type: ${type}`,
                current
            );
        } else {
            this.advance();
        }
    }

    error(message?: string, token: Token = this.peek()): never {
        throw new ParseError(
            { token: token },
            message ?? `Unexpected token ${token.content}`
        );
    }

    softError(message: string, start: Token = this.peek(), end: Token = start): void {
        this.errors.push({
            start: start.trace,
            end: end.trace,
            message: message 
        })
    }

    errorSkip(error: ParseError) {
        try {
            while (!this.isAtEnd()) {
                switch (this.peekType()) {
                    case TokenType.Class:
                    case TokenType.Enum:
                    case TokenType.Interface:
                    case TokenType.Fun:
                    case TokenType.If:
                    case TokenType.For:
                    case TokenType.Foreach:
                    case TokenType.Local:
                    case TokenType.While:
                    case TokenType.Return:
                    case TokenType.Break:
                    case TokenType.Continue:
                    case TokenType.Switch:
                    case TokenType.Try:
                    case TokenType.Throw:
                    case TokenType.Import:
                        return;
                    default:
                        this.advance();
                }
            }
        } finally {
            this.errors.push({
                start: error.start.token.trace,
                end: this.peek(-1).trace,
                message: error.message
            });
        }
    }

    pushUnpack<T>(bool: boolean, block: () => T): T {
        const previous = this.canUnpack;
        try {
            this.canUnpack = bool;
            return block();
        } finally {
            this.canUnpack = previous;
        }
    }

    isAssignable(object: unknown): object is ToAssignable {
        if (object && typeof object === "object") {
            return "toAssignable" in object;
        }
        return false;
    }

    isCallable(object: unknown): object is ToCallable {
        if (object && typeof object === "object") {
            return "toCallable" in object;
        }
        return false;
    }
}
