"""A driver's licence, front and back, together on one A4 page (PDF)."""

import io

from PIL import Image, ImageDraw, ImageOps

# A4 at 150 dpi.
PAGE_W, PAGE_H = 1240, 1754
MARGIN = 90
HEADER = 120


IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic")


def kind_of(f):
    """"image", "pdf" or "word" for a stored licence file."""
    name = (f.original_name or "").lower()
    if (f.content_type or "") == "application/pdf" or name.endswith(".pdf"):
        return "pdf"
    if name.endswith((".doc", ".docx")):
        return "word"
    return "image"


def download_mode(files):
    """What the download button gives for these files: "combined" (the photos
    on one A4 page), "pdf" or "word" (the original file), or "" (nothing)."""
    kinds = [kind_of(f) for f in files]
    for mode, kind in (("combined", "image"), ("pdf", "pdf"), ("word", "word")):
        if kind in kinds:
            return mode
    return ""


def _open(data):
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # phone photos carry their rotation
    return img.convert("RGB")


def build(driver_name, pictures):
    """One page: the driver's name, then each picture (front, back) stacked and
    centred, scaled to fit. Returns the PDF bytes."""
    page = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(page)
    try:
        from PIL import ImageFont

        title = ImageFont.load_default(size=34)
        small = ImageFont.load_default(size=24)
    except Exception:
        title = small = None
    draw.text((MARGIN, MARGIN - 20), f"{driver_name} - driver's licence", fill="#111111", font=title)

    count = max(1, len(pictures))
    slot_h = (PAGE_H - MARGIN - HEADER - MARGIN) // count
    labels = ["Front", "Back"] if len(pictures) > 1 else ["Licence"]
    for i, data in enumerate(pictures):
        img = _open(data)
        box_w, box_h = PAGE_W - 2 * MARGIN, slot_h - 60
        img.thumbnail((box_w, box_h))
        top = HEADER + MARGIN // 2 + i * slot_h
        draw.text((MARGIN, top), labels[i] if i < len(labels) else f"Photo {i + 1}", fill="#555555", font=small)
        x = (PAGE_W - img.width) // 2
        y = top + 36
        page.paste(img, (x, y))
        draw.rectangle([x - 1, y - 1, x + img.width, y + img.height], outline="#bbbbbb")
    out = io.BytesIO()
    page.save(out, format="PDF", resolution=150.0)
    return out.getvalue()
