import * as vscode from "vscode";
import { InterfaceMethod, Type, Variable } from "./node";
import { FunctionStmt } from "./statements";

export interface ParameterData {
    name: string,
    types: string[]
}

export interface VariableData {
    name: string,
    desc?: string,
    isPrivate: boolean,
    types?: string[],
}

export interface FunctionData {
    name: string,
    desc?: string,
    parameters: ParameterData[],
    returns: string[],
    isPrivate: boolean,
    varargs: boolean
}

export interface ClassData {
    name: string,
    desc?: string,
    superclasses: string[],
    fields: VariableData[],
    staticFields: VariableData[],
    methods: FunctionData[],
    staticMethods: FunctionData[]
}

export interface EnumData extends ClassData {
    enums: string[]
}

export interface InterfaceData {
    name: string,
    desc?: string,
    methods: FunctionData[]
}

export class ContextScope {
    private readonly children: ContextScope[] = [];

    private readonly variables = new Map<string, VariableData>();
    private readonly classes = new Map<string, ClassData>();
    private readonly functions = new Map<string, FunctionData[]>();
    private readonly interfaces = new Map<string, InterfaceData>();
    private readonly enums = new Map<string, EnumData>();

    constructor(
        readonly range: vscode.Range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
        private readonly parent: ContextScope | null = null
    ) {}

    addVariable(variable: Variable) {
        this.addRawVariable(variable.name.id, ...variable.types);
    }

    addRawVariable(name: string, ...types: Type[]) {
        if (types.length === 0) {
            const parentTypes = this.getVariableType(name)
            if (!parentTypes) {
                this.variables.set(name, {
                    name: name,
                    isPrivate: false
                });
            }
        } else {
            this.variables.set(name, {
                name: name,
                isPrivate: false,
                types: types.map((t) => t.name)
            })
        }
    }

    addFunction(func: FunctionStmt) {
        const functions = this.functions.get(func.name.id) ?? [];
        functions.push({
            name: func.name.id,
            parameters: func.parameters.map((p) => ({ name: p.name, types: p.types.map((t) => t.name) })),
            returns: func.returns.map((t) => t.name),
            isPrivate: false,
            varargs: func.arbitrary
        });
        this.functions.set(func.name.id, functions);
    }

    addClass(data: ClassData) {
        this.classes.set(data.name, data);
    }

    addEnum(data: EnumData) {
        this.enums.set(data.name, data);
    }

    addInterface(iterfaceData: InterfaceData) {
        this.interfaces.set(iterfaceData.name, iterfaceData);
    }

    addField(className: string, field: Variable) {
        const data = this.getClassOrEnumData(className);
        data.fields.push({
            name: field.name.id,
            desc: "",
            isPrivate: !!field.isPrivate,
            types: field.types.map((t) => t.name)
        });
    }

    addStaticField(className: string, field: Variable) {
        const data = this.getClassOrEnumData(className);
        data.staticFields.push({
            name: field.name.id,
            isPrivate: !!field.isPrivate,
            types: field.types.map((t) => t.name)
        });
    }

    addMethod(className: string, func: FunctionStmt) {
        const data = this.getClassOrEnumData(className);
        data.methods.push({
            name: func.name.id,
            parameters: func.parameters.map((p) => ({ name: p.name, types: p.types.map((t) => t.name) })),
            returns: func.returns.map((t) => t.name),
            isPrivate: !!func.isPrivate,
            varargs: func.arbitrary
        });
    }

    addStaticMethod(className: string, func: FunctionStmt) {
        const data = this.getClassOrEnumData(className);
        data.staticMethods.push({
            name: func.name.id,
            parameters: func.parameters.map((p) => ({ name: p.name, types: p.types.map((t) => t.name) })),
            returns: func.returns.map((t) => t.name),
            isPrivate: !!func.isPrivate,
            varargs: func.arbitrary
        });
    }

    addInterfaceMethod(interfaceName: string, func: InterfaceMethod) {
        this.getInterface(interfaceName).methods.push({
            name: func.name.id,
            parameters: func.parameters.map((p) => ({ name: p.name, types: p.types.map((t) => t.name) })),
            returns: func.returns.map((t) => t.name),
            isPrivate: false,
            varargs: false
        });
    }

    getVariable(name: string): VariableData | undefined {
        const variable = this.variables.get(name);
        return variable ? variable : this.parent?.getVariable(name);
    }

    getFunction(name: string, parameters: number): FunctionData | undefined {
        const functions = this.functions.get(name);
        if (functions) {
            for (const func of functions) {
                if (func.parameters.length === parameters) {
                    return func;
                }
            }
        }
        return this.parent?.getFunction(name, parameters);
    }

    getClass(name: string): ClassData | undefined {
        const clazz = this.classes.get(name);
        return clazz ? clazz : this.parent?.getClass(name)
    }

    getEnum(name: string): EnumData | undefined {
        const enu = this.enums.get(name);
        return enu ? enu : this.parent?.getEnum(name)
    }

    getVariables(): VariableData[] {
        const variables: VariableData[] = [];
        for (const scope of this.hierarchy()) {
            if (scope.variables.size !== 0) {
                variables.push(...scope.variables.values())
            }
        }
        return variables
    }

    getFunctions(): FunctionData[] {
        const functions: FunctionData[] = [];
        for (const scope of this.hierarchy()) {
            if (scope.functions.size !== 0) {
                for (const f of scope.functions.values()) {
                    functions.push(...f);
                }
            }
        }
        return functions
    }

    getClasses(): ClassData[] {
        const classes: ClassData[] = [];
        for (const scope of this.hierarchy()) {
            if (scope.classes.size !== 0) {
                classes.push(...scope.classes.values())
            }
        }
        return classes
    }

    getEnums(): EnumData[] {
        const enums: EnumData[] = [];
        for (const scope of this.hierarchy()) {
            if (scope.enums.size !== 0) {
                enums.push(...scope.enums.values())
            }
        }
        return enums
    }

    getClassesAndEnums(): ClassData[] {
        const classes: ClassData[] = [];
        for (const scope of this.hierarchy()) {
            if (scope.classes.size !== 0) {
                classes.push(...scope.classes.values())
            }
            if (scope.enums.size !== 0) {
                classes.push(...scope.enums.values());
            }
        }
        return classes
    }

    getInterfaces(): InterfaceData[] {
        const interfaces: InterfaceData[] = [];
        for (const scope of this.hierarchy()) {
            if (scope.interfaces.size !== 0) {
                interfaces.push(...scope.interfaces.values())
            }
        }
        return interfaces
    }

    addChild(context: ContextScope) {
        this.children.push(context);
    }

    getScopeForPosition(position: vscode.Position): ContextScope | null {
        if (this.parent !== null && !this.range.contains(position)) {
            return null;
        }
        if (this.children.length !== 0) {
            for (const child of this.children) {
                const scope = child.getScopeForPosition(position);
                if (scope) {
                    return scope;
                }
            }
        }
        return this;
    }

    private hierarchy(): IterableIterator<ContextScope> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let current: ContextScope | null = this
        return {
            [Symbol.iterator]() { return this },
            next() {
                const next = current;
                if (next === null) {
                    return { 
                        done: true,
                        value: undefined
                    }
                }
                current = next.parent;
                return {
                    done: false,
                    value: next
                };
            }
        };
    }

    private getClassOrEnumData(name: string): ClassData {
        let clazz = this.getClass(name);
        if (!clazz) {
            clazz = this.getEnum(name);
            if (!clazz) {
                throw new Error(`Expected to be able to find class with name '${name}'`);
            }
        }
        return clazz;
    }

    private getInterface(name: string): InterfaceData {
        let clazz = this.interfaces.get(name);
        clazz = clazz ? clazz : this.parent?.getInterface(name)
        if (!clazz) {
            throw new Error(`Expected to be able to find interface with name ${name}`);
        }
        return clazz;
    }

    private getVariableType(name: string): string[] | undefined {
        const variable = this.variables.get(name);
        if (variable?.types) {
            return variable.types
        } else if (this.parent) {
            return this.parent.getVariableType(name);
        }
        return undefined;
    }
}
