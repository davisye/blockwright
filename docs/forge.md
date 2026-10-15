# Forge support in this fork

This fork adds a Forge backend for Linux x64, Minecraft **1.21.1**, Forge
**52.0.28**, and a **Java 21 JDK**. NeoForge remains the default. Other Minecraft
versions and the full upstream live suite have not been validated on Forge.
This is a source change in `davisye/blockwright`; the upstream `@izakyl/*` npm
releases do not contain it. Package names are retained for workspace compatibility.

## Build and configure

From this checkout, run `npm ci`, `npm test`, `cargo test --locked`, and
`npm run build:release`. The release build compiles both agents and checks Java
prefab sources against each loader. `CARGO_TARGET_DIR` can put native outputs on
another disk. `BLOCKWRIGHT_BUILD_ROOT` relocates Java build outputs and is
honored by the bundle scripts; `-PbuildRoot=/path` also works for direct Gradle
commands. Gradle's `GRADLE_USER_HOME` controls its dependency cache.

Create a config, explicitly accepting the Minecraft EULA only after reading it:

```toml
[forge]
minecraft_version = "1.21.1"
loader_version = "52.0.28"
jvm_args = ["-Xmx2G"]
# Useful for testing updaters whose apply operation runs in a shutdown hook.
complete_shutdown_hooks = true

[forge.server]
# https://www.minecraft.net/eula
eula = false
world = "flat"

[forge.client.display]
device = "software"
```

Forge supports the same Java, server, client, agent, instance and profile options
as `[neoforge]`, under `[forge]`. A single config may contain both sections.
Forge's `minecraft_version` must be explicit; `loader_version = "latest"`
selects a release only for that exact Minecraft version. Pin it for repeatability.
Downloads and runtime keys are separated by loader. Automatic client connections
select a server using the same loader.

## SDK, fixtures and MCP

```ts
import { BlockwrightDriver } from '@izakyl/blockwright-client';
import { createGameTest } from '@izakyl/blockwright-test';

const driver = new BlockwrightDriver();
const server = await driver.launchForge('server', { config: 'blockwright.toml' });
await server.waitForReady();
await server.close();
await driver.close();

const test = createGameTest({ engine: 'forge', config: 'blockwright.toml' });
```

`launchPair` and `launchGame` also accept `engine: 'forge'`.
MCP accepts `--engine forge --config blockwright.toml`.
The driver RPC is `forge.launch`; launch results and SDK instances carry their
`engine`. Old SDK launch results without it default to NeoForge.
The Minecraft prefab chooses Forge inventory capabilities and event listeners
from `java-forge/`. Custom prefabs can supply a `forgeRoot` to `defineModule`.
Agent lifecycle events use the `forge.*` prefix; common game and crash events
keep their existing names. To collect abandoned Forge instance directories,
use `blockwright gc --engine forge --config blockwright.toml`.

## Updating jars across restarts

`keepInstanceDir: true` keeps the directory but normally still seeds the configured
jars on every launch. To observe an updater's own installed files, first launch
normally (or seed an agent and mods), then relaunch the same instance with:

```ts
await driver.launchForge('server', {
  config: 'blockwright.toml',
  instance: 'updater-test',
  keepInstanceDir: true,
  preserveMods: true,
});
```

`preserveMods` requires an existing `mods/` directory and reuse or keep enabled.
It preserves the entire directory, including the agent: the caller must keep a
compatible agent there. It skips reseeding configured jars and records the jars
actually present as store references. Replace jars atomically when preparing a
test; projected files may share storage with the content cache.

`complete_shutdown_hooks = true` disables the offscreen client's fast libc exit
path so ordinary JVM shutdown hooks can finish. Allow sufficient `graceMs` on
close (default 10 seconds); hooks that exceed that budget still get killed.
Normal `Minecraft.stop()` and server `world.stop()` remain available. A mod
loading crash may use an immediate halt and does not promise hook completion.
This setting is also available under `[neoforge]` and defaults to false.

## Real-game regression

After a source build, run the opt-in test with a config you have accepted:

```sh
BW_FORGE_TEST_ROOT=/path/on/disk/forge-test \
  node scripts/test-forge.mjs /absolute/path/to/forge.toml
```

Set `BLOCKWRIGHT_CLI` if using a separate native build. The test creates dedicated
instances and two data-only fixture mods. It checks server readiness, prefab
compilation, inventory reads, tick timing, client auto-connect, an epoch barrier,
a PNG screenshot, keyboard/mouse input, a two-second shutdown hook, and a normal
restart that loads an updated fixture without reseeding the old configured jar.
Its JSON report, traces and screenshot stay in `BW_FORGE_TEST_ROOT` for review;
instance directories stay under the config's `instances_dir`.

These checks establish a tested backend, not compatibility with every Forge mod,
graphics driver, or upstream camera/media/coverage workflow. Downstream updater
transactions need their own apply, accept and rollback checks.

The opt-in Playwright fixture test is `BW_FORGE_CONFIG=/absolute/forge.toml npm
run test:live -- forge.spec.ts --workers=1`. It covers engine selection through
`launchGame` and both fixture roles, as well as a synchronized world mutation.

Observed on 2026-10-15: one packaged smoke run saved the server world but did not
exit within 60 seconds; the next unchanged package run exited normally and
passed. The cause remains unlocalized. The smoke test keeps failure evidence and
tries to capture a JVM thread dump on recurrence. Treat this fork as an opt-in
regression tool until repeated shutdown checks are stable in the target modpack.
