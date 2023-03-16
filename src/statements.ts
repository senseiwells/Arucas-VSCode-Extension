import { Expression } from "./expressions";
import { Catch, ConstructorDelegate, Else, EnumMember, Finally, From, Id, InterfaceMethod, Modifier, Node, Parameter, PossibleModifier, Type, Variable } from "./node";
import { SemanticToken } from "./parser";

export interface StatementVisitor<T> {
    visitBreak(broke: Break): T
    visitClassBody(klass: ClassBody): T
    visitClass(klass: Class): T
    visitConstructor(konstructor: Constructor): T
    visitContinue(kontinue: Continue): T
    visitEnum(enumeration: Enum): T
    visitExpression(expression: ExpressionStmt): T
    visitForeach(foreach: Foreach): T
    visitFor(forr: For): T
    visitFunction(func: Function): T
    visitIf(ifs: If): T
    visitImport(imported: Import): T
    visitInterface(interfaced: Interface): T
    visitLocal(local: LocalVar): T
    visitReturn(ret: Return): T
    visitScope(scope: Scope): T
    visitStatements(statements: Statements): T
    visitSwitch(switsch: Switch): T
    visitThrow(thrown: Throw): T
    visitTry(tried: Try): T
    visitVoid(voided: Void): T
    visitWhile(whilst: While): T
}

export abstract class Statement extends Node {
    abstract visit<T>(visitor: StatementVisitor<T>): T;
}

export class Break extends Statement {
    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitBreak(this);
    }
}

export class ClassBody extends Statement { 
    readonly fields: Variable[];
    readonly staticFields: Variable[];
    readonly initialisers: Statement[];
    readonly constructors: Constructor[];
    readonly methods: Function[];
    readonly staticMethods: Function[];
    readonly operators: Function[];

    constructor(fields: Variable[], staticFields: Variable[],  initialisers: Statement[], constructors: Constructor[], methods: Function[], staticMethods: Function[], operators: Function[], token: SemanticToken) {
        super(token);
        this.fields = fields;
        this.staticFields = staticFields;
        this.initialisers = initialisers;
        this.constructors = constructors;
        this.methods = methods;
        this.staticMethods = staticMethods;
        this.operators = operators;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitClassBody(this);
    }

    children(): Node[] {
        return [...this.fields, ...this.staticFields, ...this.initialisers, ...this.constructors, ...this.methods, ...this.staticMethods, ...this.operators];
    }
}

export class Class extends Statement {
    readonly name: Id;
    readonly parents: Type[];
    readonly body: ClassBody;

    constructor(name: Id, parents: Type[], body: ClassBody, token: SemanticToken) {
        super(token);
        this.name = name;
        this.parents = parents;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitClass(this);
    }

    children(): Node[] {
        return [this.name, ...this.parents, this.body];
    }
}

export class Constructor extends Statement {
    readonly parameters: Parameter[];
    readonly arbitrary: PossibleModifier;
    readonly isPrivate: PossibleModifier;
    readonly delegete: ConstructorDelegate;
    readonly body: Statement;
    
    constructor(parameters: Parameter[], arbitrary: PossibleModifier, isPrivate: PossibleModifier, delegate: ConstructorDelegate, body: Statement, token: SemanticToken) {
        super(token);
        this.parameters = parameters;
        this.arbitrary = arbitrary;
        this.isPrivate = isPrivate;
        this.delegete = delegate;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitConstructor(this);
    }

    children(): Node[] {
        const children: Node[] = [...this.parameters, this.delegete, this.body];
        if (this.arbitrary !== null) {
            children.push(new Modifier(this.arbitrary));
        }
        if (this.isPrivate !== null) {
            children.push(new Modifier(this.isPrivate));
        }
        return children;
    }
}

export class Continue extends Statement {
    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitContinue(this);
    }
}

export class Enum extends Statement {
    readonly name: Id;
    readonly parents: Type[];
    readonly enums: EnumMember[];
    readonly body: Statement;

    constructor(name: Id, parents: Type[], enums: EnumMember[], body: Statement, token: SemanticToken) {
        super(token);
        this.name = name;
        this.parents = parents;
        this.enums = enums;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitEnum(this);
    }

    children(): Node[] {
        return [this.name, ...this.parents, ...this.enums, this.body];
    }
}

export class ExpressionStmt extends Statement {
    readonly expression: Expression;

    constructor(expression: Expression, token: SemanticToken) {
        super(token);
        this.expression = expression;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitExpression(this);
    }

    children(): Node[] {
        return [this.expression];
    }
}

export class Foreach extends Statement {
    readonly name: Id;
    readonly iterable: Expression;
    readonly body: Statement;
    
    constructor(name: Id, iterable: Expression, body: Statement, token: SemanticToken) {
        super(token);
        this.name = name;
        this.iterable = iterable;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitForeach(this);
    }

    children(): Node[] {
        return [this.name, this.iterable, this.body];
    }
}

export class For extends Statement {
    readonly initial: Statement;
    readonly condition: Expression;
    readonly expression: Expression;
    readonly body: Statement;
    
    constructor(initial: Statement, condition: Expression, expression: Expression, body: Statement, token: SemanticToken) {
        super(token);
        this.initial = initial;
        this.condition = condition;
        this.expression = expression;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitFor(this);
    }

    children(): Node[] {
        return [this.initial, this.condition, this.expression, this.body];
    }
}

export class Function extends Statement {
    readonly name: Id;
    readonly isClass: boolean;
    readonly isPrivate: boolean;
    readonly parameters: Parameter[];
    readonly arbitrary: boolean;
    readonly returns: Type[];
    readonly body: Statement;
    
    constructor(name: Id, isClass: boolean, isPrivate: boolean, parameters: Parameter[], arbitrary: boolean, returns: Type[], body: Statement, token: SemanticToken) {
        super(token);
        this.name = name;
        this.isClass = isClass;
        this.isPrivate = isPrivate;
        this.parameters = parameters;
        this.arbitrary = arbitrary;
        this.returns = returns;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitFunction(this);
    }

    children(): Node[] {
        return [this.name, ...this.parameters, ...this.returns, this.body];
    }
}

export class If extends Statement {
    readonly condition: Expression;
    readonly body: Statement;
    readonly otherwise: Else;

    constructor(condition: Expression, body: Statement, otherwise: Else, token: SemanticToken) {
        super(token);
        this.condition = condition;
        this.body = body;
        this.otherwise = otherwise;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitIf(this);
    }

    children(): Node[] {
        return [this.condition, this.body, this.otherwise];
    }
}

export class Import extends Statement {
    readonly imports: Type[];
    readonly from: From;

    constructor(imports: Type[], from: From, token: SemanticToken) {
        super(token);
        this.imports = imports;
        this.from = from;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitImport(this);
    }

    children(): Node[] {
        return [...this.imports, this.from];
    }
}

export class Interface extends Statement {
    readonly name: Id;
    readonly required: InterfaceMethod[];

    constructor(name: Id, required: InterfaceMethod[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.required = required;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitInterface(this);
    }

    children(): Node[] {
        return [this.name, ...this.required];
    }
}

export class LocalVar extends Statement {
    readonly name: Id;
    readonly assignee: Expression;
    readonly types: Type[];

    constructor(name: Id, assignee: Expression, types: Type[], token: SemanticToken) {
        super(token);
        this.name = name;
        this.assignee = assignee;
        this.types = types;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitLocal(this);
    }

    children(): Node[] {
        return [this.name, this.assignee, ...this.types];
    }
}

export class Return extends Statement {
    readonly expression: Expression;

    constructor(expression: Expression, token: SemanticToken) {
        super(token);
        this.expression = expression;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitReturn(this);
    }

    children(): Node[] {
        return [this.expression];
    }
}

export class Scope extends Statement {
    readonly statement: Statement;

    constructor(statement: Statement, token: SemanticToken) {
        super(token);
        this.statement = statement;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitScope(this);
    }

    children(): Node[] {
        return [this.statement];
    }
}

export class Statements extends Statement {
    readonly statements: Statement[];

    constructor(statements: Statement[], token: SemanticToken) {
        super(token);
        this.statements = statements;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitStatements(this);
    }

    children(): Node[] {
        return [...this.statements];
    }
}

export class Switch extends Statement {
    readonly condition: Expression;
    readonly cases: Expression[][];
    readonly caseStatements: Statement[];
    readonly defaultStatement: Statement | null;
    
    constructor(condition: Expression, cases: Expression[][], caseStatements: Statement[], defaultStatement: Statement | null, token: SemanticToken) {
        super(token);
        this.condition = condition;
        this.cases = cases;
        this.caseStatements = caseStatements;
        this.defaultStatement = defaultStatement;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitSwitch(this);
    }

    children(): Node[] {
        const result = this.cases.reduce((a, v) => a.concat(v), []);
        const children: Node[] = [this.condition, ...result, ...this.caseStatements];
        if (this.defaultStatement !== null) {
            children.push(this.defaultStatement);
        }
        return children;
    }
}

export class Throw extends Statement {
    readonly throwable: Expression;

    constructor(throwable: Expression, token: SemanticToken) {
        super(token);
        this.throwable = throwable;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitThrow(this);
    }

    children(): Node[] {
        return [this.throwable];
    }
}

export class Try extends Statement {
    readonly body: Statement;
    readonly catch: Catch | null;
    readonly finally: Finally;

    constructor(body: Statement, catches: Catch | null, finalli: Finally, token: SemanticToken) {
        super(token);
        this.body = body;
        this.catch = catches;
        this.finally = finalli;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitTry(this);
    }

    children(): Node[] {
        const children: Node[] = [this.body, this.finally];
        if (this.catch !== null) {
            children.push(this.catch);
        }
        return children;
    }
}

export class Void extends Statement {
    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitVoid(this);
    }
}

export class While extends Statement {
    readonly condition: Expression;
    readonly body: Statement;

    constructor(condition: Expression, body: Statement, token: SemanticToken) {
        super(token);
        this.condition = condition;
        this.body = body;
    }

    visit<T>(visitor: StatementVisitor<T>): T {
        return visitor.visitWhile(this);
    }

    children(): Node[] {
        return [this.condition, this.body];
    }
}