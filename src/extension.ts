import * as vscode from "vscode";
import { ArucasSemanticTokenProvider, legend, updateDiagnostics } from "./semantics";
import { ArucasCompletionProvider } from "./completions";

export function activate(context: vscode.ExtensionContext) {
    console.log(
        'Congratulations, your extension "arucas-language-extension" is now active!!'
    );

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

    const completions = vscode.languages.registerCompletionItemProvider("arucas", new ArucasCompletionProvider());
    context.subscriptions.push(completions);
}

export function deactivate() {
    // implement your deactivation logic here
}
