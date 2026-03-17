import { BuyerReturnService } from './src/services/buyerReturnService.js';
import { connectDB, disconnectDB } from './src/db.js';

async function test() {
    await connectDB();
    try {
        console.log("Testing getAll to find a BuyerReturn...");
        const all = await BuyerReturnService.getAll({});
        if (all.length > 0) {
            const id = all[0].id;
            console.log("Testing getById for", id);
            const doc = await BuyerReturnService.getById(id);
            console.log("Success! Items count:", doc?.items?.length);
        } else {
            console.log("No Buyer Returns found in DB to test getById.");
        }
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await disconnectDB();
    }
}

test();
