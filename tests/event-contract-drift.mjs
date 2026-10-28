// Contract drift + clipboard consumer + instance-request gate for clipboard.
//
// Pins the SHARED platform event client (spine AD-5, `ags-platform/ports/
// event-client`) against the canonical contract (`contracts/event-contract
// .json` / `.xml`), then exercises its subscribe-before-read hydration state
// machine with a scripted fake transport (no live bus), the app's pure
// clipboard item helpers, and the `ags request` dispatch mapping. Executed,
// never text-scanned.
//
// Run from the repo root:  make drift

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The ONE event client: the app-local event-bus core is gone, so this gate
// reads the platform's shared client through the dev `node_modules/ags-platform`
// shortcut `make ags-platform-dev` creates (its target sits outside
// node_modules so Node's type-stripping accepts the `.ts` source).
import * as core from "ags-platform/ports/event-client";
import * as clip from "../lib/clipboard-types.ts";
import * as req from "../lib/requests.ts";

const here = dirname(fileURLToPath(import.meta.url));

// The canonical contract lives in the sibling `contracts` repo (AGENTS: every
// app depends on `contracts`). `CONTRACTS_REPO` overrides the location (the
// Makefile and CI set it); otherwise search upward for a checkout, mirroring
// the repo's `icons-json-drift` cross-repo read. A missing contract FAILS --
// never a silent skip: a drift gate that cannot read the contract proves
// nothing.
function findContractsRepo() {
  const override = process.env.CONTRACTS_REPO;
  if (override) return override;
  let dir = here;
  for (let i = 0; i < 8; i += 1) {
    dir = dirname(dir);
    if (existsSync(join(dir, "contracts", "event-contract.json"))) {
      return join(dir, "contracts");
    }
  }
  return null;
}

const contractsRepo = findContractsRepo();
if (contractsRepo === null) {
  console.error(
    "FAIL: cannot find the `contracts` repo (set CONTRACTS_REPO=/path/to/contracts)",
  );
  process.exit(1);
}
const contractJson = JSON.parse(
  readFileSync(join(contractsRepo, "event-contract.json"), "utf-8"),
);
const contractXml = readFileSync(
  join(contractsRepo, "event-contract.xml"),
  "utf-8",
);

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`ok ${name}`);
  }
}

// ── Drift: every baked constant is a machine-definition value ────────────

check("bus name", core.EVENTS_BUS_NAME, contractJson.well_known_name);
check("object path", core.EVENTS_OBJECT_PATH, contractJson.object_path);
check("interface", core.EVENTS_INTERFACE, contractJson.interface);
check("DomainEvent signal", contractJson.signals[core.DOMAIN_EVENT_SIGNAL] !== undefined, true);
check("JobsCleared signal", contractJson.signals[core.JOBS_CLEARED_SIGNAL] !== undefined, true);
check("Control method", contractJson.methods[core.CONTROL_METHOD] !== undefined, true);
check("GetTopicState method", contractJson.methods[core.HYDRATION_METHOD] !== undefined, true);
check(
  "GetTopicState returns reserved _epoch/_seq",
  contractJson.methods.GetTopicState.out,
  ["state:a{sv}"],
);

check(
  "clipboard.update is a contract topic",
  contractJson.topics["clipboard.update"] !== undefined,
  true,
);
check(
  "clipboard.state is a contract topic",
  contractJson.topics["clipboard.state"] !== undefined,
  true,
);
check(
  "clipboard.update payload keys",
  Object.keys(contractJson.topics["clipboard.update"].payload).sort(),
  ["hash", "path", "preview", "type"],
);
check(
  "clipboard.update type enum",
  contractJson.topics["clipboard.update"].enum.type,
  ["text", "image", "link", "code", "color", "emoji"],
);
check(
  "clipboard.state payload keys",
  Object.keys(contractJson.topics["clipboard.state"].payload).sort(),
  ["job_id", "state"],
);
check(
  "clipboard.state enum",
  contractJson.topics["clipboard.state"].enum.state,
  ["idle", "running", "paused"],
);
check("xml declares the hub interface", contractXml.includes(core.EVENTS_INTERFACE), true);

// ── Subscribe-before-read hydration state machine (fake transport) ───────

function fakeTransport(states) {
  const calls = [];
  const signals = { onDomainEvent: null, onJobsCleared: null, onHubRestart: null };
  let state = { ...states };
  const transport = {
    startSignals(onDomainEvent, onJobsCleared, onHubRestart) {
      calls.push("startSignals");
      signals.onDomainEvent = onDomainEvent;
      signals.onJobsCleared = onJobsCleared;
      signals.onHubRestart = onHubRestart;
    },
    getTopicState(topic) {
      calls.push(`getTopicState:${topic}`);
      return topic in state ? state[topic] : null;
    },
    control(jobId, action) {
      calls.push(`control:${jobId}:${action}`);
    },
  };
  return { transport, calls, signals, setState: (next) => { state = { ...next }; } };
}

// Hydration on subscribe delivers the last payload immediately.
{
  const fake = fakeTransport({
    "clipboard.state": { state: "paused", job_id: "job-9", _epoch: 3, _seq: 12 },
  });
  const bus = new core.DomainEventBusCore(fake.transport);
  const seen = [];
  bus.subscribe("clipboard.state", (_t, payload) => seen.push(payload));
  check("subscribe starts signals before hydrating", fake.calls[0], "startSignals");
  check("subscribe hydrates", fake.calls[1], "getTopicState:clipboard.state");
  check("hydrated payload delivered", seen, [{ state: "paused", job_id: "job-9" }]);
  check("hydrated pair recorded", bus.hydratedPair("clipboard.state"), [3, 12]);
}

// A stale (epoch, seq) signal is dropped; a newer one is delivered once.
{
  const fake = fakeTransport({
    "clipboard.update": { type: "text", hash: "h0", path: "", preview: "old", _epoch: 2, _seq: 5 },
  });
  const bus = new core.DomainEventBusCore(fake.transport);
  const seen = [];
  bus.subscribe("clipboard.update", (_t, payload) => seen.push(payload.hash));
  fake.signals.onDomainEvent([
    "clipboard.update",
    ":1.1",
    4, // seq <= baseline 5 → stale
    2,
    { type: "text", hash: "stale", path: "", preview: "x" },
  ]);
  check("stale signal dropped", seen, ["h0"]);
  fake.signals.onDomainEvent([
    "clipboard.update",
    ":1.1",
    6,
    2,
    { type: "text", hash: "fresh", path: "", preview: "y" },
  ]);
  check("newer signal delivered", seen, ["h0", "fresh"]);
  check("baseline advanced", bus.hydratedPair("clipboard.update"), [2, 6]);
}

// Control routes through the transport (the single control path).
{
  const fake = fakeTransport({});
  const bus = new core.DomainEventBusCore(fake.transport);
  bus.subscribe("clipboard.state", () => {});
  bus.control("job-9", "pause");
  check("control issued", fake.calls.includes("control:job-9:pause"), true);
}

// ── Pure clipboard item helpers ──────────────────────────────────────────

check(
  "parseHistory skips malformed records",
  clip.parseHistory(JSON.stringify({ version: 1, items: [{ hash: "a", kind: "text", timestamp: 2 }, 7] }))
    .map((item) => item.hash),
  ["a"],
);
check("parseHistory tolerates corrupt JSON", clip.parseHistory("{ nope"), []);
check(
  "parseHistory sorts newest first",
  clip
    .parseHistory(
      JSON.stringify({
        version: 1,
        items: [
          { hash: "old", kind: "text", timestamp: 1 },
          { hash: "new", kind: "text", timestamp: 5 },
        ],
      }),
    )
    .map((item) => item.hash),
  ["new", "old"],
);
const imageItem = clip.itemFromPayload({ type: "image", hash: "h", path: "/tmp/i.png", preview: "" });
check("itemFromPayload maps an image", [imageItem.kind, imageItem.hash, imageItem.text, imageItem.path], ["image", "h", null, "/tmp/i.png"]);
check("unknown kind falls back to text", clip.itemFromPayload({ type: "bogus", hash: "h", path: "", preview: "p" }).kind, "text");
check("matchesQuery is case-insensitive", clip.matchesQuery({ hash: "h", kind: "text", timestamp: 1, favorite: false, text: "Hello World", path: null }, "hello"), true);
check("matchesQuery excludes non-matches", clip.matchesQuery({ hash: "h", kind: "text", timestamp: 1, favorite: false, text: "Hello", path: null }, "zzz"), false);
check("kindIcon differs per kind", clip.kindIcon("image") !== clip.kindIcon("link"), true);

// ── Instance request dispatch (`ags request`) ─────────────────────────────
//
// The requestHandler must be *executed*, not text-scanned: a handler that
// silently no-ops still bundles and typechecks. Drive the pure dispatcher with
// recording controls and assert the mapping AND the single `res(...)` response.
function dispatch(argv) {
  const calls = [];
  const responses = [];
  req.handleRequest(
    argv,
    (response) => responses.push(response),
    {
      show: () => calls.push("show"),
      hide: () => calls.push("hide"),
      toggle: () => calls.push("toggle"),
    },
  );
  return { calls, responses };
}

{
  const r = dispatch(["toggle"]);
  check("toggle request toggles the window", r.calls, ["toggle"]);
  check("toggle responds ok once", r.responses, ["ok"]);
}
{
  const r = dispatch(["show"]);
  check("show request shows the window", r.calls, ["show"]);
  check("show responds ok once", r.responses, ["ok"]);
}
{
  const r = dispatch(["hide"]);
  check("hide request hides the window", r.calls, ["hide"]);
  check("hide responds ok once", r.responses, ["ok"]);
}
{
  // The Esc keybind's name (the bar's): it must hide, or the overlay is stranded.
  const r = dispatch(["popup-close"]);
  check("popup-close hides the window", r.calls, ["hide"]);
  check("popup-close responds ok once", r.responses, ["ok"]);
}
{
  const r = dispatch(["bogus", "x"]);
  check("unknown request drives no window action", r.calls, []);
  check("unknown request names itself", r.responses, ["unknown request: bogus x"]);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
