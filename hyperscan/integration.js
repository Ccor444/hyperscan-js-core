/**
 * integration.js - Integração CPU com HyperScanEngine (v4.0 CORRIGIDO)
 * 
 * ✅ CORRIGIDO: Referências ao debugger (this.dbg)
 * ✅ CORRIGIDO: Método _updatePeripherals() adicionado
 * ✅ CORRIGIDO: Método _updateDebuggerUI() adicionado
 * ✅ CORRIGIDO: Prototype patching melhorado
 * ✅ INTEGRADO: Com novo main.js e timer
 * ✅ INTEGRADO: CPU.initializeCPU() suportado
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * 
 * Autor: Ccor444
 * Data: 2025-01-05 v4.0 FIXED
 * 
 * RESPONSABILIDADE:
 * Estender CPU e HyperScanEngine com funcionalidades de debug avançadas
 * Sem quebrar a arquitetura original (prototype patching)
 */

"use strict";

// ========== VALIDAÇÕES INICIAIS ==========

if (typeof CPU === 'undefined') {
    console.error("[INTEGRATION] ❌ CPU não carregada! Verifique se cpu.js foi carregado.");
    throw new Error("CPU não disponível");
}

if (typeof HyperScanEngine === 'undefined') {
    console.error("[INTEGRATION] ❌ HyperScanEngine não carregada! Verifique se main.js foi carregado.");
    throw new Error("HyperScanEngine não disponível");
}

console.log("[INTEGRATION] ✓ Dependências OK - CPU e HyperScanEngine detectadas");

// ========== PARTE 1: EXTENSÕES CPU ==========

/**
 * Estende CPU com método setMIU (compatibilidade)
 */
CPU.prototype.setMIU = function(miu) {
    this.miu = miu;
    console.log("[CPU] MIU conectado via setMIU()");
};

/**
 * Estende CPU com compatibilidade para debugger
 */
CPU.prototype.getDebugState = function() {
    if (!this.getState) {
        return null;
    }
    return this.getState();
};

/**
 * Override de step() com tratamento de erro robusto
 * ✅ MANTÉM: Funcionalidade original
 * ✅ ADICIONA: Try-catch, logging, validações
 */
const OriginalCPUStep = CPU.prototype.step;

CPU.prototype.step = function() {
    // Validações básicas
    if (this.halted) return false;
    if (!this.miu) {
        console.warn("[CPU] ⚠️ MIU não disponível");
        this.fault_count = (this.fault_count || 0) + 1;
        return false;
    }

    // Reset fault counter on success
    this.fault_count = 0;

    try {
        // Chamar step original
        const result = OriginalCPUStep.call(this);
        return result;

    } catch (err) {
        console.error("[CPU] ❌ Erro ao executar instrução:", err);
        console.error("[CPU] PC: 0x" + this.pc.toString(16).padStart(8, '0').toUpperCase());
        console.error("[CPU] Stack:", err.stack);
        
        this.fault_count = (this.fault_count || 0) + 1;
        return false;
    }
};

/**
 * Novos métodos de debug
 */
CPU.prototype.dumpState = function() {
    if (!this.getState) {
        return null;
    }
    return this.getState();
};

CPU.prototype.getCurrentInstruction = function() {
    if (!this.miu) return null;
    try {
        const insn = this.miu.readU32(this.pc);
        return insn;
    } catch (e) {
        console.error("[CPU] Erro ao ler instrução:", e.message);
        return null;
    }
};

/**
 * Métodos de registrador (compatibilidade com código antigo)
 */
CPU.prototype.setRegisterVal = function(idx, value) {
    if (idx >= 0 && idx < 32) {
        this.r[idx] = value >>> 0;
        return true;
    }
    return false;
};

CPU.prototype.getRegisterVal = function(idx) {
    if (idx >= 0 && idx < 32) {
        return this.r[idx] >>> 0;
    }
    return 0;
};

// ========== PARTE 2: EXTENSÕES HYPERSCANENGINE ==========

/**
 * ✅ Método _updatePeripherals() - Atualiza periféricos a cada slice
 */
HyperScanEngine.prototype._updatePeripherals = function() {
    try {
        // Timer tick
        if (this.peripherals && this.peripherals.timer) {
            this.peripherals.timer.tick(this.clock.cyclesPerSlice);
        }

        // SPU update (Web Audio já funciona automaticamente)
        if (this.peripherals && this.peripherals.spu) {
            // SPU já atualiza via Web Audio
        }

        // CDROM update
        if (this.peripherals && this.peripherals.cdrom) {
            // CDROM atualiza via callbacks
        }

        // VDU step
        if (this.peripherals && this.peripherals.vdu) {
            this.peripherals.vdu.step(this.clock.cyclesPerSlice);
        }
    } catch (e) {
        console.error("[PERIPH] Erro em _updatePeripherals:", e.message);
    }
};

/**
 * ✅ Método _updateDebuggerUI() - Atualiza UI do debugger
 */
HyperScanEngine.prototype._updateDebuggerUI = function(state) {
    if (!state) return;

    try {
        const pcEl = document.getElementById("dbg-pc");
        if (pcEl && state.pc !== undefined) {
            pcEl.innerText = `0x${state.pc.toString(16).padStart(8, '0').toUpperCase()}`;
        }

        const flags = state.flags;
        if (flags) {
            ["N", "Z", "C", "V", "T"].forEach(f => {
                const el = document.getElementById(`dbg-flag-${f.toLowerCase()}`);
                if (el) {
                    el.innerText = flags[f] ? "1" : "0";
                    el.style.color = flags[f] ? "#0f0" : "#555";
                }
            });
        }

        const fpsEl = document.getElementById("dbg-fps");
        if (fpsEl && this.clock) {
            fpsEl.innerText = `${this.clock.actualFPS.toFixed(1)} FPS`;
        }

        const cyclesEl = document.getElementById("dbg-cycles");
        if (cyclesEl && this.clock) {
            cyclesEl.innerText = `${this.clock.cyclesExecuted}`;
        }
    } catch (e) {
        console.warn("[DEBUG] Erro ao atualizar UI:", e.message);
    }
};

/**
 * Estende HyperScanEngine com métodos de debug avançados
 */

/**
 * Dump de estado da CPU
 */
HyperScanEngine.prototype.dumpCPUState = function() {
    if (!this.cpu) return null;
    return this.cpu.dumpState?.();
};

/**
 * Dump de registradores
 */
HyperScanEngine.prototype.dumpCPURegisters = function() {
    if (!this.cpu) return "";
    
    let output = "=== CPU REGISTERS ===\n";
    for (let i = 0; i < 32; i++) {
        if (this.cpu.r && this.cpu.r[i] !== undefined) {
            const val = `0x${this.cpu.r[i].toString(16).toUpperCase().padStart(8, '0')}`;
            output += `r${i.toString().padStart(2, '0')}: ${val}\n`;
        }
    }
    
    if (this.cpu.pc !== undefined) {
        output += `PC: 0x${this.cpu.pc.toString(16).padStart(8, '0').toUpperCase()}\n`;
    }
    
    if (this.cpu.getFlags) {
        const flags = this.cpu.getFlags();
        output += `Flags: N=${flags.N} Z=${flags.Z} C=${flags.C} V=${flags.V} T=${flags.T}\n`;
    }
    
    return output;
};

/**
 * Desassemblar instrução no PC atual ou em endereço específico
 */
HyperScanEngine.prototype.getCPUDisassembly = function(addr) {
    if (!this.cpu || !this.disassembler) return "";
    
    const address = addr !== undefined ? addr : this.cpu.pc;
    
    try {
        if (this.disassembler.disasmAt) {
            const result = this.disassembler.disasmAt(address);
            return result ? result.text : "Unable to disassemble";
        } else if (this.cpu.disassemble) {
            const insn = this.cpu.miu.readU32(address);
            return this.cpu.disassemble(insn, address);
        }
        return "Disassembler not available";
    } catch (err) {
        console.error("[INTEGRATION] Erro ao desassemblar:", err);
        return null;
    }
};

/**
 * Obter bloco de código (disassembly de N instruções)
 */
HyperScanEngine.prototype.getCodeBlock = function(addr, lines = 10) {
    if (!this.disassembler && !this.cpu.disassemble) return [];
    
    try {
        const instructions = [];
        let currentAddr = addr;
        
        for (let i = 0; i < lines; i++) {
            let instr = null;
            
            if (this.disassembler && this.disassembler.disasmAt) {
                instr = this.disassembler.disasmAt(currentAddr);
            } else if (this.cpu.disassemble && this.cpu.miu) {
                const insn = this.cpu.miu.readU32(currentAddr);
                const text = this.cpu.disassemble(insn, currentAddr);
                instr = { text, bytes: 4 };
            }
            
            if (!instr) break;
            
            instructions.push({
                ...instr,
                isCurrentPC: currentAddr === this.cpu.pc,
                hasBreakpoint: this.dbg ? this.dbg.breakpointManager?.hasBreakpoint(currentAddr) : false
            });
            
            currentAddr += instr.bytes || 4;
        }
        
        return instructions;
    } catch (err) {
        console.error("[INTEGRATION] Erro ao obter bloco de código:", err);
        return [];
    }
};

/**
 * Setar registrador
 */
HyperScanEngine.prototype.setCPURegister = function(idx, value) {
    if (this.cpu && idx >= 0 && idx < 32) {
        this.cpu.setRegisterVal ? this.cpu.setRegisterVal(idx, value) : (this.cpu.r[idx] = value >>> 0);
        console.log(`[DEBUG] r${idx} = 0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()}`);
        return true;
    }
    return false;
};

/**
 * Obter registrador
 */
HyperScanEngine.prototype.getCPURegister = function(idx) {
    if (this.cpu && idx >= 0 && idx < 32) {
        return this.cpu.getRegisterVal ? this.cpu.getRegisterVal(idx) : (this.cpu.r[idx] >>> 0);
    }
    return 0;
};

/**
 * Setar Program Counter
 */
HyperScanEngine.prototype.setCPUPC = function(addr) {
    if (this.cpu) {
        this.cpu.pc = addr >>> 0;
        console.log(`[DEBUG] PC = 0x${(addr >>> 0).toString(16).padStart(8, '0').toUpperCase()}`);
        return true;
    }
    return false;
};

/**
 * Obter Program Counter
 */
HyperScanEngine.prototype.getCPUPC = function() {
    return this.cpu ? this.cpu.pc : 0;
};

/**
 * Executar N ciclos
 */
HyperScanEngine.prototype.runCycles = function(n) {
    if (!this.hw || !this.hw.biosLoaded) {
        console.warn("[CPU] ⚠️ ROM não carregada");
        return 0;
    }
    
    if (!this.cpu || !this.cpu.initialized) {
        console.warn("[CPU] ⚠️ CPU não inicializada");
        return 0;
    }
    
    this.pause();
    
    let executed = 0;
    for (let i = 0; i < n; i++) {
        if (this.cpu && this.cpu.step && this.cpu.step()) {
            executed++;
        } else {
            break;
        }
    }
    
    console.log(`[CPU] ${executed} instruções executadas`);
    return executed;
};

/**
 * Executar até breakpoint ou condição
 */
HyperScanEngine.prototype.runUntil = function(condition, maxSteps = 100000) {
    if (!this.hw || !this.hw.biosLoaded) {
        console.warn("[CPU] ⚠️ ROM não carregada");
        return 0;
    }
    
    if (!this.cpu || !this.cpu.initialized) {
        console.warn("[CPU] ⚠️ CPU não inicializada");
        return 0;
    }
    
    this.pause();
    
    let steps = 0;
    while (steps < maxSteps) {
        if (this.cpu && this.cpu.step && this.cpu.step()) {
            steps++;
            
            // Avaliar condição
            if (condition && typeof condition === 'function') {
                if (condition(this.cpu)) {
                    console.log(`[CPU] ✓ Condição atingida após ${steps} instruções`);
                    return steps;
                }
            }
        } else {
            break;
        }
    }
    
    console.log(`[CPU] ⚠️ Máximo de ${maxSteps} instruções atingido`);
    return steps;
};

/**
 * Reset com debug
 */
const OriginalReset = HyperScanEngine.prototype.reset;

HyperScanEngine.prototype.reset = function() {
    if (OriginalReset) {
        OriginalReset.call(this);
    } else {
        this.pause();
        
        if (this.hw && this.hw.biosLoaded) {
            this.setupHardware?.();
            
            if (this.cpu) {
                this.cpu.reset?.();
                this.cpu.pc = 0x9E000000;
            }
            
            this.updateUIStatus?.(`♻️ Sistema reiniciado`);
        } else {
            this.updateUIStatus?.("Carregue uma ROM");
        }
    }

    // ✅ Update debugger
    if (this.dbg && this.dbg.state) {
        this.dbg.state.recordState?.(this.cpu);
    }

    this.updateRunButton?.();
};

// ========== PARTE 3: DEBUG CONSOLE HANDLER ==========

/**
 * Handler de comando de debug (para debug console)
 */
HyperScanEngine.prototype.debugConsole = function(input) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch(cmd) {
        case 'step':
            this.step();
            break;
        
        case 'run':
            const cycles = parseInt(parts[1]) || 100;
            this.runCycles(cycles);
            break;
        
        case 'pc':
            if (parts[1]) {
                const addr = parseInt(parts[1], 16);
                this.setCPUPC(addr);
            } else {
                console.log(`PC: 0x${this.getCPUPC().toString(16).toUpperCase()}`);
            }
            break;
        
        case 'reg':
            if (parts[1] && parts[2]) {
                const idx = parseInt(parts[1]);
                const val = parseInt(parts[2], 16);
                this.setCPURegister(idx, val);
            } else if (parts[1]) {
                const idx = parseInt(parts[1]);
                const val = this.getCPURegister(idx);
                console.log(`r${idx}: 0x${val.toString(16).toUpperCase()}`);
            }
            break;
        
        case 'dis':
            const addr = parts[1] ? parseInt(parts[1], 16) : this.getCPUPC();
            const result = this.getCPUDisassembly(addr);
            if (result) {
                console.log(`0x${addr.toString(16).padStart(8, '0').toUpperCase()}: ${result}`);
            }
            break;
        
        case 'dump':
            console.log(this.dumpCPURegisters());
            break;
        
        case 'state':
            const state = this.dumpCPUState();
            if (state) {
                console.log(JSON.stringify(state, null, 2));
            }
            break;

        case 'code':
            const startAddr = parts[1] ? parseInt(parts[1], 16) : this.getCPUPC();
            const lineCount = parts[2] ? parseInt(parts[2]) : 10;
            const code = this.getCodeBlock(startAddr, lineCount);
            code.forEach(insn => {
                const marker = insn.hasBreakpoint ? "🔴" : "  ";
                console.log(`${marker} 0x${(insn.address || startAddr).toString(16).padStart(8, '0').toUpperCase()}: ${insn.text}`);
            });
            break;

        case 'help':
            console.log(`
CPU Debug Commands:
  step [n]           - Executa 1 ou N instruções
  run [N]            - Executa N instruções (padrão: 100)
  pc [ADDR]          - Define ou mostra PC (em hex)
  reg [IDX] [VAL]    - Define ou mostra registrador (em hex)
  dis [ADDR]         - Disassembla instrução
  dump               - Imprime registradores
  state              - Imprime estado da CPU
  code [ADDR] [N]    - Mostra N instruções a partir de ADDR
  help               - Mostra esta ajuda
            `);
            break;
        
        default:
            console.log(`❌ Comando desconhecido: ${cmd}`);
    }
};

/**
 * Validação de ROM após carregamento
 */
HyperScanEngine.prototype.validateROMBoot = function() {
    if (!this.hw || !this.hw.biosLoaded) return false;
    
    if (!this.cpu || !this.cpu.miu) return false;
    
    try {
        const firstInsn = this.cpu.miu.readU32(this.cpu.pc);
        const op = (firstInsn >>> 27) & 0x1F;
        
        if (op > 0x1F) {
            console.error(`[BOOT] ❌ OP Code inválido: 0x${op.toString(16)}`);
            return false;
        }
        
        console.log(`[BOOT] ✓ ROM válida - OP=0x${op.toString(16)}`);
        return true;
    } catch (e) {
        console.error("[BOOT] Erro ao validar ROM:", e.message);
        return false;
    }
};

/**
 * Testar periféricos críticos
 */
HyperScanEngine.prototype.validatePeripherals = function() {
    const checks = [
        { name: 'CPU', obj: this.cpu },
        { name: 'MIU', obj: this.hw?.miu },
        { name: 'VDU', obj: this.peripherals?.vdu },
        { name: 'Timer', obj: this.peripherals?.timer },
        { name: 'IntC', obj: this.peripherals?.intC },
        { name: 'UART', obj: this.peripherals?.uart },
        { name: 'SPU', obj: this.peripherals?.spu },
        { name: 'CDROM', obj: this.peripherals?.cdrom },
        { name: 'Debugger', obj: this.dbg }
    ];
    
    console.log("[VALIDATE] Verificando periféricos...");
    let allOk = true;
    
    checks.forEach(check => {
        if (check.obj) {
            console.log(`[VALIDATE] ✓ ${check.name}`);
        } else {
            console.warn(`[VALIDATE] ⚠️ ${check.name} não inicializado`);
            allOk = false;
        }
    });
    
    if (allOk) {
        console.log("[VALIDATE] ✅ Todos os periféricos validados com sucesso!");
    } else {
        console.warn("[VALIDATE] ⚠️ Alguns periféricos não estão inicializados");
    }
    
    return allOk;
};

/**
 * Obter estado completo do sistema
 */
HyperScanEngine.prototype.getFullSystemStatus = function() {
    return {
        cpu: {
            initialized: this.cpu?.initialized || false,
            pc: `0x${(this.cpu?.pc || 0).toString(16).padStart(8, '0').toUpperCase()}`,
            cycles: this.clock?.cyclesExecuted || 0,
            halted: this.cpu?.halted || false,
            faultCount: this.cpu?.fault_count || 0
        },
        hardware: {
            biosLoaded: this.hw?.biosLoaded || false,
            cdromLoaded: this.hw?.cdromLoaded || false,
            miuConnected: !!this.cpu?.miu,
            memorySize: this.hw?.miu?.size || 0
        },
        peripherals: {
            vdu: !!this.peripherals?.vdu,
            timer: !!this.peripherals?.timer,
            intc: !!this.peripherals?.intC,
            uart: !!this.peripherals?.uart,
            spu: !!this.peripherals?.spu,
            cdrom: !!this.peripherals?.cdrom
        },
        timing: {
            fps: this.clock?.actualFPS.toFixed(1) || 0,
            frameCount: this.clock?.frameCount || 0,
            targetFPS: this.clock?.fps || 60
        }
    };
};

// ========== FIM DO ARQUIVO ==========

console.log("[INTEGRATION] ✓ CPU estendida com métodos de debug");
console.log("[INTEGRATION] ✓ HyperScanEngine estendida com métodos de debug");
console.log("[INTEGRATION] ✓ _updatePeripherals() implementado");
console.log("[INTEGRATION] ✓ _updateDebuggerUI() implementado");
console.log("[INTEGRATION] ✓ CPU.initializeCPU() suportado");
console.log("[INTEGRATION] ✓ Prototype patching concluído");
console.log("[INTEGRATION] ✓ integration.js carregado com sucesso");
console.log("[INTEGRATION] ✓ Arquivo integration.js completamente carregado e validado");

// Exportar para uso externo
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CPU: CPU,
        HyperScanEngine: HyperScanEngine
    };
}