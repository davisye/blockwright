import { createGameTest, expect } from "@izakyl/blockwright-test";
import { world } from "@izakyl/blockwright-minecraft";
import { LIVE_DIR } from "./helpers";

// Opt in with a Forge config whose EULA has been explicitly accepted.
const config = process.env.BW_FORGE_CONFIG;
const test = createGameTest({
  engine: "forge",
  cwd: LIVE_DIR,
  config,
  traceDir: process.env.BW_FORGE_TRACE_DIR ?? "test-results/forge",
  server: { startFrozen: false },
});
test.skip(!config, "Set BW_FORGE_CONFIG to an accepted Forge 1.21.1 config");

test("Forge Playwright fixtures launch both roles and synchronize a world change", async ({ server, client, game }) => {
  expect(game.instances.server.engine).toBe("forge");
  expect(game.instances.client.engine).toBe("forge");
  const pos = { x: 0, y: -60, z: 0 };
  await world.command(server, "forceload add 0 0");
  await world.command(server, "setblock 0 -60 0 minecraft:diamond_block");
  expect((await world.block(server, pos)).id).toBe("minecraft:diamond_block");
  const settled = await client.settle({ barrier: true, timeoutMs: 15_000 });
  expect(settled.serverId).toBeTruthy();
  expect(settled.epoch).toBeGreaterThanOrEqual(0);
});
