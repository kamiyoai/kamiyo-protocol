import axios from 'axios';

interface PaymentRequirement {
  error: string;
  price: string;
  merchant: string;
  paymentOptions: PaymentOption[];
}

interface PaymentOption {
  network: string;
  token: string;
  facilitator?: string;
}

async function fetchWithPayment(endpoint: string): Promise<any> {
  try {
    const response = await axios.get(`https://api.example.com${endpoint}`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 402) {
      const paymentReq: PaymentRequirement = error.response.data;

      // Option 1: Use PayAI Network
      const paymentToken = await authorizePayAI(paymentReq);

      const retryResponse = await axios.get(
        `https://api.example.com${endpoint}`,
        {
          headers: {
            'X-PAYMENT': paymentToken
          }
        }
      );

      return retryResponse.data;
    }
    throw error;
  }
}

async function authorizePayAI(req: PaymentRequirement): Promise<string> {
  // Integrate with PayAI SDK
  // Returns base64-encoded payment token
  throw new Error('Implement PayAI authorization');
}

async function directPayment(req: PaymentRequirement): Promise<string> {
  // Send USDC on-chain
  // Returns transaction hash
  throw new Error('Implement direct payment');
}

// Usage
(async () => {
  const data = await fetchWithPayment('/exploits');
  console.log(data);
})();
