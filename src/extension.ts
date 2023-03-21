import * as vscode from "vscode";
import { ArucasSemanticTokenProvider, legend, updateDiagnostics } from "./semantics";
import { ArucasCompletionProvider } from "./completions";
import { BuiltIns } from "./builtins";
import { ArucasSymbolProvider } from "./symbols";

export function activate(context: vscode.ExtensionContext) {
    console.log(
        'Congratulations, your extension "arucas-language-extension" is now active!!'
    );

    BuiltIns.noop();

    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: "arucas" },
            new ArucasSemanticTokenProvider(),
            legend
        )
    );

    const diagnostics = vscode.languages.createDiagnosticCollection("arucas");
    context.subscriptions.push(diagnostics);
    updateDiagnostics(context, diagnostics);

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: "arucas" }, 
            new ArucasCompletionProvider()
        )
    );

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: "arucas" },
            new ArucasSymbolProvider()
        )  
    );
}

export function deactivate() {
    // implement your deactivation logic here
}
