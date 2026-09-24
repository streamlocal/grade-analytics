"""Generate an anonymized Canvas token walkthrough based on the supplied settings page.

The saved HTML contains private account details, so the public GIF intentionally
recreates only the Approved Integrations heading and New Access Token flow.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parents[1] / "src/assets/canvas-token-guide.gif"
REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT = ImageFont.truetype(REGULAR, 19)
SMALL = ImageFont.truetype(REGULAR, 16)
TINY = ImageFont.truetype(REGULAR, 13)
HEADING = ImageFont.truetype(BOLD, 27)
BOLD_FONT = ImageFont.truetype(BOLD, 19)


def label(draw, xy, text, font=FONT, fill="#26323a"):
    draw.text(xy, text, font=font, fill=fill)


def rounded(draw, box, fill, outline=None, radius=9, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def base(step, caption):
    im = Image.new("RGB", (1000, 590), "#f4f7f8")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1000, 42), fill="#243746")
    d.ellipse((20, 16, 30, 26), fill="#e28d8d")
    d.ellipse((38, 16, 48, 26), fill="#e8c77a")
    d.ellipse((56, 16, 66, 26), fill="#9dd7b1")
    rounded(d, (158, 7, 833, 35), "#f7f9fa", radius=6)
    label(d, (173, 12), "saintignatius.instructure.com/profile/settings", TINY)
    d.rectangle((0, 42, 1000, 96), fill="#fff")
    d.rectangle((0, 95, 1000, 96), fill="#d5dde3")
    label(d, (30, 58), "Canvas", HEADING, "#0c6a95")
    label(d, (145, 63), "Account      Dashboard      Courses      Calendar", SMALL, "#46545d")
    rounded(d, (25, 117, 240, 508), "#fff", "#d8e1e7")
    label(d, (48, 143), "User Settings", BOLD_FONT)
    for i, item in enumerate(["Profile", "Notifications", "Files", "ePortfolios", "Settings"]):
        y = 197 + i * 47
        if item == "Settings":
            rounded(d, (39, y - 8, 225, y + 29), "#e8f3f8")
        label(d, (54, y), item, SMALL, "#53616a")
    rounded(d, (267, 117, 970, 508), "#fff", "#d8e1e7")
    d.rectangle((0, 523, 1000, 590), fill="#e8f2f7")
    label(d, (28, 539), f"{step} / 5", BOLD_FONT, "#0a698c")
    label(d, (107, 539), caption, BOLD_FONT)
    label(d, (28, 571), "Illustration based on Canvas User Settings. Your school may show a different expiration limit.", TINY, "#5d6d77")
    return im, d


def cursor(draw, x, y):
    draw.polygon([(x, y), (x + 2, y + 24), (x + 8, y + 18), (x + 15, y + 32), (x + 20, y + 29), (x + 13, y + 16), (x + 23, y + 14)], fill="#172a36", outline="#fff")


frames = []

im, d = base(1, "Open Canvas User Settings and scroll down")
label(d, (305, 148), "User Settings", HEADING)
for y, title in [(214, "Profile"), (303, "Ways to Contact"), (392, "Web Services")]:
    label(d, (305, y), title, BOLD_FONT)
    d.line((305, y + 34, 914, y + 34), fill="#e1e6ea", width=2)
d.rectangle((947, 145, 952, 476), fill="#e3e8ec")
rounded(d, (945, 153, 954, 255), "#9fb1bd", radius=4)
label(d, (760, 461), "Scroll down  ↓", BOLD_FONT, "#0a709d")
frames.append(im)

im, d = base(2, "Find Approved Integrations")
label(d, (305, 150), "Approved Integrations", HEADING)
d.line((305, 190, 914, 190), fill="#d3dce2", width=2)
for y in (218, 271, 324):
    rounded(d, (305, y, 900, y + 43), "#f6f8fa", "#e0e7eb", radius=5)
    label(d, (325, y + 11), "Existing integration", SMALL, "#7b8b95")
rounded(d, (307, 390, 512, 435), "#0b6fa4", radius=5)
label(d, (323, 399), "+  New Access Token", SMALL, "#fff")
rounded(d, (295, 380, 525, 445), None, "#ef9b37", radius=8, width=5)
d.rectangle((947, 145, 952, 476), fill="#e3e8ec")
rounded(d, (945, 366, 954, 466), "#9fb1bd", radius=4)
cursor(d, 496, 414)
frames.append(im)

im, d = base(3, "Click New Access Token")
label(d, (305, 150), "Approved Integrations", HEADING)
rounded(d, (307, 390, 512, 435), "#0b6fa4", radius=5)
label(d, (323, 399), "+  New Access Token", SMALL, "#fff")
rounded(d, (300, 383, 519, 443), None, "#ef9b37", radius=8, width=5)
cursor(d, 415, 411)
frames.append(im)

im, d = base(4, "Set a purpose and the latest allowed expiration")
d.rectangle((267, 117, 970, 508), fill="#cdd6dc")
rounded(d, (356, 143, 874, 484), "#fff", "#b7c5cd", radius=9)
label(d, (380, 163), "New Access Token", HEADING)
label(d, (381, 220), "Purpose", SMALL)
rounded(d, (380, 248, 848, 289), "#fff", "#aab8c0", radius=5)
label(d, (394, 258), "Grade Analytics", SMALL)
label(d, (381, 313), "Expiration", SMALL)
rounded(d, (380, 341, 848, 382), "#fff", "#aab8c0", radius=5)
label(d, (394, 351), "Latest date Canvas allows", SMALL)
rounded(d, (370, 331, 858, 391), None, "#ef9b37", radius=7, width=5)
rounded(d, (657, 421, 847, 463), "#0b6fa4", radius=5)
label(d, (687, 430), "Generate token", SMALL, "#fff")
frames.append(im)

im, d = base(5, "Copy the new token, then paste it into Grade Analytics")
rounded(d, (322, 150, 921, 474), "#fff", "#bdcbd3", radius=9)
label(d, (345, 174), "Your new access token", HEADING)
label(d, (345, 220), "Canvas shows this value only once. Keep it private.", SMALL, "#5d6d77")
rounded(d, (345, 264, 735, 309), "#f6f8fa", "#bfcbd2", radius=5)
label(d, (360, 275), "•••• •••• •••• ••••", SMALL)
rounded(d, (749, 264, 874, 309), "#0b6fa4", radius=5)
label(d, (787, 275), "Copy", SMALL, "#fff")
rounded(d, (740, 255, 884, 318), None, "#ef9b37", radius=7, width=5)
label(d, (345, 365), "Paste it into the API token field in Grade Analytics.", SMALL)
cursor(d, 811, 288)
frames.append(im)

OUT.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=[1600, 1500, 1400, 2400, 2600], loop=0, optimize=True, disposal=2)
print(f"Generated {OUT}")
