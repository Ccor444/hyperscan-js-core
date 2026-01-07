/**
 * CDROM_v4.0_PARTE1.js - UDF + ISO9660 Parser
 * Parsers para detecção e leitura de mídia
 * Data: 2025-01-03
 */

"use strict";

if (typeof UDFParser === 'undefined') {

    // ========== UDF PARSER ==========
    class UDFParser {
        constructor(data) {
            this.data = data;
            this.anchors = [];
            this.mainVD = null;
            this.partitions = new Map();
            this.fileEntries = new Map();
            this.format = "UNKNOWN";

            this._findAnchors();
            this._parse();
        }

        /**
         * ✅ Procurar Anchor Volume Descriptors (NSR02/NSR03)
         */
        _findAnchors() {
            console.log("[UDF] Procurando anchors...");
            const possibleOffsets = [256, 512, 0];
            const sectorSize = 2048;

            for (let anchor of possibleOffsets) {
                try {
                    const offset = anchor * sectorSize;
                    if (offset >= this.data.byteLength) continue;

                    const view = new DataView(this.data);
                    const tag = view.getUint16(offset, true);

                    if (tag === 2) {
                        console.log(`[UDF] ✅ Anchor encontrado em setor ${anchor}`);
                        this.anchors.push({
                            sector: anchor,
                            offset: offset,
                            tag: tag
                        });
                    }
                } catch (e) {
                    // Skip
                }
            }

            if (this.anchors.length === 0) {
                console.log("[UDF] ℹ️ Nenhum anchor encontrado");
            }
        }

        /**
         * Parse principal
         */
        _parse() {
            if (this.anchors.length === 0) {
                this.format = "ISO9660";
                return;
            }

            try {
                this.format = "UDF";
                const anchor = this.anchors[0];
                this._parseVolumeDescriptors(anchor);
            } catch (err) {
                console.error("[UDF] Erro ao parsear:", err);
                this.format = "ISO9660";
            }
        }

        /**
         * Parse Volume Descriptors
         */
        _parseVolumeDescriptors(anchor) {
            const view = new DataView(this.data);
            const extAreaOffset = view.getUint32(anchor.offset + 16, true);
            const extAreaSize = view.getUint32(anchor.offset + 20, true);

            console.log(`[UDF] Extended Area em LBA ${extAreaOffset}, ${extAreaSize} setores`);

            for (let i = 0; i < extAreaSize; i++) {
                const offset = (extAreaOffset + i) * 2048;
                if (offset + 32 > this.data.byteLength) break;

                const sig = String.fromCharCode(
                    view.getUint8(offset + 1),
                    view.getUint8(offset + 2),
                    view.getUint8(offset + 3),
                    view.getUint8(offset + 4),
                    view.getUint8(offset + 5)
                );

                if (sig === "NSR02" || sig === "NSR03") {
                    console.log(`[UDF] ✅ ${sig} encontrado - UDF válida!`);
                    return;
                }
            }

            throw new Error("NSR descriptor not found");
        }

        findFile(path) {
            return this.fileEntries.get(path) || null;
        }

        listFiles() {
            const files = [];
            this.fileEntries.forEach((entry) => {
                if (!entry.isDirectory) files.push(entry);
            });
            return files;
        }

        getInfo() {
            return {
                format: this.format,
                anchors: this.anchors.length,
                partitions: this.partitions.size,
                files: this.fileEntries.size,
                volume: "HyperScan",
                publisher: "Mattel"
            };
        }
    }

    // ========== ISO9660 PARSER ==========
    class ISO9660Parser {
        constructor(data) {
            this.data = data;
            this.isRaw = null;
            this.sectorSize = null;
            this.dataOffset = null;
            this.cdMode = null;
            this.volumeDescriptor = null;
            this.fileEntries = new Map();
            this.totalSectors = 0;

            this._detectFormat();
            this._parse();
        }

        /**
         * ✅ Detecta RAW vs ISO + CD Mode
         */
        _detectFormat() {
            const len = this.data.byteLength;

            if (len % 2352 === 0) {
                this.isRaw = true;
                this.sectorSize = 2352;
                this.dataOffset = 16;
                this._detectCDMode();
                console.log(`[ISO9660] 📀 RAW ${this.cdMode} detectado`);
            } else if (len % 2048 === 0) {
                this.isRaw = false;
                this.sectorSize = 2048;
                this.dataOffset = 0;
                this.cdMode = "Mode1";
                console.log("[ISO9660] 📀 ISO detectado");
            } else {
                throw new Error(`Tamanho inválido: ${len}`);
            }

            this.totalSectors = Math.floor(len / this.sectorSize);
        }

        /**
         * ✅ Detecta CD Mode (1, 2/Form 1, 2/Form 2)
         */
        _detectCDMode() {
            try {
                const view = new DataView(this.data);
                const modeOffset = 15;
                const mode = view.getUint8(modeOffset);

                if (mode === 0x01) {
                    this.cdMode = "Mode1";
                } else if (mode === 0x02) {
                    const subhdrOffset = 16;
                    const subhdr = view.getUint8(subhdrOffset);
                    this.cdMode = (subhdr & 0x20) ? "Mode2/Form2" : "Mode2/Form1";
                }
            } catch (e) {
                this.cdMode = "Mode1";
            }
        }

        /**
         * Parse ISO9660
         */
        _parse() {
            try {
                const vdOffset = (16 * this.sectorSize) + this.dataOffset;
                console.log(`[ISO9660] VD em offset 0x${vdOffset.toString(16)}`);

                if (vdOffset + 256 > this.data.byteLength) {
                    throw new Error("VD fora dos limites");
                }

                let view;
                if (this.data instanceof ArrayBuffer) {
                    view = new DataView(this.data);
                } else if (this.data instanceof Uint8Array) {
                    view = new DataView(this.data.buffer, this.data.byteOffset);
                } else {
                    throw new Error("Tipo inválido");
                }

                const sig = String.fromCharCode(
                    view.getUint8(vdOffset + 1),
                    view.getUint8(vdOffset + 2),
                    view.getUint8(vdOffset + 3),
                    view.getUint8(vdOffset + 4),
                    view.getUint8(vdOffset + 5)
                );

                if (sig !== "CD001") {
                    throw new Error(`Assinatura inválida: "${sig}"`);
                }

                console.log(`[ISO9660] ✅ "CD001" validada`);
                this._parsePrimaryVD(view, vdOffset);

            } catch (err) {
                console.error("[ISO9660] ❌ Erro:", err.message);
                throw err;
            }
        }

        /**
         * Parse Primary Volume Descriptor
         */
        _parsePrimaryVD(view, offset) {
            this.volumeDescriptor = {
                volumeID: this._readString(view, offset + 40, 32),
                volumeSetID: this._readString(view, offset + 190, 128),
                publisherID: this._readString(view, offset + 318, 128)
            };

            console.log("[ISO9660] Volume:", this.volumeDescriptor.volumeID);
            this._parseRootDirectory(view, offset + 156);
        }

        /**
         * Parse directory descriptor
         */
        _parseRootDirectory(view, offset) {
            const extentLBA = this._readU32LE(view, offset + 2);
            const extentSize = this._readU32LE(view, offset + 10);

            console.log(`[ISO9660] Root em LBA ${extentLBA}`);

            const dirOffset = (extentLBA * this.sectorSize) + this.dataOffset;
            this._parseDirectory(view, dirOffset, extentSize);
        }

        /**
         * ✅ Parse directory com múltiplos setores
         */
        _parseDirectory(view, offset, size, path = "/") {
            let pos = 0;
            let sectorsProcessed = 0;

            while (pos < size && sectorsProcessed < 256) {
                if (offset + pos >= this.data.byteLength) break;

                const recordLength = view.getUint8(offset + pos);

                if (recordLength === 0) {
                    pos = Math.ceil(pos / 2048) * 2048;
                    sectorsProcessed++;
                    continue;
                }

                const flags = view.getUint8(offset + pos + 25);
                const isDir = (flags & 0x02) !== 0;
                const extentLBA = this._readU32LE(view, offset + pos + 2);
                const extentSize = this._readU32LE(view, offset + pos + 10);
                const nameLength = view.getUint8(offset + pos + 32);

                let filename = "";
                for (let i = 0; i < nameLength; i++) {
                    const char = view.getUint8(offset + pos + 33 + i);
                    if (char !== 0 && char >= 32) {
                        filename += String.fromCharCode(char);
                    }
                }

                if (filename && filename !== "\x00") {
                    const fullPath = path + filename;
                    const entry = {
                        name: filename,
                        path: fullPath,
                        isDirectory: isDir,
                        lba: extentLBA,
                        size: extentSize
                    };

                    this.fileEntries.set(fullPath, entry);

                    if (!isDir && extentSize > 0) {
                        console.log(`[ISO9660]   📄 ${fullPath} (${extentSize} bytes)`);
                    }
                }

                pos += recordLength;
            }
        }

        // ========== HELPERS ==========

        _readU32LE(view, offset) {
            return view.getUint32(offset, true) >>> 0;
        }

        _readString(view, offset, maxLen) {
            let str = "";
            for (let i = 0; i < maxLen; i++) {
                const char = view.getUint8(offset + i);
                if (char >= 32 && char < 127) {
                    str += String.fromCharCode(char);
                }
            }
            return str.trim();
        }

        findFile(path) {
            return this.fileEntries.get(path) || null;
        }

        listFiles() {
            const files = [];
            this.fileEntries.forEach((entry) => {
                if (!entry.isDirectory) files.push(entry);
            });
            return files;
        }

        getInfo() {
            return {
                format: this.isRaw ? "RAW" : "ISO",
                cdMode: this.cdMode,
                volume: this.volumeDescriptor?.volumeID || "Unknown",
                files: this.fileEntries.size,
                totalSectors: this.totalSectors
            };
        }
    }

    // ========== EXPORTAÇÃO ==========
    window.UDFParser = UDFParser;
    window.ISO9660Parser = ISO9660Parser;

    console.log("[Parser] ✅ UDF + ISO9660 carregado");

}