#!/usr/bin/env python3
"""Build VeriLens presentation-reference PDF (easy English + technical detail)."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parents[1] / "VeriLens_Presentation_Reference.pdf"

# Brand-ish palette (not purple/cream AI defaults)
INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#334155")
ACCENT = colors.HexColor("#0F766E")
LIGHT = colors.HexColor("#F1F5F9")
BORDER = colors.HexColor("#CBD5E1")
WARN = colors.HexColor("#B45309")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=28,
            leading=34,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=12,
            leading=16,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=ACCENT,
            spaceBefore=14,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=16,
            textColor=INK,
            spaceBefore=10,
            spaceAfter=5,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=MUTED,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=12.5,
            textColor=INK,
            leftIndent=4,
            spaceAfter=2,
        ),
        "mono": ParagraphStyle(
            "mono",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.5,
            leading=10,
            textColor=INK,
            backColor=LIGHT,
            leftIndent=4,
            rightIndent=4,
            spaceBefore=4,
            spaceAfter=6,
        ),
        "caption": ParagraphStyle(
            "caption",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            spaceAfter=6,
        ),
        "example": ParagraphStyle(
            "example",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=INK,
            backColor=LIGHT,
            borderPadding=6,
            spaceBefore=4,
            spaceAfter=8,
            leftIndent=6,
            rightIndent=6,
        ),
        "toc": ParagraphStyle(
            "toc",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=INK,
            spaceAfter=3,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }
    return s


def bullets(items, style):
    return ListFlowable(
        [ListItem(Paragraph(i, style), leftIndent=12, bulletColor=ACCENT) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=10,
        bulletFontSize=9,
    )


def simple_table(rows, col_widths):
    data = []
    for i, row in enumerate(rows):
        data.append([Paragraph(str(c), ParagraphStyle(
            f"td{i}",
            fontName="Helvetica-Bold" if i == 0 else "Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=INK,
        )) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ]))
    # Fix header text color via Paragraph - recreate header
    for j, c in enumerate(rows[0]):
        data[0][j] = Paragraph(str(c), ParagraphStyle(
            "th", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white
        ))
    return t


def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(
        A4[0] / 2,
        12 * mm,
        f"VeriLens — Pre-Presentation Reference  |  Page {doc.page}",
    )
    canvas.restoreState()


def build():
    S = styles()
    story = []

    # ---- COVER ----
    story.append(Spacer(1, 40 * mm))
    story.append(Paragraph("VeriLens", S["cover_title"]))
    story.append(Paragraph(
        "Deepfake / AI-Generated Image Detector for KYC",
        S["cover_sub"],
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "<b>Pre-Presentation Reference Guide</b>",
        S["cover_sub"],
    ))
    story.append(Paragraph(
        "Easy English · Technical Detail · Examples · Honest Limits",
        S["cover_sub"],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph(
        "One line: VeriLens takes an ID document photo and a live selfie, "
        "runs independent forensic lanes over both, and returns three separate "
        "explainable verdicts — refusing to guess when evidence is weak, and "
        "anchoring the decision on-chain so it cannot be quietly changed later.",
        S["body"],
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Use this PDF before a viva, demo, or pitch. It covers idea, problem, "
        "architecture, every lane, the judge, confidence math, UI data flow, "
        "training, embeddings, failures, banking use, scaling, and future plans.",
        S["caption"],
    ))
    story.append(PageBreak())

    # ---- TOC ----
    story.append(Paragraph("Contents", S["h1"]))
    toc = [
        "1. Idea &amp; Problem Statement",
        "2. Research We Did",
        "3. Our Implementation (What We Built)",
        "4. Architecture &amp; Where UI Data Comes From",
        "5. Every Lane Explained (A–G + Quality Gate)",
        "6. Face Embeddings (Lane E) — How They Work",
        "7. How Lane Confidence Is Computed",
        "8. How the Judge Decides (with Examples)",
        "9. Key Design Decisions — What &amp; Why",
        "10. Problems We Ran Into",
        "11. Where the Model Fails — Why, Fixes, Why Not Fixed Yet",
        "12. Data Tests &amp; Approximate Training",
        "13. Banking Scenario (Real-World Implementation)",
        "14. How We Scale to Production",
        "15. Future Plans",
        "16. Quick Q&amp;A Cheat Sheet",
    ]
    for line in toc:
        story.append(Paragraph(line, S["toc"]))
    story.append(PageBreak())

    # ---- 1 ----
    story.append(Paragraph("1. Idea &amp; Problem Statement", S["h1"]))
    story.append(Paragraph("1.1 The idea (plain English)", S["h2"]))
    story.append(Paragraph(
        "Banks and fintech apps ask you to upload an ID card and a selfie. That "
        "flow is called <b>KYC</b> (Know Your Customer). It used to assume a photo "
        "was hard to fake. Today, anyone with a laptop can generate a face that "
        "never existed, or paste a new portrait onto a real ID. VeriLens is a "
        "mobile + server system that checks both images together, explains why, "
        "and says “I don’t know — ask a human” when it should.",
        S["body"],
    ))
    story.append(Paragraph("1.2 Problem statement (technical)", S["h2"]))
    story.append(bullets([
        "<b>Attack surface:</b> Remote onboarding (ID + selfie). Deepfakes are "
        "cited as ~11% of global fraud (2026); injection-attack volume (feeding "
        "a synthetic image where a system trusts the camera) is reported up "
        "~2,665% YoY (iProov).",
        "<b>Industry failure mode:</b> Most detectors emit one confidence number. "
        "That hides two different failures: (1) a <i>real photo of the wrong "
        "person</i> (identity fraud) vs (2) an <i>AI photo of the right person</i> "
        "(presentation / synthesis fraud).",
        "<b>Research gap:</b> Published detectors over-rely on a <b>global spectral "
        "artifact</b> left by inpainting (VAE-related shift across the whole "
        "frame). Under Inpainting Exchange (INP-X, arXiv 2602.00192), accuracy "
        "of commercial detectors can collapse ~91% → ~55% (near chance). The "
        "best published fix (FUSED, Aug 2026) explicitly <b>excludes face "
        "manipulation</b> — which is exactly KYC’s domain.",
        "<b>Honesty requirement:</b> A wrong REJECT locks a real customer out of "
        "a bank account. So abstention (INSUFFICIENT_EVIDENCE → REVIEW) must be "
        "a first-class output, not an error edge case.",
    ], S["bullet"]))
    story.append(Paragraph("1.3 What we are NOT claiming", S["h2"]))
    story.append(Paragraph(
        "We do <b>not</b> claim novel forensic algorithms. Error Level Analysis "
        "(ELA), noise-residual analysis, and patch classifiers are established. "
        "Our contribution is a <b>KYC-shaped system</b>: paired ID+selfie, three "
        "independent verdict axes, mandatory abstention, signed + on-chain "
        "decision record — aimed at a documented blind spot around local face "
        "edits.",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 2 ----
    story.append(Paragraph("2. Research We Did", S["h1"]))
    story.append(Paragraph(
        "Before writing product code, we mapped what published and commercial "
        "detectors actually get wrong for KYC-shaped attacks.",
        S["body"],
    ))
    story.append(simple_table([
        ["Source", "Finding we used", "How it shaped VeriLens"],
        ["arXiv 2602.00192\n(INP-X / Jan 2026)",
         "Detectors lean on global artifacts; local edits survive “exchange”.",
         "Lane A trains on exchanged images so it cannot use that shortcut."],
        ["FUSED (Aug 2026)",
         "Stronger local-edit detection, but faces excluded from scope.",
         "Opening for a face-centric KYC pipeline."],
        ["Wang et al. 2020\n(CNNDetection)",
         "JPEG/blur/resize augmentation improves cross-generator generalisation.",
         "Lane A trainer: --augment on by default."],
        ["Classic forensics\n(ELA, noise residuals)",
         "Intra-image inconsistency finds splices without a reference DB.",
         "Lanes B &amp; C are training-free, CPU-only."],
        ["iProov / industry\nfraud reports",
         "Injection &amp; deepfake growth on remote identity.",
         "Selfie is camera-only (no gallery import)."],
        ["DigiLocker / UIDAI\n(India context)",
         "Authoritative ID authenticity is a government API problem.",
         "We removed OCR doc-type checks; focus on live selfie forensics."],
    ], [38 * mm, 70 * mm, 62 * mm]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "We also wrote <font face='Courier'>scripts/verify_baseline.py</font> to "
        "re-measure the commercial ~91%→55% claim on INP-X before quoting it live "
        "(vendors may patch after a paper is public).",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 3 ----
    story.append(Paragraph("3. Our Implementation (What We Built)", S["h1"]))
    story.append(Paragraph("3.1 Two parts", S["h2"]))
    story.append(bullets([
        "<b>Mobile app (Expo / React Native / TypeScript):</b> Capture ID + selfie, "
        "SHA-256 hash, Ed25519 sign, call forensics API, show 3-axis verdict, "
        "anchor digest on Ethereum Sepolia, sync to Supabase, local SQLite "
        "offline cache, review queue.",
        "<b>Forensics service (Python FastAPI):</b> Quality gate + forensic lanes + "
        "rule-based judge. CPU-first; optional ML weights for Lane A and Lane E.",
    ], S["bullet"]))
    story.append(Paragraph("3.2 Three-axis verdict model", S["h2"]))
    story.append(simple_table([
        ["Axis", "Values", "Meaning"],
        ["authenticity", "REAL / LIKELY_FAKE / INSUFFICIENT_EVIDENCE",
         "Are pixels synthetic or manipulated?"],
        ["identity", "MATCH / MISMATCH / INDETERMINATE / null",
         "Same person on ID and selfie? null = single-image mode"],
        ["decision", "ACCEPT / REJECT / REVIEW",
         "What should ops do?"],
    ], [32 * mm, 72 * mm, 66 * mm]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("3.3 End-to-end pipeline (app)", S["h2"]))
    story.append(Preformatted(
        "1. Hash     → SHA-256 of ID bytes + selfie bytes\n"
        "2. Sign     → Ed25519 over the pair (device key in Secure Store)\n"
        "3. Forensics→ POST /v1/analyze (multipart id_image + selfie)\n"
        "4. Anchor   → Sepolia self-transfer with verdict digest calldata\n"
        "5. Cloud    → Supabase case row + optional image upload",
        S["mono"],
    ))
    story.append(Paragraph(
        "Forensics failure is fatal (no verdict to anchor). Anchor/cloud failures "
        "are recorded but non-blocking — the local SQLite case still keeps the result.",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 4 ----
    story.append(Paragraph("4. Architecture &amp; Where UI Data Comes From", S["h1"]))
    story.append(Paragraph("4.1 High-level diagram", S["h2"]))
    story.append(Preformatted(
        "┌──────────────────────── Expo App ────────────────────────┐\n"
        "│ Capture → pipeline.ts → Zustand store → Screens          │\n"
        "│   │ hash/sign (lib/crypto)  │ forensics (lib/forensics)   │\n"
        "│   │ blockchain (ethers)     │ supabase + sqlite (lib/db)  │\n"
        "└───────────────┬───────────────────────┬──────────────────┘\n"
        "                │ HTTP multipart         │ SQL / Storage\n"
        "                ▼                        ▼\n"
        "     FastAPI service/              Supabase + Sepolia\n"
        "     quality → lanes → judge",
        S["mono"],
    ))
    story.append(Paragraph("4.2 Where every UI field comes from", S["h2"]))
    story.append(simple_table([
        ["UI element", "Data source", "How it arrives"],
        ["ID / selfie preview", "Device camera or gallery URI",
         "capture.tsx → local file URI"],
        ["Pipeline step list", "lib/pipeline.ts progress callbacks",
         "Hash → Sign → Forensics → Anchor → Cloud"],
        ["authenticity / identity / decision",
         "service/judge.py → AnalyzeOut.verdict",
         "HTTP JSON from POST /v1/analyze"],
        ["confidence + “(uncalibrated)”",
         "verdict.confidence + confidence_is_calibrated",
         "UI must show uncalibrated while flag is false"],
        ["Per-lane score / reasons / box",
         "LaneResult from lanes A/B/C/…",
         "id_image.lanes[] + selfie.lanes[]"],
        ["Case history / gallery", "expo-sqlite (lib/db.ts)",
         "Written after pipeline; offline-first"],
        ["Review queue", "SQLite filter decision=REVIEW",
         "review.tsx + optional Supabase sync"],
        ["On-chain TX / proof verify", "Sepolia + Blockscout API",
         "lib/blockchain.ts; verify-proof screen"],
        ["Device public key / wallet", "expo-secure-store",
         "profile.tsx reads crypto + wallet helpers"],
    ], [48 * mm, 55 * mm, 67 * mm]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "<b>Important:</b> The UI does not invent forensic scores. It only displays "
        "what the FastAPI service returns (plus local crypto / chain metadata). "
        "If the service is unreachable, forensics fails and there is no authenticity "
        "guess on the client.",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 5 ----
    story.append(Paragraph("5. Every Lane Explained", S["h1"]))
    story.append(Paragraph(
        "Think of lanes as independent “specialist doctors.” Each answers one narrow "
        "question. Each can <b>abstain</b> if the image does not give enough signal. "
        "A separate <b>judge</b> combines them with rules (not another neural net).",
        S["body"],
    ))

    story.append(Paragraph("Quality Gate (Lane Q) — before any forensic claim", S["h2"]))
    story.append(Paragraph(
        "Forensic traces live in high-frequency detail. If the image is too small, "
        "too blurred, or too heavily recompressed, the gate marks "
        "<font face='Courier'>quality.usable = False</font> and the judge abstains.",
        S["body"],
    ))
    story.append(bullets([
        "<b>min_side_px = 256</b> — short side below this → unreadable.",
        "<b>min_laplacian_var = 60</b> — variance of Laplacian; low = blur / soft upsample.",
        "<b>min_jpeg_quality = 55</b> — estimated from JPEG quantization tables; heavy "
        "recompression destroys ELA and residuals.",
    ], S["bullet"]))

    story.append(Paragraph("Lane A — Local Synthesis (optional, trained)", S["h2"]))
    story.append(Paragraph(
        "A <b>patch-level classifier</b> trained to catch local AI synthesis / "
        "inpainting on faces. Trained especially on INP-X <i>exchanged</i> images so "
        "it cannot lean on the global artifact shortcut. Needs "
        "<font face='Courier'>requirements-ml.txt</font> + "
        "<font face='Courier'>weights/lane_a.pt</font>. Without them, it abstains "
        "cleanly. Confidence weight is <b>capped</b> at "
        "<font face='Courier'>lane_a_confidence_cap = 0.5</font> because same-"
        "distribution val accuracy does not prove phone-photo generalisation.",
        S["body"],
    ))

    story.append(Paragraph("Lane B — Noise Residual (training-free)", S["h2"]))
    story.append(Paragraph(
        "Bilateral-filter the greyscale image; residual = |original − denoised|. "
        "Block into 16×16 tiles; compute modified z-scores (Iglewicz–Hoaglin, "
        "cutoff 3.5). Flag the <b>low side only</b> (z &lt; −3.5): diffusion "
        "content is often unnaturally noise-free for its detail. Confidence scales "
        "with median residual energy — no texture ⇒ nothing to compare.",
        S["body"],
    ))

    story.append(Paragraph("Lane C — Compression / ELA (training-free)", S["h2"]))
    story.append(Paragraph(
        "Recompress at JPEG quality 90; measure per-pixel error level; block and "
        "z-score. Flag <b>both sides</b> (|z| &gt; 3.5): pasted or re-edited "
        "regions often have a different compression history. If there is no JPEG "
        "history (e.g. PNG), confidence drops (~0.30) instead of inventing an "
        "ELA story. Both B and C divide by local gradient energy so they do not "
        "just flag “every sky” or “every textured edge.”",
        S["body"],
    ))

    story.append(Paragraph("Lane D — Capture Attestation", S["h2"]))
    story.append(Paragraph(
        "Proves the selfie was captured live in-app: server issues a single-use "
        "nonce (<font face='Courier'>GET /v1/attest/nonce</font>); device signs "
        "<font face='Courier'>nonce || sha256(selfie)</font> with Ed25519; service "
        "verifies before applying <font face='Courier'>attested_bonus = +0.10</font> "
        "to judge confidence. <b>Absence of attestation never lowers confidence</b> "
        "— almost every genuine photo in the world was never attested by our app.",
        S["body"],
    ))

    story.append(Paragraph("Lane E — Face Match (optional, embeddings)", S["h2"]))
    story.append(Paragraph(
        "Compares ArcFace embeddings from the ID portrait and the selfie (cosine "
        "similarity). This is what makes the system “for KYC,” not a generic "
        "fake-image filter. See Section 6.",
        S["body"],
    ))

    story.append(Paragraph("Lane G — Screen / Print Replay (new, capped)", S["h2"]))
    story.append(Paragraph(
        "Patch-wise FFT moiré detection (4×4 patches). A real screen replay lights "
        "up many patches; a hologram sticker lights up one corner. Confidence capped "
        "at 0.4 until labelled calibration exists. Remaining risk: wallpaper / "
        "striped shirt filling most of the frame can look “widespread.”",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 6 ----
    story.append(Paragraph("6. Face Embeddings (Lane E)", S["h1"]))
    story.append(Paragraph(
        "An <b>embedding</b> is a fixed-length vector (here from ArcFace / "
        "insightface <font face='Courier'>buffalo_l</font>) that places faces in a "
        "space where the same person clusters together. We take the "
        "<b>normed embedding</b> for each face and compute <b>cosine similarity</b> "
        "= dot product of two unit vectors (range roughly −1…1; same person tends "
        "higher).",
        S["body"],
    ))
    story.append(bullets([
        "Model input size: <b>112×112</b>. Crops smaller than that are upsampled → "
        "weaker embeddings.",
        "Minimum usable face width: <b>40 px</b> (below → return None, no guessed score).",
        "Low-quality margin: if face &lt; 112 px, MATCH needs "
        "<font face='Courier'>face_match_above + 0.15</font> (0.38 → 0.53).",
        "ID may have a ghost portrait: we pick the <b>largest</b> face on the ID.",
        "Selfie with &gt;1 face → abstain (cannot know which applicant).",
        "Missing insightface deps → None + reason → identity INDETERMINATE → REVIEW.",
    ], S["bullet"]))
    story.append(Paragraph("Thresholds (config.py)", S["h3"]))
    story.append(simple_table([
        ["Similarity s", "Identity call"],
        ["s ≥ 0.38 (or ≥ 0.53 if low-quality face)", "MATCH"],
        ["s ≤ 0.22", "MISMATCH"],
        ["otherwise", "INDETERMINATE → REVIEW"],
        ["s is None (no face / no model)", "INDETERMINATE on pair checks"],
    ], [95 * mm, 75 * mm]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "<b>Example:</b> Same person, full-res selfie vs tiny Aadhaar crop (~94 px) "
        "gave similarities ~0.73 vs ~0.57 in live testing. Both can still MATCH, "
        "but the low-quality path exists to stop a barely-over-threshold weak crop "
        "from becoming a confident MATCH.",
        S["example"],
    ))
    story.append(PageBreak())

    # ---- 7 ----
    story.append(Paragraph("7. How Lane Confidence Is Computed", S["h1"]))
    story.append(Paragraph(
        "Each lane returns <font face='Courier'>{score, confidence, usable, reasons, "
        "box}</font>. "
        "<b>score</b> ∈ [0,1] is “how fake / anomalous” (higher = more suspicious). "
        "<b>confidence</b> ∈ [0,1] is “how much this lane trusts its own read.” "
        "If confidence &lt; <font face='Courier'>min_lane_confidence (0.35)</font>, "
        "the lane sets <font face='Courier'>usable=False</font> and is dropped from "
        "the judge average.",
        S["body"],
    ))
    story.append(Paragraph("Shared spatial scoring (Lanes B &amp; C)", S["h2"]))
    story.append(bullets([
        "16×16 non-overlapping blocks → per-block statistic → gradient-normalised "
        "→ modified z-score vs median/MAD.",
        "Connected clusters of outlier blocks; ignore clusters smaller than 4 blocks.",
        "Cluster area → score via saturating curve: ~5% of frame flagged ≈ score 0.6.",
        "Lane B confidence ↑ with residual energy; Lane C confidence from estimated "
        "JPEG quality (or ~0.30 if no JPEG history).",
    ], S["bullet"]))
    story.append(Paragraph("Other lanes", S["h2"]))
    story.append(bullets([
        "<b>Lane A:</b> patch classifier probability / max over face region; weight "
        "also tied to checkpoint <font face='Courier'>val_acc_exchanged</font>, then "
        "capped at 0.5.",
        "<b>Lane D:</b> does not produce a fake-score; only adds +0.10 to judge "
        "confidence when crypto attestation verifies.",
        "<b>Lane E:</b> produces similarity for the identity axis (not the fake "
        "score average), though reasons appear in the verdict list.",
        "<b>Lane G:</b> severity × patch coverage; confidence fixed/capped at 0.4.",
    ], S["bullet"]))
    story.append(Paragraph(
        "<b>Critical honesty flag:</b> "
        "<font face='Courier'>confidence_is_calibrated = false</font>. "
        "A UI confidence of 0.72 does <b>not</b> mean “72% probability fake.” It "
        "means usable lanes were fairly confident and agreed. Until a held-out "
        "calibration set exists, always say “(uncalibrated).”",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 8 ----
    story.append(Paragraph("8. How the Judge Decides (with Examples)", S["h1"]))
    story.append(Paragraph(
        "The judge in <font face='Courier'>service/judge.py</font> is "
        "<b>rule-based on purpose</b>: no honest meta-training set yet, and rules "
        "can explain <i>why</i>.",
        S["body"],
    ))
    story.append(Paragraph("8.1 Step-by-step algorithm", S["h2"]))
    story.append(Preformatted(
        "1. Compute identity from face_similarity (Lane E) if available.\n"
        "2. If quality.usable is False → authenticity INSUFFICIENT_EVIDENCE;\n"
        "   decision = REJECT if identity==MISMATCH else REVIEW.\n"
        "3. Keep only lanes with usable=True (confidence ≥ 0.35).\n"
        "4. If usable count < 2 → abstain (need cross-check).\n"
        "5. agg = weighted_average(scores, weights=confidences)\n"
        "6. spread = weighted RMS deviation from agg\n"
        "7. If spread > 0.28 → abstain (lanes disagree).\n"
        "8. base_conf = mean(weights) * (1 - 0.5*min(spread/0.28, 1))\n"
        "   + optional attested_bonus 0.10 (cap at 1.0)\n"
        "9. If agg ≥ 0.65 → LIKELY_FAKE; elif agg ≤ 0.35 → REAL;\n"
        "   else abstain (uncertainty band 0.35–0.65).\n"
        "10. Fold decision:\n"
        "    LIKELY_FAKE → REJECT\n"
        "    else MISMATCH → REJECT\n"
        "    else INDETERMINATE → REVIEW\n"
        "    else → ACCEPT",
        S["mono"],
    ))
    story.append(Paragraph("8.2 Worked examples", S["h2"]))

    story.append(Paragraph("<b>Example A — Clean real customer</b>", S["h3"]))
    story.append(Paragraph(
        "Usable lanes B=0.05 (conf 0.85), C=0.08 (conf 0.80). face sim=0.71. "
        "agg≈0.06 ≤ 0.35 → authenticity REAL, identity MATCH → "
        "<b>decision ACCEPT</b>. base_conf ≈ mean(0.85,0.80)×(1−small spread) ≈ 0.8.",
        S["example"],
    ))
    story.append(Paragraph("<b>Example B — AI selfie, matching face</b>", S["h3"]))
    story.append(Paragraph(
        "Lanes flag high fake scores (e.g. B=0.82, C=0.70, maybe A=0.90 capped). "
        "agg ≥ 0.65 → LIKELY_FAKE → <b>REJECT</b> even if identity MATCH. "
        "This is presentation fraud: right identity claim, synthetic capture.",
        S["example"],
    ))
    story.append(Paragraph("<b>Example C — Real photo, wrong person</b>", S["h3"]))
    story.append(Paragraph(
        "Authenticity lanes look clean (agg low → REAL) but face sim=0.12 → "
        "MISMATCH → <b>REJECT</b>. Identity fraud is independent of pixel authenticity.",
        S["example"],
    ))
    story.append(Paragraph("<b>Example D — Lanes disagree</b>", S["h3"]))
    story.append(Paragraph(
        "B score 0.10, C score 0.90, both high confidence. Weighted spread &gt; 0.28 "
        "→ authenticity INSUFFICIENT_EVIDENCE, decision REVIEW (unless MISMATCH). "
        "We refuse to average a fight into false certainty.",
        S["example"],
    ))
    story.append(Paragraph("<b>Example E — Blurry upload</b>", S["h3"]))
    story.append(Paragraph(
        "Laplacian variance &lt; 60 → quality gate fails before aggregation. "
        "score=null, confidence=0, REVIEW. Better than a confident wrong reject.",
        S["example"],
    ))
    story.append(Paragraph("<b>Example F — Bug we fixed (MISMATCH + abstain)</b>", S["h3"]))
    story.append(Paragraph(
        "Old bug: every abstain path forced decision=REVIEW even when Lane E already "
        "proved MISMATCH. Fixed in <font face='Courier'>_abstain()</font>: "
        "MISMATCH still REJECTS when authenticity cannot be decided. Regression: "
        "<font face='Courier'>test_mismatch_rejects_even_when_authenticity_abstains</font>.",
        S["example"],
    ))
    story.append(PageBreak())

    # ---- 9 ----
    story.append(Paragraph("9. Key Design Decisions — What &amp; Why", S["h1"]))
    story.append(simple_table([
        ["Decision", "Why"],
        ["Lanes + rule judge (not one black-box model)",
         "Explainability; abstention; no honest meta-train data yet."],
        ["Three axes, not one blended score",
         "Identity fraud ≠ synthesis fraud; compliance needs the split."],
        ["Wide uncertainty band (0.35–0.65)",
         "Wrong REJECT harms real bank applicants."],
        ["Selfie camera-only (no gallery)",
         "Blocks classic injection of a pre-made deepfake file."],
        ["Attestation only raises confidence",
         "Missing attestation is normal for real photos."],
        ["Optional Lane A/E; core runs on B/C",
         "Graceful degradation on free CPU / missing weights."],
        ["Cap Lane A confidence at 0.5",
         "High val_acc on same dataset ≠ phone-photo generalisation."],
        ["Cap Lane G at 0.4",
         "New / unvalidated against labelled replay dataset."],
        ["Sign + Sepolia-anchor the verdict digest",
         "Prove the decision wasn’t edited later, not only the photo."],
        ["Remove OCR document-type lane",
         "DigiLocker/UIDAI already own authoritative ID authenticity."],
        ["confidence_is_calibrated=false forever until W5",
         "Don’t present raw agreement as a probability."],
    ], [72 * mm, 98 * mm]))
    story.append(PageBreak())

    # ---- 10 ----
    story.append(Paragraph("10. Problems We Ran Into", S["h1"]))
    story.append(bullets([
        "<b>Lane A overfit to curated CelebA-HQ/INP-X:</b> val_acc_exchanged ~0.99, "
        "but real phone photos: confident false positives and a missed full-frame "
        "AI headshot. Mitigated with face-crop scan + confidence cap; retrain "
        "prepared (140k faces + augmentation).",
        "<b>Attestation never worked over HTTP:</b> FastAPI treated fields as query "
        "params beside File(...). Fixed with Form(None); route-level regression test.",
        "<b>Lane G scoring bugs (3 rounds):</b> area-only ignored severe tiny moiré; "
        "severity-only over-triggered; whole-image FFT false-positived holograms. "
        "Fixed with patch-wise coverage.",
        "<b>UI text invisible:</b> alignItems broke flex text width on reason rows. "
        "Fixed at component root width:100%.",
        "<b>Groq Lane A refine:</b> privacy (sends ID/selfie off-device), "
        "non-deterministic answers, rate limits; left optional and undisclosed as "
        "own lane by owner direction — tension with explainability ethos.",
        "<b>Identity MISMATCH swallowed by abstain:</b> fixed as Example F above.",
        "<b>Kaggle trainer wiring:</b> FACES140K_ROOT wrongly forced when dataset "
        "not attached — fixed to shallow-search inputs.",
    ], S["bullet"]))
    story.append(PageBreak())

    # ---- 11 ----
    story.append(Paragraph("11. Where the Model Fails — Why, Fix, Why Not Fixed Yet", S["h1"]))
    story.append(simple_table([
        ["Failure", "Why it happens", "How to fix", "Why not fully fixed yet"],
        ["Fully synthetic image with uniform stats passes B/C",
         "Intra-image consistency: no local anomaly if whole frame is synthetic.",
         "Strong Lane A / external detector trained on whole-image fakes (140k).",
         "Retrain ready; needs compute + out-of-distribution validation."],
        ["Lane A FP/FN on real phones",
         "Train/val from same narrow distribution; domain shift.",
         "Broader data, JPEG/blur augment, drop face-only-only training; then re-test on real photos.",
         "Didn’t ship a “pretty” broken model as authority — capped weight instead."],
        ["Heavy beauty/denoise selfie",
         "Modern ISP reduces sensor noise → can look “too clean.”",
         "Recalibrate thresholds; more phone ISP diversity in eval.",
         "Live tests: B self-excluded via low confidence; no proven bug."],
        ["Periodic wallpaper / striped shirt → Lane G FP",
         "Truly widespread high-frequency pattern.",
         "Calibrate on labelled replay set; maybe temporal video cues.",
         "Confidence already capped; labelled dataset not collected."],
        ["Low-res ID face embeddings",
         "Upsample to 112px weakens ArcFace vector.",
         "Higher match margin (done); ask better capture UX.",
         "Margin shipped; cannot invent pixels that aren’t there."],
        ["Uncalibrated confidence",
         "No held-out reliability diagram / temperature scaling.",
         "Build calibration set; set confidence_is_calibrated=true.",
         "Honesty &gt; fake precision; flag stays false on purpose."],
        ["Nonce store in-memory",
         "Single process demo; lost on restart / multi-worker.",
         "Redis/DB-backed nonce store.",
         "Enough for demo; production scaling item (see §14)."],
    ], [40 * mm, 42 * mm, 44 * mm, 44 * mm]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "<b>Safety net observed in testing:</b> Across hard cases this session, "
        "min_usable_lanes + disagreement gates meant the system did not emit a "
        "false ACCEPT; it preferred REVIEW. That is the intended failure mode.",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 12 ----
    story.append(Paragraph("12. Data Tests &amp; Approximate Training", S["h1"]))
    story.append(Paragraph("12.1 Automated tests", S["h2"]))
    story.append(bullets([
        "<font face='Courier'>service/test_service.py</font> — assert-based, seeded "
        "synthetic images: quality gate, abstention paths, Lane B splice catch, "
        "attestation never lowers confidence, identity independent of authenticity, "
        "MISMATCH-with-abstain regression (~11 core checks historically).",
        "<font face='Courier'>test_lane_screen.py</font> — moiré / localised vs "
        "widespread scoring.",
        "<font face='Courier'>test_lane_face.py</font>, "
        "<font face='Courier'>test_lane_a_refine.py</font>, "
        "<font face='Courier'>test_train_lane_a.py</font> — optional/ML paths.",
        "Manual live tests on real phones: real people, ID cards, AI headshots, "
        "screen replays, laminated hologram cards.",
    ], S["bullet"]))
    story.append(Paragraph("12.2 Approximate training (Lane A)", S["h2"]))
    story.append(bullets([
        "<b>Primary data:</b> Inpainting Exchange (INP-X) — face-only CelebA-HQ "
        "subset historically ~2010 train / ~893 held-out mask-paired edits.",
        "<b>Metric that matters:</b> val_acc_exchanged (setting where published "
        "detectors fall to chance). Checkpoint can report ~0.99 on that split — "
        "<i>not</i> proof of real-world readiness.",
        "<b>Prepared retrain mix:</b> INP-X + xhlulu/140k-real-and-fake-faces "
        "(~70k real FFHQ + ~70k StyleGAN fakes) + CNNDetection-style augment "
        "(random JPEG / blur / resize). Prefer keeping non-face INP-X domains for "
        "diversity (not only --face-only).",
        "<b>New headline metrics on checkpoint:</b> val_acc_faces140k_real / _fake "
        "alongside exchanged / inpainted / original.",
        "<b>Hardware:</b> runs on Kaggle T4, Colab, or local (e.g. Apple MPS).",
        "<b>Rule:</b> before trusting a new lane_a.pt, re-test on real non-dataset "
        "photos — not only the training distribution’s held-out split.",
    ], S["bullet"]))
    story.append(PageBreak())

    # ---- 13 ----
    story.append(Paragraph("13. Banking Scenario — Real-World Implementation", S["h1"]))
    story.append(Paragraph("13.1 Where it sits in a bank KYC stack", S["h2"]))
    story.append(Preformatted(
        "Customer app / branch tablet\n"
        "        │  ID photo + live selfie\n"
        "        ▼\n"
        "VeriLens pre-screen (forensics + face match + attestation)\n"
        "        │\n"
        "   ┌────┴────┬──────────────┐\n"
        "ACCEPT     REJECT        REVIEW\n"
        " auto      auto block    human KYC ops queue\n"
        " continue   + reason     + full lane evidence\n"
        "        │\n"
        "Existing vendor / DigiLocker / AML / core banking\n"
        "        │\n"
        "Audit: signed verdict + optional chain anchor for regulators",
        S["mono"],
    ))
    story.append(Paragraph("13.2 What the bank gains", S["h2"]))
    story.append(bullets([
        "Catch spliced ID portraits and AI selfies before a human spends time.",
        "Separate identity mismatch from deepfake presentation attacks.",
        "Reduce wrongful auto-rejects via honest REVIEW routing.",
        "Keep an immutable, timestamped record of what was decided and why "
        "(compliance / dispute).",
        "Does not replace government ID authority (DigiLocker / UIDAI) — "
        "complements it by checking the live capture and face link.",
    ], S["bullet"]))
    story.append(Paragraph("13.3 Example banking story", S["h2"]))
    story.append(Paragraph(
        "Applicant uploads a genuine Aadhaar scan (from gallery) and a live selfie. "
        "Lane E MATCH; B/C clean; attestation verifies → ACCEPT → continue to "
        "AML screening. Another applicant pastes another face onto an ID; Lane C "
        "flags inconsistent ELA cluster on the portrait → LIKELY_FAKE → REJECT "
        "with region box for the fraud analyst. A third uploads a 180 px blurry "
        "selfie → quality gate → REVIEW instead of locking them out forever.",
        S["example"],
    ))
    story.append(PageBreak())

    # ---- 14 ----
    story.append(Paragraph("14. How We Scale to Production", S["h1"]))
    story.append(simple_table([
        ["Layer", "Demo today", "Production scale"],
        ["Forensics compute", "Single uvicorn, CPU",
         "Horizontally scaled workers behind a queue (Redis/SQS); GPU pool for "
         "Lane A/E; autoscaling; request timeouts + circuit breakers."],
        ["Attestation nonces", "In-memory dict",
         "Redis/DB with TTL; sticky-free multi-instance."],
        ["Model serving", "Lazy load in process",
         "Dedicated inference service; batch faces; versioned model registry."],
        ["App backend data", "SQLite + Supabase free",
         "Managed Postgres; object storage; RLS per tenant/bank; PII encryption."],
        ["Blockchain anchor", "Sepolia testnet self-tx",
         "Mainnet or permissioned ledger; batch Merkle roots to cut gas; "
         "or hash-anchoring service."],
        ["Calibration", "Uncalibrated thresholds",
         "Bank-specific holdout; monitoring for drift; human feedback loop from REVIEW."],
        ["Privacy", "Optional Groq refine",
         "Default on-prem / VPC only; no third-party image egress without consent."],
        ["SLA", "Best effort demo",
         "p99 latency budgets; fallback REVIEW if forensics times out "
         "(never silent ACCEPT)."],
        ["Security", "Device Ed25519 + HTTPS",
         "mTLS to bank VPC; key rotation; SOC2 logging; red-team injection tests."],
    ], [32 * mm, 48 * mm, 90 * mm]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "Scaling principle: when in doubt under load or model failure, "
        "<b>route to REVIEW</b>, never invent ACCEPT.",
        S["body"],
    ))
    story.append(PageBreak())

    # ---- 15 ----
    story.append(Paragraph("15. Future Plans", S["h1"]))
    story.append(bullets([
        "Finish Lane A retrain on INP-X + 140k faces + augmentation; validate on "
        "real phone photos before raising confidence cap.",
        "Build a true calibration set → reliability diagrams → flip "
        "confidence_is_calibrated when earned.",
        "Production nonce store + multi-worker FastAPI deployment.",
        "Bank pilot: integrate as pre-screen webhook into existing KYC vendor.",
        "Stronger liveness (challenge-response / short video) beyond single-frame "
        "attestation.",
        "Tenant isolation, consent flows, and remove/disable third-party LLM refine "
        "for regulated PII.",
        "Optional mainnet / permissioned anchoring with batched Merkle proofs.",
        "Continuous evaluation harness against new generators (as diffusion models evolve).",
    ], S["bullet"]))
    story.append(PageBreak())

    # ---- 16 ----
    story.append(Paragraph("16. Quick Q&amp;A Cheat Sheet", S["h1"]))
    story.append(Paragraph(
        "<b>“Isn’t this just another deepfake detector?”</b> — No. KYC is a "
        "<i>paired identity</i> problem. Without ID↔selfie match and honest "
        "abstention, it’s a filter with a KYC sticker.",
        S["body"],
    ))
    story.append(Paragraph(
        "<b>“What’s novel?”</b> — System design for KYC + documented local-edit "
        "gap for faces — not a new named algorithm. Say that plainly.",
        S["body"],
    ))
    story.append(Paragraph(
        "<b>“Walk me through an upload.”</b> — Quality gate → lanes in parallel → "
        "judge gates (usable count, disagreement, band) → 3-axis verdict + reasons "
        "→ hash/sign/anchor.",
        S["body"],
    ))
    story.append(Paragraph(
        "<b>“What if a lane is missing?”</b> — It abstains; judge continues if ≥2 "
        "usable lanes remain; otherwise REVIEW.",
        S["body"],
    ))
    story.append(Paragraph(
        "<b>“Can confidence be trusted as probability?”</b> — Not yet. "
        "confidence_is_calibrated is false by design.",
        S["body"],
    ))
    story.append(Paragraph(
        "<b>“Where does the UI get numbers?”</b> — Only from the FastAPI JSON "
        "(plus local hash/signature/tx metadata). Client never invents forensic scores.",
        S["body"],
    ))
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "“In the age of AI, truth needs a receipt.” — VeriLens",
        S["cover_sub"],
    ))
    story.append(Paragraph(
        "Companion docs in repo: README.md · docs/PROJECT_STORY.md · HANDOFF.md · "
        "DEMO_SCRIPT.md · service/README.md · pitch/VeriLens_Pitch.pptx",
        S["caption"],
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="VeriLens — Pre-Presentation Reference",
        author="VeriLens",
    )
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
