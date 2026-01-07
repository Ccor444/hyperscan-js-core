/**
 * CDROM_v4.0_PARTE3.js - File Operations + Debug
 * Operações de arquivo, info, status
 * Data: 2025-01-03
 */

"use strict";

// ========== FILE OPERATIONS ==========

CDROMDriver.prototype.readFile = async function(filename) {
    if (!this.iso9660 && !this.udf) {
        console.warn("[CDROM] Parsers não disponíveis");
        return null;
    }

    const fileEntry = this.iso9660?.findFile(filename) || 
                    this.udf?.findFile(filename);
    
    if (!fileEntry) {
        console.warn(`[CDROM] Arquivo não encontrado: ${filename}`);
        return null;
    }

    try {
        const data = new Uint8Array(fileEntry.size);
        const offset = (fileEntry.lba * this.sectorSize) + this.dataOffset;

        const chunkSize = 65536;
        for (let i = 0; i < fileEntry.size; i += chunkSize) {
            const size = Math.min(chunkSize, fileEntry.size - i);
            const chunk = this.mediaData.slice(offset + i, offset + i + size);
            data.set(chunk, i);
        }

        console.log(`[CDROM] ✅ Arquivo lido: ${filename}`);
        return data;

    } catch (err) {
        console.error("[CDROM] ❌ Erro ao ler:", err);
        return null;
    }
};

CDROMDriver.prototype.listFiles = function() {
    return this.iso9660?.listFiles() || this.udf?.listFiles?.() || [];
};

CDROMDriver.prototype.findFile = function(filename) {
    return this.iso9660?.findFile(filename) || this.udf?.findFile(filename);
};

CDROMDriver.prototype.getFileSize = function(filename) {
    const file = this.findFile(filename);
    return file ? file.size : 0;
};

// ========== CONVERSÃO LBA ↔ MSF ==========

CDROMDriver.prototype.lbaToMSF = function(lba) {
    const frames = lba + 150;
    const minutes = Math.floor(frames / 4500);
    const remainder = frames % 4500;
    const seconds = Math.floor(remainder / 75);
    const frames_out = remainder % 75;

    return {
        m: minutes,
        s: seconds,
        f: frames_out,
        toString: function() {
            return `${String(this.m).padStart(2, '0')}:${String(this.s).padStart(2, '0')}:${String(this.f).padStart(2, '0')}`;
        }
    };
};

CDROMDriver.prototype.msfToLBA = function(m, s, f) {
    const frames = m * 4500 + s * 75 + f;
    return frames - 150;
};

// ========== INFO E STATUS ==========

CDROMDriver.prototype.getInfo = function() {
    const parser = this.iso9660 || this.udf;
    return {
        type: "CDROMDriver",
        name: this.name,
        mediaLoaded: this.mediaLoaded,
        mediaName: this.mediaName,
        mediaSize: this.mediaData ? this.mediaData.byteLength : 0,
        format: parser?.getInfo()?.format || "UNKNOWN",
        cdMode: this.cdMode,
        currentLBA: this.currentLBA,
        status: {
            ready: !!(this.regs.STATUS & this.STATUS_READY),
            reading: !!(this.regs.STATUS & this.STATUS_READING),
            error: !!(this.regs.STATUS & this.STATUS_ERROR)
        },
        cache: {
            size: this.sectorCache.size,
            hits: this.stats.cacheHits,
            misses: this.stats.cacheMisses
        },
        stats: { ...this.stats }
    };
};

CDROMDriver.prototype.getStatus = function() {
    const lines = [];
    lines.push("═══════════════════════════════════════════");
    lines.push("         CDROM DRIVER STATUS (v4.0)");
    lines.push("═══════════════════════════════════════════");
    lines.push(`Media Loaded:        ${this.mediaLoaded ? "✅ YES" : "❌ NO"}`);
    lines.push(`Media Name:          ${this.mediaName || "None"}`);
    lines.push(`Format:              ${this.isRaw ? "RAW (2352)" : "ISO (2048)"}`);
    lines.push(`CD Mode:             ${this.cdMode}`);
    lines.push(`Total Sectors:       ${this.totalSectors}`);
    lines.push(`Current LBA:         ${this.currentLBA}`);
    lines.push(`Status Register:     0x${this.regs.STATUS.toString(16).padStart(2, '0').toUpperCase()}`);
    lines.push(`Error Register:      0x${this.regs.ERROR.toString(16).padStart(2, '0').toUpperCase()}`);
    lines.push("");
    lines.push(`Sectors Read:        ${this.stats.sectorsRead}`);
    lines.push(`Bytes Read:          ${(this.stats.bytesRead / 1024).toFixed(2)} KB`);
    lines.push(`Cache Hits:          ${this.stats.cacheHits}`);
    lines.push(`Cache Misses:        ${this.stats.cacheMisses}`);
    
    const hitRate = (this.stats.cacheHits + this.stats.cacheMisses > 0) 
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2)
        : "0";
    
    lines.push(`Hit Rate:            ${hitRate}%`);
    lines.push(`DMA Transfers:       ${this.stats.dmaTransfers}`);
    lines.push(`Validation Errors:   ${this.stats.validationErrors}`);
    lines.push(`Total Errors:        ${this.stats.errors}`);
    lines.push("");
    lines.push(`Seek Latency:        ${this.seekLatency}ms`);
    lines.push(`Read Latency/Sector: ${this.readLatency}ms`);
    lines.push(`DMA Rate:            ${this.dmaTransferRate} KB/s`);
    lines.push("═══════════════════════════════════════════");

    return lines.join("\n");
};

CDROMDriver.prototype.dump = function() {
    return this.getStatus();
};

CDROMDriver.prototype.validateMedia = function() {
    if (!this.mediaLoaded) {
        return { valid: false, reason: "Media not loaded" };
    }

    try {
        const parser = this.iso9660 || this.udf;
        if (!parser) {
            return { valid: false, reason: "No parser available" };
        }

        const files = this.listFiles();
        if (files.length === 0) {
            return { valid: false, reason: "No files found" };
        }

        return {
            valid: true,
            reason: "Valid media image",
            fileCount: files.length,
            mediaSize: this.mediaData.byteLength,
            format: this.isRaw ? "RAW" : "ISO",
            cdMode: this.cdMode
        };

    } catch (err) {
        return { valid: false, reason: err.message };
    }
};

CDROMDriver.prototype.reset = function() {
    this.regs.STATUS = this.STATUS_READY;
    this.regs.COMMAND = 0x00;
    this.regs.SECTOR_POS = 0x00;
    this.regs.SECTOR_COUNT = 1;
    this.regs.ERROR = 0x00;
    this.regs.INT_FLAG = 0x00;

    this.currentLBA = 0;
    this.remainingSectors = 0;
    this.sectorBufferIndex = 0;
    this.sectorBuffer.fill(0);
    this.sectorCache.clear();

    this.stats = {
        sectorsRead: 0,
        bytesRead: 0,
        dmaTransfers: 0,
        errors: 0,
        cacheHits: 0,
        cacheMisses: 0,
        validationErrors: 0
    };

    console.log("[CDROM] Reset completo");
};

CDROMDriver.prototype.setDebug = function(enabled) {
    this.debugEnabled = enabled;
    console.log(`[CDROM] Debug: ${enabled ? "ATIVADO" : "DESATIVADO"}`);
};

CDROMDriver.prototype.getDetailedStats = function() {
    const totalAccesses = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = totalAccesses > 0 
        ? (this.stats.cacheHits / totalAccesses * 100).toFixed(2)
        : "N/A";

    return {
        enabled: this.mediaLoaded,
        mediaName: this.mediaName,
        mediaSize: this.mediaData ? this.mediaData.byteLength : 0,
        mediaFormat: this.isRaw ? "RAW" : "ISO",
        cdMode: this.cdMode,
        totalSectors: this.totalSectors,
        currentLBA: this.currentLBA,
        sectorsRead: this.stats.sectorsRead,
        bytesRead: this.stats.bytesRead,
        dmaTransfers: this.stats.dmaTransfers,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        validationErrors: this.stats.validationErrors,
        totalErrors: this.stats.errors,
        cacheHitRate: `${hitRate}%`,
        throughput: this.stats.bytesRead > 0 
            ? `${(this.stats.bytesRead / 1024 / 1024).toFixed(2)} MB`
            : "0 MB",
        timing: {
            seekLatency: `${this.seekLatency}ms`,
            readLatency: `${this.readLatency}ms`,
            dmaRate: `${this.dmaTransferRate} KB/s`
        }
    };
};

CDROMDriver.prototype.testIntegrity = async function() {
    const results = {
        tested: 0,
        passed: 0,
        failed: 0,
        errors: []
    };

    const files = this.listFiles();

    for (let file of files.slice(0, 10)) {
        try {
            const data = await this.readFile(file.path);
            if (data) {
                results.tested++;
                results.passed++;
            }
        } catch (err) {
            results.failed++;
            results.errors.push({
                file: file.path,
                error: err.message
            });
        }
    }

    return results;
};

// ========== HEX DUMP (DEBUG) ==========

CDROMDriver.prototype.hexDumpSector = function(lba, lines = 16) {
    const offset = (lba * this.sectorSize) + this.dataOffset;
    
    if (offset + 2048 > this.mediaData.byteLength) {
        console.log("Setor fora dos limites");
        return;
    }

    const data = this.mediaData.slice(offset, offset + 2048);
    console.log(`\n📄 HEX DUMP - LBA ${lba}`);
    console.log("Offset   00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F  ASCII");
    console.log("─────────────────────────────────────────────────────────────────");

    for (let i = 0; i < Math.min(lines * 16, data.length); i += 16) {
        let hex = i.toString(16).padStart(4, '0').toUpperCase() + "  ";
        let ascii = "";

        for (let j = 0; j < 16 && i + j < data.length; j++) {
            const byte = data[i + j];
            hex += byte.toString(16).padStart(2, '0').toUpperCase() + " ";
            ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";
        }

        console.log(hex.padEnd(48) + " " + ascii);
    }
};

// ========== PERFORMANCE PROFILING ==========

CDROMDriver.prototype.benchmark = async function(iterations = 100) {
    console.log(`\n⏱️  Benchmarking com ${iterations} setores...`);
    
    const start = performance.now();
    let failures = 0;

    for (let i = 0; i < iterations; i++) {
        const lba = 16 + (i % this.totalSectors);
        const success = await this._readSector(lba);
        if (!success) failures++;
    }

    const elapsed = performance.now() - start;
    const avgTime = elapsed / iterations;
    const throughput = (iterations * 2048) / (elapsed / 1000) / (1024 * 1024);

    console.log(`Tempo total:     ${elapsed.toFixed(2)}ms`);
    console.log(`Média por setor: ${avgTime.toFixed(2)}ms`);
    console.log(`Throughput:      ${throughput.toFixed(2)} MB/s`);
    console.log(`Falhas:          ${failures}`);

    return { elapsed, avgTime, throughput, failures };
};

console.log("[Utils] ✅ File Ops + Debug carregado");