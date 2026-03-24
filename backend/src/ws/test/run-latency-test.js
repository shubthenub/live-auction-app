import { io } from "socket.io-client";
import fs from "fs";
import readline from "readline";

// ---------------- CONFIG ----------------
const TARGET_URL = "http://localhost:3000";
const AUCTION_ID = "69bbec96919003e7227b7193";
const CONCURRENCY = parseInt(process.argv[2]) || 1000;

// Phase durations
const SUSTAIN_DURATION_MS = 30000;
const SPIKE_DURATION_MS = 3000;

// Rates
const SUSTAIN_INTERVAL = 1000;
const SPIKE_INTERVAL = 50;

// Ramp
const RAMP_RATE = 150;

// Personas
const SNIPER_PERCENTAGE = 0.15;

// ---------------- GLOBAL CLOCK ----------------
const GLOBAL_START = Date.now() + 5000; // 5 sec buffer for all clients to connect
const SUSTAIN_END = GLOBAL_START + SUSTAIN_DURATION_MS;
const SPIKE_END = SUSTAIN_END + SPIKE_DURATION_MS;

// ---------------- METRICS ----------------
const sustainLatencies = [];
const spikeLatencies = [];

let sustainFirst = null;
let sustainLast = null;

let spikeFirst = null;
let spikeLast = null;

let successCount = 0;
let errorCount = 0;

// ---------------- HELPERS ----------------
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function percentile(arr, p) {
    if (!arr.length) return 0;
    const sample = arr.length > 50000 ? arr.filter((_, i) => i % 5 === 0) : arr;
    const sorted = [...sample].sort((a, b) => a - b);
    return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

async function loadUsers(limit) {
    const users = [];
    const rl = readline.createInterface({
        input: fs.createReadStream("mock-users.csv"),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        const [id, token] = line.split(",");
        users.push({ id, token });
        if (users.length >= limit) break;
    }
    return users;
}

// ---------------- CLIENT ----------------
async function runClient(user) {
    return new Promise((resolve) => {
        let localPrice = 5000;

        const socket = io(TARGET_URL, {
            auth: { token: user.token },
            transports: ["websocket"],
            forceNew: true,
            reconnection: false
        });

        const isSniper = Math.random() < SNIPER_PERCENTAGE;

        socket.on("connect", async () => {
            // jittered updates
            socket.on("bidUpdate", (data) => {
                setTimeout(() => {
                    if (data.currentPrice > localPrice) {
                        localPrice = data.currentPrice;
                    }
                }, Math.random() * 50);
            });

            socket.emit("joinAuction", { auctionId: AUCTION_ID });

            // Wait until global test start
            while (Date.now() < GLOBAL_START) {
                await sleep(50);
            }

            // ---------------- SUSTAIN ----------------
            while (Date.now() < SUSTAIN_END) {
                const bid = localPrice + Math.floor(Math.random() * 50) + 100;
                const start = Date.now();

                socket.emit("placeBid", { auctionId: AUCTION_ID, amount: bid }, (res) => {
                    const latency = Date.now() - start;
                    sustainLatencies.push(latency);

                    if (!sustainFirst) sustainFirst = Date.now();
                    sustainLast = Date.now();

                    if (res?.success) successCount++;
                    else errorCount++;
                });

                await sleep(SUSTAIN_INTERVAL);
            }

            // ---------------- SPIKE ----------------
            if (isSniper) {
                while (Date.now() < SPIKE_END) {
                    const bid = localPrice + Math.floor(Math.random() * 500) + 1000;
                    const start = Date.now();

                    socket.emit("placeBid", { auctionId: AUCTION_ID, amount: bid }, (res) => {
                        const latency = Date.now() - start;
                        spikeLatencies.push(latency);

                        if (!spikeFirst) spikeFirst = Date.now();
                        spikeLast = Date.now();

                        if (res?.success) successCount++;
                        else errorCount++;
                    });

                    await sleep(SPIKE_INTERVAL);
                }
            }

            socket.disconnect();
            resolve();
        });

        socket.on("connect_error", () => resolve());
    });
}

// ---------------- RUNNER ----------------
async function start() {
    console.log(`Hybrid test: ${CONCURRENCY} users`);

    const users = await loadUsers(CONCURRENCY);
    const promises = [];

    // ramp connections
    for (let i = 0; i < users.length; i++) {
        promises.push(runClient(users[i]));
        await sleep(1000 / RAMP_RATE);
    }

    await Promise.all(promises);

    console.log("\n===== FINAL RESULT =====");

    // Sustained
    const sustainDuration = (sustainLast - sustainFirst) / 1000;
    const sustainOPS = sustainLatencies.length / sustainDuration;

    console.log("\n--- SUSTAIN PHASE ---");
    console.log(`Ops: ${sustainLatencies.length}`);
    console.log(`Duration: ${sustainDuration.toFixed(2)} sec`);
    console.log(`Throughput: ${sustainOPS.toFixed(0)} ops/sec`);
    console.log(`p50: ${percentile(sustainLatencies, 50)} ms`);
    console.log(`p95: ${percentile(sustainLatencies, 95)} ms`);
    console.log(`p99: ${percentile(sustainLatencies, 99)} ms`);

    // Spike
    const spikeDuration = (spikeLast - spikeFirst) / 1000;
    const spikeOPS = spikeLatencies.length / spikeDuration;

    console.log("\n--- SPIKE PHASE ---");
    console.log(`Ops: ${spikeLatencies.length}`);
    console.log(`Duration: ${spikeDuration.toFixed(2)} sec`);
    console.log(`Throughput: ${spikeOPS.toFixed(0)} ops/sec`);
    console.log(`p50: ${percentile(spikeLatencies, 50)} ms`);
    console.log(`p95: ${percentile(spikeLatencies, 95)} ms`);
    console.log(`p99: ${percentile(spikeLatencies, 99)} ms`);

    console.log("\n--- OVERALL ---");
    console.log(`Success: ${successCount}`);
    console.log(`Rejected: ${errorCount}`);
}

start();