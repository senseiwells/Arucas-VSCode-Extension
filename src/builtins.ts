import axios from "axios";
import * as vscode from "vscode";
import { ClassData, FunctionData } from "./context";

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
    static readonly builtInFunctions: FunctionData[] = [];
    static readonly builtInClasses: ClassData[] = [];
    static readonly importableClasses: Map<string, ClassData[]> = new Map();

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
    }

    private static parse(docs: RootDoc) {
        for (const [name, functions] of Object.entries(docs.extensions)) {
            this.parseExtension(name, functions);
        }
        for (const [name, clazz] of Object.entries(docs.extensions)) {
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
        // TODO:
    }

    private static parseFunction(func: FunctionDoc): FunctionData {
        let description = new String();
        description += func.desc.join("\n");
        if (func.params) {
            description += "\n\n";
            description += "### Parameters:\n";
            description += func.params.map((p) => `* \`${p.name}\` - ${p.desc}`).join("\n");
        }
        if (func.returns) {
            description += "\n\n";
            description += "### Returns:\n";
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