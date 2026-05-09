"""
Convert HTML event slide to PNG, JPEG, and SVG formats
Requires: pip install playwright pillow
Then run: playwright install chromium
"""

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image


async def convert_html_to_images():
    script_dir = Path(__file__).parent
    html_file = script_dir / "slide.html"
    output_dir = script_dir / "slide_exports"
    output_dir.mkdir(exist_ok=True)

    html_url = f"file:///{html_file.absolute().as_posix()}"

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})

        await page.goto(html_url)
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(1)

        slide_el = await page.query_selector(".slide")

        if slide_el:
            png_path = output_dir / "indyhax_slide.png"
            await slide_el.screenshot(path=str(png_path))
            print(f"✓ Created PNG: {png_path}")

            jpeg_path = output_dir / "indyhax_slide.jpg"
            img = Image.open(png_path)
            if img.mode == "RGBA":
                rgb_img = Image.new("RGB", img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
                img = rgb_img
            img.save(jpeg_path, "JPEG", quality=95)
            print(f"✓ Created JPEG: {jpeg_path}")

            svg_path = output_dir / "indyhax_slide.svg"
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(
                    """<?xml version="1.0" encoding="UTF-8"?>
<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image width="1920" height="1080" xlink:href="indyhax_slide.png"/>
</svg>"""
                )
            print(f"✓ Created SVG: {svg_path}")

        await browser.close()

    print(f"\n✓ All formats exported to: {output_dir}")


if __name__ == "__main__":
    asyncio.run(convert_html_to_images())
