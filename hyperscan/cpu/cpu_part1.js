/**
 * SPCE3200 CPU - HyperScan Emulator - PARTE 1
 * Inicialização, Operações Aritméticas, Lógicas e de Bit
 * 100% COMPLETO E CORRIGIDO
 */

"use strict";

class CPU {
    constructor(miu = null) {
        this.miu = miu;
        this.reset();
    }

    reset() {
        this.r = new Uint32Array(32);
        this.r[0] = 0; // R0 sempre zero
        this.cr = new Uint32Array(32);
        this.sr = new Uint32Array(32);
        this.CEL = 0;
        this.CEH = 0;
        this.pc = 0;
        this.N = 0;
        this.Z = 0;
        this.C = 0;
        this.V = 0;
        this.T = 0;
        this.cycles = 0;
        this.instructions = 0;
        this.halted = false;
    }

    // ========== GETTERS E SETTERS ==========
    getPC() { return this.pc; }
    setPC(addr) { this.pc = addr >>> 0; }
    
    getRegister(idx) { 
        return (idx >= 0 && idx < 32) ? this.r[idx] >>> 0 : 0; 
    }
    
    setRegister(idx, value) { 
        if (idx > 0 && idx < 32) { // R0 é read-only, sempre zero
            this.r[idx] = value >>> 0; 
        }
    }
    
    getSystemRegister(idx) { 
        return (idx >= 0 && idx < 32) ? this.sr[idx] >>> 0 : 0; 
    }
    
    setSystemRegister(idx, value) { 
        if (idx >= 0 && idx < 32) { 
            this.sr[idx] = value >>> 0; 
            if (idx === 0) this.unpackSR0(); 
        } 
    }
    
    getControlRegister(idx) { 
        return (idx >= 0 && idx < 32) ? this.cr[idx] >>> 0 : 0; 
    }
    
    setControlRegister(idx, value) { 
        if (idx >= 0 && idx < 32) this.cr[idx] = value >>> 0; 
    }
    
    getFlags() { 
        return { N: this.N, Z: this.Z, C: this.C, V: this.V, T: this.T }; 
    }

    // ========== SIGN EXTENSION CORRIGIDA ==========
    signExtend(x, b) {
        if (b >= 32) return x >>> 0;
        x = x & ((1 << b) - 1);
        if (x & (1 << (b - 1))) {
            x |= (-1 << b);
        }
        return x >>> 0;
    }

    // ========== GERENCIAMENTO DE FLAGS ==========
    updateBasicFlags(res) {
        res = res >>> 0;
        this.N = (res >>> 31) & 1;
        this.Z = (res === 0) ? 1 : 0;
    }

    packSR0() {
        this.sr[0] = ((this.N & 1) << 31) | ((this.Z & 1) << 30) | 
                     ((this.C & 1) << 29) | ((this.V & 1) << 28) | 
                     (this.T & 1);
    }

    unpackSR0() {
        const v = this.sr[0] >>> 0;
        this.N = (v >>> 31) & 1;
        this.Z = (v >>> 30) & 1;
        this.C = (v >>> 29) & 1;
        this.V = (v >>> 28) & 1;
        this.T = (v >>> 0) & 1;
    }

    // ========== OPERAÇÕES ARITMÉTICAS ==========
    add(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let res = (a + b) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (b > (0xFFFFFFFF - a)) ? 1 : 0;
            this.V = ((~(a ^ b) & (a ^ res)) >>> 31) & 1;
        }
        return res;
    }

    addc(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let res = (a + b + this.C) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((b + this.C) > (0xFFFFFFFF - a)) ? 1 : 0;
            this.V = ((~(a ^ b) & (a ^ res)) >>> 31) & 1;
        }
        return res;
    }

    sub(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let res = (a - b) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (a >= b) ? 1 : 0;
            this.V = (((a ^ b) & ~(res ^ b)) >>> 31) & 1;
        }
        return res;
    }

    subc(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let borrow = (this.C === 0) ? 1 : 0;
        let res = (a - b - borrow) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (a >= (b + borrow)) ? 1 : 0;
            this.V = (((a ^ b) & ~(res ^ b)) >>> 31) & 1;
        }
        return res;
    }

    neg(a, updateFlags = false) {
        a = a >>> 0;
        let res = (0 - a) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (a === 0) ? 1 : 0;
            this.V = (a === 0x80000000) ? 1 : 0;
        }
        return res;
    }

    // ========== OPERAÇÕES LÓGICAS ==========
    bitOp(a, b, type, updateFlags = false) {
        let res = 0;
        switch(type) {
            case 'and': res = (a & b) >>> 0; break;
            case 'or':  res = (a | b) >>> 0; break;
            case 'xor': res = (a ^ b) >>> 0; break;
            case 'not': res = (~a) >>> 0; break;
        }
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    // ========== OPERAÇÕES DE SHIFT ==========
    sll(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        let res = (a << sa) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            if (sa > 0) this.C = ((a >>> (32 - sa)) & 1);
        }
        return res;
    }

    srl(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        let res = (a >>> sa) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            if (sa > 0) this.C = ((a >>> (sa - 1)) & 1);
        }
        return res;
    }

    sra(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        let res = ((a | 0) >> sa) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            if (sa > 0) this.C = ((a >>> (sa - 1)) & 1);
        }
        return res;
    }

    // ========== OPERAÇÕES DE ROTATE ==========
    ror(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        if (sa === 0) return a;
        let res = ((a >>> sa) | (a << (32 - sa))) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((a >>> (sa - 1)) & 1);
        }
        return res;
    }

    rol(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        if (sa === 0) return a;
        let res = ((a << sa) | (a >>> (32 - sa))) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((a >>> (32 - sa)) & 1);
        }
        return res;
    }

    rorc(a, updateFlags = false) {
        a = a >>> 0;
        let res = ((a >>> 1) | ((this.C & 1) << 31)) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = a & 1;
        }
        return res;
    }

    rolc(a, updateFlags = false) {
        a = a >>> 0;
        let res = ((a << 1) | (this.C & 1)) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((a >>> 31) & 1);
        }
        return res;
    }

    // ========== OPERAÇÕES DE EXTENSÃO ==========
    extsb(a, updateFlags = false) {
        let res = (a | 0) & 0xFF;
        if (res & 0x80) res = res | 0xFFFFFF00;
        res = res >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    extsh(a, updateFlags = false) {
        let res = (a | 0) & 0xFFFF;
        if (res & 0x8000) res = res | 0xFFFF0000;
        res = res >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    extzb(a, updateFlags = false) {
        let res = a & 0xFF;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    extzh(a, updateFlags = false) {
        let res = a & 0xFFFF;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    // ========== OPERAÇÕES DE BIT ==========
    bitclr(a, bitIdx, updateFlags = false) {
        bitIdx = bitIdx & 0x1F;
        let res = (a & ~(1 << bitIdx)) >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    bitset(a, bitIdx, updateFlags = false) {
        bitIdx = bitIdx & 0x1F;
        let res = (a | (1 << bitIdx)) >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    bittst(a, bitIdx) {
        bitIdx = bitIdx & 0x1F;
        this.T = ((a & (1 << bitIdx)) !== 0) ? 1 : 0;
        this.Z = this.T ? 0 : 1;
    }

    bittgl(a, bitIdx, updateFlags = false) {
        bitIdx = bitIdx & 0x1F;
        let res = (a ^ (1 << bitIdx)) >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    // ========== CONDIÇÕES ==========
    conditional(cond) {
        cond = cond & 0x0F;
        switch(cond) {
            case 0x00: return (this.C === 1);           // cs (carry set)
            case 0x01: return (this.C === 0);           // cc (carry clear)
            case 0x02: return (this.C === 1 && this.Z === 0);  // hi (higher)
            case 0x03: return (this.C === 0 || this.Z === 1);  // ls (lower or same)
            case 0x04: return (this.Z === 1);           // eq (equal)
            case 0x05: return (this.Z === 0);           // ne (not equal)
            case 0x06: return (this.N === this.V && this.Z === 0); // gt (greater)
            case 0x07: return (this.N !== this.V || this.Z === 1); // le (less or equal)
            case 0x08: return (this.N === this.V);      // ge (greater or equal)
            case 0x09: return (this.N !== this.V);      // lt (less than)
            case 0x0A: return (this.N === 1);           // mi (minus/negative)
            case 0x0B: return (this.N === 0);           // pl (plus/positive)
            case 0x0C: return (this.V === 1);           // vs (overflow set)
            case 0x0D: return (this.V === 0);           // vc (overflow clear)
            case 0x0E: return (this.T === 1);           // t (test bit)
            case 0x0F: return true;                     // al (always)
        }
        return false;
    }

    // ========== MULTIPLICAÇÃO E DIVISÃO ==========
    execMul(a, b) {
        let sA = a | 0;
        let sB = b | 0;
        let valA = BigInt(sA);
        let valB = BigInt(sB);
        let res = valA * valB;
        this.CEL = Number(res & 0xFFFFFFFFn) >>> 0;
        this.CEH = Number((res >> 32n) & 0xFFFFFFFFn) >>> 0;
    }

    execMulu(a, b) {
        let valA = BigInt(a >>> 0);
        let valB = BigInt(b >>> 0);
        let res = valA * valB;
        this.CEL = Number(res & 0xFFFFFFFFn) >>> 0;
        this.CEH = Number((res >> 32n) & 0xFFFFFFFFn) >>> 0;
    }

    execDiv(a, b) {
        let sA = a | 0;
        let sB = b | 0;
        if (sB !== 0) {
            this.CEL = Math.trunc(sA / sB) >>> 0;
            this.CEH = (sA % sB) >>> 0;
        }
    }

    execDivu(a, b) {
        let uA = a >>> 0;
        let uB = b >>> 0;
        if (uB !== 0) {
            this.CEL = Math.floor(uA / uB) >>> 0;
            this.CEH = (uA % uB) >>> 0;
        }
    }

    // ========== OPERAÇÕES COM CE (CUSTOM ENGINE) ==========
    moveFromCE(rD, rB) {
        rB = rB & 0x03;
        switch(rB) {
            case 1: this.setRegister(rD, this.CEL); break;
            case 2: this.setRegister(rD, this.CEH); break;
            case 3:
                this.setRegister(rD, this.CEL);
                if (rD < 31) this.setRegister(rD + 1, this.CEH);
                break;
        }
    }

    moveToCE(rD, rB) {
        rB = rB & 0x03;
        switch(rB) {
            case 1: this.CEL = this.r[rD]; break;
            case 2: this.CEH = this.r[rD]; break;
            case 3:
                this.CEL = this.r[rD];
                if (rD < 31) this.CEH = this.r[rD + 1];
                break;
        }
    }
}

// ========== BREAKPOINT SYSTEM ==========

if (typeof BreakpointManager === 'undefined') {
    class BreakpointManager {
        constructor(cpu) {
            this.cpu = cpu;
            this.breakpoints = new Map();
            this.watchpoints = new Map();
            this.conditionBreakpoints = new Map();
            this.hitStatistics = new Map();
            this.paused = false;
            this.lastBreakpoint = null;
        }

        addBreakpoint(addr) {
            addr = addr >>> 0;
            
            if (this.breakpoints.has(addr)) {
                return false;
            }

            this.breakpoints.set(addr, {
                addr: addr,
                enabled: true,
                hitCount: 0,
                callback: null,
                condition: null,
                temporary: false
            });

            this.hitStatistics.set(addr, {
                totalHits: 0,
                lastHit: null,
                history: []
            });

            return true;
        }

        addConditionalBreakpoint(addr, condition) {
            addr = addr >>> 0;
            
            if (!this.breakpoints.has(addr)) {
                this.addBreakpoint(addr);
            }

            const bp = this.breakpoints.get(addr);
            bp.condition = condition;
            return true;
        }

        addTemporaryBreakpoint(addr) {
            addr = addr >>> 0;
            this.addBreakpoint(addr);
            const bp = this.breakpoints.get(addr);
            bp.temporary = true;
            return true;
        }

        setBreakpointCallback(addr, callback) {
            addr = addr >>> 0;
            
            if (!this.breakpoints.has(addr)) {
                this.addBreakpoint(addr);
            }

            this.breakpoints.get(addr).callback = callback;
            return true;
        }

        removeBreakpoint(addr) {
            addr = addr >>> 0;
            return this.breakpoints.delete(addr);
        }

        listBreakpoints() {
            const list = [];
            this.breakpoints.forEach((bp, addr) => {
                list.push({
                    address: `0x${addr.toString(16).padStart(8, '0').toUpperCase()}`,
                    enabled: bp.enabled,
                    hitCount: bp.hitCount,
                    temporary: bp.temporary,
                    hasCondition: bp.condition !== null,
                    hasCallback: bp.callback !== null
                });
            });
            return list;
        }

        hasBreakpoint(addr) {
            return this.breakpoints.has(addr >>> 0);
        }

        checkBreakpoint(addr) {
            addr = addr >>> 0;

            if (!this.breakpoints.has(addr)) {
                return false;
            }

            const bp = this.breakpoints.get(addr);

            if (!bp.enabled) {
                return false;
            }

            if (bp.condition) {
                try {
                    if (!bp.condition(this.cpu)) {
                        return false;
                    }
                } catch (e) {
                    console.error("Erro em breakpoint condition:", e);
                    return false;
                }
            }

            bp.hitCount++;

            const stats = this.hitStatistics.get(addr);
            stats.totalHits++;
            stats.lastHit = Date.now();
            stats.history.push({
                timestamp: Date.now(),
                pc: this.cpu.pc,
                registers: Array.from(this.cpu.r),
                flags: this.cpu.getFlags()
            });

            if (stats.history.length > 100) {
                stats.history.shift();
            }

            if (bp.callback) {
                try {
                    bp.callback(this.cpu, bp);
                } catch (e) {
                    console.error("Erro em breakpoint callback:", e);
                }
            }

            if (bp.temporary) {
                this.removeBreakpoint(addr);
            }

            this.lastBreakpoint = {
                address: addr,
                hitCount: bp.hitCount,
                timestamp: Date.now()
            };

            return true;
        }

        removeWatchpoint(addr) {
            return this.watchpoints.delete(addr >>> 0);
        }

        getBreakpointStats(addr) {
            addr = addr >>> 0;
            return this.hitStatistics.get(addr) || null;
        }

        clearAll() {
            this.breakpoints.clear();
            this.watchpoints.clear();
            this.hitStatistics.clear();
            this.lastBreakpoint = null;
            return true;
        }

        setEnabled(addr, enabled) {
            addr = addr >>> 0;
            
            if (this.breakpoints.has(addr)) {
                this.breakpoints.get(addr).enabled = enabled;
                return true;
            }
            return false;
        }

        // ✅ ESTE MÉTODO ESTAVA FORA DA CLASSE - AGORA ESTÁ DENTRO!
        getBreakpointInfo(addr) {
            addr = addr >>> 0;
            const bp = this.breakpoints.get(addr);
            
            if (!bp) return null;

            const stats = this.hitStatistics.get(addr) || {};

            return {
                address: `0x${addr.toString(16).padStart(8, '0').toUpperCase()}`,
                enabled: bp.enabled,
                temporary: bp.temporary,
                hitCount: bp.hitCount,
                totalHits: stats.totalHits || 0,
                lastHit: stats.lastHit || null,
                hasCondition: bp.condition !== null,
                hasCallback: bp.callback !== null,
                recentHistory: stats.history ? stats.history.slice(-5) : []
            };
        }

        resetHitCounts() {
            this.breakpoints.forEach(bp => {
                bp.hitCount = 0;
            });
            return true;
        }
    }
}

CPU.prototype.setupBreakpointSystem = function() {
    if (this.breakpointManager) return this.breakpointManager;

    this.breakpointManager = new BreakpointManager(this);
    return this.breakpointManager;
};

// Exportação
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CPU;
}
if (typeof window !== 'undefined') {
    window.CPU = CPU;
}