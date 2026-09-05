const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const ICON_DIR = path.join(__dirname, "icons");
const icon = (name) => path.join(ICON_DIR, `${name}.png`);

// ---- palette: forensic / trust-tech ----
const INK      = "0B1C2C"; // deep ink navy - dominant, title/section backgrounds
const STEEL    = "12314A"; // steel blue - card fill on dark
const TEAL     = "22D3B8"; // forensic teal - primary accent (scan/verify)
const TEAL_DK  = "0E9C87";
const CORAL    = "F2545B"; // alert/reject accent, used sparingly
const AMBER    = "F4A623"; // review/uncertain accent
const OFFWHITE = "F4F7F9";
const MUTED    = "9FB3C8"; // muted text on dark
const WHITE    = "FFFFFF";
const LIGHTBG  = "FFFFFF";
const CARD_LT  = "F0F4F7"; // light card on white bg
const INKTEXT  = "14222E"; // body text on light bg

const FONT_HEAD = "Cambria";
const FONT_BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
const PW = 13.33, PH = 7.5;

pres.defineSlideMaster({
  title: "DARK",
  background: { color: INK },
  objects: [],
});
pres.defineSlideMaster({
  title: "LIGHT",
  background: { color: LIGHTBG },
  objects: [],
});

// ---------- helpers ----------

function iconBadge(slide, { x, y, d = 0.62, bg = TEAL, iconName, iconScale = 0.56 }) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: bg }, line: { type: "none" } });
  const isz = d * iconScale;
  slide.addImage({ path: icon(iconName), x: x + (d - isz) / 2, y: y + (d - isz) / 2, w: isz, h: isz });
}

function pageNum(slide, n, dark) {
  slide.addText(`${n} / 10`, {
    x: PW - 1.1, y: PH - 0.42, w: 0.9, h: 0.3, fontFace: FONT_BODY, fontSize: 10,
    color: dark ? MUTED : "8A99A6", align: "right", isTextBox: true, margin: 0,
  });
}

function kicker(slide, text, { x = 0.6, y = 0.5, color = TEAL, dark = true } = {}) {
  slide.addText(text.toUpperCase(), {
    x, y, w: 8, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true,
    color, charSpacing: 2, isTextBox: true, margin: 0,
  });
}

function title(slide, text, { x = 0.6, y = 0.82, w = 10.5, size = 34, color, dark = true } = {}) {
  slide.addText(text, {
    x, y, w, h: 0.95, fontFace: FONT_HEAD, fontSize: size, bold: true,
    color: color || (dark ? WHITE : INKTEXT), isTextBox: true, margin: 0,
  });
}

// corner-bracket frame motif (repeated visual device, forensic "scan target")
function cornerFrame(slide, { x, y, w, h, color = TEAL, len = 0.28, thick = 0.035 }) {
  const mk = (cx, cy, dx, dy) => {
    slide.addShape("rect", { x: cx, y: cy, w: dx ? len : thick, h: dx ? thick : len, fill: { color }, line: { type: "none" } });
  };
  // top-left
  slide.addShape("rect", { x, y, w: len, h: thick, fill: { color }, line: { type: "none" } });
  slide.addShape("rect", { x, y, w: thick, h: len, fill: { color }, line: { type: "none" } });
  // top-right
  slide.addShape("rect", { x: x + w - len, y, w: len, h: thick, fill: { color }, line: { type: "none" } });
  slide.addShape("rect", { x: x + w - thick, y, w: thick, h: len, fill: { color }, line: { type: "none" } });
  // bottom-left
  slide.addShape("rect", { x, y: y + h - thick, w: len, h: thick, fill: { color }, line: { type: "none" } });
  slide.addShape("rect", { x, y: y + h - len, w: thick, h: len, fill: { color }, line: { type: "none" } });
  // bottom-right
  slide.addShape("rect", { x: x + w - len, y: y + h - thick, w: len, h: thick, fill: { color }, line: { type: "none" } });
  slide.addShape("rect", { x: x + w - thick, y: y + h - len, w: thick, h: len, fill: { color }, line: { type: "none" } });
}

function statCallout(slide, { x, y, w, h, num, label, dark = true, numColor }) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: dark ? STEEL : CARD_LT }, line: { type: "none" },
  });
  slide.addText(num, {
    x: x + 0.25, y: y + 0.14, w: w - 0.5, h: h * 0.58, fontFace: FONT_HEAD, fontSize: 40, bold: true,
    color: numColor || TEAL, align: "left", isTextBox: true, margin: 0,
  });
  slide.addText(label, {
    x: x + 0.25, y: y + h * 0.6, w: w - 0.5, h: h * 0.36, fontFace: FONT_BODY, fontSize: 12.5,
    color: dark ? MUTED : "5A6B78", align: "left", isTextBox: true, margin: 0, valign: "top",
  });
}

// =====================================================================
// SLIDE 1 — TITLE
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });

  // subtle corner frame as the recurring motif, large, top-left of the whole canvas
  cornerFrame(s, { x: 0.55, y: 0.55, w: PW - 1.1, h: PH - 1.1, color: TEAL_DK, len: 0.4, thick: 0.03 });

  iconBadge(s, { x: PW / 2 - 0.42, y: 1.35, d: 0.84, bg: TEAL, iconName: "shield", iconScale: 0.56 });

  s.addText("VERILENS", {
    x: 0, y: 2.5, w: PW, h: 1.1, fontFace: FONT_HEAD, fontSize: 54, bold: true,
    color: WHITE, align: "center", isTextBox: true, margin: 0, charSpacing: 3,
  });
  s.addText("Deepfake / AI-Generated Image Detector for KYC", {
    x: 0, y: 3.62, w: PW, h: 0.55, fontFace: FONT_BODY, fontSize: 20,
    color: TEAL, align: "center", isTextBox: true, margin: 0,
  });
  s.addText(
    "Not a single confidence score. A forensic evidence system — per-lane reasoning,\nan honest “I don’t know,” and a tamper-proof audit trail.",
    {
      x: PW / 2 - 4.2, y: 4.35, w: 8.4, h: 0.8, fontFace: FONT_BODY, fontSize: 14,
      color: MUTED, align: "center", isTextBox: true, margin: 0, lineSpacingMultiple: 1.25,
    }
  );

  s.addShape("rect", { x: PW / 2 - 1.6, y: 5.55, w: 3.2, h: 0.014, fill: { color: "1E3A4E" }, line: { type: "none" } });

  s.addText("Track: Deepfake / AI-Generated Image Detector for KYC  ·  Cybersecurity", {
    x: 0, y: 5.75, w: PW, h: 0.4, fontFace: FONT_BODY, fontSize: 12.5,
    color: MUTED, align: "center", isTextBox: true, margin: 0,
  });
  s.addText("IEEE Gen-AI Hackathon", {
    x: 0, y: 6.85, w: PW, h: 0.35, fontFace: FONT_BODY, fontSize: 11,
    color: "5C7285", align: "center", isTextBox: true, margin: 0,
  });
}

// =====================================================================
// SLIDE 2 — THE PROBLEM
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  kicker(s, "The Problem");
  title(s, "KYC identity checks were built for a world\nwhere a photo was hard to fake.", { size: 30, w: 11.6 });
  s.addText("That world is gone.", {
    x: 0.6, y: 2.15, w: 8, h: 0.5, fontFace: FONT_BODY, fontSize: 16, italic: true,
    color: TEAL, isTextBox: true, margin: 0,
  });

  const stats = [
    { num: "11%", label: "of all global fraud in 2026 is deepfake-driven — up from 7% in 2024", color: TEAL },
    { num: "+2,665%", label: "YoY surge in native virtual-camera injection attacks (iProov, 2026)", color: CORAL },
    { num: "$20/mo", label: "buys real-time face-swap + camera injection as fraud-as-a-service", color: AMBER },
  ];
  const gap = 0.35, cw = (11.13 - gap * 2) / 3, cy = 3.0, ch = 2.5;
  stats.forEach((st, i) => {
    statCallout(s, { x: 0.6 + i * (cw + gap), y: cy, w: cw, h: ch, num: st.num, label: st.label, numColor: st.color });
  });

  s.addText(
    "Every hackathon team will show a photo, and a percentage. That answers the wrong question — " +
    "the real attack is injecting a synthetic image at the exact point a bank trusts the camera.",
    {
      x: 0.6, y: 5.85, w: 11.1, h: 0.9, fontFace: FONT_BODY, fontSize: 13.5,
      color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.3,
    }
  );
  pageNum(s, 2, true);
}

// =====================================================================
// SLIDE 3 — WHAT EVERYONE ELSE BUILDS
// =====================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  kicker(s, "The Crowded Field", { color: TEAL_DK });
  title(s, "What a generic detector looks like", { dark: false, size: 30 });

  const rows = [
    { icon: "eyeslash", h: "One image in", d: "No pairing to an identity document — detects a photo, not a KYC applicant." },
    { icon: "question", h: "One opaque number out", d: "“87% fake.” No region, no signal, nothing a compliance officer can act on." },
    { icon: "xmark", h: "Forced binary guess", d: "Blurry or compressed input still gets a confident verdict — no way to say “unsure.”" },
    { icon: "warning", h: "Blind to the real attack", d: "Global-artifact detectors miss local edits — exactly what fraudsters use (next slide)." },
  ];
  const rowH = 1.02, startY = 2.15;
  rows.forEach((r, i) => {
    const y = startY + i * (rowH + 0.12);
    s.addShape("roundRect", { x: 0.6, y, w: 11.1, h: rowH, rectRadius: 0.08, fill: { color: CARD_LT }, line: { type: "none" } });
    iconBadge(s, { x: 0.85, y: y + (rowH - 0.56) / 2, d: 0.56, bg: "8CA0AE", iconName: r.icon, iconScale: 0.55 });
    s.addText(r.h, { x: 1.65, y: y + 0.1, w: 4.3, h: 0.4, fontFace: FONT_BODY, fontSize: 15, bold: true, color: INKTEXT, isTextBox: true, margin: 0 });
    s.addText(r.d, { x: 6.0, y: y + 0.08, w: 5.5, h: rowH - 0.18, fontFace: FONT_BODY, fontSize: 12, color: "51616D", isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.15 });
  });
  pageNum(s, 3, false);
}

// =====================================================================
// SLIDE 4 — THE RESEARCH GAP (the insight)
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  kicker(s, "The Insight We Build On");
  title(s, "Published detectors don’t fail randomly.\nThey fail in one specific, documented way.", { size: 27, w: 12 });

  iconBadge(s, { x: 0.6, y: 2.35, d: 0.62, bg: TEAL, iconName: "flask" });
  s.addText("arXiv 2602.00192 — “AI-Generated Image Detectors Overrely on Global Artifacts”", {
    x: 1.45, y: 2.4, w: 10.8, h: 0.55, fontFace: FONT_BODY, fontSize: 14.5, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  s.addText(
    "Detectors learn a global VAE spectral shift left across the WHOLE image by inpainting — not the synthesised content itself. " +
    "“Inpainting Exchange” (INP-X) restores original pixels outside the edited region, isolating that shortcut.",
    { x: 1.45, y: 2.95, w: 10.7, h: 0.7, fontFace: FONT_BODY, fontSize: 12.5, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.25 }
  );

  // before/after collapse comparison
  const cy = 3.95, ch = 1.55, cw = 5.35, gap = 0.5;
  s.addShape("roundRect", { x: 0.6, y: cy, w: cw, h: ch, rectRadius: 0.1, fill: { color: STEEL }, line: { type: "none" } });
  s.addText("Standard inpainting", { x: 0.9, y: cy + 0.16, w: cw - 0.6, h: 0.35, fontFace: FONT_BODY, fontSize: 12.5, color: MUTED, isTextBox: true, margin: 0 });
  s.addText("~91%", { x: 0.9, y: cy + 0.5, w: cw - 0.6, h: 0.9, fontFace: FONT_HEAD, fontSize: 46, bold: true, color: TEAL, isTextBox: true, margin: 0 });
  s.addText("Sightengine & Hive accuracy", { x: 0.9, y: cy + ch - 0.35, w: cw - 0.6, h: 0.3, fontFace: FONT_BODY, fontSize: 10.5, color: MUTED, isTextBox: true, margin: 0 });

  s.addShape("roundRect", { x: 0.6 + cw + gap, y: cy, w: cw, h: ch, rectRadius: 0.1, fill: { color: STEEL }, line: { type: "none" } });
  s.addText("On INP-X exchanged images", { x: 0.9 + cw + gap, y: cy + 0.16, w: cw - 0.6, h: 0.35, fontFace: FONT_BODY, fontSize: 12.5, color: MUTED, isTextBox: true, margin: 0 });
  s.addText("~55%", { x: 0.9 + cw + gap, y: cy + 0.5, w: cw - 0.6, h: 0.9, fontFace: FONT_HEAD, fontSize: 46, bold: true, color: CORAL, isTextBox: true, margin: 0 });
  s.addText("Chance level — a coin flip", { x: 0.9 + cw + gap, y: cy + ch - 0.35, w: cw - 0.6, h: 0.3, fontFace: FONT_BODY, fontSize: 10.5, color: MUTED, isTextBox: true, margin: 0 });

  s.addText(
    "The best fix published (FUSED, Aug 2026) explicitly excludes face manipulation. Faces are exactly what KYC checks — and " +
    "the paper shows faces have the narrowest global-artifact shortcut, i.e. the domain where this blind spot matters most.",
    { x: 0.6, y: 5.75, w: 11.1, h: 0.85, fontFace: FONT_BODY, fontSize: 12.5, color: TEAL, isTextBox: true, margin: 0, lineSpacingMultiple: 1.3, italic: true }
  );
  pageNum(s, 4, true);
}

// =====================================================================
// SLIDE 5 — OUR ARCHITECTURE
// =====================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  kicker(s, "System Architecture", { color: TEAL_DK });
  title(s, "Five evidence lanes. One accountable judge.", { dark: false, size: 30 });

  const lanes = [
    { icon: "layers", n: "A", h: "Local Synthesis", d: "Patch-level, trained on INP-X exchanged images — reads content, not the global shortcut." },
    { icon: "magnify", n: "B", h: "Noise Residual", d: "Flags regions unnaturally clean for their detail level — the signature of generated content." },
    { icon: "code", n: "C", h: "Compression / ELA", d: "Recompression error inconsistent with local detail — catches splices and pasted portraits." },
    { icon: "camera", n: "D", h: "Capture Attestation", d: "Live camera vs. upload. Raises confidence only — never counted as evidence of fakery." },
    { icon: "usershield", n: "E", h: "Face Match", d: "ArcFace similarity between the ID photo and the selfie — the identity axis." },
  ];
  const cw = 2.02, gap = 0.135, startX = 0.6, cy = 2.15, ch = 3.05;
  lanes.forEach((l, i) => {
    const x = startX + i * (cw + gap);
    s.addShape("roundRect", { x, y: cy, w: cw, h: ch, rectRadius: 0.09, fill: { color: CARD_LT }, line: { type: "none" } });
    iconBadge(s, { x: x + (cw - 0.56) / 2, y: cy + 0.24, d: 0.56, bg: TEAL, iconName: l.icon, iconScale: 0.54 });
    s.addText(`LANE ${l.n}`, { x: x + 0.12, y: cy + 0.95, w: cw - 0.24, h: 0.28, fontFace: FONT_BODY, fontSize: 10, bold: true, color: TEAL_DK, align: "center", isTextBox: true, margin: 0, charSpacing: 1 });
    s.addText(l.h, { x: x + 0.12, y: cy + 1.22, w: cw - 0.24, h: 0.55, fontFace: FONT_BODY, fontSize: 12.5, bold: true, color: INKTEXT, align: "center", isTextBox: true, margin: 0 });
    s.addText(l.d, { x: x + 0.14, y: cy + 1.78, w: cw - 0.28, h: ch - 1.95, fontFace: FONT_BODY, fontSize: 9, color: "5A6B78", align: "center", isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 });
  });

  // arrow down to judge
  s.addText("▼", { x: 0, y: cy + ch + 0.08, w: PW, h: 0.3, fontFace: FONT_BODY, fontSize: 16, color: TEAL_DK, align: "center", isTextBox: true, margin: 0 });

  const jy = cy + ch + 0.42, jh = 0.85;
  s.addShape("roundRect", { x: 0.6, y: jy, w: 11.13, h: jh, rectRadius: 0.1, fill: { color: INK }, line: { type: "none" } });
  iconBadge(s, { x: 0.85, y: jy + (jh - 0.5) / 2, d: 0.5, bg: TEAL, iconName: "scale", iconScale: 0.55 });
  s.addText("Rule-based Judge", { x: 1.55, y: jy + 0.12, w: 3.4, h: 0.3, fontFace: FONT_BODY, fontSize: 13, bold: true, color: WHITE, isTextBox: true, margin: 0 });
  s.addText("Cross-checks usable lanes · abstains on disagreement · explainable by construction, not a black box", {
    x: 1.55, y: jy + 0.42, w: 9.9, h: 0.35, fontFace: FONT_BODY, fontSize: 11, color: MUTED, isTextBox: true, margin: 0,
  });
  pageNum(s, 5, false);
}

// =====================================================================
// SLIDE 6 — THREE-AXIS VERDICT + ABSTENTION
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  kicker(s, "The Output");
  title(s, "Three independent axes. Never one blended score.", { size: 30, w: 11.6 });
  s.addText("“A real photo of the wrong person” and “an AI selfie of the right person” are different failures.", {
    x: 0.6, y: 1.72, w: 11.5, h: 0.4, fontFace: FONT_BODY, fontSize: 13, italic: true, color: MUTED, isTextBox: true, margin: 0,
  });

  const axes = [
    { icon: "check", label: "AUTHENTICITY", vals: ["REAL", "LIKELY_FAKE", "INSUFFICIENT_EVIDENCE"], c: TEAL },
    { icon: "usershield", label: "IDENTITY", vals: ["MATCH", "MISMATCH", "INDETERMINATE"], c: AMBER },
    { icon: "gavel", label: "DECISION", vals: ["ACCEPT", "REJECT", "REVIEW"], c: CORAL },
  ];
  const cw = 3.55, gap = 0.24, cy = 2.35, ch = 2.15;
  axes.forEach((a, i) => {
    const x = 0.6 + i * (cw + gap);
    s.addShape("roundRect", { x, y: cy, w: cw, h: ch, rectRadius: 0.1, fill: { color: STEEL }, line: { type: "none" } });
    iconBadge(s, { x: x + 0.2, y: cy + 0.2, d: 0.5, bg: a.c, iconName: a.icon, iconScale: 0.55 });
    s.addText(a.label, { x: x + 0.85, y: cy + 0.24, w: cw - 1.0, h: 0.4, fontFace: FONT_BODY, fontSize: 13, bold: true, color: WHITE, isTextBox: true, margin: 0, valign: "middle" });
    a.vals.forEach((v, j) => {
      s.addText(v, { x: x + 0.22, y: cy + 0.85 + j * 0.4, w: cw - 0.44, h: 0.36, fontFace: FONT_BODY, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0 });
    });
  });

  s.addShape("roundRect", { x: 0.6, y: cy + ch + 0.3, w: 11.13, h: 1.55, rectRadius: 0.1, fill: { color: "173447" }, line: { color: TEAL_DK, width: 1 } });
  iconBadge(s, { x: 0.85, y: cy + ch + 0.48, d: 0.6, bg: AMBER, iconName: "question", iconScale: 0.55 });
  s.addText("Abstention is a feature, not a gap.", {
    x: 1.65, y: cy + ch + 0.42, w: 9.9, h: 0.4, fontFace: FONT_BODY, fontSize: 15, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  s.addText(
    "Four independent triggers route to review: unreadable image quality, too few usable lanes, lane disagreement, or a score inside the " +
    "uncertainty band. A confidently wrong reject locks a real person out of their bank account — refusing to guess is the correct output.",
    { x: 1.65, y: cy + ch + 0.78, w: 9.9, h: 0.9, fontFace: FONT_BODY, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.25 }
  );
  pageNum(s, 6, true);
}

// =====================================================================
// SLIDE 7 — THE DEMO FLOW
// =====================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  kicker(s, "How It Works", { color: TEAL_DK });
  title(s, "One KYC check, start to finish", { dark: false, size: 30 });

  const steps = [
    { icon: "idcard", h: "ID Document", d: "Photo of the ID card. Gallery import allowed." },
    { icon: "camera", h: "Live Selfie", d: "Camera-only — no gallery path. Blocks the injection attack." },
    { icon: "layers", h: "Forensic Lanes", d: "Quality gate, then lanes run in parallel on both images." },
    { icon: "gavel", h: "Verdict + Reasons", d: "Three axes, per-lane evidence, confidence labelled uncalibrated." },
    { icon: "link", h: "Anchored", d: "Verdict digest signed + anchored on Sepolia. Auditable, forever." },
  ];
  const cw = 2.02, gap = 0.135, startX = 0.6, cy = 2.3, ch = 2.85;
  steps.forEach((st, i) => {
    const x = startX + i * (cw + gap);
    s.addShape("roundRect", { x, y: cy, w: cw, h: ch, rectRadius: 0.09, fill: { color: CARD_LT }, line: { type: "none" } });
    s.addText(`${i + 1}`, { x: x + 0.12, y: cy + 0.12, w: 0.5, h: 0.4, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: "AEBBC4", isTextBox: true, margin: 0 });
    iconBadge(s, { x: x + (cw - 0.56) / 2, y: cy + 0.55, d: 0.56, bg: TEAL, iconName: st.icon, iconScale: 0.54 });
    s.addText(st.h, { x: x + 0.12, y: cy + 1.28, w: cw - 0.24, h: 0.5, fontFace: FONT_BODY, fontSize: 12.5, bold: true, color: INKTEXT, align: "center", isTextBox: true, margin: 0 });
    s.addText(st.d, { x: x + 0.14, y: cy + 1.8, w: cw - 0.28, h: ch - 1.95, fontFace: FONT_BODY, fontSize: 9, color: "5A6B78", align: "center", isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 });
    if (i < steps.length - 1) {
      s.addText("›", { x: x + cw + 0.005, y: cy + ch / 2 - 0.25, w: 0.13, h: 0.5, fontFace: FONT_BODY, fontSize: 20, bold: true, color: "C3CDD3", align: "center", isTextBox: true, margin: 0 });
    }
  });

  s.addText(
    "Same app, same image, side by side: /v1/baseline runs a commercial detector and our judge together — the comparison the live demo turns on.",
    { x: 0.6, y: cy + ch + 0.3, w: 11.1, h: 0.5, fontFace: FONT_BODY, fontSize: 12.5, italic: true, color: "51616D", isTextBox: true, margin: 0 }
  );
  pageNum(s, 7, false);
}

// =====================================================================
// SLIDE 8 — BLOCKCHAIN + CRYPTO LAYER
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  kicker(s, "The Audit Trail");
  title(s, "The verdict is tamper-proof, not just the photo.", { size: 30, w: 11.6 });

  const left = 0.6, lw = 5.5;
  s.addText(
    "Most projects stop at “prove the image wasn’t edited.” That says nothing about whether the KYC " +
    "decision itself was altered afterwards — which is what a regulator or bank actually needs to trust.",
    { x: left, y: 1.85, w: lw, h: 1.1, fontFace: FONT_BODY, fontSize: 13, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 }
  );

  const items = [
    { icon: "fingerprint", h: "SHA-256 + Ed25519", d: "Both images hashed and signed by a per-device key at capture." },
    { icon: "cube", h: "Verdict digest anchored", d: "Hash of {image hashes + authenticity + identity + decision + confidence + timestamp} written on-chain — not just the photo hash." },
    { icon: "link", h: "Ethereum Sepolia", d: "Data-only self-transfer, ABI-encoded payload. No contract deploy required." },
  ];
  let iy = 3.15;
  items.forEach((it) => {
    iconBadge(s, { x: left, y: iy, d: 0.5, bg: TEAL, iconName: it.icon, iconScale: 0.55 });
    s.addText(it.h, { x: left + 0.7, y: iy - 0.02, w: lw - 0.7, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true, color: WHITE, isTextBox: true, margin: 0 });
    s.addText(it.d, { x: left + 0.7, y: iy + 0.32, w: lw - 0.7, h: 0.55, fontFace: FONT_BODY, fontSize: 11, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.2 });
    iy += 1.02;
  });

  // right: mock "transaction record" card with corner-frame motif
  const rx = 6.55, ry = 1.85, rw = 5.2, rh = 4.35;
  s.addShape("roundRect", { x: rx, y: ry, w: rw, h: rh, rectRadius: 0.12, fill: { color: STEEL }, line: { type: "none" } });
  cornerFrame(s, { x: rx + 0.18, y: ry + 0.18, w: rw - 0.36, h: rh - 0.36, color: TEAL_DK, len: 0.22, thick: 0.025 });
  s.addText("VERDICT RECORD", { x: rx + 0.4, y: ry + 0.35, w: rw - 0.8, h: 0.35, fontFace: FONT_BODY, fontSize: 11.5, bold: true, color: TEAL, isTextBox: true, margin: 0, charSpacing: 1.5 });

  const fields = [
    ["authenticity", "REAL"], ["identity", "MATCH"], ["decision", "ACCEPT"],
    ["confidence", "0.91 (uncalibrated)"], ["anchor_tx", "0x7fa2…e91c"], ["chain", "Sepolia · 11155111"],
  ];
  let fy = ry + 0.9;
  fields.forEach(([k, v]) => {
    s.addText(k, { x: rx + 0.4, y: fy, w: 2.1, h: 0.34, fontFace: "Courier New", fontSize: 11, color: MUTED, isTextBox: true, margin: 0 });
    s.addText(v, { x: rx + 2.5, y: fy, w: rw - 2.9, h: 0.34, fontFace: "Courier New", fontSize: 11, bold: true, color: WHITE, isTextBox: true, margin: 0, align: "right" });
    fy += 0.46;
  });
  s.addText("Immutable once anchored. Any later edit to this record is detectable.", {
    x: rx + 0.4, y: ry + rh - 0.6, w: rw - 0.8, h: 0.4, fontFace: FONT_BODY, fontSize: 10, italic: true, color: "6E8598", isTextBox: true, margin: 0,
  });
  pageNum(s, 8, true);
}

// =====================================================================
// SLIDE 9 — HONESTY & LIMITATIONS (maturity signal)
// =====================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  kicker(s, "What We Don’t Claim", { color: TEAL_DK });
  title(s, "Engineering honesty is part of the design", { dark: false, size: 30 });
  s.addText("Judges will test the edges. We’d rather show them ourselves.", {
    x: 0.6, y: 1.68, w: 11, h: 0.4, fontFace: FONT_BODY, fontSize: 13, italic: true, color: "51616D", isTextBox: true, margin: 0,
  });

  const cards = [
    { icon: "info", h: "No novelty claim", d: "ELA, noise residuals, patch classifiers are established forensics. Our contribution is the KYC-specific system and the abstention design, not a new algorithm." },
    { icon: "scale", h: "Confidence is uncalibrated", d: "Every response is flagged confidence_is_calibrated: false until a held-out calibration set exists. We never present raw lane agreement as a probability." },
    { icon: "eyeslash", h: "Attestation isn’t verified yet", d: "The “live capture” flag is currently client-asserted. We refuse to grant it a confidence bonus server-side until a signed nonce makes it real — caught and fixed mid-build." },
    { icon: "warning", h: "Two lanes still need training data", d: "Lane A and Lane E need optional weights. Absent them, they abstain cleanly and lanes B/C carry the verdict — the system never fails open." },
  ];
  const cw = 5.4, gap = 0.33, cy = 2.3, ch = 2.05;
  cards.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * (cw + gap), y = cy + row * (ch + 0.25);
    s.addShape("roundRect", { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: CARD_LT }, line: { type: "none" } });
    iconBadge(s, { x: x + 0.22, y: y + 0.22, d: 0.5, bg: TEAL_DK, iconName: c.icon, iconScale: 0.55 });
    s.addText(c.h, { x: x + 0.88, y: y + 0.22, w: cw - 1.1, h: 0.5, fontFace: FONT_BODY, fontSize: 13.5, bold: true, color: INKTEXT, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(c.d, { x: x + 0.24, y: y + 0.82, w: cw - 0.5, h: ch - 1.0, fontFace: FONT_BODY, fontSize: 10.8, color: "51616D", isTextBox: true, margin: 0, lineSpacingMultiple: 1.22 });
  });
  pageNum(s, 9, false);
}

// =====================================================================
// SLIDE 10 — WHY WE STAND OUT / CLOSING
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  // no corner frame here: this slide's title runs 3 lines and collided with
  // it at every inset tried. The motif already appears on slides 1 and 8.
  kicker(s, "Why VeriLens Stands Out");
  title(s, "Others tell you if an image looks fake.\nWe tell you whether to trust the applicant —\nand prove we said so.", { size: 26, w: 11.8 });

  const pts = [
    { icon: "idcard", t: "ID + selfie, face-matched — real KYC, not a generic upload box" },
    { icon: "flask", t: "Targets a documented, published blind spot — not a vague novelty claim" },
    { icon: "gavel", t: "Per-lane reasoning and honest abstention — never a forced guess" },
    { icon: "link", t: "The decision itself is signed and anchored — a real audit trail" },
  ];
  let py = 3.35;
  pts.forEach((p) => {
    iconBadge(s, { x: 0.7, y: py, d: 0.46, bg: TEAL, iconName: p.icon, iconScale: 0.55 });
    s.addText(p.t, { x: 1.35, y: py + 0.02, w: 10.7, h: 0.42, fontFace: FONT_BODY, fontSize: 14, color: WHITE, isTextBox: true, margin: 0, valign: "middle" });
    py += 0.62;
  });

  s.addText("Thank you — questions welcome.", {
    x: 0, y: 6.35, w: PW, h: 0.5, fontFace: FONT_HEAD, fontSize: 18, bold: true, color: TEAL,
    align: "center", isTextBox: true, margin: 0,
  });
  pageNum(s, 10, true);
}

pres.writeFile({ fileName: path.join(__dirname, "VeriLens_Pitch.pptx") }).then(() => {
  console.log("written VeriLens_Pitch.pptx");
});
