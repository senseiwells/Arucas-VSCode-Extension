import * as vscode from "vscode";
import { Lexer } from "./lexer";
import { Node } from "./node";
import { Parser, SemanticTokenModifier, SemanticTokenType } from "./parser";
import { Resolver } from "./resolver";

const TOKEN_TYPES = new Map<string, number>();
const TOKEN_MODIFIERS = new Map<string, number>();

export const legend = (() => {
    const tokenLegend: string[] = [];
    for (const [, v] of Object.entries(SemanticTokenType)) {
        tokenLegend.push(v);
    }

    const tokenModifiers: string[] = [];
    for (const [, v] of Object.entries(SemanticTokenModifier)) {
        tokenModifiers.push(v);
    }

    tokenLegend.forEach((tk, i) => TOKEN_TYPES.set(tk, i));
    tokenModifiers.forEach((tk, i) => TOKEN_MODIFIERS.set(tk, i));
    return new vscode.SemanticTokensLegend(tokenLegend, tokenModifiers);
})();

export class ArucasSemanticTokenProvider
    implements vscode.DocumentSemanticTokensProvider
{
    async provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): Promise<vscode.SemanticTokens> {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        const statements = parser.parse();

        const builder = new vscode.SemanticTokensBuilder();
        this.visitChildren(statements, builder);

        return builder.build();
    }

    private visitChildren(node: Node, builder: vscode.SemanticTokensBuilder) {
        node.children().forEach((child) => {
            const tk = child.token;
            const type = tk.type;
            if (type) {
                const encodedType = this.encodeTokenType(type);
                const encodedModifers = this.encodeTokenModifiers(tk.modifiers);
                builder.push(
                    tk.token.trace.range.start.line,
                    tk.token.trace.range.start.character,
                    tk.token.trace.length,
                    encodedType,
                    encodedModifers
                );
                // console.log(`Highlighed token: ${child.token.token.content}, ${type}: ${encodedType}`)
            }
            this.visitChildren(child, builder);
        });
    }

    private encodeTokenType(tokenType: string): number {
        const mod = TOKEN_TYPES.get(tokenType);
        return mod !== undefined ? mod : TOKEN_TYPES.size + 2;
    }

    private encodeTokenModifiers(strTokenModifiers?: string[]): number {
        if (!strTokenModifiers) {
            return 0;
        }
        let result = 0;
        for (let i = 0; i < strTokenModifiers.length; i++) {
            const tokenModifier = strTokenModifiers[i];
            const mod = TOKEN_MODIFIERS.get(tokenModifier);
            if (mod) {
                result = result | (1 << mod);
            } else if (tokenModifier === "notInLegend") {
                result = result | (1 << (TOKEN_MODIFIERS.size + 2));
            }
        }
        return result;
    }
}

export function updateDiagnostics(context: vscode.ExtensionContext, diagnostics: vscode.DiagnosticCollection) {
    if (vscode.window.activeTextEditor) {
        refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics);
    }
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                refreshDiagnostics(editor.document, diagnostics);
            }
        })
    )
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => refreshDiagnostics(event.document, diagnostics))
    )
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri))
    )
}

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    if (document.languageId === "arucas") {
        const tokens = new Lexer(document.getText()).createTokens();
        const parser = new Parser(tokens);
        const resolver = new Resolver(parser.parse());
        const problems: vscode.Diagnostic[] = [];
        parser.problems().concat(resolver.problems).forEach((problem) => {
            const start = problem.start;
            const end = problem.end;
            // console.log(`Highlighed problem: ${problem.message}, ${start.lineStart}:${start.columnStart} to ${end.lineEnd}:${end.columnEnd}`)
            const range = new vscode.Range(start.range.start, end.range.end);
            const diagnostic = new vscode.Diagnostic(range, problem.message, problem.severity);
            problems.push(diagnostic);
        });
        diagnostics.set(document.uri, problems);
    }
}