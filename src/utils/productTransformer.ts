export interface Product {
    id: string;
    name: string;
    unit: string;
    category: string;
    prices?: any; // internal use
    price?: number; // external use
    photos?: string[];
    deleted: boolean;
    updatedAt: Date;
}

export interface User {
    id: string;
    priceType?: string;
}

export const transformProductForUser = (product: Product, user?: User): Partial<Product> => {
    // 1. Clone product to avoid mutating original
    const { prices, ...publicProduct } = product;

    // 2. If no user (Public API), return without price info
    if (!user) {
        return publicProduct;
    }

    // 3. If user exists, determine price
    const priceType = user.priceType || 'standard';
    const price = (prices && prices[priceType]) !== undefined
        ? Number(prices[priceType])
        : (prices && prices['standard'] !== undefined ? Number(prices['standard']) : 0);

    // 4. Return product with specific price
    return {
        ...publicProduct,
        price
    };
};
