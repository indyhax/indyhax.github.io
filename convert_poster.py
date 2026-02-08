"""
Convert HTML poster to PNG, JPEG, and SVG formats
Requires: pip install playwright pillow
Then run: playwright install chromium
"""

import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

async def convert_html_to_images():
    # Setup paths
    script_dir = Path(__file__).parent
    html_file = script_dir / "poster.html"
    output_dir = script_dir / "poster_exports"
    output_dir.mkdir(exist_ok=True)
    
    # Convert to absolute file URL
    html_url = f"file:///{html_file.absolute().as_posix()}"
    
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1920, 'height': 1080})
        
        # Navigate to the HTML file
        await page.goto(html_url)
        
        # Wait for fonts and images to load
        await page.wait_for_load_state('networkidle')
        await asyncio.sleep(1)  # Extra time for fonts
        
        # Find the poster element
        poster = await page.query_selector('.poster')
        
        if poster:
            # Take screenshot as PNG
            png_path = output_dir / "indyhax_poster.png"
            await poster.screenshot(path=str(png_path))
            print(f"✓ Created PNG: {png_path}")
            
            # Convert PNG to JPEG
            jpeg_path = output_dir / "indyhax_poster.jpg"
            img = Image.open(png_path)
            # Convert RGBA to RGB for JPEG
            if img.mode == 'RGBA':
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
                img = rgb_img
            img.save(jpeg_path, 'JPEG', quality=95)
            print(f"✓ Created JPEG: {jpeg_path}")
            
            # For SVG, we'll create a simple wrapper that embeds the PNG
            # (True vector SVG would require recreating the design in SVG format)
            svg_path = output_dir / "indyhax_poster.svg"
            with open(svg_path, 'w') as f:
                f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image width="1920" height="1080" xlink:href="indyhax_poster.png"/>
</svg>''')
            print(f"✓ Created SVG: {svg_path}")
            
        await browser.close()
    
    print(f"\n✓ All formats exported to: {output_dir}")

if __name__ == "__main__":
    asyncio.run(convert_html_to_images())
