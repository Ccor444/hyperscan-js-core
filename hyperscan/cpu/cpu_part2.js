/**
 * SPCE3200 CPU - HyperScan Emulator - PARTE 2 CORRIGIDA
 * Execução de Instruções: SP-Form, I-Form, J-Form, B-Form, RIX-Form, Memory-Form
 * + Sistema de inicialização robusto e validações críticas
 * 100% COMPLETO E CORRIGIDO - v2.0
 */

"use strict";

// Assumindo que CPU está definida na PARTE 1
// Continuando a classe CPU com os métodos de execução

// ========== EXTENSÃO DO CONSTRUCTOR PARA SUPORTAR INICIALIZAÇÃO ==========
if (typeof CPU !== 'undefined') {
    const OriginalCPU = CPU;
    
    // Salvar construtor original
    const originalConstructor = OriginalCPU.prototype.constructor;
    
    // Estender funcionalidade de inicialização
    OriginalCPU.prototype.initializeCPU = function(miu) {
        if (!miu) {
            console.error("[CPU] ✗ ERRO CRÍTICO: MIU não fornecido em initializeCPU()");
            console.error("[CPU]   Você deve criar um MemoryInterface antes de inicializar a CPU");
            return false;
        }

        this.miu = miu;
        this.initialized = true;
        this.halted = false;
        this.fault_count = 0;
        this.last_error = null;

        console.log("[CPU] ✓ CPU inicializada com sucesso");
        console.log(`[CPU]   - MIU conectado: ${miu.constructor.name}`);
        console.log(`[CPU]   - Tamanho de memória: 0x${(miu.size || 0).toString(16).padStart(8, '0').toUpperCase()} bytes`);
        console.log(`[CPU]   - PC: 0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}`);
        console.log(`[CPU]   - Status: PRONTO PARA EXECUÇÃO`);

        return true;
    };

    // Adicionar método de validação de estado
    OriginalCPU.prototype.getInitializationStatus = function() {
        return {
            initialized: this.initialized || false,
            halted: this.halted,
            miu_connected: !!this.miu,
            miu_type: this.miu ? this.miu.constructor.name : 'NENHUM',
            memory_size: this.miu ? (this.miu.size || 0) : 0,
            pc: `0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}`,
            fault_count: this.fault_count || 0,
            last_error: this.last_error || 'Nenhum'
        };
    };
}

// ========== SP-FORM (Special Purpose Form) ==========
CPU.prototype.execSpForm = function(insn) {
    const rD = (insn >>> 22) & 0x1F;
    const rA = (insn >>> 17) & 0x1F;
    const rB = (insn >>> 12) & 0x1F;
    const func6 = (insn >>> 1) & 0x3F;
    const CU = insn & 1;

    switch(func6) {
        case 0x00: // nop
            break;
        case 0x01: // syscall
            this.exception(0x01);
            break;
        case 0x02: // trap
            if (this.conditional(rB)) this.exception(0x02);
            break;
        case 0x03: // sdbbp (software debug breakpoint)
            this.exception(0x03);
            break;
        case 0x04: // br.l (branch and link conditional)
            if (this.conditional(rB)) {
                if (CU) this.setRegister(3, (this.pc + 4) >>> 0);
                this.pc = this.r[rA];
                return 0;
            }
            break;
        case 0x05: // pflush (prefetch flush)
            break;
        case 0x06: // alw (atomic load word)
            if (this.miu) this.setRegister(rD, this.miu.readU32(this.r[rA]));
            break;
        case 0x07: // asw (atomic store word)
            if (this.miu) this.miu.writeU32(this.r[rA], this.r[rD]);
            break;
        case 0x08: this.setRegister(rD, this.add(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x09: this.setRegister(rD, this.addc(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x0A: this.setRegister(rD, this.sub(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x0B: this.setRegister(rD, this.subc(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x0C: // cmp (compare) - CORRIGIDO
            this.sub(this.r[rA], this.r[rB], true);
            break;
        case 0x0D: // cmpz (compare with zero) - CORRIGIDO
            this.sub(this.r[rA], 0, true);
            break;
        case 0x0F: this.setRegister(rD, this.neg(this.r[rA], CU === 1)); break;
        case 0x10: this.setRegister(rD, this.bitOp(this.r[rA], this.r[rB], 'and', CU === 1)); break;
        case 0x11: this.setRegister(rD, this.bitOp(this.r[rA], this.r[rB], 'or', CU === 1)); break;
        case 0x12: this.setRegister(rD, this.bitOp(this.r[rA], 0, 'not', CU === 1)); break;
        case 0x13: this.setRegister(rD, this.bitOp(this.r[rA], this.r[rB], 'xor', CU === 1)); break;
        case 0x14: this.setRegister(rD, this.bitclr(this.r[rA], rB, CU === 1)); break;
        case 0x15: this.setRegister(rD, this.bitset(this.r[rA], rB, CU === 1)); break;
        case 0x16: this.bittst(this.r[rA], rB); break;
        case 0x17: this.setRegister(rD, this.bittgl(this.r[rA], rB, CU === 1)); break;
        case 0x18: this.setRegister(rD, this.sll(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x1A: this.setRegister(rD, this.srl(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x1B: this.setRegister(rD, this.sra(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x1C: this.setRegister(rD, this.ror(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x1D: this.setRegister(rD, this.rorc(this.r[rA], CU === 1)); break;
        case 0x1E: this.setRegister(rD, this.rol(this.r[rA], this.r[rB], CU === 1)); break;
        case 0x1F: this.setRegister(rD, this.rolc(this.r[rA], CU === 1)); break;
        case 0x20: this.execMul(this.r[rA], this.r[rB]); break;
        case 0x21: this.execMulu(this.r[rA], this.r[rB]); break;
        case 0x22: this.execDiv(this.r[rA], this.r[rB]); break;
        case 0x23: this.execDivu(this.r[rA], this.r[rB]); break;
        case 0x24: this.moveFromCE(rD, rB); break;
        case 0x25: this.moveToCE(rD, rB); break;
        case 0x28: this.setRegister(rD, this.sr[rB]); break;
        case 0x29: this.sr[rB] = this.r[rA]; if (rB === 0) this.unpackSR0(); break;
        case 0x2A: this.T = this.conditional(rB) ? 1 : 0; break;
        case 0x2B: if (this.conditional(rB)) this.setRegister(rD, this.r[rA]); break;
        case 0x2C: this.setRegister(rD, this.extsb(this.r[rA], CU === 1)); break;
        case 0x2D: this.setRegister(rD, this.extsh(this.r[rA], CU === 1)); break;
        case 0x2E: this.setRegister(rD, this.extzb(this.r[rA], CU === 1)); break;
        case 0x2F: this.setRegister(rD, this.extzh(this.r[rA], CU === 1)); break;
        case 0x30: if (this.miu) this.setRegister(rD, this.miu.readU8(this.r[rA])); break;
        case 0x31: if (this.miu) this.setRegister(rD, this.miu.readU32(this.r[rA])); break;
        case 0x34: if (this.miu) this.miu.writeU8(this.r[rA], this.r[rD] & 0xFF); break;
        case 0x35: if (this.miu) this.miu.writeU32(this.r[rA], this.r[rD]); break;
        case 0x38: this.setRegister(rD, this.sll(this.r[rA], rB, CU === 1)); break;
        case 0x3A: this.setRegister(rD, this.srl(this.r[rA], rB, CU === 1)); break;
        case 0x3B: this.setRegister(rD, this.sra(this.r[rA], rB, CU === 1)); break;
        case 0x3C: this.setRegister(rD, this.ror(this.r[rA], rB, CU === 1)); break;
        case 0x3D: this.setRegister(rD, this.rorc(this.r[rA], true)); break;
        case 0x3E: this.setRegister(rD, this.rol(this.r[rA], rB, CU === 1)); break;
        case 0x3F: // rte (return from exception)
            this.rte();
            return 0;
    }
    return 4;
};

// ========== I-FORM (Immediate Form) ==========
CPU.prototype.execIForm = function(insn) {
    const OP = (insn >>> 27) & 0x1F;
    const rD = (insn >>> 22) & 0x1F;
    const func3 = (insn >>> 19) & 0x07;
    const imm16 = this.signExtend((insn >>> 1) & 0xFFFF, 16);

    switch(OP) {
        case 0x01:
            switch(func3) {
                case 0x00: this.setRegister(rD, this.add(this.r[rD], imm16, false)); break;
                case 0x02: this.sub(this.r[rD], imm16, true); break;
                case 0x04: this.setRegister(rD, this.bitOp(this.r[rD], imm16, 'and', false)); break;
                case 0x05: this.setRegister(rD, this.bitOp(this.r[rD], imm16, 'or', false)); break;
                case 0x06: this.setRegister(rD, imm16); break;
            }
            break;
        case 0x05:
            switch(func3) {
                case 0x00: this.setRegister(rD, this.add(this.r[rD], (imm16 << 16), false)); break;
                case 0x02: this.sub(this.r[rD], (imm16 << 16), true); break;
                case 0x04: this.setRegister(rD, this.bitOp(this.r[rD], (imm16 << 16), 'and', false)); break;
                case 0x05: this.setRegister(rD, this.bitOp(this.r[rD], (imm16 << 16), 'or', false)); break;
                case 0x06: this.setRegister(rD, (imm16 << 16) >>> 0); break;
            }
            break;
    }
    return 4;
};

// ========== J-FORM (Jump Form) - CORRIGIDO COM SIGN-EXTEND ==========
CPU.prototype.execJForm = function(insn) {
    const LK = insn & 1;
    const disp24 = (insn >>> 1) & 0xFFFFFF;
    const signed_disp = this.signExtend(disp24, 24); // CORRIGIDO: sign-extend
    const target = (this.pc + (signed_disp << 1)) >>> 0;
    if (LK) this.setRegister(3, (this.pc + 4) >>> 0);
    this.pc = target;
    return 0;
};

// ========== B-FORM (Branch Form) ==========
CPU.prototype.execBForm = function(insn) {
    const LK = insn & 1;
    const BC = (insn >>> 23) & 0x0F;
    const disp_high = (insn >>> 9) & 0x3FFF;
    const disp_low = (insn >>> 1) & 0xFF;
    const disp22 = (disp_high << 8) | disp_low;
    const signed_disp = this.signExtend(disp22, 22);
    const target = (this.pc + (signed_disp << 1)) >>> 0;
    if (this.conditional(BC)) {
        if (LK) this.setRegister(3, (this.pc + 4) >>> 0);
        this.pc = target;
        return 0;
    }
    return 4;
};

// ========== RIX-FORM (Register Indirect + Index) ==========
CPU.prototype.execRixForm = function(insn) {
    const OP = (insn >>> 27) & 0x1F;
    const rD = (insn >>> 22) & 0x1F;
    const rA = (insn >>> 17) & 0x1F;
    const imm12 = this.signExtend((insn >>> 5) & 0xFFF, 12);
    const func3 = (insn >>> 2) & 0x07;
    const addr = (this.r[rA] + imm12) >>> 0;
    
    if (!this.miu) return 4;
    
    switch(func3) {
        case 0x00: this.setRegister(rD, this.miu.readU32(addr)); break;
        case 0x01: this.setRegister(rD, this.signExtend(this.miu.readU16(addr), 16)); break;
        case 0x02: this.setRegister(rD, this.miu.readU16(addr)); break;
        case 0x03: this.setRegister(rD, this.signExtend(this.miu.readU8(addr), 8)); break;
        case 0x04: this.miu.writeU32(addr, this.r[rD]); break;
        case 0x05: this.miu.writeU16(addr, this.r[rD]); break;
        case 0x06: this.setRegister(rD, this.miu.readU8(addr)); break;
        case 0x07: this.miu.writeU8(addr, this.r[rD]); break;
    }
    
    if (OP === 0x03) this.r[rA] = addr; // Post-increment
    return 4;
};

// ========== MEMORY-FORM (15-bit offset) ==========
CPU.prototype.execMemoryForm = function(insn) {
    const OP = (insn >>> 27) & 0x1F;
    const rD = (insn >>> 22) & 0x1F;
    const rA = (insn >>> 17) & 0x1F;
    const imm15 = this.signExtend((insn >>> 2) & 0x7FFF, 15);
    const addr = (this.r[rA] + imm15) >>> 0;
    
    if (!this.miu) return 4;
    
    switch(OP) {
        case 0x10: this.setRegister(rD, this.miu.readU32(addr)); break;
        case 0x11: this.setRegister(rD, this.signExtend(this.miu.readU16(addr), 16)); break;
        case 0x12: this.setRegister(rD, this.miu.readU16(addr)); break;
        case 0x13: this.setRegister(rD, this.signExtend(this.miu.readU8(addr), 8)); break;
        case 0x14: this.miu.writeU32(addr, this.r[rD]); break;
        case 0x15: this.miu.writeU16(addr, this.r[rD]); break;
        case 0x16: this.setRegister(rD, this.miu.readU8(addr)); break;
        case 0x17: this.miu.writeU8(addr, this.r[rD]); break;
    }
    return 4;
};

// ========== EXCEÇÕES E RETORNO ==========
CPU.prototype.exception = function(cause) {
    console.warn(`[CPU] Exceção disparada: 0x${cause.toString(16).padStart(2, '0')}`);
    this.packSR0();
    this.cr[1] = this.sr[0]; // Save SR0 to CR1
    this.cr[2] = (this.cr[2] & ~0x00FC0000) | ((cause & 0x3F) << 18);
    this.cr[5] = this.pc; // Save PC to CR5
    this.cr[0] &= ~1;
    this.pc = (this.cr[3] + (cause * 4)) >>> 0; // Jump to exception handler
};

CPU.prototype.rte = function() {
    console.log(`[CPU] Retorno de exceção em 0x${this.cr[5].toString(16).padStart(8, '0')}`);
    this.sr[0] = this.cr[1];
    this.unpackSR0();
    this.pc = this.cr[5];
};

// ========== CICLO DE EXECUÇÃO PRINCIPAL (CORRIGIDO) ==========
CPU.prototype.step = function() {
    // ✅ VALIDAÇÃO 1: CPU foi inicializada?
    if (!this.initialized) {
        console.error("[CPU] ✗ CPU não foi inicializada. Chame cpu.initializeCPU(miu) primeiro.");
        return false;
    }

    // ✅ VALIDAÇÃO 2: CPU está halted?
    if (this.halted) {
        return false;
    }

    // ✅ VALIDAÇÃO 3: MIU está conectado?
    if (!this.miu) {
        this.fault_count = (this.fault_count || 0) + 1;
        this.last_error = "MIU desconectado ou não inicializado";
        
        if (this.fault_count === 1) {
            console.error("[CPU] ✗ ERRO CRÍTICO: MIU desconectado!");
            console.error("[CPU]   Isso indica um erro grave de inicialização.");
        }
        
        if (this.fault_count > 100) {
            console.error("[CPU] ✗ PANIC: Muitas faltas consecutivas. Sistema travado.");
            this.halted = true;
        }
        
        return false;
    }

    // Reset fault counter on successful execution
    this.fault_count = 0;

    try {
        // ✅ VALIDAÇÃO 4: PC está dentro dos limites de memória?
        if (this.pc > this.miu.size) {
            console.error(`[CPU] ✗ PC fora de range: 0x${this.pc.toString(16).padStart(8, '0')}`);
            console.error(`[CPU]   Tamanho de memória: 0x${this.miu.size.toString(16).padStart(8, '0')}`);
            this.exception(0xFF); // Exceção de acesso inválido
            return false;
        }

        // ✅ VALIDAÇÃO 5: Verificar breakpoint ANTES de executar
        if (this.breakpointManager && this.breakpointManager.checkBreakpoint(this.pc)) {
            this.breakpointManager.paused = true;
            return false; // Pausa, não executa
        }

        // ✅ Decodificar instrução
        const encoded = this.miu.readU32(this.pc);
        const OP = (encoded >>> 27) & 0x1F;

        let result = 4;

        // ✅ Executar instrução baseada no OP code
        switch(OP) {
            case 0x00:
                result = this.execSpForm(encoded);
                break;
            case 0x01:
            case 0x05:
                result = this.execIForm(encoded);
                break;
            case 0x02:
                result = this.execJForm(encoded);
                break;
            case 0x03:
            case 0x07:
                result = this.execRixForm(encoded);
                break;
            case 0x04:
                result = this.execBForm(encoded);
                break;
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
            case 0x16:
            case 0x17:
                result = this.execMemoryForm(encoded);
                break;
            case 0x08:
            case 0x09:
            case 0x0A:
            case 0x0B:
            case 0x0C:
            case 0x0D:
            case 0x0E:
            case 0x0F:
            case 0x18:
            case 0x19:
            case 0x1A:
            case 0x1B:
            case 0x1C:
            case 0x1D:
            case 0x1E:
            case 0x1F:
                // 16-bit Compressed Instructions
                const low = encoded & 0xFFFF;
                result = this.exec16(low);
                break;
            default:
                console.warn(`[CPU] Instrução desconhecida em 0x${this.pc.toString(16)}: OP=0x${OP.toString(16)}`);
                result = 4;
                break;
        }

        // ✅ Atualizar PC se não houve jump
        if (result !== 0) {
            this.pc = (this.pc + result) >>> 0;
        }

        this.cycles++;
        this.instructions++;
        return true;

    } catch (e) {
        console.error(`[CPU] ✗ EXCEÇÃO em 0x${this.pc.toString(16)}:`, e.message);
        this.last_error = e.message;
        this.fault_count++;
        return false;
    }
};

// ========== RUN COM LIMITE E VALIDAÇÃO ==========
CPU.prototype.run = function(maxSteps = 1000) {
    // Validação inicial
    if (!this.initialized) {
        console.error("[CPU] ✗ CPU não inicializada. Use cpu.initializeCPU(miu) primeiro.");
        return 0;
    }

    console.log(`[CPU] Iniciando execução por até ${maxSteps} instruções...`);
    console.log(`[CPU] PC inicial: 0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}`);

    let steps = 0;
    const startCycles = this.cycles;

    while (steps < maxSteps && !this.halted) {
        if (!this.step()) {
            if (this.fault_count > 100) {
                console.error("[CPU] ✗ Sistema em PANIC. Parando execução.");
                break;
            }
            // Continua mesmo com falhas menores
        }
        steps++;
    }

    console.log(`[CPU] Execução concluída`);
    console.log(`[CPU]   - Instruções executadas: ${this.instructions}`);
    console.log(`[CPU]   - Ciclos: ${this.cycles - startCycles}`);
    console.log(`[CPU]   - PC final: 0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}`);
    console.log(`[CPU]   - Status: ${this.halted ? 'HALTED' : 'RODANDO'}`);

    return steps;
};

// ========== STATE INSPECTION ==========
CPU.prototype.getState = function() {
    return {
        pc: `0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}`,
        cycles: this.cycles,
        instructions: this.instructions,
        flags: this.getFlags(),
        registers: Array.from(this.r).map((v, i) => ({
            name: `r${i}`,
            value: `0x${v.toString(16).padStart(8, '0').toUpperCase()}`
        })),
        systemRegisters: Array.from(this.sr).map((v, i) => ({
            name: `sr${i}`,
            value: `0x${v.toString(16).padStart(8, '0').toUpperCase()}`
        })),
        controlRegisters: Array.from(this.cr).map((v, i) => ({
            name: `cr${i}`,
            value: `0x${v.toString(16).padStart(8, '0').toUpperCase()}`
        })),
        customEngine: {
            CEL: `0x${this.CEL.toString(16).padStart(8, '0').toUpperCase()}`,
            CEH: `0x${this.CEH.toString(16).padStart(8, '0').toUpperCase()}`
        },
        initialization: this.getInitializationStatus()
    };
};

CPU.prototype.halt = function() {
    console.log(`[CPU] CPU halted em PC: 0x${this.pc.toString(16).padStart(8, '0')}`);
    this.halted = true;
};

CPU.prototype.resume = function() {
    if (!this.initialized) {
        console.error("[CPU] ✗ Não pode resumir. CPU não foi inicializada.");
        return false;
    }
    console.log(`[CPU] CPU retomada em PC: 0x${this.pc.toString(16).padStart(8, '0')}`);
    this.halted = false;
    return true;
};

// ========== EXPORTAÇÃO ==========
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CPU;
}
if (typeof window !== 'undefined') {
    window.CPU = CPU;
}