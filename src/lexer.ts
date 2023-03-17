/* eslint-disable @typescript-eslint/naming-convention */

export class Token {
    readonly type: TokenType;
    readonly trace: Trace;
    readonly content: string;

    constructor(type: TokenType, trace: Trace, content: string) {
        this.type = type;
        this.trace = trace;
        this.content = content;
    }
}

export enum TokenType {
    Whitespace,
    Comment,
    Identifier,
    Eof,
    Number,
    String,
    Unknown,

    Semicolon = ";",
    Colon = ":",
    Comma = ",",

    // Atoms
    True = "true",
    False = "false",
    Null = "null",

    // Arithmetics
    Plus = "+",
    Minus = "-",
    Multiply = "*",
    Divide = "/",
    Power = "^",

    // Boolean operators
    Not = "!",
    And = "&&",
    Or = "||",
    Xor = "~",

    // Bitwise
    ShiftLeft = "<<",
    ShiftRight = ">>",
    BitAnd = "&",
    BitOr = "|",

    // Brackets
    LeftBracket = "(",
    RightBracket = ")",
    LeftSquareBracket = "[",
    RightSquareBracket = "]",
    LeftCurlyBracket = "{",
    RightCurlyBracket = "}",

    // Assignment operator
    AssignOperator = "=",
    Increment = "++",
    Decrement = "--",

    PlusAssign = "+=",
    MinusAssign = "-=",
    MultiplyAssign = "*=",
    DivideAssign = "/=",
    PowerAssign = "^=",
    AndAssign = "&=",
    OrAssign = "|=",
    XorAssign = "~=",

    // Comparisons
    Equals = "==",
    NotEquals = "!=",
    LessThan = "<",
    MoreThan = ">",
    LessThanEqual = "<=",
    MoreThanEqual = ">=",

    // Statements
    If = "if",
    While = "while",
    Else = "else",
    Continue = "continue",
    Break = "break",
    Var = "var",
    Return = "return",
    Fun = "fun",
    Try = "try",
    Catch = "catch",
    Finally = "finally",
    Foreach = "foreach",
    For = "for",
    Switch = "switch",
    Case = "case",
    Default = "default",
    Class = "class",
    Enum = "enum",
    Interface = "interface",
    This = "this",
    Super = "super",
    As = "as",
    New = "new",
    Private = "private",
    Static = "static",
    Readonly = "readonly",
    Operator = "operator",
    Throw = "throw",
    Import = "import",
    From = "from",
    Local = "local",
    Launch = "launch",

    // Dot
    Dot = ".",
    Pointer = "->",
    Arbitrary = "...",
}

export class Trace {
    constructor(
        readonly lineStart: number,
        readonly columnStart: number,
        readonly lineEnd: number,
        readonly columnEnd: number,
        readonly offset: number,
        readonly length: number
    ) {}
}

class LexerRule {
    private matches: RegExp[] = [];

    constructor(readonly type: TokenType) {}

    addString(value: string): LexerRule {
        this.matches.push(new RegExp("^" + regexEscape(value)));
        return this;
    }

    addRegex(regex: string): LexerRule {
        this.matches.push(new RegExp("^" + regex));
        return this;
    }

    addRegexes(...regexes: string[]): LexerRule {
        for (const regex in regexes) {
            this.addRegex(regex);
        }
        return this;
    }

    addMultiline(open: string, close: string): LexerRule {
        return this.addMultilineEscape(open, "", close);
    }

    addMultilineEscape(open: string, escape: string, close: string): LexerRule {
        const s = regexEscape(open);
        const c = regexEscape(close);
        let regex: string;
        if (escape.length === 0) {
            regex = s + ".*?" + c;
        } else {
            const e = regexEscape(escape);
            regex = `${s}(?:${e}(?:${e}|${c}|(?!${c}).)|(?!${e}|${c}).)*${c}`;
        }
        this.matches.push(new RegExp(regex, "s"));
        return this;
    }

    getMatchLength(str: string): number {
        let length = 0;
        this.matches.forEach((pattern) => {
            const matches = str.match(pattern);
            if (matches && matches.length) {
                length = Math.max(length, matches[0].length);
            }
        });
        return length < 1 ? -1 : length;
    }
}

class LexerContext {
    private rules: LexerRule[] = [];

    addRule(type: TokenType): LexerContext {
        const rule = new LexerRule(type);
        rule.addString(type.toString());
        this.rules.push(rule);
        return this;
    }

    addRuleWithConsumer(
        type: TokenType,
        consumer: (rule: LexerRule) => void
    ): LexerContext {
        const rule = new LexerRule(type);
        consumer(rule);
        this.rules.push(rule);
        return this;
    }

    nextToken(input: string): LexerToken | null {
        let selectedRule: LexerRule | undefined;
        let longestRule = 1;
        this.rules.forEach((rule: LexerRule) => {
            const length = rule.getMatchLength(input);
            if (length >= longestRule) {
                longestRule = length;
                selectedRule = rule;
            }
        });
        if (selectedRule) {
            return new LexerToken(
                selectedRule.type,
                input.substring(0, longestRule)
            );
        }
        return null;
    }
}

export class Lexer {
    static CONTEXT = new LexerContext()
        .addRuleWithConsumer(TokenType.Whitespace, (rule) =>
            rule.addRegex("[ \t\r\n]")
        )
        .addRuleWithConsumer(TokenType.Comment, (rule) =>
            rule.addMultiline("/*", "*/").addRegex("//[^\\r\\n]*")
        )

        // Arithmetics
        .addRule(TokenType.Plus)
        .addRule(TokenType.Minus)
        .addRule(TokenType.Multiply)
        .addRule(TokenType.Divide)
        .addRule(TokenType.Power)

        // Atoms
        .addRuleWithConsumer(TokenType.Identifier, (rule) =>
            rule.addRegex("[a-zA-Z_][a-zA-Z0-9_]*")
        )
        .addRuleWithConsumer(TokenType.String, (rule) =>
            rule
                .addMultilineEscape('"', "\\", '"')
                .addMultilineEscape('"', "\\", '"')
        )
        .addRuleWithConsumer(TokenType.Number, (rule) =>
            rule.addRegexes("[0-9]+\\.[0-9]+", "[0-9]+", "0[xX][0-9a-fA-F]+")
        )
        .addRule(TokenType.True)
        .addRule(TokenType.False)
        .addRule(TokenType.Null)

        // Comparisons - This must be defined AFTER identifiers
        .addRule(TokenType.Equals)
        .addRule(TokenType.NotEquals)
        .addRule(TokenType.LessThanEqual)
        .addRule(TokenType.MoreThanEqual)
        .addRule(TokenType.LessThan)
        .addRule(TokenType.MoreThan)
        .addRule(TokenType.Not)
        .addRule(TokenType.And)
        .addRule(TokenType.Or)
        .addRule(TokenType.Xor)
        .addRule(TokenType.ShiftLeft)
        .addRule(TokenType.ShiftRight)
        .addRule(TokenType.BitAnd)
        .addRule(TokenType.BitOr)

        // Memory operations
        .addRule(TokenType.AssignOperator)
        .addRule(TokenType.Increment)
        .addRule(TokenType.Decrement)
        .addRule(TokenType.PlusAssign)
        .addRule(TokenType.MinusAssign)
        .addRule(TokenType.MultiplyAssign)
        .addRule(TokenType.DivideAssign)
        .addRule(TokenType.PowerAssign)
        .addRule(TokenType.AndAssign)
        .addRule(TokenType.OrAssign)
        .addRule(TokenType.XorAssign)

        // Brackets
        .addRule(TokenType.LeftBracket)
        .addRule(TokenType.RightBracket)
        .addRule(TokenType.LeftSquareBracket)
        .addRule(TokenType.RightSquareBracket)
        .addRule(TokenType.LeftCurlyBracket)
        .addRule(TokenType.RightCurlyBracket)

        // Delimiters
        .addRule(TokenType.Semicolon)
        .addRule(TokenType.Colon)
        .addRule(TokenType.Comma)

        // Keywords
        .addRule(TokenType.If)
        .addRule(TokenType.Else)
        .addRule(TokenType.While)
        .addRule(TokenType.Continue)
        .addRule(TokenType.Break)
        .addRule(TokenType.Return)
        .addRule(TokenType.Var)
        .addRule(TokenType.Fun)
        .addRule(TokenType.Try)
        .addRule(TokenType.Catch)
        .addRule(TokenType.Finally)
        .addRule(TokenType.Foreach)
        .addRule(TokenType.For)
        .addRule(TokenType.Switch)
        .addRule(TokenType.Case)
        .addRule(TokenType.Default)
        .addRule(TokenType.Class)
        .addRule(TokenType.Enum)
        .addRule(TokenType.Interface)
        .addRule(TokenType.This)
        .addRule(TokenType.Super)
        .addRule(TokenType.As)
        .addRule(TokenType.New)
        .addRule(TokenType.Private)
        .addRule(TokenType.Static)
        .addRule(TokenType.Operator)
        .addRule(TokenType.Throw)
        .addRule(TokenType.Import)
        .addRule(TokenType.From)
        .addRule(TokenType.Local)
        .addRule(TokenType.Readonly)
        .addRule(TokenType.Launch)

        // More delimiters
        .addRule(TokenType.Arbitrary)
        .addRule(TokenType.Dot)
        .addRule(TokenType.Pointer);

    constructor(private readonly text: string) {}

    createTokens(): Token[] {
        const tokens: Token[] = [];
        const length = this.text.length;
        let offset = 0;
        let line = 0;
        let column = 0;
        let input = this.text;
        while (offset < length) {
            let token = Lexer.CONTEXT.nextToken(input);
            if (token === null) {
                const tkLength = input.indexOf(" ");
                if (tkLength === -1 || tkLength === 0) {
                    break;
                }
                token = new LexerToken(
                    TokenType.Unknown,
                    input.substring(0, tkLength)
                );
            }

            if (token.length + offset > length) {
                break;
            }
            const oldLine = line;
            const oldColumn = column;
            for (let i = offset; i < offset + token.length; i++) {
                const c = this.text[i];
                if (c === "\n") {
                    line++;
                    column = 0;
                } else {
                    column++;
                }
            }
            if (
                token.type !== TokenType.Whitespace &&
                token.type !== TokenType.Comment
            ) {
                tokens.push(
                    new Token(
                        token.type,
                        new Trace(
                            oldLine,
                            oldColumn,
                            line,
                            column,
                            offset,
                            token.length
                        ),
                        token.content
                    )
                );
            }

            input = input.substring(token.length);
            offset += token.length;
        }
        tokens.push(
            new Token(
                TokenType.Eof,
                new Trace(line, column, line, column + 1, offset, 1),
                ""
            )
        );

        return tokens;
    }
}

function regexEscape(str: string): string {
    const len = str.length;
    let sb = "";
    let i = 0;
    while (i < len) {
        const c = str[i];
        switch (c) {
            case "\u0000": {
                sb += "\\0";
                i++;
                continue;
            }
            case "\n": {
                sb += "\\n";
                i++;
                continue;
            }
            case "\r": {
                sb += "\\r";
                i++;
                continue;
            }
            case "\t": {
                sb += "\\t";
                i++;
                continue;
            }
            case "\\": {
                sb += "\\\\";
                i++;
                continue;
            }
            case "^":
            case "$":
            case "?":
            case "|":
            case "*":
            case "/":
            case "+":
            case ".":
            case "(":
            case ")":
            case "[":
            case "]":
            case "{":
            case "}": {
                sb += "\\" + c;
                i++;
                continue;
            }
        }
        sb += c;
        i++;
    }
    return sb;
}

class LexerToken {
    readonly length: number;

    constructor(readonly type: TokenType, readonly content: string) {
        this.length = content.length;
    }
}
