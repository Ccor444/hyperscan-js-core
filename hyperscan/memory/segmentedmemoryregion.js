/**
 * SegmentedMemoryRegion - MIU (Memory Interface Unit)
 * HyperScan Emulator v2.0
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200 (Sunplus S+core)
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * Implementação da Memory Interface Unit que mapeia 256 segmentos de memória.
 * Cada segmento representa 16 MB de espaço de endereçamento.
 */

"use strict";

/**
 * MIU - Memory Interface Unit com suporte a segmentos
 * 
 * @extends MemoryRegion
 */
if (typeof SegmentedMemoryRegion === 'undefined') {
    class SegmentedMemoryRegion extends MemoryRegion {
        /**
         * Cria uma nova MIU com 256 segmentos
         */
        constructor() {
            super();

            /**
             * Array de 256 segmentos
             * @type {MemoryRegion[]}
             * @private
             */
            this.segments = new Array(256);
            for (let i = 0; i < 256; i++) {
                this.segments[i] = null;
            }

            /**
             * Mapa de nomes para segmentos (para debug)
             * @type {Map<number, string>}
             * @private
             */
            this.segmentNames = new Map();

            /**
             * Contadores de acesso por segmento
             * @type {Object}
             * @private
             */
            this.segmentStats = {};

            /**
             * Flag global para tracing
             * @type {boolean}
             */
            this.traceEnabled = false;

            /**
             * Flag para log de erros de acesso
             * @type {boolean}
             */
            this.logUnmappedAccess = true;

            console.log("[MIU] ✓ Memory Interface Unit inicializada (256 segmentos)");
        }

        // ========== MAPEAMENTO DE SEGMENTOS ==========

        /**
         * Mapeia uma região de memória em um segmento
         * 
         * @param {number} segment - Número do segmento (0-255)
         * @param {MemoryRegion} region - Região de memória a mapear
         * @param {string} [name] - Nome descritivo (para debug)
         */
        setRegion(segment, region, name = null) {
            // Validação
            if (typeof segment !== 'number' || segment < 0 || segment > 255) {
                throw new RangeError(`Segmento deve estar entre 0-255, recebido ${segment}`);
            }

            if (!(region instanceof MemoryRegion) && region !== null) {
                throw new TypeError(`Region deve ser uma instância de MemoryRegion, recebido ${typeof region}`);
            }

            // Mapear segmento
            this.segments[segment] = region;

            // Armazenar nome
            const segmentHex = `0x${segment.toString(16).padStart(2, '0').toUpperCase()}`;
            const displayName = name || (region ? region.constructor.name : "null");
            this.segmentNames.set(segment, displayName);

            // Inicializar stats
            this.segmentStats[segment] = {
                reads: 0,
                writes: 0,
                unmappedReads: 0,
                unmappedWrites: 0
            };

            console.log(`[MIU] Segmento ${segmentHex} mapeado → ${displayName}`);
        }

        /**
         * Remove o mapeamento de um segmento
         * 
         * @param {number} segment - Número do segmento
         */
        unmapSegment(segment) {
            if (segment >= 0 && segment < 256) {
                this.segments[segment] = null;
                const segmentHex = `0x${segment.toString(16).padStart(2, '0').toUpperCase()}`;
                console.log(`[MIU] Segmento ${segmentHex} desmapeado`);
            }
        }

        /**
         * Obtém a região mapeada em um segmento
         * 
         * @param {number} segment - Número do segmento (0-255)
         * @returns {MemoryRegion|null} Região mapeada ou null
         * @private
         */
        getRegion(segment) {
            return this.segments[segment];
        }

        /**
         * Extrai o segmento de um endereço de 32 bits
         * 
         * @param {number} address - Endereço de 32 bits
         * @returns {number} Número do segmento (0-255)
         * @private
         */
        getSegment(address) {
            return (address >>> 24) & 0xFF;
        }

        /**
         * Extrai o offset dentro do segmento
         * 
         * @param {number} address - Endereço de 32 bits
         * @returns {number} Offset dentro do segmento (0-16777215)
         * @private
         */
        getOffset(address) {
            return address & 0xFFFFFF;
        }

        /**
         * Reconstrói um endereço a partir de segmento e offset
         * 
         * @param {number} segment - Segmento (0-255)
         * @param {number} offset - Offset dentro do segmento (0-16777215)
         * @returns {number} Endereço de 32 bits
         * @private
         */
        makeAddress(segment, offset) {
            return ((segment & 0xFF) << 24) | (offset & 0xFFFFFF);
        }

        // ========== LEITURA ==========

        /**
         * Lê um byte (8 bits) do endereço segmentado
         * 
         * @param {number} address - Endereço de 32 bits
         * @returns {number} Byte lido (0-255)
         */
        readU8(address) {
            const segment = this.getSegment(address);
            const offset = this.getOffset(address);
            const region = this.getRegion(segment);

            if (this.traceEnabled) {
                console.log(`[MIU] readU8  @ 0x${address.toString(16).padStart(8, '0').toUpperCase()}`);
            }

            if (!region) {
                this.segmentStats[segment] = this.segmentStats[segment] || {};
                this.segmentStats[segment].unmappedReads = (this.segmentStats[segment].unmappedReads || 0) + 1;
                if (this.logUnmappedAccess) {
                    console.warn(
                        `[MIU] ⚠️ Leitura em segmento não mapeado: ` +
                        `0x${segment.toString(16).padStart(2, '0').toUpperCase()} @ ` +
                        `0x${offset.toString(16).padStart(6, '0').toUpperCase()}`
                    );
                }
                return 0;
            }

            this.segmentStats[segment] = this.segmentStats[segment] || {};
            this.segmentStats[segment].reads = (this.segmentStats[segment].reads || 0) + 1;
            return region.readU8(offset);
        }

        /**
         * Lê uma halfword (16 bits) do endereço segmentado
         * 
         * @param {number} address - Endereço de 32 bits (será alinhado a 2 bytes)
         * @returns {number} Halfword lido (0-65535)
         */
        readU16(address) {
            const segment = this.getSegment(address);
            const offset = this.getOffset(address);
            const region = this.getRegion(segment);

            if (this.traceEnabled) {
                console.log(`[MIU] readU16 @ 0x${address.toString(16).padStart(8, '0').toUpperCase()}`);
            }

            if (!region) {
                this.segmentStats[segment] = this.segmentStats[segment] || {};
                this.segmentStats[segment].unmappedReads = (this.segmentStats[segment].unmappedReads || 0) + 1;
                if (this.logUnmappedAccess) {
                    console.warn(
                        `[MIU] ⚠️ Leitura em segmento não mapeado: ` +
                        `0x${segment.toString(16).padStart(2, '0').toUpperCase()} @ ` +
                        `0x${offset.toString(16).padStart(6, '0').toUpperCase()}`
                    );
                }
                return 0;
            }

            this.segmentStats[segment] = this.segmentStats[segment] || {};
            this.segmentStats[segment].reads = (this.segmentStats[segment].reads || 0) + 1;
            return region.readU16(offset);
        }

        /**
         * Lê uma word (32 bits) do endereço segmentado
         * 
         * @param {number} address - Endereço de 32 bits (será alinhado a 4 bytes)
         * @returns {number} Word lido (0-4294967295, como unsigned)
         */
        readU32(address) {
            const segment = this.getSegment(address);
            const offset = this.getOffset(address);
            const region = this.getRegion(segment);

            if (this.traceEnabled) {
                console.log(`[MIU] readU32 @ 0x${address.toString(16).padStart(8, '0').toUpperCase()}`);
            }

            if (!region) {
                this.segmentStats[segment] = this.segmentStats[segment] || {};
                this.segmentStats[segment].unmappedReads = (this.segmentStats[segment].unmappedReads || 0) + 1;
                if (this.logUnmappedAccess) {
                    console.warn(
                        `[MIU] ⚠️ Leitura em segmento não mapeado: ` +
                        `0x${segment.toString(16).padStart(2, '0').toUpperCase()} @ ` +
                        `0x${offset.toString(16).padStart(6, '0').toUpperCase()}`
                    );
                }
                return 0;
            }

            this.segmentStats[segment] = this.segmentStats[segment] || {};
            this.segmentStats[segment].reads = (this.segmentStats[segment].reads || 0) + 1;
            return region.readU32(offset);
        }

        // ========== ESCRITA ==========

        /**
         * Escreve um byte (8 bits) no endereço segmentado
         * 
         * @param {number} address - Endereço de 32 bits
         * @param {number} value - Valor a escrever (será mascarado a 8 bits)
         */
        writeU8(address, value) {
            const segment = this.getSegment(address);
            const offset = this.getOffset(address);
            const region = this.getRegion(segment);

            if (this.traceEnabled) {
                console.log(
                    `[MIU] writeU8 @ 0x${address.toString(16).padStart(8, '0').toUpperCase()} = ` +
                    `0x${(value & 0xFF).toString(16).padStart(2, '0').toUpperCase()}`
                );
            }

            if (!region) {
                this.segmentStats[segment] = this.segmentStats[segment] || {};
                this.segmentStats[segment].unmappedWrites = (this.segmentStats[segment].unmappedWrites || 0) + 1;
                if (this.logUnmappedAccess) {
                    console.warn(
                        `[MIU] ⚠️ Escrita em segmento não mapeado: ` +
                        `0x${segment.toString(16).padStart(2, '0').toUpperCase()} @ ` +
                        `0x${offset.toString(16).padStart(6, '0').toUpperCase()}`
                    );
                }
                return;
            }

            this.segmentStats[segment] = this.segmentStats[segment] || {};
            this.segmentStats[segment].writes = (this.segmentStats[segment].writes || 0) + 1;
            region.writeU8(offset, value);
        }

        /**
         * Escreve uma halfword (16 bits) no endereço segmentado
         * 
         * @param {number} address - Endereço de 32 bits (será alinhado a 2 bytes)
         * @param {number} value - Valor a escrever (será mascarado a 16 bits)
         */
        writeU16(address, value) {
            const segment = this.getSegment(address);
            const offset = this.getOffset(address);
            const region = this.getRegion(segment);

            if (this.traceEnabled) {
                console.log(
                    `[MIU] writeU16 @ 0x${address.toString(16).padStart(8, '0').toUpperCase()} = ` +
                    `0x${(value & 0xFFFF).toString(16).padStart(4, '0').toUpperCase()}`
                );
            }

            if (!region) {
                this.segmentStats[segment] = this.segmentStats[segment] || {};
                this.segmentStats[segment].unmappedWrites = (this.segmentStats[segment].unmappedWrites || 0) + 1;
                if (this.logUnmappedAccess) {
                    console.warn(
                        `[MIU] ⚠️ Escrita em segmento não mapeado: ` +
                        `0x${segment.toString(16).padStart(2, '0').toUpperCase()} @ ` +
                        `0x${offset.toString(16).padStart(6, '0').toUpperCase()}`
                    );
                }
                return;
            }

            this.segmentStats[segment] = this.segmentStats[segment] || {};
            this.segmentStats[segment].writes = (this.segmentStats[segment].writes || 0) + 1;
            region.writeU16(offset, value);
        }

        /**
         * Escreve uma word (32 bits) no endereço segmentado
         * 
         * @param {number} address - Endereço de 32 bits (será alinhado a 4 bytes)
         * @param {number} value - Valor a escrever (será mascarado a 32 bits)
         */
        writeU32(address, value) {
            const segment = this.getSegment(address);
            const offset = this.getOffset(address);
            const region = this.getRegion(segment);

            if (this.traceEnabled) {
                console.log(
                    `[MIU] writeU32 @ 0x${address.toString(16).padStart(8, '0').toUpperCase()} = ` +
                    `0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
                );
            }

            if (!region) {
                this.segmentStats[segment] = this.segmentStats[segment] || {};
                this.segmentStats[segment].unmappedWrites = (this.segmentStats[segment].unmappedWrites || 0) + 1;
                if (this.logUnmappedAccess) {
                    console.warn(
                        `[MIU] ⚠️ Escrita em segmento não mapeado: ` +
                        `0x${segment.toString(16).padStart(2, '0').toUpperCase()} @ ` +
                        `0x${offset.toString(16).padStart(6, '0').toUpperCase()}`
                    );
                }
                return;
            }

            this.segmentStats[segment] = this.segmentStats[segment] || {};
            this.segmentStats[segment].writes = (this.segmentStats[segment].writes || 0) + 1;
            region.writeU32(offset, value);
        }

        // ========== OPERAÇÕES EM BLOCO ==========

        /**
         * Copia dados entre endereços
         * 
         * @param {number} destAddr - Endereço de destino
         * @param {number} srcAddr - Endereço de origem
         * @param {number} size - Número de bytes a copiar
         * @returns {number} Número de bytes copiados
         */
        memcpy(destAddr, srcAddr, size) {
            let copied = 0;

            for (let i = 0; i < size; i++) {
                const byte = this.readU8(srcAddr + i);
                this.writeU8(destAddr + i, byte);
                copied++;
            }

            console.log(`[MIU] memcpy: ${copied} bytes copiados de 0x${srcAddr.toString(16)} para 0x${destAddr.toString(16)}`);
            return copied;
        }

        /**
         * Preenche um intervalo de endereços com um padrão
         * 
         * @param {number} address - Endereço inicial
         * @param {number} pattern - Byte a preencher (0-255)
         * @param {number} size - Número de bytes
         */
        memset(address, pattern, size) {
            pattern = pattern & 0xFF;

            for (let i = 0; i < size; i++) {
                this.writeU8(address + i, pattern);
            }

            console.log(`[MIU] memset: Preenchidos ${size} bytes com 0x${pattern.toString(16).padStart(2, '0')} em 0x${address.toString(16)}`);
        }

        // ========== DEBUG E ANÁLISE ==========

        /**
         * Gera dump hexadecimal de memória
         * 
         * @param {number} address - Endereço inicial
         * @param {number} size - Número de bytes (padrão: 256)
         * @returns {string} Dump formatado
         */
        dump(address = 0, size = 256) {
            const lines = [];
            let addr = address & (~0x0F);
            const segment = this.getSegment(addr);

            lines.push(`=== Dump de 0x${address.toString(16).padStart(8, '0').toUpperCase()} (${size} bytes) ===`);
            lines.push("");

            for (let i = 0; i < size; i += 16) {
                let line = `${addr.toString(16).padStart(8, '0').toUpperCase()}: `;
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
         * Lista todos os segmentos mapeados
         * 
         * @returns {Object[]} Array de informações de segmentos
         */
        listSegments() {
            const segments = [];

            for (let i = 0; i < 256; i++) {
                const region = this.segments[i];
                if (region) {
                    const name = this.segmentNames.get(i) || "desconhecido";
                    const stats = this.segmentStats[i] || {};
                    const startAddr = this.makeAddress(i, 0);
                    const endAddr = this.makeAddress(i, 0xFFFFFF);

                    segments.push({
                        segment: `0x${i.toString(16).padStart(2, '0').toUpperCase()}`,
                        name,
                        startAddr: `0x${startAddr.toString(16).padStart(8, '0').toUpperCase()}`,
                        endAddr: `0x${endAddr.toString(16).padStart(8, '0').toUpperCase()}`,
                        type: region.constructor.name,
                        reads: stats.reads || 0,
                        writes: stats.writes || 0,
                        unmappedReads: stats.unmappedReads || 0,
                        unmappedWrites: stats.unmappedWrites || 0
                    });
                }
            }

            return segments;
        }

        /**
         * Exibe mapa de memória formatado
         * 
         * @returns {string} Mapa de memória em texto
         */
        getMemoryMap() {
            const lines = [];
            lines.push("=== Mapa de Memória SPCE3200 ===\n");

            for (let i = 0; i < 256; i++) {
                const region = this.segments[i];
                if (region) {
                    const name = this.segmentNames.get(i) || "?";
                    const start = this.makeAddress(i, 0);
                    const end = this.makeAddress(i, 0xFFFFFF);

                    lines.push(
                        `0x${i.toString(16).padStart(2, '0').toUpperCase()} | ` +
                        `${start.toString(16).padStart(8, '0').toUpperCase()}-${end.toString(16).padStart(8, '0').toUpperCase()} | ` +
                        `${name.padEnd(20)} | ${region.constructor.name}`
                    );
                }
            }

            return lines.join("\n");
        }

        /**
         * Retorna informações gerais da MIU
         * 
         * @returns {Object} Informações formatadas
         */
        getInfo() {
            const mapped = this.segments.filter(s => s !== null).length;
            const unmapped = 256 - mapped;

            return {
                type: this.constructor.name,
                segmentsMapped: mapped,
                segmentsUnmapped: unmapped,
                segments: this.listSegments(),
                stats: this.segmentStats
            };
        }

        /**
         * Habilita/desabilita logging de acessos não mapeados
         * 
         * @param {boolean} enabled - True para habilitar
         */
        setLogUnmappedAccess(enabled) {
            this.logUnmappedAccess = enabled;
            console.log(`[MIU] Log de acesso não mapeado: ${enabled ? "✓ Ativado" : "✗ Desativado"}`);
        }

        /**
         * Habilita/desabilita tracing de acessos à memória
         * 
         * @param {boolean} enabled - True para habilitar
         */
        setTrace(enabled) {
            this.traceEnabled = enabled;
            console.log(`[MIU] Memory trace: ${enabled ? "✓ Ativado" : "✗ Desativado"}`);
        }

        /**
         * Reseta todas as estatísticas
         */
        resetStats() {
            for (let i = 0; i < 256; i++) {
                if (this.segmentStats[i]) {
                    this.segmentStats[i] = {
                        reads: 0,
                        writes: 0,
                        unmappedReads: 0,
                        unmappedWrites: 0
                    };
                }
            }
            console.log("[MIU] Estatísticas resetadas");
        }

        /**
         * Exibe sumário de uso de memória
         * 
         * @returns {string} Sumário formatado
         */
        getSummary() {
            const lines = [];
            lines.push("=== Memory Interface Unit Summary ===\n");

            let totalReads = 0;
            let totalWrites = 0;
            let totalUnmappedReads = 0;
            let totalUnmappedWrites = 0;

            for (const segment of Object.values(this.segmentStats)) {
                totalReads += segment.reads || 0;
                totalWrites += segment.writes || 0;
                totalUnmappedReads += segment.unmappedReads || 0;
                totalUnmappedWrites += segment.unmappedWrites || 0;
            }

            lines.push(`Total Reads:            ${totalReads.toLocaleString()}`);
            lines.push(`Total Writes:           ${totalWrites.toLocaleString()}`);
            lines.push(`Unmapped Reads:         ${totalUnmappedReads}`);
            lines.push(`Unmapped Writes:        ${totalUnmappedWrites}`);
            lines.push(`Total Operations:       ${(totalReads + totalWrites).toLocaleString()}`);
            lines.push(`Segments Mapped:        ${this.segments.filter(s => s !== null).length}/256`);

            return lines.join("\n");
        }
    }

    // Exporta para o escopo global
    window.SegmentedMemoryRegion = SegmentedMemoryRegion;

    console.log("[MEMORY] ✓ SegmentedMemoryRegion (MIU) carregada com 256 segmentos");
}