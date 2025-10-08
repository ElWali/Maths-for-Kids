from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Navigate to the locally served Atlas.html file
        page.goto("http://localhost:8000/Atlas.html")

        # Wait for the map container to be present
        map_container = page.locator("#map-container")
        expect(map_container).to_be_visible()

        # Wait for a canvas element to be present, indicating the map has likely started rendering
        canvas = map_container.locator("canvas")
        expect(canvas).to_be_visible()

        # It's good practice to wait for some tiles to load.
        # We can do this by waiting for the network to be idle for a moment.
        page.wait_for_load_state('networkidle', timeout=10000)

        # Give a little extra time for rendering to complete
        page.wait_for_timeout(1000)

        # Take a screenshot of the fully rendered map
        page.screenshot(path="jules-scratch/verification/atlas_verification.png")

        print("Screenshot saved to jules-scratch/verification/atlas_verification.png")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        # Clean up
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run(playwright)