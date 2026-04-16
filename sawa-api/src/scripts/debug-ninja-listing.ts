import { chromium, Response } from 'playwright';

async function run() {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    let listingProduct: any = null;

    page.on('response', async (response: Response) => {
        if (response.url().includes('graphql.ananinja.com')) {
            try {
                const req = response.request();
                const postData = JSON.parse(req.postData() || '{}');
                if (postData.operationName === 'CatalogProducts' || postData.operationName === 'GetCategory') {
                    const json = await response.json();
                    
                    const recursiveFind = (obj: any) => {
                        if (!obj || typeof obj !== 'object') return;
                        if (obj.productId || obj.id || obj.gtin) {
                            if (obj.price || obj.priceCents || obj.originalPriceCents) {
                                listingProduct = obj;
                            }
                        }
                        if (!listingProduct) {
                            for (const key in obj) {
                                recursiveFind(obj[key]);
                            }
                        }
                    };
                    recursiveFind(json);
                }
            } catch (e) {}
        }
    });

    console.log('Navigating to listing page...');
    await page.goto('https://ananinja.com/sa/en/category/milk', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    if (listingProduct) {
        console.log('--- LISTING PRODUCT DATA FOUND ---');
        console.log(JSON.stringify(listingProduct, null, 2));
    } else {
        console.log('Listing product data not found.');
    }

    await browser.close();
}

run();
