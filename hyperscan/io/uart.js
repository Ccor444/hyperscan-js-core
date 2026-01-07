/**
 * UART.js - HyperScan Universal Asynchronous Receiver-Transmitter (CORRIGIDO)
 * Implementação compatível com hardware real do Sunplus SPCE3200 (S+core)
 * 
 * ✅ CORRIGIDO: Extends MemoryRegion
 * ✅ CORRIGIDO: Métodos readU8/readU16 adicionados
 * ✅ CORRIGIDO: Compatibilidade total com MIU e IOMemoryRegion
 * ✅ CORRIGIDO: Suporta acesso de 8/16/32 bits
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200, Sunplus S+core
 * 
 * Autor: Ccor444
 * Data: 2025-12-28
 * 
 * MAPA DE PERIFÉRICOS UART (0x080Bxxxx):
 * 0x080B0000 - TX Buffer / RX Data (RW)
 * 0x080B0008 - Control Register (RW)
 * 0x080B000C - Status Register (RO)
 * 0x080B0010 - Baud Rate Register (RW)
 * 
 * STATUS REGISTER (0x080B000C):
 * Bit 7 (0x80): TX Buffer Empty - Essencial para loop de escrita
 * Bit 6 (0x40): RX Data Ready
 * Bit 5 (0x20): TX Underrun
 * Bit 4 (0x10): Transmit Idle
 * Bit 3 (0x08): Frame Error
 * Bit 2 (0x04): Parity Error
 * Bit 1 (0x02): Overrun Error
 * Bit 0 (0x01): Break Detect
 */

"use strict";

if (typeof UART === 'undefined') {
    /**
     * UART Controller
     * ✅ CORRIGIDO: Extends MemoryRegion para compatibilidade com MIU
     * 
     * @extends MemoryRegion
     */
    class UART extends MemoryRegion {
        constructor() {
            super();

            this.name = "UART";

            // ========== REGISTRADORES INTERNOS ==========
            // Buffer interno para acumular caracteres até o 'flush' (\n)
            this.buffer = "";
            
            // Registradores (Valores iniciais de Power-On)
            this.regs = {
                TX_BUF:  0x0000,  // TX Buffer / RX Data
                RX_BUF:  0x0000,  // RX Buffer (para leitura)
                CONTROL: 0x0000,  // Controle
                STATUS:  0x0090,  // Status: Bit 7 (TX Empty) e Bit 4 (TX Idle) ativos
                BAUD:    0x0000   // Baud Rate
            };

            // ========== BITS DE STATUS IMPORTANTES ==========
            this.STATUS_TX_EMPTY = 0x80;  // Bit 7: TX Buffer Empty
            this.STATUS_RX_READY = 0x40;  // Bit 6: RX Data Ready
            this.STATUS_TX_IDLE  = 0x10;  // Bit 4: Transmit Idle
            this.STATUS_FRAME_ERROR = 0x08;  // Bit 3: Frame Error
            this.STATUS_PARITY_ERROR = 0x04; // Bit 2: Parity Error
            this.STATUS_OVERRUN = 0x02;      // Bit 1: Overrun Error
            this.STATUS_BREAK = 0x01;        // Bit 0: Break Detect

            // ========== FILA DE RECEPÇÃO ==========
            this.rxQueue = [];
            this.rxIndex = 0;

            // ========== CALLBACKS ==========
            this.onTXData = null;  // Chamado quando dados são transmitidos
            this.onRXData = null;  // Chamado quando dados são recebidos

            // ========== ESTATÍSTICAS ==========
            this.stats = {
                bytesTransmitted: 0,
                bytesReceived: 0,
                framesTransmitted: 0,
                errors: 0
            };

            // ========== CONFIGURAÇÃO ==========
            this.debugEnabled = false;
            this.autoFlush = true;

            console.log("[UART] ✓ UART inicializada");
        }

        // ========== INTERFACE MEMORYREGION ==========

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
         * Leitura de Registros MMIO (Memory Mapped I/O)
         * @param {number} address - Endereço completo ou offset
         */
        readU32(address) {
            // Extrai o offset de 16-bits (conforme SegmentedMemoryRegion 8,16)
            const offset = address & 0xFFFF;

            switch (offset) {
                case 0x0000: // RX Data Register (TX_BUF/RX_BUF dual)
                    const data = this.regs.RX_BUF;
                    // Ao ler, o hardware real limpa o bit de "Data Ready" (0x40)
                    this.regs.STATUS &= ~this.STATUS_RX_READY;
                    
                    if (this.debugEnabled) {
                        console.log(`[UART] readU32(RX) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${data.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    
                    return data;

                case 0x0008: // Control Register
                    if (this.debugEnabled) {
                        console.log(`[UART] readU32(CTRL) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${this.regs.CONTROL.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.regs.CONTROL;

                case 0x000C: // Status Register (O mais lido pela ROM)
                    /**
                     * Bit 7 (0x80): TX Buffer Empty - Essencial para o loop de escrita da ROM
                     * Bit 4 (0x10): Transmit Idle
                     * Retornar 0x90 informa à CPU que o canal está livre.
                     */
                    if (this.debugEnabled) {
                        console.log(`[UART] readU32(STATUS) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${this.regs.STATUS.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.regs.STATUS;

                case 0x0010: // Baud Rate Register
                    if (this.debugEnabled) {
                        console.log(`[UART] readU32(BAUD) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${this.regs.BAUD.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.regs.BAUD;

                default:
                    // Endereços não mapeados retornam 0
                    if (this.debugEnabled) {
                        console.log(`[UART] readU32(UNKNOWN) @ 0x${offset.toString(16).padStart(4, '0')} = 0x00000000`);
                    }
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
         * Escrita de Registros MMIO
         */
        writeU32(address, value) {
            const offset = address & 0xFFFF;

            switch (offset) {
                case 0x0000: // TX Buffer (Onde a ROM envia caracteres para o terminal)
                    const byte = value & 0xFF;
                    
                    if (this.debugEnabled) {
                        console.log(`[UART] writeU32(TX) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${byte.toString(16).padStart(2, '0').toUpperCase()} ('${String.fromCharCode(byte)}')`);
                    }

                    this.processTX(byte);
                    
                    // Simulação de hardware: 
                    // 1. Limpa o bit "Empty" (está ocupado processando)
                    this.regs.STATUS &= ~this.STATUS_TX_EMPTY;
                    
                    // 2. Restaura o bit "Empty" após um curto período (latência de transmissão)
                    // Isso evita que a CPU envie dados rápido demais para o buffer simulado.
                    setTimeout(() => {
                        this.regs.STATUS |= this.STATUS_TX_EMPTY;
                    }, 1);
                    
                    break;

                case 0x0008: // Control Register
                    this.regs.CONTROL = value >>> 0;
                    
                    if (this.debugEnabled) {
                        console.log(`[UART] writeU32(CTRL) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${this.regs.CONTROL.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    
                    // Parse bits de controle se necessário
                    this._parseControlRegister();
                    break;

                case 0x000C: // Status (Geralmente Read-Only, mas alguns bits podem ser Reset-on-Write)
                    // Implementação padrão: ignora escritas para não corromper o estado
                    if (this.debugEnabled) {
                        console.log(`[UART] writeU32(STATUS) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()} (ignored)`);
                    }
                    break;

                case 0x0010: // Baud Rate
                    this.regs.BAUD = value >>> 0;
                    
                    if (this.debugEnabled) {
                        console.log(`[UART] writeU32(BAUD) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${this.regs.BAUD.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    break;

                default:
                    // Endereço desconhecido
                    if (this.debugEnabled) {
                        console.log(`[UART] writeU32(UNKNOWN) @ 0x${offset.toString(16).padStart(4, '0')} = 0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()}`);
                    }
            }
        }

        // ========== LÓGICA DE TRANSMISSÃO ==========

        /**
         * Lógica de Transmissão e Bufferização
         * Evita sobrecarga de logs no console do navegador.
         */
        processTX(byte) {
            // Converte o byte enviado pela CPU em caractere ASCII
            const char = String.fromCharCode(byte);
            this.buffer += char;
            
            this.stats.bytesTransmitted++;

            if (this.debugEnabled) {
                console.log(`[UART] TX Byte: 0x${byte.toString(16).padStart(2, '0').toUpperCase()} = '${char}' (buffer: "${this.buffer}")`);
            }

            // Se encontrar nova linha ou o buffer atingir o limite, limpa para a UI
            if (char === '\n' || this.buffer.length > 255) {
                this.flushToConsole();
                this.stats.framesTransmitted++;
            }

            // Callback customizado
            this.onTXData?.(byte);
        }

        /**
         * Envia o texto acumulado para o console e para a tela do emulador
         */
        flushToConsole() {
            if (this.buffer.length === 0) return;

            const text = this.buffer;
            this.buffer = "";

            // 1. Log técnico no console do Desenvolvedor
            console.log("%c[UART]: " + text.trim(), "color: #00ff00; font-family: monospace; font-weight: bold;");

            // 2. Integração com Luna Console se disponível
            if (window.luna && window.luna.log) {
                window.luna.log(text.trim(), "info");
            }

            // 3. Integração com elemento HTML (Terminais visuais no Emulador)
            const consoleElem = document.getElementById('uart-console');
            if (consoleElem) {
                const span = document.createElement('span');
                span.textContent = text;
                span.style.color = '#00ff00';
                span.style.fontFamily = 'monospace';
                consoleElem.appendChild(span);
                
                // Auto-scroll para o final
                consoleElem.scrollTop = consoleElem.scrollHeight;
            }
        }

        // ========== LÓGICA DE RECEPÇÃO ==========

        /**
         * Envia dados para a fila de recepção
         */
        receiveData(byte) {
            this.rxQueue.push(byte & 0xFF);
            this.stats.bytesReceived++;

            // Marcar que há dados disponíveis
            this.regs.STATUS |= this.STATUS_RX_READY;
            this.regs.RX_BUF = byte & 0xFF;

            if (this.debugEnabled) {
                console.log(`[UART] RX Byte enfileirado: 0x${byte.toString(16).padStart(2, '0').toUpperCase()}`);
            }

            this.onRXData?.(byte);
        }

        /**
         * Recebe string completa (simula entrada do usuário)
         */
        receiveString(str) {
            for (let i = 0; i < str.length; i++) {
                this.receiveData(str.charCodeAt(i));
            }
        }

        /**
         * Obtém próximo byte da fila de recepção
         */
        getNextRXByte() {
            if (this.rxQueue.length > 0) {
                return this.rxQueue.shift();
            }
            this.regs.STATUS &= ~this.STATUS_RX_READY;
            return 0;
        }

        // ========== MÉTODOS AUXILIARES ==========

        /**
         * Parse do registro de controle
         */
        _parseControlRegister() {
            const ctrl = this.regs.CONTROL;
            
            // Extrair bits importantes
            const txEnable = (ctrl & 0x01) !== 0;
            const rxEnable = (ctrl & 0x02) !== 0;
            const dataLength = (ctrl >>> 2) & 0x03;  // 00=5bit, 01=6bit, 10=7bit, 11=8bit
            const parity = (ctrl >>> 4) & 0x03;      // 00=nenhum, 01=odd, 10=even, 11=mark
            const stopBits = (ctrl >>> 6) & 0x03;    // 00=1bit, 01=1.5bit, 10=2bit

            if (this.debugEnabled) {
                console.log(`[UART] Control bits parsed:`);
                console.log(`  TX Enable: ${txEnable}`);
                console.log(`  RX Enable: ${rxEnable}`);
                console.log(`  Data Length: ${['5-bit', '6-bit', '7-bit', '8-bit'][dataLength]}`);
                console.log(`  Parity: ${['none', 'odd', 'even', 'mark'][parity]}`);
                console.log(`  Stop Bits: ${['1', '1.5', '2'][stopBits]}`);
            }
        }

        /**
         * Reset da UART
         */
        reset() {
            this.buffer = "";
            this.rxQueue = [];
            this.regs = {
                TX_BUF: 0x0000,
                RX_BUF: 0x0000,
                CONTROL: 0x0000,
                STATUS: 0x0090,  // TX Empty + TX Idle
                BAUD: 0x0000
            };
            this.stats = {
                bytesTransmitted: 0,
                bytesReceived: 0,
                framesTransmitted: 0,
                errors: 0
            };
            console.log("[UART] Reset completo");
        }

        /**
         * Habilita debug
         */
        setDebug(enabled) {
            this.debugEnabled = enabled;
            console.log(`[UART] Debug: ${enabled ? "ATIVADO" : "DESATIVADO"}`);
        }

        /**
         * Retorna informações sobre a UART
         */
        getInfo() {
            return {
                type: this.constructor.name,
                name: this.name,
                registers: {
                    TX_BUF: `0x${this.regs.TX_BUF.toString(16).padStart(8, '0').toUpperCase()}`,
                    RX_BUF: `0x${this.regs.RX_BUF.toString(16).padStart(8, '0').toUpperCase()}`,
                    CONTROL: `0x${this.regs.CONTROL.toString(16).padStart(8, '0').toUpperCase()}`,
                    STATUS: `0x${this.regs.STATUS.toString(16).padStart(8, '0').toUpperCase()}`,
                    BAUD: `0x${this.regs.BAUD.toString(16).padStart(8, '0').toUpperCase()}`
                },
                status: {
                    txEmpty: !!(this.regs.STATUS & this.STATUS_TX_EMPTY),
                    rxReady: !!(this.regs.STATUS & this.STATUS_RX_READY),
                    txIdle: !!(this.regs.STATUS & this.STATUS_TX_IDLE)
                },
                stats: { ...this.stats }
            };
        }

        /**
         * Retorna status formatado para debug
         */
        getStatus() {
            const lines = [];
            lines.push("═══ UART STATUS ═══");
            lines.push(`TX Buffer: 0x${this.regs.TX_BUF.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`RX Buffer: 0x${this.regs.RX_BUF.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`Control:   0x${this.regs.CONTROL.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`Status:    0x${this.regs.STATUS.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`Baud:      0x${this.regs.BAUD.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push("");
            lines.push(`TX Empty:  ${this.regs.STATUS & this.STATUS_TX_EMPTY ? "YES" : "NO"}`);
            lines.push(`RX Ready:  ${this.regs.STATUS & this.STATUS_RX_READY ? "YES" : "NO"}`);
            lines.push(`TX Idle:   ${this.regs.STATUS & this.STATUS_TX_IDLE ? "YES" : "NO"}`);
            lines.push("");
            lines.push(`Bytes TX:  ${this.stats.bytesTransmitted}`);
            lines.push(`Bytes RX:  ${this.stats.bytesReceived}`);
            lines.push(`Frames TX: ${this.stats.framesTransmitted}`);
            lines.push(`Errors:    ${this.stats.errors}`);
            
            if (this.buffer.length > 0) {
                lines.push("");
                lines.push(`Buffer: "${this.buffer}"`);
            }

            return lines.join("\n");
        }

        /**
         * Dump formatado
         */
        dump() {
            let output = "╔════════════════════════════════════╗\n";
            output += "║   UART CONTROLLER (SPCE3200)      ║\n";
            output += "╚════════════════════════════════════╝\n\n";
            output += this.getStatus();
            output += "\n";
            return output;
        }

        /**
         * Validação de offset
         */
        isValidOffset(offset) {
            return offset >= 0 && offset <= 0x10;
        }
    }

    // ========== EXPORTAÇÃO GLOBAL ==========
    window.UART = UART;

    console.log("[UART] ✓ UART carregada");
    console.log("[UART] ✓ Extends MemoryRegion - Compatível com MIU");
    console.log("[UART] ✓ Suporta acesso de 8/16/32 bits");
}