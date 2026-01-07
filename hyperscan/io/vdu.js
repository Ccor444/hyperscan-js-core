/**
 * VDU.js - Video Display Unit (CORRIGIDO v2.4.1)
 * HyperScan Emulator v2.0
 * 
 * ✅ v2.4.1 CORRIGIDO: IRQ 4 (V-Blank) - SPG290 real
 * ✅ v2.4.1 CORRIGIDO: Validação de framebuffer DRAM
 * ✅ v2.4.1 CORRIGIDO: Debug aprimorado para tela vermelha
 * ✅ v2.4 NOVO: Registradores SPCE3200 completos
 * ✅ v2.4 NOVO: Triple Buffering (SA1, SA2, SA3)
 * ✅ v2.4 NOVO: Sistema de Step & Ciclos
 * ✅ v2.4 NOVO: Validação de bit 24 (P_TFT_MODE_CTRL)
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200, Sunplus S+core, HyperScan
 * 
 * Autor: Ccor444 (v2.4.1)
 * Data: 2025-01-06
 */

"use strict";

if (typeof VideoDisplayUnit === 'undefined') {
    /**
     * Video Display Unit (SPCE3200 Completo)
     * @extends MemoryRegion
     */
    class VideoDisplayUnit extends MemoryRegion {
        constructor(canvasId, options = {}) {
            super();

            // ========== VALIDAÇÃO DE CANVAS ==========
            this.canvasId = canvasId;
            this.canvas = document.getElementById(canvasId);
            
            if (!this.canvas) {
                throw new Error(`Canvas #${canvasId} não existe`);
            }

            this.ctx = this.canvas.getContext('2d', { 
                alpha: false,
                willReadFrequently: true 
            });

            if (!this.ctx) {
                throw new Error("Canvas 2D context não disponível");
            }

            // ========== RESOLUÇÃO ==========
            this.width = options.width || 320;
            this.height = options.height || 224;
            this.canvas.width = this.width;
            this.canvas.height = this.height;

            // ========== MODO DE CORES ==========
            this.colorModeSource = options.colorMode || 'RGB565';
            this.colorModeTarget = 'RGBA8888';

            // ========== REGISTRADORES MMIO - MAPA COMPLETO SPCE3200 ==========
            // Base: 0x88040000 (Controle)
            // Base: 0x88070000 (Buffers)
            
            this.regs = {
                // 0x88040000 - P_TFT_MODE_CTRL
                P_TFT_MODE_CTRL: options.displayEnable !== false ? 0x01000000 : 0x00000000,
                
                // 0x88040004 - P_TFT_PARAM1
                P_TFT_PARAM1: 0x00000000,
                
                // 0x88040008 - P_TFT_HW_SIZE (Altura e Largura)
                P_TFT_HW_SIZE: ((this.height & 0x1FF) << 16) | (this.width & 0x1FF),
                
                // 0x88040018 - P_TFT_HV_SIZE (Sync)
                P_TFT_HV_SIZE: 0x00000000,
                
                // 0x88040050 - P_TFT_INT_STATUS (Interrupções V-Blank)
                P_TFT_INT_STATUS: 0x00000000,
                
                // 0x88070000 - P_LCD_BUFFER_SA1
                P_LCD_BUFFER_SA1: options.fbAddr || 0xA0000000,
                
                // 0x88070004 - P_LCD_BUFFER_SA2
                P_LCD_BUFFER_SA2: (options.fbAddr || 0xA0000000) + (this.width * this.height * 2),
                
                // 0x88070008 - P_LCD_BUFFER_SA3
                P_LCD_BUFFER_SA3: (options.fbAddr || 0xA0000000) + (this.width * this.height * 2 * 2),
                
                // 0x8807000C - P_LCD_BUFFER_SEL (Qual buffer usar: 0, 1, 2)
                P_LCD_BUFFER_SEL: 0x00000000
            };

            // ========== IMAGE DATA ==========
            this.imageData = this.ctx.createImageData(this.width, this.height);
            this.imageDataU32 = new Uint32Array(this.imageData.data.buffer);

            // ========== SISTEMA DE CICLOS ==========
            // HyperScan roda a ~564.480 ciclos por frame (60 FPS)
            this.cycleCounter = 0;
            this.cyclesPerFrame = 564480 / 60;  // ~9408 ciclos por frame
            this.vblankPending = false;

            // ========== ESTATÍSTICAS ==========
            this.stats = {
                framesRendered: 0,
                framesAttempted: 0,
                framebufferErrors: 0,
                boundsErrors: 0,
                lastRenderTime: 0,
                avgRenderTime: 0,
                vblanks: 0,
                conversionErrors: 0,
                totalCycles: 0
            };

            // ========== PERIFÉRICOS CONECTADOS ==========
            this.intC = null;
            this.miu = null;

            // ========== DEBUG ==========
            this.debugEnabled = options.debug || false;
            this.logEveryFrame = false;

            // ========== CALLBACKS ==========
            this.onVBlank = null;
            this.onStatusChange = null;

            console.log(`[VDU] ✓ Video Display Unit v2.4.1 inicializada`);
            console.log(`[VDU]   Resolução: ${this.width}x${this.height}`);
            console.log(`[VDU]   Ciclos/Frame: ${this.cyclesPerFrame.toFixed(0)}`);
            console.log(`[VDU]   IRQ VBlank: 4 (SPG290)`);
        }

        // ========== CONEXÃO DE PERIFÉRICOS ==========

        connectInterruptController(intC) {
            this.intC = intC;
            if (this.debugEnabled) {
                console.log("[VDU] Interrupt Controller conectado");
            }
        }

        connectMIU(miu) {
            this.miu = miu;
            if (this.debugEnabled) {
                console.log("[VDU] MIU conectada ✓");
            }
        }

        // ========== INTERFACE MEMORYREGION ==========

        readU8(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 3) * 8;
            return (word >>> shift) & 0xFF;
        }

        readU16(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 2) * 8;
            return (word >>> shift) & 0xFFFF;
        }

        /**
         * ✅ CORRIGIDO v2.4: Leitura de registradores SPCE3200
         */
        readU32(address) {
            const offset = address & 0xFFFF;
            const alignedOffset = offset & ~3;

            // Mapeamento de endereços físicos para registradores
            let regName = null;
            let value = 0;

            if (offset >= 0x0000 && offset <= 0x0050) {
                // Range 0x88040000
                switch (alignedOffset) {
                    case 0x0000:  // P_TFT_MODE_CTRL
                        regName = "P_TFT_MODE_CTRL";
                        value = this.regs.P_TFT_MODE_CTRL;
                        break;
                    case 0x0004:  // P_TFT_PARAM1
                        regName = "P_TFT_PARAM1";
                        value = this.regs.P_TFT_PARAM1;
                        break;
                    case 0x0008:  // P_TFT_HW_SIZE
                        regName = "P_TFT_HW_SIZE";
                        value = this.regs.P_TFT_HW_SIZE;
                        break;
                    case 0x0018:  // P_TFT_HV_SIZE
                        regName = "P_TFT_HV_SIZE";
                        value = this.regs.P_TFT_HV_SIZE;
                        break;
                    case 0x0050:  // P_TFT_INT_STATUS
                        regName = "P_TFT_INT_STATUS";
                        value = this.regs.P_TFT_INT_STATUS;
                        break;
                }
            } else if (offset >= 0x7000 && offset <= 0x700C) {
                // Range 0x88070000
                const bufOffset = offset - 0x7000;
                switch (bufOffset) {
                    case 0x0000:  // P_LCD_BUFFER_SA1
                        regName = "P_LCD_BUFFER_SA1";
                        value = this.regs.P_LCD_BUFFER_SA1;
                        break;
                    case 0x0004:  // P_LCD_BUFFER_SA2
                        regName = "P_LCD_BUFFER_SA2";
                        value = this.regs.P_LCD_BUFFER_SA2;
                        break;
                    case 0x0008:  // P_LCD_BUFFER_SA3
                        regName = "P_LCD_BUFFER_SA3";
                        value = this.regs.P_LCD_BUFFER_SA3;
                        break;
                    case 0x000C:  // P_LCD_BUFFER_SEL
                        regName = "P_LCD_BUFFER_SEL";
                        value = this.regs.P_LCD_BUFFER_SEL;
                        break;
                }
            }

            if (this.debugEnabled && regName) {
                console.log(`[VDU] readU32(${regName}) = 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
            }

            return value >>> 0;
        }

        writeU8(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 3) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
            this.writeU32(addr, word);
        }

        writeU16(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 2) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFFFF << shift)) | ((value & 0xFFFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * ✅ CORRIGIDO v2.4: Escrita em registradores SPCE3200 com validação
         */
        writeU32(offset, value) {
            value = value >>> 0;
            offset = offset & 0xFFFF;
            const alignedOffset = offset & ~3;

            let regName = null;

            if (offset >= 0x0000 && offset <= 0x0050) {
                // Range 0x88040000
                switch (alignedOffset) {
                    case 0x0000:  // P_TFT_MODE_CTRL
                        regName = "P_TFT_MODE_CTRL";
                        const wasEnabled = (this.regs.P_TFT_MODE_CTRL & 0x01000000) !== 0;
                        const isEnabled = (value & 0x01000000) !== 0;
                        this.regs.P_TFT_MODE_CTRL = value;
                        
                        if (!wasEnabled && isEnabled) {
                            if (this.debugEnabled) console.log("[VDU] ✓ Display ativado (bit 24 = 1)");
                        } else if (wasEnabled && !isEnabled) {
                            if (this.debugEnabled) console.log("[VDU] ✗ Display desativado (bit 24 = 0)");
                        }
                        break;

                    case 0x0004:  // P_TFT_PARAM1
                        regName = "P_TFT_PARAM1";
                        this.regs.P_TFT_PARAM1 = value;
                        break;

                    case 0x0008:  // P_TFT_HW_SIZE (Altura e Largura)
                        regName = "P_TFT_HW_SIZE";
                        const newHeight = (value >>> 16) & 0x1FF;
                        const newWidth = value & 0x1FF;
                        if (newWidth > 0 && newHeight > 0) {
                            this.regs.P_TFT_HW_SIZE = value;
                            if (newWidth !== this.width || newHeight !== this.height) {
                                if (this.debugEnabled) {
                                    console.log(`[VDU] Resolução alterada: ${newWidth}x${newHeight}`);
                                }
                                this.setResolution(newWidth, newHeight);
                            }
                        }
                        break;

                    case 0x0018:  // P_TFT_HV_SIZE
                        regName = "P_TFT_HV_SIZE";
                        this.regs.P_TFT_HV_SIZE = value;
                        break;

                    case 0x0050:  // P_TFT_INT_STATUS (Read-only em hardware real)
                        regName = "P_TFT_INT_STATUS";
                        if (this.debugEnabled) {
                            console.log(`[VDU] writeU32(P_TFT_INT_STATUS) = 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                        }
                        break;
                }
            } else if (offset >= 0x7000 && offset <= 0x700C) {
                // Range 0x88070000
                const bufOffset = offset - 0x7000;
                switch (bufOffset) {
                    case 0x0000:  // P_LCD_BUFFER_SA1
                        regName = "P_LCD_BUFFER_SA1";
                        this.regs.P_LCD_BUFFER_SA1 = value;
                        if (this.debugEnabled) {
                            console.log(`[VDU] Buffer SA1 = 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                        }
                        break;

                    case 0x0004:  // P_LCD_BUFFER_SA2
                        regName = "P_LCD_BUFFER_SA2";
                        this.regs.P_LCD_BUFFER_SA2 = value;
                        if (this.debugEnabled) {
                            console.log(`[VDU] Buffer SA2 = 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                        }
                        break;

                    case 0x0008:  // P_LCD_BUFFER_SA3
                        regName = "P_LCD_BUFFER_SA3";
                        this.regs.P_LCD_BUFFER_SA3 = value;
                        if (this.debugEnabled) {
                            console.log(`[VDU] Buffer SA3 = 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                        }
                        break;

                    case 0x000C:  // P_LCD_BUFFER_SEL (Seleção: 0, 1 ou 2)
                        regName = "P_LCD_BUFFER_SEL";
                        const bufSel = value & 0x03;
                        this.regs.P_LCD_BUFFER_SEL = bufSel;
                        if (this.debugEnabled) {
                            console.log(`[VDU] Buffer Selecionado: ${bufSel}`);
                        }
                        break;
                }
            }

            if (this.debugEnabled && regName) {
                console.log(`[VDU] writeU32(${regName}) ✓`);
            }
        }

        // ========== ADAPTER PARA MIU ==========

        _getRegionFromMIU(miu, segment) {
            if (!miu) return null;

            if (typeof miu.getRegion === 'function') {
                return miu.getRegion(segment);
            }

            if (miu.segments && Array.isArray(miu.segments)) {
                return miu.segments[segment];
            }

            if (miu.memoryMap && typeof miu.memoryMap === 'object') {
                const addr = (segment << 24);
                for (const [key, region] of Object.entries(miu.memoryMap)) {
                    if (region && region.start <= addr && addr < region.start + region.size) {
                        return region;
                    }
                }
            }

            const segmentName = {
                0x80: 'flash',
                0x90: 'flash',
                0x9E: 'flash',
                0xA0: 'dram',
                0xA1: 'dram',
                0xA2: 'dram'
            }[segment];

            if (segmentName && miu[segmentName]) {
                return miu[segmentName];
            }

            if (typeof miu.getRegionAt === 'function') {
                return miu.getRegionAt(segment << 24);
            }

            return null;
        }

        /**
         * ✅ NOVO v2.4: Obter endereço de buffer ativo (Triple Buffering)
         */
        _getActiveBufferAddress() {
            const selIndex = this.regs.P_LCD_BUFFER_SEL & 0x03;
            
            switch (selIndex) {
                case 0:
                    return this.regs.P_LCD_BUFFER_SA1;
                case 1:
                    return this.regs.P_LCD_BUFFER_SA2;
                case 2:
                    return this.regs.P_LCD_BUFFER_SA3;
                default:
                    return this.regs.P_LCD_BUFFER_SA1;
            }
        }

        // ========== RENDERIZAÇÃO ==========

        /**
         * ✅ CORRIGIDO v2.4.1: Renderização com validação de bit 24 e debug aprimorado
         */
        render(miu = null) {
            const startTime = performance.now();
            this.stats.framesAttempted++;

            // ✅ VALIDAÇÃO: Bit 24 de P_TFT_MODE_CTRL deve estar setado
            if (!(this.regs.P_TFT_MODE_CTRL & 0x01000000)) {
                if (this.debugEnabled) {
                    console.log("[VDU] Display desativado (bit 24), pulando render");
                }
                return false;
            }

            miu = miu || this.miu;
            if (!miu) {
                console.warn("[VDU] ⚠️ MIU não disponível no frame", this.stats.framesAttempted);
                this.stats.framebufferErrors++;
                return false;
            }

            try {
                // ✅ NOVO: Usar buffer ativo (Triple Buffering)
                const fbAddr = this._getActiveBufferAddress();

                if (this.debugEnabled) {
                    console.log(`[VDU] Tentando renderizar framebuffer em 0x${fbAddr.toString(16).padStart(8, '0').toUpperCase()}`);
                }

                if (!this._validateFBAddress(fbAddr, miu)) {
                    this.stats.framebufferErrors++;
                    return false;
                }

                const success = this._copyFramebuffer(fbAddr, miu);
                if (!success) {
                    this.stats.framebufferErrors++;
                    return false;
                }

                try {
                    if (this.ctx && this.imageData) {
                        this.ctx.putImageData(this.imageData, 0, 0);
                    }
                } catch (ctxErr) {
                    console.warn("[VDU] ⚠️ Erro ao atualizar canvas:", ctxErr.message);
                    return false;
                }

                this.stats.framesRendered++;
                this.triggerVBlank();

                const endTime = performance.now();
                this.stats.lastRenderTime = endTime - startTime;
                
                if (this.logEveryFrame) {
                    console.log(`[VDU] Frame ${this.stats.framesRendered} em ${this.stats.lastRenderTime.toFixed(2)}ms`);
                }

                return true;

            } catch (err) {
                console.error("[VDU] ❌ Erro ao renderizar:", err.message);
                this.stats.framebufferErrors++;
                return false;
            }
        }

        /**
         * ✅ CORRIGIDO v2.4.1: Validação com endereço customizável e debug
         */
        _validateFBAddress(fbAddr, miu) {
            if (!miu) {
                if (this.debugEnabled) {
                    console.warn("[VDU] ⚠️ MIU não fornecida");
                }
                return false;
            }

            const segment = (fbAddr >>> 24) & 0xFF;
            const offset = fbAddr & 0xFFFFFF;
            const region = this._getRegionFromMIU(miu, segment);

            if (!region) {
                console.warn(`[VDU] ⚠️ Segmento 0x${segment.toString(16).padStart(2, '0').toUpperCase()} não encontrado em MIU`);
                return false;
            }

            if (!region.buffer) {
                console.warn(`[VDU] ⚠️ Segmento 0x${segment.toString(16).padStart(2, '0').toUpperCase()} sem buffer acessível`);
                return false;
            }

            const pixelCount = this.width * this.height;
            const bytesNeeded = pixelCount * 2;  // RGB565 = 2 bytes/pixel
            const regionSize = region.size || (region.buffer ? region.buffer.byteLength : 0);

            if (regionSize === 0) {
                console.warn("[VDU] ⚠️ Região sem tamanho válido");
                return false;
            }

            if (offset + bytesNeeded > regionSize) {
                console.warn(
                    `[VDU] ⚠️ Framebuffer fora de limites: ` +
                    `offset=0x${offset.toString(16).padStart(6, '0').toUpperCase()} + ${bytesNeeded} bytes > region_size=${regionSize}`
                );
                this.stats.boundsErrors++;
                return false;
            }

            if (this.debugEnabled) {
                console.log(`[VDU] ✓ Validação OK: segmento 0x${segment.toString(16).padStart(2, '0').toUpperCase()}, offset 0x${offset.toString(16).padStart(6, '0').toUpperCase()}`);
            }

            return true;
        }

        /**
         * ✅ CORRIGIDO v2.4.1: Cópia com endereço customizável e melhor tratamento de erros
         */
        _copyFramebuffer(fbAddr, miu) {
            try {
                if (!miu) {
                    console.warn("[VDU] ⚠️ MIU não disponível para copy");
                    return false;
                }

                const segment = (fbAddr >>> 24) & 0xFF;
                const offset = fbAddr & 0xFFFFFF;
                const region = this._getRegionFromMIU(miu, segment);

                if (!region || !region.buffer) {
                    console.warn("[VDU] ⚠️ Região sem buffer acessível");
                    return false;
                }

                const pixelCount = this.width * this.height;

                try {
                    switch (this.colorModeSource) {
                        case 'RGBA8888':
                            try {
                                const ramViewRGBA = new Uint32Array(region.buffer, offset, pixelCount);
                                this.imageDataU32.set(ramViewRGBA);
                                if (this.debugEnabled) {
                                    console.log(`[VDU] ✓ Cópia RGBA8888: ${pixelCount} pixels`);
                                }
                            } catch (e) {
                                console.warn("[VDU] ⚠️ Erro ao copiar RGBA8888:", e.message);
                                for (let i = 0; i < pixelCount; i++) {
                                    this.imageDataU32[i] = 0xFF000000;
                                }
                            }
                            break;

                        case 'RGB565':
                            try {
                                const ramView565 = new Uint16Array(region.buffer, offset, pixelCount);
                                for (let i = 0; i < pixelCount; i++) {
                                    const rgb565 = ramView565[i];
                                    this.imageDataU32[i] = this._rgb565ToRGBA8888(rgb565);
                                }
                                if (this.debugEnabled) {
                                    console.log(`[VDU] ✓ Conversão RGB565: ${pixelCount} pixels`);
                                }
                            } catch (e) {
                                console.warn("[VDU] ⚠️ Erro ao converter RGB565:", e.message);
                                for (let i = 0; i < pixelCount; i++) {
                                    this.imageDataU32[i] = 0xFF000000;
                                }
                            }
                            break;

                        case 'RGB555':
                            try {
                                const ramView555 = new Uint16Array(region.buffer, offset, pixelCount);
                                for (let i = 0; i < pixelCount; i++) {
                                    const rgb555 = ramView555[i];
                                    this.imageDataU32[i] = this._rgb555ToRGBA8888(rgb555);
                                }
                                if (this.debugEnabled) {
                                    console.log(`[VDU] ✓ Conversão RGB555: ${pixelCount} pixels`);
                                }
                            } catch (e) {
                                console.warn("[VDU] ⚠️ Erro ao converter RGB555:", e.message);
                                for (let i = 0; i < pixelCount; i++) {
                                    this.imageDataU32[i] = 0xFF000000;
                                }
                            }
                            break;

                        case 'ARGB8888':
                            try {
                                const ramViewARGB = new Uint32Array(region.buffer, offset, pixelCount);
                                for (let i = 0; i < pixelCount; i++) {
                                    const argb = ramViewARGB[i];
                                    const a = (argb >>> 24) & 0xFF;
                                    const r = (argb >>> 16) & 0xFF;
                                    const g = (argb >>> 8) & 0xFF;
                                    const b = argb & 0xFF;
                                    this.imageDataU32[i] = (r << 24) | (g << 16) | (b << 8) | a;
                                }
                                if (this.debugEnabled) {
                                    console.log(`[VDU] ✓ Conversão ARGB8888: ${pixelCount} pixels`);
                                }
                            } catch (e) {
                                console.warn("[VDU] ⚠️ Erro ao converter ARGB8888:", e.message);
                                for (let i = 0; i < pixelCount; i++) {
                                    this.imageDataU32[i] = 0xFF000000;
                                }
                            }
                            break;

                        default:
                            console.warn(`[VDU] ⚠️ Modo de cores desconhecido: ${this.colorModeSource}`);
                            this.stats.conversionErrors++;
                            for (let i = 0; i < pixelCount; i++) {
                                this.imageDataU32[i] = 0xFF000000;
                            }
                            return false;
                    }
                } catch (conversionErr) {
                    console.error("[VDU] ❌ Erro na conversão de cores:", conversionErr);
                    this.stats.conversionErrors++;
                    for (let i = 0; i < pixelCount; i++) {
                        this.imageDataU32[i] = 0xFF000000;
                    }
                }

                return true;

            } catch (err) {
                console.error("[VDU] ❌ Erro ao copiar framebuffer:", err);
                this.stats.framebufferErrors++;
                return false;
            }
        }

        /**
         * Converte RGB565 para RGBA8888
         */
        _rgb565ToRGBA8888(rgb565) {
            const r = ((rgb565 >>> 11) & 0x1F) * 255 / 31;
            const g = ((rgb565 >>> 5) & 0x3F) * 255 / 63;
            const b = (rgb565 & 0x1F) * 255 / 31;
            const a = 0xFF;

            return (Math.round(r) << 24) | (Math.round(g) << 16) | (Math.round(b) << 8) | a;
        }

        /**
         * Converte RGB555 para RGBA8888
         */
        _rgb555ToRGBA8888(rgb555) {
            const r = ((rgb555 >>> 10) & 0x1F) * 255 / 31;
            const g = ((rgb555 >>> 5) & 0x1F) * 255 / 31;
            const b = (rgb555 & 0x1F) * 255 / 31;
            const a = 0xFF;

            return (Math.round(r) << 24) | (Math.round(g) << 16) | (Math.round(b) << 8) | a;
        }

        // ========== SISTEMA DE CICLOS & V-BLANK ==========

        /**
         * ✅ NOVO v2.4: Sistema de Step (executado pela CPU)
         * A CPU chama isso a cada instrução: vdu.step(ciclosConsumidos)
         */
        step(cycles) {
            this.cycleCounter += cycles;
            this.stats.totalCycles += cycles;

            // ✅ NOVO: Checar se completou um frame (V-Blank)
            if (this.cycleCounter >= this.cyclesPerFrame) {
                this.cycleCounter -= this.cyclesPerFrame;
                this.vblankPending = true;
            }
        }

        /**
         * ✅ CORRIGIDO v2.4.1: Processa V-Blank (chamado pelo loop principal)
         * IRQ 4 é disparada aqui (SPG290 real)
         * Isso desacopla o render do step(), evitando travamentos
         */
        processVBlank() {
            if (!this.vblankPending) return;

            this.vblankPending = false;
            const success = this.render(this.miu);

            if (success) {
                // ✅ CORRIGIDO v2.4.1: DISPARA IRQ 4 (V-Blank Interrupt - SPG290 REAL)
                if (this.intC && typeof this.intC.trigger === 'function') {
                    this.intC.trigger(4);  // ✅ IRQ 4, não 54
                    if (this.debugEnabled) {
                        console.log("[VDU] ✓ IRQ 4 disparada (V-Blank) - SPG290");
                    }
                }
            }
        }

        triggerVBlank() {
            this.regs.P_TFT_INT_STATUS |= 0x01;
            this.stats.vblanks++;

            if (this.onVBlank) {
                this.onVBlank();
            }

            if (this.onStatusChange) {
                this.onStatusChange('vblank');
            }

            setTimeout(() => {
                this.regs.P_TFT_INT_STATUS &= ~0x01;
            }, 1000 / 60);
        }

        // ========== DEBUG & INFO ==========

        isValidOffset(offset) {
            return (offset >= 0x0000 && offset <= 0x0050) || 
                   (offset >= 0x7000 && offset <= 0x700C);
        }

        getInfo() {
            return {
                type: this.constructor.name,
                width: this.width,
                height: this.height,
                activeBufferIndex: this.regs.P_LCD_BUFFER_SEL & 0x03,
                activeBufferAddr: `0x${this._getActiveBufferAddress().toString(16).padStart(8, '0').toUpperCase()}`,
                displayEnabled: (this.regs.P_TFT_MODE_CTRL & 0x01000000) ? true : false,
                inVBlank: (this.regs.P_TFT_INT_STATUS & 0x01) ? true : false,
                colorModeSource: this.colorModeSource,
                colorModeTarget: this.colorModeTarget,
                cycleCounter: this.cycleCounter,
                cyclesPerFrame: this.cyclesPerFrame.toFixed(0),
                stats: { ...this.stats }
            };
        }

        getStatus() {
            const lines = [];
            lines.push("╔═══════════════════════════════════════════════════╗");
            lines.push("║   VIDEO DISPLAY UNIT (VDU) v2.4.1 - SPCE3200     ║");
            lines.push("╚═══════════════════════════════════════════════════╝");
            lines.push("");
            lines.push(`Resolution:        ${this.width}x${this.height}`);
            lines.push(`Active Buffer:     SA${(this.regs.P_LCD_BUFFER_SEL & 0x03) + 1}`);
            lines.push(`Buffer Address:    0x${this._getActiveBufferAddress().toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`Display:           ${(this.regs.P_TFT_MODE_CTRL & 0x01000000) ? "ENABLED (bit 24)" : "DISABLED"}`);
            lines.push(`VBlank:            ${(this.regs.P_TFT_INT_STATUS & 0x01) ? "YES" : "NO"}`);
            lines.push(`Color Mode:        ${this.colorModeSource} → ${this.colorModeTarget}`);
            lines.push("");
            lines.push(`Cycle Counter:     ${this.cycleCounter.toFixed(0)} / ${this.cyclesPerFrame.toFixed(0)}`);
            lines.push(`Total Cycles:      ${this.stats.totalCycles}`);
            lines.push("");
            lines.push(`Frames Rendered:   ${this.stats.framesRendered}`);
            lines.push(`Frames Attempted:  ${this.stats.framesAttempted}`);
            lines.push(`FB Errors:         ${this.stats.framebufferErrors}`);
            lines.push(`Bounds Errors:     ${this.stats.boundsErrors}`);
            lines.push(`Conv Errors:       ${this.stats.conversionErrors}`);
            lines.push(`V-Blanks:          ${this.stats.vblanks}`);
            lines.push(`Last Render:       ${this.stats.lastRenderTime.toFixed(2)}ms`);

            return lines.join("\n");
        }

        dump() {
            let output = "╔════════════════════════════════════════════════════╗\n";
            output += "║   VIDEO DISPLAY UNIT (VDU) v2.4.1                 ║\n";
            output += "║   SPCE3200 / HyperScan Emulator                    ║\n";
            output += "║   IRQ VBlank: 4 (SPG290)                           ║\n";
            output += "╚════════════════════════════════════════════════════╝\n\n";
            output += this.getStatus();
            output += "\n\n";
            output += "═════════════════════════════════════════════════════\n";
            output += "REGISTRADORES MAPEADOS:\n";
            output += "═════════════════════════════════════════════════════\n";
            output += `0x88040000 (P_TFT_MODE_CTRL):  0x${this.regs.P_TFT_MODE_CTRL.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88040004 (P_TFT_PARAM1):     0x${this.regs.P_TFT_PARAM1.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88040008 (P_TFT_HW_SIZE):    0x${this.regs.P_TFT_HW_SIZE.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88040018 (P_TFT_HV_SIZE):    0x${this.regs.P_TFT_HV_SIZE.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88040050 (P_TFT_INT_STATUS): 0x${this.regs.P_TFT_INT_STATUS.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88070000 (P_LCD_BUFFER_SA1): 0x${this.regs.P_LCD_BUFFER_SA1.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88070004 (P_LCD_BUFFER_SA2): 0x${this.regs.P_LCD_BUFFER_SA2.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x88070008 (P_LCD_BUFFER_SA3): 0x${this.regs.P_LCD_BUFFER_SA3.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += `0x8807000C (P_LCD_BUFFER_SEL): 0x${this.regs.P_LCD_BUFFER_SEL.toString(16).padStart(8, '0').toUpperCase()}\n`;
            output += "\n";
            return output;
        }

        setDebug(enabled) {
            this.debugEnabled = enabled;
            console.log(`[VDU] Debug: ${enabled ? "ATIVADO" : "DESATIVADO"}`);
        }

        clear(r = 0, g = 0, b = 0, a = 255) {
            const color = (r << 24) | (g << 16) | (b << 8) | a;
            this.imageDataU32.fill(color);
            this.ctx.putImageData(this.imageData, 0, 0);
        }

        setResolution(w, h) {
            if (w !== this.width || h !== this.height) {
                this.width = w;
                this.height = h;
                this.canvas.width = w;
                this.canvas.height = h;
                this.imageData = this.ctx.createImageData(this.width, this.height);
                this.imageDataU32 = new Uint32Array(this.imageData.data.buffer);
                console.log(`[VDU] ✓ Resolução alterada para ${w}x${h}`);
            }
        }

        setColorMode(mode) {
            const validModes = ['RGBA8888', 'RGB565', 'RGB555', 'ARGB8888'];
            if (validModes.includes(mode)) {
                this.colorModeSource = mode;
                console.log(`[VDU] ✓ Modo de cores (entrada) alterado para ${mode}`);
            } else {
                console.warn(`[VDU] ⚠️ Modo de cores inválido: ${mode}`);
            }
        }

        /**
         * ✅ NOVO v2.4: Definir endereço de framebuffer
         */
        setFramebufferAddress(addr) {
            this.regs.P_LCD_BUFFER_SA1 = addr;
            if (this.debugEnabled) {
                console.log(`[VDU] ✓ Framebuffer endereço definido: 0x${addr.toString(16).padStart(8, '0').toUpperCase()}`);
            }
        }

        /**
         * ✅ NOVO v2.4: Selecionar buffer (0, 1, 2)
         */
        selectBuffer(index) {
            const sel = index & 0x03;
            this.regs.P_LCD_BUFFER_SEL = sel;
            if (this.debugEnabled) {
                console.log(`[VDU] ✓ Buffer selecionado: ${sel}`);
            }
        }

        /**
         * ✅ NOVO v2.4: Habilitar/Desabilitar display via bit 24
         */
        setDisplayEnabled(enabled) {
            if (enabled) {
                this.regs.P_TFT_MODE_CTRL |= 0x01000000;
            } else {
                this.regs.P_TFT_MODE_CTRL &= ~0x01000000;
            }
            if (this.debugEnabled) {
                console.log(`[VDU] Display ${enabled ? "HABILITADO" : "DESABILITADO"}`);
            }
        }

        reset() {
            this.regs.P_TFT_MODE_CTRL = 0x01000000;
            this.regs.P_TFT_PARAM1 = 0x00000000;
            this.regs.P_TFT_HW_SIZE = ((this.height & 0x1FF) << 16) | (this.width & 0x1FF);
            this.regs.P_TFT_HV_SIZE = 0x00000000;
            this.regs.P_TFT_INT_STATUS = 0x00000000;
            this.regs.P_LCD_BUFFER_SEL = 0x00000000;
            
            this.cycleCounter = 0;
            this.vblankPending = false;

            this.stats = {
                framesRendered: 0,
                framesAttempted: 0,
                framebufferErrors: 0,
                boundsErrors: 0,
                lastRenderTime: 0,
                avgRenderTime: 0,
                vblanks: 0,
                conversionErrors: 0,
                totalCycles: 0
            };

            this.clear();
            console.log("[VDU] ✓ Reset completo");
        }
    }

    window.VideoDisplayUnit = VideoDisplayUnit;

    console.log("[VDU] ════════════════════════════════════════════════");
    console.log("[VDU] ✓ VideoDisplayUnit v2.4.1 carregada com sucesso");
    console.log("[VDU] ════════════════════════════════════════════════");
    console.log("[VDU] ✅ CORRIGIDO v2.4.1: IRQ 4 (SPG290 real)");
    console.log("[VDU] ✅ CORRIGIDO v2.4.1: Validação framebuffer DRAM");
    console.log("[VDU] ✅ CORRIGIDO v2.4.1: Debug aprimorado");
    console.log("[VDU] ✅ NOVO v2.4: Registradores SPCE3200 completos");
    console.log("[VDU] ✅ NOVO v2.4: Triple Buffering (SA1, SA2, SA3)");
    console.log("[VDU] ✅ NOVO v2.4: Sistema de Step & Ciclos");
    console.log("[VDU] ✓ Extends MemoryRegion - Compatível com MIU");
    console.log("[VDU] ✓ Suporta acesso de 8/16/32 bits");
    console.log("[VDU] ✓ Resolução nativa: 320x224 (HyperScan)");
    console.log("[VDU] ════════════════════════════════════════════════");
}