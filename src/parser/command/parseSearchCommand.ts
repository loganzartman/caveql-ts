import { Token } from "../../tokens";
import { parseLiteral, parseWs } from "../parseCommon";
import { type ExpressionAST, parseExpr } from "../parseExpr";
import type { ParseContext } from "../types";

export type SearchCommandAST = {
  type: "search";
  filters: ExpressionAST[];
};

export function parseSearchCommand(ctx: ParseContext): SearchCommandAST {
  parseWs(ctx);
  parseLiteral(ctx, [Token.command, "search"]);
  parseWs(ctx);
  return parseBareSearch(ctx);
}

export function parseBareSearch(ctx: ParseContext): SearchCommandAST {
  const filters: ExpressionAST[] = [];
  while (true) {
    try {
      parseWs(ctx);
      ctx.compareExpr = true;
      const filter = parseExpr(ctx);
      filters.push(filter);
    } catch {
      break;
    } finally {
      ctx.compareExpr = false;
    }
  }
  return {
    type: "search",
    filters,
  };
}
