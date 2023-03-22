import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import { ClassData } from "./context";
import { Import } from "./statements";
import { BuiltIns } from "./builtins";
import { CompletionVisitor } from "./completions";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { glob } from "glob";


export class Imports {
    static getImportables(): string[] {
        const libraries = this.getLibraryPath().replace("\\", "/");
        const files = glob.sync(libraries + "/**/*.arucas", {
            absolute: false,
        }).map((v) => v.substring(libraries.length + 1, v.length - 7).replace("/", "."));
        files.push(...BuiltIns.importableClasses.keys());
        return files;
    }

    static getImported(imported: Import): ClassData[] {
        const all = imported.imports.length === 1 && imported.imports[0].name === "*";
        const wanted = imported.imports.map((i) => i.name);
        const importables = BuiltIns.importableClasses.get(imported.from.path.id);
        if (importables) {
            if (all) {
                return importables;
            }
            return importables.filter((i) => wanted.includes(i.name))
        }

        const libraries = this.getLibraryPath();
        const file = libraries + path.sep + imported.from.path.id.replace(".", path.sep) + ".arucas";
        let content: string;
        try {
            content = fs.readFileSync(file, "utf-8");
        } catch (e) {
            return [];
        }

        const tokens = new Lexer(content).createTokens();
        const completions = new CompletionVisitor(new Parser(tokens).parse());
        if (all) {
            return completions.definedClasses;
        }
        return completions.definedClasses.filter((i) => wanted.includes(i.name));
    }

    static getLibraryPath(): string {
        const libraries = vscode.workspace.getConfiguration("arucas").get("libraries");
        if (!libraries) {
            return os.homedir() + path.sep + ".arucas" + path.sep + "libs";
        }
        return libraries as string;
    }
}