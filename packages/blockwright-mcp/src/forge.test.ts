import assert from "node:assert/strict";
import {test} from "node:test";
import {parseArgs} from "./args.js";
test("MCP selects Forge explicitly and preserves the NeoForge default",()=>{
 assert.equal(parseArgs(["--engine","forge"]).engine,"forge");
 assert.equal(parseArgs([]).engine,undefined);
 assert.throws(()=>parseArgs(["--engine","fabric"]),/forge or neoforge/);
});
