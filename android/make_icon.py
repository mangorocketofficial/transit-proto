# 앱 아이콘: 지도 위에 노선 두 줄과 정류장
import sys
from PIL import Image, ImageDraw

S = 432  # 크게 그린 뒤 줄여서 가장자리를 부드럽게
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=96, fill=(223, 228, 204, 255))
d.ellipse([40, 50, 210, 220], fill=(155, 205, 165, 255))
d.ellipse([230, 200, 400, 370], fill=(160, 190, 240, 255))
d.line([(290, -10), (250, 150), (300, 440)], fill=(116, 179, 227, 255), width=46, joint='curve')
d.line([(110, 130), (215, 300), (330, 290)], fill=(255, 255, 255, 255), width=38, joint='curve')
d.line([(110, 130), (215, 300), (330, 290)], fill=(183, 28, 28, 255), width=26, joint='curve')
for x, y, col in [(110, 130, (46, 158, 72)), (215, 300, (229, 127, 23)), (330, 290, (47, 111, 224))]:
    d.ellipse([x - 34, y - 34, x + 34, y + 34], fill=(255, 255, 255, 255), outline=col + (255,), width=13)
im.resize((144, 144), Image.LANCZOS).save(sys.argv[1])
