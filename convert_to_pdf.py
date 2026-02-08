"""
Convert HTML posters to PDF format
Requires: pip install playwright
"""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def convert_to_pdf():
    # Setup paths
    script_dir = Path(__file__).parent
    output_dir = script_dir / "poster_exports"
    output_dir.mkdir(exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        
        # Convert 16:9 poster
        print("Converting 16:9 poster to PDF...")
        html_file = script_dir / "poster.html"
        html_url = f"file:///{html_file.absolute().as_posix()}"
        page = await browser.new_page(viewport={'width': 1920, 'height': 1080})
        await page.goto(html_url)
        await page.wait_for_load_state('networkidle')
        await asyncio.sleep(1)
        
        pdf_path = output_dir / "indyhax_poster_16x9.pdf"
        await page.pdf(
            path=str(pdf_path),
            width='16in',
            height='9in',
            print_background=True,
            margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'},
            prefer_css_page_size=False
        )
        print(f"✓ Created PDF: {pdf_path}")
        await page.close()
        
        # Convert letter-size poster
        print("\nConverting letter-size poster to PDF...")
        html_file = script_dir / "poster_letter.html"
        html_url = f"file:///{html_file.absolute().as_posix()}"
        page = await browser.new_page(viewport={'width': 2550, 'height': 3300})
        await page.goto(html_url)
        await page.wait_for_load_state('networkidle')
        await asyncio.sleep(1)
        
        pdf_path = output_dir / "indyhax_poster_letter.pdf"
        await page.pdf(
            path=str(pdf_path),
            width='8.5in',
            height='11in',
            print_background=True,
            margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'},
            prefer_css_page_size=False,
            scale=1.0
        )
        print(f"✓ Created PDF: {pdf_path}")
        await page.close()
        
        await browser.close()
    
    print(f"\n✓ All PDFs exported to: {output_dir}")
    print(f"  - indyhax_poster_16x9.pdf (16\" × 9\" for digital displays)")
    print(f"  - indyhax_poster_letter.pdf (8.5\" × 11\" for printing)")

if __name__ == "__main__":
    asyncio.run(convert_to_pdf())

