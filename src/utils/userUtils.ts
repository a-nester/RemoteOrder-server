export function getUserAllowedWarehouses(user: any): string[] | null {
    if (!user || user.role === 'admin') {
        return null; // Null means unlimited access (admin)
    }
    const set = new Set<string>();
    if (user.warehouseId) set.add(user.warehouseId);
    if (Array.isArray(user.visibleWarehouses)) {
        user.visibleWarehouses.forEach((id: string) => {
            if (id) set.add(id);
        });
    }
    return Array.from(set);
}

export function getUserAllowedTerritories(user: any): string[] | null {
    if (!user || user.role === 'admin') {
        return null; // Null means unlimited access (admin sees all counterparties/documents)
    }
    if (Array.isArray(user.visibleTerritories) && user.visibleTerritories.length > 0) {
        return user.visibleTerritories;
    }
    return null;
}

export function getUserAllowedPriceTypes(user: any): string[] | null {
    if (!user || user.role === 'admin') {
        return null; // Null means unlimited access (admin sees all price types)
    }
    if (Array.isArray(user.visiblePriceTypes) && user.visiblePriceTypes.length > 0) {
        return user.visiblePriceTypes;
    }
    return null;
}
