/* eslint-disable @typescript-eslint/no-unused-vars */

import { DiagnosticSeverity, Range } from "vscode";
import { Access, Assign, Binary, Bracket, BracketAccess, BracketAssign, Call, Expression, ExpressionVisitor, FunctionAccess, FunctionExpr, List, Literal, MapExpr, MemberAccess, MemberAssign, MemberCall, NewAccess, NewCall, Super, This, Unary, UnpackAssign } from "./expressions";
import { Trace } from "./lexer";
import { SemanticToken } from "./parser";
import { Break, Class, ClassBody, Constructor, Continue, Enum, ExpressionStmt, For, Foreach, FunctionStmt, If, Import, Interface, LocalVar, Return, Scope, Statement, StatementVisitor, Statements, Switch, Throw, Try, Void, While } from "./statements";

export abstract class Node {
    constructor(readonly token: SemanticToken) {}

    children(): Node[] {
        return [];
    }
}

export class Id extends Node {
    constructor(readonly id: string, token: SemanticToken) {
        super(token);
    }
}

export class Type extends Node {
    constructor(readonly name: string, token: SemanticToken) {
        super(token);
    }
}

export class Parameter extends Node {
    constructor(
        readonly name: string,
        readonly types: Type[],
        token: SemanticToken
    ) {
        super(token);
    }

    children(): Node[] {
        return [...this.types];
    }
}

export type PossibleModifier = SemanticToken | null;

export class Modifier extends Node {}

export class Variable extends Node {
    constructor(
        readonly name: Id,
        readonly readonly: PossibleModifier,
        readonly isPrivate: PossibleModifier,
        readonly expression: Expression,
        readonly types: Type[],
        token: SemanticToken
    ) {
        super(token);
    }

    children(): Node[] {
        const children: Node[] = [this.name, this.expression, ...this.types];
        if (this.readonly !== null) {
            children.push(new Modifier(this.readonly));
        }
        if (this.isPrivate !== null) {
            children.push(new Modifier(this.isPrivate));
        }
        return children;
    }
}

export class EnumMember extends Node {
    constructor(
        readonly name: string,
        readonly args: Expression[],
        token: SemanticToken
    ) {
        super(token);
    }

    children(): Node[] {
        return [...this.args];
    }
}

export class ConstructorDelegate extends Node {
    constructor(readonly args: Expression[], token: SemanticToken) {
        super(token);
    }

    children(): Node[] {
        return [...this.args];
    }
}

export class Else extends Node {
    constructor(readonly body: Statement, token: SemanticToken) {
        super(token);
    }

    children(): Node[] {
        return [this.body];
    }
}

export class From extends Node {
    constructor(readonly path: Id, token: SemanticToken) {
        super(token);
    }

    children(): Node[] {
        return [this.path];
    }
}

export class Catch extends Node {
    constructor(
        readonly body: Statement,
        readonly parameter: Parameter,
        token: SemanticToken
    ) {
        super(token);
    }

    children(): Node[] {
        return [this.body, this.parameter];
    }
}

export class Finally extends Node {
    constructor(readonly statement: Statement, token: SemanticToken) {
        super(token);
    }

    children(): Node[] {
        return [this.statement];
    }
}

export class InterfaceMethod extends Node {
    constructor(
        readonly name: Id,
        readonly parameters: Parameter[],
        readonly returns: Type[],
        token: SemanticToken
    ) {
        super(token);
    }

    children(): Node[] {
        return [this.name, ...this.parameters, ...this.returns];
    }
}

export interface Problem {
    readonly start: Trace,
    readonly end: Trace,
    readonly message: string,
    readonly severity?: DiagnosticSeverity 
}

export class ScopeRange {
    constructor(readonly range: Range) {}
}

export class BaseVisitor implements StatementVisitor<void>, ExpressionVisitor<void> {
    visitBreak(broke: Break): void {
        // Nothing
    }

    visitClassBody(klass: ClassBody): void {
        klass.constructors.forEach((c) => c.visit(this));
        klass.fields.forEach((f) => f.expression.visit(this));
        klass.methods.forEach((m) => m.visit(this));
        klass.operators.forEach((o) => o.visit(this));
        klass.staticFields.forEach((f) => f.expression.visit(this));
        klass.staticMethods.forEach((m) => m.visit(this));
        klass.initialisers.forEach((i) => i.visit(this));
    }

    visitClass(klass: Class): void {
        klass.body.visit(this);
    }

    visitConstructor(konstructor: Constructor): void {
        konstructor.delegate.args.forEach((a) => a.visit(this));
        konstructor.body.visit(this);
    }

    visitContinue(kontinue: Continue): void {
        // Nothing
    }

    visitEnum(enumeration: Enum): void {
        enumeration.enums.forEach((e) => e.args.forEach((a) => a.visit(this)));
        enumeration.body.visit(this);
    }

    visitExpression(expression: ExpressionStmt): void {
        expression.expression.visit(this);
    }

    visitForeach(foreach: Foreach): void {
        foreach.iterable.visit(this);
        foreach.body.visit(this);
    }

    visitFor(forr: For): void {
        forr.initial.visit(this);
        forr.condition.visit(this);
        forr.body.visit(this);
        forr.expression.visit(this);
    }

    visitFunction(func: FunctionStmt): void {
        func.body.visit(this);
    }

    visitIf(ifs: If): void {
        ifs.condition.visit(this);
        ifs.body.visit(this);
        ifs.otherwise.body.visit(this);
    }

    visitImport(imported: Import): void {
        // Nothing
    }

    visitInterface(interfaced: Interface): void {
        // Nothing
    }

    visitLocal(local: LocalVar): void {
        local.assignee.visit(this);
    }

    visitReturn(ret: Return): void {
        ret.expression.visit(this);
    }

    visitScope(scope: Scope): void {
        scope.statement.visit(this);
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

    visitVoid(voided: Void): void {
        // Nothing
    }

    visitWhile(whilst: While): void {
        whilst.condition.visit(this);
        whilst.body.visit(this);
    }

    visitAccess(access: Access): void {
        // Nothing
    }

    visitAssign(assign: Assign): void {
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

    visitFunctionAccess(func: FunctionAccess): void {
        // Nothing
    }

    visitFunctionExpr(func: FunctionExpr): void {
        func.body.visit(this);
    }

    visitList(list: List): void {
        list.expressions.forEach((e) => e.visit(this));
    }

    visitLiteral(literal: Literal<string | number | boolean | null>): void {
        // Nothing
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

    visitNewAcess(acess: NewAccess): void {
        // Nothing
    }

    visitNewCall(call: NewCall): void {
        call.args.forEach((a) => a.visit(this));
    }

    visitSuper(zuper: Super): void {
        // Nothing
    }

    visitThis(thiz: This): void {
        // Nothing
    }

    visitUnary(unary: Unary): void {
        unary.expression.visit(this);
    }

    visitUnpack(unpack: UnpackAssign): void {
        unpack.assignables.forEach((a) => a.visit(this));
        unpack.assignee.visit(this);
    }
}