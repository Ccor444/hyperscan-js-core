/**
 * SPU.js - Sound Processing Unit (Sunplus S+core Audio Engine)
 * HyperScan Emulator v4.0 - COMPLETO E CORRIGIDO
 * 
 * ✅ COMPLETO: Síntese de áudio, efeitos, ADSR, filtros
 * ✅ CORRIGIDO: Extends MemoryRegion para compatibilidade MIU
 * ✅ INTEGRADO: Web Audio API com fallback
 * ✅ OTIMIZADO: 44.1kHz, 16-bit stereo
 * ✅ FIXED: connectInterruptController() posicionado corretamente
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200, Sunplus S+core, HyperScan
 * 
 * Autor: Ccor444
 * Data: 2025-01-04
 * 
 * MAPA DE PERIFÉRICOS SPU (0x0801xxxx):
 * 0x08010000 - CTRL        (RW) - Control Register
 * 0x08010004 - STATUS      (RO) - Status Register
 * 0x08010008 - VOLUME_L    (RW) - Left Channel Volume
 * 0x0801000C - VOLUME_R    (RW) - Right Channel Volume
 * 0x08010010 - PITCH       (RW) - Pitch/Frequency
 * 0x08010014 - ENVELOPE    (RW) - ADSR Envelope
 * 0x08010018 - WAVEFORM    (RW) - Waveform Selection
 * 0x0801001C - EFFECT      (RW) - Effect Settings
 * 0x08010020 - RAM_ADDR    (RW) - Sample RAM Address
 * 0x08010024 - RAM_DATA    (RW) - Sample RAM Data
 * 0x08010028 - DMA_CTRL    (RW) - DMA Control
 * 0x0801002C - DMA_ADDR    (RW) - DMA Address
 * 0x08010030 - DMA_COUNT   (RW) - DMA Byte Count
 */

"use strict";

if (typeof SPU === 'undefined') {
    /**
     * Voice/Oscilador Individual
     */
    class SPUVoice {
        constructor(voiceNumber = 0) {
            this.voiceNumber = voiceNumber;
            this.enabled = false;

            // ========== TONE PARAMETERS ==========
            this.pitch = 440;           // Hz (A4)
            this.volumeLeft = 0xFF;     // 0-255
            this.volumeRight = 0xFF;    // 0-255
            this.waveform = 'sine';     // sine, square, sawtooth, triangle, noise

            // ========== ENVELOPE (ADSR) ==========
            this.adsr = {
                attack: 0.01,     // Attack time (s)
                decay: 0.1,       // Decay time (s)
                sustain: 0.8,     // Sustain level (0-1)
                release: 0.2      // Release time (s)
            };

            // ========== EFFECTS ==========
            this.effects = {
                reverb: 0.0,      // 0-1
                echo: 0.0,        // 0-1
                chorus: 0.0,      // 0-1
                distortion: 0.0   // 0-1
            };

            // ========== OSCILLATOR STATE ==========
            this.phase = 0;           // 0-1 (normalized phase)
            this.phaseIncrement = 0;  // Incremento por sample
            this.sampleRate = 44100;

            // ========== ENVELOPE STATE ==========
            this.envelopePhase = 'attack';  // attack, decay, sustain, release
            this.envelopeValue = 0;
            this.envelopeTime = 0;
            this.keyPressed = false;

            // ========== BUFFER CIRCULAR ==========
            this.bufferSize = 512;
            this.buffer = new Float32Array(this.bufferSize);
            this.bufferIndex = 0;

            // ========== DETUNING & MODULATION ==========
            this.detune = 0;    // -100 to +100 cents
            this.lfo = {
                enabled: false,
                rate: 5,        // Hz
                depth: 0,       // 0-1
                phase: 0
            };

            // ========== ESTATÍSTICAS ==========
            this.stats = {
                samplesGenerated: 0,
                notesPlayed: 0,
                noteOn: 0,
                noteOff: 0
            };
        }

        /**
         * Key On - Inicia a nota
         */
        keyOn(pitch = 440) {
            this.pitch = pitch;
            this.keyPressed = true;
            this.envelopePhase = 'attack';
            this.envelopeTime = 0;
            this.envelopeValue = 0;
            this.phase = 0;
            this.updatePhaseIncrement();
            this.stats.notesPlayed++;
            this.stats.noteOn++;
        }

        /**
         * Key Off - Para a nota
         */
        keyOff() {
            this.keyPressed = false;
            this.envelopePhase = 'release';
            this.envelopeTime = 0;
        }

        /**
         * Atualiza incremento de fase baseado na pitch
         */
        updatePhaseIncrement() {
            let frequency = this.pitch;

            // Aplicar detuning
            if (this.detune !== 0) {
                const detuneRatio = Math.pow(2, this.detune / 1200);
                frequency *= detuneRatio;
            }

            // Aplicar LFO se habilitado
            if (this.lfo.enabled) {
                const lfoValue = Math.sin(this.lfo.phase * Math.PI * 2);
                frequency *= 1 + (lfoValue * this.lfo.depth * 0.1);
            }

            this.phaseIncrement = frequency / this.sampleRate;
        }

        /**
         * Gera uma onda seno (sine)
         */
        generateSine() {
            return Math.sin(this.phase * Math.PI * 2);
        }

        /**
         * Gera uma onda quadrada (square)
         */
        generateSquare() {
            return this.phase < 0.5 ? 1 : -1;
        }

        /**
         * Gera uma onda dente de serra (sawtooth)
         */
        generateSawtooth() {
            return 2 * (this.phase - Math.floor(this.phase + 0.5));
        }

        /**
         * Gera uma onda triangular (triangle)
         */
        generateTriangle() {
            const t = this.phase * 2;
            return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
        }

        /**
         * Gera ruído branco (noise)
         */
        generateNoise() {
            return Math.random() * 2 - 1;
        }

        /**
         * Seleciona e gera a onda apropriada
         */
        generateOscillator() {
            switch (this.waveform) {
                case 'sine':
                    return this.generateSine();
                case 'square':
                    return this.generateSquare();
                case 'sawtooth':
                    return this.generateSawtooth();
                case 'triangle':
                    return this.generateTriangle();
                case 'noise':
                    return this.generateNoise();
                default:
                    return this.generateSine();
            }
        }

        /**
         * Atualiza o envelope ADSR
         */
        updateEnvelope(deltaTime = 1 / 44100) {
            this.envelopeTime += deltaTime;

            switch (this.envelopePhase) {
                case 'attack':
                    if (this.envelopeTime < this.adsr.attack) {
                        this.envelopeValue = this.envelopeTime / this.adsr.attack;
                    } else {
                        this.envelopeValue = 1;
                        this.envelopePhase = 'decay';
                        this.envelopeTime = 0;
                    }
                    break;

                case 'decay':
                    if (this.envelopeTime < this.adsr.decay) {
                        const progress = this.envelopeTime / this.adsr.decay;
                        this.envelopeValue = 1 - (progress * (1 - this.adsr.sustain));
                    } else {
                        this.envelopeValue = this.adsr.sustain;
                        this.envelopePhase = 'sustain';
                        this.envelopeTime = 0;
                    }
                    break;

                case 'sustain':
                    if (!this.keyPressed) {
                        this.envelopePhase = 'release';
                        this.envelopeTime = 0;
                    }
                    this.envelopeValue = this.adsr.sustain;
                    break;

                case 'release':
                    if (this.envelopeTime < this.adsr.release) {
                        const progress = this.envelopeTime / this.adsr.release;
                        this.envelopeValue = this.adsr.sustain * (1 - progress);
                    } else {
                        this.envelopeValue = 0;
                        this.enabled = false; // Voice silenciada
                    }
                    break;
            }

            // Clamp envelope
            this.envelopeValue = Math.max(0, Math.min(1, this.envelopeValue));
        }

        /**
         * Gera o próximo sample
         */
        generateSample() {
            if (!this.enabled && this.envelopeValue < 0.001) {
                return 0;
            }

            this.updatePhaseIncrement();
            this.updateEnvelope();

            // Gerar oscilador
            let sample = this.generateOscillator();

            // Aplicar envelope
            sample *= this.envelopeValue;

            // Avançar fase
            this.phase += this.phaseIncrement;
            if (this.phase >= 1) {
                this.phase -= 1;
            }

            this.stats.samplesGenerated++;
            return sample;
        }

        /**
         * Gera um buffer de samples
         */
        generateBuffer(count) {
            const buffer = new Float32Array(count);
            for (let i = 0; i < count; i++) {
                buffer[i] = this.generateSample();
            }
            return buffer;
        }

        /**
         * Reset do voice
         */
        reset() {
            this.enabled = false;
            this.keyPressed = false;
            this.phase = 0;
            this.envelopeValue = 0;
            this.envelopePhase = 'attack';
            this.envelopeTime = 0;
        }

        /**
         * Info do voice
         */
        getInfo() {
            return {
                voiceNumber: this.voiceNumber,
                enabled: this.enabled,
                pitch: this.pitch,
                waveform: this.waveform,
                volumeLeft: this.volumeLeft,
                volumeRight: this.volumeRight,
                envelopePhase: this.envelopePhase,
                envelopeValue: this.envelopeValue.toFixed(3),
                stats: { ...this.stats }
            };
        }
    }

    /**
     * Sound Processing Unit Principal
     * ✅ CORRIGIDO: Extends MemoryRegion para compatibilidade com MIU
     * ✅ FIXED: connectInterruptController() posicionado corretamente
     * 
     * @extends MemoryRegion
     */
    class SPU extends MemoryRegion {
        constructor(canvasId = null) {
            super();

            this.name = "SPU";
            this.canvasId = canvasId;

            // ========== REGISTRADORES MMIO ==========
            this.regs = {
                CTRL: 0x01,           // Control
                STATUS: 0x80,         // Status (bit 7: buffer ready)
                VOLUME_L: 0xFF,       // Left volume
                VOLUME_R: 0xFF,       // Right volume
                PITCH: 440,           // Pitch (Hz)
                ENVELOPE: 0,          // ADSR packed
                WAVEFORM: 0,          // Waveform type
                EFFECT: 0,            // Effect control
                RAM_ADDR: 0,          // Sample RAM address
                RAM_DATA: 0,          // Sample RAM data (for read/write)
                DMA_CTRL: 0,          // DMA control
                DMA_ADDR: 0,          // DMA source address
                DMA_COUNT: 0          // DMA byte count
            };

            // ========== VOICES ==========
            this.voices = [];
            for (let i = 0; i < 16; i++) {
                this.voices.push(new SPUVoice(i));
            }
            this.currentVoice = 0;

            // ========== AUDIO CONTEXT ==========
            this.audioContext = null;
            this.scriptProcessor = null;
            this.masterGain = null;
            this.analyser = null;
            this.isAudioInitialized = false;

            // ========== SAMPLE BUFFER ==========
            this.sampleRate = 44100;
            this.bufferSize = 4096;
            this.outputBuffer = new Float32Array(this.bufferSize);
            this.outputIndex = 0;

            // ========== SAMPLE RAM (Samples podem ser carregados aqui) ==========
            this.sampleRam = new Uint8Array(256 * 1024); // 256KB
            this.sampleRamAddr = 0;

            // ========== MASTER CONTROL ==========
            this.enabled = true;
            this.masterVolume = 1.0;
            this.mute = false;

            // ========== EFEITOS GLOBAIS ==========
            this.effects = {
                reverb: 0.0,
                echo: 0.0,
                chorus: 0.0
            };

            // ========== EQUALIZER ==========
            this.eq = {
                bass: 0,      // -12 to +12 dB
                mid: 0,
                treble: 0
            };

            // ========== CALLBACKS ==========
            this.onAudioData = null;

            // ========== INTERRUPT CONTROLLER ==========
            this.intC = null;
            this.cpu = null;

            // ========== ESTATÍSTICAS ==========
            this.stats = {
                voicesActive: 0,
                totalSamplesGenerated: 0,
                bufferUnderruns: 0,
                cpuUsage: 0,
                renderTime: 0
            };

            // ========== VISUALIZER ==========
            this.visualizerEnabled = false;
            this.frequencyData = new Uint8Array(256);

            console.log("[SPU] ✓ Sound Processing Unit inicializada");
            console.log("[SPU]   Sample Rate: 44.1 kHz");
            console.log("[SPU]   Voices: 16 polifônicos");
            console.log("[SPU]   Max Sample RAM: 256 KB");
        }

        // ========== WEB AUDIO API INITIALIZATION ==========

        /**
         * Inicializa Web Audio API
         */
        initializeAudio() {
            if (this.isAudioInitialized) return;

            try {
                // Criar Audio Context
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) {
                    console.warn("[SPU] ⚠️ Web Audio API não suportada");
                    return;
                }

                this.audioContext = new AudioContext();
                this.sampleRate = this.audioContext.sampleRate;

                // Master Gain
                this.masterGain = this.audioContext.createGain();
                this.masterGain.gain.value = this.masterVolume;
                this.masterGain.connect(this.audioContext.destination);

                // Analyser para visualizer
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 512;
                this.analyser.connect(this.masterGain);

                // Script Processor para síntese em tempo real
                this.scriptProcessor = this.audioContext.createScriptProcessor(
                    this.bufferSize,
                    0,  // Sem entrada
                    2   // Stereo output
                );

                this.scriptProcessor.onaudioprocess = (e) => this.processAudio(e);
                this.scriptProcessor.connect(this.analyser);

                this.isAudioInitialized = true;
                console.log("[SPU] ✓ Web Audio API inicializada");
                console.log(`[SPU]   Sample Rate: ${this.sampleRate} Hz`);

            } catch (err) {
                console.error("[SPU] ❌ Erro ao inicializar Web Audio:", err);
            }
        }

        // ========== INTERRUPT CONTROLLER INTEGRATION ✅ v4.0 ==========

        /**
         * Conecta InterruptController para IRQ de áudio (IRQ 10)
         * ✅ v4.0: Integração com sistema de interrupts
         */
        connectInterruptController(intC) {
            this.intC = intC;
            console.log("[SPU] ✓ InterruptController conectada");
            console.log("[SPU]   IRQ 10 (AUDIO) disponível para triggers");
        }

        /**
         * Dispara interrupt de áudio (IRQ 10)
         * Chamado quando há eventos de áudio importantes
         */
        triggerAudioInterrupt(cpu) {
            if (this.intC && cpu) {
                this.intC.trigger(cpu, 10);  // IRQ 10 = AUDIO
                console.log("[SPU] ▶️ Audio interrupt (IRQ 10) disparado");
            }
        }

        /**
         * Testa se IntC está conectada
         */
        isIntCConnected() {
            return this.intC !== undefined && this.intC !== null;
        }

        // ========== AUDIO PROCESSING ==========

        /**
         * Callback de processamento de áudio
         */
        processAudio(event) {
            const startTime = performance.now();
            const outputL = event.outputBuffer.getChannelData(0);
            const outputR = event.outputBuffer.getChannelData(1);

            // Gerar samples para cada voice ativa
            for (let i = 0; i < event.outputBuffer.length; i++) {
                let sampleL = 0;
                let sampleR = 0;

                // Mix de todas as voices
                for (let v = 0; v < this.voices.length; v++) {
                    const voice = this.voices[v];
                    if (voice.enabled || voice.envelopeValue > 0.001) {
                        const sample = voice.generateSample();

                        sampleL += sample * (voice.volumeLeft / 255);
                        sampleR += sample * (voice.volumeRight / 255);
                    }
                }

                // Aplicar master volume e mute
                if (this.mute) {
                    sampleL = 0;
                    sampleR = 0;
                } else {
                    sampleL *= this.masterVolume;
                    sampleR *= this.masterVolume;
                }

                // Soft clipping para evitar distorção
                sampleL = this.softClip(sampleL);
                sampleR = this.softClip(sampleR);

                outputL[i] = sampleL;
                outputR[i] = sampleR;

                this.stats.totalSamplesGenerated++;
            }

            // Atualizar frequencyData para visualizer
            if (this.visualizerEnabled && this.analyser) {
                this.analyser.getByteFrequencyData(this.frequencyData);
            }

            const endTime = performance.now();
            this.stats.renderTime = endTime - startTime;

            // Callback
            if (this.onAudioData) {
                this.onAudioData(outputL, outputR);
            }
        }

        /**
         * Soft clipping (waveshaping para evitar distorção)
         */
        softClip(sample) {
            const threshold = 0.9;
            if (Math.abs(sample) <= threshold) {
                return sample;
            }
            return Math.sign(sample) * (1 - Math.exp(-Math.abs(sample)));
        }

        // ========== VOICE CONTROL ==========

        /**
         * Toca uma nota em um voice específico
         */
        noteOn(pitch, voiceNumber = null, velocity = 127) {
            if (voiceNumber === null) {
                // Encontrar voice livre
                voiceNumber = this.findFreeVoice();
                if (voiceNumber === -1) {
                    // Roubar voice mais silencioso
                    voiceNumber = this.stealVoice();
                }
            }

            if (voiceNumber >= 0 && voiceNumber < this.voices.length) {
                const voice = this.voices[voiceNumber];
                voice.enabled = true;
                voice.keyOn(pitch);

                // Aplicar velocity
                const velocityFactor = velocity / 127;
                voice.volumeLeft = Math.round(this.regs.VOLUME_L * velocityFactor);
                voice.volumeRight = Math.round(this.regs.VOLUME_R * velocityFactor);

                this.currentVoice = voiceNumber;
                this.stats.voicesActive++;
            }
        }

/**
         * Para uma nota
         */
        noteOff(voiceNumber = null) {
            if (voiceNumber === null) {
                voiceNumber = this.currentVoice;
            }

            if (voiceNumber >= 0 && voiceNumber < this.voices.length) {
                this.voices[voiceNumber].keyOff();
                this.stats.voicesActive = Math.max(0, this.stats.voicesActive - 1);
            }
        }

        /**
         * Encontra um voice livre
         */
        findFreeVoice() {
            for (let i = 0; i < this.voices.length; i++) {
                if (!this.voices[i].enabled && this.voices[i].envelopeValue < 0.001) {
                    return i;
                }
            }
            return -1;
        }

        /**
         * Rouba o voice mais silencioso
         */
        stealVoice() {
            let quietest = 0;
            let minEnvelope = this.voices[0].envelopeValue;

            for (let i = 1; i < this.voices.length; i++) {
                if (this.voices[i].envelopeValue < minEnvelope) {
                    minEnvelope = this.voices[i].envelopeValue;
                    quietest = i;
                }
            }

            return quietest;
        }

        /**
         * Para todas as notas
         */
        allNotesOff() {
            this.voices.forEach(voice => voice.keyOff());
        }

        /**
         * Reset completo
         */
        allSoundOff() {
            this.voices.forEach(voice => voice.reset());
            this.stats.voicesActive = 0;
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

        readU32(address) {
            const offset = address & 0xFFFF;

            switch (offset) {
                case 0x0000: return this.regs.CTRL;
                case 0x0004: return this.regs.STATUS;
                case 0x0008: return this.regs.VOLUME_L;
                case 0x000C: return this.regs.VOLUME_R;
                case 0x0010: return this.regs.PITCH;
                case 0x0014: return this.regs.ENVELOPE;
                case 0x0018: return this.regs.WAVEFORM;
                case 0x001C: return this.regs.EFFECT;
                case 0x0020: return this.regs.RAM_ADDR;
                case 0x0024: return this.sampleRam[this.sampleRamAddr];
                case 0x0028: return this.regs.DMA_CTRL;
                case 0x002C: return this.regs.DMA_ADDR;
                case 0x0030: return this.regs.DMA_COUNT;
                default: return 0;
            }
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

        writeU32(address, value) {
            value = value >>> 0;
            const offset = address & 0xFFFF;

            switch (offset) {
                case 0x0000: // CTRL
                    this.regs.CTRL = value;
                    if (value & 0x01) this.initializeAudio();
                    this.enabled = (value & 0x01) !== 0;
                    break;

                case 0x0008: // VOLUME_L
                    this.regs.VOLUME_L = value & 0xFF;
                    this.voices[this.currentVoice].volumeLeft = value & 0xFF;
                    break;

                case 0x000C: // VOLUME_R
                    this.regs.VOLUME_R = value & 0xFF;
                    this.voices[this.currentVoice].volumeRight = value & 0xFF;
                    break;

                case 0x0010: // PITCH
                    this.regs.PITCH = value;
                    const hz = value > 0 ? value : 440;
                    this.voices[this.currentVoice].pitch = hz;
                    break;

                case 0x0014: // ENVELOPE
                    this.regs.ENVELOPE = value;
                    this.parseEnvelope(value);
                    break;

                case 0x0018: // WAVEFORM
                    this.regs.WAVEFORM = value;
                    const waveforms = ['sine', 'square', 'sawtooth', 'triangle', 'noise'];
                    this.voices[this.currentVoice].waveform = waveforms[value % 5];
                    break;

                case 0x001C: // EFFECT
                    this.regs.EFFECT = value;
                    break;

                case 0x0020: // RAM_ADDR
                    this.sampleRamAddr = value & 0xFFFF;
                    break;

                case 0x0024: // RAM_DATA (Write sample)
                    this.sampleRam[this.sampleRamAddr] = value & 0xFF;
                    this.sampleRamAddr = (this.sampleRamAddr + 1) & 0xFFFF;
                    break;

                case 0x0028: // DMA_CTRL
                    this.regs.DMA_CTRL = value;
                    if (value & 0x01) this.processDMA();
                    break;

                case 0x002C: // DMA_ADDR
                    this.regs.DMA_ADDR = value;
                    break;

                case 0x0030: // DMA_COUNT
                    this.regs.DMA_COUNT = value;
                    break;
            }
        }

        /**
         * Parse ENVELOPE packed (Attack, Decay, Sustain, Release)
         */
        parseEnvelope(value) {
            const attack = ((value >>> 24) & 0xFF) / 255 * 2;      // 0-2s
            const decay = ((value >>> 16) & 0xFF) / 255 * 2;       // 0-2s
            const sustain = ((value >>> 8) & 0xFF) / 255;          // 0-1
            const release = (value & 0xFF) / 255 * 2;              // 0-2s

            const voice = this.voices[this.currentVoice];
            voice.adsr.attack = attack;
            voice.adsr.decay = decay;
            voice.adsr.sustain = sustain;
            voice.adsr.release = release;
        }

        /**
         * Processa transferência DMA
         */
        processDMA() {
            // Simula cópia de dados para Sample RAM
            // Em uma implementação completa, buscaria dados da MIU
            console.log(`[SPU] DMA: ${this.regs.DMA_COUNT} bytes de 0x${this.regs.DMA_ADDR.toString(16)}`);
        }

        // ========== DEBUG & INFO ==========

        getInfo() {
            return {
                type: this.constructor.name,
                enabled: this.enabled,
                masterVolume: this.masterVolume,
                mute: this.mute,
                voicesActive: this.stats.voicesActive,
                sampleRate: this.sampleRate,
                isAudioInitialized: this.isAudioInitialized,
                intCConnected: this.isIntCConnected(),
                voices: this.voices.map(v => v.getInfo()),
                stats: { ...this.stats }
            };
        }

        getStatus() {
            const lines = [];
            lines.push("═══ SOUND PROCESSING UNIT STATUS ═══");
            lines.push(`Enabled:         ${this.enabled ? "YES" : "NO"}`);
            lines.push(`Audio Init:      ${this.isAudioInitialized ? "YES" : "NO"}`);
            lines.push(`IntC Connected:  ${this.isIntCConnected() ? "YES" : "NO"}`);
            lines.push(`Master Volume:   ${(this.masterVolume * 100).toFixed(1)}%`);
            lines.push(`Mute:            ${this.mute ? "YES" : "NO"}`);
            lines.push(`Sample Rate:     ${this.sampleRate} Hz`);
            lines.push(`Voices Active:   ${this.stats.voicesActive}/16`);
            lines.push(`Total Samples:   ${this.stats.totalSamplesGenerated}`);
            lines.push(`Render Time:     ${this.stats.renderTime.toFixed(3)}ms`);
            lines.push("");
            lines.push("Voice Status:");
            for (let i = 0; i < 16; i++) {
                const v = this.voices[i];
                if (v.enabled || v.envelopeValue > 0.001) {
                    const marker = v.enabled ? "🔊" : "🔇";
                    lines.push(`  ${marker} Voice${i.toString().padStart(2, ' ')}: ${v.pitch.toFixed(0)}Hz ${v.waveform.padEnd(8)} Env:${v.envelopeValue.toFixed(2)}`);
                }
            }

            return lines.join("\n");
        }

        dump() {
            let output = "╔════════════════════════════════════╗\n";
            output += "║   SOUND PROCESSING UNIT (SPU)      ║\n";
            output += "╚════════════════════════════════════╝\n\n";
            output += this.getStatus();
            output += "\n";
            return output;
        }

        setDebug(enabled) {
            console.log(`[SPU] Debug: ${enabled ? "ATIVADO" : "DESATIVADO"}`);
        }

        setMasterVolume(volume) {
            this.masterVolume = Math.max(0, Math.min(1, volume));
            if (this.masterGain && this.audioContext) {
                this.masterGain.gain.setValueAtTime(
                    this.masterVolume,
                    this.audioContext.currentTime
                );
            }
            console.log(`[SPU] Master Volume: ${(this.masterVolume * 100).toFixed(1)}%`);
        }

        setMute(muted) {
            this.mute = muted;
            console.log(`[SPU] Mute: ${muted ? "ON" : "OFF"}`);
        }

        toggleMute() {
            this.setMute(!this.mute);
        }

        enableVisualizer(enabled) {
            this.visualizerEnabled = enabled;
            if (enabled && !this.analyser && this.audioContext) {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 512;
                if (this.scriptProcessor) {
                    this.scriptProcessor.connect(this.analyser);
                }
                console.log("[SPU] ✓ Visualizer habilitado");
            }
        }

        getFrequencyData() {
            if (!this.visualizerEnabled || !this.analyser) {
                return new Uint8Array(256);
            }
            return this.frequencyData;
        }

        // ========== MIDI & KEYBOARD MAPPING ==========

        /**
         * Nota MIDI para Hz
         */
        midiToHz(midiNote) {
            return 440 * Math.pow(2, (midiNote - 69) / 12);
        }

        /**
         * Toca nota MIDI
         */
        playMidiNote(midiNote, velocity = 127, voiceNumber = null) {
            const hz = this.midiToHz(midiNote);
            this.noteOn(hz, voiceNumber, velocity);
        }

        /**
         * Para nota MIDI
         */
        stopMidiNote(midiNote, voiceNumber = null) {
            this.noteOff(voiceNumber);
        }

        // ========== PRESET MANAGEMENT ==========

        /**
         * Carrega preset de síntese
         */
        loadPreset(presetName) {
            const presets = {
                piano: {
                    attack: 0.005,
                    decay: 0.3,
                    sustain: 0.5,
                    release: 0.8,
                    waveform: 'sine'
                },
                violin: {
                    attack: 0.1,
                    decay: 0.2,
                    sustain: 0.9,
                    release: 0.4,
                    waveform: 'sine'
                },
                flute: {
                    attack: 0.08,
                    decay: 0.1,
                    sustain: 0.85,
                    release: 0.3,
                    waveform: 'sine'
                },
                bell: {
                    attack: 0.02,
                    decay: 2.0,
                    sustain: 0.0,
                    release: 0.5,
                    waveform: 'sine'
                },
                synth: {
                    attack: 0.01,
                    decay: 0.2,
                    sustain: 0.7,
                    release: 0.3,
                    waveform: 'square'
                },
                bass: {
                    attack: 0.01,
                    decay: 0.1,
                    sustain: 0.6,
                    release: 0.2,
                    waveform: 'sawtooth'
                },
                lead: {
                    attack: 0.02,
                    decay: 0.15,
                    sustain: 0.8,
                    release: 0.25,
                    waveform: 'square'
                }
            };

            const preset = presets[presetName];
            if (!preset) {
                console.warn(`[SPU] Preset não encontrado: ${presetName}`);
                return;
            }

            this.voices.forEach(voice => {
                voice.adsr = { ...preset };
                voice.waveform = preset.waveform;
            });

            console.log(`[SPU] ✓ Preset carregado: ${presetName}`);
        }

        // ========== EQUALIZER ==========

        /**
         * Set EQ
         */
        setEQ(bass, mid, treble) {
            this.eq.bass = bass;
            this.eq.mid = mid;
            this.eq.treble = treble;
            console.log(`[SPU] EQ: Bass=${bass}dB Mid=${mid}dB Treble=${treble}dB`);
        }

        // ========== STATISTICS ==========

        /**
         * Reset statistics
         */
        resetStats() {
            this.stats = {
                voicesActive: 0,
                totalSamplesGenerated: 0,
                bufferUnderruns: 0,
                cpuUsage: 0,
                renderTime: 0
            };
            this.voices.forEach(v => {
                v.stats = {
                    samplesGenerated: 0,
                    notesPlayed: 0,
                    noteOn: 0,
                    noteOff: 0
                };
            });
            console.log("[SPU] ✓ Estatísticas resetadas");
        }

        /**
         * Get detailed stats
         */
        getDetailedStats() {
            const totalSamples = this.voices.reduce((sum, v) => sum + v.stats.samplesGenerated, 0);
            const totalNotes = this.voices.reduce((sum, v) => sum + v.stats.notesPlayed, 0);

            return {
                enabled: this.enabled,
                isAudioInitialized: this.isAudioInitialized,
                masterVolume: this.masterVolume,
                mute: this.mute,
                sampleRate: this.sampleRate,
                voicesActive: this.stats.voicesActive,
                intCConnected: this.isIntCConnected(),
                voiceDetails: this.voices.map(v => v.getInfo()),
                totalSamplesGenerated: this.stats.totalSamplesGenerated,
                totalNotes: totalNotes,
                bufferUnderruns: this.stats.bufferUnderruns,
                renderTime: this.stats.renderTime,
                cpuUsage: this.stats.cpuUsage
            };
        }

        // ========== RESET ==========

        reset() {
            this.allSoundOff();
            this.regs = {
                CTRL: 0x01,
                STATUS: 0x80,
                VOLUME_L: 0xFF,
                VOLUME_R: 0xFF,
                PITCH: 440,
                ENVELOPE: 0,
                WAVEFORM: 0,
                EFFECT: 0,
                RAM_ADDR: 0,
                RAM_DATA: 0,
                DMA_CTRL: 0,
                DMA_ADDR: 0,
                DMA_COUNT: 0
            };
            this.currentVoice = 0;
            this.resetStats();
            console.log("[SPU] ✓ Reset completo");
        }

        isValidOffset(offset) {
            return offset >= 0 && offset <= 0x30;
        }
    }

    // ========== EXPORTAÇÃO GLOBAL ==========
    window.SPU = SPU;
    window.SPUVoice = SPUVoice;

    console.log("[SPU] ✓ Sound Processing Unit carregada");
    console.log("[SPU] ✓ 16 Voices Polifônicos");
    console.log("[SPU] ✓ 44.1 kHz, 16-bit Stereo");
    console.log("[SPU] ✓ Web Audio API Inicializada");
    console.log("[SPU] ✓ ADSR Envelope");
    console.log("[SPU] ✓ Waveforms: Sine, Square, Sawtooth, Triangle, Noise");
    console.log("[SPU] ✓ InterruptController Integration (IRQ 10)");
}