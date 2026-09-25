/**
 * Browser app worker: runs the ankigammon Python package in Pyodide and
 * answers the page's requests through ankigammon.web.
 *
 * Pyodide 314 only loads in a module worker (pyodide.asm.mjs is an ES module).
 * The wheels are served from this site; build.py downloads and verifies them.
 */
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let ready = null;

function status(text) {
    postMessage({ type: "status", text: text });
}

async function fetchBytes(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Could not download " + url.split("/").pop() + " (HTTP " + r.status + ").");
    return new Uint8Array(await r.arrayBuffer());
}

async function start(wheels, base) {
    status("Loading Python…");
    const py = await loadPyodide();
    status("Loading AnkiGammon…");
    await py.loadPackage(["micropip", "pyyaml"]);
    py.FS.mkdirTree("/wheels");
    const paths = [];
    for (const name of wheels) {
        py.FS.writeFile("/wheels/" + name, await fetchBytes(base + name));
        paths.push("emfs:/wheels/" + name);
    }
    py.globals.set("wheel_paths", py.toPy(paths));
    await py.runPythonAsync(
        "import micropip\n" +
        "await micropip.install(list(wheel_paths), deps=False)\n" +
        "import warnings\n" +
        // genanki warns about every card whose scripts contain '<'.
        "warnings.filterwarnings('ignore', module='genanki')\n" +
        "from ankigammon import web\n" +
        "web.start('/tmp/ankigammon')\n"
    );
    return { py: py, web: py.pyimport("ankigammon.web") };
}

const commands = {
    async init(args) {
        ready = start(args.wheels, args.base);
        await ready;
        return true;
    },
    async loadFile(args) {
        const { py, web } = await ready;
        const path = "/tmp/in/" + args.name.replace(/[\\/]/g, "_");
        py.FS.mkdirTree("/tmp/in");
        py.FS.writeFile(path, new Uint8Array(args.bytes));
        const players = /\.xg$/i.test(args.name) ? JSON.parse(web.read_player_names(path)) : null;
        const loaded = JSON.parse(web.load_file(path, args.checker, args.cube, args.includeX, args.includeO));
        return Object.assign({ players: players }, loaded);
    },
    async loadText(args) {
        const { web } = await ready;
        return JSON.parse(web.load_text(args.text));
    },
    async configure(args) {
        const { web } = await ready;
        web.configure(JSON.stringify(args.settings));
        return true;
    },
    async preview(args) {
        const { web } = await ready;
        return JSON.parse(web.preview(args.index, args.showOptions, args.interactiveMoves));
    },
    async exportDeck(args) {
        const { py, web } = await ready;
        const path = web.export_apkg(JSON.stringify(args.indices), args.deckName,
            args.showOptions, args.interactiveMoves, args.useSubdecks);
        const bytes = py.FS.readFile(path);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
};

// Python exceptions arrive as a traceback; the page shows the final line,
// which for ankigammon.web's ValueErrors is the message written for users.
function lastLine(e) {
    const lines = String((e && e.message) || e).trim().split("\n");
    return lines[lines.length - 1].replace(/^[\w.]+(Error|Exception): /, "");
}

self.onmessage = async function (event) {
    const { id, cmd, args } = event.data;
    try {
        const result = await commands[cmd](args || {});
        const transfer = result instanceof ArrayBuffer ? [result] : [];
        postMessage({ type: "result", id: id, ok: true, result: result }, transfer);
    } catch (e) {
        postMessage({ type: "result", id: id, ok: false, error: lastLine(e), detail: String((e && e.message) || e) });
    }
};
