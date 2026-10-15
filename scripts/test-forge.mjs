// Explicit opt-in: pass a Forge config whose EULA you have accepted.
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {BlockwrightDriver, findInstance} from '@izakyl/blockwright-client';
import {minecraft, world, tick, input, screen, media} from '@izakyl/blockwright-minecraft';
const inputConfig = process.argv[2];
if (!inputConfig) throw Error('Usage: node scripts/test-forge.mjs /path/to/accepted-forge.toml');
const configPath = resolve(inputConfig);
const root = process.env.BW_FORGE_TEST_ROOT ?? join(dirname(configPath), 'forge-test');
mkdirSync(root, {recursive: true});
const report = {startedAt: new Date().toISOString(), cases: []};
const save = () => writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const record = (name, details) => {report.cases.push({name, ...details});save();console.log('PASS ' + name);};
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
function fixture(version) {
  const dir = join(root, 'fixture-' + version);mkdirSync(join(dir, 'META-INF'), {recursive:true});
  writeFileSync(join(dir, 'META-INF/mods.toml'), `modLoader="lowcodefml"\nloaderVersion="[52,)"\nlicense="MIT"\n[[mods]]\nmodId="bw_restart_fixture"\nversion="${version}"\ndisplayName="Restart fixture"\n`);
  const jar=join(root, 'fixture-' + version + '.jar');
  execFileSync('jar', ['--create', '--file', jar, '-C', dir, 'META-INF']);
  return jar;
}
const v1=fixture('1.0.0'), v2=fixture('2.0.0');
const cfg=readFileSync(configPath, 'utf8');
// Use an absolute config path in a dedicated test root; the input's relative paths retain their meaning.
const testConfig=join(dirname(configPath), 'forge-smoke-' + process.pid + '.toml');
writeFileSync(testConfig, cfg + `\n[mods.restart_fixture]\npath = ${JSON.stringify(v1)}\n`);
const envOpts=[process.env.JAVA_TOOL_OPTIONS??'', '-Djava.io.tmpdir=' + join(root, 'tmp')];
mkdirSync(join(root,'tmp'), {recursive:true});process.env.TMPDIR=join(root,'tmp');
const proxy=process.env.https_proxy??process.env.HTTPS_PROXY;
if(proxy){const u=new URL(proxy);if(!u.username&&!u.password)envOpts.push(`-Dhttp.proxyHost=${u.hostname}`,`-Dhttp.proxyPort=${u.port}`,`-Dhttps.proxyHost=${u.hostname}`,`-Dhttps.proxyPort=${u.port}`,'-Dhttp.nonProxyHosts=localhost|127.*');}
process.env.JAVA_TOOL_OPTIONS=envOpts.filter(Boolean).join(' ');
const driver=new BlockwrightDriver({cwd:root});const release=driver.retain();let serverRaw, clientRaw, server;
const versionSource='public final class Task { public static Object run(dev.blockwright.api.Context ctx) { return net.minecraftforge.fml.ModList.get().getModContainerById("bw_restart_fixture").orElseThrow().getModInfo().getVersion().toString(); } }';
const suffix=Date.now().toString(36);
const launch=async preserveMods => {
 serverRaw=await driver.launchForge('server', {config:testConfig,instance:'forge-smoke-server-'+suffix,keepInstanceDir:true,preserveMods,startFrozen:false,trace:join(root,'server-'+(preserveMods?'restart':'first')+'.ndjson')});
 await serverRaw.waitForReady({timeoutMs:240000});server=minecraft.server(serverRaw);
};
try {
 await launch(false);
 assert.equal(serverRaw.engine,'forge');
 assert.equal(await serverRaw.run({source:versionSource}).result(),'1.0.0');
 record('Forge server ready', {instanceDir:serverRaw.instanceDir});
 const pos={x:0,y:0,z:0};
 await world.command(server,['forceload add 0 0','setblock 0 0 0 minecraft:chest{Items:[{Slot:0b,id:"minecraft:diamond",count:3}]}']);
 const container=await world.container(server,pos);
 assert.equal(container.size,27);assert.equal(container.slots[0].id,'minecraft:diamond');assert.equal(container.slots[0].count,3);
 await tick.meter.start(server);await tick.step(server,5);const timing=await tick.meter.summary(server);assert.ok(timing.ticks>=5);
 record('Forge prefab compilation, inventory and tick events',{container,timing});
 clientRaw=await driver.launchForge('client',{config:testConfig,instance:'forge-smoke-client-'+suffix,keepInstanceDir:true,trace:join(root,'client.ndjson')});
 await clientRaw.waitForReady({timeoutMs:240000});const client=minecraft.client(clientRaw);
 const settled=await client.settle({barrier:true,timeoutMs:15000});assert.ok(settled.serverId);assert.ok(settled.epoch>=0);
 const shot=await media.screenshot(client,{path:join(root,'forge-client.png'),maxWidth:640});assert.ok(shot.width>64);assert.equal(shot.png.subarray(1,4).toString(),'PNG');
 await input.key(client,{keyCode:256});
 const opened=await screen.current(client);assert.ok(opened.className?.includes('PauseScreen'));
 const pressed=await input.button(client,{button:"left",action:'press'});
 const released=await input.button(client,{button:"left",action:'release'});
 assert.equal(pressed.dispatch.screenBranch,true);assert.equal(released.dispatch.postSent,true);
 record('Forge client auto-connect, epoch barrier, rendering and input',{settled,screenshot:{width:shot.width,height:shot.height},opened,pressed,released});
 const marker=join(root,'shutdown-hook-'+suffix+'.txt');
 await clientRaw.run({thread:'client',source:`public final class Task { public static Object run(dev.blockwright.api.Context ctx) { Runtime.getRuntime().addShutdownHook(new Thread(() -> { try { Thread.sleep(2000); java.nio.file.Files.writeString(java.nio.file.Path.of(${JSON.stringify(marker)}), "completed"); } catch (Exception e) { throw new RuntimeException(e); } })); return true; } }`}).result();
 const closed=await clientRaw.close({keepInstanceDir:true,graceMs:15000});clientRaw=undefined;
 assert.ok(existsSync(marker));assert.equal(closed.killed,false);
 record('Complete client shutdown hooks',{marker,closed});
 const target=join(serverRaw.instanceDir,'mods', 'fixture-1.0.0.jar');
 const stopped=await world.stop(server,{timeoutMs:30000});
 if(!stopped.exited){
  const row=findInstance(serverRaw.instanceId,{root});
  if(row)try{writeFileSync(join(root,'server-stop-thread-dump.txt'),execFileSync('jcmd',[String(row.pid),'Thread.print'],{encoding:'utf8',timeout:10000}));}catch(error){report.diagnosticError=String(error);}
 }
 assert.ok(stopped.exited);
 await serverRaw.close({keepInstanceDir:true});serverRaw=undefined;
 copyFileSync(v2,target+'.next');renameSync(target+'.next',target);await launch(true);
 assert.equal(hash(target),hash(v2));assert.equal(await serverRaw.run({source:versionSource}).result(),'2.0.0');
 await world.stop(server,{timeoutMs:60000});const ended=await serverRaw.close({keepInstanceDir:true});serverRaw=undefined;
 assert.equal(ended.terminated,false);
 record('Preserve updated mods across a normal server restart',{version:'2.0.0',hash:hash(target),ended});
 report.pass=true;
} catch(error) {report.error=String(error);console.error(error);process.exitCode=1;}
finally {if(clientRaw) await clientRaw.close({keepInstanceDir:true}).catch(()=>{});if(serverRaw) await serverRaw.close({keepInstanceDir:true}).catch(()=>{});release();driver.close();report.endedAt=new Date().toISOString();save();}
