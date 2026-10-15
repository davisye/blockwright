package dev.blockwright.agent;

import com.google.gson.JsonObject;

import dev.blockwright.api.access.ClientPacketListenerAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.LevelLoadStatusManager;
import net.minecraft.server.MinecraftServer;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import dev.blockwright.api.Hooks;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.event.server.ServerStoppedEvent;

import java.util.concurrent.atomic.AtomicLong;

/**
 * The one definition of "ready" for both roles. A server is ready once its world has started and
 * the first server tick has run; a client is ready while it has a player in a level whose chunks
 * around the player have loaded. Every transition to ready emits {@code blockwright.lifecycle.ready}.
 */
public final class Lifecycle {
    static final String READY_EVENT = "blockwright.lifecycle.ready";
    static final String START_FROZEN_PROPERTY = "blockwright.server.startFrozen";
    private static final String BACKEND = "forge-events";

    private static volatile String role = "server";
    private static volatile MinecraftServer server;
    private static volatile boolean serverStarted;
    private static boolean ready;

    private Lifecycle() {
    }

    static void register(String entrypointRole) {
        role = AgentTrace.configuredRole(entrypointRole);
    }

    private static synchronized void markReady(JsonObject data) {
        if (!ready) {
            ready = true;
            AgentTrace.emit(READY_EVENT, role, data);
        }
    }

    private static synchronized void markNotReady() {
        ready = false;
    }

    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        server = event.getServer();
        if (server.isDedicatedServer()) {
            ServerPort.publish(server);
        }
        if (Boolean.getBoolean(START_FROZEN_PROPERTY)) {
            server.tickRateManager().setFrozen(true);
        }
        serverStarted = true;
    }

    /** An integrated server stops when the player leaves the world; it must not be queried afterwards. */
    @SubscribeEvent
    public static void onServerStopped(ServerStoppedEvent event) {
        server = null;
        serverStarted = false;
    }

    @SubscribeEvent
    public static void onStartServerTick(TickEvent.ServerTickEvent event) {
        if (event.phase != TickEvent.Phase.START) return;
        if (Hooks.SERVER_TICK_START.active()) {
            Hooks.SERVER_TICK_START.publish(event.getServer());
        }
    }

    @SubscribeEvent
    public static void onEndServerTick(TickEvent.ServerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        MinecraftServer current = event.getServer();
        if (server == null) {
            server = current;
        }
        if (serverStarted && "server".equals(role)) {
            markReady(Json.of("backend", BACKEND, "tick", current.getTickCount(), "frozen", current.tickRateManager().isFrozen()));
        }
        if (Hooks.SERVER_TICK_END.active()) {
            Hooks.SERVER_TICK_END.publish(current);
        }
    }

    /** The server in this process (dedicated, or a client's integrated server), or null. */
    static MinecraftServer currentServer() {
        return server;
    }

    /** Kept apart so dedicated servers never load client classes. */
    public static final class Client {
        private static final AtomicLong OBSERVED_TICKS = new AtomicLong();
        private static boolean joined;

        private Client() {
        }

        @SubscribeEvent
        public static void onStartClientTick(TickEvent.ClientTickEvent event) {
            if (event.phase != TickEvent.Phase.START) return;
            ClientHooks.attach();
            if (Hooks.CLIENT_TICK_START.active()) {
                Hooks.CLIENT_TICK_START.publish(Minecraft.getInstance());
            }
        }

        @SubscribeEvent
        public static void onEndClientTick(TickEvent.ClientTickEvent event) {
            if (event.phase != TickEvent.Phase.END) return;
            long observedTick = OBSERVED_TICKS.incrementAndGet();
            Minecraft minecraft = Minecraft.getInstance();
            if (Hooks.CLIENT_TICK_END.active()) {
                Hooks.CLIENT_TICK_END.publish(minecraft);
            }
            boolean inLevel = minecraft != null && inLoadedLevel(minecraft);
            if (inLevel && !joined) {
                markReady(Json.of("backend", BACKEND, "observedTick", observedTick));
            } else if (!inLevel && joined) {
                markNotReady();
            }
            joined = inLevel;
        }

        /** True once the player is in a level and vanilla's own level-load status says it is ready. */
        private static boolean inLoadedLevel(Minecraft minecraft) {
            ClientPacketListener connection = minecraft.getConnection();
            if (minecraft.player == null || minecraft.level == null || connection == null) {
                return false;
            }
            LevelLoadStatusManager status = ((ClientPacketListenerAccessor) connection).blockwright$levelLoadStatusManager();
            return status == null || status.levelReady();
        }
    }
}
