/**
 * CDROM_v4.0_PARTE2.js - Core CDROMDriver
 * Leitura, MMIO, Comandos, DMA
 * Data: 2025-01-03
 */

"use strict";

if (typeof CDROMDriver === 'undefined') {

    class CDROMDriver {
        constructor() {
            this.name = "CDROM";

            // ========== MÍDIA ==========
            this.mediaFile = null;
            this.mediaData = null;
            this.iso9660 = null;
            this.udf = null;
            this.mediaLoaded = false;
            this.mediaName = "";

            // ========== FORMATO ==========
            this.isRaw = false;
            this.sectorSize = 2048;
            this.dataOffset = 0;
            this.cdMode = "Mode1";
            this.totalSectors = 0;

            // ========== REGISTRADORES ==========
            this.regs = {
                STATUS: 0x00,
                COMMAND: 0x00,
                SECTOR_POS: 0x00,
                SECTOR_COUNT: 0x01,
                DMA_ADDR: 0x00,
                DMA_SIZE: 0x00,
                ERROR: 0x00,
                INT_FLAG: 0x00,
                INT_ENABLE: 0x00
            };

            // ========== FLAGS ==========
            this.STATUS_READY = 0x01;
            this.STATUS_READING = 0x02;
            this.STATUS_ERROR = 0x10;

            // ========== COMANDOS ==========
            this.CMD_RESET = 0x80;
            this.CMD_GET_STATUS = 0x01;
            this.CMD_SEEK = 0x15;
            this.CMD_READ = 0x06;
            this.CMD_STOP = 0x08;

            // ========== BUFFER ==========
            this.sectorBuffer = new Uint8Array(2048);
            this.sectorBufferIndex = 0;
            this.currentLBA = 0;
            this.remainingSectors = 0;

            // ========== CACHE ==========
            this.sectorCache = new Map();
            this.cacheSizeLimit = 32;

            // ========== PERIFÉRICOS ==========
            this.intC = null;
            this.miu = null;

            // ========== CALLBACKS ==========
            this.onSectorRead = null;
            this.onMediaLoaded = null;
            this.onError = null;

            // ========== TIMING ==========
            this.seekLatency = 150;
            this.readLatency = 80;
            this.dmaTransferRate = 150;

            // ========== STATS ==========
            this.stats = {
                sectorsRead: 0,
                bytesRead: 0,
                dmaTransfers: 0,
                errors: 0,
                cacheHits: 0,
                cacheMisses: 0,
                validationErrors: 0
            };

            this.debugEnabled = false;

            console.log("[CDROM] ✅ Driver v4.0 inicializado");
        }

        // ========== CARREGAMENTO DE MÍDIA ==========

        /**
         * ✅ Suporta UDF + ISO9660
         */
        async loadMedia(file) {
            return new Promise(async (resolve, reject) => {
                try {
                    console.log(`[CDROM] 📂 Carregando: ${file.name}`);

                    const buffer = await file.arrayBuffer();
                    this.mediaData = new Uint8Array(buffer);
                    this.mediaFile = file;
                    this.mediaName = file.name;

                    // Tentar UDF primeiro
                    try {
                        this.udf = new UDFParser(this.mediaData);
                        if (this.udf.format === "UDF") {
                            console.log("[CDROM] ✅ UDF detectada");
                        } else {
                            this.iso9660 = new ISO9660Parser(this.mediaData);
                        }
                    } catch (e) {
                        this.iso9660 = new ISO9660Parser(this.mediaData);
                    }

                    const parser = this.iso9660;
                    this.isRaw = parser.isRaw;
                    this.sectorSize = parser.sectorSize;
                    this.dataOffset = parser.dataOffset;
                    this.cdMode = parser.cdMode;
                    this.totalSectors = parser.totalSectors;

                    this.mediaLoaded = true;
                    this.regs.STATUS = this.STATUS_READY;

                    console.log("[CDROM] ✅ Mídia carregada!");
                    console.log(`[CDROM]   Formato: ${parser.getInfo().format}`);
                    console.log(`[CDROM]   CD Mode: ${this.cdMode}`);

                    if (this.onMediaLoaded) {
                        this.onMediaLoaded(parser.getInfo());
                    }

                    resolve(true);

                } catch (err) {
                    console.error("[CDROM] ❌ Erro:", err);
                    this._setError(0x01);
                    reject(err);
                }
            });
        }

        // ========== INTERFACE MMIO ==========

        /**
         * ✅ Lê registradores MMIO
         */
        readU32(offset) {
            offset = offset & 0xFFFF;

            switch (offset) {
                case 0x0000: // STATUS
                    return this.regs.STATUS;
                case 0x0004: // COMMAND
                    return this.regs.COMMAND;
                case 0x0008: // SECTOR_POS
                    return this.regs.SECTOR_POS >>> 0;
                case 0x000C: // SECTOR_COUNT
                    return this.regs.SECTOR_COUNT >>> 0;
                case 0x0014: // DATA (buffer)
                    if (this.sectorBufferIndex < this.sectorBuffer.length) {
                        return this.sectorBuffer[this.sectorBufferIndex++];
                    }
                    return 0;
                case 0x0018: // DMA_ADDR
                    return this.regs.DMA_ADDR >>> 0;
                case 0x001C: // DMA_SIZE
                    return this.regs.DMA_SIZE >>> 0;
                case 0x0024: // ERROR
                    const err = this.regs.ERROR;
                    this.regs.ERROR = 0x00;
                    return err;
                case 0x0028: // INT_FLAG
                    const flag = this.regs.INT_FLAG;
                    this.regs.INT_FLAG = 0x00;
                    return flag;
                case 0x002C: // INT_ENABLE
                    return this.regs.INT_ENABLE;
                default:
                    return 0;
            }
        }

        /**
         * ✅ Escreve em registradores MMIO
         */
        writeU32(offset, value) {
            offset = offset & 0xFFFF;
            value = value >>> 0;

            switch (offset) {
                case 0x0004: // COMMAND
                    this.regs.COMMAND = value & 0xFF;
                    this._executeCommand(value & 0xFF);
                    break;
                case 0x0008: // SECTOR_POS
                    this.regs.SECTOR_POS = value & 0xFFFFFF;
                    break;
                case 0x000C: // SECTOR_COUNT
                    this.regs.SECTOR_COUNT = value & 0xFF;
                    break;
                case 0x0018: // DMA_ADDR
                    this.regs.DMA_ADDR = value;
                    break;
                case 0x001C: // DMA_SIZE
                    this.regs.DMA_SIZE = value & 0xFFFF;
                    break;
                case 0x0020: // DMA_CTRL
                    if (value & 0x01) {
                        this._executeDMA();
                    }
                    break;
                case 0x002C: // INT_ENABLE
                    this.regs.INT_ENABLE = value & 0xFF;
                    break;
            }
        }

        // ========== LEITURA DE SETORES ==========

        /**
         * ✅ Lê setor com validação RAW
         */
        async _readSector(lba) {
            if (!this.mediaLoaded) {
                this._setError(0x01);
                return false;
            }

            try {
                // Verificar cache
                if (this.sectorCache.has(lba)) {
                    this.sectorBuffer.set(this.sectorCache.get(lba));
                    this.stats.cacheHits++;
                    return true;
                }

                this.stats.cacheMisses++;

                // ✅ CORRIGIDO: Cálculo correto para RAW vs ISO
                let sectorData;

                if (this.isRaw) {
                    // RAW: Sync(12) + Header(4) + Data(2048) + ECC(288)
                    const physicalOffset = lba * 2352;

                    if (physicalOffset + 2352 > this.mediaData.byteLength) {
                        this._setError(0x06);
                        return false;
                    }

                    // Validar sync bytes
                    const syncStart = physicalOffset;
                    const sync = this.mediaData.slice(syncStart, syncStart + 12);

                    if (!this._isValidSync(sync)) {
                        console.warn(`[CDROM] ⚠️ Sync inválido em LBA ${lba}`);
                        this.stats.validationErrors++;
                    }

                    // Extrair dados úteis
                    const dataStart = physicalOffset + 16;
                    sectorData = this.mediaData.slice(dataStart, dataStart + 2048);

                } else {
                    // ISO: Dados diretos
                    const physicalOffset = lba * 2048;

                    if (physicalOffset + 2048 > this.mediaData.byteLength) {
                        this._setError(0x06);
                        return false;
                    }

                    sectorData = this.mediaData.slice(physicalOffset, physicalOffset + 2048);
                }

                // Copiar para buffer
                this.sectorBuffer.set(sectorData);
                this.sectorBufferIndex = 0;

                // Cache
                this._addToCache(lba, sectorData);

                // Stats
                this.stats.sectorsRead++;
                this.stats.bytesRead += 2048;

                if (this.onSectorRead) {
                    this.onSectorRead(lba, this.sectorBuffer);
                }

                return true;

            } catch (err) {
                console.error("[CDROM] ❌ Erro ao ler:", err);
                this._setError(0x02);
                return false;
            }
        }

        /**
         * ✅ Validar sync bytes
         */
        _isValidSync(sync) {
            if (sync.length !== 12) return false;

            const expected = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];

            for (let i = 0; i < 12; i++) {
                if (sync[i] !== expected[i]) return false;
            }

            return true;
        }

        /**
         * Adicionar ao cache LRU
         */
        _addToCache(lba, data) {
            if (this.sectorCache.size >= this.cacheSizeLimit) {
                const firstKey = this.sectorCache.keys().next().value;
                this.sectorCache.delete(firstKey);
            }
            this.sectorCache.set(lba, new Uint8Array(data));
        }

        // ========== COMANDOS ==========

        /**
         * Executa comando CDROM
         */
        _executeCommand(cmd) {
            if (this.debugEnabled) {
                console.log(`[CDROM] CMD 0x${cmd.toString(16).padStart(2, '0')}`);
            }

            switch (cmd) {
                case this.CMD_RESET:
                    this._cmdReset();
                    break;
                case this.CMD_GET_STATUS:
                    this._cmdGetStatus();
                    break;
                case this.CMD_SEEK:
                    this._cmdSeek();
                    break;
                case this.CMD_READ:
                    this._cmdRead();
                    break;
                case this.CMD_STOP:
                    this._cmdStop();
                    break;
                default:
                    this._setError(0x05);
            }
        }

        _cmdReset() {
            this.regs.STATUS = this.STATUS_READY;
            this.sectorBuffer.fill(0);
            this.sectorCache.clear();
            this._triggerInterrupt();
        }

        _cmdGetStatus() {
            this.regs.STATUS = this.STATUS_READY;
            this._triggerInterrupt();
        }

        _cmdSeek() {
            this.regs.STATUS |= 0x08;
            setTimeout(() => {
                this.regs.STATUS &= ~0x08;
                this.regs.STATUS |= this.STATUS_READY;
                this._triggerInterrupt();
            }, this.seekLatency);
        }

        _cmdRead() {
            if (!this.mediaLoaded) {
                this._setError(0x01);
                return;
            }

            this.regs.STATUS |= this.STATUS_READING;
            this.currentLBA = this.regs.SECTOR_POS;
            this.remainingSectors = this.regs.SECTOR_COUNT || 1;

            this._readNextSector();
        }

        async _readNextSector() {
            if (this.remainingSectors === 0) {
                this.regs.STATUS &= ~this.STATUS_READING;
                this.regs.STATUS |= this.STATUS_READY;
                this._triggerInterrupt();
                return;
            }

            const success = await this._readSector(this.currentLBA);

            if (success) {
                this.currentLBA++;
                this.remainingSectors--;

                if (this.remainingSectors > 0) {
                    setTimeout(() => this._readNextSector(), this.readLatency);
                }
            }
        }

        _cmdStop() {
            this.regs.STATUS = this.STATUS_READY;
            this.remainingSectors = 0;
            this._triggerInterrupt();
        }

        // ========== DMA ==========

        /**
         * ✅ DMA burst mode
         */
        async _executeDMA() {
            if (!this.miu) {
                this._setError(0x04);
                return;
            }

            const dstAddr = this.regs.DMA_ADDR;
            const size = this.regs.DMA_SIZE;

            if (size === 0) return;

            try {
                console.log(`[CDROM] DMA: ${size} bytes → 0x${dstAddr.toString(16)}`);

                if (this.miu.writeBurst) {
                    await this.miu.writeBurst(dstAddr, this.sectorBuffer.slice(0, size));
                } else {
                    const burstSize = 32;
                    for (let burst = 0; burst < size; burst += burstSize) {
                        const chunkSize = Math.min(burstSize, size - burst);
                        const chunk = this.sectorBuffer.slice(burst, burst + chunkSize);

                        await new Promise(resolve => {
                            setTimeout(() => {
                                for (let i = 0; i < chunkSize; i++) {
                                    this.miu.writeU8(dstAddr + burst + i, chunk[i]);
                                }
                                resolve();
                            }, 1);
                        });
                    }
                }

                this.stats.dmaTransfers++;
                console.log(`[CDROM] ✅ DMA concluído`);
                this._triggerInterrupt();

            } catch (err) {
                console.error("[CDROM] ❌ Erro DMA:", err);
                this._setError(0x04);
            }
        }

        // ========== INTERRUPTS ==========

        _triggerInterrupt() {
            this.regs.INT_FLAG = 0x01;
            if (this.intC) {
                this.intC.trigger(null, 6);
            }
        }

        _setError(code) {
            this.regs.ERROR = code;
            this.regs.STATUS |= this.STATUS_ERROR;
            this.stats.errors++;
            this._triggerInterrupt();

            const messages = {
                0x01: "Media error",
                0x02: "Read error",
                0x03: "Invalid command",
                0x04: "DMA error",
                0x05: "Invalid parameter",
                0x06: "Sector out of bounds",
                0x07: "Seek timeout"
            };

            console.error(`[CDROM] ❌ Erro 0x${code.toString(16)}: ${messages[code]}`);
        }

        // ========== PERIFÉRICOS ==========

        connectInterruptController(intC) {
            this.intC = intC;
            console.log("[CDROM] ✅ Interrupt Controller conectado");
        }

        connectMIU(miu) {
            this.miu = miu;
            console.log("[CDROM] ✅ MIU conectada");
        }
    }

    // ========== EXPORTAÇÃO ==========
    window.CDROMDriver = CDROMDriver;
    console.log("[CDROM] ✅ Core carregado");

}