
import struct
from PIL import Image

icon_path = "/Users/jolsen/Documents/_git/playground/assets/icon.png"
ico_path = "/Users/jolsen/Documents/_git/playground/assets/icon.ico"

img = Image.open(icon_path)
sizes = [16, 32, 48, 64, 128, 256]
images = []

for size in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    images.append(resized)

images[0].save(ico_path, format='ICO', sizes=[(s, s) for s in sizes])
