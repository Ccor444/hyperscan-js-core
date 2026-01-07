/**
 * MemoryRegion - Classe Base para Regiões de Memória
 * HyperScan Emulator v2.0
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200 (Sunplus S+core)
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * Defines the abstract interface for memory regions in the emulated system.
 * All memory access goes through subclasses of this.
 */

"use strict";

/**
 * Classe base abstrata para regiões de memória
 * 
 * Define a interface que todas as regiões de memória devem implementar.
 * Suporta acesso de 8, 16 e 32 bits.
 * 
 * @abstract
 */
if (typeof MemoryRegion === 'undefined') {
    class MemoryRegion {
        /**
         * Cria uma nova região de memória
         */
        constructor() {
            if (new.target === MemoryRegion) {
                throw new TypeError("MemoryRegion é uma classe abstrata");
            }
        }

        /**
         * Lê um byte (8 bits) de um offset
         * 
         * @param {number} offset - Offset dentro da região (0 a tamanho-1)
         * @returns {number} Valor do byte (0-255)
         * @abstract
         */
        readU8(offset) {
            throw new Error(`readU8(${offset}) não implementado em ${this.constructor.name}`);
        }

        /**
         * Lê uma halfword (16 bits) de um offset
         * 
         * @param {number} offset - Offset dentro da região (deve estar alinhado a 2 bytes)
         * @returns {number} Valor da halfword (0-65535)
         * @abstract
         */
        readU16(offset) {
            throw new Error(`readU16(${offset}) não implementado em ${this.constructor.name}`);
        }

        /**
         * Lê uma word (32 bits) de um offset
         * 
         * @param {number} offset - Offset dentro da região (deve estar alinhado a 4 bytes)
         * @returns {number} Valor da word (0-4294967295, como unsigned)
         * @abstract
         */
        readU32(offset) {
            throw new Error(`readU32(${offset}) não implementado em ${this.constructor.name}`);
        }

        /**
         * Escreve um byte (8 bits) em um offset
         * 
         * @param {number} offset - Offset dentro da região
         * @param {number} value - Valor do byte a escrever (0-255)
         * @abstract
         */
        writeU8(offset, value) {
            throw new Error(`writeU8(${offset}, ${value}) não implementado em ${this.constructor.name}`);
        }

        /**
         * Escreve uma halfword (16 bits) em um offset
         * 
         * @param {number} offset - Offset dentro da região
         * @param {number} value - Valor a escrever (0-65535)
         * @abstract
         */
        writeU16(offset, value) {
            throw new Error(`writeU16(${offset}, ${value}) não implementado em ${this.constructor.name}`);
        }

        /**
         * Escreve uma word (32 bits) em um offset
         * 
         * @param {number} offset - Offset dentro da região
         * @param {number} value - Valor a escrever (0-4294967295)
         * @abstract
         */
        writeU32(offset, value) {
            throw new Error(`writeU32(${offset}, ${value}) não implementado em ${this.constructor.name}`);
        }

        /**
         * Obtém informações sobre a região (para debug)
         * 
         * @returns {Object} Informações da região
         */
        getInfo() {
            return {
                type: this.constructor.name,
                readable: true,
                writable: true
            };
        }

        /**
         * Valida um offset dentro da região
         * 
         * @param {number} offset - Offset a validar
         * @returns {boolean} True se o offset é válido
         */
        isValidOffset(offset) {
            return offset >= 0;
        }

        /**
         * Hook chamado antes de leitura (para debug/logging)
         * 
         * @param {number} offset - Offset sendo lido
         * @param {number} size - Tamanho da leitura (1, 2 ou 4)
         * @protected
         */
        _onBeforeRead(offset, size) {
            // Override em subclasses se necessário
        }

        /**
         * Hook chamado depois de leitura (para debug/logging)
         * 
         * @param {number} offset - Offset lido
         * @param {number} size - Tamanho da leitura
         * @param {number} value - Valor lido
         * @protected
         */
        _onAfterRead(offset, size, value) {
            // Override em subclasses se necessário
        }

        /**
         * Hook chamado antes de escrita (para debug/logging)
         * 
         * @param {number} offset - Offset sendo escrito
         * @param {number} size - Tamanho da escrita (1, 2 ou 4)
         * @param {number} value - Valor a escrever
         * @protected
         */
        _onBeforeWrite(offset, size, value) {
            // Override em subclasses se necessário
        }

        /**
         * Hook chamado depois de escrita (para debug/logging)
         * 
         * @param {number} offset - Offset escrito
         * @param {number} size - Tamanho da escrita
         * @param {number} value - Valor escrito
         * @protected
         */
        _onAfterWrite(offset, size, value) {
            // Override em subclasses se necessário
        }
    }

    // Exporta para o escopo global
    window.MemoryRegion = MemoryRegion;

    console.log("[MEMORY] ✓ MemoryRegion classe base carregada");
}