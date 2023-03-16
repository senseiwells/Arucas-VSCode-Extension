import { Expression } from "./expressions";
import { SemanticToken } from "./parser";
import { Statement } from "./statements";

export abstract class Node {
    readonly token: SemanticToken;

    constructor(token: SemanticToken) {
        this.token = token;
    }

    children(): Node[] {
        return [];
    }
}

export class Id extends Node {
    readonly id: string;

    constructor(id: string, token: SemanticToken) {
        super(token);
        this.id = id;
    }
}

export class Type extends Node {
    readonly name: string;

    constructor(name: string, token: SemanticToken) {
        super(token);
        this.name = name;
    }
}

export class Parameter extends Node {
    readonly name: string;
    readonly types: Type[];

    constructor(name: string, types: Type[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.types = types;
    }

    children(): Node[] {
        return [...this.types];
    }
}

export type PossibleModifier = SemanticToken | null;

export class Modifier extends Node {

}

export class Variable extends Node {
    readonly name: Id;
    readonly readonly: PossibleModifier;
    readonly isPrivate: PossibleModifier;
    readonly expression: Expression;
    readonly types: Type[];

    constructor(name: Id, readonly: PossibleModifier, isPrivate: PossibleModifier, expression: Expression, types: Type[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.readonly = readonly;
        this.isPrivate = isPrivate;
        this.expression = expression;
        this.types = types;
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
    readonly name: string;
    readonly args: Expression[];

    constructor(name: string, args: Expression[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.args = args;
    }

    children(): Node[] {
        return [...this.args];
    }
}

export class ConstructorDelegate extends Node {
    readonly args: Expression[];

    constructor(args: Expression[], token: SemanticToken) {
        super(token);
        this.args = args;
    }

    children(): Node[] {
        return [...this.args];
    }
}

export class Else extends Node {
    readonly body: Statement;

    constructor(body: Statement, token: SemanticToken) {
        super(token);
        this.body = body;
    }

    children(): Node[] {
        return [this.body];
    }
}

export class From extends Node {
    readonly path: Id;

    constructor(path: Id, token: SemanticToken) {
        super(token);
        this.path = path;
    }

    children(): Node[] {
        return [this.path];
    }
}

export class Catch extends Node {
    readonly body: Statement;
    readonly parameter: Parameter;

    constructor(body: Statement, parameter: Parameter, token: SemanticToken) {
        super(token);
        this.body = body;
        this.parameter = parameter;
    }

    children(): Node[] {
        return [this.body, this.parameter];
    }
}

export class Finally extends Node {
    readonly statement: Statement;

    constructor(statement: Statement, token: SemanticToken) {
        super(token);
        this.statement = statement;
    }

    children(): Node[] {
        return [this.statement];
    }
}

export class InterfaceMethod extends Node {
    readonly name: Id;
    readonly parameters: Parameter[];
    readonly returns: Type[];

    constructor(name: Id, parameters: Parameter[], returns: Type[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.parameters = parameters;
        this.returns = returns;
    }

    children(): Node[] {
        return [this.name, ...this.parameters, ...this.returns];
    }
}

export class Problem extends Node {
    readonly start: SemanticToken;
    readonly end: SemanticToken;
    readonly message: string;

    constructor(start: SemanticToken, end: SemanticToken, message: string) {
        super(start);
        this.start = start;
        this.end = end;
        this.message = message;
    }
}