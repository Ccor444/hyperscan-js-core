🎮 HyperScan JS Core

HyperScan JS Core is an experimental but advanced JavaScript-based hardware emulator focused on the Sunplus SPG290 / SPCE3200 32-bit RISC architecture. It is designed to run directly in the browser, featuring a fully integrated interactive debugger, hardware abstraction, and a custom terminal known as Luna Console.

This project is not related to Intel Hyperscan. It is a standalone emulation engine built for learning, research, reverse engineering, and experimentation.


---

🚀 Features

🧠 32-bit RISC CPU Emulation (Sunplus SPCE3200/SPG290)

🧩 Modular Memory Architecture (RAM, ROM, IO, segmented regions)

⚡ Interrupt Controller (IRQ) with masking and triggering

⏱️ Timers & Hardware Counters

🎵 SPU Audio Engine v4.0 with voices, presets and live testing

📀 CD-ROM Emulator v4.0

ISO9660 support

UDF support

Virtual file system browsing


🖥️ VDU (Video Display Unit) abstraction

🔍 Integrated Disassembler (16-bit & 32-bit)

🛠️ Advanced Debugger

Breakpoints

Step / Run / Pause

Register & memory inspection

Performance monitoring


🧪 Diagnostic & Validation Tools

💻 Runs fully in the browser (no backend required)



---

🖥️ Luna Console

The Luna Console is a built-in interactive terminal that provides real-time control over the emulator.

Example startup:

🎮 HyperScan v4.0
▶️ RUNNING

╔════════════════════════════════════════╗
║   🟢 LUNA ENGINE CONSOLE ONLINE       ║
║   Firmware: SPG290 HyperScan v4.0      ║
║   Advanced Debugger Terminal Ready     ║
║   🎵 Audio Engine: SPU v4.0 Enabled    ║
║   📀 CDROM v4.0: UDF+ISO Support       ║
╚════════════════════════════════════════╝

Available Console Commands (Examples)

help                Show all commands
boot.status         Check BIOS boot sequence
spu.test            Test audio output
cdrom.load          Load a CD-ROM image
luna.step           Execute one CPU instruction
luna.run            Start execution
luna.pause          Pause execution
luna.disasm         Disassemble memory
luna.memory         Dump memory
luna.registers      Show CPU registers


---

🧱 Architecture Overview

HyperScan follows a hardware-oriented design, where each component behaves like a real device:

CPU – Instruction fetch, decode, execute

MIU – Memory Interface Unit

MemoryRegion – Base abstraction for all memory-mapped devices

I/O Devices – UART, Timers, SPU, VDU, CD-ROM

Interrupt Controller – Centralized IRQ handling

Debugger Layer – Non-invasive inspection & control


All components share a unified memory map and communicate through controlled interfaces.


---

📂 Project Structure

hyperscan-js-core/
├── cpu/            # CPU core and instruction logic
├── memory/         # Memory regions and IO mapping
├── spu/            # Audio processing unit
├── cdrom/          # ISO/UDF parsing and CD-ROM emulation
├── video/          # Video display unit
├── debugger/       # Disassembler and debugging tools
├── luna/           # Luna Console UI and command system
├── index.html      # Browser entry point
├── main.js         # Emulator bootstrap


---

🧪 Intended Use

Educational CPU and hardware emulation

Emulator architecture research

Reverse engineering practice

Browser-based debugging tools

Experimental game console emulation concepts



---

⚠️ Disclaimer

This project is experimental and under active development.

Accuracy is improving over time, but this emulator is not cycle-perfect and should not be used for production or commercial purposes.


---

📌 Roadmap (Planned)

Improved timing accuracy

Better IRQ prioritization

Cross-origin isolated mode (SharedArrayBuffer)

Performance optimizations

Expanded VDU rendering pipeline

Save states



---

📜 License

MIT License


---

👤 Author

Cleiton Cristiano

If you are interested in emulation, low-level systems, or browser-based hardware simulation, feel free to explore and contribute.


---

> HyperScan is not just an emulator — it is a laboratory.
