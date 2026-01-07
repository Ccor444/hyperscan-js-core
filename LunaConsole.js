/**
 * LunaConsole.js - Advanced Debugging Terminal for HyperScan Emulator
 * Versão: 3.0 COMPATÍVEL COM MAIN v4.0
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: main.js v4.0, cpu.js, debugger.js, disasm.js, spu.js, cdrom.js
 * 
 * Autor: Ccor444
 * Data: 2025-01-06
 * 
 * ✅ NOVO: Compatibilidade total com Main v4.0
 * ✅ NOVO: CPU.initializeCPU() validation
 * ✅ NOVO: MIU synchronization checks
 * ✅ NOVO: CDROM v4.0 integration
 * ✅ NOVO: SPU v4.0 polyphonic support
 * ✅ NOVO: Boot sequence monitoring
 * ✅ NOVO: Interrupt controller debugging
 */

"use strict";

window.__DEV__ = true;

class LunaConsole {
    constructor() {
        // ========== DOM ELEMENTS ==========
        this.out = document.getElementById("console-out");
        this.input = document.getElementById("console-input");
        this.autocompleteBox = document.getElementById("autocomplete-box");
        this.statusLed = document.getElementById("status-led");
        this.freqDisplay = document.getElementById("cpu-freq-display");
        
        if (!this.out || !this.input) {
            console.error("[LUNA] Elementos DOM não encontrados!");
            return;
        }

        // ========== STATE ==========
        this.history = [];
        this.historyIndex = -1;
        this.isRunning = false;
        this.lastCommandTime = 0;
        
        // ========== WATCHES & BREAKPOINTS ==========
        this.watches = new Map();
        this.breakpoints = new Set();
        this.memoryWatches = new Map();
        this.callStack = [];
        
        // ========== STATISTICS ==========
        this.stats = {
            commandsExecuted: 0,
            startTime: Date.now(),
            lastRenderTime: 0
        };

        // ========== INITIALIZE ==========
        this.setupEventListeners();
        this.initializeCommands();
        this.setupAutoComplete();
        this.logBoot();
        this.startMonitoring();

        console.log("[LUNA] ✓ LunaConsole v3.0 Initialized (MAIN v4.0 Compatible)");
    }

    logBoot() {
        this.log("", "default");
        this.log("╔════════════════════════════════════════╗", "success");
        this.log("║   🟢 LUNA ENGINE CONSOLE ONLINE       ║", "success");
        this.log("║   Firmware: SPG290 HyperScan v4.0      ║", "success");
        this.log("║   Advanced Debugger Terminal Ready     ║", "success");
        this.log("║   🎵 Audio Engine: SPU v4.0 Enabled    ║", "success");
        this.log("║   📀 CDROM v4.0: UDF+ISO Support       ║", "success");
        this.log("╚════════════════════════════════════════╝", "success");
        this.log("", "info");
        this.log("Type 'help' for available commands", "info");
        this.log("Type 'spu.test' to test audio", "info");
        this.log("Type 'cdrom.load' to load a game ISO", "info");
        this.log("Type 'boot.status' to check BIOS boot", "info");
        this.log("", "info");
    }

    setupEventListeners() {
        this.input?.addEventListener("keydown", (e) => this.handleKeyDown(e));
        
        document.getElementById("btn-run")?.addEventListener("click", () => this.toggleRun());
        document.getElementById("btn-pause")?.addEventListener("click", () => this.pause());
        document.getElementById("btn-step")?.addEventListener("click", () => this.step());
        document.getElementById("btn-reset")?.addEventListener("click", () => this.resetEngine());
        document.getElementById("btn-debug-toggle")?.addEventListener("click", () => this.toggleDebug());
        
        document.getElementById("trace-toggle")?.addEventListener("change", (e) => this.setTrace(e.target.checked));
    }

    handleKeyDown(e) {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (this.history.length) {
                this.historyIndex = Math.max(0, this.historyIndex - 1);
                this.input.value = this.history[this.historyIndex];
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
            this.input.value = this.history[this.historyIndex] || "";
        } else if (e.key === "Enter") {
            e.preventDefault();
            this.executeCommand();
        } else if (e.key === "Tab") {
            e.preventDefault();
            this.showAutocomplete();
        }
    }

    executeCommand() {
        const cmd = this.input.value.trim();
        this.input.value = "";
        if (!cmd) return;

        this.history.push(cmd);
        this.historyIndex = this.history.length;
        this.stats.commandsExecuted++;

        this.log(`> ${cmd}`, "prompt");
        this.autocompleteBox.style.display = "none";

        try {
            const result = this.parseCommand(cmd);
            if (result !== undefined && result !== null) {
                if (typeof result === "object") {
                    this.dumpObject(result);
                } else {
                    this.log(String(result), "info");
                }
            }
        } catch (err) {
            this.log(`❌ ERROR: ${err.message}`, "error");
            console.error(err);
        }
    }

    parseCommand(cmd) {
        const parts = cmd.split(/\s+/);
        const mainCmd = parts[0].toLowerCase();

        if (this.commands[mainCmd]) {
            return this.commands[mainCmd].call(this, ...parts.slice(1));
        }

        try {
            return eval(cmd);
        } catch (e) {
            throw new Error(`Unknown command: '${mainCmd}'`);
        }
    }

    log(msg, type = "default") {
        const div = document.createElement("div");
        div.className = `console-line ${type}`;
        div.textContent = msg;
        this.out.appendChild(div);
        this.out.scrollTop = this.out.scrollHeight;
    }

    dumpObject(obj, depth = 2, prefix = "") {
        if (depth === 0 || obj === null) {
            this.log(`${prefix}${String(obj)}`, "info");
            return;
        }

        if (typeof obj !== "object") {
            this.log(`${prefix}${String(obj)}`, "info");
            return;
        }

        if (Array.isArray(obj)) {
            this.log(`${prefix}[`, "info");
            obj.forEach((item, idx) => {
                if (typeof item === "object" && item !== null) {
                    this.log(`${prefix}  [${idx}]:`, "info");
                    this.dumpObject(item, depth - 1, prefix + "    ");
                } else {
                    this.log(`${prefix}  [${idx}]: ${String(item).substring(0, 100)}`, "info");
                }
            });
            this.log(`${prefix}]`, "info");
        } else {
            this.log(`${prefix}{`, "success");
            Object.keys(obj).forEach(key => {
                const val = obj[key];
                if (typeof val === "object" && val !== null && depth > 1) {
                    this.log(`${prefix}  ${key}:`, "success");
                    this.dumpObject(val, depth - 1, prefix + "    ");
                } else {
                    const valStr = String(val).substring(0, 60);
                    this.log(`${prefix}  ${key}: ${valStr}`, "info");
                }
            });
            this.log(`${prefix}}`, "success");
        }
    }

    initializeCommands() {
        this.commands = {
            // ========== HELP & SYSTEM ==========
            help: () => this.showHelp(),
            clear: () => { this.out.innerHTML = ""; return null; },
            
            // ========== STATUS & INFO ==========
            status: () => this.showStatus(),
            info: () => this.showSystemInfo(),
            stats: () => this.showDetailedStats(),
            ls: () => this.listComponents(),
            
            // ========== BOOT COMMANDS v4.0 ==========
            "boot.status": () => this.showBootStatus(),
            "boot.sequence": () => this.startBootSequence(),
            "boot.validate": () => this.validateBootSequence(),
            "boot.info": () => this.showBootInfo(),
            
            // ========== CPU COMMANDS ==========
            "cpu.dump": () => this.dumpCPU(),
            "cpu.registers": () => this.dumpRegisters(),
            "cpu.disasm": (addr = "0", lines = "10") => this.disassemble(parseInt(addr, 16), parseInt(lines)),
            "cpu.trace": (count = "20") => this.traceInstructions(parseInt(count)),
            "cpu.pc": (addr) => this.setCPUPC(addr ? parseInt(addr, 16) : null),
            "cpu.init": () => this.validateCPUInit(),
            "cpu.miu": () => this.validateMIU(),
            
            // ========== MEMORY COMMANDS ==========
            "mem.dump": (addr = "0", len = "256") => this.dumpMemory(parseInt(addr, 16), parseInt(len, 16)),
            "mem.read": (addr) => this.readMemory(parseInt(addr, 16)),
            "mem.write": (addr, val) => this.writeMemory(parseInt(addr, 16), parseInt(val, 16)),
            "mem.search": (pattern) => this.searchMemory(pattern),
            "mem.watch": (addr) => this.addMemoryWatch(parseInt(addr, 16)),
            "mem.unwatch": (addr) => this.removeMemoryWatch(parseInt(addr, 16)),
            "mem.watches": () => this.showMemoryWatches(),
            
            // ========== VDU COMMANDS ==========
            "vdu.info": () => this.dumpVDU(),
            "vdu.dump": (addr = "0", len = "256") => this.dumpVDUMemory(parseInt(addr, 16), parseInt(len, 16)),
            
            // ========== SPU COMMANDS v4.0 ========== 
            "spu.info": () => this.dumpSPU(),
            "spu.play": (note = "440") => this.playSPUNote(parseInt(note)),
            "spu.stop": () => this.stopSPUNote(),
            "spu.preset": (name = "synth") => this.setSPUPreset(name),
            "spu.volume": (vol = "100") => this.setSPUVolume(parseInt(vol) / 100),
            "spu.mute": () => this.toggleSPUMute(),
            "spu.voices": () => this.showSPUVoices(),
            "spu.stats": () => this.showSPUStats(),
            "spu.reset": () => this.resetSPU(),
            "spu.test": () => this.testSPU(),
            "spu.connect": () => this.validateSPUConnection(),
            
            // ========== INTERRUPT COMMANDS v4.0 ==========
            "int.info": () => this.showInterruptInfo(),
            "int.enable": (irq) => this.enableInterrupt(parseInt(irq)),
            "int.disable": (irq) => this.disableInterrupt(parseInt(irq)),
            "int.list": () => this.listInterrupts(),
            "int.trigger": (irq) => this.triggerInterrupt(parseInt(irq)),
            
            // ========== EXECUTION CONTROL ==========
            run: () => this.toggleRun(),
            pause: () => this.pause(),
            step: () => this.step(),
            reset: () => this.resetEngine(),
            
            // ========== BREAKPOINTS ==========
            "bp.add": (addr) => this.addBreakpoint(parseInt(addr, 16)),
            "bp.remove": (addr) => this.removeBreakpoint(parseInt(addr, 16)),
            "bp.list": () => this.listBreakpoints(),
            "bp.clear": () => this.clearBreakpoints(),
            "bp.toggle": (addr) => this.toggleBreakpoint(parseInt(addr, 16)),
            
            // ========== REGISTER WATCHES ==========
            "watch.add": (reg) => this.addWatch(reg),
            "watch.remove": (reg) => this.removeWatch(reg),
            "watch.list": () => this.showWatches(),
            
            // ========== PERFORMANCE ==========
            perf: () => this.showPerformance(),
            "perf.reset": () => this.resetPerf(),
            
            // ========== PERIPHERALS ==========
            "io.dump": () => this.dumpIO(),
            "timer.info": () => this.showTimerInfo(),
            "hw.status": () => this.showHardwareStatus(),
            "periph.status": () => this.showPeripheralsStatus(),
            
            // ========== ANALYSIS ==========
            "analyze.call": () => this.analyzeCallStack(),
            "analyze.memory": () => this.analyzeMemory(),
            "analyze.performance": () => this.analyzePerformance(),
            
            // ========== CDROM COMMANDS v4.0 ==========
            "cdrom.info": () => this.dumpCDROM(),
            "cdrom.status": () => this.showCDROMStatus(),
            "cdrom.list": () => this.listCDROMFiles(),
            "cdrom.read": (filename) => this.readCDROMFile(filename),
            "cdrom.load": () => this.loadCDROM(),
            "cdrom.dump": (addr = "0", len = "256") => this.dumpCDROMData(parseInt(addr, 16), parseInt(len, 16)),
            "cdrom.validate": () => this.validateCDROMImage(),
            "cdrom.stats": () => this.showCDROMStats(),
            "cdrom.test": () => this.testCDROMIntegrity(),
        };
    }

    setupAutoComplete() {
        // Populated on demand
    }

    showAutocomplete() {
        const input = this.input.value;
        const suggestions = Object.keys(this.commands).filter(cmd => 
            cmd.startsWith(input.toLowerCase())
        );

        if (suggestions.length === 0) return;

        this.autocompleteBox.innerHTML = suggestions
            .slice(0, 10)
            .map(s => `<div class="autocomplete-item" onclick="luna.selectAutocomplete('${s}')">${s}</div>`)
            .join("");
        
        this.autocompleteBox.style.display = "block";
    }

    selectAutocomplete(cmd) {
        this.input.value = cmd + " ";
        this.autocompleteBox.style.display = "none";
        this.input.focus();
    }

    showHelp() {
        const commands = [
            ["SYSTEM COMMANDS:", ""],
            ["help", "Show this message"],
            ["clear", "Clear console"],
            ["status", "System status"],
            ["info", "System information"],
            ["ls", "List components"],
            ["", ""],
            ["BOOT COMMANDS (v4.0):", ""],
            ["boot.status", "Check BIOS boot status"],
            ["boot.sequence", "Start boot sequence"],
            ["boot.validate", "Validate boot"],
            ["boot.info", "Detailed boot info"],
            ["", ""],
            ["CPU COMMANDS:", ""],
            ["cpu.dump", "Dump CPU state"],
            ["cpu.registers", "Show all registers"],
            ["cpu.disasm [addr] [lines]", "Disassemble code"],
            ["cpu.trace [count]", "Trace instructions"],
            ["cpu.pc [addr]", "Get/Set PC"],
            ["cpu.init", "Validate CPU initialization"],
            ["cpu.miu", "Check MIU connection"],
            ["", ""],
            ["MEMORY COMMANDS:", ""],
            ["mem.dump [addr] [len]", "Dump memory"],
            ["mem.read [addr]", "Read byte"],
            ["mem.write [addr] [val]", "Write byte"],
            ["mem.watch [addr]", "Watch address"],
            ["mem.watches", "List watched addresses"],
            ["", ""],
            ["SPU COMMANDS (v4.0):", ""],
            ["spu.info", "SPU status"],
            ["spu.play [freq]", "Play note (Hz)"],
            ["spu.stop", "Stop current note"],
            ["spu.preset [name]", "Load preset"],
            ["spu.volume [0-100]", "Set volume"],
            ["spu.mute", "Toggle mute"],
            ["spu.voices", "Show voices"],
            ["spu.stats", "SPU statistics"],
            ["spu.test", "Audio test (escala)"],
            ["spu.connect", "Validate SPU connection"],
            ["", ""],
            ["INTERRUPT COMMANDS (v4.0):", ""],
            ["int.info", "Show interrupt info"],
            ["int.enable [irq]", "Enable IRQ"],
            ["int.disable [irq]", "Disable IRQ"],
            ["int.list", "List interrupts"],
            ["int.trigger [irq]", "Trigger IRQ"],
            ["", ""],
            ["EXECUTION:", ""],
            ["run", "Start execution"],
            ["pause", "Pause execution"],
            ["step", "Single step"],
            ["reset", "Reset system"],
            ["", ""],
            ["DEBUGGING:", ""],
            ["bp.add [addr]", "Add breakpoint"],
            ["bp.list", "List breakpoints"],
            ["bp.clear", "Clear all breakpoints"],
            ["watch.add [reg]", "Watch register"],
            ["watch.list", "List register watches"],
            ["", ""],
            ["CDROM COMMANDS (v4.0):", ""],
            ["cdrom.load", "Load ISO/BIN/IMG image"],
            ["cdrom.list", "List files on disc"],
            ["cdrom.read [filename]", "Read file from disc"],
            ["cdrom.status", "Show CDROM status"],
            ["cdrom.stats", "CDROM statistics"],
            ["cdrom.validate", "Validate ISO image"],
            ["cdrom.test", "Test integrity"],
            ["cdrom.info", "Detailed CDROM info"],
        ];

        this.log("╔════════════════════════════════════════╗", "success");
        this.log("║      LUNA CONSOLE - COMMAND HELP       ║", "success");
        this.log("╚════════════════════════════════════════╝", "success");
        
        commands.forEach(([cmd, desc]) => {
            if (!cmd) {
                this.log("", "info");
            } else if (desc) {
                this.log(`  ${cmd.padEnd(30)} ${desc}`, "info");
            } else {
                this.log(`  ${cmd}`, "success");
            }
        });
    }

    listComponents() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        this.log("━━━ System Components ━━━", "success");
        
        const components = [
            { name: "CPU", check: () => emu.cpu ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "MIU (Memory)", check: () => emu.hw?.miu ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "DRAM", check: () => emu.hw?.dram ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "FLASH", check: () => emu.hw?.flash ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "I/O Controller", check: () => emu.hw?.io ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "VDU", check: () => emu.peripherals?.vdu ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Interrupt Controller", check: () => emu.peripherals?.intC ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Timer", check: () => emu.peripherals?.timer ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "UART", check: () => emu.peripherals?.uart ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "SPU (Audio)", check: () => emu.peripherals?.spu ? "🟢 ONLINE (🎵 v4.0)" : "🔴 OFFLINE" },
            { name: "CDROM", check: () => emu.peripherals?.cdrom ? "🟢 ONLINE (💿 v4.0)" : "🔴 OFFLINE" },
            { name: "Disassembler", check: () => emu.disassembler ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Debugger", check: () => emu.dbg ? "🟢 ONLINE" : "🔴 OFFLINE" },
        ];

        components.forEach(comp => {
            const status = comp.check();
            this.log(`  ${comp.name.padEnd(20)} ${status}`, "info");
        });
    }
// ========== BOOT COMMANDS v4.0 ==========

    showBootStatus() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        this.log("━━━ BOOT STATUS ━━━", "success");
        
        const bootStates = {
            0: "STOPPED",
            1: "RUNNING ▶️",
            2: "PAUSED ⏸️",
            3: "ERROR 💥",
            4: "LOADING ⏳",
            5: "BOOT_BIOS 🔧"
        };

        this.log(`State:          ${bootStates[emu.state] || "UNKNOWN"}`, "info");
        this.log(`BIOS Loaded:    ${emu.hw?.biosLoaded ? "✅ YES" : "❌ NO"}`, emu.hw?.biosLoaded ? "success" : "error");
        this.log(`BIOS Name:      ${emu.hw?.biosName || "None"}`, "info");
        this.log(`CDROM Loaded:   ${emu.hw?.cdromLoaded ? "✅ YES" : "❌ NO"}`, emu.hw?.cdromLoaded ? "success" : "error");
        this.log(`CDROM Name:     ${emu.hw?.cdromName || "None"}`, "info");
        this.log(`CPU Init:       ${emu.cpu?.initialized ? "✅ YES" : "❌ NO"}`, emu.cpu?.initialized ? "success" : "error");
        this.log(`MIU Connected:  ${emu.cpu?.miu ? "✅ YES" : "❌ NO"}`, emu.cpu?.miu ? "success" : "error");
        this.log(`Boot Address:   0x${(emu.cpu?.pc >>> 0).toString(16).toUpperCase().padStart(8, '0')}`, "cpu");
    }

    async startBootSequence() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        this.log("⏳ Starting boot sequence...", "warning");
        
        try {
            await window.emu.bootSequence();
            this.log("✅ Boot sequence completed", "success");
        } catch (err) {
            this.log(`❌ Boot failed: ${err.message}`, "error");
        }
    }

    validateBootSequence() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        this.log("━━━ BOOT VALIDATION ━━━", "info");

        const checks = [
            { name: "CPU exists", ok: !!emu.cpu },
            { name: "MIU initialized", ok: !!emu.hw?.miu },
            { name: "DRAM allocated", ok: !!emu.hw?.dram },
            { name: "FLASH allocated", ok: !!emu.hw?.flash },
            { name: "I/O mapped", ok: !!emu.hw?.io },
            { name: "BIOS loaded", ok: emu.hw?.biosLoaded },
            { name: "CPU initialized", ok: emu.cpu?.initialized },
            { name: "CPU.miu connected", ok: !!emu.cpu?.miu },
            { name: "Disassembler ready", ok: !!emu.disassembler },
            { name: "VDU online", ok: !!emu.peripherals?.vdu },
            { name: "IntC online", ok: !!emu.peripherals?.intC },
            { name: "SPU online", ok: !!emu.peripherals?.spu },
            { name: "CDROM online", ok: !!emu.peripherals?.cdrom },
            { name: "Debugger online", ok: !!emu.dbg }
        ];

        let passCount = 0;
        checks.forEach(check => {
            const marker = check.ok ? "✅" : "❌";
            this.log(`  ${marker} ${check.name}`, check.ok ? "success" : "error");
            if (check.ok) passCount++;
        });

        this.log(`\n${passCount}/${checks.length} checks passed`, passCount === checks.length ? "success" : "warning");
    }

    showBootInfo() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        this.log("━━━ BOOT INFORMATION v4.0 ━━━", "success");
        
        this.log("\n[Boot Configuration]", "info");
        this.log(`  BIOS Auto-Fetch: ${emu.config?.autoBootBIOS ? "ENABLED" : "DISABLED"}`, "info");
        this.log(`  BIOS Filename: ${PLATFORM_CONFIG?.BIOS_FILENAME || "spg290.bin"}`, "info");
        this.log(`  BIOS Address: 0x${(PLATFORM_CONFIG?.BOOT_ADDRESS_BIOS || 0).toString(16).toUpperCase()}`, "cpu");
        this.log(`  DRAM Size: ${(PLATFORM_CONFIG?.DRAM_SIZE / (1024*1024)).toFixed(1)}MB`, "info");
        this.log(`  FLASH Size: ${(PLATFORM_CONFIG?.FLASH_SIZE / (1024*1024)).toFixed(1)}MB`, "info");
        
        this.log("\n[Boot Sequence Steps]", "info");
        this.log(`  1. setupHardware() - Initialize all components`, "info");
        this.log(`  2. loadBIOSFirmware() - Load BIOS from file`, "info");
        this.log(`  3. PC → BOOT_ADDRESS_BIOS (0x9E000000)`, "info");
        this.log(`  4. runLoop() - Start execution`, "info");
        
        this.log("\n[Interrupt Configuration]", "info");
        this.log(`  IRQ 4:  V-Blank (VDU)`, "info");
        this.log(`  IRQ 5:  Timer`, "info");
        this.log(`  IRQ 6:  CDROM`, "info");
        this.log(`  IRQ 7:  UART`, "info");
        this.log(`  IRQ 10: Audio (SPU)`, "info");

        this.log("\n[Current Status]", "info");
        this.log(`  BIOS: ${emu.hw?.biosLoaded ? "✅ LOADED" : "❌ NOT LOADED"}`, emu.hw?.biosLoaded ? "success" : "warning");
        this.log(`  CDROM: ${emu.hw?.cdromLoaded ? "✅ LOADED" : "❌ NOT LOADED"}`, emu.hw?.cdromLoaded ? "success" : "warning");
        this.log(`  CPU: ${emu.cpu?.initialized ? "✅ INITIALIZED" : "❌ NOT INITIALIZED"}`, emu.cpu?.initialized ? "success" : "warning");
    }

    // ========== CPU VALIDATION v4.0 ==========

    validateCPUInit() {
        if (!window.emu || !window.emu.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        const cpu = window.emu.cpu;
        this.log("━━━ CPU INITIALIZATION STATUS ━━━", "info");
        
        this.log(`CPU Object:      ${cpu ? "✅ EXISTS" : "❌ MISSING"}`, "success");
        this.log(`Initialized:     ${cpu.initialized ? "✅ YES" : "❌ NO"}`, cpu.initialized ? "success" : "error");
        this.log(`MIU Connected:   ${cpu.miu ? "✅ YES" : "❌ NO"}`, cpu.miu ? "success" : "error");
        
        if (cpu.getInitializationStatus) {
            const status = cpu.getInitializationStatus();
            this.log("\n[Detailed Status]", "info");
            this.dumpObject(status, 2);
        }

        if (cpu.initializeCPU) {
            this.log(`\n✅ initializeCPU() method exists`, "success");
        } else {
            this.log(`\n❌ initializeCPU() method NOT found!`, "error");
        }
    }

    validateMIU() {
        if (!window.emu || !window.emu.hw?.miu) {
            this.log("❌ MIU not initialized", "error");
            return;
        }

        const miu = window.emu.hw.miu;
        const cpu = window.emu.cpu;

        this.log("━━━ MIU SYNCHRONIZATION STATUS ━━━", "info");
        
        this.log(`MIU Object:      ${miu ? "✅ EXISTS" : "❌ MISSING"}`, "success");
        this.log(`MIU Size:        0x${(miu.size || 0).toString(16).toUpperCase()}`, "memory");
        this.log(`CPU.miu ref:     ${cpu?.miu === miu ? "✅ SYNCHRONIZED" : "❌ DESYNC"}`, cpu?.miu === miu ? "success" : "error");
        
        this.log("\n[Mapped Regions]", "info");
        
        const regions = [
            { name: "DRAM", segment: 0xA0, hw: window.emu.hw?.dram },
            { name: "I/O", segment: 0x08, hw: window.emu.hw?.io },
            { name: "FLASH", segment: 0x9E, hw: window.emu.hw?.flash }
        ];

        regions.forEach(r => {
            const mapped = r.hw ? "✅" : "❌";
            const size = r.hw ? (r.hw.size || r.hw.buffer?.byteLength || 0) : 0;
            this.log(`  ${mapped} ${r.name.padEnd(8)} (0x${r.segment.toString(16).toUpperCase()}) - ${(size / (1024*1024)).toFixed(1)}MB`, "info");
        });
    }

    // ========== STATUS & INFO ==========

    showStatus() {
        if (!window.emu || !window.emu.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        const cpu = window.emu.cpu;
        const clock = window.emu.clock;
        const state = window.emu.state;
        
        this.log("━━━ SYSTEM STATUS ━━━", "success");
        this.log(`PC:              0x${(cpu.pc >>> 0).toString(16).toUpperCase().padStart(8, '0')}`, "cpu");
        this.log(`State:           ${state === 0 ? "STOPPED" : state === 1 ? "RUNNING" : state === 2 ? "PAUSED" : state === 5 ? "BOOT_BIOS" : "ERROR"}`, "info");
        this.log(`Cycles:          ${cpu.cycles || 0}`, "info");
        this.log(`Instructions:    ${cpu.instructions || 0}`, "info");
        this.log(`Clock (Target):  ${(clock?.targetHz / 1000000).toFixed(2)} MHz`, "info");
        this.log(`FPS (Actual):    ${clock?.actualFPS?.toFixed(2) || 0}`, "info");
        this.log(`Halted:          ${cpu.halted ? "YES ⚠️" : "NO"}`, cpu.halted ? "warning" : "success");
        
        const flags = cpu.getFlags?.() || { N: cpu.N, Z: cpu.Z, C: cpu.C, V: cpu.V, T: cpu.T };
        this.log(`Flags:           N=${flags.N} Z=${flags.Z} C=${flags.C} V=${flags.V} T=${flags.T}`, "cpu");
    }

    showSystemInfo() {
        this.log("━━━ SYSTEM INFORMATION v4.0 ━━━", "success");
        this.log("Processor:       SPG290 (Sunplus S+core)", "info");
        this.log("Architecture:    32-bit RISC", "info");
        this.log("Max Memory:      16 MB RAM", "info");
        this.log("Max ROM:         8 MB Flash", "info");
        this.log("Display:         320x224 @ 60 FPS", "info");
        this.log("Audio:           44.1 kHz, 16-bit Stereo, 16 Voices (SPU v4.0)", "info");
        this.log("Storage:         CD-ROM (UDF + ISO9660 v4.0)", "info");
        this.log("Console:         Luna Terminal v3.0", "info");
        this.log("Debug Mode:      " + (window.__DEV__ ? "ENABLED 🟢" : "DISABLED 🔴"), "info");
    }

    showDetailedStats() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        const clock = emu.clock;
        const uptime = ((Date.now() - this.stats.startTime) / 1000).toFixed(2);

        this.log("━━━ DETAILED STATISTICS ━━━", "success");
        this.log(`Total Cycles:       ${emu.cpu?.cycles || 0}`, "info");
        this.log(`Total Instructions: ${emu.cpu?.instructions || 0}`, "info");
        this.log(`Frame Count:        ${clock?.frameCount || 0}`, "info");
        this.log(`Actual FPS:         ${clock?.actualFPS?.toFixed(2) || 0}`, "info");
        this.log(`CPI (Cycles/Instr): ${(emu.cpu?.cycles / emu.cpu?.instructions || 0).toFixed(3)}`, "info");
        this.log(`Console Uptime:     ${uptime}s`, "info");
        this.log(`Commands Executed:  ${this.stats.commandsExecuted}`, "info");
    }

    // ========== CPU COMMANDS ==========
    
    dumpCPU() {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }
        this.log("━━━ CPU STATE ━━━", "cpu");
        this.dumpObject(window.emu.cpu, 1);
    }

    dumpRegisters() {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        const cpu = window.emu.cpu;
        this.log("━━━ REGISTER STATE ━━━", "cpu");
        
        if (cpu.r && Array.isArray(cpu.r)) {
            for (let i = 0; i < 32; i++) {
                const val = cpu.r[i] >>> 0;
                const hex = val.toString(16).padStart(8, '0').toUpperCase();
                this.log(`  r${i.toString().padStart(2, '0')} = 0x${hex}`, "cpu");
            }
        }

        this.log("", "info");
        this.log(`  PC = 0x${(cpu.pc >>> 0).toString(16).padStart(8, '0').toUpperCase()}`, "cpu");
        
        const flags = cpu.getFlags?.() || { N: cpu.N, Z: cpu.Z, C: cpu.C, V: cpu.V, T: cpu.T };
        this.log(`  Flags: N=${flags.N} Z=${flags.Z} C=${flags.C} V=${flags.V} T=${flags.T}`, "cpu");
    }

    disassemble(addr = 0, lines = 10) {
        if (!window.emu?.disassembler) {
            this.log("❌ Disassembler not available", "error");
            return;
        }

        this.log(`━━━ DISASSEMBLY @ 0x${addr.toString(16).toUpperCase().padStart(8, '0')} ━━━`, "cpu");
        
        try {
            for (let i = 0; i < lines; i++) {
                const currentAddr = addr + (i * 4);
                const instr = window.emu.disassembler.disasmAt(currentAddr);
                const marker = this.breakpoints.has(currentAddr) ? "🔴" : "  ";
                this.log(`${marker} 0x${currentAddr.toString(16).toUpperCase().padStart(8, '0')}: ${instr.text}`, "cpu");
            }
        } catch (e) {
            this.log(`⚠️ Disassembly error: ${e.message}`, "warning");
        }
    }

    traceInstructions(count = 20) {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        this.log(`━━━ INSTRUCTION TRACE (Last ${count}) ━━━`, "cpu");
        this.log("Trace requires extended debugging hooks", "warning");
    }

    setCPUPC(addr) {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        if (addr === null) {
            this.log(`PC: 0x${(window.emu.cpu.pc >>> 0).toString(16).toUpperCase().padStart(8, '0')}`, "info");
        } else {
            window.emu.cpu.pc = addr >>> 0;
            this.log(`✓ PC set to 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "success");
        }
    }

    // ========== MEMORY COMMANDS ==========
    
    dumpMemory(addr = 0, len = 256) {
        if (!window.emu?.hw?.miu) {
            this.log("❌ Memory not initialized", "error");
            return;
        }

        this.log(`━━━ MEMORY DUMP @ 0x${addr.toString(16).toUpperCase().padStart(8, '0')} ━━━`, "memory");
        
        for (let i = 0; i < len; i += 16) {
            let line = `0x${(addr + i).toString(16).toUpperCase().padStart(8, '0')}: `;
            let ascii = "";

            for (let j = 0; j < 16 && i + j < len; j++) {
                try {
                    const byte = window.emu.hw.miu.readU8(addr + i + j);
                    line += byte.toString(16).padStart(2, '0').toUpperCase() + " ";
                    ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";
                } catch {
                    line += "?? ";
                    ascii += "?";
                }
            }

            this.log(`${line}  ${ascii}`, "memory");
        }
    }

    readMemory(addr) {
        if (!window.emu?.hw?.miu) {
            this.log("❌ Memory not initialized", "error");
            return;
        }

        try {
            const val = window.emu.hw.miu.readU8(addr);
            this.log(`0x${addr.toString(16).toUpperCase().padStart(8, '0')}: 0x${val.toString(16).padStart(2, '0').toUpperCase()} (${val})`, "memory");
        } catch (e) {
            this.log(`❌ Cannot read address: ${e.message}`, "error");
        }
    }

    writeMemory(addr, val) {
        if (!window.emu?.hw?.miu) {
            this.log("❌ Memory not initialized", "error");
            return;
        }

        try {
            window.emu.hw.miu.writeU8(addr, val & 0xFF);
            this.log(`✓ Write 0x${(val & 0xFF).toString(16).padStart(2, '0').toUpperCase()} to 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "success");
        } catch (e) {
            this.log(`❌ Cannot write: ${e.message}`, "error");
        }
    }

    searchMemory(pattern) {
        this.log("⚠️ Memory search not yet implemented", "warning");
    }

    addMemoryWatch(addr) {
        this.memoryWatches.set(addr, { address: addr, oldValue: null });
        this.log(`✓ Memory watch added at 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "success");
    }

    removeMemoryWatch(addr) {
        if (this.memoryWatches.delete(addr)) {
            this.log(`✓ Memory watch removed`, "success");
        }
    }

    showMemoryWatches() {
        if (this.memoryWatches.size === 0) {
            this.log("No memory watches active", "info");
            return;
        }

        this.log("━━━ MEMORY WATCHES ━━━", "warning");
        this.memoryWatches.forEach((watch, addr) => {
            try {
                const val = window.emu.hw.miu.readU8(addr);
                const changed = watch.oldValue !== null && watch.oldValue !== val;
                const marker = changed ? "⚠️ " : "   ";
                this.log(`${marker}0x${addr.toString(16).toUpperCase().padStart(8, '0')}: 0x${val.toString(16).padStart(2, '0').toUpperCase()}`, changed ? "warning" : "info");
                watch.oldValue = val;
            } catch (e) {
                this.log(`0x${addr.toString(16).toUpperCase().padStart(8, '0')}: ERROR`, "error");
            }
        });
    }

    // ========== VDU COMMANDS ==========
    
    dumpVDU() {
        if (!window.emu?.peripherals?.vdu) {
            this.log("❌ VDU not initialized", "error");
            return;
        }

        this.log("━━━ VDU STATE ━━━", "info");
        this.dumpObject(window.emu.peripherals.vdu, 1);
    }

    dumpVDUMemory(addr = 0, len = 256) {
        this.log("⚠️ VDU memory dump not implemented", "warning");
    }
// ========== SPU COMMANDS v4.0 ==========

dumpSPU() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    this.log("━━━ SOUND PROCESSING UNIT v4.0 ━━━", "success");
    this.dumpObject(window.emu.peripherals.spu, 1);
}

playSPUNote(frequency = 440) {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const spu = window.emu.peripherals.spu;
    
    if (!spu.isAudioInitialized) {
        spu.initializeAudio();
        this.log("[SPU] Web Audio API inicializado", "info");
    }

    spu.noteOn(frequency, 0, 127);
    this.log(`🔊 Tocando: ${frequency}Hz`, "success");
}

stopSPUNote() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    window.emu.peripherals.spu.noteOff(0);
    this.log("⏹️ Nota parada", "info");
}

setSPUPreset(presetName) {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const presets = ['piano', 'violin', 'flute', 'bell', 'synth', 'bass', 'lead'];
    
    if (!presets.includes(presetName)) {
        this.log(`❌ Preset inválido. Válidos: ${presets.join(', ')}`, "error");
        return;
    }

    window.emu.peripherals.spu.loadPreset(presetName);
    this.log(`✓ Preset '${presetName}' carregado`, "success");
}

setSPUVolume(volume) {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    volume = Math.max(0, Math.min(1, volume));
    window.emu.peripherals.spu.setMasterVolume(volume);
    this.log(`🔊 Volume: ${(volume * 100).toFixed(1)}%`, "info");
}

toggleSPUMute() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const spu = window.emu.peripherals.spu;
    spu.toggleMute();
    const status = spu.mute ? "MUTED 🔇" : "UNMUTED 🔊";
    this.log(`SPU ${status}`, "info");
}

showSPUVoices() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const spu = window.emu.peripherals.spu;
    this.log("━━━ SPU VOICES STATUS ━━━", "success");

    spu.voices.forEach((voice, idx) => {
        if (voice.enabled || voice.envelopeValue > 0.001) {
            const marker = voice.enabled ? "🔊" : "🔇";
            const pitch = voice.pitch.toFixed(1).padStart(7, ' ');
            const wave = voice.waveform.padEnd(8);
            const env = voice.envelopeValue.toFixed(2);
            const phase = voice.envelopePhase.padEnd(8);
            
            this.log(
                `${marker} V${idx.toString().padStart(2, '0')}: ${pitch}Hz ${wave} [${phase}] Env:${env}`,
                voice.enabled ? "success" : "warning"
            );
        }
    });

    this.log(`\nVoices Ativos: ${spu.stats.voicesActive}/16`, "info");
}

showSPUStats() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const stats = window.emu.peripherals.spu.getDetailedStats();
    this.log("━━━ SPU STATISTICS ━━━", "success");
    this.dumpObject(stats, 2);
}

resetSPU() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    window.emu.peripherals.spu.reset();
    this.log("♻️ SPU resetado", "warning");
}

validateSPUConnection() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const spu = window.emu.peripherals.spu;
    const intC = window.emu.peripherals.intC;

    this.log("━━━ SPU CONNECTION STATUS ━━━", "info");
    this.log(`SPU Object:      ${spu ? "✅ EXISTS" : "❌ MISSING"}`, "success");
    this.log(`IntC Connected:  ${spu.intC ? "✅ YES" : "❌ NO"}`, spu.intC ? "success" : "error");
    this.log(`Audio Init:      ${spu.isAudioInitialized ? "✅ YES" : "❌ NO"}`, spu.isAudioInitialized ? "success" : "error");
    this.log(`Muted:           ${spu.mute ? "YES 🔇" : "NO 🔊"}`, spu.mute ? "warning" : "info");
    this.log(`Master Volume:   ${(spu.masterVolume * 100).toFixed(1)}%`, "info");
    this.log(`Voices Total:    16`, "info");
    this.log(`Voices Active:   ${spu.stats?.voicesActive || 0}`, "info");
}

testSPU() {
    if (!window.emu?.peripherals?.spu) {
        this.log("❌ SPU não inicializado", "error");
        return;
    }

    const spu = window.emu.peripherals.spu;
    
    if (!spu.isAudioInitialized) {
        spu.initializeAudio();
    }

    this.log("🎵 ===== TESTE SPU v4.0 ===== 🎵", "success");
    
    this.log("Teste 1: Escala Dó Maior", "info");
    const notes = [262, 294, 330, 349, 392, 440, 494, 523];
    const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
    
    let delay = 0;
    notes.forEach((freq, idx) => {
        setTimeout(() => {
            spu.noteOn(freq, idx % 16, 100);
            this.log(`  ▶ ${noteNames[idx]} (${freq}Hz)`, "memory");
        }, delay);
        
        setTimeout(() => {
            spu.noteOff(idx % 16);
        }, delay + 400);
        
        delay += 500;
    });

    setTimeout(() => {
        this.log("\nTeste 2: Acordes", "info");
        
        spu.noteOn(262, 0, 80);
        spu.noteOn(330, 1, 80);
        spu.noteOn(392, 2, 80);
        this.log("  ▶ Acorde C Maior", "memory");
        
        setTimeout(() => {
            spu.noteOff(0);
            spu.noteOff(1);
            spu.noteOff(2);
        }, 1000);
    }, delay);

    this.log("\n✓ Teste concluído em ~" + (delay / 1000).toFixed(1) + "s", "success");
}

// ========== INTERRUPT COMMANDS v4.0 ==========

showInterruptInfo() {
    if (!window.emu?.peripherals?.intC) {
        this.log("❌ Interrupt Controller não inicializado", "error");
        return;
    }

    const intC = window.emu.peripherals.intC;
    this.log("━━━ INTERRUPT CONTROLLER STATUS ━━━", "success");
    
    this.dumpObject(intC, 1);
}

enableInterrupt(irq) {
    if (!window.emu?.peripherals?.intC) {
        this.log("❌ Interrupt Controller não inicializado", "error");
        return;
    }

    const intC = window.emu.peripherals.intC;
    
    if (intC.enableIRQ) {
        intC.enableIRQ(irq);
        this.log(`✓ IRQ ${irq} habilitada`, "success");
    } else {
        this.log(`⚠️ enableIRQ() não disponível`, "warning");
    }
}

disableInterrupt(irq) {
    if (!window.emu?.peripherals?.intC) {
        this.log("❌ Interrupt Controller não inicializado", "error");
        return;
    }

    const intC = window.emu.peripherals.intC;
    
    if (intC.disableIRQ) {
        intC.disableIRQ(irq);
        this.log(`✓ IRQ ${irq} desabilitada`, "success");
    } else {
        this.log(`⚠️ disableIRQ() não disponível`, "warning");
    }
}

listInterrupts() {
    if (!window.emu?.peripherals?.intC) {
        this.log("❌ Interrupt Controller não inicializado", "error");
        return;
    }

    this.log("━━━ INTERRUPTS CONFIGURATION ━━━", "info");
    this.log("", "info");
    this.log("  IRQ 4:  V-Blank (VDU)", "info");
    this.log("  IRQ 5:  Timer", "info");
    this.log("  IRQ 6:  CDROM", "info");
    this.log("  IRQ 7:  UART", "info");
    this.log("  IRQ 10: Audio (SPU)", "info");
    this.log("", "info");
    
    const intC = window.emu.peripherals.intC;
    if (intC.dump) {
        this.log("[IntC State]", "info");
        const state = intC.dump?.();
        this.dumpObject(state, 2);
    }
}

triggerInterrupt(irq) {
    if (!window.emu?.peripherals?.intC || !window.emu.cpu) {
        this.log("❌ Interrupt Controller ou CPU não inicializado", "error");
        return;
    }

    const intC = window.emu.peripherals.intC;
    
    if (intC.trigger) {
        intC.trigger(window.emu.cpu, irq);
        this.log(`✓ IRQ ${irq} disparada manualmente`, "success");
    } else {
        this.log(`⚠️ trigger() não disponível`, "warning");
    }
}

// ========== EXECUTION CONTROL ==========

toggleRun() {
    if (!window.emu) {
        this.log("❌ Emulator not initialized", "error");
        return;
    }

    this.isRunning = !this.isRunning;
    
    if (this.isRunning) {
        if (window.emu.start) window.emu.start();
        this.log("▶️  Execution started", "success");
        if (this.statusLed) this.statusLed.classList.add("running");
    } else {
        if (window.emu.pause) window.emu.pause();
        this.log("⏸️  Execution paused", "warning");
        if (this.statusLed) this.statusLed.classList.remove("running");
    }
}

pause() {
    if (window.emu && window.emu.pause) {
        window.emu.pause();
        this.isRunning = false;
        this.log("⏸️  Execution paused", "warning");
        if (this.statusLed) this.statusLed.classList.remove("running");
    }
}

step() {
    if (window.emu && window.emu.step) {
        window.emu.step();
        this.log("➡️  Single step executed", "info");
        this.dumpRegisters();
    }
}

resetEngine() {
    if (window.emu && window.emu.reset) {
        window.emu.reset();
        this.isRunning = false;
        this.log("♻️  Engine reset", "warning");
        if (this.statusLed) this.statusLed.classList.remove("running");
    }
}

// ========== DEBUGGING COMMANDS ==========

toggleDebug() {
    window.__DEV__ = !window.__DEV__;
    if (window.emu) {
        window.emu.config.debugEnabled = window.__DEV__;
    }
    this.log(`🔧 Debug mode: ${window.__DEV__ ? "ENABLED 🟢" : "DISABLED 🔴"}`, "info");
}

setTrace(enabled) {
    window.__TRACE__ = enabled;
    if (window.emu) {
        window.emu.config.traceInstructions = enabled;
    }
    this.log(`📊 Instruction trace: ${enabled ? "ENABLED 🟢" : "DISABLED 🔴"}`, "info");
}

// ========== BREAKPOINTS ==========

addBreakpoint(addr) {
    this.breakpoints.add(addr);
    this.log(`🔴 Breakpoint added at 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "warning");
    
    if (window.emu?.debugger?.breakpoints) {
        window.emu.debugger.breakpoints.addBreakpoint(addr);
    }
}

removeBreakpoint(addr) {
    if (this.breakpoints.delete(addr)) {
        this.log(`✓ Breakpoint removed`, "success");
        if (window.emu?.debugger?.breakpoints) {
            window.emu.debugger.breakpoints.removeBreakpoint(addr);
        }
    }
}

listBreakpoints() {
    if (this.breakpoints.size === 0) {
        this.log("No breakpoints set", "info");
        return;
    }

    this.log("━━━ BREAKPOINTS ━━━", "warning");
    this.breakpoints.forEach(bp => {
        this.log(`  🔴 0x${bp.toString(16).toUpperCase().padStart(8, '0')}`, "warning");
    });
}

clearBreakpoints() {
    this.breakpoints.clear();
    if (window.emu?.debugger?.breakpoints) {
        window.emu.debugger.breakpoints.clearAll();
    }
    this.log("✓ All breakpoints cleared", "success");
}

// ========== REGISTER WATCHES ==========

addWatch(reg) {
    const regNum = parseInt(reg.replace('r', '')) || parseInt(reg);
    if (regNum >= 0 && regNum < 32) {
        this.watches.set(`r${regNum}`, { register: `r${regNum}`, enabled: true });
        this.log(`✓ Watch added for register r${regNum}`, "success");
    } else {
        this.log(`❌ Invalid register: ${reg}`, "error");
    }
}

removeWatch(reg) {
    const key = reg.toLowerCase();
    if (this.watches.delete(key)) {
        this.log(`✓ Watch removed for ${reg}`, "success");
    }
}

showWatches() {
    if (this.watches.size === 0) {
        this.log("No register watches active", "info");
        return;
    }

    this.log("━━━ REGISTER WATCHES ━━━", "info");
    if (window.emu?.cpu) {
        const cpu = window.emu.cpu;
        this.watches.forEach((watch, regName) => {
            const regNum = parseInt(regName.replace('r', ''));
            const value = cpu.r ? cpu.r[regNum] >>> 0 : "N/A";
            const hex = typeof value === 'number' ? `0x${value.toString(16).padStart(8, '0').toUpperCase()}` : value;
            this.log(`  ${regName.toUpperCase()}: ${hex}`, "info");
        });
    }
}

// ========== PERFORMANCE MONITORING ==========

showPerformance() {
    if (!window.emu) {
        this.log("❌ Emulator not initialized", "error");
        return;
    }

    const uptime = ((Date.now() - this.stats.startTime) / 1000).toFixed(2);
    const cpu = window.emu.cpu;
    const clock = window.emu.clock;

    this.log("━━━ PERFORMANCE STATS ━━━", "info");
    this.log(`Uptime:          ${uptime}s`, "info");
    this.log(`Status:          ${this.isRunning ? "RUNNING ▶️" : "PAUSED ⏸️"}`, "info");
    
    if (clock) {
        this.log(`FPS:             ${clock.actualFPS?.toFixed(2) || 0}`, "info");
        this.log(`Target MHz:      ${(clock.targetHz / 1000000).toFixed(2)}`, "info");
    }

    if (cpu) {
        const cpi = cpu.cycles && cpu.instructions ? (cpu.cycles / cpu.instructions).toFixed(3) : "N/A";
        const mips = cpu.cycles && clock ? ((cpu.instructions / (clock.lastFrameTime / 1000)) / 1000000).toFixed(2) : "N/A";
        
        this.log(`CPI:             ${cpi}`, "info");
        this.log(`MIPS:            ${mips}`, "info");
    }
}

resetPerf() {
    if (window.emu?.cpu) {
        window.emu.cpu.cycles = 0;
        window.emu.cpu.instructions = 0;
        this.stats.startTime = Date.now();
        this.log("✓ Performance counters reset", "success");
    }
}

// ========== PERIPHERALS ==========

dumpIO() {
    if (!window.emu?.hw?.io) {
        this.log("❌ I/O controller not initialized", "error");
        return;
    }

    this.log("━━━ I/O CONTROLLER ━━━", "info");
    this.dumpObject(window.emu.hw.io, 1);
}

showTimerInfo() {
    if (!window.emu?.peripherals?.timer) {
        this.log("❌ Timer not initialized", "error");
        return;
    }

    this.log("━━━ TIMER INFO ━━━", "info");
    this.dumpObject(window.emu.peripherals.timer, 1);
}

showHardwareStatus() {
    if (!window.emu?.hw) {
        this.log("❌ Hardware not available", "error");
        return;
    }

    const hw = window.emu.hw;
    this.log("━━━ HARDWARE STATUS ━━━", "success");
    this.log(`DRAM:    ${hw.dram ? "✅ Mapped" : "❌ Missing"}`, hw.dram ? "success" : "error");
    this.log(`FLASH:   ${hw.flash ? "✅ Mapped" : "❌ Missing"}`, hw.flash ? "success" : "error");
    this.log(`I/O:     ${hw.io ? "✅ Mapped" : "❌ Missing"}`, hw.io ? "success" : "error");
    this.log(`MIU:     ${hw.miu ? "✅ Connected" : "❌ Missing"}`, hw.miu ? "success" : "error");
    this.log(`BIOS:    ${hw.biosLoaded ? `✅ ${hw.biosName}` : "❌ Not loaded"}`, hw.biosLoaded ? "success" : "warning");
    this.log(`CDROM:   ${hw.cdromLoaded ? `✅ ${hw.cdromName}` : "❌ Not loaded"}`, hw.cdromLoaded ? "success" : "warning");
}

showPeripheralsStatus() {
    if (!window.emu?.peripherals) {
        this.log("❌ Peripherals not available", "error");
        return;
    }

    const p = window.emu.peripherals;
    this.log("━━━ PERIPHERALS STATUS ━━━", "success");
    this.log(`VDU:     ${p.vdu ? "✅ Online" : "❌ Offline"}`, p.vdu ? "success" : "error");
    this.log(`Timer:   ${p.timer ? "✅ Online" : "❌ Offline"}`, p.timer ? "success" : "error");
    this.log(`IntC:    ${p.intC ? "✅ Online" : "❌ Offline"}`, p.intC ? "success" : "error");
    this.log(`UART:    ${p.uart ? "✅ Online" : "❌ Offline"}`, p.uart ? "success" : "error");
    this.log(`SPU:     ${p.spu ? "✅ Online (v4.0)" : "❌ Offline"}`, p.spu ? "success" : "error");
    this.log(`CDROM:   ${p.cdrom ? "✅ Online (v4.0)" : "❌ Offline"}`, p.cdrom ? "success" : "error");
}

// ========== CDROM COMMANDS v4.0 ==========

dumpCDROM() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }
    
    this.log("━━━ CDROM CONTROLLER v4.0 ━━━", "success");
    const cdromInfo = window.emu.peripherals.cdrom.getInfo();
    this.dumpObject(cdromInfo, 2);
}

showCDROMStatus() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }
    
    const cdrom = window.emu.peripherals.cdrom;
    const status = cdrom.getStatus();
    
    this.log("", "info");
    status.split('\n').forEach(line => {
        this.log(line, "info");
    });
    this.log("", "info");
}

listCDROMFiles() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado ou mídia não carregada", "error");
        return;
    }
    
    const cdrom = window.emu.peripherals.cdrom;
    
    if (!cdrom.mediaLoaded) {
        this.log("⚠️ Nenhuma mídia carregada. Use 'cdrom.load' primeiro", "warning");
        return;
    }
    
    const files = cdrom.listFiles();
    
    if (files.length === 0) {
        this.log("Nenhum arquivo encontrado no disco", "info");
        return;
    }
    
    this.log("", "info");
    this.log("━━━ CDROM FILES ━━━", "success");
    this.log(`Total: ${files.length} arquivo(s)`, "info");
    this.log("", "info");
    
    files.forEach(f => {
        const type = f.isDirectory ? "📁" : "📄";
        const size = f.isDirectory ? "-" : `${(f.size / 1024).toFixed(2)} KB`;
        const sizeStr = size.padStart(12);
        const name = f.name.length > 40 ? f.name.substring(0, 37) + "..." : f.name;
        
        this.log(`${type} ${name.padEnd(40)} ${sizeStr}`, "info");
    });
    
    this.log("", "info");
}

readCDROMFile(filename) {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return null;
    }
    
    if (!filename) {
        this.log("❌ Forneça um nome de arquivo", "error");
        return null;
    }
    
    const cdrom = window.emu.peripherals.cdrom;
    const data = cdrom.readFile(filename);
    
    if (data) {
        this.log(`✓ Arquivo lido: ${filename}`, "success");
        this.log(`  Tamanho: ${(data.length / 1024).toFixed(2)} KB`, "info");
        this.log(`  Bytes: ${data.length}`, "info");
        return data;
    } else {
        this.log(`❌ Arquivo não encontrado: ${filename}`, "error");
        return null;
    }
}

loadCDROM() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.iso,.bin,.img';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        
        if (!file) {
            this.log("❌ Nenhum arquivo selecionado", "error");
            return;
        }
        
        this.log(`⏳ Carregando ${file.name}...`, "info");
        
        const cdrom = window.emu.peripherals.cdrom;
        const success = await cdrom.loadMedia(file);
        
        if (success) {
            this.log(`✓ ${file.name} carregado com sucesso!`, "success");
            this.log(`  Tamanho: ${(file.size / 1024 / 1024).toFixed(2)} MB`, "info");
            this.log(`  Arquivos: ${cdrom.iso9660?.fileEntries.size || 0}`, "info");
            this.log(`\nUse 'cdrom.list' para ver os arquivos`, "info");
        } else {
            this.log(`❌ Erro ao carregar ${file.name}`, "error");
        }
    };
    
    input.click();
}

dumpCDROMData(addr = 0, len = 256) {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }
    
    const cdrom = window.emu.peripherals.cdrom;
    
    if (!cdrom.mediaLoaded) {
        this.log("⚠️ Nenhuma mídia carregada", "warning");
        return;
    }
    
    this.log(`━━━ CDROM DATA @ 0x${addr.toString(16).toUpperCase().padStart(8, '0')} ━━━`, "memory");
    
    const view = new Uint8Array(cdrom.mediaData.buffer);
    
    for (let i = 0; i < len; i += 16) {
        let line = `0x${(addr + i).toString(16).toUpperCase().padStart(8, '0')}: `;
        let ascii = "";
        
        for (let j = 0; j < 16 && i + j < len; j++) {
            try {
                const byte = view[addr + i + j];
                if (byte !== undefined) {
                    line += byte.toString(16).padStart(2, '0').toUpperCase() + " ";
                    ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";
                } else {
                    line += "?? ";
                    ascii += "?";
                }
            } catch {
                line += "?? ";
                ascii += "?";
            }
        }
        
        this.log(`${line}  ${ascii}`, "memory");
    }
}

validateCDROMImage() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }
    
    const cdrom = window.emu.peripherals.cdrom;
    const result = cdrom.validateMedia();
    
    this.log("━━━ VALIDAÇÃO CDROM ━━━", "info");
    
    if (result.valid) {
        this.log(`✓ ${result.reason}`, "success");
        if (result.fileCount !== undefined) {
            this.log(`  Arquivos: ${result.fileCount}`, "info");
        }
    } else {
        this.log(`❌ ${result.reason}`, "error");
    }
}

showCDROMStats() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }
    
    const cdrom = window.emu.peripherals.cdrom;
    const stats = cdrom.getDetailedStats();
    
    this.log("━━━ CDROM STATISTICS ━━━", "success");
    this.log(`Mídia:              ${stats.enabled ? stats.mediaName : "Não carregada"}`, "info");
    this.log(`Tamanho:            ${(stats.mediaSize / 1024 / 1024).toFixed(2)} MB`, "info");
    this.log(`Setor Atual:        ${stats.currentSector}`, "info");
    this.log(`Total de Setores:   ${stats.totalSectors}`, "info");
    this.log(`Setores Lidos:      ${stats.sectorsRead}`, "info");
    this.log(`Bytes Lidos:        ${(stats.bytesRead / 1024).toFixed(2)} KB`, "info");
    this.log(`Transferências DMA: ${stats.dmaTransfers}`, "info");
    this.log(`Erros:              ${stats.errors}`, "info");
    this.log(`Comandos Exec:      ${stats.commandsExecuted}`, "info");
    this.log(`Arquivos ISO9660:   ${stats.iso9660Files}`, "info");
}

testCDROMIntegrity() {
    if (!window.emu?.peripherals?.cdrom) {
        this.log("❌ CDROM não inicializado", "error");
        return;
    }

    const cdrom = window.emu.peripherals.cdrom;
    
    if (!cdrom.mediaLoaded) {
        this.log("⚠️ Nenhuma mídia carregada", "warning");
        return;
    }

    this.log("━━━ TESTE DE INTEGRIDADE CDROM ━━━", "info");
    this.log("⏳ Testando mídia...", "warning");
    
    if (cdrom.testIntegrity) {
        const result = cdrom.testIntegrity();
        
        if (result.passed) {
            this.log(`✅ ${result.message}`, "success");
            this.log(`  CRC Checks: ${result.crcChecks}`, "info");
            this.log(`  Sectors Read: ${result.sectorsRead}`, "info");
        } else {
            this.log(`❌ ${result.message}`, "error");
            if (result.errors > 0) {
                this.log(`  Erros encontrados: ${result.errors}`, "error");
            }
        }
    } else {
        this.log("⚠️ testIntegrity() não disponível", "warning");
    }
}

// ========== ANALYSIS ==========

analyzeCallStack() {
    this.log("━━━ CALL STACK ANALYSIS ━━━", "info");
    if (this.callStack.length === 0) {
        this.log("Call stack is empty", "info");
    } else {
        this.callStack.forEach((frame, idx) => {
            this.log(`  [${idx}] 0x${frame.toString(16).toUpperCase().padStart(8, '0')}`, "info");
        });
    }
}

analyzeMemory() {
    if (!window.emu) {
        this.log("❌ Emulator not initialized", "error");
        return;
    }

    this.log("━━━ MEMORY ANALYSIS ━━━", "info");
    const hw = window.emu.hw;
    
    if (hw.dram) {
        const dramSize = hw.dram.size || hw.dram.buffer?.byteLength || 0;
        this.log(`DRAM Size:  ${(dramSize / 1024 / 1024).toFixed(2)} MB`, "info");
    }

    if (hw.flash) {
        const flashSize = hw.flash.size || hw.flash.buffer?.byteLength || 0;
        this.log(`Flash Size: ${(flashSize / 1024 / 1024).toFixed(2)} MB`, "info");
    }

    if (hw.io) {
        const ioSize = hw.io.size || 0;
        this.log(`I/O Size:   ${(ioSize / 1024).toFixed(2)} KB`, "info");
    }

    this.log(`Current PC: 0x${(window.emu.cpu?.pc >>> 0 || 0).toString(16).toUpperCase().padStart(8, '0')}`, "info");
}

analyzePerformance() {
    if (!window.emu) {
        this.log("❌ Emulator not initialized", "error");
        return;
    }

    const cpu = window.emu.cpu;
    const clock = window.emu.clock;

    this.log("━━━ PERFORMANCE ANALYSIS ━━━", "info");
    
    if (cpu && clock) {
        const cpi = cpu.cycles / cpu.instructions || 0;
        const mips = clock.lastFrameTime > 0 ? ((cpu.instructions / (clock.lastFrameTime / 1000)) / 1000000) : 0;
        const efficiency = (clock.actualFPS / 60) * 100;

        this.log(`CPI (Cycles/Instruction): ${cpi.toFixed(3)}`, "info");
        this.log(`MIPS (Million Instr/Sec): ${mips.toFixed(2)}`, "info");
        this.log(`Efficiency:               ${efficiency.toFixed(1)}%`, "info");
        this.log(`Target MHz:               ${(clock.targetHz / 1000000).toFixed(2)}`, "info");
        this.log(`Actual FPS:               ${clock.actualFPS?.toFixed(2) || 0}`, "info");
    }
}

// ========== MONITORING ==========

startMonitoring() {
    setInterval(() => {
        if (this.isRunning && window.emu?.clock) {
            const freq = window.emu.clock.targetHz / 1000000;
            if (this.freqDisplay) {
                this.freqDisplay.textContent = `${freq.toFixed(2)} MHz`;
            }
        }
    }, 500);

    setInterval(() => {
        if (this.memoryWatches.size > 0 && this.isRunning) {
            // Monitor watches
        }
    }, 1000);

    setInterval(() => {
        if (this.statusLed && this.isRunning) {
            this.statusLed.classList.add("running");
        } else if (this.statusLed) {
            this.statusLed.classList.remove("running");
        }
    }, 100);
}

// ========== UTILITY METHODS ==========

getEmulatorInfo() {
    if (!window.emu) return null;

    return {
        romLoaded: window.emu.hw?.romLoaded || false,
        romName: window.emu.hw?.romName || "None",
        state: window.emu.state,
        cpuPC: window.emu.cpu?.pc >>> 0,
        cpuCycles: window.emu.cpu?.cycles || 0,
        cpuInstructions: window.emu.cpu?.instructions || 0,
        fpsActual: window.emu.clock?.actualFPS || 0,
        clockTarget: window.emu.clock?.targetHz || 0,
        cpuInitialized: window.emu.cpu?.initialized || false,
        miuConnected: !!window.emu.cpu?.miu
    };
}

exportHistory() {
    return {
        timestamp: new Date().toISOString(),
        commands: this.history,
        totalCount: this.history.length
    };
}

clearHistory() {
    this.history = [];
    this.historyIndex = -1;
    this.log("✓ History cleared", "success");
}

getConsoleStatus() {
    return {
        isRunning: this.isRunning,
        commandsExecuted: this.stats.commandsExecuted,
        uptime: ((Date.now() - this.stats.startTime) / 1000).toFixed(2),
        breakpoints: this.breakpoints.size,
        watches: this.watches.size,
        memoryWatches: this.memoryWatches.size,
        debugMode: window.__DEV__,
        traceEnabled: window.__TRACE__ || false
    };
}

// ========== EMULATOR INTEGRATION ==========

integrateWithEmulator() {
    if (!window.emu) return;

    // Hook para breakpoints
    const originalStep = window.emu.step;
    if (originalStep) {
        window.emu.step = () => {
            originalStep.call(window.emu);
            
            if (this.breakpoints.has(window.emu.cpu?.pc)) {
                this.pause();
                this.log("🔴 BREAKPOINT HIT!", "error");
                this.dumpRegisters();
            }
        };
    }

    // Hook para mudanças de status
    if (!window.emu.onStatusChange) {
        window.emu.onStatusChange = (status) => {
            const led = document.getElementById("status-led");
            if (led) {
                led.className = `status-indicator ${status === "running" ? "running" : ""}`;
            }
        };
    }

    this.log("✓ Emulator integration successful", "success");
}

fullDump() {
    this.log("╔════════════════════════════════════════╗", "success");
    this.log("║        FULL SYSTEM STATE DUMP v4.0     ║", "success");
    this.log("╚════════════════════════════════════════╝", "success");
    
    this.showBootStatus();
    this.log("", "info");
    this.validateCPUInit();
    this.log("", "info");
    this.validateMIU();
    this.log("", "info");
    this.dumpRegisters();
    this.log("", "info");
    this.showDetailedStats();
    this.log("", "info");
    this.analyzePerformance();
}

} // FIM DA CLASSE LunaConsole

// ========== INITIALIZATION ==========

window.__startTime__ = Date.now();
window.__DEV__ = true;

const luna = new LunaConsole();
window.luna = luna;

if (window.emu) {
    luna.integrateWithEmulator();
} else {
    setTimeout(() => {
        if (window.emu) {
            luna.integrateWithEmulator();
        }
    }, 1000);
}

// ========== GLOBAL HELPER FUNCTIONS ==========

window.lunaLog = (msg, color = "#0f0") => {
    const colorMap = {
        "#0f0": "success", "#0a0": "success", "#f00": "error",
        "#ff0": "warning", "#0ff": "info", "#0af": "memory",
        "#f0f": "cpu", "#ccc": "default"
    };
    luna.log(msg, colorMap[color] || "default");
};

window.lunaDump = (obj, depth = 2) => { luna.dumpObject(obj, depth); };
window.lunaBreakpoint = (addr) => { luna.addBreakpoint(addr); };
window.lunaWatch = (reg) => { luna.addWatch(reg); };
window.lunaStep = () => { luna.step(); };
window.lunaRun = () => { luna.isRunning = false; luna.toggleRun(); };
window.lunaPause = () => { luna.pause(); };
window.lunaReset = () => { luna.resetEngine(); };
window.lunaStatus = () => { luna.showStatus(); };
window.lunaRegisters = () => { luna.dumpRegisters(); };
window.lunaMemory = (addr = 0, len = 256) => { luna.dumpMemory(addr, len); };
window.lunaDisasm = (addr = 0, lines = 10) => { luna.disassemble(addr, lines); };
window.lunaHelp = () => { luna.showHelp(); };
window.lunaInfo = () => { luna.showSystemInfo(); };
window.lunaPerf = () => { luna.showPerformance(); };
window.lunaFullDump = () => { luna.fullDump(); };
window.lunaConsoleStatus = () => { return luna.getConsoleStatus(); };
window.lunaBootStatus = () => { luna.showBootStatus(); };
window.lunaCPUValidate = () => { luna.validateCPUInit(); };
window.lunaMIUValidate = () => { luna.validateMIU(); };

// ========== SPU GLOBAL FUNCTIONS ==========

window.lunaSPUPlay = (frequency = 440) => { luna.playSPUNote(frequency); };
window.lunaSPUStop = () => { luna.stopSPUNote(); };
window.lunaSPUPreset = (name = "synth") => { luna.setSPUPreset(name); };
window.lunaSPUVolume = (percent = 100) => { luna.setSPUVolume(percent / 100); };
window.lunaSPUMute = () => { luna.toggleSPUMute(); };
window.lunaSPUVoices = () => { luna.showSPUVoices(); };
window.lunaSPUTest = () => { luna.testSPU(); };
window.lunaSPUStats = () => { luna.showSPUStats(); };
window.lunaSPUValidate = () => { luna.validateSPUConnection(); };

// ========== INTERRUPT GLOBAL FUNCTIONS ==========

window.lunaIntInfo = () => { luna.showInterruptInfo(); };
window.lunaIntEnable = (irq) => { luna.enableInterrupt(irq); };
window.lunaIntDisable = (irq) => { luna.disableInterrupt(irq); };
window.lunaIntList = () => { luna.listInterrupts(); };
window.lunaIntTrigger = (irq) => { luna.triggerInterrupt(irq); };

// ========== CDROM GLOBAL FUNCTIONS ==========

window.lunaCDROMLoad = () => { luna.loadCDROM(); };
window.lunaCDROMList = () => { luna.listCDROMFiles(); };
window.lunaCDROMRead = (filename) => { luna.readCDROMFile(filename); };
window.lunaCDROMStatus = () => { luna.showCDROMStatus(); };
window.lunaCDROMValidate = () => { luna.validateCDROMImage(); };
window.lunaCDROMStats = () => { luna.showCDROMStats(); };
window.lunaCDROMTest = () => { luna.testCDROMIntegrity(); };

// ========== REAL-TIME MONITORING ==========

setInterval(() => {
    const clock = window.emu?.clock;
    const freqDisplay = document.getElementById("cpu-freq-display");
    
    if (freqDisplay && clock) {
        const mhz = (clock.targetHz / 1000000).toFixed(2);
        freqDisplay.textContent = `${mhz} MHz`;
    }

    const led = document.getElementById("status-led");
    if (led && luna.isRunning) {
        led.classList.add("running");
    } else if (led) {
        led.classList.remove("running");
    }
}, 100);

// ========== BOOT MESSAGE ==========

setTimeout(() => {
    if (window.emu) {
        luna.log("", "info");
        luna.log("✓ System initialized successfully!", "success");
        luna.log("Emulator Version: HyperScan v4.0 + Luna v3.0", "info");
        luna.log("Type 'help' to see all available commands", "info");
        luna.log("Type 'boot.status' to check boot sequence", "info");
        luna.log("Type 'spu.test' to test audio system", "info");
    }
}, 500);

console.log("%c✓ LunaConsole v3.0 Loaded & Ready", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c✓ Main v4.0 Compatible", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c✓ SPU v4.0 Integration Complete", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c✓ CDROM v4.0 Support Ready", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c✓ Boot Monitoring Enabled", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c📚 Global Functions Available:", "color: #0af; font-weight: bold;");
console.log("lunaLog(), lunaDump(), lunaStep(), lunaRun(), lunaPause(), lunaReset(),");
console.log("lunaStatus(), lunaRegisters(), lunaMemory(), lunaDisasm(), lunaHelp(), lunaPerf(),");
console.log("lunaBreakpoint(), lunaWatch(), lunaFullDump(), lunaConsoleStatus(),");
console.log("lunaBootStatus(), lunaCPUValidate(), lunaMIUValidate(),");
console.log("lunaSPUPlay(), lunaSPUStop(), lunaSPUPreset(), lunaSPUVolume(),");
console.log("lunaSPUMute(), lunaSPUVoices(), lunaSPUTest(), lunaSPUStats(), lunaSPUValidate(),");
console.log("lunaIntInfo(), lunaIntEnable(), lunaIntDisable(), lunaIntList(), lunaIntTrigger(),");
console.log("lunaCDROMLoad(), lunaCDROMList(), lunaCDROMRead(), lunaCDROMStatus(),");
console.log("lunaCDROMValidate(), lunaCDROMStats(), lunaCDROMTest()");

window.LunaConsole = LunaConsole;
window.luna = luna;

// ========== VERSION INFO ==========
const LUNA_VERSION = {
    version: "3.0",
    date: "2025-01-06",
    compatible: "MAIN v4.0",
    features: [
        "Boot sequence monitoring",
        "CPU initialization validation",
        "MIU synchronization checks",
        "SPU v4.0 16-voice support",
        "CDROM v4.0 ISO9660+UDF",
        "Interrupt controller debugging",
        "Full command help system",
        "Real-time performance monitoring",
        "Advanced breakpoint system",
        "Register watch tracking",
        "Memory dump & analysis",
        "Audio test suite",
        "CDROM integrity testing",
        "Full emulator integration",
        "Keyboard shortcuts (Ctrl+H)",
        "Hardware status display",
        "Peripherals monitoring",
        "Call stack analysis"
    ]
};

window.LUNA_VERSION = LUNA_VERSION;

console.log("%c╔════════════════════════════════════════════════════════════╗", "color: #0f0;");
console.log("%c║  🎮 LunaConsole v3.0 - FULLY COMPATIBLE WITH MAIN v4.0  🎮║", "color: #0f0; font-weight: bold;");
console.log("%c║           ✅ Boot Sequence Monitoring Enabled              ║", "color: #0f0; font-weight: bold;");
console.log("%c║           ✅ CPU Initialization Validation Ready           ║", "color: #0f0; font-weight: bold;");
console.log("%c║           ✅ SPU v4.0 + CDROM v4.0 Support                 ║", "color: #0f0; font-weight: bold;");
console.log("%c╚════════════════════════════════════════════════════════════╝", "color: #0f0;");

console.log("%c[SUCCESS] LunaConsole v3.0 inicializado com sucesso!", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c[READY] Sistema aguardando entrada do usuário...", "color: #0af; font-size: 12px;");
console.log("%c[HINT] Type 'help' for complete command list", "color: #ff0;");
console.log("%c[HINT] Type 'boot.status' to monitor boot sequence", "color: #ff0;");
console.log("%c[HINT] Press Ctrl+H for keyboard shortcuts", "color: #ff0;");

// ========== END OF LunaConsole v3.0 ===========