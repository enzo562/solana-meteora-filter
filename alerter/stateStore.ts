import { promises as fs } from "node:fs";
import path from "node:path";

interface SeenPoolsState {
    addresses: string[];
    updatedAt: number;
}

// L'ordre du tableau est chronologique (plus ancien -> plus récent) : un Set JS itère
// dans l'ordre d'insertion, ce qui permet une éviction FIFO simple (RG-09).
export async function readSeenAddresses(filePath: string): Promise<Set<string>> {
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw) as SeenPoolsState;
        return new Set(parsed.addresses ?? []);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Set();
        throw err;
    }
}

export async function writeSeenAddresses(
    filePath: string,
    addresses: Iterable<string>,
    max: number
): Promise<void> {
    let list = Array.from(addresses);
    if (list.length > max) {
        list = list.slice(list.length - max);
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const state: SeenPoolsState = { addresses: list, updatedAt: Date.now() };
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}
