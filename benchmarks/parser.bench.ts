import {
	barplot,
	bench,
	compact,
	group,
	type k_state,
	run,
	summary,
} from "mitata";
import { parseQuery } from "../src/parser.js";

compact(() => {
	barplot(() => {
		summary(() => {
			group(() => {
				bench("AND clause x$count", function* (state: k_state) {
					const count = state.get("count");
					const clauses = Array.from(
						{ length: count },
						(_, i) => `field${i}="value${i}"`,
					);
					const query = `search ${clauses.join(" and ")}`;
					yield () => parseQuery(query);
				}).args("count", [1, 5, 10, 20, 50]);
			});

			group(() => {
				bench("Nesting depth x$depth", function* (state: k_state) {
					const depth = state.get("depth");
					let query = 'field="value"';
					for (let i = 0; i < depth; i++) {
						query = `(${query})`;
					}
					const finalQuery = `search ${query}`;
					yield () => parseQuery(finalQuery);
				}).args("depth", [1, 2, 3, 4, 5]);
			});

			group(() => {
				bench("NOT operator chaining x$count", function* (state: k_state) {
					const count = state.get("count");
					let query = 'field="value"';
					for (let i = 0; i < count; i++) {
						query = `not ${query}`;
					}
					const finalQuery = `search ${query}`;
					yield () => parseQuery(finalQuery);
				}).args("count", [1, 5, 10, 20, 50]);
			});

			group(() => {
				bench("Pipeline length x$length", function* (state: k_state) {
					const length = state.get("length");
					const commands = ['search field="value"'];
					for (let i = 1; i < length; i++) {
						commands.push(i % 2 === 1 ? `where count > ${i}` : "stats");
					}
					const query = commands.join(" | ");
					yield () => parseQuery(query);
				}).args("length", [1, 3, 5, 10, 20]);
			});

			group(() => {
				bench("String length scaling x$length", function* (state: k_state) {
					const length = state.get("length");
					const longQuery = `search message="${"x".repeat(length)}"`;
					yield () => parseQuery(longQuery);
				}).args("length", [10, 50, 100, 500, 1000]);
			});
		});
	});
});

await run({
	colors: true,
});
