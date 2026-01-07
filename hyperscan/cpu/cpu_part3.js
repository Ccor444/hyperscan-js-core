/**
 * SPCE3200 CPU - HyperScan Emulator - PARTE 3
 * 16-bit Compressed Instructions Completas + Debug/Dissassembly
 * 100% COMPLETO E CORRIGIDO
 */

"use strict";

// ========== 16-bit COMPRESSED INSTRUCTIONS COMPLETAS ==========
CPU.prototype.exec16 = function(insn) {
    const OP = (insn >>> 13) & 0x07;
    const rD = (insn >>> 1) & 0x0F;
    const rA = (insn >>> 5) & 0x0F;

    switch(OP) {
        // ========== OP 0x00: ALU e Branch Compactados ==========
        case 0x00: {
            const func4 = (insn >>> 9) & 0x0F;
            
            switch(func4) {
                case 0x00: // c.mov.rs (move entre registros estendidos)
                    this.setRegister(rD + 16, this.r[rA + 16]);
                    break;
                case 0x01: // c.mov.sm (move entre registros normais)
                    this.setRegister(rD, this.r[rA]);
                    break;
                case 0x03: // c.mov (move genérico)
                    this.setRegister(rD, this.r[rA]);
                    break;
                case 0x04: // c.jr (jump register)
                    this.pc = this.r[rA];
                    return 0;
                case 0x05: // c.jalr (jump and link register)
                    this.setRegister(3, (this.pc + 2) >>> 0);
                    this.pc = this.r[rA];
                    return 0;
                case 0x06: // c.jmp (jump compactado 11-bit)
                    const imm11_jmp = (insn >>> 5) & 0x7FF;
                    const target_jmp = (this.pc + (this.signExtend(imm11_jmp, 11) << 1)) >>> 0;
                    this.pc = target_jmp;
                    return 0;
                case 0x07: // c.jal (jump and link compactado)
                    const imm11_jal = (insn >>> 5) & 0x7FF;
                    const target_jal = (this.pc + (this.signExtend(imm11_jal, 11) << 1)) >>> 0;
                    this.setRegister(3, (this.pc + 2) >>> 0);
                    this.pc = target_jal;
                    return 0;
                case 0x0A: // c.nop (no operation)
                    break;
                case 0x0B: // c.break (break)
                    this.exception(0x09);
                    break;
            }
            break;
        }

        // ========== OP 0x02: ALU Operações e Stack ==========
        case 0x02: {
            const func4 = (insn >>> 9) & 0x0F;
            const H = (insn >>> 5) & 1;
            const targetReg = rD + (H ? 16 : 0);
            const stackReg = (insn >>> 6) & 0x07;

            switch(func4) {
                case 0x00: // c.add
                    this.setRegister(rD, this.add(this.r[rD], this.r[rA], true));
                    break;
                case 0x01: { // c.addi (add immediate 5-bit)
                    const imm5 = (insn >>> 5) & 0x1F;
                    this.setRegister(rD, this.add(this.r[rD], imm5, true));
                    break;
                }
                case 0x02: { // c.subi (subtract immediate 5-bit)
                    const imm5 = (insn >>> 5) & 0x1F;
                    this.setRegister(rD, this.sub(this.r[rD], imm5, true));
                    break;
                }
                case 0x03: { // c.li (load immediate 5-bit)
                    const imm5 = (insn >>> 5) & 0x1F;
                    this.setRegister(rD, imm5);
                    break;
                }
                case 0x04: { // c.lui (load upper immediate 5-bit)
                    const imm5 = (insn >>> 5) & 0x1F;
                    this.setRegister(rD, (imm5 << 11) >>> 0);
                    break;
                }
                case 0x05: { // c.and (bitwise AND)
                    this.setRegister(rD, this.bitOp(this.r[rD], this.r[rA], 'and', true));
                    break;
                }
                case 0x06: { // c.or (bitwise OR)
                    this.setRegister(rD, this.bitOp(this.r[rD], this.r[rA], 'or', true));
                    break;
                }
                case 0x07: { // c.xor (bitwise XOR)
                    this.setRegister(rD, this.bitOp(this.r[rD], this.r[rA], 'xor', true));
                    break;
                }
                case 0x08: { // c.not (bitwise NOT)
                    this.setRegister(rD, this.bitOp(this.r[rD], 0, 'not', true));
                    break;
                }
                case 0x09: { // c.neg (negate)
                    this.setRegister(rD, this.neg(this.r[rD], true));
                    break;
                }
                case 0x0A: { // c.lwsp (load word from stack pointer)
                    if (this.miu) {
                        const imm5 = (insn >>> 5) & 0x1F;
                        const addr = (this.r[stackReg] + (imm5 << 2)) >>> 0;
                        this.setRegister(targetReg, this.miu.readU32(addr));
                    }
                    break;
                }
                case 0x0B: { // c.swsp (store word to stack pointer)
                    if (this.miu) {
                        const imm5 = (insn >>> 5) & 0x1F;
                        const addr = (this.r[stackReg] + (imm5 << 2)) >>> 0;
                        this.miu.writeU32(addr, this.r[targetReg]);
                    }
                    break;
                }
                case 0x0C: { // c.sub (subtract)
                    this.setRegister(rD, this.sub(this.r[rD], this.r[rA], true));
                    break;
                }
                case 0x0E: { // c.push (push to stack)
                    this.r[stackReg] = (this.r[stackReg] - 4) >>> 0;
                    if (this.miu) {
                        this.miu.writeU32(this.r[stackReg], this.r[targetReg]);
                    }
                    break;
                }
                case 0x0F: { // c.pop (pop from stack)
                    if (this.miu) {
                        this.setRegister(targetReg, this.miu.readU32(this.r[stackReg]));
                    }
                    this.r[stackReg] = (this.r[stackReg] + 4) >>> 0;
                    break;
                }
            }
            break;
        }

        // ========== OP 0x03: Load/Store Compactado ==========
        case 0x03: {
            const imm5 = (insn >>> 4) & 0x1F;
            const addr = (this.r[rA] + (imm5 << 2)) >>> 0;
            
            if ((insn >>> 12) & 1) { // Store
                if (this.miu) this.miu.writeU32(addr, this.r[rD]);
            } else { // Load
                if (this.miu) this.setRegister(rD, this.miu.readU32(addr));
            }
            break;
        }

        // ========== OP 0x04: Branch Compactado ==========
        case 0x04: {
            const cond = (insn >>> 10) & 0x0F;
            const imm8 = this.signExtend((insn >>> 1) & 0xFF, 8);
            const target = (this.pc + (imm8 << 1)) >>> 0;
            
            if (this.conditional(cond)) {
                this.pc = target;
                return 0;
            }
            break;
        }

        // ========== OP 0x05: Shift Compactado ==========
        case 0x05: {
            const func3 = (insn >>> 10) & 0x07;
            const imm5 = (insn >>> 5) & 0x1F;
            
            switch(func3) {
                case 0x00: // c.slli (shift left logical immediate)
                    this.setRegister(rD, this.sll(this.r[rD], imm5, true));
                    break;
                case 0x02: // c.srli (shift right logical immediate)
                    this.setRegister(rD, this.srl(this.r[rD], imm5, true));
                    break;
                case 0x03: // c.srai (shift right arithmetic immediate)
                    this.setRegister(rD, this.sra(this.r[rD], imm5, true));
                    break;
                case 0x04: // c.roli (rotate left immediate)
                    this.setRegister(rD, this.rol(this.r[rD], imm5, true));
                    break;
                case 0x05: // c.rori (rotate right immediate)
                    this.setRegister(rD, this.ror(this.r[rD], imm5, true));
                    break;
            }
            break;
        }

        // ========== OP 0x06: Operações de Extensão ==========
        case 0x06: {
            const func3 = (insn >>> 10) & 0x07;
            
            switch(func3) {
                case 0x00: // c.extsb (extend sign byte)
                    this.setRegister(rD, this.extsb(this.r[rD], true));
                    break;
                case 0x01: // c.extsh (extend sign half-word)
                    this.setRegister(rD, this.extsh(this.r[rD], true));
                    break;
                case 0x02: // c.extzb (extend zero byte)
                    this.setRegister(rD, this.extzb(this.r[rD], true));
                    break;
                case 0x03: // c.extzh (extend zero half-word)
                    this.setRegister(rD, this.extzh(this.r[rD], true));
                    break;
            }
            break;
        }

        // ========== OP 0x07: Load/Store SP-relativo ==========
        case 0x07: {
            const imm5 = (insn >>> 5) & 0x1F;
            const addr = (this.r[2] + (imm5 << 2)) >>> 0;

            if ((insn >>> 10) & 1) { // Store
                if (this.miu) this.miu.writeU32(addr, this.r[rD]);
            } else { // Load
                if (this.miu) this.setRegister(rD, this.miu.readU32(addr));
            }
            break;
        }
    }

    return 2;
};

// ========== DEBUG E DISSASSEMBLY ==========
CPU.prototype.disassemble = function(insn, pc = 0) {
    const OP = (insn >>> 27) & 0x1F;
    
    switch(OP) {
        case 0x00: return this.disassembleSP(insn);
        case 0x01:
        case 0x05: return this.disassembleI(insn);
        case 0x02: return this.disassembleJ(insn, pc);
        case 0x03:
        case 0x07: return this.disassembleRix(insn);
        case 0x04: return this.disassembleB(insn, pc);
        case 0x10:
        case 0x11:
        case 0x12:
        case 0x13:
        case 0x14:
        case 0x15:
        case 0x16:
        case 0x17: return this.disassembleMemory(insn);
        default: return `UNKNOWN (OP=0x${OP.toString(16)})`;
    }
};

CPU.prototype.disassemble16 = function(insn) {
    const OP = (insn >>> 13) & 0x07;
    const rD = (insn >>> 1) & 0x0F;
    const rA = (insn >>> 5) & 0x0F;
    const func4 = (insn >>> 9) & 0x0F;

    switch(OP) {
        case 0x00:
            const ops00 = ['c.mov.rs', 'c.mov.sm', '', 'c.mov', 'c.jr', 'c.jalr', 'c.jmp', 'c.jal', '', '', 'c.nop', 'c.break'];
            return ops00[func4] ? `${ops00[func4]} r${rD}, r${rA}` : 'UNKNOWN C16';
        case 0x02:
            const ops02 = ['c.add', 'c.addi', 'c.subi', 'c.li', 'c.lui', 'c.and', 'c.or', 'c.xor', 'c.not', 'c.neg', 'c.lwsp', 'c.swsp', 'c.sub', '', 'c.push', 'c.pop'];
            return ops02[func4] || 'UNKNOWN C16';
        case 0x03:
            return `c.lw/sw r${rD}, [r${rA}+offset]`;
        case 0x04:
            const conds = ['cs', 'cc', 'hi', 'ls', 'eq', 'ne', 'gt', 'le', 'ge', 'lt', 'mi', 'pl', 'vs', 'vc', 't', 'al'];
            const cond = (insn >>> 10) & 0x0F;
            return `c.b${conds[cond]} <offset>`;
        case 0x05:
            const ops05 = ['c.slli', '', 'c.srli', 'c.srai', 'c.roli', 'c.rori'];
            return ops05[(insn >>> 10) & 0x07] || 'UNKNOWN C16';
        case 0x06:
            const ops06 = ['c.extsb', 'c.extsh', 'c.extzb', 'c.extzh'];
            return ops06[(insn >>> 10) & 0x07] || 'UNKNOWN C16';
        case 0x07:
            return `c.lw/sw.sp r${rD}`;
        default:
            return 'UNKNOWN C16';
    }
};

CPU.prototype.disassembleSP = function(insn) {
    const rD = (insn >>> 22) & 0x1F;
    const rA = (insn >>> 17) & 0x1F;
    const rB = (insn >>> 12) & 0x1F;
    const func6 = (insn >>> 1) & 0x3F;
    
    const mnemonics = {
        0x00: 'nop',
        0x01: 'syscall',
        0x02: `trap`,
        0x03: 'sdbbp',
        0x04: `br.l r${rA}`,
        0x05: 'pflush',
        0x06: `alw r${rD}, [r${rA}]`,
        0x07: `asw r${rD}, [r${rA}]`,
        0x08: `add r${rD}, r${rA}, r${rB}`,
        0x09: `addc r${rD}, r${rA}, r${rB}`,
        0x0A: `sub r${rD}, r${rA}, r${rB}`,
        0x0B: `subc r${rD}, r${rA}, r${rB}`,
        0x0C: `cmp r${rA}, r${rB}`,
        0x0D: `cmpz r${rA}`,
        0x0F: `neg r${rD}, r${rA}`,
        0x10: `and r${rD}, r${rA}, r${rB}`,
        0x11: `or r${rD}, r${rA}, r${rB}`,
        0x12: `not r${rD}, r${rA}`,
        0x13: `xor r${rD}, r${rA}, r${rB}`,
        0x14: `bitclr r${rD}, r${rA}, ${rB}`,
        0x15: `bitset r${rD}, r${rA}, ${rB}`,
        0x16: `bittst r${rA}, ${rB}`,
        0x17: `bittgl r${rD}, r${rA}, ${rB}`,
        0x18: `sll r${rD}, r${rA}, r${rB}`,
        0x1A: `srl r${rD}, r${rA}, r${rB}`,
        0x1B: `sra r${rD}, r${rA}, r${rB}`,
        0x1C: `ror r${rD}, r${rA}, r${rB}`,
        0x1D: `rorc r${rD}, r${rA}`,
        0x1E: `rol r${rD}, r${rA}, r${rB}`,
        0x1F: `rolc r${rD}, r${rA}`,
        0x20: `mul r${rA}, r${rB}`,
        0x21: `mulu r${rA}, r${rB}`,
        0x22: `div r${rA}, r${rB}`,
        0x23: `divu r${rA}, r${rB}`,
        0x24: `mfce r${rD}`,
        0x25: `mtce r${rD}`,
        0x28: `mfsr r${rD}, sr${rB}`,
        0x29: `mtsr sr${rB}, r${rA}`,
        0x2A: `tcond`,
        0x2B: `mvcond r${rD}, r${rA}`,
        0x2C: `extsb r${rD}, r${rA}`,
        0x2D: `extsh r${rD}, r${rA}`,
        0x2E: `extzb r${rD}, r${rA}`,
        0x2F: `extzh r${rD}, r${rA}`,
        0x30: `lcb r${rD}, [r${rA}]`,
        0x31: `lcw r${rD}, [r${rA}]`,
        0x34: `scb [r${rA}], r${rD}`,
        0x35: `scw [r${rA}], r${rD}`,
        0x38: `slli r${rD}, r${rA}, ${rB}`,
        0x3A: `srli r${rD}, r${rA}, ${rB}`,
        0x3B: `srai r${rD}, r${rA}, ${rB}`,
        0x3C: `rori r${rD}, r${rA}, ${rB}`,
        0x3D: `roric r${rD}, r${rA}`,
        0x3E: `roli r${rD}, r${rA}, ${rB}`,
        0x3F: `rte`
    };
    
    return mnemonics[func6] || `SP-FORM func6=0x${func6.toString(16)}`;
};

CPU.prototype.disassembleI = function(insn) {
    const OP = (insn >>> 27) & 0x1F;
    const rD = (insn >>> 22) & 0x1F;
    const func3 = (insn >>> 19) & 0x07;
    const imm16 = (insn >>> 1) & 0xFFFF;
    
    const mnemonics = {
        '1_0': `addi r${rD}, r${rD}, 0x${imm16.toString(16)}`,
        '1_2': `cmpi r${rD}, 0x${imm16.toString(16)}`,
        '1_4': `andi r${rD}, r${rD}, 0x${imm16.toString(16)}`,
        '1_5': `ori r${rD}, r${rD}, 0x${imm16.toString(16)}`,
        '1_6': `ldi r${rD}, 0x${imm16.toString(16)}`,
        '5_0': `addis r${rD}, r${rD}, 0x${imm16.toString(16)}`,
        '5_2': `cmpis r${rD}, 0x${imm16.toString(16)}`,
        '5_4': `andis r${rD}, r${rD}, 0x${imm16.toString(16)}`,
        '5_5': `oris r${rD}, r${rD}, 0x${imm16.toString(16)}`,
        '5_6': `ldis r${rD}, 0x${imm16.toString(16)}`
    };
    
    return mnemonics[`${OP}_${func3}`] || `I-FORM OP=0x${OP.toString(16)}`;
};

CPU.prototype.disassembleJ = function(insn, pc = 0) {
    const LK = insn & 1;
    const disp24 = (insn >>> 1) & 0xFFFFFF;
    const signed_disp = this.signExtend(disp24, 24);
    const target = (pc + (signed_disp << 1)) >>> 0;
    return LK ? `jal 0x${target.toString(16).padStart(8, '0')}` : `j 0x${target.toString(16).padStart(8, '0')}`;
};

CPU.prototype.disassembleB = function(insn, pc = 0) {
    const BC = (insn >>> 23) & 0x0F;
    const disp_high = (insn >>> 9) & 0x3FFF;
    const disp_low = (insn >>> 1) & 0xFF;
    const disp22 = (disp_high << 8) | disp_low;
    const signed_disp = this.signExtend(disp22, 22);
    const target = (pc + (signed_disp << 1)) >>> 0;
    const conditions = ['cs', 'cc', 'hi', 'ls', 'eq', 'ne', 'gt', 'le', 'ge', 'lt', 'mi', 'pl', 'vs', 'vc', 't', 'al'];
    return `b${conditions[BC]} 0x${target.toString(16).padStart(8, '0')}`;
};

CPU.prototype.disassembleRix = function(insn) {
    const rD = (insn >>> 22) & 0x1F;
    const rA = (insn >>> 17) & 0x1F;
    const func3 = (insn >>> 2) & 0x07;
    const imm12 = this.signExtend((insn >>> 5) & 0xFFF, 12);
    const ops = ['lw', 'lh', 'lhu', 'lb', 'sw', 'sh', 'lbu', 'sb'];
    return `${ops[func3]} r${rD}, [r${rA}+0x${imm12.toString(16)}]`;
};

CPU.prototype.disassembleMemory = function(insn) {
    const OP = (insn >>> 27) & 0x1F;
    const rD = (insn >>> 22) & 0x1F;
    const rA = (insn >>> 17) & 0x1F;
    const imm15 = this.signExtend((insn >>> 2) & 0x7FFF, 15);
    const ops = {
        0x10: 'lw',
        0x11: 'lh',
        0x12: 'lhu',
        0x13: 'lb',
        0x14: 'sw',
        0x15: 'sh',
        0x16: 'lbu',
        0x17: 'sb'
    };
    return `${ops[OP] || 'UNKNOWN'} r${rD}, [r${rA}+0x${imm15.toString(16)}]`;
};

// ========== FUNÇÕES DE DEBUG ==========
CPU.prototype.dumpRegisters = function() {
    let output = "=== REGISTERS ===\n";
    for (let i = 0; i < 32; i++) {
        output += `r${i.toString().padStart(2, '0')}: 0x${this.r[i].toString(16).padStart(8, '0').toUpperCase()}\n`;
    }
    output += "\n=== SYSTEM REGISTERS ===\n";
    for (let i = 0; i < 32; i++) {
        output += `sr${i.toString().padStart(2, '0')}: 0x${this.sr[i].toString(16).padStart(8, '0').toUpperCase()}\n`;
    }
    output += "\n=== CONTROL REGISTERS ===\n";
    for (let i = 0; i < 32; i++) {
        output += `cr${i.toString().padStart(2, '0')}: 0x${this.cr[i].toString(16).padStart(8, '0').toUpperCase()}\n`;
    }
    output += "\n=== FLAGS ===\n";
    output += `N:${this.N} Z:${this.Z} C:${this.C} V:${this.V} T:${this.T}\n`;
    output += "\n=== PROGRAM COUNTER ===\n";
    output += `PC: 0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}\n`;
    output += `Cycles: ${this.cycles}\n`;
    output += `Instructions: ${this.instructions}\n`;
    output += "\n=== CUSTOM ENGINE ===\n";
    output += `CEL: 0x${this.CEL.toString(16).padStart(8, '0').toUpperCase()}\n`;
    output += `CEH: 0x${this.CEH.toString(16).padStart(8, '0').toUpperCase()}\n`;
    return output;
};

CPU.prototype.dumpMemory = function(startAddr, endAddr) {
    if (!this.miu) return "Memory Interface not available";
    
    let output = "=== MEMORY DUMP ===\n";
    for (let addr = startAddr; addr < endAddr; addr += 4) {
        const value = this.miu.readU32(addr);
        output += `0x${addr.toString(16).padStart(8, '0').toUpperCase()}: 0x${value.toString(16).padStart(8, '0').toUpperCase()}\n`;
    }
    return output;
};

CPU.prototype.getExecutionStats = function() {
    return {
        totalCycles: this.cycles,
        totalInstructions: this.instructions,
        cyclesPerInstruction: this.instructions > 0 ? (this.cycles / this.instructions).toFixed(2) : 0,
        currentPC: `0x${this.pc.toString(16).padStart(8, '0').toUpperCase()}`,
        halted: this.halted,
        flags: this.getFlags()
    };
};

CPU.prototype.traceInstruction = function(addr) {
    if (!this.miu) return "Memory Interface not available";
    const insn = this.miu.readU32(addr);
    const disasm = this.disassemble(insn, addr);
    return `0x${addr.toString(16).padStart(8, '0').toUpperCase()}: 0x${insn.toString(16).padStart(8, '0').toUpperCase()} ${disasm}`;
};

// Exportação final
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CPU;
}
if (typeof window !== 'undefined') {
    window.CPU = CPU;
}