// Hand-rolled parser for the component-call DSL used in agent output.
//
// Grammar (simplified):
//   component  := Ident '(' args? ')'
//   args       := arg (',' arg)* ','?
//   arg        := Ident ':' expr
//   expr       := primary ('+' primary)*
//   primary    := stringLit | numberLit | boolLit | nullLit | varRef
//                 | array | object | component | '(' expr ')'
//   stringLit  := '"' chars '"'  |  '"""' anyChars '"""'
//   varRef     := '$' Ident
//   array      := '[' (expr (',' expr)*)? ','? ']'
//   object     := '{' ((Ident|stringLit) ':' expr (',' …)*)? ','? '}'
//
// Component names MUST start with an uppercase letter; that distinguishes
// them from ordinary prose. Property names use camelCase / snake_case.

export type Value =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "var"; name: string }
  | { kind: "array"; items: Value[] }
  | { kind: "object"; entries: Array<[string, Value]> }
  | { kind: "component"; name: string; args: Array<[string, Value]> }
  | { kind: "binary"; op: "+"; left: Value; right: Value };

export interface ParsedComponent {
  name: string;
  args: Array<[string, Value]>;
  /** Index in the source just past the closing `)`. */
  end: number;
}

export type ParseError = { message: string; pos: number };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

const COMPONENT_HEAD = /[A-Z]/;
const IDENT = /^\w+/;
const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;

class Parser {
  pos: number;
  constructor(
    public src: string,
    start: number,
  ) {
    this.pos = start;
  }

  err(message: string): ParseError {
    return { message, pos: this.pos };
  }

  peek(offset = 0): string {
    return this.src[this.pos + offset] ?? "";
  }

  rest(): string {
    return this.src.slice(this.pos);
  }

  eof(): boolean {
    return this.pos >= this.src.length;
  }

  skipWs(): void {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.pos++;
      } else {
        break;
      }
    }
  }

  expect(ch: string): ParseError | null {
    if (this.peek() !== ch) {
      return this.err(`expected '${ch}'`);
    }
    this.pos++;
    return null;
  }

  /** Parse identifier (no $). */
  parseIdent(): ParseResult<string> {
    const m = IDENT.exec(this.rest());
    if (!m) return { ok: false, error: this.err("expected identifier") };
    this.pos += m[0].length;
    return { ok: true, value: m[0] };
  }

  /** Parse a "...." or """...""" string. Returns the unescaped JS string. */
  parseString(): ParseResult<string> {
    if (this.peek() !== '"') return { ok: false, error: this.err("expected '\"'") };
    // triple-quoted?
    if (this.peek(1) === '"' && this.peek(2) === '"') {
      this.pos += 3;
      const start = this.pos;
      const close = this.src.indexOf('"""', this.pos);
      if (close < 0) return { ok: false, error: this.err('unterminated """string"""') };
      const text = this.src.slice(start, close);
      this.pos = close + 3;
      return { ok: true, value: text };
    }
    // single-quoted
    this.pos++;
    let out = "";
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === "\\") {
        const escaped = this.parseEscape();
        if (!escaped.ok) return escaped;
        out += escaped.value;
      } else if (ch === '"') {
        this.pos++;
        return { ok: true, value: out };
      } else {
        out += ch;
        this.pos++;
      }
    }
    return { ok: false, error: this.err("unterminated string") };
  }

  private parseEscape(): ParseResult<string> {
    const n = this.src[this.pos + 1] ?? "";
    const escMap: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      '"': '"',
      "\\": "\\",
      "/": "/",
    };
    if (n in escMap) {
      this.pos += 2;
      return { ok: true, value: escMap[n] };
    }
    if (n === "u") {
      const hex = this.src.slice(this.pos + 2, this.pos + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { ok: false, error: this.err(String.raw`bad \u escape`) };
      }
      this.pos += 6;
      return { ok: true, value: String.fromCodePoint(Number.parseInt(hex, 16)) };
    }
    this.pos += 2;
    return { ok: true, value: n };
  }

  parseNumber(): ParseResult<number> {
    const m = NUMBER.exec(this.rest());
    if (!m) return { ok: false, error: this.err("expected number") };
    this.pos += m[0].length;
    return { ok: true, value: Number(m[0]) };
  }

  parseVar(): ParseResult<Value> {
    if (this.peek() !== "$") return { ok: false, error: this.err("expected $") };
    this.pos++;
    const id = this.parseIdent();
    if (!id.ok) return id;
    return { ok: true, value: { kind: "var", name: id.value } };
  }

  parseArray(): ParseResult<Value> {
    if (this.peek() !== "[") return { ok: false, error: this.err("expected [") };
    this.pos++;
    const items: Value[] = [];
    this.skipWs();
    if (this.peek() === "]") {
      this.pos++;
      return { ok: true, value: { kind: "array", items } };
    }
    while (true) {
      this.skipWs();
      const v = this.parseExpr();
      if (!v.ok) return v;
      items.push(v.value);
      this.skipWs();
      switch (this.consumeListSeparator("]")) {
        case "trailing":
          this.pos++;
          return { ok: true, value: { kind: "array", items } };
        case "continue":
          continue;
      }
      if (this.peek() === "]") {
        this.pos++;
        return { ok: true, value: { kind: "array", items } };
      }
      return { ok: false, error: this.err("expected ',' or ']' in array") };
    }
  }

  parseObject(): ParseResult<Value> {
    if (this.peek() !== "{") return { ok: false, error: this.err("expected {") };
    this.pos++;
    const entries: Array<[string, Value]> = [];
    this.skipWs();
    if (this.peek() === "}") {
      this.pos++;
      return { ok: true, value: { kind: "object", entries } };
    }
    while (true) {
      this.skipWs();
      const key = this.parseObjectKey();
      if (!key.ok) return key;
      this.skipWs();
      const colonErr = this.expect(":");
      if (colonErr) return { ok: false, error: colonErr };
      this.skipWs();
      const v = this.parseExpr();
      if (!v.ok) return v;
      entries.push([key.value, v.value]);
      this.skipWs();
      switch (this.consumeListSeparator("}")) {
        case "trailing":
          this.pos++;
          return { ok: true, value: { kind: "object", entries } };
        case "continue":
          continue;
      }
      if (this.peek() === "}") {
        this.pos++;
        return { ok: true, value: { kind: "object", entries } };
      }
      return { ok: false, error: this.err("expected ',' or '}' in object") };
    }
  }

  private parseObjectKey(): ParseResult<string> {
    if (this.peek() === '"') return this.parseString();
    return this.parseIdent();
  }

  /** Try to parse a nested component starting at current position. */
  tryParseComponent(): ParseResult<Value> | null {
    const sub = this.rest();
    if (!COMPONENT_HEAD.test(sub.slice(0, Math.min(64, sub.length)))) return null;
    // Verify the match starts at offset 0
    const m = /^([A-Z]\w*)\(/.exec(sub);
    if (!m) return null;
    const result = parseComponentAt(this.src, this.pos);
    if (!result.ok) return result;
    this.pos = result.value.end;
    return {
      ok: true,
      value: { kind: "component", name: result.value.name, args: result.value.args },
    };
  }

  parsePrimary(): ParseResult<Value> {
    this.skipWs();
    const ch = this.peek();
    if (ch === '"') {
      const s = this.parseString();
      if (!s.ok) return s;
      return { ok: true, value: { kind: "string", value: s.value } };
    }
    if (ch === "$") return this.parseVar();
    if (ch === "[") return this.parseArray();
    if (ch === "{") return this.parseObject();
    if (ch === "(") return this.parseParenthesized();
    const keyword = this.parseKeyword();
    if (keyword) return keyword;
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const n = this.parseNumber();
      if (!n.ok) return n;
      return { ok: true, value: { kind: "number", value: n.value } };
    }
    // Component (uppercase ident followed by '(')?
    const comp = this.tryParseComponent();
    if (comp !== null) return comp;
    return { ok: false, error: this.err("unexpected token") };
  }

  private parseParenthesized(): ParseResult<Value> {
    this.pos++;
    const value = this.parseExpr();
    if (!value.ok) return value;
    this.skipWs();
    const error = this.expect(")");
    return error ? { ok: false, error } : value;
  }

  private parseKeyword(): ParseResult<Value> | null {
    const keywords: Array<[string, Value]> = [
      ["true", { kind: "bool", value: true }],
      ["false", { kind: "bool", value: false }],
      ["null", { kind: "null" }],
    ];
    const keyword = keywords.find(([name]) => this.rest().startsWith(name));
    if (!keyword) return null;
    this.pos += keyword[0].length;
    return { ok: true, value: keyword[1] };
  }

  parseExpr(): ParseResult<Value> {
    let left = this.parsePrimary();
    if (!left.ok) return left;
    while (true) {
      this.skipWs();
      if (this.peek() === "+") {
        this.pos++;
        this.skipWs();
        const right = this.parsePrimary();
        if (!right.ok) return right;
        left = {
          ok: true,
          value: { kind: "binary", op: "+", left: left.value, right: right.value },
        };
        continue;
      }
      break;
    }
    return left;
  }

  parseArgs(): ParseResult<Array<[string, Value]>> {
    const args: Array<[string, Value]> = [];
    this.skipWs();
    if (this.peek() === ")") return { ok: true, value: args };
    while (true) {
      this.skipWs();
      const id = this.parseIdent();
      if (!id.ok) return id;
      this.skipWs();
      const colonErr = this.expect(":");
      if (colonErr) return { ok: false, error: colonErr };
      this.skipWs();
      const v = this.parseExpr();
      if (!v.ok) return v;
      args.push([id.value, v.value]);
      this.skipWs();
      switch (this.consumeListSeparator(")")) {
        case "trailing":
          this.pos++;
          return { ok: true, value: args };
        case "continue":
          continue;
      }
      if (this.peek() === ")") return { ok: true, value: args };
      return { ok: false, error: this.err("expected ',' or ')' in args") };
    }
  }

  private consumeListSeparator(close: string): "trailing" | "continue" | null {
    if (this.peek() !== ",") return null;
    this.pos++;
    this.skipWs();
    return this.peek() === close ? "trailing" : "continue";
  }
}

/** Parse a component call beginning at `start`. The character at `start` must be the first uppercase letter of the name. */
export function parseComponentAt(src: string, start: number): ParseResult<ParsedComponent> {
  const p = new Parser(src, start);
  const headMatch = /^([A-Z]\w*)\(/.exec(src.slice(start));
  if (!headMatch) return { ok: false, error: { message: "not a component head", pos: start } };
  const name = headMatch[1];
  p.pos = start + headMatch[0].length;
  const argsR = p.parseArgs();
  if (!argsR.ok) return argsR;
  p.skipWs();
  const closeErr = p.expect(")");
  if (closeErr) return { ok: false, error: closeErr };
  return { ok: true, value: { name, args: argsR.value, end: p.pos } };
}

/** Find the next index in `src` (>= `from`) that looks like the start of a component head. Returns -1 if none. */
export function findNextComponentStart(src: string, from = 0): number {
  // Component name must start with uppercase ASCII; not preceded by a word char (to avoid matching FooBar inside identifiers).
  for (let i = from; i < src.length; i++) {
    const code = src.codePointAt(i) ?? 0;
    if (code < 65 || code > 90) continue; // not A-Z
    // not preceded by [A-Za-z0-9_]
    if (i > 0) {
      const p = src.codePointAt(i - 1) ?? 0;
      const isWord =
        (p >= 65 && p <= 90) ||
        (p >= 97 && p <= 122) ||
        (p >= 48 && p <= 57) ||
        p === 95 ||
        p === 36; // $
      if (isWord) continue;
    }
    const tail = src.slice(i, i + 64);
    if (COMPONENT_HEAD.test(tail) && /^[A-Z]\w*\(/.test(tail)) {
      return i;
    }
  }
  return -1;
}
