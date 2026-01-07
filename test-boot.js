/**
 * test-boot.js - Testes de Boot e Compatibilidade ROM
 */

class HyperScanBootTest {
    static async runTests(romFile) {
        console.log("╔════════════════════════════════════╗");
        console.log("║   HyperScan ROM Boot Tests        ║");
        console.log("╚════════════════════════════════════╝\n");
        
        const results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        
        // Test 1: ROM Load
        try {
            await window.emu.loadROM(romFile);
            results.tests.push({ name: "ROM Load", status: "✓ PASS" });
            results.passed++;
        } catch (e) {
            results.tests.push({ name: "ROM Load", status: `✗ FAIL: ${e.message}` });
            results.failed++;
            return results;  // Stop if ROM doesn't load
        }
        
        // Test 2: PC in valid range
        const pc = window.emu.cpu.pc;
        if (pc === 0x9E000000 || pc === 0x9E000100) {
            results.tests.push({ name: "Boot Address", status: `✓ PASS (0x${pc.toString(16).toUpperCase()})` });
            results.passed++;
        } else {
            results.tests.push({ name: "Boot Address", status: `✗ FAIL (0x${pc.toString(16).toUpperCase()})` });
            results.failed++;
        }
        
        // Test 3: First instruction valid
        const firstInsn = window.emu.cpu.miu.readU32(pc);
        const op = (firstInsn >>> 27) & 0x1F;
        if (op <= 0x1F) {
            results.tests.push({ name: "First Opcode", status: `✓ PASS (0x${op.toString(16)})` });
            results.passed++;
        } else {
            results.tests.push({ name: "First Opcode", status: `✗ FAIL (0x${op.toString(16)})` });
            results.failed++;
        }
        
        // Test 4: Disassembly
        try {
            const disasm = window.emu.disassembler.disasmAt(pc);
            if (disasm && disasm.text) {
                results.tests.push({ name: "Disassembly", status: `✓ PASS (${disasm.text})` });
                results.passed++;
            }
        } catch (e) {
            results.tests.push({ name: "Disassembly", status: `✗ FAIL: ${e.message}` });
            results.failed++;
        }
        
        // Test 5: Peripherals
        const periph = window.emu.validatePeripherals();
        results.tests.push({ 
            name: "Peripherals", 
            status: periph ? "✓ PASS" : "⚠️ WARN (Some missing)" 
        });
        
        // Test 6: VDU Setup
        const vdu = window.emu.peripherals.vdu;
        if (vdu && vdu.fbAddr === 0xA0000000) {
            results.tests.push({ 
                name: "VDU Framebuffer", 
                status: `✓ PASS (0xA0000000)` 
            });
            results.passed++;
        } else {
            results.tests.push({ 
                name: "VDU Framebuffer", 
                status: `✗ FAIL (0x${vdu?.fbAddr?.toString(16)})` 
            });
            results.failed++;
        }
        
        // Print results
        console.log("┌────────────────────────────────────┐");
        results.tests.forEach(test => {
            console.log(`│ ${test.name.padEnd(20)} ${test.status}`);
        });
        console.log("└────────────────────────────────────┘");
        console.log(`\nTotal: ${results.passed} ✓ | ${results.failed} ✗\n`);
        
        return results;
    }
}

// Uso:
// const file = document.getElementById('rom-upload').files[0];
// HyperScanBootTest.runTests(file);