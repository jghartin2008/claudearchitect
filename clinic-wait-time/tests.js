// Acceptance tests that code can pass or fail. Run: node tests.js [path/to/index.html]
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const file = process.argv[2] || __dirname + "/index.html";
const html = fs.readFileSync(file, "utf8");

// Load the page's own logic block (including SRC) into a sandbox.
const load = (h) => {
  const start = h.indexOf("\nconst SRC ="), end = h.indexOf("\n//LOGIC-END");
  assert(start > 0 && end > start, "logic block not found");
  const ctx = vm.createContext({ JSON, Date, Math, Number, Intl, Array, Object, String });
  vm.runInContext(h.slice(start, end) + "\nthis.api={describe,nextState,validWait,validHours,buildPage,formatWait,cleanPhone,scheduleAt,hoursProblem,confirmInput,confirmLabel,S};", ctx);
  return ctx.api;
};
const { describe, nextState, buildPage, formatWait, cleanPhone, hoursProblem, confirmInput, confirmLabel, S } = load(html);
const J = (x) => JSON.parse(JSON.stringify(x)); // compare across the sandbox boundary

const TZ = "America/New_York";
const WK = [480, 1020];                                   // 8:00 AM to 5:00 PM
const HOURS = { sun: null, mon: WK, tue: WK, wed: WK, thu: WK, fri: WK, sat: [540, 780] };
const NOW = Date.parse("2026-11-20T15:00:00Z");           // Friday 10:00 AM Eastern, clinic open
const at = (iso) => Date.parse(iso);
const ago = (min, now = NOW) => new Date(now - min * 60000).toISOString();
const fmt = (t) => new Date(t).toISOString().slice(11, 16) + " UTC";
const st = (wait, min, extra, now = NOW) => ({ name: "Demo", phone: "(555) 010-0199", tz: TZ, hours: HOURS, wait, updatedAt: ago(min, now), ...extra });
const d = (s, now = NOW) => describe(s, now, fmt);
const hasDigit = (s) => /\d/.test(s);

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// AT2: normal wait shows estimate plus last-updated time
t("AT2 normal: 45 min wait shows estimate, clock time and relative age", () => {
  const r = d(st(45, 10));
  assert.strictEqual(r.kind, "wait");
  assert.strictEqual(r.headline, "About 45 minutes");
  assert.strictEqual(r.updated, "Updated 14:50 UTC (10 minutes ago)");
});
t("AT2 formatting: 1 min, 60 min, 75 min, 240 min", () => {
  assert.strictEqual(formatWait(1), "1 minute");
  assert.strictEqual(formatWait(60), "1 hour");
  assert.strictEqual(formatWait(75), "1 hour 15 minutes");
  assert.strictEqual(formatWait(240), "4 hours");
});
t("AT2 age text: just now, 1 minute, 59 minutes", () => {
  assert.match(d(st(30, 0)).updated, /just now/);
  assert.match(d(st(30, 1)).updated, /1 minute ago/);
  assert.match(d(st(30, 59)).updated, /59 minutes ago/);
});

// AT3: out of date
t("AT3 out of date: 61 minutes old shows no wait number and asks to call", () => {
  const r = d(st(45, 61));
  assert.strictEqual(r.kind, "stale");
  assert(!hasDigit(r.headline + r.detail), "no digits in headline/detail");
  assert(!/minute/.test(r.headline + r.detail));
  assert.match(r.detail, /call the clinic/i);
});
t("AT3 boundary: exactly 60 minutes is still fresh; 60 min 1 s is stale", () => {
  assert.strictEqual(d(st(45, 60)).headline, "About 45 minutes");
  assert.strictEqual(describe(st(45, 0, { updatedAt: new Date(NOW - 3601000).toISOString() }), NOW, fmt).kind, "stale");
});

// E1: closed by hours
t("E1 closed: outside hours shows closed and no wait number, even with a fresh wait stored", () => {
  const now = at("2026-11-20T12:30:00Z");                 // Friday 7:30 AM Eastern
  const r = d(st(45, 5, {}, now), now);
  assert.strictEqual(r.kind, "closed");
  assert.strictEqual(r.headline, S.closed);
  assert(!hasDigit(r.headline) && !/About/.test(r.detail));
  assert.strictEqual(r.detail, "Opens today at 8:00 AM. Please call the clinic for urgent help.");
});
t("E1 boundaries: open at the opening minute, closed at the closing minute", () => {
  const open = at("2026-11-20T13:00:00Z"), lastOpen = at("2026-11-20T21:59:00Z"), close = at("2026-11-20T22:00:00Z");
  assert.strictEqual(d(st(30, 1, {}, open), open).kind, "wait");
  assert.strictEqual(d(st(30, 1, {}, lastOpen), lastOpen).kind, "wait");
  assert.strictEqual(d(st(30, 1, {}, close), close).kind, "closed");
});
t("E1 next opening text: tomorrow, a weekday after a closed day, midnight", () => {
  const fri6pm = at("2026-11-20T23:00:00Z"), sat2pm = at("2026-11-21T19:00:00Z"), satMidnight = at("2026-11-21T05:00:00Z");
  assert.match(d(st(30, 1, {}, fri6pm), fri6pm).detail, /^Opens tomorrow at 9:00 AM\./);
  assert.match(d(st(30, 1, {}, sat2pm), sat2pm).detail, /^Opens Monday at 8:00 AM\./);
  assert.match(d(st(30, 1, {}, satMidnight), satMidnight).detail, /^Opens today at 9:00 AM\./);
});
t("E1 closed day: Sunday shows closed even at midday", () => {
  const sun = at("2026-11-22T17:00:00Z");                 // Sunday noon Eastern
  assert.strictEqual(d(st(30, 1, {}, sun), sun).kind, "closed");
});

// E7: time zones and daylight saving
t("E7 time zone: same instant is open in Eastern, closed in Pacific and Hawaii", () => {
  assert.strictEqual(d(st(30, 1, { tz: "America/New_York" })).kind, "wait");
  assert.strictEqual(d(st(30, 1, { tz: "America/Los_Angeles" })).kind, "closed");
  assert.strictEqual(d(st(30, 1, { tz: "Pacific/Honolulu" })).kind, "closed");
});
t("E7 daylight saving: 12:30 UTC is 8:30 in July (open) and 7:30 in December (closed)", () => {
  const jul = at("2026-07-01T12:30:00Z"), dec = at("2026-12-01T12:30:00Z");
  assert.strictEqual(d(st(30, 1, {}, jul), jul).kind, "wait");
  assert.strictEqual(d(st(30, 1, {}, dec), dec).kind, "closed");
});

// E8: unusable hours or time zone fail safe
t("E8 bad hours or time zone: shows no-data (call us), never a wait, never the viewer's local zone", () => {
  const bad = [
    st(30, 1, { hours: undefined }), st(30, 1, { hours: null }), st(30, 1, { hours: {} }),
    st(30, 1, { hours: { ...HOURS, mon: undefined } }), st(30, 1, { hours: { ...HOURS, mon: [600, 600] } }),
    st(30, 1, { hours: { ...HOURS, mon: [900, 600] } }), st(30, 1, { hours: { ...HOURS, mon: [0, 1441] } }),
    st(30, 1, { hours: { ...HOURS, mon: ["8", "17"] } }),
    st(30, 1, { tz: undefined }), st(30, 1, { tz: "" }), st(30, 1, { tz: "Not/AZone" }), st(30, 1, { tz: 5 })
  ];
  bad.forEach((s) => { const r = d(s); assert.strictEqual(r.kind, "nodata", JSON.stringify(s)); assert(!hasDigit(r.headline)); });
});

// E2: no data / bad data while open
t("E2 no data: empty, null, wrong types, bad wait or time all show no-data", () => {
  const bad = [undefined, null, {}, "x", 5, [],
    st(null, 5), st(undefined, 5), st(NaN, 5), st(-1, 5), st(241, 5), st(12.5, 5), st("45", 5),
    st(45, 5, { updatedAt: null }), st(45, 5, { updatedAt: "not a date" })];
  bad.forEach((s) => { const r = d(s); assert.strictEqual(r.kind, "nodata", JSON.stringify(s)); assert(!hasDigit(r.headline)); });
});
t("E4 clock skew: timestamp 4 min in the future is fine, 6 min in the future is no-data", () => {
  assert.strictEqual(d(st(30, -4)).kind, "wait");
  assert.strictEqual(d(st(30, -6)).kind, "nodata");
});

// E3: zero
t("E3 zero wait: says no wait, never 'About 0'", () => {
  const r = d(st(0, 5));
  assert.strictEqual(r.kind, "zero");
  assert.strictEqual(r.headline, S.noWait);
  assert(!/about 0|0 minute/i.test(r.headline));
});

// AT4/AT5: staff update validation
t("AT4 staff update: valid input produces state stamped with the post time", () => {
  const r = nextState({ name: "Demo", tz: TZ, hours: HOURS }, { wait: 45, phone: "(555) 010-0199" }, ago(0));
  assert(r.ok);
  assert.deepStrictEqual(J(r.state), { name: "Demo", phone: "(555) 010-0199", tz: TZ, hours: HOURS, override: null, wait: 45, updatedAt: ago(0) });
});
t("AT4 staff update: zero is accepted; new hours and time zone replace the old ones", () => {
  assert(nextState({ tz: TZ, hours: HOURS }, { wait: 0, phone: "" }, ago(0)).ok);
  const h = { ...HOURS, sun: [600, 720] };
  const r = nextState({ tz: TZ, hours: HOURS }, { wait: 5, phone: "", hours: h, tz: "America/Chicago" }, ago(0));
  assert(r.ok); assert.deepStrictEqual(J(r.state.hours), h); assert.strictEqual(r.state.tz, "America/Chicago");
});
t("AT5 staff input rejected: bad wait, bad phone, bad hours, bad time zone", () => {
  const prev = { tz: TZ, hours: HOURS };
  [-5, 241, 7.5, NaN, "30", null, undefined].forEach((w) => assert.strictEqual(nextState(prev, { wait: w, phone: "" }, ago(0)).error, "wait"));
  ["<script>", "call me maybe", "12", "1".repeat(30)].forEach((p) => assert.strictEqual(nextState(prev, { wait: 5, phone: p }, ago(0)).error, "phone"));
  [{ ...HOURS, mon: [NaN, NaN] }, { ...HOURS, mon: [600, 600] }, { ...HOURS, mon: [900, 600] }, { ...HOURS, mon: [0, 1441] }, { ...HOURS, mon: [-1, 600] }, { mon: WK }, "x", null]
    .forEach((h) => assert.strictEqual(nextState(prev, { wait: 5, phone: "", hours: h }, ago(0)).error, "hours"));
  ["", "Not/AZone", 5, null].forEach((z) => assert.strictEqual(nextState(prev, { wait: 5, phone: "", tz: z }, ago(0)).error, "tz"));
  assert.strictEqual(nextState({}, { wait: 5, phone: "" }, ago(0)).error, "hours", "no stored hours and none supplied");
});
t("AT5 privacy: posted state holds only the seven known fields, and hours only the seven days", () => {
  const r = nextState({ name: "Demo", tz: TZ, hours: HOURS, patient: "Jane Doe" },
    { wait: 5, phone: "", patient: "Jane Doe", hours: { ...HOURS, note: "Jane Doe" } }, ago(0));
  assert(r.ok);
  assert.deepStrictEqual(Object.keys(r.state).sort(), ["hours", "name", "override", "phone", "tz", "updatedAt", "wait"]);
  assert.deepStrictEqual(Object.keys(r.state.hours).sort(), ["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
});

// E5: republish integrity
const stateOf = (h) => JSON.parse(h.match(/<script id="state" type="application\/json">([\s\S]*?)<\/script>/)[1]);
t("E5 republish: page rebuilt with new state parses back to that state", () => {
  const s = { name: "A </script> & \"B\"", phone: "(555) 010-0199", tz: TZ, hours: HOURS, wait: 45, updatedAt: ago(0) };
  const h2 = buildPage(s);
  assert.deepStrictEqual(stateOf(h2), J(s));
  assert(h2.startsWith("<!doctype html>"));
  assert.strictEqual((h2.match(/<\/script>/g) || []).length, (html.match(/<\/script>/g) || []).length);
});
t("E5 republish: second-generation page still rebuilds (template survives republish)", () => {
  const s2 = { name: "x", phone: "", tz: TZ, hours: HOURS, wait: 10, updatedAt: ago(0) };
  const h2 = buildPage(s2), api2 = load(h2);
  const s3 = { name: "y", phone: "", tz: TZ, hours: HOURS, wait: 15, updatedAt: ago(0) };
  assert.deepStrictEqual(stateOf(api2.buildPage(s3)), s3);
  const strip = (h) => h.replace(/<script id="state"[\s\S]*?<\/script>/, "");
  assert.strictEqual(strip(api2.buildPage(s3)), strip(buildPage(s3)));
});


// E9: aging cue and plain wording
t("E9 aging: 44 min is plain, 45 to 60 min adds a call-to-confirm caution, 61 min withholds the number", () => {
  assert.strictEqual(d(st(30, 44)).detail, "");
  [45, 52, 60].forEach((m) => { const r = d(st(30, m)); assert.strictEqual(r.kind, "aging"); assert.strictEqual(r.headline, "About 30 minutes"); assert.match(r.detail, /call to confirm before you leave/); });
  const r = d(st(30, 61)); assert.strictEqual(r.kind, "stale"); assert.strictEqual(r.headline, "We don't have a current wait time");
});
t("E9 plain words: no idioms such as 'out of date' in patient text", () => {
  Object.values(S).forEach((v) => assert(!/out of date/i.test(v), v));
});

// E10: "closing early" and "closed all day" overrides expire at midnight clinic time
const fri = (override) => st(30, 1, { override });
const FRI_DATE = "2026-11-20";
t("E10 closing early: open before the early time, closed from it, says closed for the rest of today", () => {
  const before = at("2026-11-20T17:59:00Z"), after = at("2026-11-20T18:00:00Z");     // 12:59 and 1:00 PM Eastern
  assert.strictEqual(d(st(30, 1, { override: { date: FRI_DATE, closeAt: 780 } }, before), before).kind, "wait");
  const r = d(st(30, 1, { override: { date: FRI_DATE, closeAt: 780 } }, after), after);
  assert.strictEqual(r.kind, "closed");
  assert.strictEqual(r.detail, "Closed for the rest of today. Opens tomorrow at 9:00 AM. Please call the clinic for urgent help.");
});
t("E10 closed all day: closed at 10 AM with the next opening time", () => {
  const r = d(fri({ date: FRI_DATE, closeAt: null }));
  assert.strictEqual(r.kind, "closed"); assert.match(r.detail, /^Closed for the rest of today\. Opens tomorrow at 9:00 AM\./);
});
t("E10 expiry: yesterday's override is ignored; it never touches other days", () => {
  assert.strictEqual(d(fri({ date: "2026-11-19", closeAt: null })).kind, "wait");
  const sat = at("2026-11-21T15:00:00Z");                                           // Saturday 10 AM Eastern
  assert.strictEqual(d(st(30, 1, { override: { date: FRI_DATE, closeAt: null } }, sat), sat).kind, "wait");
});
t("E10 override cannot extend hours, and an early time before opening closes the day", () => {
  assert.strictEqual(d(fri({ date: FRI_DATE, closeAt: 1380 })).kind, "wait");        // 11 PM is later than 5 PM: no effect on the 10 AM check
  const late = at("2026-11-20T22:30:00Z");                                           // 5:30 PM, after normal close
  assert.strictEqual(d(st(30, 1, { override: { date: FRI_DATE, closeAt: 1380 } }, late), late).kind, "closed");
  assert.strictEqual(d(fri({ date: FRI_DATE, closeAt: 420 })).kind, "closed");       // 7:00 AM is before the 8:00 AM opening
});
t("E10 staff override stamps the clinic's local date, not the UTC date", () => {
  const r = nextState({ tz: TZ, hours: HOURS }, { wait: 5, phone: "", override: { mode: "closed" } }, "2026-11-21T03:00:00Z"); // Friday 10 PM Eastern
  assert(r.ok); assert.deepStrictEqual(J(r.state.override), { date: "2026-11-20", closeAt: null });
  assert.deepStrictEqual(J(nextState({ tz: TZ, hours: HOURS }, { wait: 5, phone: "", override: { mode: "early", closeAt: 780 } }, ago(0)).state.override), { date: FRI_DATE, closeAt: 780 });
  assert.strictEqual(nextState({ tz: TZ, hours: HOURS }, { wait: 5, phone: "", override: null }, ago(0)).state.override, null);
  assert.deepStrictEqual(J(nextState({ tz: TZ, hours: HOURS, override: { date: FRI_DATE, closeAt: null } }, { wait: 5, phone: "" }, ago(0)).state.override), { date: FRI_DATE, closeAt: null }, "omitted override is kept");
});
t("E10 bad overrides rejected; bad stored override is ignored, not trusted", () => {
  [{ mode: "early" }, { mode: "early", closeAt: NaN }, { mode: "early", closeAt: -1 }, { mode: "early", closeAt: 1441 }, { mode: "nope" }, "closed", 5]
    .forEach((o) => assert.strictEqual(nextState({ tz: TZ, hours: HOURS }, { wait: 5, phone: "", override: o }, ago(0)).error, "override", JSON.stringify(o)));
  assert.strictEqual(d(fri({ date: "tomorrow", closeAt: null })).kind, "wait");
  assert.strictEqual(d(fri("closed")).kind, "wait");
});

// E11: errors say what to fix
t("E11 error detail: the first bad day is named, Monday first", () => {
  assert.strictEqual(hoursProblem({ ...HOURS, wed: [900, 600] }), "Wednesday");
  assert.strictEqual(hoursProblem({ ...HOURS, sun: [900, 600], tue: [NaN, NaN] }), "Tuesday");
  assert.strictEqual(hoursProblem(HOURS), "");
  assert.strictEqual(nextState({ tz: TZ, hours: HOURS }, { wait: 5, phone: "", hours: { ...HOURS, thu: [600, 600] } }, ago(0)).day, "Thursday");
});


// E12: "Confirm: still N minutes" re-posts the current wait and nothing else
t("E12 confirm: only a valid posted wait can be confirmed", () => {
  [undefined, null, {}, "x", 5, st(null, 5), st(NaN, 5), st(-1, 5), st(241, 5), st(12.5, 5), st("45", 5)]
    .forEach((s) => assert.strictEqual(confirmInput(s), null, JSON.stringify(s)));
  assert.deepStrictEqual(J(confirmInput(st(0, 5))), { wait: 0, phone: "(555) 010-0199", hours: HOURS, tz: TZ });
});
t("E12 confirm: wording for a number, an hour, and zero", () => {
  assert.strictEqual(confirmLabel({ wait: 30 }), "Confirm: still about 30 minutes");
  assert.strictEqual(confirmLabel({ wait: 75 }), "Confirm: still about 1 hour 15 minutes");
  assert.strictEqual(confirmLabel({ wait: 0 }), "Confirm: still no wait");
});
t("E12 confirm: posting it changes only the post time; hours, zone, phone, name and override are kept", () => {
  const today = "2026-11-20";
  const before = st(45, 50, { override: { date: today, closeAt: 1000 } });
  const r = nextState(before, confirmInput(before), ago(0));
  assert(r.ok);
  const after = J(r.state), was = J(before);
  assert.notStrictEqual(after.updatedAt, was.updatedAt); assert.strictEqual(after.updatedAt, ago(0));
  ["name", "phone", "tz", "hours", "override", "wait"].forEach((k) => assert.deepStrictEqual(after[k], was[k], k));
});
t("E12 confirm: stored data that is no longer valid cannot be confirmed into a posted state", () => {
  const bad = st(45, 5, { hours: { ...HOURS, mon: [900, 600] } });
  assert.strictEqual(nextState(bad, confirmInput(bad), ago(0)).ok, false);
  const badTz = st(45, 5, { tz: "Not/AZone" });
  assert.strictEqual(nextState(badTz, confirmInput(badTz), ago(0)).ok, false);
});

// AT6: weight and no network
t("AT6 weight: page under 100 KB, no external resources or network calls", () => {
  assert(Buffer.byteLength(html) < 100 * 1024, "size " + Buffer.byteLength(html));
  assert(!/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, "")), "external URL found");
  assert(!/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|<img|<link|<script[^>]+src=/i.test(html), "network/asset call found");
  assert(!/localStorage|document\.cookie/.test(html), "persistent client storage found");
});

// AT7: accessibility basics that code can check
t("AT7 a11y: lang, zoom, live region, 48px targets (buttons, time inputs, select), focus, reduced motion", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(html), "zoom disabled");
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /\.call\s*\{[^}]*min-height:\s*3rem/);
  assert.match(html, /\.btn[^{]*\{[^}]*min-height:\s*3rem/);
  assert.match(html, /input\[type="tel"\], input\[type="time"\], select\s*\{[^}]*min-height:\s*3rem/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-reduced-motion/);
  assert(/font:\s*1rem/.test(html) && !/body\s*\{[^}]*font-size:\s*\d+px/.test(html), "base text must scale with user setting");
  assert((html.match(/aria-label="' \+ DAY_NAMES\[i\]/g) || []).length >= 2, "time inputs need labels");
  assert.match(html, /id="err" role="alert"/);
  assert.match(html, /id="msg" role="status"/);
});

// E6: safety line
t("E6 safety: emergency line is always rendered and phone link is tel:", () => {
  assert.match(html, /setText\(\$\("emergency"\), S\.emergency\)/);
  assert.strictEqual(S.emergency, "In an emergency, call 911.");
  assert.strictEqual(cleanPhone("(555) 010-0199"), "(555) 010-0199");
  assert.match(html, /"tel:" \+ p\.replace/);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "\n     ", e.message); }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
