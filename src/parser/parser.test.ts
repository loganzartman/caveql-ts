import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type EvalCommandAST,
  parseQuery,
  type SearchCommandAST,
  type WhereCommandAST,
} from "./index";

describe("parser", () => {
  it("parses basic search with key-value", () => {
    const result = parseQuery("search a=b");
    assert.deepEqual(result, {
      type: "query",
      pipeline: [
        {
          type: "search",
          filters: [
            {
              type: "=",
              left: { type: "string", quoted: false, value: "a" },
              right: { type: "string", quoted: false, value: "b" },
            },
          ],
        },
      ],
    });
  });

  describe("strings", () => {
    it("handles a double-quoted string", () => {
      const result = parseQuery(`"hello world!"`);
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "string",
                quoted: true,
                value: "hello world!",
              },
            ],
          },
        ],
      });
    });

    it("handles a single-quoted string", () => {
      const result = parseQuery(`'hello world!'`);
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "string",
                quoted: true,
                value: "hello world!",
              },
            ],
          },
        ],
      });
    });

    it("handles a bare string", () => {
      const result = parseQuery("h3llo-world$");
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "string",
                quoted: false,
                value: "h3llo-world$",
              },
            ],
          },
        ],
      });
    });
  });

  describe("search", () => {
    it("parses multiple search terms as separate filters", () => {
      const result = parseQuery("search a=1 and b=2 or c=3");
      const searchCmd = result.pipeline[0] as SearchCommandAST;
      // In Splunk, this would be searching for records containing "a=1", "and", "b=2", "or", "c=3" as separate terms
      assert.equal(searchCmd.filters.length, 5);
      assert.deepEqual(searchCmd.filters[0], {
        type: "=",
        left: { type: "string", quoted: false, value: "a" },
        right: { type: "number", value: 1n },
      });
      assert.deepEqual(searchCmd.filters[1], {
        type: "string",
        quoted: false,
        value: "and",
      });
      assert.deepEqual(searchCmd.filters[2], {
        type: "=",
        left: { type: "string", quoted: false, value: "b" },
        right: { type: "number", value: 2n },
      });
      assert.deepEqual(searchCmd.filters[3], {
        type: "string",
        quoted: false,
        value: "or",
      });
      assert.deepEqual(searchCmd.filters[4], {
        type: "=",
        left: { type: "string", quoted: false, value: "c" },
        right: { type: "number", value: 3n },
      });
    });

    it("parses logical expressions using uppercase operators", () => {
      const result = parseQuery("search a=1 AND b=2 OR NOT c=3");
      const searchCmd = result.pipeline[0] as SearchCommandAST;
      assert.equal(searchCmd.filters.length, 1);
      assert.deepEqual(searchCmd.filters[0], {
        type: "OR",
        left: {
          type: "AND",
          left: {
            type: "=",
            left: { type: "string", quoted: false, value: "a" },
            right: { type: "number", value: 1n },
          },
          right: {
            type: "=",
            left: { type: "string", quoted: false, value: "b" },
            right: { type: "number", value: 2n },
          },
        },
        right: {
          type: "NOT",
          operand: {
            type: "=",
            left: { type: "string", quoted: false, value: "c" },
            right: { type: "number", value: 3n },
          },
        },
      });
    });

    it("respects parentheses for grouping", () => {
      const result = parseQuery("search NOT (a=1)");
      const searchCmd = result.pipeline[0] as SearchCommandAST;
      assert.deepEqual(searchCmd.filters[0], {
        type: "NOT",
        operand: {
          type: "=",
          left: { type: "string", quoted: false, value: "a" },
          right: { type: "number", value: 1n },
        },
      });
    });
  });

  describe("pipelines", () => {
    it("parses simple pipeline with search and where", () => {
      const result = parseQuery("search a=b | where a<2");
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "=",
                left: { type: "string", quoted: false, value: "a" },
                right: { type: "string", quoted: false, value: "b" },
              },
            ],
          },
          {
            type: "where",
            expr: {
              type: "<",
              left: { type: "string", quoted: false, value: "a" },
              right: { type: "number", value: 2n },
            },
          },
        ],
      });
    });

    it("allows bare search as first command", () => {
      const result = parseQuery("a<b AND c=d");
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "AND",
                left: {
                  type: "<",
                  left: { type: "string", quoted: false, value: "a" },
                  right: { type: "string", quoted: false, value: "b" },
                },
                right: {
                  type: "=",
                  left: { type: "string", quoted: false, value: "c" },
                  right: { type: "string", quoted: false, value: "d" },
                },
              },
            ],
          },
        ],
      });
    });

    it("parses three-command pipeline", () => {
      const result = parseQuery("search a=b | where a<2 | stats");
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "=",
                left: { type: "string", quoted: false, value: "a" },
                right: { type: "string", quoted: false, value: "b" },
              },
            ],
          },
          {
            type: "where",
            expr: {
              type: "<",
              left: { type: "string", quoted: false, value: "a" },
              right: { type: "number", value: 2n },
            },
          },
          {
            type: "stats",
            aggregations: [],
          },
        ],
      });
    });

    it("parses complex expressions in pipeline", () => {
      const result = parseQuery("search x=1 and y=2 | where z>5 or w<10");
      assert.deepEqual(result, {
        type: "query",
        pipeline: [
          {
            type: "search",
            filters: [
              {
                type: "=",
                left: { type: "string", quoted: false, value: "x" },
                right: { type: "number", value: 1n },
              },
              {
                type: "string",
                quoted: false,
                value: "and",
              },
              {
                type: "=",
                left: { type: "string", quoted: false, value: "y" },
                right: { type: "number", value: 2n },
              },
            ],
          },
          {
            type: "where",
            expr: {
              type: "or",
              left: {
                type: ">",
                left: { type: "string", quoted: false, value: "z" },
                right: { type: "number", value: 5n },
              },
              right: {
                type: "<",
                left: { type: "string", quoted: false, value: "w" },
                right: { type: "number", value: 10n },
              },
            },
          },
        ],
      });
    });
  });

  describe("expressions", () => {
    it("parses simple identifiers in where clauses", () => {
      const result = parseQuery("where a");
      const whereCmd = result.pipeline[0] as WhereCommandAST;
      assert.deepEqual(whereCmd, {
        type: "where",
        expr: { type: "string", quoted: false, value: "a" },
      });
    });

    it("parses numeric literals in where clauses", () => {
      const result = parseQuery("where 123");
      const whereCmd = result.pipeline[0] as WhereCommandAST;
      assert.deepEqual(whereCmd, {
        type: "where",
        expr: { type: "number", value: 123n },
      });
    });

    it("parses quoted strings", () => {
      const result = parseQuery('where "hello"');
      const whereCmd = result.pipeline[0] as WhereCommandAST;
      assert.deepEqual(whereCmd, {
        type: "where",
        expr: { type: "string", quoted: true, value: "hello" },
      });
    });
  });

  describe("individual commands", () => {
    it("parses stats command", () => {
      const result = parseQuery("stats");
      assert.deepEqual(result, {
        type: "query",
        pipeline: [{ type: "stats", aggregations: [] }],
      });
    });

    it("parses where command with comparison", () => {
      const result = parseQuery("where a >= 5");
      const whereCmd = result.pipeline[0] as WhereCommandAST;
      assert.deepEqual(whereCmd, {
        type: "where",
        expr: {
          type: ">=",
          left: { type: "string", quoted: false, value: "a" },
          right: { type: "number", value: 5n },
        },
      });
    });
  });

  describe("operator case sensitivity", () => {
    it("uses uppercase operators (AND, OR, NOT) in search command comparison expressions", () => {
      const result = parseQuery("search a=1 AND b=2 OR NOT c=3");
      const searchCmd = result.pipeline[0] as SearchCommandAST;
      assert.deepEqual(searchCmd.filters[0], {
        type: "OR",
        left: {
          type: "AND",
          left: {
            type: "=",
            left: { type: "string", quoted: false, value: "a" },
            right: { type: "number", value: 1n },
          },
          right: {
            type: "=",
            left: { type: "string", quoted: false, value: "b" },
            right: { type: "number", value: 2n },
          },
        },
        right: {
          type: "NOT",
          operand: {
            type: "=",
            left: { type: "string", quoted: false, value: "c" },
            right: { type: "number", value: 3n },
          },
        },
      });
    });

    it("uses lowercase operators (and, or, not) in eval command expressions", () => {
      const result = parseQuery("eval result = a=1 and b=2 or not c=3");
      const evalCmd = result.pipeline[0] as EvalCommandAST;
      assert.deepEqual(evalCmd.bindings[0][1], {
        type: "or",
        left: {
          type: "and",
          left: {
            type: "=",
            left: { type: "string", quoted: false, value: "a" },
            right: { type: "number", value: 1n },
          },
          right: {
            type: "=",
            left: { type: "string", quoted: false, value: "b" },
            right: { type: "number", value: 2n },
          },
        },
        right: {
          type: "not",
          operand: {
            type: "=",
            left: { type: "string", quoted: false, value: "c" },
            right: { type: "number", value: 3n },
          },
        },
      });
    });
  });
});
