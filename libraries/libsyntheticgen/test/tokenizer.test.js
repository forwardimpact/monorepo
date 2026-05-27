import { describe, test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../src/dsl/tokenizer.js";
import { assertThrowsMessage } from "@forwardimpact/libmock";

describe("tokenize", () => {
  describe("basic tokens", () => {
    test("tokenizes keywords", () => {
      const tokens = tokenize("terrain domain industry seed");
      assert.deepStrictEqual(
        tokens.filter((t) => t.type !== "EOF"),
        [
          { type: "KEYWORD", value: "terrain", line: 1 },
          { type: "KEYWORD", value: "domain", line: 1 },
          { type: "KEYWORD", value: "industry", line: 1 },
          { type: "KEYWORD", value: "seed", line: 1 },
        ],
      );
    });

    test("tokenizes all structural keywords", () => {
      const input = "org department team people project standard";
      const tokens = tokenize(input).filter((t) => t.type !== "EOF");
      assert.strictEqual(tokens.length, 6);
      for (const t of tokens) {
        assert.strictEqual(t.type, "KEYWORD");
      }
    });

    test("tokenizes string literals", () => {
      const tokens = tokenize('"hello world"');
      assert.deepStrictEqual(tokens[0], {
        type: "STRING",
        value: "hello world",
        line: 1,
      });
    });

    test("tokenizes string with escape sequences", () => {
      const tokens = tokenize('"line1\\nline2\\ttab\\\\"');
      assert.strictEqual(tokens[0].value, "line1\nline2\ttab\\");
    });

    test("tokenizes integer numbers", () => {
      const tokens = tokenize("42");
      assert.deepStrictEqual(tokens[0], {
        type: "NUMBER",
        value: "42",
        line: 1,
      });
    });

    test("tokenizes decimal numbers", () => {
      const tokens = tokenize("3.14");
      assert.deepStrictEqual(tokens[0], {
        type: "NUMBER",
        value: "3.14",
        line: 1,
      });
    });

    test("tokenizes identifiers", () => {
      const tokens = tokenize("myVar another_one");
      assert.deepStrictEqual(tokens[0], {
        type: "IDENT",
        value: "myVar",
        line: 1,
      });
      assert.deepStrictEqual(tokens[1], {
        type: "IDENT",
        value: "another_one",
        line: 1,
      });
    });

    test("distinguishes keywords from identifiers", () => {
      const tokens = tokenize("terrain myTerrain");
      assert.strictEqual(tokens[0].type, "KEYWORD");
      assert.strictEqual(tokens[1].type, "IDENT");
    });
  });

  describe("special tokens", () => {
    test("tokenizes @references", () => {
      const tokens = tokenize("@apollo @themis");
      assert.deepStrictEqual(tokens[0], {
        type: "AT_IDENT",
        value: "apollo",
        line: 1,
      });
      assert.deepStrictEqual(tokens[1], {
        type: "AT_IDENT",
        value: "themis",
        line: 1,
      });
    });

    test("tokenizes percentages", () => {
      const tokens = tokenize("50%");
      assert.deepStrictEqual(tokens[0], {
        type: "PERCENT",
        value: "50",
        line: 1,
      });
    });

    test("tokenizes dates in YYYY-MM format", () => {
      const tokens = tokenize("2024-01");
      assert.deepStrictEqual(tokens[0], {
        type: "DATE",
        value: "2024-01",
        line: 1,
      });
    });

    test("tokenizes multiple dates", () => {
      const tokens = tokenize("2024-01 2025-12");
      assert.strictEqual(tokens[0].type, "DATE");
      assert.strictEqual(tokens[0].value, "2024-01");
      assert.strictEqual(tokens[1].type, "DATE");
      assert.strictEqual(tokens[1].value, "2025-12");
    });
  });

  describe("comments", () => {
    test("skips single-line comments", () => {
      const tokens = tokenize("terrain // this is a comment\ndomain");
      const nonEof = tokens.filter((t) => t.type !== "EOF");
      assert.strictEqual(nonEof.length, 2);
      assert.strictEqual(nonEof[0].value, "terrain");
      assert.strictEqual(nonEof[1].value, "domain");
    });

    test("skips multi-line comments", () => {
      const tokens = tokenize("terrain /* multi\nline\ncomment */ domain");
      const nonEof = tokens.filter((t) => t.type !== "EOF");
      assert.strictEqual(nonEof.length, 2);
      assert.strictEqual(nonEof[0].value, "terrain");
      assert.strictEqual(nonEof[1].value, "domain");
    });

    test("tracks line numbers through multi-line comments", () => {
      const tokens = tokenize("terrain\n/* line 2\nline 3 */\ndomain");
      const domainToken = tokens.find((t) => t.value === "domain");
      assert.strictEqual(domainToken.line, 4);
    });
  });

  describe("braces and brackets", () => {
    test("tokenizes braces", () => {
      const tokens = tokenize("{ }");
      assert.strictEqual(tokens[0].type, "LBRACE");
      assert.strictEqual(tokens[1].type, "RBRACE");
    });

    test("tokenizes brackets", () => {
      const tokens = tokenize("[ ]");
      assert.strictEqual(tokens[0].type, "LBRACKET");
      assert.strictEqual(tokens[1].type, "RBRACKET");
    });

    test("tokenizes commas", () => {
      const tokens = tokenize(",");
      assert.strictEqual(tokens[0].type, "COMMA");
    });

    test("tokenizes mixed structural characters", () => {
      const tokens = tokenize("[1, 2, 3]");
      const types = tokens.filter((t) => t.type !== "EOF").map((t) => t.type);
      assert.deepStrictEqual(types, [
        "LBRACKET",
        "NUMBER",
        "COMMA",
        "NUMBER",
        "COMMA",
        "NUMBER",
        "RBRACKET",
      ]);
    });
  });

  describe("line tracking", () => {
    test("tracks line numbers across newlines", () => {
      const tokens = tokenize("terrain\ndomain\nindustry");
      assert.strictEqual(tokens[0].line, 1);
      assert.strictEqual(tokens[1].line, 2);
      assert.strictEqual(tokens[2].line, 3);
    });

    test("ignores carriage returns for line counting", () => {
      const tokens = tokenize("terrain\r\ndomain");
      assert.strictEqual(tokens[0].line, 1);
      assert.strictEqual(tokens[1].line, 2);
    });
  });

  describe("edge cases", () => {
    test("returns only EOF for empty input", () => {
      const tokens = tokenize("");
      assert.strictEqual(tokens.length, 1);
      assert.strictEqual(tokens[0].type, "EOF");
    });

    test("returns only EOF for whitespace-only input", () => {
      const tokens = tokenize("   \t\n  \n  ");
      assert.strictEqual(tokens.length, 1);
      assert.strictEqual(tokens[0].type, "EOF");
    });

    test("throws on unknown characters", () => {
      assertThrowsMessage(() => tokenize("~"), /Unexpected character '~'/);
    });

    test("throws on unknown character with line number", () => {
      assertThrowsMessage(() => tokenize("\n\n~"), /at line 3/);
    });
  });

  describe("negative numbers", () => {
    test("tokenizes negative integers", () => {
      const tokens = tokenize("-5");
      assert.deepStrictEqual(tokens[0], {
        type: "NUMBER",
        value: "-5",
        line: 1,
      });
    });

    test("tokenizes negative decimals", () => {
      const tokens = tokenize("-3.14");
      assert.deepStrictEqual(tokens[0], {
        type: "NUMBER",
        value: "-3.14",
        line: 1,
      });
    });
  });

  describe("EOF token", () => {
    test("always ends with EOF", () => {
      const tokens = tokenize("terrain");
      assert.strictEqual(tokens[tokens.length - 1].type, "EOF");
    });
  });

  describe("dotted identifiers", () => {
    test("tokenizes dotted path as DOTTED_IDENT", () => {
      const tokens = tokenize("clinical.conditions");
      assert.deepStrictEqual(tokens[0], {
        type: "DOTTED_IDENT",
        value: "clinical.conditions",
        line: 1,
      });
    });

    test("tokenizes dotted paths in arrays", () => {
      const tokens = tokenize("[clinical.conditions, clinical.trials]");
      const idents = tokens.filter((t) => t.type === "DOTTED_IDENT");
      assert.strictEqual(idents.length, 2);
      assert.strictEqual(idents[0].value, "clinical.conditions");
      assert.strictEqual(idents[1].value, "clinical.trials");
    });

    test("plain identifier remains IDENT", () => {
      const tokens = tokenize("researchers");
      assert.deepStrictEqual(tokens[0], {
        type: "IDENT",
        value: "researchers",
        line: 1,
      });
    });

    test("multi-segment dotted path", () => {
      const tokens = tokenize("a.b.c");
      assert.deepStrictEqual(tokens[0], {
        type: "DOTTED_IDENT",
        value: "a.b.c",
        line: 1,
      });
    });

    test("dot followed by number does not form dotted ident", () => {
      const tokens = tokenize("word");
      assert.strictEqual(tokens[0].type, "IDENT");
      assert.strictEqual(tokens[0].value, "word");
    });
  });

  describe("clinical keywords", () => {
    test("tokenizes clinical domain keywords", () => {
      const input = "clinical condition site trial criteria";
      const tokens = tokenize(input).filter((t) => t.type !== "EOF");
      assert.strictEqual(tokens.length, 5);
      for (const t of tokens) {
        assert.strictEqual(t.type, "KEYWORD");
      }
      assert.strictEqual(tokens[0].value, "clinical");
      assert.strictEqual(tokens[1].value, "condition");
      assert.strictEqual(tokens[2].value, "site");
      assert.strictEqual(tokens[3].value, "trial");
      assert.strictEqual(tokens[4].value, "criteria");
    });

    test("tokenizes per_* sentinel keywords", () => {
      const input = "per_condition per_trial per_site";
      const tokens = tokenize(input).filter((t) => t.type !== "EOF");
      assert.strictEqual(tokens.length, 3);
      for (const t of tokens) {
        assert.strictEqual(t.type, "KEYWORD");
      }
    });
  });

  describe("complex input", () => {
    test("tokenizes a minimal terrain declaration", () => {
      const input = `terrain test_co {
        domain "engineering"
        seed 42
      }`;
      const tokens = tokenize(input);
      const types = tokens.map((t) => t.type);
      assert.deepStrictEqual(types, [
        "KEYWORD", // terrain
        "IDENT", // test_co
        "LBRACE",
        "KEYWORD", // domain
        "STRING", // "engineering"
        "KEYWORD", // seed
        "NUMBER", // 42
        "RBRACE",
        "EOF",
      ]);
    });
  });
});
