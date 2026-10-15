import assert from "node:assert/strict";
import {test} from "node:test";
import {BlockwrightInstance} from "./instance.js";
import {resolveRequestTimeoutMs, type BlockwrightDriver} from "./driver.js";
test("a Forge installation is not cut off by the ordinary RPC timeout",()=>{
 assert.equal(resolveRequestTimeoutMs("forge.launch",{},35000),null);
 assert.equal(resolveRequestTimeoutMs("forge.launch",{timeoutMs:5000},35000),5000);
});
test("instances retain their loader identity while old launch results default to NeoForge",()=>{
 const driver={cwd:process.cwd()} as BlockwrightDriver;
 const result={instanceId:"forge-server-test",role:"server" as const,instanceDir:".",tracePath:"trace.ndjson"};
 assert.equal(new BlockwrightInstance(driver,{...result,engine:"forge"}).engine,"forge");
 assert.equal(new BlockwrightInstance(driver,result).engine,"neoforge");
});
