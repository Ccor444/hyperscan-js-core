/**
 * CDROM_v4.0_PARTE4.js - Test Suite Completo
 * 12 testes automatizados de validação
 * Data: 2025-01-03
 */

"use strict";

class CDROMTestSuite {
    constructor(cdromDriver) {
        this.driver = cdromDriver;
        this.results = [];
        this.testCount = 0;
        this.passCount = 0;
        this.failCount = 0;
    }

    /**
     * Teste 1: Detecção de Formato
     */
    testFormatDetection() {
        console.log("🧪 Teste 1: Detecção de Formato");
        
        try {
            const isRaw = this.driver.isRaw;
            const sectorSize = this.driver.sectorSize;
            const cdMode = this.driver.cdMode;

            let pass = false;
            if (isRaw && sectorSize === 2352) {
                pass = true;
            } else if (!isRaw && sectorSize === 2048) {
                pass = true;
            }

            if (pass && cdMode) {
                this._recordTest("Format Detection", true, {
                    format: isRaw ? "RAW" : "ISO",
                    sectorSize: sectorSize,
                    cdMode: cdMode
                });
            } else {
                this._recordTest("Format Detection", false, {
                    expected: "RAW(2352) or ISO(2048)",
                    actual: `${isRaw ? "RAW" : "ISO"}(${sectorSize})`
                });
            }
        } catch (err) {
            this._recordTest("Format Detection", false, { error: err.message });
        }
    }

    /**
     * Teste 2: Volume Descriptor
     */
    testVolumeDescriptor() {
        console.log("🧪 Teste 2: Volume Descriptor");

        try {
            const parser = this.driver.iso9660 || this.driver.udf;
            if (!parser) {
                this._recordTest("Volume Descriptor", false, { error: "No parser loaded" });
                return;
            }

            const info = parser.getInfo();
            if (info.volume && info.volume !== "Unknown") {
                this._recordTest("Volume Descriptor", true, {
                    volume: info.volume,
                    format: info.format,
                    files: info.files
                });
            } else {
                this._recordTest("Volume Descriptor", false, {
                    reason: "Invalid or missing volume ID"
                });
            }
        } catch (err) {
            this._recordTest("Volume Descriptor", false, { error: err.message });
        }
    }

    /**
     * Teste 3: Leitura de Setor
     */
    async testSectorRead() {
        console.log("🧪 Teste 3: Leitura de Setor");

        try {
            const testLBA = 16;
            const result = await this.driver._readSector(testLBA);

            if (result && this.driver.sectorBuffer[0] !== 0) {
                this._recordTest("Sector Read", true, {
                    lba: testLBA,
                    bytesRead: 2048,
                    bufferValid: true
                });
            } else {
                this._recordTest("Sector Read", false, {
                    reason: "Sector buffer empty"
                });
            }
        } catch (err) {
            this._recordTest("Sector Read", false, { error: err.message });
        }
    }

    /**
     * Teste 4: Cache LRU
     */
    async testCacheLRU() {
        console.log("🧪 Teste 4: Cache LRU");

        try {
            const initialHits = this.driver.stats.cacheHits;

            await this.driver._readSector(20);
            await this.driver._readSector(20);

            const hitIncrease = this.driver.stats.cacheHits - initialHits;

            if (hitIncrease >= 1) {
                this._recordTest("Cache LRU", true, {
                    cacheSize: this.driver.sectorCache.size,
                    hitIncrease: hitIncrease,
                    cacheLimit: this.driver.cacheSizeLimit
                });
            } else {
                this._recordTest("Cache LRU", false, {
                    reason: "Cache not functioning"
                });
            }
        } catch (err) {
            this._recordTest("Cache LRU", false, { error: err.message });
        }
    }

    /**
     * Teste 5: Validação de Sync (RAW)
     */
    async testSyncValidation() {
        console.log("🧪 Teste 5: Validação de Sync");

        try {
            if (!this.driver.isRaw) {
                this._recordTest("Sync Validation", true, {
                    reason: "ISO format (sem sync)"
                });
                return;
            }

            const testLBA = 16;
            const offset = testLBA * 2352;

            if (offset + 12 <= this.driver.mediaData.byteLength) {
                const sync = this.driver.mediaData.slice(offset, offset + 12);
                const isValid = this.driver._isValidSync(sync);

                this._recordTest("Sync Validation", isValid, {
                    lba: testLBA,
                    syncValid: isValid,
                    syncBytes: Array.from(sync.slice(0, 4))
                        .map(b => '0x' + b.toString(16))
                        .join(' ')
                });
            } else {
                this._recordTest("Sync Validation", false, {
                    reason: "Cannot read sync at offset"
                });
            }
        } catch (err) {
            this._recordTest("Sync Validation", false, { error: err.message });
        }
    }

    /**
     * Teste 6: Registradores MMIO
     */
    testMMIORegisters() {
        console.log("🧪 Teste 6: Registradores MMIO");

        try {
            this.driver.writeU32(0x0008, 50);
            const readBack = this.driver.readU32(0x0008);

            if (readBack === 50) {
                this._recordTest("MMIO Registers", true, {
                    testRegister: "SECTOR_POS",
                    written: 50,
                    readBack: readBack
                });
            } else {
                this._recordTest("MMIO Registers", false, {
                    reason: `Write/Read mismatch: ${50} != ${readBack}`
                });
            }
        } catch (err) {
            this._recordTest("MMIO Registers", false, { error: err.message });
        }
    }

    /**
     * Teste 7: Enumeração de Arquivos
     */
    testFileEnumeration() {
        console.log("🧪 Teste 7: Enumeração de Arquivos");

        try {
            const files = this.driver.listFiles();

            if (files && files.length > 0) {
                this._recordTest("File Enumeration", true, {
                    fileCount: files.length,
                    firstFile: files[0].name,
                    firstFileSize: files[0].size
                });
            } else {
                this._recordTest("File Enumeration", false, {
                    reason: "No files enumerated"
                });
            }
        } catch (err) {
            this._recordTest("File Enumeration", false, { error: err.message });
        }
    }

    /**
     * Teste 8: Conversão LBA ↔ MSF
     */
    testLBAtoMSF() {
        console.log("🧪 Teste 8: Conversão LBA ↔ MSF");

        try {
            const msf = this.driver.lbaToMSF(0);
            const msfStr = msf.toString();

            if (msfStr && msf.m >= 0 && msf.s >= 0 && msf.f >= 0) {
                this._recordTest("LBA to MSF", true, {
                    lba: 0,
                    msf: msfStr,
                    components: { m: msf.m, s: msf.s, f: msf.f }
                });
            } else {
                this._recordTest("LBA to MSF", false, {
                    reason: "Invalid MSF conversion"
                });
            }
        } catch (err) {
            this._recordTest("LBA to MSF", false, { error: err.message });
        }
    }

    /**
     * Teste 9: Validação de Mídia
     */
    testMediaValidation() {
        console.log("🧪 Teste 9: Validação de Mídia");

        try {
            const validation = this.driver.validateMedia();

            if (validation.valid) {
                this._recordTest("Media Validation", true, {
                    valid: true,
                    format: validation.format,
                    cdMode: validation.cdMode,
                    fileCount: validation.fileCount
                });
            } else {
                this._recordTest("Media Validation", false, {
                    reason: validation.reason
                });
            }
        } catch (err) {
            this._recordTest("Media Validation", false, { error: err.message });
        }
    }

    /**
     * Teste 10: Estatísticas
     */
    testStatistics() {
        console.log("🧪 Teste 10: Estatísticas");

        try {
            const stats = this.driver.stats;

            const hasStats = stats.sectorsRead >= 0 &&
                           stats.bytesRead >= 0 &&
                           stats.cacheHits >= 0 &&
                           stats.cacheMisses >= 0;

            if (hasStats) {
                this._recordTest("Statistics", true, {
                    sectorsRead: stats.sectorsRead,
                    bytesRead: `${(stats.bytesRead / 1024).toFixed(2)} KB`,
                    cacheHits: stats.cacheHits,
                    cacheMisses: stats.cacheMisses,
                    errors: stats.errors
                });
            } else {
                this._recordTest("Statistics", false, {
                    reason: "Statistics not properly tracked"
                });
            }
        } catch (err) {
            this._recordTest("Statistics", false, { error: err.message });
        }
    }

    /**
     * Teste 11: Execução de Comando
     */
    async testCommandExecution() {
        console.log("🧪 Teste 11: Execução de Comando");

        try {
            this.driver.writeU32(0x0004, 0x01);
            
            await new Promise(resolve => setTimeout(resolve, 10));

            const status = this.driver.regs.STATUS;
            const ready = !!(status & this.driver.STATUS_READY);

            if (ready) {
                this._recordTest("Command Execution", true, {
                    command: "GET_STATUS (0x01)",
                    statusRegister: `0x${status.toString(16)}`,
                    ready: ready
                });
            } else {
                this._recordTest("Command Execution", false, {
                    reason: "Drive not ready after command"
                });
            }
        } catch (err) {
            this._recordTest("Command Execution", false, { error: err.message });
        }
    }

    /**
     * Teste 12: Performance
     */
    async testPerformance() {
        console.log("🧪 Teste 12: Performance");

        try {
            const startTime = performance.now();

            for (let i = 0; i < 10; i++) {
                await this.driver._readSector(16 + i);
            }

            const elapsed = performance.now() - startTime;
            const avgTime = elapsed / 10;

            const pass = avgTime < 200;
            const perfLevel = avgTime < 100 ? "Excelente" : "Bom";

            this._recordTest("Performance", pass, {
                sectorsRead: 10,
                totalTime: `${elapsed.toFixed(2)}ms`,
                avgTime: `${avgTime.toFixed(2)}ms/setor`,
                performance: perfLevel
            });
        } catch (err) {
            this._recordTest("Performance", false, { error: err.message });
        }
    }

    // ========== HELPERS ==========

    _recordTest(name, passed, details = {}) {
        this.testCount++;
        if (passed) {
            this.passCount++;
            console.log(`  ✅ ${name}`);
        } else {
            this.failCount++;
            console.log(`  ❌ ${name}`);
        }

        this.results.push({
            test: name,
            passed: passed,
            details: details
        });
    }

    /**
     * Executa todos os testes
     */
    async runAllTests() {
        console.log("\n");
        console.log("╔═══════════════════════════════════════════╗");
        console.log("║   HYPERSCAN CDROM TEST SUITE v4.0        ║");
        console.log("╚═══════════════════════════════════════════╝");

        this.testFormatDetection();
        this.testVolumeDescriptor();
        await this.testSectorRead();
        await this.testCacheLRU();
        await this.testSyncValidation();
        this.testMMIORegisters();
        this.testFileEnumeration();
        this.testLBAtoMSF();
        this.testMediaValidation();
        this.testStatistics();
        await this.testCommandExecution();
        await this.testPerformance();

        this.printSummary();
        return this.results;
    }

    /**
     * Imprime resumo
     */
    printSummary() {
        console.log("\n");
        console.log("╔═══════════════════════════════════════════╗");
        console.log("║          RESUMO DOS TESTES                ║");
        console.log("╚═══════════════════════════════════════════╝");
        console.log(`Total de Testes:  ${this.testCount}`);
        console.log(`Aprovados:        ${this.passCount} ✅`);
        console.log(`Falhados:         ${this.failCount} ❌`);
        console.log(`Taxa de Sucesso:  ${((this.passCount / this.testCount) * 100).toFixed(1)}%`);
        console.log("");

        if (this.failCount === 0) {
            console.log("🎉 TODOS OS TESTES PASSARAM!");
        } else {
            console.log(`⚠️  ${this.failCount} teste(s) falharam`);
            console.log("\nTestes Falhados:");
            this.results
                .filter(r => !r.passed)
                .forEach(r => {
                    console.log(`  ❌ ${r.test}`);
                    console.log(`     ${JSON.stringify(r.details)}`);
                });
        }

        console.log("");
    }

    /**
     * Gera relatório JSON
     */
    getReport() {
        return {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.testCount,
                passed: this.passCount,
                failed: this.failCount,
                successRate: `${((this.passCount / this.testCount) * 100).toFixed(1)}%`
            },
            results: this.results,
            driverInfo: this.driver.getInfo(),
            driverStats: this.driver.getDetailedStats()
        };
    }

    /**
     * Exporta relatório como JSON
     */
    downloadReport() {
        const report = this.getReport();
        const json = JSON.stringify(report, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cdrom-report-${new Date().toISOString()}.json`;
        a.click();
    }
}

// ========== EXPORTAÇÃO ==========
window.CDROMTestSuite = CDROMTestSuite;
console.log("[TestSuite] ✅ Test Suite v4.0 carregado");

/**
 * COMO USAR:
 * 
 * 1. Carregar mídia
 * await cdrom.loadMedia(file);
 * 
 * 2. Criar tester
 * const tester = new CDROMTestSuite(cdrom);
 * 
 * 3. Executar testes
 * await tester.runAllTests();
 * 
 * 4. Obter relatório
 * const report = tester.getReport();
 * tester.downloadReport();
 */