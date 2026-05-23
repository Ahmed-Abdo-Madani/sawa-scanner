const axios = require('axios');
const fs = require('fs');

async function testZid() {
    try {
        const html = await axios.get('https://parkcentersa.com/products?search=6281036002013');
        const stateMatch = html.data.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
        if (stateMatch) {
            const stateStr = Buffer.from(stateMatch[1], 'base64').toString('utf-8');
            const state = JSON.parse(stateStr);
            
            const apiRes = await axios.get('https://parkcentersa.com/api/v1/products?search=6281036002013', {
                headers: {
                    'Authorization': 'Bearer ' + state.apiAuthorization,
                    'Accept-Language': 'ar',
                    'Store-Id': state.storeId,
                    'Role': 'Manager'
                }
            });
            console.log("API returned with ?search=", apiRes.data.data.products.data.length, "products");
        }
    } catch (e) {
        console.error("Error", e.message);
    }
}
testZid();
