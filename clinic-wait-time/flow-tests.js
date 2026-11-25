// Persona flow tests: drive the real page in a simulated browser and count taps.
// Run: node flow-tests.js path/to/index.html
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const { JSDOM } = require("jsdom");
const file = process.argv[2];
const html = fs.readFileSync(file, "utf8");
const ctx = vm.createContext({ JSON, Date, Math, Number, Intl, Array, Object, String });
vm.runInContext(html.slice(html.indexOf("\nconst SRC ="), html.indexOf("\n//LOGIC-END")) + "\nthis.buildPage=buildPage;", ctx);

const ALL = [0, 1439], hours = {}; ["sun","mon","tue","wed","thu","fri","sat"].forEach((d) => (hours[d] = ALL));
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const base = (extra) => ({ name: "Community Health Clinic (demo)", phone: "(555) 010-0199", tz: "America/New_York", hours, override: null, wait: 30, updatedAt: minsAgo(50), ...extra });
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const stateOf = (h) => JSON.parse(h.match(/<script id="state" type="application\/json">([\s\S]*?)<\/script>/)[1]);

// Open the page with a stubbed publish that records what staff would publish.
function open(state, hash, publish) {
  const published = [];
  const dom = new JSDOM(ctx.buildPage(state), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/" + hash,
    beforeParse(w) { w.claude = { use: async () => ({ publish: async (h) => { published.push(h); if (publish) return publish(h); } }) }; } });
  return { dom, d: dom.window.document, published, $: (id) => dom.window.document.getElementById(id) };
}
const tests = []; const t = (n, f) => tests.push([n, f]);

// ---- Luis: front-desk lead, busy phone, updates the wait about every hour ----
t("LUIS posting a new wait takes 2 taps (a preset, then Post update)", async () => {
  const p = open(base(), "#staff"); await tick();
  let taps = 0;
  [...p.d.querySelectorAll("#presets .btn")].find((b) => b.dataset.m === "45").click(); taps++;
  p.$("post").click(); taps++; await tick();
  assert.strictEqual(taps, 2); assert.strictEqual(p.published.length, 1);
  assert.strictEqual(stateOf(p.published[0]).wait, 45);
});
t("LUIS can confirm an unchanged wait with 1 tap, from the top of the staff view", async () => {
  const before = base(), p = open(before, "#staff"); await tick();
  const c = p.$("confirm");
  assert(c, "no Confirm button"); assert(!c.hidden, "Confirm button hidden");
  assert.strictEqual(c.textContent, "Confirm: still about 30 minutes");
  assert(p.$("confirm").compareDocumentPosition(p.$("wait-set")) & 4, "Confirm should come before the wait picker");
  c.click(); await tick();                                   // one tap
  assert.strictEqual(p.published.length, 1, "publish count");
  const after = stateOf(p.published[0]);
  assert.strictEqual(after.wait, 30);
  assert(Date.parse(after.updatedAt) > Date.parse(before.updatedAt) + 40 * 60000, "post time was not refreshed");
  for (const k of ["name", "phone", "tz", "hours", "override"]) assert.deepStrictEqual(after[k], before[k], k + " changed");
});
t("LUIS confirming keeps today's early-close override and the weekly hours", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const before = base({ override: { date: today, closeAt: 1439 } }), p = open(before, "#staff"); await tick();
  p.$("confirm").click(); await tick();
  const after = stateOf(p.published[0]);
  assert.deepStrictEqual(after.override, before.override); assert.deepStrictEqual(after.hours, before.hours);
});
t("LUIS sees no Confirm button when there is no wait to confirm, or the clinic is closed", async () => {
  let p = open(base({ wait: null, updatedAt: null }), "#staff"); await tick();
  assert(p.$("confirm") && p.$("confirm").hidden, "should be hidden with nothing posted");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  p = open(base({ override: { date: today, closeAt: null } }), "#staff"); await tick();
  assert(p.$("confirm") && p.$("confirm").hidden, "should be hidden when closed");
});
t("LUIS gets a clear message and nothing changes if his link is view-only", async () => {
  const p = open(base(), "#staff", () => { throw { code: "not_writer" }; }); await tick();
  p.$("confirm").click(); await tick();
  assert.match(p.$("err").textContent, /view-only, so nothing was posted/);
  assert.strictEqual(p.$("confirm").disabled, false);
});
t("LUIS is told about the Confirm button when the number is getting old", async () => {
  const p = open(base({ updatedAt: minsAgo(50) }), "#staff"); await tick();
  assert.match(p.$("nudge").textContent, /Confirm that the wait is unchanged/);
});

// ---- Walter: 71, low vision, largest text size, taps whatever looks tappable ----
t("WALTER a mis-tap on Staff shows the staff view, and Post does nothing but explain", async () => {
  const p = open(base({ updatedAt: minsAgo(5) }), "", () => { throw { code: "not_writer" }; }); await tick();
  assert(!p.$("stafflink").hidden); p.$("stafflink").click();
  p.dom.window.location.hash = "#staff"; p.dom.window.dispatchEvent(new p.dom.window.Event("hashchange")); await tick();
  assert(!p.$("staff").hidden, "staff view should open");
  p.$("post").click(); await tick();
  assert.match(p.$("err").textContent, /nothing was posted/);
  assert.strictEqual(p.$("headline").textContent, "About 30 minutes", "patient headline must not change");
});
t("WALTER text sizes all scale: no fixed pixel font sizes anywhere in the stylesheet", () => {
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  assert(!/font-size:\s*\d+(\.\d+)?px/.test(css), "px font size found");
});

// ---- Amara: limited English, Chrome Translate, prepaid data, checks on the bus ----
t("AMARA every word she must read is real text in the page (translatable), not generated by CSS or images", () => {
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  assert(!/content\s*:\s*["']/.test(css), "CSS-generated text found");
  assert(!/<img|<svg|background-image/.test(html), "image found");
  assert.match(html, /<html lang="en">/);
});
t("AMARA the page is small enough for a prepaid plan: under 100 KB, one request, no third-party calls", () => {
  assert(Buffer.byteLength(html) < 100 * 1024, "size " + Buffer.byteLength(html));
  assert(!/https?:\/\//i.test(html) && !/\bfetch\(|XMLHttpRequest|<script[^>]+src=/i.test(html));
});

(async () => {
  let fail = 0;
  for (const [n, f] of tests) { try { await f(); console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "\n     ", (e.message || e).toString().split("\n")[0]); } }
  console.log(`\n${tests.length - fail}/${tests.length} passed`);
  process.exit(0);
})();
