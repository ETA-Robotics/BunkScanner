"""Remove annotation text/lines from feedlot aerial photo using inpainting."""
import cv2
import numpy as np

img = cv2.imread('feedlot-layout.jpg')
h, w = img.shape[:2]  # 1290 x 2990
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
mask = np.zeros((h, w), dtype=np.uint8)

# ── 1. LOCAL CONTRAST: detect white text (brighter than surroundings) ──
local_mean = cv2.blur(gray, (35, 35))
# White text pixels stand out above local mean
white_text = ((gray - local_mean) > 20).astype(np.uint8) * 255
# Remove large bright areas (actual structures like tanks, roads) 
# by opening - this removes thin text strokes but keeps big blobs
kern_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
white_big = cv2.morphologyEx(white_text, cv2.MORPH_OPEN, kern_open)
white_text_only = cv2.subtract(white_text, white_big)
mask = cv2.bitwise_or(mask, white_text_only)
print(f"After white text: {np.count_nonzero(mask)} pixels")

# ── 2. LOCAL CONTRAST: detect dark outlines (darker than surroundings) ──
dark_outline = ((local_mean - gray) > 35).astype(np.uint8) * 255
# Remove large dark areas (real shadows, structures)
dark_big = cv2.morphologyEx(dark_outline, cv2.MORPH_OPEN, kern_open)
dark_text_only = cv2.subtract(dark_outline, dark_big)
# Only include dark outlines that are near white text (within 15px)
white_dilated = cv2.dilate(white_text_only, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
dark_near_text = cv2.bitwise_and(dark_text_only, white_dilated)
mask = cv2.bitwise_or(mask, dark_near_text)
print(f"After dark outlines: {np.count_nonzero(mask)} pixels")

# ── 3. BLUE DASHED LINES (distinctive blue color) ──
b, g, r = img[:,:,0].astype(int), img[:,:,1].astype(int), img[:,:,2].astype(int)
blue_mask = ((b - r > 25) & (b - g > 25) & (b > 100)).astype(np.uint8) * 255
mask = cv2.bitwise_or(mask, blue_mask)
print(f"After blue lines: {np.count_nonzero(mask)} pixels")

# ── 4. BLACK DASHED ANNOTATION LINES ── 
# Thin dark pixels (<40) that form lines (annotation borders, dimension lines)
# These are near-pure-black drawn lines vs natural dark features
very_dark = (gray < 40).astype(np.uint8) * 255
# Opening removes thin lines, keeps thick/large dark objects
kern_line = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
dark_thick = cv2.morphologyEx(very_dark, cv2.MORPH_OPEN, kern_line)
thin_dark_lines = cv2.subtract(very_dark, dark_thick)
mask = cv2.bitwise_or(mask, thin_dark_lines)
print(f"After thin dark lines: {np.count_nonzero(mask)} pixels")

# ── 5. TARGETED RECTANGULAR REGIONS for stubborn text ──
# Define generous rectangles around known text, fully mask within
annotation_rects = [
    # Top dimension line + "280m / D SIDE BUNK LENGTH"
    (100, 20, 850, 80),
    # Dimension arrows: vertical endcaps
    (95, 20, 105, 100),
    (830, 20, 840, 100),
    # "TRUCK HAUL ROAD" top-D
    (600, 65, 1050, 100),
    # "TRUCK HAUL ROAD" top-right (D side, further right) 
    (1650, 128, 2280, 170),
    # Left side text blocks: "* SIDE PICTURES TAKEN FROM THIS POINT AND DIRECTION"
    (0, 55, 145, 185),    # D side
    (0, 365, 145, 460),   # C side
    (0, 525, 145, 610),   # B side
    (0, 770, 145, 850),   # Z side (if visible)
    # D row pen labels (y≈190-230)
    (130, 188, 1300, 232),
    # C row pen labels (y≈375-415) 
    (130, 370, 2350, 418),
    # "515m / C SIDE BUNK LENGTH"
    (600, 415, 920, 465),
    # "BUNK CHANGE LOCATION, CHANGE IN PROFILE FROM..."
    (1500, 410, 2200, 470),
    # "TRUCK HAUL ROAD" between C and B (two instances)
    (400, 465, 950, 505),
    (1450, 465, 2250, 505),
    # "500m / B SIDE BUNK LENGTH"
    (550, 500, 920, 550),
    # B row pen labels (y≈555-595)
    (130, 550, 2500, 600),
    # "EXISTING SOLAR PANEL/BATTERY STATION FOR CATTLE LOAD OUT"
    (2300, 500, 2750, 600),
    # Z row pen labels (y≈725-770)
    (130, 720, 2400, 775),
    # "LIVESTOCK INDUCTION SHED. POWER AVAILABLE"
    (2350, 690, 2750, 770),
    # Compass rose (top right)
    (2670, 0, 2960, 145),
]

# Within each rectangle, mask pixels that significantly deviate from local background
for (x1, y1, x2, y2) in annotation_rects:
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    region = gray[y1:y2, x1:x2]
    med = np.median(region)
    # Mask bright (text fill) and dark (text outline) pixels 
    bright_in_region = (region > med + 12) | (region < med - 20)
    # Also mask everything for heavily annotated regions (dimension text, labels)
    mask[y1:y2, x1:x2] = np.maximum(
        mask[y1:y2, x1:x2], 
        bright_in_region.astype(np.uint8) * 255
    )

print(f"After rect regions: {np.count_nonzero(mask)} pixels")

# ── 6. COMPASS ROSE: fully mask the area ──
cv2.rectangle(mask, (2700, 0), (2940, 130), 255, -1)

# ── 7. Dilate mask to cover text edges and outlines ──
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=2)
print(f"After dilation: {np.count_nonzero(mask)} pixels ({np.count_nonzero(mask)*100/(h*w):.1f}%)")

# ── 8. INPAINT ──
result = cv2.inpaint(img, mask, 12, cv2.INPAINT_TELEA)

cv2.imwrite('feedlot-layout-clean.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 95])
cv2.imwrite('_debug_mask3.png', mask)
print("Saved feedlot-layout-clean.jpg and _debug_mask3.png")
