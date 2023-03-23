import axios from "axios";
import * as vscode from "vscode";
import { ClassData, EnumData, FunctionData, InterfaceData } from "./context";

interface ParameterDoc {
    name: string,
    type: string,
    desc: string
}

interface ReturnDoc {
    type: string,
    desc: string
}

interface FunctionDoc {
    name: string,
    is_arbitrary: boolean,
    desc: string[],
    params?: ParameterDoc[],
    returns?: ReturnDoc,
    examples: string[]
}

interface ConstructorDoc {
    desc: string,
    params?: ParameterDoc[],
    examples: string[]
}

interface FieldDoc {
    name: string,
    assignable: boolean,
    desc: string[],
    type: string,
    examples: string[]
}

interface ClassDoc {
    name: string,
    desc: string[],
    import_path: string | null,
    superclass: string,
    static_members: FieldDoc[],
    constructors: ConstructorDoc[],
    methods: FunctionDoc[],
    static_methods: FunctionDoc[]
}

interface RootDoc {
    version: string,
    extensions: object,
    classes: object
}

export class BuiltIns {
    static builtInFunctions: FunctionData[];
    static builtInClasses: ClassData[];
    static importableClasses: Map<string, Array<ClassData | EnumData | InterfaceData>>;
    static objClass: ClassData;

    static {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("arucas.natives")) {
                this.updateBuiltins();
            }
        });
        this.updateBuiltins();
    }

    static noop() {
        // noop
    }

    private static async updateBuiltins() {
        const value = vscode.workspace.getConfiguration("arucas").get("natives");
        if (!(value instanceof Array)) {
            return;
        }

        this.builtInFunctions = [];
        this.builtInClasses = [];
        this.importableClasses = new Map();

        const urls = value as Array<string>;
        for (const url of urls) {
            const content = await axios.get(url);
            try {
                this.parse(content.data);
            } catch (e) {
                // Idk
                if (e instanceof Error) {
                    vscode.window.showErrorMessage(
                        `Unable to use built-ins from url ${url}:\n${e.message}`
                    );
                }
            }
        }

        for (const clazz of this.builtInClasses) {
            if (clazz.name === "Object") {
                this.objClass = clazz;
                break;
            }
        }
    }

    private static parse(docs: RootDoc) {
        for (const [name, functions] of Object.entries(docs.extensions)) {
            this.parseExtension(name, functions);
        }
        for (const [name, clazz] of Object.entries(docs.classes)) {
            this.parseClass(name, clazz);
        }
    }

    private static parseExtension(name: string, functions: FunctionDoc[]) {
        for (const func of functions) {
            const data = this.parseFunction(func);
            if (!this.builtInFunctions.find((f) => f.name === data.name && f.parameters.length === data.parameters.length && f.varargs === data.varargs)) {
                this.builtInFunctions.push(data);
            }
        }
    }

    private static parseClass(name: string, clazz: ClassDoc) {
        let classes: Array<ClassData | EnumData | InterfaceData>;
        if (clazz.import_path) {
            const importable = this.importableClasses.get(clazz.import_path);
            if (importable) {
                classes = importable;
            } else {
                classes = [];
                this.importableClasses.set(clazz.import_path, classes);
            }
        } else {
            classes = this.builtInClasses;
        }
        let description = new String();
        description += clazz.desc.join("\n");

        if (!classes.find((c) => c.name === clazz.name)) {
            classes.push({
                name: clazz.name,
                fields: [],
                staticFields: clazz.static_members.map((f) => ({ name: f.name, isPrivate: false, types: [f.type], desc: f.desc.join("\n") })),
                methods: clazz.methods.map((m) => this.parseFunction(m)),
                staticMethods: clazz.static_methods.map((m) => this.parseFunction(m)),
                superclasses: [clazz.superclass],
                desc: description.toString()
            });
        }
    }
 
    private static parseFunction(func: FunctionDoc): FunctionData {
        let description = new String();
        description += func.desc.join("\n");
        if (func.params) {
            description += "\n\n";
            description += "### Parameters:\n";
            description += func.params.map((p) => `* \`${p.name}: ${p.type}\` - ${p.desc}`).join("\n");
        }
        if (func.returns) {
            description += "\n\n";
            description += "### Returns:\n";
            description += `(\`${func.returns.type}\`) `;
            description += func.returns.desc;
        }

        description += "\n\n### Examples:"
        func.examples.forEach((e) => {
            description += "\n\n";
            description += "```arucas\n"
            description += e;
            description += "\n```"
        });

        return {
            name: func.name,
            isPrivate: false,
            parameters: func.params?.map((p) => ({ name: p.name, types: [p.type]})) ?? [],
            returns: [func.returns?.type ?? "Null"],
            varargs: func.is_arbitrary,
            desc: description.toString()
        };
    }
}