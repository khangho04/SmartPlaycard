/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const core = require("../admin-backend/core.cjs");
const payment = (overrides = {}) => ({
  verified: true,
  kind: "payment",
  status: "success",
  deviceId: "GAME001",
  branchId: "B01",
  paymentMethod: "bank",
  amount: 20000,
  occurredAt: Date.parse("2026-09-27T17:00:00Z"),
  ...overrides,
});

test("verified payments aggregate exactly once across trigger retries", () => {
  const first = core.applyLedger(null, "pay1", payment(), 100);
  assert.equal(core.applyLedger(first, "pay1", payment(), 200), undefined);
  const second = core.applyLedger(first, "pay2", payment(), 300);
  const sum = core.sumDays(
    { "2026-09-28": second },
    "2026-09-28",
    "2026-09-28",
    "",
    "",
  );
  assert.equal(sum.gross, 40000);
  assert.equal(sum.success, 2);
});
test("simulation, unverified, fractional, negative and nonfinite money are rejected", () => {
  for (const values of [
    { verified: false },
    { paymentMethod: "simulation" },
    { amount: -1 },
    { amount: 0.5 },
    { amount: Infinity },
    { amount: NaN },
    { occurredAt: 0 },
  ])
    assert.throws(() => core.applyLedger(null, "id1", payment(values), 1));
});
test("refunds count on refund day; failures and pending never create revenue; sessions are separate", () => {
  let day = core.applyLedger(null, "pay1", payment(), 1);
  day = core.applyLedger(day, "fail1", payment({ status: "failed" }), 2);
  day = core.applyLedger(day, "pending1", payment({ status: "pending" }), 3);
  day = core.applyLedger(
    day,
    "session1",
    payment({ kind: "session", amount: 0, durationSeconds: 180 }),
    4,
  );
  const refund = core.applyLedger(
    null,
    "refund1",
    payment({
      kind: "refund",
      originalPaymentId: "pay1",
      occurredAt: Date.parse("2026-09-28T17:00:00Z"),
    }),
    5,
  );
  const days = { "2026-09-28": day, "2026-09-29": refund };
  const sum = core.sumDays(days, "2026-09-28", "2026-09-28", "", "");
  assert.deepEqual(sum, {
    gross: 20000,
    refunds: 0,
    success: 1,
    failed: 1,
    pending: 1,
    sessions: 1,
    duration: 180,
  });
  assert.equal(
    core.sumDays(days, "2026-09-29", "2026-09-29", "", "").refunds,
    20000,
  );
});
test("Vietnam midnight, month/year boundary and leap-year ranges", () => {
  assert.equal(core.dayKey(Date.parse("2026-12-31T16:59:59Z")), "2026-12-31");
  assert.equal(core.dayKey(Date.parse("2026-12-31T17:00:00Z")), "2027-01-01");
  assert.equal(core.validRange("2024-01-01", "2024-12-31"), true);
  assert.equal(core.validRange("2024-01-01", "2025-01-01"), false);
  assert.equal(core.validRange("2026-02-30", "2026-03-01"), false);
  assert.equal(core.validRange("2026-09-29", "2026-09-28"), false);
});
test("device moves preserve original revenue attribution to each branch", () => {
  let day = core.applyLedger(null, "id1", payment(), 1);
  day = core.applyLedger(
    day,
    "id2",
    payment({ branchId: "B02", amount: 50000 }),
    2,
  );
  const days = { "2026-09-28": day };
  assert.equal(
    core.sumDays(days, "2026-09-28", "2026-09-28", "B01", "GAME001").gross,
    20000,
  );
  assert.equal(
    core.sumDays(days, "2026-09-28", "2026-09-28", "B02", "GAME001").gross,
    50000,
  );
  assert.equal(
    core.sumDays(days, "2026-09-28", "2026-09-28", "B03", "").gross,
    0,
  );
});
test("role matrix denies unauthenticated and unauthorized changes", () => {
  for (const action of [
    "device",
    "branch",
    "alert",
    "maintenance",
    "settings",
    "access",
  ]) {
    assert.equal(core.allowed(null, action), false);
    assert.equal(core.allowed({ role: "viewer" }, action), false);
    assert.equal(core.allowed({ role: "accountant" }, action), false);
  }
  assert.equal(core.allowed({ role: "operations" }, "access"), false);
  assert.equal(core.allowed({ role: "technician" }, "device"), false);
  assert.equal(core.allowed({ role: "technician" }, "alert"), true);
  assert.equal(core.inScope({ branchId: "B01" }, "B02"), false);
  assert.equal(core.inScope({ branchId: "" }, "B02"), true);
});
test("mutation validation strips injected permissions and finance fields", () => {
  assert.deepEqual(
    core.cleanMutation("device", {
      name: "Game",
      note: "",
      branchId: "B01",
      role: "super_admin",
      gross: 50000,
    }),
    { name: "Game", note: "", branchId: "B01" },
  );
  for (const key of ["../x", "__proto__", "constructor", "", "foo/bar"])
    assert.equal(core.validKey(key), false);
  assert.throws(() => core.cleanMutation("settings", { offlineSeconds: 0 }));
  assert.throws(() =>
    core.cleanMutation("access", {
      email: "x@test.local",
      role: "super_admin",
      branchId: "B01",
    }),
  );
});

function loadClientModel() {
  const module = { exports: {} };
  const filename = path.join(__dirname, "../src/services/admin/model.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("module", "exports", source)(module, module.exports);
  return module.exports;
}
test("heartbeat expires without a new server event; zero/future clock is unknown", () => {
  const { deviceState } = loadClientModel();
  const now = 1800000000000;
  assert.equal(
    deviceState({ lastSeenEpoch: 0, status: "online" }, now, 120),
    "unknown",
  );
  assert.equal(
    deviceState(
      { lastSeenEpoch: now / 1000 + 120, status: "online" },
      now,
      120,
    ),
    "unknown",
  );
  assert.equal(
    deviceState(
      { lastSeenEpoch: now / 1000 - 121, status: "online" },
      now,
      120,
    ),
    "offline",
  );
  assert.equal(
    deviceState({ lastSeenEpoch: now / 1000 - 10, playing: true }, now, 120),
    "playing",
  );
  assert.equal(
    deviceState({ lastSeenEpoch: now / 1000 - 10, status: "error" }, now, 120),
    "error",
  );
});
test("CSV escapes quotes/newlines and neutralizes spreadsheet formulas", () => {
  const { csv, growth } = loadClientModel();
  const result = csv([["=cmd()", 'a"b', "line\nbreak", 0]]);
  assert.equal(result, '\uFEFF"\'=cmd()","a""b","line\nbreak","0"');
  assert.equal(growth(100, 0), "Kỳ trước chưa phát sinh");
  assert.equal(growth(0, 0), "Không thay đổi");
});

// Exercise actual callable handlers against an in-memory Admin SDK.
function backendFixture() {
  const state = {
    admin: {
      operations: {
        access: {
          root: { role: "super_admin", email: "root@test", branchId: "" },
          ops: { role: "operations", email: "ops@test", branchId: "B01" },
          viewer: { role: "viewer", email: "viewer@test", branchId: "B01" },
        },
        devices: { GAME001: { branchId: "B01" }, GAME002: { branchId: "B02" } },
        branches: { B01: { name: "One" }, B02: { name: "Two" } },
      },
    },
    devices: { GAME001: { name: "One" }, GAME002: { name: "Two" } },
  };
  function valueAt(p) {
    if (p === '/') return state;
    return p.split("/").reduce((v, k) => v?.[k], state) ?? null;
  }
  function snapshot(value) {
    return {
      val: () => structuredClone(value),
      exists: () => value != null,
      child: (p) => snapshot(p.split("/").reduce((v, k) => v?.[k], value)),
    };
  }
  function ref(p) {
    const r = {
      get: async () => snapshot(valueAt(p)),
      orderByKey: () => r,
      limitToFirst: () => r,
      transaction: async (callback) => {
        // Firebase may first invoke updater with an empty local cache.
        const initial = callback(null);
        if (initial === undefined)
          return { committed: false, snapshot: snapshot(null) };
        const result = callback(structuredClone(valueAt(p)));
        if (result === undefined)
          return { committed: false, snapshot: snapshot(valueAt(p)) };
        if (p === '/') {
          Object.assign(state, result);
          return { committed: true, snapshot: snapshot(result) };
        }
        const keys = p.split("/");
        const leaf = keys.pop();
        let parent = state;
        for (const key of keys) parent = parent[key] ??= {};
        parent[leaf] = result;
        return { committed: true, snapshot: snapshot(result) };
      },
    };
    return r;
  }
  const handlers = {};
  const requireMock = (name) => {
    if (name === "firebase-admin/app") return { initializeApp() {} };
    if (name === "firebase-admin/auth")
      return {
        getAuth: () => ({ getUserByEmail: async () => ({ uid: "target" }) }),
      };
    if (name === "firebase-admin/database")
      return { getDatabase: () => ({ ref }) };
    if (name === "firebase-functions/v2/https")
      return {
        onCall: (_, fn) => fn,
        HttpsError: class extends Error {
          constructor(code, msg) {
            super(msg);
            this.code = code;
          }
        },
      };
    if (name === "firebase-functions/v2/database")
      return { onValueCreated: (_, fn) => fn, onValueWritten: (_, fn) => fn };
    if (name === "firebase-functions/v2/scheduler")
      return { onSchedule: (_, fn) => fn };
    if (name === "./core.cjs") return core;
    if (name === "./account-access.cjs") return require("../admin-backend/account-access.cjs");
    if (name === "./platform.cjs") return require("../admin-backend/platform.cjs");
    if (name === "./account-identity.cjs") return require("../admin-backend/account-identity.cjs");
    return require(name);
  };
  new Function(
    "require",
    "exports",
    fs.readFileSync(path.join(__dirname, "../admin-backend/index.cjs"), "utf8"),
  )(requireMock, handlers);
  return { handlers, state };
}
test("callables reject unauthenticated users and scope snapshot on the server", async () => {
  const { handlers } = backendFixture();
  await assert.rejects(
    handlers.adminSnapshot({}),
    (e) => e.code === "unauthenticated",
  );
  await assert.rejects(
    handlers.adminSnapshot({ auth: { uid: "missing" } }),
    (e) => e.code === "permission-denied",
  );
  const result = await handlers.adminSnapshot({ auth: { uid: "viewer" } });
  assert.deepEqual(
    result.devices.map((d) => d.id),
    ["GAME001"],
  );
  assert.equal(result.users.length, 0);
  assert.equal(result.audit.length, 0);
});

test('grant and revoke synchronize account access with role and audit', async () => {
  const { handlers, state } = backendFixture();
  state.accounts = { target: { access: 'user', username: 'target', card: '' } };
  const request = { auth: { uid: 'root' }, data: { action: 'access', id: 'new', value: { email: 'target', role: 'viewer', branchId: 'B01' } } };
  await handlers.adminMutate(request);
  assert.equal(state.accounts.target.access, 'admin');
  const snapshot = await handlers.adminSnapshot({ auth: { uid: 'target' } });
  assert.equal(snapshot.access.role, 'viewer');
  assert.deepEqual(snapshot.devices.map(d => d.id), ['GAME001']);
  await handlers.adminMutate({ ...request, data: { ...request.data, id: 'target', revoke: true } });
  assert.equal(state.accounts.target.access, 'user');
  assert.equal(state.admin.operations.access.target, undefined);
  assert.equal(Object.keys(state.admin.operations.audit).length, 2);
  await assert.rejects(handlers.adminSnapshot({ auth: { uid: 'target' } }), e => e.code === 'permission-denied');
});
test('default admin cannot be demoted or revoked by another super admin', async () => {
  const { handlers, state } = backendFixture();
  state.accounts = { target: { access: 'admin', isDefaultAdmin: true } };
  state.admin.operations.access.target = { email: 'target@test', role: 'super_admin', branchId: '' };
  const request = { auth: { uid: 'root' }, data: { action: 'access', id: 'target', value: { email: 'target@test', role: 'viewer', branchId: '' } } };
  await assert.rejects(handlers.adminMutate(request), e => e.code === 'failed-precondition');
  await assert.rejects(handlers.adminMutate({ ...request, data: { ...request.data, revoke: true } }), e => e.code === 'failed-precondition');
  assert.equal(state.admin.operations.access.target.role, 'super_admin');
  assert.equal(state.accounts.target.access, 'admin');
});

test('default bootstrap creates admin with initial password and forces first change', async () => {
  let state = { accounts: {} };
  let created;
  const logs = [];
  const auth = { createUser: async value => { if (created) throw Error('email-already-exists'); created = value; return { uid: 'default-admin', email: value.email }; } };
  const db = { ref: p => ({
    get: async () => ({ val: () => state.admin?.operations?.access || null }),
    transaction: async callback => {
      assert.equal(p, '/');
      state = callback(state);
      return { committed: !!state };
    },
  }) };
  const source = fs.readFileSync(path.join(__dirname, '../admin-backend/bootstrap.cjs'), 'utf8').split('\nmain()')[0];
  const mock = name => {
    if (name === 'firebase-admin/app') return { initializeApp() {}, applicationDefault: () => ({ getAccessToken: async () => ({}) }) };
    if (name === 'firebase-admin/auth') return { getAuth: () => auth };
    if (name === 'firebase-admin/database') return { getDatabase: () => db };
    if (name === './account-identity.cjs') return require('../admin-backend/account-identity.cjs');
    return require(name);
  };
  const main = new Function('require', 'process', 'console', source + '\nreturn main;')(mock,
    { argv: ['node', 'bootstrap', '--default', 'https://test.invalid'] }, { log: value => logs.push(value) });
  await main();
  assert.equal(created.email, 'admin@accounts.smartplaycard.invalid');
  assert.equal(created.password, '123456');
  assert.equal(state.accounts['default-admin'].access, 'admin');
  assert.equal(state.accounts['default-admin'].username, 'admin');
  assert.equal(state.accounts['default-admin'].requiresPasswordChange, true);
  assert.equal(state.accounts['default-admin'].isDefaultAdmin, true);
  assert.equal(state.admin.operations.access['default-admin'].role, 'super_admin');
  assert.ok(logs.some(value => value.includes(created.password)));
  await assert.rejects(main(), /email-already-exists/);
});

test("backend mutation and audit commit together; scope and self escalation are denied", async () => {
  const { handlers, state } = backendFixture();
  const request = {
    auth: { uid: "ops" },
    data: {
      action: "device",
      id: "GAME001",
      value: { name: "Changed", branchId: "B01", note: "ok" },
    },
  };
  await handlers.adminMutate(request);
  assert.equal(state.admin.operations.devices.GAME001.name, "Changed");
  assert.equal(
    Object.values(state.admin.operations.audit)[0].after.name,
    "Changed",
  );
  await assert.rejects(
    handlers.adminMutate({
      ...request,
      data: { ...request.data, id: "GAME002" },
    }),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    handlers.adminMutate({
      ...request,
      data: {
        action: "access",
        id: "ops",
        value: { role: "super_admin", email: "ops@test", branchId: "" },
      },
    }),
    (e) => e.code === "permission-denied",
  );
  assert.equal(Object.keys(state.admin.operations.audit).length, 1);
});
