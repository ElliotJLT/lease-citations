// One-off browser verification script — not part of the submission.
// Drives the actual running app through the golden path and screenshots each step,
// per CLAUDE.md's "run it in the browser before calling it done."
import { chromium } from "playwright";
import path from "node:path";

const OUT = "/Users/elliot/conductor/workspaces/prodeng-takehome/nagoya/.context/shots";
const LEASE = "/Users/elliot/conductor/workspaces/prodeng-takehome/nagoya/sample-docs/commercial-lease-100-bishopsgate.pdf";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

page.on("console", (msg) => console.log("[BROWSER]", msg.text()));
page.on("pageerror", (err) => console.log("PAGE EXCEPTION:", err.message));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(OUT, "01-loaded.png") });

// New conversation
await page.getByRole("button", { name: "New conversation", exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "02-new-conversation.png") });

// Upload the lease via the file input
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles(LEASE);
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, "03-uploaded.png") });

// Ask the rent-review question
const textbox = page.getByPlaceholder(/ask a question/i);
await textbox.click();
await textbox.fill(
	"What is the rent review mechanism in this lease, and which clause governs it?",
);
await textbox.press("Enter");

// Wait for streaming to finish and citations to render
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "04-streaming.png") });
await page.waitForSelector("text=/p\\.\\d+/", { timeout: 30000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "05-answer-with-chips.png") });

// Click the first verified citation chip
const firstChip = page.locator("button", { hasText: "Clause" }).first();
await firstChip.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, "06-after-citation-click.png") });

// Expand a chip's quote via the chevron
const chevron = page.locator('button[aria-label="Show quoted passage"]').first();
await chevron.click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "07-chip-expanded.png") });

// Second question: the one the document doesn't answer — honest empty state
await textbox.click();
await textbox.fill(
	"What does the lease say about the tenant's asbestos management duties under the Control of Asbestos Regulations 2012?",
);
await textbox.press("Enter");
await page.waitForSelector("text=/No supporting passages/i", { timeout: 30000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "08-honest-empty-state.png") });

await browser.close();
console.log("done");
