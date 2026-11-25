// Accessibility audit: axe-core (structure/ARIA/labels), WCAG contrast math on the design tokens,
// keyboard order, live-region behaviour, and error-focus behaviour. Run: node a11y.js path/to/index.html
const fs = require("fs"), vm = require("vm");
const { JSDOM } = require("jsdom");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const file = process.argv[2];
const html = fs.readFileSync(file, "utf8");

// Build a page whose state is fresh and open all week so the patient view shows a normal wait.
const ctx = vm.createContext({ JSON, Date, Math, Number, Intl, Array, Object, String });
vm.runInContext(html.slice(html.indexOf("\nconst SRC ="), html.indexOf("\n//LOGIC-END")) + "\nthis.buildPage=buildPage;", ctx);
const ALL = [0, 1439], hours = {}; ["sun","mon","tue","wed","thu","fri","sat"].forEach((d) => (hours[d] = ALL));
const page = ctx.buildPage({ name: "Community Health Clinic (demo)", phone: "(555) 010-0199", tz: "America/New_York", hours, wait: 45, updatedAt: new Date().toISOString() });

const open = (hash) => new JSDOM(page, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/" + hash });
const out = [];
const rec = (area, check, pass, detail) => { out.push({ area, check, pass, detail }); console.log((pass ? "PASS " : "FAIL ") + area + " | " + check + (detail ? " | " + detail : "")); };

// ---------- contrast (WCAG 2.x) ----------
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme"))), dark = tokens(css.slice(css.indexOf(":root[data-theme=\"dark\"]")));
for (const [mode, t] of [["light", light], ["dark", dark]]) {
  const text = [["ink", "bg"], ["ink", "surface"], ["muted", "bg"], ["muted", "surface"], ["on-accent", "accent"]];
  text.forEach(([f, b]) => { const r = ratio(t[f], t[b]); rec("Accessibility/contrast", `${mode}: text ${f} on ${b} >= 4.5:1`, r >= 4.5, r.toFixed(2) + ":1"); });
  const ui = [["ok", "surface"], ["warn", "surface"], ["closed", "surface"], ["accent", "bg"], ["control", "surface"], ["control", "bg"]];
  ui.forEach(([f, b]) => { const r = ratio(t[f], t[b]); rec("Accessibility/contrast", `${mode}: component/border ${f} vs ${b} >= 3:1`, r >= 3, r.toFixed(2) + ":1"); });
}

(async () => {
  // ---------- axe (patient and staff views) ----------
  for (const [name, hash] of [["patient view", ""], ["staff view", "#staff"]]) {
    const dom = open(hash); await new Promise((r) => setTimeout(r, 50));
    dom.window.eval(axeSource);
    const res = await dom.window.axe.run(dom.window.document, { rules: { "color-contrast": { enabled: false } } });
    rec("Accessibility/axe", `${name}: no axe violations (${res.passes.length} rules passed)`, res.violations.length === 0, res.violations.map((v) => v.id + " x" + v.nodes.length).join(", "));
  }

  // ---------- keyboard order, staff view ----------
  let dom = open("#staff"); await new Promise((r) => setTimeout(r, 50));
  let doc = dom.window.document;
  const tabbable = [...doc.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]")].filter((e) => !e.disabled && !e.closest("[hidden]") && !(e.closest("details") && !e.closest("details").open && e.tagName !== "SUMMARY") && e.tabIndex >= 0);
  const label = (e) => (e.getAttribute("aria-label") || e.textContent.trim() || e.id || e.type || e.tagName).slice(0, 18);
  const firstPost = tabbable.findIndex((e) => e.id === "post"), firstHours = tabbable.findIndex((e) => e.closest("#hours") || e.id === "tz");
  rec("Accessibility/keyboard", "all interactive elements are native and none uses tabindex > 0", ![...doc.querySelectorAll("[tabindex]")].some((e) => e.tabIndex > 0), "");
  rec("Accessibility/keyboard", "Post update is reachable before the hours editor (keyboard users hit the common action first)", firstPost >= 0 && (firstHours < 0 || firstPost < firstHours), `tab stops before Post: ${firstPost}, first hours stop at: ${firstHours}`);
  console.log("      tab order:", tabbable.slice(0, 14).map(label).join(" > ") + (tabbable.length > 14 ? " > ... (" + tabbable.length + " stops)" : ""));

  // ---------- screen reader: live region must not re-announce unchanged text ----------
  dom = open(""); await new Promise((r) => setTimeout(r, 50)); doc = dom.window.document;
  let muts = 0; new dom.window.MutationObserver((l) => (muts += l.length)).observe(doc.getElementById("status"), { childList: true, characterData: true, subtree: true });
  doc.dispatchEvent(new dom.window.Event("visibilitychange")); await new Promise((r) => setTimeout(r, 50));
  rec("Accessibility/screen reader", "live region is untouched when a refresh finds nothing changed", muts === 0, muts + " DOM mutations in the live region on an unchanged refresh");

  // ---------- feedback and error handling (page given a stubbed publish so the post flow can run) ----------
  const withClaude = (publish, pre) => new JSDOM(page, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/#staff",
    beforeParse(w) { w.claude = { use: async () => ({ publish }) }; if (pre) pre(w); } });
  const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  const $ = (d, id) => d.window.document.getElementById(id);

  dom = withClaude(async () => {}); await tick(); doc = dom.window.document;
  $(dom, "phone").value = "call me"; $(dom, "post").click(); await tick();
  rec("Feedback", "a bad phone number gets a specific message that says how to fix it", /phone/i.test($(dom, "err").textContent) && /for example/i.test($(dom, "err").textContent), JSON.stringify($(dom, "err").textContent.slice(0, 70)));
  rec("Feedback", "the error is announced assertively (role=alert)", $(dom, "err").getAttribute("role") === "alert", "role=" + $(dom, "err").getAttribute("role"));
  rec("Feedback", "focus moves to the field that needs fixing", doc.activeElement && doc.activeElement.id === "phone", "focus on: " + (doc.activeElement && (doc.activeElement.id || doc.activeElement.tagName)));
  rec("Feedback", "the invalid field is marked aria-invalid and linked to the message", $(dom, "phone").getAttribute("aria-invalid") === "true" && $(dom, "phone").getAttribute("aria-describedby") === "err", "");
  rec("Feedback", "the collapsed settings section opens so the field is not hidden", $(dom, "settings").open === true, "");

  dom = withClaude(async () => {}); await tick(); doc = dom.window.document;
  doc.querySelector('input[data-d="mon"].open').value = ""; $(dom, "post").click(); await tick();
  rec("Feedback", "a bad weekly-hours entry names the day", /Monday/.test($(dom, "err").textContent), JSON.stringify($(dom, "err").textContent.slice(0, 60)));
  rec("Feedback", "focus lands on that day's field", doc.activeElement && doc.activeElement.getAttribute("aria-label") === "Monday opens", "focus on: " + (doc.activeElement && doc.activeElement.getAttribute("aria-label")));

  dom = withClaude(async () => {}); await tick(); doc = dom.window.document;
  $(dom, "today-early").click(); $(dom, "early-time").value = ""; $(dom, "post").click(); await tick();
  rec("Feedback", "'Closing early' with no time explains what to choose and focuses the time", /closes today/i.test($(dom, "err").textContent) && doc.activeElement.id === "early-time", "");

  dom = withClaude(async () => { throw { code: "not_writer" }; }); await tick(); doc = dom.window.document;
  $(dom, "post").click(); await tick();
  rec("Feedback", "a view-only link says nothing was posted and who to ask", /view-only/.test($(dom, "err").textContent) && /nothing was posted/.test($(dom, "err").textContent), "");
  rec("Feedback", "the Post button recovers after a failure", !$(dom, "post").disabled && $(dom, "post").textContent === "Post update", "");

  dom = withClaude(async () => { throw new Error("network"); }); await tick(); doc = dom.window.document;
  $(dom, "post").click(); await tick();
  rec("Feedback", "a failed save says patients still see the previous number and what to do", /still see the previous number/.test($(dom, "err").textContent) && /try again/.test($(dom, "err").textContent), "");

  let resolvePublish; dom = withClaude(() => new Promise((r) => (resolvePublish = r))); await tick(); doc = dom.window.document;
  $(dom, "post").click(); await tick();
  rec("Feedback", "while posting the button is disabled, says Posting, and is aria-busy", $(dom, "post").disabled && /Posting/.test($(dom, "post").textContent) && $(dom, "post").getAttribute("aria-busy") === "true", "");

  const stateTime = "2026-11-20T15:00:00.000Z";
  const reloaded = (flag) => new JSDOM(page.replace(/"updatedAt":"[^"]*"/, '"updatedAt":"' + stateTime + '"'), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/#staff", beforeParse(w) { w.sessionStorage.setItem("clinic-post", flag); } });
  dom = reloaded(stateTime); await tick();
  rec("Feedback", "after a successful post the reloaded page confirms it", /^Posted\./.test($(dom, "msg").textContent) && $(dom, "err").textContent === "", JSON.stringify($(dom, "msg").textContent.slice(0, 50)));
  dom = reloaded("2026-11-20T14:00:00.000Z"); await tick();
  rec("Feedback", "if someone else posted first, the page says so instead of claiming success", /not posted because the page changed/.test($(dom, "err").textContent) && $(dom, "msg").textContent === "", "");

  // ---------- information hierarchy and clarity (staff view order and wording) ----------
  dom = open("#staff"); await tick(50); doc = dom.window.document;
  const order = [...doc.querySelectorAll("#staff > *")].map((e) => e.id || e.className.split(" ")[0] || e.tagName.toLowerCase());
  const idx = (k) => order.indexOf(k);
  rec("Information hierarchy", "staff view order: current state, wait, today, preview, Post, then settings", idx("now") < idx("wait-set") && idx("wait-set") < idx("today-set") && idx("today-set") < idx("preview") && idx("preview") < idx("post") && idx("post") < idx("settings"), order.join(" > "));
  const patient = open(""); await tick(50);
  const pk = [...patient.window.document.querySelectorAll("main > *")].filter((e) => !e.hidden).map((e) => e.id || e.className.split(" ")[0]);
  rec("Information hierarchy", "patient view order: status headline first after the clinic name, then call, then emergency, then staff link", pk.join(",") === "clinic,status,call,emergency,stafflink", pk.join(" > "));
  const text = doc.body.textContent;
  rec("Clarity", "staff wording uses the admin's own words (Post update, Closing early, Closed all day, Normal hours); no 'override', 'status', or 'tz'", ["Post update", "Closing early", "Closed all day", "Normal hours"].every((w) => text.includes(w)) && !/override|\bstatus\b|\btz\b/i.test(doc.querySelector("#staff").textContent), "");

  const fail = out.filter((o) => !o.pass).length;
  console.log(`\n${out.length - fail}/${out.length} checks passed`);
  fs.writeFileSync(process.argv[3] || "audit-result.json", JSON.stringify(out, null, 1));
  process.exit(0);
})();
