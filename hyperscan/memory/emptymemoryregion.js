/**
 * EmptyMemoryRegion - Região de Memória Vazia (Null Sink/Source)
 * HyperScan Emulator v2.0
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200 (Sunplus S+core)
 * 
 * Autor: Ccor444
 * Data: 2025-12-25
 * 
 * Implementação de região de memória "vazia" que simula espaço não mapeado.
 * Leituras retornam 0, escritas são descartadas (ou logadas para debug).
 * 
 * Casos de uso:
 * - Espaço não mapeado (segmentos não utilizados)
 * - Debug: detectar acessos a regiões inválidas
 * - Simulação de periféricos read-only ou write-only
 */

"use strict";

/**
 * Região de memória vazia - comportamento configurável
 * 
 * Pode ser usada para:
 * 1. Null Sink: Descartar escritas, retornar 0 em leituras
 * 2. Null Source: Sempre retornar um padrão fixo
 * 3. Read-Only: Bloquear escritas
 * 4. Write-Only: Bloquear leituras
 * 5. Debug: Logar todos os acessos
 * 
 * @extends MemoryRegion
 */
if (typeof EmptyMemoryRegion === 'undefined') {
    class EmptyMemoryRegion extends MemoryRegion {
        /**
         * Cria uma nova região vazia
         * 
         * @param {Object} [options={}] - Opções de configuração
         * @param {string} [options.mode='sink'] - Modo: 'sink', 'source', 'readonly', 'writeonly', 'debug'
         * @param {number} [options.defaultValue=0] - Valor padrão para leituras
         * @param {string} [options.name='Unknown'] - Nome descritivo para debug
         * @param {boolean} [options.logAccess=false] - Logar todos os acessos
         * @param {boolean} [options.throwOnAccess=false] - Lançar exceção em acesso
         */
        constructor(options = {}) {
            super();

            /**
             * Modo de operação
             * @type {string}
             */
            this.mode = options.mode || 'sink';

            /**
             * Valor padrão para leituras
             * @type {number}
             */
            this.defaultValue = (options.defaultValue || 0) >>> 0;

            /**
             * Nome descritivo
             * @type {string}
             */
            this.name = options.name || 'EmptyMemoryRegion';

            /**
             * Habilitar logging de acessos
             * @type {boolean}
             */
            this.logAccess = options.logAccess || false;

            /**
             * Lançar exceção em acesso
             * @type {boolean}
             */
            this.throwOnAccess = options.throwOnAccess || false;

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
                blockedReads: 0,
                blockedWrites: 0
            };

            console.log(`[EMPTY] ✓ EmptyMemoryRegion criada (${this.name}) - Modo: ${this.mode}`);
        }

        /**
         * Valida se acesso é permitido no modo atual
         * 
         * @param {string} operation - 'read' ou 'write'
         * @returns {boolean} True se acesso é permitido
         * @private
         */
        _canAccess(operation) {
            if (this.mode === 'readonly' && operation === 'write') {
                return false;
            }
            if (this.mode === 'writeonly' && operation === 'read') {
                return false;
            }
            return true;
        }

        /**
         * Log de acesso (se habilitado)
         * 
         * @param {string} operation - 'read' ou 'write'
         * @param {number} offset - Offset acessado
         * @param {number} size - Tamanho do acesso (1, 2 ou 4)
         * @param {number} [value] - Valor (para write)
         * @private
         */
        _logAccess(operation, offset, size, value = undefined) {
            if (!this.logAccess && this.mode !== 'debug') {
                return;
            }

            const sizeStr = { 1: 'U8', 2: 'U16', 4: 'U32' }[size] || 'U?';
            const offsetHex = offset.toString(16).padStart(6, '0').toUpperCase();

            if (operation === 'read') {
                console.log(`[${this.name}] read${sizeStr}(0x${offsetHex}) → 0x${value.toString(16).padStart(size * 2, '0').toUpperCase()}`);
            } else {
                const valHex = (value >>> 0).toString(16).padStart(size * 2, '0').toUpperCase();
                console.log(`[${this.name}] write${sizeStr}(0x${offsetHex}, 0x${valHex})`);
            }
        }

        /**
         * Trata acesso bloqueado
         * 
         * @param {string} operation - 'read' ou 'write'
         * @param {string} sizeStr - 'U8', 'U16' ou 'U32'
         * @param {number} offset - Offset acessado
         * @private
         */
        _handleBlockedAccess(operation, sizeStr, offset) {
            const msg = `${operation.toUpperCase()} bloqueado em ${this.name} (${this.mode}) @ 0x${offset.toString(16).padStart(6, '0').toUpperCase()}`;

            if (this.throwOnAccess) {
                throw new Error(msg);
            }

            console.warn(`[${this.name}] ⚠️ ${msg}`);
        }

        // ========== LEITURA ==========

        /**
         * Lê um byte (8 bits)
         * 
         * @param {number} offset - Offset (ignorado)
         * @returns {number} Valor padrão ou 0
         */
        readU8(offset) {
            if (!this._canAccess('read')) {
                this.stats.blockedReads++;
                this._handleBlockedAccess('read', 'U8', offset);
                return 0;
            }

            this.stats.reads8++;
            const value = this.defaultValue & 0xFF;
            this._logAccess('read', offset, 1, value);

            return value;
        }

        /**
         * Lê uma halfword (16 bits)
         * 
         * @param {number} offset - Offset (ignorado)
         * @returns {number} Valor padrão ou 0
         */
        readU16(offset) {
            if (!this._canAccess('read')) {
                this.stats.blockedReads++;
                this._handleBlockedAccess('read', 'U16', offset);
                return 0;
            }

            this.stats.reads16++;
            const value = this.defaultValue & 0xFFFF;
            this._logAccess('read', offset, 2, value);

            return value;
        }

        /**
         * Lê uma word (32 bits)
         * 
         * @param {number} offset - Offset (ignorado)
         * @returns {number} Valor padrão ou 0
         */
        readU32(offset) {
            if (!this._canAccess('read')) {
                this.stats.blockedReads++;
                this._handleBlockedAccess('read', 'U32', offset);
                return 0;
            }

            this.stats.reads32++;
            const value = this.defaultValue >>> 0;
            this._logAccess('read', offset, 4, value);

            return value;
        }

        // ========== ESCRITA ==========

        /**
         * Escreve um byte (8 bits)
         * 
         * @param {number} offset - Offset (ignorado)
         * @param {number} value - Valor (descartado)
         */
        writeU8(offset, value) {
            if (!this._canAccess('write')) {
                this.stats.blockedWrites++;
                this._handleBlockedAccess('write', 'U8', offset);
                return;
            }

            this.stats.writes8++;
            this._logAccess('write', offset, 1, value & 0xFF);
        }

        /**
         * Escreve uma halfword (16 bits)
         * 
         * @param {number} offset - Offset (ignorado)
         * @param {number} value - Valor (descartado)
         */
        writeU16(offset, value) {
            if (!this._canAccess('write')) {
                this.stats.blockedWrites++;
                this._handleBlockedAccess('write', 'U16', offset);
                return;
            }

            this.stats.writes16++;
            this._logAccess('write', offset, 2, value & 0xFFFF);
        }

        /**
         * Escreve uma word (32 bits)
         * 
         * @param {number} offset - Offset (ignorado)
         * @param {number} value - Valor (descartado)
         */
        writeU32(offset, value) {
            if (!this._canAccess('write')) {
                this.stats.blockedWrites++;
                this._handleBlockedAccess('write', 'U32', offset);
                return;
            }

            this.stats.writes32++;
            this._logAccess('write', offset, 4, value >>> 0);
        }

        // ========== CONFIGURAÇÃO ==========

        /**
         * Muda o modo de operação
         * 
         * @param {string} mode - Novo modo ('sink', 'source', 'readonly', 'writeonly', 'debug')
         */
        setMode(mode) {
            const validModes = ['sink', 'source', 'readonly', 'writeonly', 'debug'];
            if (!validModes.includes(mode)) {
                throw new Error(`Modo inválido: ${mode}. Válidos: ${validModes.join(', ')}`);
            }

            this.mode = mode;
            console.log(`[${this.name}] Modo alterado para: ${mode}`);
        }

        /**
         * Define o valor padrão para leituras
         * 
         * @param {number} value - Novo valor padrão
         */
        setDefaultValue(value) {
            this.defaultValue = value >>> 0;
            console.log(`[${this.name}] Valor padrão alterado para: 0x${this.defaultValue.toString(16).padStart(8, '0').toUpperCase()}`);
        }

        /**
         * Habilita/desabilita logging
         * 
         * @param {boolean} enabled - True para habilitar
         */
        setLogAccess(enabled) {
            this.logAccess = enabled;
            console.log(`[${this.name}] Logging: ${enabled ? 'Ativado' : 'Desativado'}`);
        }

        /**
         * Habilita/desabilita lançamento de exceção
         * 
         * @param {boolean} enabled - True para habilitar
         */
        setThrowOnAccess(enabled) {
            this.throwOnAccess = enabled;
            console.log(`[${this.name}] Exceção em acesso: ${enabled ? 'Ativada' : 'Desativada'}`);
        }

        // ========== DEBUG ==========

        /**
         * Retorna informações sobre a região
         * 
         * @returns {Object} Informações formatadas
         */
        getInfo() {
            return {
                type: this.constructor.name,
                name: this.name,
                mode: this.mode,
                defaultValue: `0x${this.defaultValue.toString(16).padStart(8, '0').toUpperCase()}`,
                logAccess: this.logAccess,
                throwOnAccess: this.throwOnAccess,
                stats: { ...this.stats }
            };
        }

        /**
         * Retorna estatísticas de acesso
         * 
         * @returns {Object} Estatísticas formatadas
         */
        getStats() {
            const totalReads = this.stats.reads8 + this.stats.reads16 + this.stats.reads32;
            const totalWrites = this.stats.writes8 + this.stats.writes16 + this.stats.writes32;
            const totalBlocked = this.stats.blockedReads + this.stats.blockedWrites;

            return {
                totalReads,
                totalWrites,
                totalOperations: totalReads + totalWrites,
                totalBlocked,
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
                blockedReads: this.stats.blockedReads,
                blockedWrites: this.stats.blockedWrites
            };
        }

        /**
         * Reseta contadores
         */
        resetStats() {
            this.stats = {
                reads8: 0,
                reads16: 0,
                reads32: 0,
                writes8: 0,
                writes16: 0,
                writes32: 0,
                blockedReads: 0,
                blockedWrites: 0
            };
            console.log(`[${this.name}] Estatísticas resetadas`);
        }

        /**
         * Retorna sumário formatado
         * 
         * @returns {string} Sumário em texto
         */
        getSummary() {
            const stats = this.getStats();
            const lines = [];

            lines.push(`=== ${this.name} (${this.mode.toUpperCase()}) ===`);
            lines.push(`Total Reads:           ${stats.totalReads}`);
            lines.push(`Total Writes:          ${stats.totalWrites}`);
            lines.push(`Total Blocked:         ${stats.totalBlocked}`);
            lines.push(`Default Value:         0x${this.defaultValue.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push("");
            lines.push(`Reads:  ${stats.reads.bytes}(U8) + ${stats.reads.halfwords}(U16) + ${stats.reads.words}(U32)`);
            lines.push(`Writes: ${stats.writes.bytes}(U8) + ${stats.writes.halfwords}(U16) + ${stats.writes.words}(U32)`);

            return lines.join("\n");
        }

        /**
         * Valida um offset (sempre válido em EmptyMemoryRegion)
         * 
         * @param {number} offset - Offset a validar
         * @returns {boolean} Sempre true
         */
        isValidOffset(offset) {
            return true;
        }
    }

    // Exporta para o escopo global
    window.EmptyMemoryRegion = EmptyMemoryRegion;

    console.log("[MEMORY] ✓ EmptyMemoryRegion carregada (Null Sink/Source)");
}