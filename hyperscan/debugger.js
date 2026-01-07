/**
 * Debugger Profissional Hyperscan
 * Integração completa: CPU + Disassembler + UI
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: debugger.cpp, debugger.h (C++ original)
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * PARTE 1: State Management & Command Parser
 * PARTE 2: Breakpoints, Watchpoints, Tracepoints
 * PARTE 3: Register & Memory Views
 * PARTE 4: Disassembly & Code Navigation
 * PARTE 5: Console & Command Execution
 */

"use strict";

// ========== PARTE 1: GERENCIADOR DE ESTADO ==========

class DebuggerState {
    constructor() {
        this.running = false;
        this.paused = true;
        this.singleStep = false;
        this.stepCount = 0;
        this.executionMode = "stopped"; // stopped, running, paused, stepping

        // Histórico de execução
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 100;

        // Configurações de view
        this.currentView = "registers"; // registers, memory, stack, code
        this.memoryViewAddress = 0xA0000000;
        this.stackViewAddress = 0;
        this.codeViewAddress = 0;

        // Registadores observados
        this.watchedRegisters = new Set([0, 1, 2, 3, 29, 30, 31]); // r0, r1, r2, r3, r29, r30, r31
    }

    recordState(cpu) {
        const state = {
            pc: cpu.pc,
            registers: Array.from(cpu.r),
            flags: {
                N: cpu.N, Z: cpu.Z, C: cpu.C, V: cpu.V, T: cpu.T
            },
            timestamp: Date.now(),
            stepNumber: this.stepCount
        };

        this.history.push(state);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
    }

    getHistory(index) {
        if (index >= 0 && index < this.history.length) {
            return this.history[index];
        }
        return null;
    }
}

// ========== PARTE 2: BREAKPOINTS, WATCHPOINTS, TRACEPOINTS ==========

class BreakpointManager {
    constructor() {
        // address -> { enabled: bool, oneShot: bool, condition: func, hitCount: int }
        this.breakpoints = new Map();
        // register -> { oldValue: uint32, enabled: bool }
        this.watchpoints = new Map();
        // Tracepoints: log automático
        this.tracepoints = new Map();

        this.stats = {
            breakpointsHit: 0,
            watchpointsTriggered: 0,
            tracepointsCalled: 0
        };
    }

    /**
     * Adiciona breakpoint
     */
    addBreakpoint(address, oneShot = false, condition = null) {
        this.breakpoints.set(address, {
            enabled: true,
            oneShot: oneShot,
            condition: condition || (() => true),
            hitCount: 0
        });
        return address;
    }

    /**
     * Remove breakpoint
     */
    removeBreakpoint(address) {
        return this.breakpoints.delete(address);
    }

    /**
     * Ativa/desativa breakpoint
     */
    toggleBreakpoint(address) {
        if (this.breakpoints.has(address)) {
            const bp = this.breakpoints.get(address);
            bp.enabled = !bp.enabled;
            return bp.enabled;
        }
        return false;
    }

    /**
     * Verifica breakpoint no endereço atual
     */
    checkBreakpoint(cpu) {
        if (!this.breakpoints.has(cpu.pc)) {
            return { hit: false };
        }

        const bp = this.breakpoints.get(cpu.pc);
        if (!bp.enabled) return { hit: false };

        if (!bp.condition(cpu)) {
            return { hit: false };
        }

        bp.hitCount++;
        this.stats.breakpointsHit++;

        if (bp.oneShot) {
            this.breakpoints.delete(cpu.pc);
        }

        return {
            hit: true,
            address: cpu.pc,
            hitCount: bp.hitCount,
            oneShot: bp.oneShot
        };
    }

    /**
     * Adiciona watchpoint (monitora registrador)
     */
    addWatchpoint(registerIndex) {
        if (registerIndex >= 0 && registerIndex < 32) {
            this.watchpoints.set(registerIndex, {
                oldValue: 0,
                enabled: true
            });
            return true;
        }
        return false;
    }

    /**
     * Verifica watchpoint
     */
    checkWatchpoint(cpu) {
        const changed = [];

        for (const [regIdx, watch] of this.watchpoints.entries()) {
            if (!watch.enabled) continue;

            const currentValue = cpu.r[regIdx] >>> 0;
            if (currentValue !== watch.oldValue) {
                changed.push({
                    register: regIdx,
                    oldValue: watch.oldValue,
                    newValue: currentValue
                });
                watch.oldValue = currentValue;
                this.stats.watchpointsTriggered++;
            }
        }

        return changed;
    }

    /**
     * Adiciona tracepoint (log automático)
     */
    addTracepoint(address, message) {
        this.tracepoints.set(address, {
            enabled: true,
            message: message,
            callCount: 0
        });
    }

    /**
     * Verifica tracepoint
     */
    checkTracepoint(cpu) {
        if (!this.tracepoints.has(cpu.pc)) {
            return null;
        }

        const tp = this.tracepoints.get(cpu.pc);
        if (!tp.enabled) return null;

        tp.callCount++;
        this.stats.tracepointsCalled++;

        return {
            address: cpu.pc,
            message: tp.message,
            callCount: tp.callCount
        };
    }

    /**
     * Lista todos os breakpoints
     */
    listBreakpoints() {
        const list = [];
        for (const [addr, bp] of this.breakpoints.entries()) {
            list.push({
                address: addr,
                enabled: bp.enabled,
                oneShot: bp.oneShot,
                hitCount: bp.hitCount
            });
        }
        return list;
    }

    /**
     * Lista todos os watchpoints
     */
    listWatchpoints() {
        const list = [];
        for (const [regIdx, watch] of this.watchpoints.entries()) {
            list.push({
                register: regIdx,
                currentValue: watch.oldValue,
                enabled: watch.enabled
            });
        }
        return list;
    }

    clearAll() {
        this.breakpoints.clear();
        this.watchpoints.clear();
        this.tracepoints.clear();
    }
}

// ========== PARTE 3: INSPETOR DE REGISTADORES E MEMÓRIA ==========

class RegisterView {
    constructor(cpu) {
        this.cpu = cpu;
    }

    /**
     * Retorna estado de um registrador
     */
    getRegister(index) {
        if (index >= 0 && index < 32) {
            return this.cpu.r[index] >>> 0;
        }
        return null;
    }

    /**
     * Define valor de registrador
     */
    setRegister(index, value) {
        if (index >= 0 && index < 32) {
            this.cpu.r[index] = value >>> 0;
            return true;
        }
        return false;
    }

    /**
     * Retorna todos os registradores em formato legível
     */
    getAllRegisters() {
        const regs = [];
        for (let i = 0; i < 32; i++) {
            regs.push({
                name: `r${i}`,
                index: i,
                value: this.cpu.r[i] >>> 0,
                hex: `0x${(this.cpu.r[i] >>> 0).toString(16).padStart(8, '0').toUpperCase()}`,
                signed: this.cpu.r[i] | 0
            });
        }
        return regs;
    }

    /**
     * Retorna flags de status
     */
    getFlags() {
        return {
            N: this.cpu.N,
            Z: this.cpu.Z,
            C: this.cpu.C,
            V: this.cpu.V,
            T: this.cpu.T
        };
    }

    /**
     * Retorna registrador de sistema
     */
    getSystemRegister(index) {
        if (index >= 0 && index < 32) {
            return this.cpu.sr[index] >>> 0;
        }
        return null;
    }

    /**
     * Retorna registrador de controle
     */
    getControlRegister(index) {
        if (index >= 0 && index < 32) {
            return this.cpu.cr[index] >>> 0;
        }
        return null;
    }
}

class MemoryView {
    constructor(cpu) {
        this.cpu = cpu;
    }

    /**
     * Lê byte
     */
    readByte(address) {
        if (this.cpu.miu) {
            return this.cpu.miu.readU8(address);
        }
        return 0;
    }

    /**
     * Lê halfword (16-bit)
     */
    readHalfword(address) {
        if (this.cpu.miu) {
            return this.cpu.miu.readU16(address);
        }
        return 0;
    }

    /**
     * Lê word (32-bit)
     */
    readWord(address) {
        if (this.cpu.miu) {
            return this.cpu.miu.readU32(address) >>> 0;
        }
        return 0;
    }

    /**
     * Escreve byte
     */
    writeByte(address, value) {
        if (this.cpu.miu) {
            this.cpu.miu.writeU8(address, value & 0xFF);
            return true;
        }
        return false;
    }

    /**
     * Escreve halfword
     */
    writeHalfword(address, value) {
        if (this.cpu.miu) {
            this.cpu.miu.writeU16(address, value & 0xFFFF);
            return true;
        }
        return false;
    }

    /**
     * Escreve word
     */
    writeWord(address, value) {
        if (this.cpu.miu) {
            this.cpu.miu.writeU32(address, value >>> 0);
            return true;
        }
        return false;
    }

    /**
     * Dump de memória (hexdump)
     */
    hexdump(startAddr, size = 256) {
        const lines = [];
        let addr = startAddr & ~0x0F;

        for (let i = 0; i < size; i += 16) {
            let line = `${addr.toString(16).padStart(8, '0').toUpperCase()}: `;
            let ascii = "";

            for (let j = 0; j < 16; j++) {
                const byte = this.readByte(addr + j);
                line += byte.toString(16).padStart(2, '0').toUpperCase() + " ";
                ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";
            }

            line += " | " + ascii;
            lines.push(line);
            addr += 16;
        }

        return lines.join("\n");
    }

    /**
     * Retorna visualização de stack
     */
    getStackView(stackPointer, depth = 8) {
        const stack = [];
        let addr = stackPointer;

        for (let i = 0; i < depth; i++) {
            stack.push({
                address: addr,
                value: this.readWord(addr) >>> 0,
                hex: `0x${(this.readWord(addr) >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
            });
            addr += 4;
        }

        return stack;
    }
}

// ========== PARTE 4: DISASSEMBLY E NAVEGAÇÃO ==========

class CodeView {
    constructor(cpu, disassembler) {
        this.cpu = cpu;
        this.disassembler = disassembler;
    }

    /**
     * Retorna instrução no endereço
     */
    getInstruction(address) {
        if (this.disassembler) {
            return this.disassembler.disasmAt(address);
        }
        return null;
    }

    /**
     * Retorna bloco de código
     */
    getCodeBlock(startAddr, instructionCount = 10) {
        const instructions = [];
        let addr = startAddr;

        for (let i = 0; i < instructionCount; i++) {
            const insn = this.getInstruction(addr);
            if (!insn) break;

            instructions.push({
                ...insn,
                isCurrentPC: (addr === this.cpu.pc),
                hasBreakpoint: false
            });

            addr += insn.bytes;
        }

        return instructions;
    }

    /**
     * Retorna instrução anterior
     */
    getPreviousInstruction(address) {
        const prevAddr = Math.max(0, address - 4);
        return this.getInstruction(prevAddr);
    }

    /**
     * Retorna próxima instrução
     */
    getNextInstruction(address) {
        const insn = this.getInstruction(address);
        if (insn) {
            return this.getInstruction(address + insn.bytes);
        }
        return null;
    }
}

// ========== PARTE 5: PARSER DE COMANDOS ==========

class CommandParser {
    constructor() {
        this.commands = new Map();
        this.aliases = new Map();
    }

    /**
     * Registra comando
     */
    register(name, handler, description = "") {
        this.commands.set(name, { handler, description });
    }

    /**
     * Cria alias
     */
    alias(shortName, fullName) {
        this.aliases.set(shortName, fullName);
    }

    /**
     * Executa comando
     */
    execute(input, dbgInstance) {
        const parts = input.trim().split(/\s+/);
        const cmdName = parts[0];
        const args = parts.slice(1);

        // Resolve alias
        const realCmd = this.aliases.get(cmdName) || cmdName;

        if (!this.commands.has(realCmd)) {
            return { error: `Unknown command: ${cmdName}` };
        }

        const cmd = this.commands.get(realCmd);
        try {
            return cmd.handler(args, dbgInstance);
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Lista todos os comandos
     */
    help() {
        const help = [];
        for (const [name, cmd] of this.commands.entries()) {
            help.push(`${name.padEnd(12)} - ${cmd.description}`);
        }
        return help.join("\n");
    }
}

// ========== PARTE 6: DEBUGGER PRINCIPAL ==========

class HyperscanDebugger {
    constructor(cpu, disassembler) {
        this.cpu = cpu;
        this.disassembler = disassembler;

        // Sub-módulos
        this.state = new DebuggerState();
        this.breakpoints = new BreakpointManager();
        this.registers = new RegisterView(cpu);
        this.memory = new MemoryView(cpu);
        this.code = new CodeView(cpu, disassembler);

        // Parser de comandos
        this.cmdParser = new CommandParser();
        this._setupCommands();

        // Callbacks
        this.onBreakpoint = null;
        this.onStep = null;
        this.onWatchpoint = null;
    }

    // ========== SETUP DE COMANDOS ==========

    _setupCommands() {
        // Continue
        this.cmdParser.register(
            "continue",
            (args, dbg) => {
                dbg.state.running = true;
                dbg.state.paused = false;
                return "Continuing execution...";
            },
            "Resume execution"
        );

        this.cmdParser.alias("c", "continue");
        this.cmdParser.alias("cont", "continue");

        // Breakpoint
        this.cmdParser.register(
            "break",
            (args, dbg) => {
                if (args.length === 0) {
                    return { list: dbg.breakpoints.listBreakpoints() };
                }

                const addr = dbg._parseAddress(args[0]);
                dbg.breakpoints.addBreakpoint(addr);

                return `Breakpoint added at 0x${addr.toString(16).toUpperCase()}`;
            },
            "Set breakpoint: break <address>"
        );

        this.cmdParser.alias("b", "break");
        this.cmdParser.alias("bp", "break");

        // Step
        this.cmdParser.register(
            "step",
            (args, dbg) => {
                const count = parseInt(args[0], 10) || 1;

                for (let i = 0; i < count; i++) {
                    dbg.cpu.step();
                    dbg.state.stepCount++;
                    dbg.state.recordState(dbg.cpu);
                }

                return `Stepped ${count} instruction(s)`;
            },
            "Step N instructions: step [count]"
        );

        this.cmdParser.alias("s", "step");

        // Registradores
        this.cmdParser.register("registers", (args, dbg) => {
            return dbg.registers.getAllRegisters();
        }, "Show all registers");

        this.cmdParser.alias("r", "registers");
        this.cmdParser.alias("reg", "registers");

        this.cmdParser.register("set", (args, dbg) => {
            if (args.length < 2) return { error: "Usage: set <register> <value>" };
            const regMatch = args[0].match(/r(\d+)/);
            if (!regMatch) return { error: "Invalid register" };
            const regIdx = parseInt(regMatch[1]);
            const value = parseInt(args[1], 16) || 0;
            dbg.registers.setRegister(regIdx, value);
            return `Set r${regIdx} = 0x${value.toString(16).toUpperCase()}`;
        }, "Set register: set r<N> <value>");

        // Memória
        this.cmdParser.register("memory", (args, dbg) => {
            const addr = args.length > 0 ? dbg._parseAddress(args[0]) : dbg.cpu.pc;
            const size = args.length > 1 ? parseInt(args[1]) : 64;
            return dbg.memory.hexdump(addr, size);
        }, "Dump memory: memory [address] [size]");

        this.cmdParser.alias("m", "memory");
        this.cmdParser.alias("dump", "memory");

        this.cmdParser.register("stack", (args, dbg) => {
            const sp = dbg.cpu.r[29] >>> 0;
            const depth = args.length > 0 ? parseInt(args[0]) : 8;
            return dbg.memory.getStackView(sp, depth);
        }, "Show stack: stack [depth]");

        // Disassembly
        this.cmdParser.register("disasm", (args, dbg) => {
            const addr = args.length > 0 ? dbg._parseAddress(args[0]) : dbg.cpu.pc;
            const count = args.length > 1 ? parseInt(args[1]) : 10;
            return dbg.code.getCodeBlock(addr, count);
        }, "Disassemble: disasm [address] [count]");

        this.cmdParser.alias("d", "disasm");

        // Info
        this.cmdParser.register("info", (args, dbg) => {
            if (args.length === 0) {
                return {
                    pc: `0x${dbg.cpu.pc.toString(16).toUpperCase()}`,
                    flags: dbg.registers.getFlags(),
                    running: dbg.state.running,
                    stepCount: dbg.state.stepCount
                };
            }

            const type = args[0];
            switch (type) {
                case "breakpoints":
                    return dbg.breakpoints.listBreakpoints();
                case "watchpoints":
                    return dbg.breakpoints.listWatchpoints();
                case "registers":
                    return dbg.registers.getAllRegisters();
                default:
                    return { error: `Unknown info type: ${type}` };
            }
        }, "Show info: info [type]");

        this.cmdParser.alias("i", "info");

        // Watchpoint
        this.cmdParser.register("watch", (args, dbg) => {
            if (args.length === 0) {
                return { list: dbg.breakpoints.listWatchpoints() };
            }
            const regMatch = args[0].match(/r(\d+)/);
            if (!regMatch) return { error: "Usage: watch r<N>" };
            const regIdx = parseInt(regMatch[1]);
            dbg.breakpoints.addWatchpoint(regIdx);
            return `Watchpoint added for r${regIdx}`;
        }, "Watch register: watch r<N>");

        // Help
        this.cmdParser.register("help", (args, dbg) => {
            return dbg.cmdParser.help();
        }, "Show help");

        this.cmdParser.alias("h", "help");
        this.cmdParser.alias("?", "help");
    }

    /**
     * Parseia endereço ou registrador
     */
    _parseAddress(str) {
        if (!str) return this.cpu.pc;

        const regMatch = str.match(/r(\d+)/);
        if (regMatch) {
            const idx = parseInt(regMatch[1]);
            if (idx >= 0 && idx < 32) {
                return this.cpu.r[idx] >>> 0;
            }
        }

        const addr = parseInt(str, 16) || parseInt(str, 10);
        return addr >>> 0;
    }

    // ========== MÉTODOS PRINCIPAIS ==========

    /**
     * Executa um passo
     */
    step() {
        const tp = this.breakpoints.checkTracepoint(this.cpu);
        if (tp && this.onStep) {
            this.onStep({ type: "tracepoint", ...tp });
        }

        this.cpu.step();
        this.state.stepCount++;
        this.state.recordState(this.cpu);

        const bp = this.breakpoints.checkBreakpoint(this.cpu);
        if (bp.hit) {
            this.state.paused = true;
            this.state.running = false;
            if (this.onBreakpoint) {
                this.onBreakpoint(bp);
            }
            return bp;
        }

        const watches = this.breakpoints.checkWatchpoint(this.cpu);
        if (watches.length > 0) {
            if (this.onWatchpoint) {
                this.onWatchpoint(watches);
            }
        }

        return null;
    }

    /**
     * Executa até breakpoint ou fim
     */
    run(maxSteps = 1000000) {
        let steps = 0;
        while (steps < maxSteps && this.state.running) {
            const bp = this.step();
            if (bp) break;
            steps++;
        }
        return { stepsExecuted: steps };
    }

    /**
     * Executa comando
     */
    execute(input) {
        return this.cmdParser.execute(input, this);
    }

    /**
     * Retorna estado atual
     */
    getState() {
        return {
            pc: this.cpu.pc,
            flags: this.registers.getFlags(),
            registers: this.registers.getAllRegisters(),
            running: this.state.running,
            paused: this.state.paused,
            stepCount: this.state.stepCount,
            currentInstruction: this.code.getInstruction(this.cpu.pc)
        };
    }

    /**
     * Reseta debugger
     */
    reset() {
        this.cpu.reset();
        this.state = new DebuggerState();
        this.breakpoints.clearAll();
    }
}

// ========== EXPORTAÇÃO ==========

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HyperscanDebugger,
        BreakpointManager,
        RegisterView,
        MemoryView,
        CodeView,
        DebuggerState,
        CommandParser
    };
}

if (typeof window !== 'undefined') {
    window.HyperscanDebugger = HyperscanDebugger;
    window.BreakpointManager = BreakpointManager;
    window.RegisterView = RegisterView;
    window.MemoryView = MemoryView;
    window.CodeView = CodeView;
    window.DebuggerState = DebuggerState;
    window.CommandParser = CommandParser;
}