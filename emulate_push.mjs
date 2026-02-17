// import fetch from 'node-fetch';

const API_URL = "https://remoteorder-server.onrender.com/api/sync/push";
// const API_URL = "http://localhost:5001/api/sync/push";

const payload = {
  userId: "1", // Use admin user ID
  changes: [
    {
      id: "test-order-" + Date.now(),
      table: "Order",
      operation: "INSERT",
      data: {
        counterpartyId: "b5f648dd-3904-4fcf-bf6d-f4c1c95c0535", // ID from user logs
        status: "NEW",
        total: 123.45,
        items: []
      }
    }
  ]
};

async function pushOrder() {
  try {
    console.log("Pushing to:", API_URL);
    console.log("Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", text);
    
  } catch (error) {
    console.error("Fetch error:", error);
  }
}

pushOrder();
