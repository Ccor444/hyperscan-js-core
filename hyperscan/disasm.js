/**
 * SPCE3200 Disassembler (HyperScan)
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * 
 * Compatível com:
 * - docs/instruction_table32.txt (oficial)
 * - docs/SPCE3200_priciple.pdf
 * - docs/spce3200.pdf
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * PARTE 1: Mapeamento de Registradores e Auxiliares
 * PARTE 2: Decodificação de Instruções 32-bit (OP 0x00-0x1F)
 * PARTE 3: Decodificação de Instruções 16-bit (OP 0x0-0x7)
 * PARTE 4: Disassembler Principal (Fetch & Decode)
 */

"use strict";

/**
 * Mapeamento completo de condições SPCE3200
 * Baseado em: docs/instruction_table32.txt
 */
const CONDITION_CODES = {
    0x0: 'cs',   // Carry Set (Higher or Same)
    0x1: 'cc',   // Carry Clear (Lower)
    0x2: 'hi',   // Higher
    0x3: 'ls',   // Lower or Same
    0x4: 'eq',   // Equal (Zero)
    0x5: 'ne',   // Not Equal
    0x6: 'gt',   // Greater Than (signed)
    0x7: 'le',   // Less or Equal (signed)
    0x8: 'ge',   // Greater or Equal (signed)
    0x9: 'lt',   // Less Than (signed)
    0xA: 'mi',   // Minus (Negative)
    0xB: 'pl',   // Plus (Positive)
    0xC: 'vs',   // Overflow Set
    0xD: 'vc',   // Overflow Clear
    0xE: 't',    // True (T flag)
    0xF: 'al'    // Always
};

function getCond(cond) {
    return CONDITION_CODES[cond & 0x0F] || `unk_${cond}`;
}

// ========== PARTE 1: REGISTRADORES E AUXILIARES ==========

/**
 * Mapeamento de Registradores de Propósito Geral (r0-r31)
 */
const REGS = [];
for (let i = 0; i < 32; i++) {
    REGS.push(`r${i}`);
}

/**
 * Mapeamento de Registradores de Controle (cr0-cr31)
 */
const CREGS = [];
for (let i = 0; i < 32; i++) {
    CREGS.push(`cr${i}`);
}

/**
 * Mapeamento de Registradores de Sistema (sr0-sr31)
 */
const SREGS = [];
for (let i = 0; i < 32; i++) {
    SREGS.push(`sr${i}`);
}

/**
 * Mapeamento de Condições (compatível com CPU::conditional)
 * Baseado em instruction_table32.txt e cpu.cpp
 */
function getCond(cond) {
    const conditions = [
        "cs",     // 0x0: Carry Set / HS (Higher or Same)
        "cc",     // 0x1: Carry Clear / LO (Lower)
        "hi",     // 0x2: Higher (C && !Z)
        "ls",     // 0x3: Lower or Same (!C || Z)
        "eq",     // 0x4: Equal (Z)
        "ne",     // 0x5: Not Equal (!Z)
        "gt",     // 0x6: Greater Than (N == V && !Z)
        "le",     // 0x7: Less or Equal (N != V || Z)
        "ge",     // 0x8: Greater or Equal (N == V)
        "lt",     // 0x9: Less Than (N != V)
        "mi",     // 0xA: Minus (N)
        "pl",     // 0xB: Plus (!N)
        "vs",     // 0xC: Overflow Set (V)
        "vc",     // 0xD: Overflow Clear (!V)
        "t",      // 0xE: True (T flag)
        "al"      // 0xF: Always
    ];
    return conditions[cond & 0x0F] || `unk_${cond}`;
}

/**
 * Sign-extend um valor de b bits para signed 32-bit
 */
function signExtend(x, b) {
    const m = 1 << (b - 1);
    x = x & ((1 << b) - 1);
    return (x ^ m) - m;
}

/**
 * Formata número hexadecimal com padding
 */
function hex(val, width = 8) {
    return `0x${val.toString(16).padStart(width, '0').toUpperCase()}`;
}

/**
 * Formata endereço de salto
 */
function formatAddr(addr) {
    return hex(addr >>> 0, 8);
}

/**
 * Formata imediato com sign
 */
function formatImm(val) {
    if (val < 0) return `-${Math.abs(val).toString(16)}`;
    return `0x${val.toString(16)}`;
}

// ========== PARTE 2: DECODIFICAÇÃO 32-BIT ==========

class Disasm32 {
    constructor(insn, address) {
        this.insn = insn >>> 0;
        this.address = address >>> 0;
        this.OP = (this.insn >>> 27) & 0x1F;
    }

    /**
     * Extrai campos de registrador
     */
    getRD() { return (this.insn >>> 22) & 0x1F; }
    getRA() { return (this.insn >>> 17) & 0x1F; }
    getRB() { return (this.insn >>> 12) & 0x1F; }

    /**
     * Extrai campos específicos de formato
     */
    getFunc6() { return (this.insn >>> 1) & 0x3F; }
    getCU() { return this.insn & 1; }
    getDotC() { return this.getCU() ? ".c" : ""; }

    getFunc3() { return (this.insn >>> 19) & 0x07; }
    getImm16() { return this.signExtend((this.insn >>> 1) & 0xFFFF, 16); }
    getImm16Unsigned() { return (this.insn >>> 1) & 0xFFFF; }

    getDisp24() { return (this.insn >>> 1) & 0xFFFFFF; }
    getLK() { return this.insn & 1; }

    getImm12() { return this.signExtend((this.insn >>> 5) & 0xFFF, 12); }
    getFunc3RIX() { return (this.insn >>> 0) & 0x07; } // CORREÇÃO: bits 0-2

    // B-Form (OP=0x04) - CORRIGIDO
getBC() { return (this.insn >>> 4) & 0x0F; }  // ✓ CORRETO - Bits [7:4]
getDispB() {
    // Deslocamento de 22 bits: Bits [26:5]
    const disp22 = (this.insn >>> 5) & 0x3FFFFF;
    return this.signExtend(disp22, 22);
}
    getDisp19() { return this.getDispB(); }

    getImm15() { return this.signExtend((this.insn >>> 2) & 0x7FFF, 15); }

    getImm14() { return this.signExtend((this.insn >>> 2) & 0x3FFF, 14); }

    getCROP() { return (this.insn >>> 2) & 0xFF; }
    getCRA() { return (this.insn >>> 17) & 0x1F; }

    signExtend(x, b) {
        const m = 1 << (b - 1);
        x = x & ((1 << b) - 1);
        return (x ^ m) - m;
    }

    /**
     * Decodifica e retorna mnemônico legível
     */
    decode() {
        switch (this.OP) {
            case 0x00: return this.decodeSPForm();
            case 0x01:
            case 0x05: return this.decodeIForm();
            case 0x02: return this.decodeJForm();
            case 0x03:
            case 0x07: return this.decodeRixForm();
            case 0x04: return this.decodeBForm();
            case 0x06: return this.decodeCRForm();
            case 0x08:
            case 0x09:
            case 0x0A:
            case 0x0B: return this.decodeAddriForm();
            case 0x0C:
            case 0x0D:
            case 0x0E:
            case 0x0F: return this.decodeAndriOriForm();
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
            case 0x16:
            case 0x17: return this.decodeMemoryForm();
            default:
                return `UNKNOWN_OP${this.OP.toString(16).padStart(2, '0').toUpperCase()}`;
        }
    }

    // ========== SP-Form (OP=0x00) ==========
    decodeSPForm() {
        const rD = this.getRD();
        const rA = this.getRA();
        const rB = this.getRB();
        const func6 = this.getFunc6();
        const CU = this.getCU();
        const dotC = this.getDotC();

        switch (func6) {
            case 0x00: return "nop";
            case 0x01: return "syscall";
            case 0x02: return `trap${getCond(rB)}`;
            case 0x03: return "sdbbp";
            case 0x04: return `br${getCond(rB)}${CU ? 'l' : ''} ${REGS[rA]}`;
            case 0x05: return "pflush";
            case 0x06: return `alw ${REGS[rD]}, ${REGS[rA]}`;
            case 0x07: return `asw ${REGS[rD]}, ${REGS[rA]}`;
            case 0x08: return `add${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x09: return `addc${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x0A: return `sub${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x0B: return `subc${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x0C: return `cmp${dotC} ${REGS[rA]}, ${REGS[rB]}`;
            case 0x0D: return `cmpz${dotC} ${REGS[rA]}`;
            case 0x0E: return "ILLEGAL";
            case 0x0F: return `neg${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x10: return `and${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x11: return `or${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x12: return `not${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x13: return `xor${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x14: return `bitclr${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x15: return `bitset${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x16: return `bittst${dotC} ${REGS[rA]}, ${rB}`;
            case 0x17: return `bittgl${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x18: return `sll${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x19: return "ILLEGAL";
            case 0x1A: return `srl${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x1B: return `sra${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x1C: return `ror${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x1D: return `rorc${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x1E: return `rol${dotC} ${REGS[rD]}, ${REGS[rA]}, ${REGS[rB]}`;
            case 0x1F: return `rolc${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x20: return `mul ${REGS[rA]}, ${REGS[rB]}`;
            case 0x21: return `mulu ${REGS[rA]}, ${REGS[rB]}`;
            case 0x22: return `div ${REGS[rA]}, ${REGS[rB]}`;
            case 0x23: return `divu ${REGS[rA]}, ${REGS[rB]}`;
            case 0x24: {
                const sel = rB;
                if (sel === 1) return `mfce.l ${REGS[rD]}`;
                if (sel === 2) return `mfce.h ${REGS[rD]}`;
                if (sel === 3) return `mfce.d ${REGS[rD]}`;
                return `mfce ${REGS[rD]}, ${sel}`;
            }
            case 0x25: {
                const sel = rB;
                if (sel === 1) return `mtce.l ${REGS[rD]}`;
                if (sel === 2) return `mtce.h ${REGS[rD]}`;
                if (sel === 3) return `mtce.d ${REGS[rD]}`;
                return `mtce ${REGS[rD]}, ${sel}`;
            }
            case 0x26:
            case 0x27: return "ILLEGAL";
            case 0x28: return `mfsr ${REGS[rD]}, ${SREGS[rB]}`;
            case 0x29: return `mtsr ${SREGS[rB]}, ${REGS[rA]}`;
            case 0x2A: return `t${getCond(rB)}`;
            case 0x2B: return `mv${getCond(rB)} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x2C: return `extsb${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x2D: return `extsh${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x2E: return `extzb${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x2F: return `extzh${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x30: return `lcb ${REGS[rD]}, ${REGS[rA]}`;
            case 0x31: return `lcw ${REGS[rD]}, ${REGS[rA]}`;
            case 0x32: return "ILLEGAL";
            case 0x33: return `lce ${REGS[rD]}, ${REGS[rA]}`;
            case 0x34: return `scb ${REGS[rD]}, ${REGS[rA]}`;
            case 0x35: return `scw ${REGS[rD]}, ${REGS[rA]}`;
            case 0x36: return "ILLEGAL";
            case 0x37: return `sce ${REGS[rD]}, ${REGS[rA]}`;
            case 0x38: return `slli${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x39: return "ILLEGAL";
            case 0x3A: return `srli${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x3B: return `srai${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x3C: return `rori${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x3D: return `roric${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            case 0x3E: return `roli${dotC} ${REGS[rD]}, ${REGS[rA]}, ${rB}`;
            case 0x3F: return `rolic${dotC} ${REGS[rD]}, ${REGS[rA]}`;
            default: return `sp_unk_0x${func6.toString(16).padStart(2, '0').toUpperCase()}`;
        }
    }

    // ========== I-Form (OP=0x01, 0x05) ==========
    decodeIForm() {
        const rD = this.getRD();
        const func3 = this.getFunc3();
        const imm16 = this.getImm16();
        const imm16u = this.getImm16Unsigned();
        const CU = this.getCU();
        const dotC = this.getDotC();

        if (this.OP === 0x01) {
            // OP = 00001: Standard immediate
            switch (func3) {
                case 0x00: return `addi${dotC} ${REGS[rD]}, ${formatImm(imm16)}`;
                case 0x01: return "MISSING"; // func3=001 não definido
                case 0x02: return `cmpi${dotC} ${REGS[rD]}, ${formatImm(imm16)}`;
                case 0x03: return "MISSING"; // func3=011 não definido
                case 0x04: return `andi${dotC} ${REGS[rD]}, ${hex(imm16u, 4)}`;
                case 0x05: return `ori${dotC} ${REGS[rD]}, ${hex(imm16u, 4)}`;
                case 0x06: return `ldi ${REGS[rD]}, ${hex(imm16u, 4)}`;
                case 0x07: return "MISSING"; // func3=111 não definido
                default: return "IMPOSSIBLE";
            }
        } else if (this.OP === 0x05) {
            // OP = 00101: Shifted immediate
            const shifted = (imm16u << 16) >>> 0;
            switch (func3) {
                case 0x00: return `addis${dotC} ${REGS[rD]}, ${hex((imm16u << 16) >>> 0, 8)}`;
                case 0x01: return "MISSING";
                case 0x02: return `cmpis${dotC} ${REGS[rD]}, ${hex((imm16u << 16) >>> 0, 8)}`;
                case 0x03: return "MISSING";
                case 0x04: return `andis${dotC} ${REGS[rD]}, ${hex((imm16u << 16) >>> 0, 8)}`;
                case 0x05: return `oris${dotC} ${REGS[rD]}, ${hex((imm16u << 16) >>> 0, 8)}`;
                case 0x06: return `ldis ${REGS[rD]}, ${hex((imm16u << 16) >>> 0, 8)}`;
                case 0x07: return "MISSING";
                default: return "IMPOSSIBLE";
            }
        }
    }

    // ========== J-Form (OP=0x02) ==========
    decodeJForm() {
        const disp24 = this.getDisp24();
        const LK = this.getLK();
        const target = ((this.address & 0xFE000000) | (disp24 << 1)) >>> 0;
        
        return `j${LK ? 'l' : ''} ${formatAddr(target)}`;
    }

    // ========== RIX-Form (OP=0x03, 0x07) ==========
    decodeRixForm() {
        const rD = this.getRD();
        const rA = this.getRA();
        const imm12 = this.getImm12();
        const func3 = this.getFunc3RIX();

        const mnemonics = ["lw", "lh", "lhu", "lb", "sw", "sh", "lbu", "sb"];
        const mnem = mnemonics[func3];

        if (this.OP === 0x03) {
            // Pre-increment
            return `${mnem} ${REGS[rD]}, [${REGS[rA]} ${imm12 >= 0 ? '+' : ''}${formatImm(imm12)}]+`;
        } else {
            // Post-increment
            return `${mnem} ${REGS[rD]}, [${REGS[rA]}]+, ${formatImm(imm12)}`;
        }
    }

    // ========== B-Form (OP=0x04) - CORREÇÃO CRÍTICA ==========
    decodeBForm() {
        const BC = this.getBC();
        const disp19 = this.getDisp19();
        const LK = this.getLK();
        const target = (this.address + (disp19 << 1)) >>> 0;

        return `b${getCond(BC)}${LK ? 'l' : ''} ${formatAddr(target)}`;
    }

    // ========== CR-Form (OP=0x06) ==========
    decodeCRForm() {
        const rD = this.getRD();
        const crA = this.getCRA();
        const CR_OP = this.getCROP();

        switch (CR_OP) {
            case 0x00: return `mfcr ${REGS[rD]}, ${CREGS[crA]}`;
            case 0x01: return `mtcr ${CREGS[crA]}, ${REGS[rD]}`;
            case 0x84: return "rte";
            case 0x01: return "drte";
            case 0x02: return "sleep";
            default: return `cr_op_${CR_OP.toString(16).padStart(2, '0').toUpperCase()}`;
        }
    }

    // ========== ADDRI-Form (OP=0x08-0x0B) ==========
    decodeAddriForm() {
        const rD = this.getRD();
        const rA = this.getRA();
        const imm14 = this.getImm14();
        const CU = this.getCU();
        const dotC = this.getDotC();

        const mnem = ["addri", "addri", "addri", "addri"][this.OP - 0x08] || "addri";
        return `${mnem}${dotC} ${REGS[rD]}, ${REGS[rA]}, ${formatImm(imm14)}`;
    }

    // ========== ANDRI/ORRI-Form (OP=0x0C-0x0F) ==========
    decodeAndriOriForm() {
        const rD = this.getRD();
        const rA = this.getRA();
        const imm14 = this.getImm14();
        const CU = this.getCU();
        const dotC = this.getDotC();

        const mnemonics = ["andri", "orri", "??", "??"];
        const mnem = mnemonics[this.OP - 0x0C];

        return `${mnem}${dotC} ${REGS[rD]}, ${REGS[rA]}, ${hex(imm14 & 0x3FFF, 4)}`;
    }

    // ========== Memory-Form (OP=0x10-0x17) ==========
    decodeMemoryForm() {
        const rD = this.getRD();
        const rA = this.getRA();
        const imm15 = this.getImm15();

        const mnemonics = [
            "lw", "lh", "lhu", "lb",
            "sw", "sh", "lbu", "sb"
        ];

        const baseOp = this.OP - 0x10;
        const mnem = mnemonics[baseOp];

        return `${mnem} ${REGS[rD]}, [${REGS[rA]} ${imm15 >= 0 ? '+' : ''}${formatImm(imm15)}]`;
    }
}

// ========== PARTE 3: DECODIFICAÇÃO 16-BIT ==========

class Disasm16 {
    constructor(insn, address) {
        this.insn = insn & 0xFFFF;
        this.address = address >>> 0;
        this.OP = (this.insn >>> 13) & 0x07;
    }

    getRD() { return (this.insn >>> 1) & 0x0F; }
    getRA() { return (this.insn >>> 5) & 0x0F; }
    getFunc4() { return (this.insn >>> 9) & 0x0F; }

    getImm5() { return (this.insn >>> 5) & 0x1F; }
    getImm8() { return this.signExtend((this.insn >>> 5) & 0xFF, 8); }
    getImm11() { return this.signExtend((this.insn >>> 2) & 0x7FF, 11); }

    signExtend(x, b) {
        const m = 1 << (b - 1);
        x = x & ((1 << b) - 1);
        return (x ^ m) - m;
    }

    decode() {
        switch (this.OP) {
            case 0x00: return this.decodeFormat0();
            case 0x01: return this.decodeFormat1();
            case 0x02: return this.decodeFormat2();
            case 0x03: return this.decodeFormat3();
            case 0x04: return this.decodeFormat4();
            case 0x05: return this.decodeFormat5();
            case 0x06: return this.decodeFormat6();
            case 0x07: return this.decodeFormat7();
            default: return "IMPOSSIBLE";
        }
    }

    decodeFormat0() {
        const func4 = this.getFunc4();
        const rA = this.getRA();
        const rD = this.getRD();

        switch (func4) {
            case 0x00: return "nop!";
            case 0x01: return `mlfh! ${REGS[rD]}, ${REGS[rA + 16]}`;
            case 0x02: return `mhfl! ${REGS[rD + 16]}, ${REGS[rA]}`;
            case 0x03: return `mv! ${REGS[rD]}, ${REGS[rA]}`;
            case 0x04: return `br${getCond(rD)}! ${REGS[rA]}`;
            case 0x05: return `t${getCond(rD)}!`;
            case 0x0C: return `br${getCond(rD)}l! ${REGS[rA]}`;
            default: return `fmt0_unk_${func4.toString(16)}`;
        }
    }

    decodeFormat1() {
        const func4 = this.getFunc4();
        const rA = this.getRA();

        switch (func4) {
            case 0x00: return `mtce.l! ${REGS[rA]}`;
            case 0x01: return `mfce.l! ${REGS[rA]}`;
            default: return `fmt1_unk_${func4.toString(16)}`;
        }
    }

    decodeFormat2() {
        const func4 = this.getFunc4();
        const rA = this.getRA();
        const rD = this.getRD();

        const mnemonics = [
            "add!", "sub!", "neg!", "cmp!", 
            "and!", "or!", "not!", "xor!",
            "lw!", "lh!", "pop!", "lbu!",
            "sw!", "sh!", "push!", "sb!"
        ];

        return `${mnemonics[func4]}! ${REGS[rD]}, ${REGS[rA]}`;
    }

    decodeFormat3() {
        const imm11 = this.getImm11();
        const lk = (this.insn >>> 0) & 1;
        const target = (this.address + (imm11 << 1)) >>> 0;

        return `j${lk ? 'l' : ''}! ${formatAddr(target)}`;
    }

    decodeFormat4() {
        const imm8 = this.getImm8();
        const ec = (this.insn >>> 1) & 0x0F;
        const target = (this.address + (imm8 << 1)) >>> 0;

        return `b${getCond(ec)}! ${formatAddr(target)}`;
    }

    decodeFormat5() {
        const imm8 = (this.insn >>> 5) & 0xFF;
        const rD = this.getRD();

        return `ldiu! ${REGS[rD]}, ${hex(imm8, 2)}`;
    }

    decodeFormat6() {
        const func3 = (this.insn >>> 10) & 0x07;
        const imm5 = this.getImm5();
        const rD = this.getRD();

        switch (func3) {
            case 0x03: return `srli! ${REGS[rD]}, ${imm5}`;
            case 0x04: return `bitclr! ${REGS[rD]}, ${imm5}`;
            case 0x05: return `bitset! ${REGS[rD]}, ${imm5}`;
            case 0x06: return `bittst! ${REGS[rD]}, ${imm5}`;
            default: return `fmt6_unk_${func3.toString(16)}`;
        }
    }

    decodeFormat7() {
        const func3 = (this.insn >>> 10) & 0x07;
        const imm5 = this.getImm5();
        const rD = this.getRD();

        const mnemonics = ["lwp!", "lhp!", "??", "lbup!", "swp!", "shp!", "??", "sbp!"];

        return `${mnemonics[func3]} ${REGS[rD]}, ${imm5}`;
    }
}

// ========== PARTE 4: DISASSEMBLER PRINCIPAL ==========

class HyperscanDisassembler {
    constructor(miu) {
        this.miu = miu; // Memory Interface Unit
    }

    /**
     * Disassembla um endereço único (32-bit)
     */
    disasm32At(address) {
        if (!this.miu) {
            return { text: "ERROR: MIU not connected", bytes: 0 };
        }

        const insn = this.miu.readU32(address);
        const d = new Disasm32(insn, address);
        const text = d.decode();

        return {
            address: address,
            insn: insn,
            bytes: 4,
            text: text
        };
    }

    /**
     * Disassembla um endereço único (16-bit)
     */
    disasm16At(address) {
        if (!this.miu) {
            return { text: "ERROR: MIU not connected", bytes: 0 };
        }

        const insn = this.miu.readU16(address);
        const d = new Disasm16(insn, address);
        const text = d.decode();

        return {
            address: address,
            insn: insn,
            bytes: 2,
            text: text
        };
    }

    /**
     * Disassembla instrução (auto-detecta 16 ou 32 bits)
     */
    disasmAt(address) {
        if (!this.miu) {
            return { text: "ERROR: MIU not connected", bytes: 0 };
        }

        // Se PC desalinhado, é 16-bit
        if (address & 2) {
            return this.disasm16At(address);
        }

        // Fetch 32 bits e verifica flags
        const encoded = this.miu.readU32(address);
        const low = encoded & 0xFFFF;
        const high = (encoded >>> 16) & 0xFFFF;
        const p0 = (low >>> 15) & 1;
        const p1 = (high >>> 15) & 1;

        // Se p0=1, é instrução de 32 bits
        if (p0) {
            const insn32 = (high << 15) | (low & 0x7FFF);
            const d = new Disasm32(insn32, address);
            return {
                address: address,
                insn: insn32,
                bytes: 4,
                text: d.decode(),
                format: "32-bit"
            };
        }

        // Se p1=1, é paralelismo 16-bit
        if (p1) {
            return {
                address: address,
                insn: encoded,
                bytes: 4,
                text: `[parallel] select by T: low=${new Disasm16(low, address).decode()} / high=${new Disasm16(high, address).decode()}`,
                format: "16-bit parallel"
            };
        }

        // Padrão: 16-bit
        return this.disasm16At(address);
    }

    /**
     * Disassembla bloco de memória
     */
    disasmRange(startAddr, endAddr) {
        const results = [];
        let addr = startAddr;

        while (addr < endAddr) {
            const result = this.disasmAt(addr);
            results.push(result);
            addr += result.bytes;
        }

        return results;
    }

    /**
     * Disassembla N instruções
     */
    disasmCount(startAddr, count) {
        const results = [];
        let addr = startAddr;

        for (let i = 0; i < count; i++) {
            const result = this.disasmAt(addr);
            results.push(result);
            addr += result.bytes;
        }

        return results;
    }

    /**
     * Formata resultado para exibição
     */
    format(result) {
        return `${formatAddr(result.address)}: ${result.insn.toString(16).padStart(8, '0').toUpperCase()} | ${result.text}`;
    }

    /**
     * Disassembla e exibe
     */
    disasmPrint(startAddr, count = 10) {
        const results = this.disasmCount(startAddr, count);
        results.forEach(r => console.log(this.format(r)));
        return results;
    }
}


// ========== EXPORTAÇÃO ==========

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HyperscanDisassembler,
        Disasm32,
        Disasm16,
        getCond,
        signExtend,
        hex,
        formatAddr,
        formatImm
    };
}

if (typeof window !== 'undefined') {
    window.HyperscanDisassembler = HyperscanDisassembler;
    window.Disasm32 = Disasm32;
    window.Disasm16 = Disasm16;
    window.getCond = getCond;
    window.signExtend = signExtend;
    window.hex = hex;
    window.formatAddr = formatAddr;
    window.formatImm = formatImm;
}