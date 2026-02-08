"""
Convert letter-size HTML poster to PNG and JPEG formats
Requires: pip install playwright pillow
"""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

async def convert_letter_poster():
    # Setup paths
    script_dir = Path(__file__).parent
    html_file = script_dir / "poster_letter.html"
    output_dir = script_dir / "poster_exports"
    output_dir.mkdir(exist_ok=True)
    
    # Convert to absolute file URL
    html_url = f"file:///{html_file.absolute().as_posix()}"
    
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch()
        # Letter size at 300 DPI: 8.5" × 11" = 2550px × 3300px
        page = await browser.new_page(viewport={'width': 2550, 'height': 3300})
        
        # Navigate to the HTML file
        await page.goto(html_url)
        
        # Wait for fonts and images to load
        await page.wait_for_load_state('networkidle')
        await asyncio.sleep(1)  # Extra time for fonts
        
        # Find the poster element
        poster = await page.query_selector('.poster')
        
        if poster:
            # Take screenshot as PNG
            png_path = output_dir / "indyhax_poster_letter.png"
            await poster.screenshot(path=str(png_path))
            print(f"✓ Created PNG: {png_path}")
            
            # Convert PNG to JPEG
            jpeg_path = output_dir / "indyhax_poster_letter.jpg"
            img = Image.open(png_path)
            # Convert RGBA to RGB for JPEG
            if img.mode == 'RGBA':
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
                img = rgb_img
            img.save(jpeg_path, 'JPEG', quality=95)
            print(f"✓ Created JPEG: {jpeg_path}")
            
            # Also create a lower resolution version for digital use (150 DPI)
            digital_png_path = output_dir / "indyhax_poster_letter_digital.png"
            img_digital = Image.open(png_path)
            img_digital = img_digital.resize((1275, 1650), Image.Resampling.LANCZOS)
            img_digital.save(digital_png_path, 'PNG')
            print(f"✓ Created digital PNG (150 DPI): {digital_png_path}")
            
        await browser.close()
    
    print(f"\n✓ Letter-size poster exported to: {output_dir}")
    print(f"  - Use *_letter.png or *_letter.jpg for high-quality printing (300 DPI)")
    print(f"  - Use *_letter_digital.png for digital displays (150 DPI)")

if __name__ == "__main__":
    asyncio.run(convert_letter_poster())
