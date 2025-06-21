export type StringAST = string;
export type NumericAST = number | bigint;
export type KvAST = {
	type: "kv";
	key: StringAST;
	value: ExpressionAST;
};

export type QueryAST = {
	type: "query";
	pipeline: CommandAST[];
};

export type ExpressionAST =
	| UnaryOpAST
	| BinaryOpAST
	| KvAST
	| StringAST
	| NumericAST;

export type UnaryOpType = "not";

export type UnaryOpAST = {
	type: UnaryOpType;
	operand: ExpressionAST;
};

export type BinaryOpType = "and" | "or";

export type BinaryOpAST = {
	type: BinaryOpType;
	left: ExpressionAST;
	right: ExpressionAST;
};

export type CommandAST = StatsCommandAST | SearchCommandAST | WhereCommandAST;

export type SearchCommandAST = {
	type: "search";
	filters: ExpressionAST[];
};

export type StatsCommandAST = {
	type: "stats";
};

export type WhereCommandAST = {
	type: "where";
	expr: ExpressionAST;
};

export type ParseContext = {
	source: string;
	index: number;
};

export class ParseError extends Error {
	readonly context: ParseContext;

	constructor(
		message: string,
		readonly ctx: ParseContext,
	) {
		super(message);
		this.name = "ParseError";
		this.context = structuredClone(ctx);
	}

	toString(): string {
		return `Parse error at index ${this.context.index}: ${this.message}`;
	}
}

export function parseQuery(src: string): QueryAST {
	const ctx = {
		source: src,
		index: 0,
	};
	return takeQuery(ctx);
}

export function takeQuery(ctx: ParseContext): QueryAST {
	const pipeline = takePipeline(ctx);

	return {
		type: "query",
		pipeline,
	};
}

function takePipeline(ctx: ParseContext): CommandAST[] {
	const commands: CommandAST[] = [];
	while (true) {
		try {
			takeWs(ctx);
			const command = takeCommand(ctx);
			commands.push(command);
			takeWs(ctx);
			takeLiteral(ctx, "|");
		} catch (e) {
			if (e instanceof ParseError) {
				break;
			} else {
				throw e;
			}
		}
	}
	return commands;
}

function takeCommand(ctx: ParseContext): CommandAST {
	return takeOne(ctx, takeStatsCommand, takeSearchCommand, takeWhereCommand);
}

function takeSearchCommand(ctx: ParseContext): SearchCommandAST {
	takeWs(ctx);
	takeLiteral(ctx, "search");
	takeWs(ctx);
	return takeBareSearch(ctx);
}

function takeBareSearch(ctx: ParseContext): SearchCommandAST {
	const filters: ExpressionAST[] = [];
	while (true) {
		try {
			takeWs(ctx);
			const filter = takeExpr(ctx);
			filters.push(filter);
		} catch (e) {
			if (e instanceof ParseError) {
				break;
			} else {
				throw e;
			}
		}
	}
	return {
		type: "search",
		filters,
	};
}

function takeStatsCommand(ctx: ParseContext): StatsCommandAST {
	takeWs(ctx);
	takeLiteral(ctx, "stats");
	return { type: "stats" };
}

function takeWhereCommand(ctx: ParseContext): WhereCommandAST {
	takeWs(ctx);
	takeLiteral(ctx, "where");
	takeWs(ctx);
	const expr = takeExpr(ctx);
	return { type: "where", expr };
}

function takeExpr(ctx: ParseContext): ExpressionAST {
	return takeOne(ctx, takeBinaryOp, takeUnaryOp, takeTerm);
}

function takeTerm(ctx: ParseContext): ExpressionAST {
	return takeOne(ctx, takeGroup, takeKv, takeNumeric, takeString);
}

function takeBinaryOp(ctx: ParseContext): BinaryOpAST {
	takeWs(ctx);
	const left = takeTerm(ctx);
	takeWs(ctx);
	const op = takeOne(
		ctx,
		(c) => takeLiteral(c, "and"),
		(c) => takeLiteral(c, "or"),
	);
	takeWs(ctx);
	const right = takeExpr(ctx);

	return {
		type: op,
		left,
		right,
	};
}

function takeUnaryOp(ctx: ParseContext): UnaryOpAST {
	takeWs(ctx);
	const op = takeLiteral(ctx, "not");
	takeWs(ctx);
	const operand = takeExpr(ctx);

	return {
		type: op,
		operand,
	};
}

function takeKv(ctx: ParseContext): KvAST {
	takeWs(ctx);
	const key = takeString(ctx);
	takeWs(ctx);
	takeLiteral(ctx, "=");
	takeWs(ctx);
	const value = takeTerm(ctx);

	return {
		type: "kv",
		key,
		value,
	};
}

function takeGroup(ctx: ParseContext): ExpressionAST {
	takeWs(ctx);
	takeLiteral(ctx, "(");
	takeWs(ctx);
	const expr = takeExpr(ctx);
	takeWs(ctx);
	takeLiteral(ctx, ")");
	return expr;
}

function takeString(ctx: ParseContext): StringAST {
	return takeOne(
		ctx,
		(c) => takeRex(c, /"((?:[^\\"]|\\.)*)"/y, 1),
		(c) => takeRex(c, /'((?:[^\\']|\\.)*)'/y, 1),
		(c) => takeRex(c, /[\p{L}$_\-.]+/uy),
	);
}

function takeNumeric(ctx: ParseContext): NumericAST {
	return takeOne(
		ctx,
		(c) => {
			const numStr = takeRex(c, /-?\d+\.\d*/y);
			return Number.parseFloat(numStr);
		},
		(c) => {
			const numStr = takeRex(c, /-?\d+/y);
			return BigInt(numStr);
		},
	);
}

function takeWs(ctx: ParseContext): string {
	return takeRex(ctx, /\s*/y);
}

function takeOne<TMembers extends ((ctx: ParseContext) => any)[]>(
	ctx: ParseContext,
	...members: TMembers
): ReturnType<TMembers[number]> {
	const originalIndex = ctx.index;
	for (const member of members) {
		try {
			return member(ctx) as ReturnType<TMembers[number]>;
		} catch (e) {
			if (e instanceof ParseError) {
				ctx.index = originalIndex;
			} else {
				throw e;
			}
		}
	}
	throw new ParseError("No matching members", ctx);
}

function takeRex(ctx: ParseContext, rex: RegExp, group = 0): string {
	if (!rex.sticky) {
		throw new Error("Regular expression must have the sticky flag set");
	}
	try {
		rex.lastIndex = ctx.index;
		const match = rex.exec(ctx.source);
		if (match && match[group] !== undefined) {
			ctx.index = rex.lastIndex;
			return match[group];
		}
		throw new ParseError(`Expected match for group ${group} in ${rex}`, ctx);
	} finally {
		rex.lastIndex = 0;
	}
}

function takeLiteral<T extends string>(ctx: ParseContext, str: T): T {
	if (ctx.source.startsWith(str, ctx.index)) {
		ctx.index += str.length;
		return str;
	}
	throw new ParseError(`Expected ${str}`, ctx);
}
