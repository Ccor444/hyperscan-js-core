/**
 * ArrayMemoryRegion - Memória baseada em TypedArray
 * HyperScan Emulator v2.0
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200 (Sunplus S+core)
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * Implementação de região de memória usando TypedArrays para acesso rápido.
 * Usado para: DRAM (16MB @ 0xA0000000) e Flash ROM (8MB @ 0x9E000000)
 */

"use strict";

/**
 * Região de memória implementada com TypedArray
 * 
 * Fornece acesso rápido a memória usando Uint8Array, Uint16Array e Uint32Array
 * compartilhando o mesmo ArrayBuffer. Alinhamento é automático.
 * 
 * Performance: ~100M ops/s (muito mais rápido que simulação bit-a-bit)
 * 
 * @extends MemoryRegion
 */
if (typeof ArrayMemoryRegion === 'undefined') {
    class ArrayMemoryRegion extends MemoryRegion {
        /**
         * Cria uma nova região de memória baseada em TypedArray
         * 
         * @param {number} sizeBytes - Tamanho da região em bytes
         * @throws {Error} Se MemoryRegion não estiver carregado
         * @throws {TypeError} Se sizeBytes não for um número positivo
         */
        constructor(sizeBytes) {
            super();

            // Validação
            if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
                throw new TypeError(`ArrayMemoryRegion: sizeBytes deve ser um número positivo, recebido ${sizeBytes}`);
            }

            // Alinhar para múltiplo de 4 bytes
            const alignedSize = (sizeBytes + 3) & ~3;

            /**
             * Buffer de memória compartilhado
             * @type {ArrayBuffer}
             * @private
             */
            this.buffer = new ArrayBuffer(alignedSize);

            /**
             * Vista de 8 bits (bytes)
             * @type {Uint8Array}
             */
            this.u8 = new Uint8Array(this.buffer);

            /**
             * Vista de 16 bits (halfwords)
             * @type {Uint16Array}
             */
            this.u16 = new Uint16Array(this.buffer);

            /**
             * Vista de 32 bits (words)
             * @type {Uint32Array}
             */
            this.u32 = new Uint32Array(this.buffer);

            /**
             * Alias para u8 (compatibilidade com código antigo)
             * @type {Uint8Array}
             */
            this.data = this.u8;

            /**
             * Tamanho original em bytes
             * @type {number}
             */
            this.size = sizeBytes;

            /**
             * Flag de leitura/escrita
             * @type {boolean}
             */
            this.readable = true;
            this.writable = true;

            /**
             * Contadores para debug
             * @type {Object}
             */
            this.stats = {
                reads8: 0,
                reads16: 0,
                reads32: 0,
                writes8: 0,
                writes16: 0,
                writes32: 0,
                lastReadAddr: 0,
                lastWriteAddr: 0
            };
        }

        // ========== LEITURA ==========

        /**
         * Lê um byte (8 bits)
         * 
         * @param {number} offset - Offset dentro da região
         * @returns {number} Valor do byte (0-255)
         */
        readU8(offset) {
            offset = offset >>> 0;
            this._onBeforeRead(offset, 1);
            
            const value = this.u8[offset & (this.u8.length - 1)];
            
            this.stats.reads8++;
            this.stats.lastReadAddr = offset;
            this._onAfterRead(offset, 1, value);
            
            return value;
        }

        /**
         * Lê uma halfword (16 bits) com alinhamento automático
         * 
         * Endereços desalinhados são alinhados para o byte anterior mais próximo.
         * Exemplo: offset 0x1001 → lê de 0x1000
         * 
         * @param {number} offset - Offset dentro da região (será alinhado a 2 bytes)
         * @returns {number} Valor da halfword (0-65535)
         */
        readU16(offset) {
            offset = (offset >>> 1) << 1; // Alinha a 2 bytes
            const index = (offset >>> 1) & (this.u16.length - 1);
            
            this._onBeforeRead(offset, 2);
            
            const value = this.u16[index];
            
            this.stats.reads16++;
            this.stats.lastReadAddr = offset;
            this._onAfterRead(offset, 2, value);
            
            return value;
        }

        /**
         * Lê uma word (32 bits) com alinhamento automático
         * 
         * Endereços desalinhados são alinhados para o múltiplo de 4 mais próximo.
         * 
         * @param {number} offset - Offset dentro da região (será alinhado a 4 bytes)
         * @returns {number} Valor da word (0-4294967295, como unsigned)
         */
        readU32(offset) {
            offset = (offset >>> 2) << 2; // Alinha a 4 bytes
            const index = (offset >>> 2) & (this.u32.length - 1);
            
            this._onBeforeRead(offset, 4);
            
            const value = this.u32[index] >>> 0; // Força unsigned
            
            this.stats.reads32++;
            this.stats.lastReadAddr = offset;
            this._onAfterRead(offset, 4, value);
            
            return value;
        }

        // ========== ESCRITA ==========

        /**
         * Escreve um byte (8 bits)
         * 
         * @param {number} offset - Offset dentro da região
         * @param {number} value - Valor a escrever (será mascarado a 8 bits)
         */
        writeU8(offset, value) {
            if (!this.writable) {
                console.warn(`[MEM] Tentativa de escrita em região read-only em 0x${offset.toString(16)}`);
                return;
            }

            offset = offset >>> 0;
            value = value & 0xFF;
            
            this._onBeforeWrite(offset, 1, value);
            
            this.u8[offset & (this.u8.length - 1)] = value;
            
            this.stats.writes8++;
            this.stats.lastWriteAddr = offset;
            this._onAfterWrite(offset, 1, value);
        }

        /**
         * Escreve uma halfword (16 bits) com alinhamento automático
         * 
         * @param {number} offset - Offset dentro da região (será alinhado a 2 bytes)
         * @param {number} value - Valor a escrever (será mascarado a 16 bits)
         */
        writeU16(offset, value) {
            if (!this.writable) {
                console.warn(`[MEM] Tentativa de escrita em região read-only em 0x${offset.toString(16)}`);
                return;
            }

            offset = (offset >>> 1) << 1;
            value = value & 0xFFFF;
            const index = (offset >>> 1) & (this.u16.length - 1);
            
            this._onBeforeWrite(offset, 2, value);
            
            this.u16[index] = value;
            
            this.stats.writes16++;
            this.stats.lastWriteAddr = offset;
            this._onAfterWrite(offset, 2, value);
        }

        /**
         * Escreve uma word (32 bits) com alinhamento automático
         * 
         * @param {number} offset - Offset dentro da região (será alinhado a 4 bytes)
         * @param {number} value - Valor a escrever (será mascarado a 32 bits)
         */
        writeU32(offset, value) {
            if (!this.writable) {
                console.warn(`[MEM] Tentativa de escrita em região read-only em 0x${offset.toString(16)}`);
                return;
            }

            offset = (offset >>> 2) << 2;
            value = value >>> 0;
            const index = (offset >>> 2) & (this.u32.length - 1);
            
            this._onBeforeWrite(offset, 4, value);
            
            this.u32[index] = value;
            
            this.stats.writes32++;
            this.stats.lastWriteAddr = offset;
            this._onAfterWrite(offset, 4, value);
        }

        // ========== OPERAÇÕES EM BLOCO ==========

        /**
         * Preenche a região inteira com um valor
         * 
         * @param {number} value - Valor a preencher (32 bits)
         * @param {number} [size] - Número de words a preencher (padrão: toda a região)
         * @param {number} [offset] - Offset para começar (padrão: 0)
         */
        fill(value, size = undefined, offset = 0) {
            value = value >>> 0;
            const start = (offset >>> 2);
            const count = size !== undefined ? (size >>> 2) : this.u32.length;
            
            console.log(`[MEM] Preenchendo ${count} words com 0x${value.toString(16).padStart(8, '0')}`);
            
            this.u32.fill(value, start, start + count);
        }

        /**
         * Copia dados para dentro da região
         * 
         * @param {Uint8Array|ArrayBuffer|number[]} data - Dados a copiar
         * @param {number} [offset=0] - Offset para começar
         * @throws {TypeError} Se data não for um tipo válido
         */
        load(data, offset = 0) {
            if (data instanceof Uint8Array) {
                this.u8.set(data, offset);
                console.log(`[MEM] Carregados ${data.length} bytes em offset 0x${offset.toString(16)}`);
            } else if (data instanceof ArrayBuffer) {
                this.u8.set(new Uint8Array(data), offset);
                console.log(`[MEM] Carregados ${data.byteLength} bytes em offset 0x${offset.toString(16)}`);
            } else if (Array.isArray(data)) {
                for (let i = 0; i < data.length; i++) {
                    this.u8[offset + i] = data[i];
                }
                console.log(`[MEM] Carregados ${data.length} bytes em offset 0x${offset.toString(16)}`);
            } else {
                throw new TypeError("load: data deve ser Uint8Array, ArrayBuffer ou Array");
            }
        }

        /**
         * Copia dados da região para um buffer externo
         * 
         * @param {number} offset - Offset de origem
         * @param {number} size - Número de bytes a copiar
         * @returns {Uint8Array} Dados copiados
         */
        extract(offset = 0, size = this.size) {
            return this.u8.slice(offset, offset + size);
        }

        /**
         * Limpa a região (preenche com zeros)
         * 
         * @param {number} [offset=0] - Offset para começar
         * @param {number} [size] - Número de bytes a limpar (padrão: toda a região)
         */
        clear(offset = 0, size = this.size) {
            const start = offset >>> 2;
            const count = (size >>> 2);
            this.u32.fill(0, start, start + count);
        }

        // ========== DEBUG E ANÁLISE ==========

        /**
         * Retorna informações sobre a região
         * 
         * @returns {Object} Informações formatadas
         */
        getInfo() {
            return {
                type: this.constructor.name,
                sizeBytes: this.size,
                sizeKB: (this.size / 1024).toFixed(2),
                sizeMB: (this.size / (1024 * 1024)).toFixed(2),
                readable: this.readable,
                writable: this.writable,
                stats: { ...this.stats }
            };
        }

        /**
         * Gera dump hexadecimal da memória
         * 
         * @param {number} [startOffset=0] - Offset para começar
         * @param {number} [size=256] - Número de bytes a dumpar
         * @returns {string} Dump formatado
         */
        hexdump(startOffset = 0, size = 256) {
            const lines = [];
            let addr = startOffset & ~0x0F; // Alinha a 16 bytes

            for (let i = 0; i < size; i += 16) {
                let line = `${addr.toString(16).padStart(8, '0').toUpperCase()}: `;
                let ascii = "";

                for (let j = 0; j < 16; j++) {
                    const byte = this.u8[(addr + j) & (this.u8.length - 1)];
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
         * Procura por um padrão de bytes na memória
         * 
         * @param {Uint8Array|number[]} pattern - Padrão a procurar
         * @param {number} [startOffset=0] - Offset para começar
         * @returns {number[]} Array de offsets onde o padrão foi encontrado
         */
        findPattern(pattern, startOffset = 0) {
            const results = [];
            const patternLength = pattern.length;

            for (let i = startOffset; i < this.u8.length - patternLength; i++) {
                let match = true;
                for (let j = 0; j < patternLength; j++) {
                    if (this.u8[i + j] !== pattern[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    results.push(i);
                }
            }

            return results;
        }

        /**
         * Calcula checksum CRC32 da região
         * 
         * @param {number} [startOffset=0] - Offset para começar
         * @param {number} [size] - Número de bytes (padrão: toda a região)
         * @returns {number} Valor CRC32
         */
        crc32(startOffset = 0, size = this.size) {
            let crc = 0xFFFFFFFF;
            const end = Math.min(startOffset + size, this.u8.length);

            for (let i = startOffset; i < end; i++) {
                crc = crc ^ this.u8[i];
                for (let j = 0; j < 8; j++) {
                    crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
                }
            }

            return (crc ^ 0xFFFFFFFF) >>> 0;
        }

        /**
         * Retorna estatísticas de uso
         * 
         * @returns {Object} Estatísticas formatadas
         */
        getStats() {
            const totalReads = this.stats.reads8 + this.stats.reads16 + this.stats.reads32;
            const totalWrites = this.stats.writes8 + this.stats.writes16 + this.stats.writes32;

            return {
                totalReads,
                totalWrites,
                totalOperations: totalReads + totalWrites,
                reads: {
                    bytes: this.stats.reads8,
                    halfwords: this.stats.reads16,
                    words: this.stats.reads32
                },
                writes: {
                    bytes: this.stats.writes8,
                    halfwords: this.stats.writes16,
                    words: this.stats.writes32
                },
                lastReadAddr: `0x${this.stats.lastReadAddr.toString(16).padStart(8, '0').toUpperCase()}`,
                lastWriteAddr: `0x${this.stats.lastWriteAddr.toString(16).padStart(8, '0').toUpperCase()}`
            };
        }

        /**
         * Reseta contadores de estatísticas
         */
        resetStats() {
            this.stats = {
                reads8: 0,
                reads16: 0,
                reads32: 0,
                writes8: 0,
                writes16: 0,
                writes32: 0,
                lastReadAddr: 0,
                lastWriteAddr: 0
            };
        }

        // ========== VALIDAÇÃO ==========

        /**
         * Valida se um offset está dentro dos limites
         * 
         * @param {number} offset - Offset a validar
         * @param {number} [size=1] - Tamanho do acesso
         * @returns {boolean} True se o offset é válido
         */
        isValidOffset(offset, size = 1) {
            return offset >= 0 && offset + size <= this.size;
        }

        /**
         * Marca a região como read-only
         * Qualquer tentativa de escrita será bloqueada
         */
        makeReadOnly() {
            this.writable = false;
            console.log("[MEM] Região marcada como read-only");
        }

        /**
         * Marca a região como read-write
         */
        makeReadWrite() {
            this.writable = true;
            console.log("[MEM] Região marcada como read-write");
        }
    }

    // Exporta para o escopo global
    window.ArrayMemoryRegion = ArrayMemoryRegion;

    console.log("[MEMORY] ✓ ArrayMemoryRegion carregada com suporte a 8/16/32-bit");
}