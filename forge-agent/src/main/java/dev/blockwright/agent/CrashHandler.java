package dev.blockwright.agent;

import com.google.gson.JsonArray;
import java.util.List;
import java.util.Objects;

import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.concurrent.atomic.AtomicBoolean;

import net.minecraftforge.fml.LoadingFailedException;

public final class CrashHandler {
    private static final AtomicBoolean INSTALLED = new AtomicBoolean(false);
    /** How long an exit waits for a control connection that is down to take the buffered crash event. */
    private static final long TRACE_DRAIN_MILLIS = 3_000L;

    private CrashHandler() {
    }

    static void install(String entrypointRole) {
        if (!AgentTrace.isEnabled()) {
            return;
        }
        if (!INSTALLED.compareAndSet(false, true)) {
            return;
        }
        String role = AgentTrace.configuredRole(entrypointRole);
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            emitCrash(role, thread.getName(), throwable);
        });
    }

    static void emitCrash(String role, String threadName, Throwable throwable) {
        try {
            StringWriter sw = new StringWriter();
            throwable.printStackTrace(new PrintWriter(sw));
            String stackTrace = sw.toString();

            JsonArray causeChain = buildCauseChain(throwable);

            AgentTrace.emit(
                "blockwright.crash",
                role,
                Json.of(
                    "thread", Objects.toString(threadName, ""),
                    "exceptionClass", throwable.getClass().getName(),
                    "message", Objects.toString(throwable.getMessage(), ""),
                    "causeChain", causeChain,
                    "stackTrace", stackTrace));
        } catch (Throwable ignored) {
        }
    }

    /**
     * Failed mod loading leaves a client on Forge's error screen with the JVM still up; under
     * the agent that only burns the launch's readiness budget, so report the errors and exit.
     * Warnings alone open the same screen and are left to it.
     */
    public static void exitOnModLoadingErrors(LoadingFailedException failure, File dumpedLocation) {
        if (!AgentTrace.isEnabled() || failure == null || failure.getErrors().isEmpty()) return;
        String role=AgentTrace.configuredRole("client");
        String message="Forge mod loading failed: " + failure.getMessage();
        String report=dumpedLocation == null ? "" : dumpedLocation.getAbsolutePath();
        AgentTrace.emit("blockwright.crash", role, Json.of("exceptionClass", failure.getClass().getName(), "message", message, "crashReport", report, "causeChain", buildCauseChain(failure)));
        System.err.println("[blockwright] " + message);
        exitFromRenderThread(1);
    }

    /**
     * Ends the process from the render thread with the offscreen EGL context still current on it.
     * System.exit here would run shutdown hooks on other threads while this one is parked holding
     * the window and context, and leave the context to the EGL library's own exit handlers, which
     * sometimes crash (SIGSEGV in libEGL_nvidia.so) and turn an ordinary loading failure into a
     * JVM crash. So: flush what the driver and the log should see, release the context on the thread
     * it is current on, then halt. The driver still sees exit code 1 and the crash report.
     */
    private static void exitFromRenderThread(int status) {
        if (Control.started()) {
            AgentTrace.drain(TRACE_DRAIN_MILLIS);
        }
        try {
            org.apache.logging.log4j.LogManager.shutdown();
        } catch (Throwable ignored) {
        }
        System.out.flush();
        System.err.flush();
        try {
            if (ClientOffscreen.enabled()) {
                ClientOffscreen.release();
            }
        } catch (Throwable ignored) {
        }
        Runtime.getRuntime().halt(status);
    }

    private static JsonArray buildCauseChain(Throwable throwable) {
        JsonArray chain = new JsonArray();
        for (Throwable current = throwable; current != null && chain.size() < 16; current = current.getCause()) {
            chain.add(Json.of("class", current.getClass().getName(), "message", Objects.toString(current.getMessage(), "")));
        }
        return chain;
    }
}
