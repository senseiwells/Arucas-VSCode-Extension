import * as vscode from "vscode";
import { ArucasSemanticTokenProvider, legend } from "./semantics";

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

    console.log(legend);
}

export function deactivate() {
    // implement your deactivation logic here
}
