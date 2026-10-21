"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const scope = {};
scope.window = scope;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "china-holidays.js"), "utf8"), scope);
const H = scope.TodoHolidays;
assert.equal(H.getDay("2026-09-20").type, "work");
assert.equal(H.getDay("2026-09-25").name, "中秋节");
assert.equal(H.getDay("2026-09-27").type, "rest");
assert.equal(H.getDay("2026-09-28"), null);
assert.equal(H.getDay("2026-09-19"), null);
assert.equal(H.getDay("2026-10-10").type, "work");
assert.equal(H.getDay("2026-02-14").type, "work");
assert.equal(H.getDay("2026-02-15").type, "rest");
assert.equal(H.getDay("2026-02-23").type, "rest");
assert.equal(H.getDay("2025-01-28").type, "rest");
assert.equal(H.getDay("2025-02-04").type, "rest");
assert.equal(H.getDay("2025-02-08").type, "work");
assert.equal(H.getDay("2025-10-06").name, "国庆节、中秋节");
assert.equal(H.getDay("2027-01-01"), null);
assert.equal(H.getSource(2027), null);
assert.equal(H.getDay("not-a-date"), null);
for (const [year, expectedRest, expectedWork] of [[2025, 28, 5], [2026, 33, 6]]) {
  let rest = 0, work = 0;
  for (let day = new Date(year, 0, 1, 12); day.getFullYear() === year; day.setDate(day.getDate() + 1)) {
    const date = year + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
    const item = H.getDay(date);
    if (item?.type === "rest") rest++;
    if (item?.type === "work") work++;
  }
  assert.equal(rest, expectedRest);
  assert.equal(work, expectedWork);
}
console.log("China holiday schedule tests passed");
