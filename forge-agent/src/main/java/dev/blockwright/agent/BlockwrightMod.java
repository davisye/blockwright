package dev.blockwright.agent;

import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.loading.FMLEnvironment;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.api.distmarker.Dist;

import java.util.concurrent.atomic.AtomicBoolean;

@Mod(BlockwrightMod.MOD_ID)
public final class BlockwrightMod {
    static final String MOD_ID = "blockwright";
    private static final AtomicBoolean STARTED = new AtomicBoolean(false);

    public BlockwrightMod(net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext context) {
        IEventBus modEventBus = context.getModEventBus();
        boolean client = FMLEnvironment.dist == Dist.CLIENT;
        String role = client ? "client" : "server";
        startAgent(role, client);
        CrashHandler.install(role);
        Lifecycle.register(role);
        MinecraftForge.EVENT_BUS.register(Lifecycle.class);
        MinecraftForge.EVENT_BUS.register(EpochChannel.class);
        EpochChannel.register();
        if (client) {
            ClientAutoConnect.register(role);
            MinecraftForge.EVENT_BUS.register(Lifecycle.Client.class);
            MinecraftForge.EVENT_BUS.register(ClientFrames.class);
            MinecraftForge.EVENT_BUS.register(ClientAutoConnect.class);
            MinecraftForge.EVENT_BUS.register(EpochChannel.ClientChannel.class);
        }
        modEventBus.addListener(this::onClientSetup);
    }

    private static void startAgent(String entrypointRole, boolean client) {
        if (!AgentTrace.isEnabled() || !STARTED.compareAndSet(false, true)) {
            return;
        }
        String role = AgentTrace.configuredRole(entrypointRole);
        Control.start(role, client);
        OrphanGuard.startWatchdog(role);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> AgentTrace.emit("forge.jvm_shutdown", role)));
    }

    private void onClientSetup(FMLClientSetupEvent event) {
        AgentTrace.emit("forge.client.setup", AgentTrace.configuredRole("client"));
    }
}
