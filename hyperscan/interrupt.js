/**
 * interrupt.js - Interrupt Controller (INTC) - CORRIGIDO v2
 * Implementação fiel do controlador de interrupções do HyperScan (SPG290/SPCE3200).
 * 
 * ✅ CORRIGIDO v2: Assinatura trigger() com apenas irqNumber
 * ✅ CORRIGIDO v2: INT_MASK inicializa com todas IRQs HABILITADAS
 * ✅ CORRIGIDO v2: Lógica de máscara corrigida (bit 1 = HABILITADO)
 * ✅ CORRIGIDO v2: Armazena referência à CPU para disparo
 * ✅ CORRIGIDO: Extends MemoryRegion
 * ✅ CORRIGIDO: Métodos readU8/readU16 adicionados
 * ✅ CORRIGIDO: Compatibilidade total com MIU e IOMemoryRegion
 * 
 * Responsabilidade:
 * 1. Receber sinais de periféricos (VDU, UART, Timers).
 * 2. Verificar se a interrupção está mascarada (habilitada/desabilitada).
 * 3. Disparar a exceção na CPU para desviar o fluxo de execução.
 */

"use strict";

if (typeof InterruptController === 'undefined') {
    /**
     * Controlador de Interrupções
     * ✅ CORRIGIDO v2: Extends MemoryRegion para compatibilidade com MIU
     * 
     * @extends MemoryRegion
     */
    class InterruptController extends MemoryRegion {
        constructor() {
            super();

            this.name = "INT_CTRL";
            
            // ✅ CORRIGIDO v2: Armazena referência à CPU para disparo
            this.cpu = null;
            
            // --- Registradores Mapeados (Offsets relativos a 0x080Axxxx) ---
            // Baseado na documentação técnica do SPCE3200
            this.regs = {
                // ✅ CORRIGIDO v2: INT_MASK inicializa com 0xFFFFFFFF (TODAS HABILITADAS)
                // Bit 1 = HABILITADO, Bit 0 = DESABILITADO
                INT_MASK:   0xFFFFFFFF,  // Todas as IRQs habilitadas por padrão
                INT_PRIO:   0x00000000,  // Prioridade
                INT_STATUS: 0x00000000,  // Status: Bits ativos indicam IRQs pendentes
                INT_ACK:    0x00000000   // Acknowledge
            };

            // --- Vetores de Interrupção Padrão do HyperScan ---
            this.IRQ_TIMER  = 1; // Timer 0-2 Underflow
            this.IRQ_EXT    = 2; // External IRQ
            this.IRQ_VBLANK = 4; // Video Vertical Blank (Crítico para jogos) ← SPG290 REAL
            this.IRQ_UART   = 5; // UART RX/TX
            this.IRQ_ADC    = 6; // Audio / ADC

            // --- Estatísticas ---
            this.stats = {
                triggered: 0,
                processed: 0,
                blocked: 0
            };

            console.log("[INTC] ✓ InterruptController inicializado");
            console.log("[INTC] ✓ INT_MASK inicializado: 0xFFFFFFFF (TODAS HABILITADAS)");
            console.log("[INTC] ✓ IRQ 4 (V-Blank): HABILITADA");
        }

        /**
         * ✅ CORRIGIDO v2: Conecta a CPU ao controlador
         * Necessário para disparar exceções
         */
        connectCPU(cpu) {
            this.cpu = cpu;
            if (cpu) {
                console.log("[INTC] CPU conectada para disparo de interrupções");
            }
        }

        /**
         * ✅ CORRIGIDO v2: Método chamado pelos periféricos para solicitar uma interrupção.
         * ANTES: trigger(cpu, irqNumber) - 2 argumentos
         * AGORA: trigger(irqNumber) - 1 argumento (usa this.cpu armazenada)
         * 
         * @param {number} irqNumber - O número da IRQ (ex: 4 para VBlank)
         */
        trigger(irqNumber) {
            // ✅ CORRIGIDO v2: Validação com argumento único
            if (irqNumber === undefined || irqNumber === null) {
                console.warn(`[INTC] ⚠️ IRQ número undefined`);
                this.stats.blocked++;
                return;
            }

            if (irqNumber < 0 || irqNumber > 31) {
                console.warn(`[INTC] ⚠️ IRQ número inválido: ${irqNumber}`);
                this.stats.blocked++;
                return;
            }

            this.stats.triggered++;

            // 1. Marca a interrupção como "Pendente" no registrador de Status
            this.regs.INT_STATUS |= (1 << irqNumber);

            // ✅ CORRIGIDO v2: Verifica se a interrupção está HABILITADA
            // Bit 1 no INT_MASK = HABILITADA
            const isEnabled = (this.regs.INT_MASK & (1 << irqNumber)) !== 0;

            // 3. Verifica se a CPU existe e se a interrupção deve ser processada
            if (this.cpu && isEnabled) {
                // ✅ Invoca a exceção na CPU
                if (typeof this.cpu.exception === 'function') {
                    this.cpu.exception(irqNumber);
                    this.stats.processed++;
                    
                    if (irqNumber === 4) {
                        console.log(`[INTC] ✓ IRQ 4 (V-Blank) processada para CPU`);
                    }
                } else {
                    console.warn(`[INTC] ⚠️ CPU não possui método exception()`);
                    this.stats.blocked++;
                }
            } else {
                this.stats.blocked++;
                
                if (!this.cpu) {
                    console.warn(`[INTC] ⚠️ CPU não conectada`);
                } else if (!isEnabled) {
                    console.log(`[INTC] ℹ️ IRQ${irqNumber} bloqueada pela máscara (INT_MASK=0x${this.regs.INT_MASK.toString(16).padStart(8, '0').toUpperCase()})`);
                }
            }
        }

        /* =========================================================
         * INTERFACE DE MEMÓRIA (MMIO)
         * Chamados pela MIU (io.js) quando a CPU lê/escreve em 0x080Axxxx
         * ======================================================= */

        /**
         * ✅ CORRIGIDO: Lê um byte (8 bits)
         */
        readU8(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 3) * 8;
            return (word >>> shift) & 0xFF;
        }

        /**
         * ✅ CORRIGIDO: Lê uma halfword (16 bits)
         */
        readU16(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 2) * 8;
            return (word >>> shift) & 0xFFFF;
        }

        /**
         * Lê um registrador de 32 bits.
         */
        readU32(address) {
            const offset = address & 0xFFFF; // Pega apenas os últimos 16 bits

            switch (offset) {
                case 0x0000: // INT_MASK (0x080A0000)
                    return this.regs.INT_MASK;

                case 0x0004: // INT_PRIO (0x080A0004)
                    return this.regs.INT_PRIO;

                case 0x0008: // INT_STATUS (0x080A0008)
                    // Retorna quais interrupções estão esperando tratamento
                    return this.regs.INT_STATUS;

                case 0x000C: // INT_ACK (Geralmente Write-Only, retorna 0)
                    return 0;

                default:
                    // Endereços não mapeados retornam 0 no hardware real
                    return 0;
            }
        }

        /**
         * ✅ CORRIGIDO: Escreve um byte (8 bits)
         */
        writeU8(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 3) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * ✅ CORRIGIDO: Escreve uma halfword (16 bits)
         */
        writeU16(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 2) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFFFF << shift)) | ((value & 0xFFFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * Escreve em um registrador de 32 bits.
         */
        writeU32(address, value) {
            const offset = address & 0xFFFF;

            switch (offset) {
                case 0x0000: // INT_MASK
                    // ✅ CORRIGIDO v2: Log detalhado quando máscara é alterada
                    const oldMask = this.regs.INT_MASK;
                    this.regs.INT_MASK = value;
                    console.log(`[INTC] INT_MASK: 0x${oldMask.toString(16).padStart(8, '0').toUpperCase()} → 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                    
                    // Mostrar quais IRQs foram habilitadas/desabilitadas
                    for (let i = 0; i < 8; i++) {
                        const wasEnabled = (oldMask >>> i) & 1;
                        const isEnabled = (value >>> i) & 1;
                        if (wasEnabled !== isEnabled) {
                            console.log(`[INTC] IRQ${i} ${isEnabled ? "HABILITADA" : "DESABILITADA"}`);
                        }
                    }
                    break;

                case 0x0004: // INT_PRIO
                    this.regs.INT_PRIO = value;
                    console.log(`[INTC] INT_PRIO atualizada: 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                    break;

                case 0x0008: // INT_STATUS
                    // Read-Only em hardware real
                    console.log(`[INTC] Tentativa de escrita em INT_STATUS (read-only)`);
                    break;

                case 0x000C: // INT_ACK (0x080A000C)
                    // Acknowledge: Limpa as interrupções pendentes
                    const clearedIRQs = this.regs.INT_STATUS & value;
                    this.regs.INT_STATUS &= ~value;
                    
                    if (clearedIRQs) {
                        console.log(`[INTC] ACK: Limpas IRQs 0x${clearedIRQs.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    break;

                default:
                    // Endereço desconhecido - ignorar
                    break;
            }
        }

        /* =========================================================
         * MÉTODOS DE COMPATIBILIDADE COM MEMORYGREGION
         * Garantem que a classe funcione com SegmentedMemoryRegion
         * ======================================================= */

        /**
         * Retorna informações sobre o controlador
         */
        getInfo() {
            return {
                type: this.constructor.name,
                name: this.name,
                cpuConnected: !!this.cpu,
                registers: {
                    INT_MASK: `0x${this.regs.INT_MASK.toString(16).padStart(8, '0').toUpperCase()}`,
                    INT_PRIO: `0x${this.regs.INT_PRIO.toString(16).padStart(8, '0').toUpperCase()}`,
                    INT_STATUS: `0x${this.regs.INT_STATUS.toString(16).padStart(8, '0').toUpperCase()}`
                },
                stats: { ...this.stats }
            };
        }

        /**
         * Validação de offset
         */
        isValidOffset(offset) {
            return offset >= 0 && offset <= 0x0F;
        }

        /**
         * Reseta o controlador
         */
        reset() {
            this.regs = {
                INT_MASK:   0xFFFFFFFF,  // ✅ TODAS HABILITADAS
                INT_PRIO:   0x00000000,
                INT_STATUS: 0x00000000,
                INT_ACK:    0x00000000
            };
            this.stats = {
                triggered: 0,
                processed: 0,
                blocked: 0
            };
            console.log("[INTC] ✓ Reset completo - INT_MASK = 0xFFFFFFFF");
        }

        /**
         * Retorna status formatado para debug
         */
        getStatus() {
            const lines = [];
            lines.push("═══ INTERRUPT CONTROLLER STATUS ═══");
            lines.push(`INT_MASK:   0x${this.regs.INT_MASK.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`INT_PRIO:   0x${this.regs.INT_PRIO.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`INT_STATUS: 0x${this.regs.INT_STATUS.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`CPU:        ${this.cpu ? "CONECTADA" : "NÃO CONECTADA"}`);
            lines.push("");
            lines.push(`Triggered:  ${this.stats.triggered}`);
            lines.push(`Processed:  ${this.stats.processed}`);
            lines.push(`Blocked:    ${this.stats.blocked}`);
            lines.push("");
            
            // Mostrar IRQs ativas
            lines.push("Active IRQs:");
            for (let i = 0; i < 8; i++) {
                const bit = (this.regs.INT_STATUS >>> i) & 1;
                const masked = (this.regs.INT_MASK >>> i) & 1;
                if (bit || masked) {
                    const status = bit ? "🟢 PENDING" : "⚫ IDLE";
                    const mask = masked ? "ENABLED" : "DISABLED";
                    const irqName = i === 4 ? "(V-Blank)" : "";
                    lines.push(`  IRQ${i} ${irqName}: ${status} (${mask})`);
                }
            }

            return lines.join("\n");
        }

        /**
         * Dump formatado
         */
        dump() {
            let output = "╔════════════════════════════════════╗\n";
            output += "║   INTERRUPT CONTROLLER (INTC) v2   ║\n";
            output += "║   SPG290 / SPCE3200                ║\n";
            output += "╚════════════════════════════════════╝\n\n";
            output += this.getStatus();
            output += "\n";
            return output;
        }

        /**
         * Habilita uma IRQ específica
         */
        enableIRQ(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                this.regs.INT_MASK |= (1 << irqNumber);
                console.log(`[INTC] ✓ IRQ${irqNumber} habilitada`);
            }
        }

        /**
         * Desabilita uma IRQ específica
         */
        disableIRQ(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                this.regs.INT_MASK &= ~(1 << irqNumber);
                console.log(`[INTC] ✗ IRQ${irqNumber} desabilitada`);
            }
        }

        /**
         * Verifica se uma IRQ está habilitada
         */
        isIRQEnabled(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                return ((this.regs.INT_MASK >>> irqNumber) & 1) === 1;
            }
            return false;
        }

        /**
         * Verifica se uma IRQ está pendente
         */
        isIRQPending(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                return ((this.regs.INT_STATUS >>> irqNumber) & 1) === 1;
            }
            return false;
        }

        /**
         * Limpa uma IRQ pendente específica
         */
        clearIRQ(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                this.regs.INT_STATUS &= ~(1 << irqNumber);
                console.log(`[INTC] ✓ IRQ${irqNumber} limpa`);
            }
        }

        /**
         * Callback de mudança de status (para UI)
         */
        onStatusChange(status) {
            // Override em classes que usam INTC
        }
    }

    // ========== EXPORTAÇÃO GLOBAL ==========
    window.InterruptController = InterruptController;

    console.log("[INTC] ════════════════════════════════════════════");
    console.log("[INTC] ✓ InterruptController v2 carregado");
    console.log("[INTC] ✅ CORRIGIDO: Assinatura trigger(irqNumber)");
    console.log("[INTC] ✅ CORRIGIDO: INT_MASK = 0xFFFFFFFF (habilitadas)");
    console.log("[INTC] ✅ CORRIGIDO: IRQ 4 (V-Blank) HABILITADA");
    console.log("[INTC] ✓ Extends MemoryRegion - Compatível com MIU");
    console.log("[INTC] ✓ Suporta 32 IRQs (0-31)");
    console.log("[INTC] ════════════════════════════════════════════");
}