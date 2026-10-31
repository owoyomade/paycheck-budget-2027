"""Builds the buyer's "Start Here" PDF for Paycheck Budget 2027. PRIVATE: it contains the unlock code.

Usage: .venv/bin/python sell/make_start_here.py [OUTPUT.pdf] [--code PB-XXXX-XXXX-XXXX] [--url https://...] [--email ...]
Without --code, the code is read from private/unlock-codes.txt. The default output is
private/Paycheck-Budget-2027-Start-Here.pdf, which git never uploads. Attach that file to the Etsy listing.
Uses Hanken Grotesk from sell/fonts/ (the same font as the TrueCost Ledger guide).
"""
import argparse
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser()
ap.add_argument("out", nargs="?", default=str(ROOT / "private" / "Paycheck-Budget-2027-Start-Here.pdf"))
ap.add_argument("--code", default="")
ap.add_argument("--url", default="https://paycheck-budget-2027.pages.dev")
ap.add_argument("--email", default="appnookstudio@gmail.com")
args = ap.parse_args()

code = args.code
if not code:
    found = re.search(r"Unlock code:\s*(\S+)", (ROOT / "private" / "unlock-codes.txt").read_text())
    if not found:
        raise SystemExit("No unlock code found. Run `npm run unlock-code` or pass --code.")
    code = found.group(1)

# Brand colours, matching the app's default Cobalt theme (site/styles.css).
INK = colors.HexColor("#0D1017")
COBALT = colors.HexColor("#2546F0")
SOFT = colors.HexColor("#EEF1FE")
BG = colors.HexColor("#F4F5F7")
MUTED = colors.HexColor("#6B7080")
LINE = colors.HexColor("#E6E8EC")
LINK = "#2546F0"

FONTS = Path(__file__).parent / "fonts"
pdfmetrics.registerFont(TTFont("Hanken", FONTS / "HankenGrotesk-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Hanken-Bold", FONTS / "HankenGrotesk-Bold.ttf"))
pdfmetrics.registerFontFamily("Hanken", normal="Hanken", bold="Hanken-Bold", italic="Hanken", boldItalic="Hanken-Bold")

H1 = ParagraphStyle("H1", fontName="Hanken-Bold", fontSize=15, leading=19, textColor=INK, spaceBefore=11, spaceAfter=5)
BODY = ParagraphStyle("BODY", fontName="Hanken", fontSize=10.2, leading=14.2, textColor=INK, spaceAfter=3)
STEP = ParagraphStyle("STEP", parent=BODY, leftIndent=18, bulletIndent=0, spaceAfter=4)
CELL = ParagraphStyle("CELL", parent=BODY, fontSize=10, leading=14, spaceAfter=0)
BIG = ParagraphStyle("BIG", parent=BODY, fontName="Courier-Bold", fontSize=18, leading=23, textColor=INK)
SMALL = ParagraphStyle("SMALL", parent=BODY, fontSize=8.5, leading=12, textColor=MUTED)

W = letter[0] - 1.5 * inch

url = args.url.rstrip("/")
app_link = f"<link href='{escape(url)}' color='{LINK}'><u>{escape(url.replace('https://', ''))}</u></link>"
# The code goes after the #, so it stays on the buyer's device and never reaches the web server.
unlock_url = f"{url}/#unlock={code}"
unlock_link = f"<link href='{escape(unlock_url)}' color='{LINK}'><u>tap here to unlock</u></link>"
email = f"<link href='mailto:{escape(args.email)}' color='{LINK}'><u>{escape(args.email)}</u></link>"

story = []
p = lambda t, s=BODY: story.append(Paragraph(t, s))


def steps(items):
    for i, t in enumerate(items, 1):
        story.append(Paragraph(t, STEP, bulletText=f"{i}."))


def box(rows, bg=SOFT):
    t = Table([[r] for r in rows], colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg), ("BOX", (0, 0), (-1, -1), 0.75, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (0, 0), 12), ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
    ]))
    story.append(t)
    story.append(Spacer(1, 6))


# The title, logo and thank-you line are drawn in the ink band on page 1 (see first_page below).
story.append(Spacer(1, 0.85 * inch))
p("Paycheck Budget 2027 plans <b>every paycheck</b> of 2027: which paycheck pays each bill, and how much is "
  "<b>left to spend until your next payday</b>. It works on phones, tablets and computers, offline, with no monthly fee.")

p("1. Open the app", H1)
box([Paragraph(f"Open this link on the phone or computer you'll use:<br/>{app_link}", CELL)])

p("2. Install it like a real app (do this first)", H1)
p("Installing puts Paycheck Budget on your home screen or dock. It opens in its own window and works without internet.")
t = Table([
    [Paragraph("<b>iPhone / iPad</b>", CELL), Paragraph("Open the link in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>. "
                                                         "From now on, always open it from the home screen.", CELL)],
    [Paragraph("<b>Android</b>", CELL), Paragraph("Open the link in <b>Chrome</b>. Tap <b>Install</b> when asked, or the three-dot menu, then <b>Add to Home screen</b>.", CELL)],
    [Paragraph("<b>Windows / Mac (Chrome or Edge)</b>", CELL), Paragraph("Click the <b>install icon</b> at the right of the address bar, or <b>Install app</b> in the browser menu.", CELL)],
    [Paragraph("<b>Mac (Safari)</b>", CELL), Paragraph("Choose <b>File › Add to Dock</b>.", CELL)],
], colWidths=[1.9 * inch, W - 1.9 * inch])
t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                       ("BACKGROUND", (0, 0), (0, -1), BG),
                       ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
story.append(t)
p("<b>iPhone and iPad tip:</b> the home-screen app keeps its own copy, separate from Safari. Install it first, then unlock "
  "and enter your budget <b>inside the home-screen app</b>.", SMALL)

p("3. Unlock all of 2027", H1)
box([
    Paragraph(f"<b>Easiest:</b> on a computer or Android phone, {unlock_link}.", CELL),
    Spacer(1, 8),
    Paragraph("<b>Or</b> type this code in the app: open the <b>More</b> tab and enter it under <b>Free trial</b>.", CELL),
    Spacer(1, 4),
    Paragraph(escape(code), BIG),
])
p("Your unlock code is for your household only. Please keep it private.", SMALL)

p("Quick start: your first 10 minutes", H1)
steps([
    "<b>Look around the sample household (optional).</b> The app opens with a made-up household so you can see how it works. "
    "When you're ready, tap <i>Start mine</i> at the top.",
    "<b>Answer 5 quick questions.</b> How often you're paid, when and how much, your monthly bills, any yearly bills, and "
    "what you set aside from every paycheck (like groceries or savings).",
    "<b>Check Home.</b> The big number is what's <b>left to spend until your next payday</b>. Log spending there, "
    "and tick bills off as you pay them.",
    "<b>Ask before you buy.</b> Type a price into <i>Can I afford this?</i> on Home for a plain yes or no.",
    "<b>Even out tight paychecks.</b> On the <i>Plan</i> tab, tap <i>Smooth my paychecks</i>. It suggests paying a few "
    "bills a little early, never late, so no paycheck comes up short.",
    "<b>Plan your bonus paychecks and goals.</b> If you're paid every 2 weeks, 2027 has 2 extra paychecks. Decide on Home "
    "what they're for. Add a goal to any set-aside in <i>Setup</i> to track your progress.",
    "<b>Make it yours (optional).</b> In the <i>Me</i> tab, add your name, rename the app, and pick a colour, a font, "
    "and light or dark mode.",
])

story.append(KeepTogether([
    Paragraph("Keep your budget safe", H1),
    Paragraph("Your budget is saved <b>on your device</b>, not online. That keeps it private, but it means:", BODY),
    Paragraph("<b>Save a backup</b> once a month: <i>More › Your data › Save a backup</i>. Keep the file somewhere safe, "
              "such as email, Google Drive or iCloud.", STEP, bulletText="•"),
    Paragraph("<b>New phone or computer?</b> Save a backup on the old device, open the app on the new one, then choose "
              "<i>More › Your data › Restore a backup</i>. Enter your unlock code again on the new device.", STEP, bulletText="•"),
    Paragraph("Don't use a private or incognito window, because the browser deletes its data when you close it.", STEP, bulletText="•"),
]))

p("Questions", H1)
faq = [
    ("Is there a monthly fee?", "No. You pay once and keep it."),
    ("Do I need internet?", "Only to open it the first time. After that it works offline."),
    ("Does it connect to my bank?", "No. You enter your pay and bills yourself, so nothing is shared with anyone."),
    ("Can I use it on more than one device?", "Yes, on all of your own household's devices. Each device keeps its own copy, "
     "so use backup and restore to move your budget between them. They don't sync automatically."),
    ("Is my data private?", "Yes. There's no account, no ads and no tracking, and your budget never leaves your device."),
    ("Is this financial advice?", "No. It's a planning tool to help you organise your own money. Check amounts against "
     "your bank and your bills."),
]
t = Table([[Paragraph(f"<b>{q}</b>", CELL), Paragraph(a, CELL)] for q, a in faq], colWidths=[2.1 * inch, W - 2.1 * inch])
t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                       ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
story.append(t)

story.append(KeepTogether([
    Paragraph("Need help?", H1),
    Paragraph(f"Email {email}. Tell me what device you're using and what happened, and I'll get back to you.", BODY),
    Paragraph("Thank you for supporting a small studio. Look out for more simple, private apps from <b>AppNookStudio</b>.", BODY),
    Spacer(1, 10),
    Paragraph("<b>Licence:</b> one purchase covers one household, on all of its own devices. Please don't share or resell "
              "your unlock code or this file. Paycheck Budget 2027 is provided as is; keep regular backups.", SMALL),
]))


def footer(c, doc):
    c.saveState()
    c.setFont("Hanken", 8)
    c.setFillColor(MUTED)
    c.drawString(0.75 * inch, 0.5 * inch, "Paycheck Budget 2027 by AppNookStudio · Start here")
    c.drawRightString(letter[0] - 0.75 * inch, 0.5 * inch, f"Page {doc.page}")
    c.restoreState()


def draw_mark(c, x, y, size):
    """The app icon (same shape as site/icons/icon.svg): a ticked calendar page, drawn from its 40-unit box."""
    u = size / 40
    pt = lambda px, py: (x + px * u, y + (40 - py) * u)  # SVG y runs down, PDF y runs up
    c.setFillColor(colors.white)
    c.roundRect(x, y, size, size, 10 * u, stroke=0, fill=1)
    c.setFillColor(INK)
    c.roundRect(x + 2 * u, y + 2 * u, size - 4 * u, size - 4 * u, 8.5 * u, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.roundRect(*pt(9, 31), 22 * u, 21 * u, 3 * u, stroke=0, fill=1)
    c.setFillColor(INK)
    c.rect(*pt(9, 16.8), 22 * u, 1.8 * u, stroke=0, fill=1)
    c.setStrokeColor(COBALT)
    c.setLineWidth(2.8 * u)
    c.setLineCap(1)
    c.setLineJoin(1)
    path = c.beginPath()
    path.moveTo(*pt(14, 23.5)); path.lineTo(*pt(18.5, 27.5)); path.lineTo(*pt(26, 19.5))
    c.drawPath(path, stroke=1, fill=0)


def first_page(c, doc):
    """Ink band across the top of page 1 with the logo, name and a thank-you."""
    c.saveState()
    band = 1.45 * inch
    c.setFillColor(INK)
    c.rect(0, letter[1] - band, letter[0], band, stroke=0, fill=1)
    draw_mark(c, 0.75 * inch, letter[1] - band + 0.42 * inch, 0.62 * inch)
    c.setFillColor(colors.white)
    c.setFont("Hanken-Bold", 26)
    c.drawString(1.55 * inch, letter[1] - band + 0.72 * inch, "Paycheck Budget 2027")
    c.setFillColor(colors.HexColor("#AEBBFF"))
    c.setFont("Hanken", 12.5)
    c.drawString(1.55 * inch, letter[1] - band + 0.45 * inch, "Start here. Thank you for your purchase!")
    c.restoreState()
    footer(c, doc)


Path(args.out).parent.mkdir(parents=True, exist_ok=True)
SimpleDocTemplate(args.out, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                  topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                  title="Paycheck Budget 2027: Start Here", author="AppNookStudio").build(
    story, onFirstPage=first_page, onLaterPages=footer)
print("wrote", args.out)
