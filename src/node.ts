import { Expression } from "./expressions";
import { Trace } from "./lexer";
import { SemanticToken } from "./parser";
import { Statement } from "./statements";

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

export class Problem {
    constructor(
        readonly start: Trace,
        readonly end: Trace,
        readonly message: string
    ) {}
}
