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
