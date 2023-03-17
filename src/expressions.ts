import { TokenType } from "./lexer";
import { Id, Node, Parameter, Type } from "./node";
import {
    SemanticToken,
    SemanticTokenModifier,
    SemanticTokenType,
} from "./parser";
import { Statement } from "./statements";

export interface ExpressionVisitor<T> {
    visitAccess(access: Access): T;
    visitAssign(assign: Assign): T;
    visitBinary(binary: Binary): T;
    visitBracketAccess(bracket: BracketAccess): T;
    visitBracketAssign(bracket: BracketAssign): T;
    visitBracket(bracket: Bracket): T;
    visitCall(call: Call): T;
    visitFunctionAccess(func: FunctionAccess): T;
    visitFunctionExpr(func: FunctionExpr): T;
    visitList(list: List): T;
    visitLiteral(literal: Literal<any>): T;
    visitMap(map: MapExpr): T;
    visitMemberAccess(member: MemberAccess): T;
    visitMemberAssign(member: MemberAssign): T;
    visitMemberCall(member: MemberCall): T;
    visitNewAcess(acess: NewAccess): T;
    visitNewCall(call: NewCall): T;
    visitSuper(zuper: Super): T;
    visitThis(thiz: This): T;
    visitUnary(unary: Unary): T;
    visitUnpack(unpack: UnpackAssign): T;
}

export interface ToAssignable {
    toAssignable(assignee: Expression): Assignable;
}

export interface ToCallable {
    toCallable(args: Expression[]): Expression;
}

export abstract class Expression extends Node {
    abstract visit<T>(visitor: ExpressionVisitor<T>): T;
}

export abstract class Assignable extends Expression {
    readonly assignee: Expression;

    constructor(assignee: Expression, token: SemanticToken) {
        super(token);
        this.assignee = assignee;
    }

    children(): Node[] {
        return [this.assignee];
    }
}

export class Access extends Expression implements ToAssignable, ToCallable {
    readonly name: string;

    constructor(name: string, token: SemanticToken) {
        super(token);
        this.name = name;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitAccess(this);
    }

    toAssignable(assignee: Expression): Assignable {
        return new Assign(this.name, assignee, {
            token: this.token.token,
            type: SemanticTokenType.Variable,
            modifiers: [SemanticTokenModifier.Modification],
        });
    }

    toCallable(args: Expression[]): Expression {
        return new Call(
            new FunctionAccess(this.name, args.length, this.token),
            args,
            this.token
        );
    }
}

export class Assign extends Assignable {
    readonly name: string;

    constructor(name: string, assignee: Expression, token: SemanticToken) {
        super(assignee, token);
        this.name = name;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitAssign(this);
    }
}

export class Binary extends Expression {
    readonly left: Expression;
    readonly type: TokenType;
    readonly right: Expression;

    constructor(left: Expression, right: Expression, token: SemanticToken) {
        super(token);
        this.left = left;
        this.type = token.token.type;
        this.right = right;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitBinary(this);
    }

    children(): Node[] {
        return [this.left, this.right];
    }
}

export class BracketAccess extends Expression implements ToAssignable {
    readonly expression: Expression;
    readonly index: Expression;

    constructor(
        expression: Expression,
        index: Expression,
        token: SemanticToken
    ) {
        super(token);
        this.expression = expression;
        this.index = index;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitBracketAccess(this);
    }

    toAssignable(assignee: Expression): Assignable {
        return new BracketAssign(
            this.expression,
            this.index,
            assignee,
            this.token
        );
    }

    children(): Node[] {
        return [this.expression, this.index];
    }
}

export class BracketAssign extends Assignable {
    readonly expression: Expression;
    readonly index: Expression;

    constructor(
        expression: Expression,
        index: Expression,
        assignee: Expression,
        token: SemanticToken
    ) {
        super(assignee, token);
        this.expression = expression;
        this.index = index;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitBracketAssign(this);
    }

    children(): Node[] {
        return [this.expression, this.index, this.assignee];
    }
}

export class Bracket extends Expression {
    readonly expression: Expression;

    constructor(expression: Expression, token: SemanticToken) {
        super(token);
        this.expression = expression;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitBracket(this);
    }

    children(): Node[] {
        return [this.expression];
    }
}

export class Call extends Expression {
    readonly expression: Expression;
    readonly args: Expression[];

    constructor(
        expression: Expression,
        args: Expression[],
        token: SemanticToken
    ) {
        super(token);
        this.expression = expression;
        this.args = args;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitCall(this);
    }

    children(): Node[] {
        return [this.expression, ...this.args];
    }
}

export class FunctionAccess extends Expression {
    readonly name: string;
    readonly parameters: number;

    constructor(name: string, parameters: number, token: SemanticToken) {
        super(token);
        this.name = name;
        this.parameters = parameters;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitFunctionAccess(this);
    }
}

export class FunctionExpr extends Expression {
    readonly parameters: Parameter[];
    readonly arbitrary: boolean;
    readonly returns: Type[];
    readonly body: Statement;

    constructor(
        parameters: Parameter[],
        arbitrary: boolean,
        returns: Type[],
        body: Statement,
        token: SemanticToken
    ) {
        super(token);
        this.parameters = parameters;
        this.arbitrary = arbitrary;
        this.returns = returns;
        this.body = body;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitFunctionExpr(this);
    }

    children(): Node[] {
        return [...this.parameters, ...this.returns, this.body];
    }
}

export class List extends Expression {
    readonly expressions: Expression[];

    constructor(expressions: Expression[], token: SemanticToken) {
        super(token);
        this.expressions = expressions;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitList(this);
    }

    children(): Node[] {
        return [...this.expressions];
    }
}

export class Literal<
    T extends string | number | boolean | null
> extends Expression {
    readonly literal: T;

    constructor(literal: T, token: SemanticToken) {
        super(token);
        this.literal = literal;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitLiteral(this);
    }
}

export class MapExpr extends Expression {
    readonly expressions: Map<Expression, Expression>;

    constructor(
        expressions: Map<Expression, Expression>,
        token: SemanticToken
    ) {
        super(token);
        this.expressions = expressions;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitMap(this);
    }

    children(): Node[] {
        return [...this.expressions.keys(), ...this.expressions.values()];
    }
}

export class MemberAccess
    extends Expression
    implements ToAssignable, ToCallable
{
    readonly expression: Expression;
    readonly name: string;

    constructor(expression: Expression, name: string, token: SemanticToken) {
        super(token);
        this.expression = expression;
        this.name = name;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitMemberAccess(this);
    }

    toAssignable(assignee: Expression): Assignable {
        return new MemberAssign(this.expression, this.name, assignee, {
            token: this.token.token,
            type: SemanticTokenType.Property,
            modifiers: [SemanticTokenModifier.Modification],
        });
    }

    toCallable(args: Expression[]): Expression {
        return new MemberCall(this.expression, this.name, args, {
            token: this.token.token,
            type: SemanticTokenType.Method,
        });
    }

    children(): Node[] {
        return [this.expression];
    }
}

export class MemberAssign extends Assignable {
    readonly expression: Expression;
    readonly name: string;

    constructor(
        expression: Expression,
        name: string,
        assignee: Expression,
        token: SemanticToken
    ) {
        super(assignee, token);
        this.expression = expression;
        this.name = name;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitMemberAssign(this);
    }

    children(): Node[] {
        return [this.expression, this.assignee];
    }
}

export class MemberCall extends Expression {
    readonly expression: Expression;
    readonly name: string;
    readonly args: Expression[];

    constructor(
        expression: Expression,
        name: string,
        args: Expression[],
        token: SemanticToken
    ) {
        super(token);
        this.expression = expression;
        this.name = name;
        this.args = args;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitMemberCall(this);
    }

    children(): Node[] {
        return [this.expression, ...this.args];
    }
}

export class NewAccess extends Expression implements ToCallable {
    readonly name: Id;

    constructor(name: Id, token: SemanticToken) {
        super(token);
        this.name = name;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitNewAcess(this);
    }

    toCallable(args: Expression[]): Expression {
        return new NewCall(this.name, args, this.token);
    }

    children(): Node[] {
        return [this.name];
    }
}

export class NewCall extends Expression {
    readonly name: Id;
    readonly args: Expression[];

    constructor(name: Id, args: Expression[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.args = args;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitNewCall(this);
    }

    children(): Node[] {
        return [this.name, ...this.args];
    }
}

export class Super extends Expression {
    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitSuper(this);
    }
}

export class This extends Expression {
    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitThis(this);
    }
}

export class Unary extends Expression {
    readonly type: TokenType;
    readonly expression: Expression;

    constructor(expression: Expression, token: SemanticToken) {
        super(token);
        this.type = token.token.type;
        this.expression = expression;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitUnary(this);
    }

    children(): Node[] {
        return [this.expression];
    }
}

export class UnpackAssign extends Expression {
    readonly assignables: Assignable[];
    readonly assignee: Expression;

    constructor(
        assignables: Assignable[],
        assignee: Expression,
        token: SemanticToken
    ) {
        super(token);
        this.assignables = assignables;
        this.assignee = assignee;
    }

    visit<T>(visitor: ExpressionVisitor<T>): T {
        return visitor.visitUnpack(this);
    }

    children(): Node[] {
        return [...this.assignables, this.assignee];
    }
}

export class VoidExpr extends Literal<null> {
    constructor(token: SemanticToken) {
        super(null, token);
    }
}
