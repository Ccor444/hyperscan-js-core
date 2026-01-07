/**
 * TIMER.JS - HyperScan Timer/Counter Module (CORRIGIDO)
 * Compatível com SPCE3200 (Sunplus S+core)
 * 
 * ✅ CORRIGIDO: Extends MemoryRegion
 * ✅ CORRIGIDO: Métodos readU8/readU16 adicionados
 * ✅ CORRIGIDO: Compatibilidade total com MIU
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Arquitetura: Timers independentes com clock divisor
 * 
 * Autor: Ccor444
 * Data: 2025-12-28
 * 
 * MAPA DE PERIFÉRICOS (0x080Axxxx):
 * 0x080A0000 - TIMER0_COUNT (RW)
 * 0x080A0004 - TIMER0_CTRL  (RW)
 * 0x080A0008 - TIMER0_CMP   (RW)
 * 0x080A000C - TIMER0_STAT  (RO)
 * 0x080A0010 - TIMER1_COUNT
 * 0x080A0014 - TIMER1_CTRL
 * 0x080A0018 - TIMER1_CMP
 * 0x080A001C - TIMER1_STAT
 * 0x080A0020 - TIMER2_COUNT
 * 0x080A0024 - TIMER2_CTRL
 * 0x080A0028 - TIMER2_CMP
 * 0x080A002C - TIMER2_STAT
 * 
 * BITS DE CONTROLE (CTRL):
 * Bit 0: ENABLE    - 1 = timer ativo
 * Bit 1: MODE      - 0 = count-up, 1 = count-down
 * Bit 2: REPEAT    - 1 = auto-reload após compare
 * Bit 3: IRQ_EN    - 1 = gera IRQ no compare
 * Bit 4: EXT_CLK   - 1 = usa clock externo (pin), 0 = clock interno
 * Bit 5-7: SCALE   - Clock divisor (2^SCALE)
 * 
 * BITS DE STATUS (STAT):
 * Bit 0: COMPARE   - 1 = atingiu compare (RO)
 * Bit 1: OVERFLOW  - 1 = overflow de 32-bit (RO)
 * Bit 7: IRQ_ACK   - Write 1 para limpar interrupt
 */

"use strict";

if (typeof TimerController === 'undefined') {
    /**
     * Controlador de Timer Individual
     * Implementa um timer de 32-bit com compare e interrupt
     */
    class Timer {
        constructor(timerNumber = 0) {
            this.number = timerNumber;
            this.name = `TIMER${timerNumber}`;

            // ========== REGISTRADORES ==========
            this.count = 0;      // Contador de 32-bit
            this.ctrl = 0;       // Controle
            this.cmp = 0xFFFFFFFF; // Comparação
            this.stat = 0;       // Status

            // ========== FLAGS INTERNAS ==========
            this.enabled = false;
            this.countDown = false;
            this.repeat = false;
            this.irqEnabled = false;
            this.extClock = false;
            this.clockScale = 0; // 2^0 = 1

            // ========== TIMING ==========
            this.cyclesUntilTick = 0; // Para divisão de clock
            this.lastCycleCount = 0;

            // ========== CALLBACKS ==========
            this.onCompare = null;
            this.onOverflow = null;

            // ========== ESTATÍSTICAS ==========
            this.stats = {
                ticks: 0,
                compares: 0,
                overflows: 0,
                interrupts: 0
            };
        }

        /**
         * Atualiza registro de controle (escreve CTRL)
         */
        writeCtrl(value) {
            value = value >>> 0;
            this.ctrl = value;

            // Parse bits
            this.enabled = !!(value & 0x01);
            this.countDown = !!(value & 0x02);
            this.repeat = !!(value & 0x04);
            this.irqEnabled = !!(value & 0x08);
            this.extClock = !!(value & 0x10);
            this.clockScale = (value >>> 5) & 0x07;

            if (this.enabled) {
                console.log(`[${this.name}] ATIVADO - Scale=${1 << this.clockScale}, Mode=${this.countDown ? "DOWN" : "UP"}`);
            } else {
                console.log(`[${this.name}] Desativado`);
            }
        }

        /**
         * Retorna registro de controle (lê CTRL)
         */
        readCtrl() {
            let val = 0;
            if (this.enabled) val |= 0x01;
            if (this.countDown) val |= 0x02;
            if (this.repeat) val |= 0x04;
            if (this.irqEnabled) val |= 0x08;
            if (this.extClock) val |= 0x10;
            val |= (this.clockScale & 0x07) << 5;
            return val >>> 0;
        }

        /**
         * Escreve valor do contador
         */
        writeCount(value) {
            this.count = value >>> 0;
            this.cyclesUntilTick = 0;
            console.log(`[${this.name}] COUNT = 0x${this.count.toString(16).padStart(8, '0').toUpperCase()}`);
        }

        /**
         * Lê valor atual do contador
         */
        readCount() {
            return this.count >>> 0;
        }

        /**
         * Escreve valor de compare
         */
        writeCompare(value) {
            this.cmp = value >>> 0;
            console.log(`[${this.name}] CMP = 0x${this.cmp.toString(16).padStart(8, '0').toUpperCase()}`);
        }

        /**
         * Lê valor de compare
         */
        readCompare() {
            return this.cmp >>> 0;
        }

        /**
         * Lê status (RO)
         */
        readStatus() {
            return this.stat >>> 0;
        }

        /**
         * Limpa interrupts escrevendo em status
         */
        writeStatus(value) {
            if (value & 0x80) {
                // Limpar flag de compare/interrupt
                this.stat &= ~0x01;
                console.log(`[${this.name}] Interrupt ACK`);
            }
        }

        /**
         * Executa um tick do timer (chamado a cada ciclo de CPU)
         * @param {number} cycles - Número de ciclos desde última chamada
         * @returns {boolean} true se gerou interrupt
         */
        tick(cycles = 1) {
            if (!this.enabled) {
                this.cyclesUntilTick = 0;
                return false;
            }

            // Aplicar escala de clock
            const scale = 1 << this.clockScale; // 2^scale
            this.cyclesUntilTick += cycles;

            let didCompare = false;

            // Processar ticks
            while (this.cyclesUntilTick >= scale) {
                this.cyclesUntilTick -= scale;
                this.stats.ticks++;

                if (this.countDown) {
                    // Count down
                    if (this.count === 0) {
                        // Underflow (overflow em modo down)
                        this.stat |= 0x02; // Set overflow flag
                        this.stats.overflows++;
                        this.onOverflow?.();

                        if (this.repeat) {
                            this.count = this.cmp;
                        } else {
                            this.enabled = false; // Stop
                        }
                    } else {
                        this.count = (this.count - 1) >>> 0;
                    }
                } else {
                    // Count up
                    this.count = (this.count + 1) >>> 0;

                    if (this.count === 0) {
                        // Overflow (32-bit)
                        this.stat |= 0x02;
                        this.stats.overflows++;
                        this.onOverflow?.();
                    }
                }

                // Verificar compare
                if (this.count === this.cmp) {
                    this.stat |= 0x01; // Set compare flag
                    this.stats.compares++;
                    didCompare = true;

                    // Gerar interrupt se habilitado
                    if (this.irqEnabled) {
                        this.stats.interrupts++;
                        this.onCompare?.();
                    }

                    // Se repeat, reload
                    if (this.repeat) {
                        this.count = 0; // Próximo ciclo iniciará do 0
                    } else {
                        this.enabled = false; // Stop
                    }
                }
            }

            return didCompare && this.irqEnabled;
        }

        /**
         * Reset do timer
         */
        reset() {
            this.count = 0;
            this.ctrl = 0;
            this.cmp = 0xFFFFFFFF;
            this.stat = 0;
            this.enabled = false;
            this.cyclesUntilTick = 0;
            this.stats = {
                ticks: 0,
                compares: 0,
                overflows: 0,
                interrupts: 0
            };
            console.log(`[${this.name}] Reset`);
        }

        /**
         * Retorna informações para debug
         */
        getInfo() {
            return {
                name: this.name,
                enabled: this.enabled,
                count: `0x${this.count.toString(16).padStart(8, '0').toUpperCase()}`,
                compare: `0x${this.cmp.toString(16).padStart(8, '0').toUpperCase()}`,
                status: `0x${this.stat.toString(16).padStart(2, '0').toUpperCase()}`,
                mode: this.countDown ? "COUNT-DOWN" : "COUNT-UP",
                scale: `2^${this.clockScale} (÷${1 << this.clockScale})`,
                repeat: this.repeat ? "YES" : "NO",
                irqEnabled: this.irqEnabled ? "YES" : "NO",
                stats: { ...this.stats }
            };
        }

        /**
         * Dump de estado em texto
         */
        dump() {
            const info = this.getInfo();
            const lines = [];
            lines.push(`╔════ ${info.name} ════╗`);
            lines.push(`║ Enabled:  ${info.enabled ? "✓" : "✗"}`);
            lines.push(`║ Count:    ${info.count}`);
            lines.push(`║ Compare:  ${info.compare}`);
            lines.push(`║ Status:   ${info.status}`);
            lines.push(`║ Mode:     ${info.mode}`);
            lines.push(`║ Scale:    ${info.scale}`);
            lines.push(`║ Repeat:   ${info.repeat}`);
            lines.push(`║ IRQ:      ${info.irqEnabled}`);
            lines.push(`║ Ticks:    ${info.stats.ticks}`);
            lines.push(`║ Compares: ${info.stats.compares}`);
            lines.push(`║ Interrupts: ${info.stats.interrupts}`);
            lines.push(`╚════════════╝`);
            return lines.join("\n");
        }
    }

    // ========== TIMER CONTROLLER (3 Timers independentes) ==========

    /**
     * Controlador de Timers Principal
     * ✅ CORRIGIDO: Extends MemoryRegion para compatibilidade com MIU
     * Gerencia 3 timers independentes com mapa MMIO
     * 
     * @extends MemoryRegion
     */
    class TimerController extends MemoryRegion {
        constructor() {
            super();

            this.name = "TIMER_CONTROLLER";

            // Timers (3 timers independentes)
            this.timers = [
                new Timer(0),
                new Timer(1),
                new Timer(2)
            ];

            // Callbacks para interrupções
            this.onInterrupt = null;

            // Estatísticas gerais
            this.stats = {
                totalTicks: 0,
                totalInterrupts: 0
            };

            // Setup callbacks dos timers
            this.timers.forEach((timer, idx) => {
                timer.onCompare = () => this.handleTimerInterrupt(idx);
                timer.onOverflow = () => console.log(`[TIMER${idx}] ⚠️ Overflow`);
            });

            console.log("[TIMER] ✓ TimerController inicializado (3 timers)");
        }

        /**
         * Manipulador de interrupt do timer
         */
        handleTimerInterrupt(timerNumber) {
            this.stats.totalInterrupts++;
            console.log(`[TIMER] 🔔 IRQ do Timer ${timerNumber}`);
            this.onInterrupt?.(timerNumber);
        }

        // ========== INTERFACE MEMORYREGION ==========

        /**
         * ✅ CORRIGIDO: Lê 8 bits
         */
        readU8(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 3) * 8;
            return (word >>> shift) & 0xFF;
        }

        /**
         * ✅ CORRIGIDO: Lê 16 bits
         */
        readU16(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 2) * 8;
            return (word >>> shift) & 0xFFFF;
        }

        /**
         * Lê 32 bits (MMIO)
         * 
         * Layout:
         * Timer0: 0x00-0x0C
         * Timer1: 0x10-0x1C
         * Timer2: 0x20-0x2C
         */
        readU32(offset) {
            offset = offset & 0xFFFF; // Máscara de 16-bit

            // Determinar timer (bits 4-5) e registrador (bits 2-3)
            const timerIdx = (offset >>> 4) & 0x03; // Qual timer (0-3)
            const regOffset = offset & 0x0C;        // Qual registrador

            if (timerIdx >= 3) {
                console.warn(`[TIMER] Acesso a timer inválido: ${timerIdx}`);
                return 0;
            }

            const timer = this.timers[timerIdx];

            switch (regOffset) {
                case 0x00: return timer.readCount();
                case 0x04: return timer.readCtrl();
                case 0x08: return timer.readCompare();
                case 0x0C: return timer.readStatus();
                default:
                    console.warn(`[TIMER] Acesso a offset desconhecido: 0x${offset.toString(16)}`);
                    return 0;
            }
        }

        /**
         * ✅ CORRIGIDO: Escreve 8 bits
         */
        writeU8(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 3) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * ✅ CORRIGIDO: Escreve 16 bits
         */
        writeU16(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 2) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFFFF << shift)) | ((value & 0xFFFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * Escreve 32 bits (MMIO)
         */
        writeU32(offset, value) {
            value = value >>> 0;
            offset = offset & 0xFFFF;

            const timerIdx = (offset >>> 4) & 0x03;
            const regOffset = offset & 0x0C;

            if (timerIdx >= 3) {
                console.warn(`[TIMER] Acesso a timer inválido: ${timerIdx}`);
                return;
            }

            const timer = this.timers[timerIdx];

            switch (regOffset) {
                case 0x00:
                    timer.writeCount(value);
                    break;
                case 0x04:
                    timer.writeCtrl(value);
                    break;
                case 0x08:
                    timer.writeCompare(value);
                    break;
                case 0x0C:
                    timer.writeStatus(value);
                    break;
                default:
                    console.warn(`[TIMER] Escrita em offset desconhecido: 0x${offset.toString(16)}`);
            }
        }

        // ========== INTERFACE DE TICK (chamado pelo emulador) ==========

        /**
         * Atualiza todos os timers (chamado a cada ciclo de CPU)
         * @param {number} cycles - Número de ciclos desde última chamada
         */
        tick(cycles = 1) {
            this.stats.totalTicks += cycles;

            let anyInterrupt = false;
            for (let i = 0; i < 3; i++) {
                if (this.timers[i].tick(cycles)) {
                    anyInterrupt = true;
                }
            }

            return anyInterrupt;
        }

        /**
         * Reset de todos os timers
         */
        reset() {
            this.timers.forEach(timer => timer.reset());
            this.stats = { totalTicks: 0, totalInterrupts: 0 };
            console.log("[TIMER] Reset completo");
        }

        // ========== MÉTODOS DE DEBUG ==========

        /**
         * Retorna informações de todos os timers
         */
        getInfo() {
            return {
                name: this.name,
                timers: this.timers.map(t => t.getInfo()),
                stats: { ...this.stats }
            };
        }

        /**
         * Dump formatado
         */
        dump() {
            let output = "╔════════════════════════════════════╗\n";
            output += "║    TIMER CONTROLLER STATUS         ║\n";
            output += "╚════════════════════════════════════╝\n\n";

            this.timers.forEach((timer, idx) => {
                output += timer.dump() + "\n";
            });

            output += `\nTotal Ticks:     ${this.stats.totalTicks}\n`;
            output += `Total Interrupts: ${this.stats.totalInterrupts}\n`;

            return output;
        }

        /**
         * Retorna status para Luna Console
         */
        getStatus() {
            const lines = [];
            lines.push("═══ TIMER STATUS ═══");

            this.timers.forEach((timer, idx) => {
                lines.push(`\nTimer${idx}:`);
                lines.push(`  Enabled:  ${timer.enabled ? "✓" : "✗"}`);
                lines.push(`  Count:    0x${timer.count.toString(16).padStart(8, '0').toUpperCase()}`);
                lines.push(`  Compare:  0x${timer.cmp.toString(16).padStart(8, '0').toUpperCase()}`);
                lines.push(`  Mode:     ${timer.countDown ? "DOWN" : "UP"}`);
                lines.push(`  Scale:    ÷${1 << timer.clockScale}`);
                lines.push(`  Status:   0x${timer.stat.toString(16).padStart(2, '0').toUpperCase()}`);
                lines.push(`  Compares: ${timer.stats.compares}`);
            });

            return lines.join("\n");
        }
    }

    // ========== EXPORTAR PARA WINDOW ==========

    window.Timer = Timer;
    window.TimerController = TimerController;

    console.log("[TIMER] ✓ Timer.js carregado com suporte a 3 timers independentes");
    console.log("[TIMER] ✓ Extends MemoryRegion - Compatível com MIU");
}