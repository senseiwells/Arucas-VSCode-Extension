import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import { ClassData, EnumData, InterfaceData } from "./context";
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

    static getAvailableClasses(library: string): Array<ClassData | EnumData | InterfaceData> {
        const importables = BuiltIns.importableClasses.get(library);
        if (importables) {
            return importables;
        }

        const libraries = this.getLibraryPath();
        const file = libraries + path.sep + library.replace(".", path.sep) + ".arucas";
        let content: string;
        try {
            content = fs.readFileSync(file, "utf-8");
        } catch (e) {
            return [];
        }

        const tokens = new Lexer(content).createTokens();
        return new CompletionVisitor(new Parser(tokens).parse()).definedClasses;
    }

    static getImported(imported: Import): Array<ClassData | EnumData | InterfaceData> {
        const all = imported.imports.length === 1 && imported.imports[0].name === "*";
        const wanted = imported.imports.map((i) => i.name);

        const completions = this.getAvailableClasses(imported.from.path.id);
        if (all) {
            return completions;
        }
        return completions.filter((i) => wanted.includes(i.name));
    }

    static getLibraryPath(): string {
        const libraries = vscode.workspace.getConfiguration("arucas").get("libraries");
        if (!libraries) {
            return os.homedir() + path.sep + ".arucas" + path.sep + "libs";
        }
        return libraries as string;
    }
}