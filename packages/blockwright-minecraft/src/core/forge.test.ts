import assert from "node:assert/strict";
import {test} from "node:test";
import {CORE} from "./modules.js";
test("Forge prefab sources use Forge capabilities without contaminating the default NeoForge cache",()=>{
 const forge=CORE.spec("forge"), neo=CORE.spec();
 const path="blockwright/minecraft/core/GameJson.java";
 assert.match(forge.sources[path]!,/ForgeCapabilities.ITEM_HANDLER/);
 assert.match(neo.sources[path]!,/Capabilities.ItemHandler.BLOCK/);
 assert.notDeepEqual(forge.sources,neo.sources);
 assert.equal(CORE.spec("forge"),forge); assert.equal(CORE.spec(),neo);
});
