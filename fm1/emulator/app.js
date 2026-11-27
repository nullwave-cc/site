// made by tools/build.py: the emulator's parts (fm1.toml emu) and the app's own part of the page
import { compose } from "./parts/parts.js?v=0.1.1-1ba2bb13";
import * as midi from "./parts/midi.js?v=0.1.1-1ba2bb13";
import * as port from "./parts/port.js?v=0.1.1-1ba2bb13";
const own = {};
export const { attach, message } = compose({ midi, port }, own, { id: "nullwave", name: "nullwave", backupExt: "bak" });
