/**
 * IOMemoryRegion - Memória Mapeada de I/O
 * HyperScan Emulator v2.0
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200 (Sunplus S+core)
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * Memória mapeada para I/O com handlers customizáveis para periféricos.
 */

"use strict";

/**
 * IOMemoryRegion - Região de I/O com handlers
 * 
 * @extends MemoryRegion
 */
if (typeof IOMemoryRegion === 'undefined') {
    class IOMemoryRegion extends MemoryRegion {
        /**
         * Cria uma nova região de I/O
         * 
         * @param {number} [sizeBytes=65536] - Tamanho da região I/O (padrão: 64KB)
         */
        constructor(sizeBytes = 65536) {
            super();

            /**
             * Registradores I/O
             * @type {Uint32Array}
             */
            this.registers = new Uint32Array(sizeBytes >>> 2);

            /**
             * Tamanho da região
             * @type {number}
             */
            this.size = sizeBytes;

            /**
             * Handlers customizados para leitura/escrita
             * Mapa: wordOffset -> { readFn, writeFn }
             * @type {Map<number, Object>}
             */
            this.handlers = new Map();

            /**
             * Referência ao Interrupt Controller
             * @type {InterruptController|null}
             */
            this.intC = null;

            /**
             * Referência ao VDU
             * @type {VideoDisplayUnit|null}
             */
            this.vdu = null;

            /**
             * Referência ao UART
             * @type {UART|null}
             */
            this.uart = null;

            /**
             * Contadores de acesso
             * @type {Object}
             */
            this.stats = {
                reads8: 0,
                reads16: 0,
                reads32: 0,
                writes8: 0,
                writes16: 0,
                writes32: 0,
                handlerCalls: 0
            };

            console.log(`[IO] ✓ IOMemoryRegion criada (${sizeBytes} bytes)`);
        }

        // ========== REGISTRO DE HANDLERS ==========

        /**
         * Registra handler customizado para um offset
         * 
         * @param {number} offset - Offset em bytes (será alinhado para word)
         * @param {Function} [readFn] - Função de leitura: () -> number
         * @param {Function} [writeFn] - Função de escrita: (value: number) -> void
         */
        registerHandler(offset, readFn, writeFn) {
            const wordOffset = (offset >>> 2) & ((this.size >>> 2) - 1);

            this.handlers.set(wordOffset, {
                readFn: readFn || (() => this.registers[wordOffset]),
                writeFn: writeFn || ((val) => {
                    this.registers[wordOffset] = val >>> 0;
                })
            });

            console.log(`[IO] Handler registrado em offset 0x${offset.toString(16).padStart(4, '0')}`);
        }

        /**
         * Remove handler de um offset
         * 
         * @param {number} offset - Offset em bytes
         */
        unregisterHandler(offset) {
            const wordOffset = (offset >>> 2) & ((this.size >>> 2) - 1);
            this.handlers.delete(wordOffset);
        }

        // ========== LEITURA ==========

        /**
         * Lê um byte
         * 
         * @param {number} offset - Offset
         * @returns {number} Byte (0-255)
         */
        readU8(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 3) * 8;
            this.stats.reads8++;
            return (word >>> shift) & 0xFF;
        }

        /**
         * Lê uma halfword
         * 
         * @param {number} offset - Offset
         * @returns {number} Halfword (0-65535)
         */
        readU16(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 2) * 8;
            this.stats.reads16++;
            return (word >>> shift) & 0xFFFF;
        }

        /**
         * Lê uma word
         * 
         * @param {number} offset - Offset
         * @returns {number} Word (0-4294967295)
         */
        readU32(offset) {
            const wordOffset = (offset >>> 2) & ((this.size >>> 2) - 1);
            const handler = this.handlers.get(wordOffset);

            this.stats.reads32++;

            if (handler && handler.readFn) {
                this.stats.handlerCalls++;
                return handler.readFn() >>> 0;
            }

            return this.registers[wordOffset] >>> 0;
        }

        // ========== ESCRITA ==========

        /**
         * Escreve um byte
         * 
         * @param {number} offset - Offset
         * @param {number} value - Byte (0-255)
         */
        writeU8(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 3) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
            this.writeU32(addr, word);
            this.stats.writes8++;
        }

        /**
         * Escreve uma halfword
         * 
         * @param {number} offset - Offset
         * @param {number} value - Halfword (0-65535)
         */
        writeU16(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 2) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFFFF << shift)) | ((value & 0xFFFF) << shift);
            this.writeU32(addr, word);
            this.stats.writes16++;
        }

        /**
         * Escreve uma word
         * 
         * @param {number} offset - Offset
         * @param {number} value - Word (0-4294967295)
         */
        writeU32(offset, value) {
            value = value >>> 0;
            const wordOffset = (offset >>> 2) & ((this.size >>> 2) - 1);
            const handler = this.handlers.get(wordOffset);

            this.stats.writes32++;

            if (handler && handler.writeFn) {
                this.stats.handlerCalls++;
                handler.writeFn(value);
                return;
            }

            this.registers[wordOffset] = value;
        }

        // ========== PERIFÉRICOS CONECTADOS ==========

        /**
         * Conecta Interrupt Controller
         * 
         * @param {InterruptController} intC - Controlador de interrupções
         */
        connectInterruptController(intC) {
            this.intC = intC;
            console.log("[IO] Interrupt Controller conectado");
        }

        /**
         * Conecta VDU
         * 
         * @param {VideoDisplayUnit} vdu - Unidade de vídeo
         */
        connectVDU(vdu) {
            this.vdu = vdu;
            console.log("[IO] Video Display Unit conectada");
        }

        /**
         * Conecta UART
         * 
         * @param {UART} uart - Serial console
         */
        connectUART(uart) {
            this.uart = uart;
            console.log("[IO] UART conectada");
        }

        // ========== DEBUG ==========

        /**
         * Retorna informações
         * 
         * @returns {Object} Info formatada
         */
        getInfo() {
            return {
                type: this.constructor.name,
                sizeBytes: this.size,
                handlersRegistered: this.handlers.size,
                stats: { ...this.stats }
            };
        }

        /**
         * Gera dump de registradores
         * 
         * @param {number} [startOffset=0] - Offset inicial
         * @param {number} [size=64] - Número de bytes
         * @returns {string} Dump formatado
         */
        hexdump(startOffset = 0, size = 64) {
            const lines = [];
            let addr = startOffset & ~0x0F;

            for (let i = 0; i < size; i += 16) {
                let line = `${addr.toString(16).padStart(4, '0')}: `;
                let ascii = "";

                for (let j = 0; j < 16; j++) {
                    const byte = this.readU8(addr + j);
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
         * Reseta estatísticas
         */
        resetStats() {
            this.stats = {
                reads8: 0,
                reads16: 0,
                reads32: 0,
                writes8: 0,
                writes16: 0,
                writes32: 0,
                handlerCalls: 0
            };
            console.log("[IO] Estatísticas resetadas");
        }
    }

    // Exporta para o escopo global
    window.IOMemoryRegion = IOMemoryRegion;

    console.log("[PERIPHERAL] ✓ IOMemoryRegion carregada");
}