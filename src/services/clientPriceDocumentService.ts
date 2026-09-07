import pool from '../db.js';

export interface CreateClientPriceDocDto {
    date?: string | Date;
    counterpartyId: string;
    comment?: string;
    items: {
        productId: string;
        costPrice: number;
        basePrice: number;
        discountPercent: number;
    }[];
}

export class ClientPriceDocumentService {
    /**
     * Get list of Client Price Documents with filters
     */
    static async getAll(filters: { counterpartyId?: string; status?: string; search?: string }) {
        let query = `
            SELECT 
                cpd.*,
                c.name as "counterpartyName",
                pt.name as "priceTypeName",
                u1.email as "createdByName",
                u2.email as "postedByName"
            FROM "ClientPriceDocument" cpd
            JOIN "Counterparty" c ON cpd."counterpartyId" = c.id
            LEFT JOIN "PriceType" pt ON cpd."priceTypeId" = pt.id
            LEFT JOIN "User" u1 ON cpd."createdBy" = u1.id
            LEFT JOIN "User" u2 ON cpd."postedBy" = u2.id
            WHERE COALESCE(cpd."isDeleted", false) = false
        `;
        const params: any[] = [];
        let paramIdx = 1;

        if (filters.counterpartyId) {
            query += ` AND cpd."counterpartyId" = $${paramIdx++}`;
            params.push(filters.counterpartyId);
        }

        if (filters.status) {
            query += ` AND cpd."status" = $${paramIdx++}`;
            params.push(filters.status);
        }

        if (filters.search) {
            query += ` AND (cpd."number" ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`;
            params.push(`%${filters.search}%`);
            paramIdx++;
        }

        query += ` ORDER BY cpd."date" DESC, cpd."createdAt" DESC`;

        const res = await pool.query(query, params);
        return res.rows;
    }

    /**
     * Get document by ID with items
     */
    static async getById(id: string) {
        const docRes = await pool.query(`
            SELECT 
                cpd.*,
                c.name as "counterpartyName",
                pt.name as "priceTypeName",
                u1.email as "createdByName",
                u2.email as "postedByName"
            FROM "ClientPriceDocument" cpd
            JOIN "Counterparty" c ON cpd."counterpartyId" = c.id
            LEFT JOIN "PriceType" pt ON cpd."priceTypeId" = pt.id
            LEFT JOIN "User" u1 ON cpd."createdBy" = u1.id
            LEFT JOIN "User" u2 ON cpd."postedBy" = u2.id
            WHERE cpd.id = $1 AND COALESCE(cpd."isDeleted", false) = false
        `, [id]);

        if (docRes.rows.length === 0) {
            throw new Error('Документ установки цін клієнта не знайдено');
        }

        const itemsRes = await pool.query(`
            SELECT 
                cpdi.*,
                p.code as "productCode",
                p.name as "productName",
                p.unit as "productUnit"
            FROM "ClientPriceDocumentItem" cpdi
            JOIN "Product" p ON cpdi."productId" = p.id
            WHERE cpdi."documentId" = $1
            ORDER BY cpdi."sortOrder" ASC, p.name ASC
        `, [id]);

        return {
            ...docRes.rows[0],
            items: itemsRes.rows.map(item => ({
                ...item,
                costPrice: Number(item.costPrice) || 0,
                basePrice: Number(item.basePrice) || 0,
                discountPercent: Number(item.discountPercent) || 0,
                finalPrice: Number(item.finalPrice) || 0
            }))
        };
    }

    /**
     * Prepare initial items list for a selected counterparty
     * Loads active products, cost price, base price for client's price type
     */
    static async prepareItems(counterpartyId: string) {
        if (!counterpartyId || typeof counterpartyId !== 'string') {
            throw new Error('Невалідний ID контрагента');
        }

        const cpRes = await pool.query(`
            SELECT c.id, c.name, c."priceTypeId", pt.name as "priceTypeName", pt.slug as "priceTypeSlug"
            FROM "Counterparty" c
            LEFT JOIN "PriceType" pt ON c."priceTypeId" = pt.id
            WHERE c.id = $1
        `, [counterpartyId]);

        if (cpRes.rows.length === 0) {
            throw new Error('Контрагента не знайдено');
        }

        const counterparty = cpRes.rows[0];
        const validPriceTypeId = (counterparty.priceTypeId && String(counterparty.priceTypeId).trim()) ? String(counterparty.priceTypeId).trim() : null;

        let query = `
            SELECT 
                p.id as "productId",
                p.code as "productCode",
                p.name as "productName",
                p.unit as "productUnit",
                p.prices as "productPrices",
                COALESCE(p."enterPrice", 0) as "costPrice",
                COALESCE(cdm."discountPercent", 0) as "currentDiscountPercent"
        `;

        if (validPriceTypeId) {
            query += `, COALESCE(pj."newPrice", 0) as "pjBasePrice"
            FROM "Product" p
            LEFT JOIN (
                SELECT DISTINCT ON ("productId") "productId", "newPrice"
                FROM "PriceJournal"
                WHERE "priceTypeId" = $2
                ORDER BY "productId", "effectiveDate" DESC, "createdAt" DESC
            ) pj ON pj."productId" = p.id
            LEFT JOIN "CounterpartyDiscountMatrix" cdm 
                ON cdm."productId" = p.id AND cdm."counterpartyId" = $1
            WHERE COALESCE(p."isDeleted", false) = false
            ORDER BY p.name ASC`;
        } else {
            query += `, 0 as "pjBasePrice"
            FROM "Product" p
            LEFT JOIN "CounterpartyDiscountMatrix" cdm 
                ON cdm."productId" = p.id AND cdm."counterpartyId" = $1
            WHERE COALESCE(p."isDeleted", false) = false
            ORDER BY p.name ASC`;
        }

        const queryParams = validPriceTypeId ? [counterpartyId, validPriceTypeId] : [counterpartyId];
        const itemsRes = await pool.query(query, queryParams);

        return {
            counterpartyId: counterparty.id,
            counterpartyName: counterparty.name,
            priceTypeId: counterparty.priceTypeId || null,
            priceTypeName: counterparty.priceTypeName || 'Не призначено',
            items: itemsRes.rows.map(row => {
                const costPrice = Number(row.costPrice) || 0;
                const pjPrice = Number(row.pjBasePrice) || 0;
                const pPrices = row.productPrices;

                let basePrice = pjPrice;
                if (!basePrice && pPrices && typeof pPrices === 'object') {
                    if (validPriceTypeId && pPrices[validPriceTypeId] !== undefined) {
                        basePrice = Number(pPrices[validPriceTypeId]) || 0;
                    } else if (counterparty.priceTypeSlug && pPrices[counterparty.priceTypeSlug] !== undefined) {
                        basePrice = Number(pPrices[counterparty.priceTypeSlug]) || 0;
                    } else if (pPrices['standard'] !== undefined) {
                        basePrice = Number(pPrices['standard']) || 0;
                    }
                }

                const discountPercent = Number(row.currentDiscountPercent) || 0;
                const discountFactor = (100 - discountPercent) / 100;
                const finalPrice = Math.round(basePrice * discountFactor * 100) / 100;

                return {
                    productId: row.productId,
                    productCode: row.productCode || '',
                    productName: row.productName || '',
                    productUnit: row.productUnit || 'шт',
                    costPrice,
                    basePrice,
                    discountPercent,
                    finalPrice
                };
            })
        };
    }

    /**
     * Create draft document
     */
    static async create(dto: CreateClientPriceDocDto, userId?: number) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const cpRes = await client.query(`SELECT "priceTypeId" FROM "Counterparty" WHERE id = $1`, [dto.counterpartyId]);
            if (cpRes.rows.length === 0) throw new Error('Контрагента не знайдено');
            const priceTypeId = cpRes.rows[0].priceTypeId;

            const countRes = await client.query('SELECT COUNT(*) FROM "ClientPriceDocument"');
            const nextNum = Number(countRes.rows[0].count) + 1;
            const docNumber = `ЦК-${String(nextNum).padStart(6, '0')}`;

            const docRes = await client.query(`
                INSERT INTO "ClientPriceDocument" (
                    "number", "date", "counterpartyId", "priceTypeId", "status", "comment", "createdBy", "createdAt", "updatedAt"
                )
                VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, NOW(), NOW())
                RETURNING *
            `, [docNumber, dto.date || new Date(), dto.counterpartyId, priceTypeId, dto.comment || null, userId || null]);

            const doc = docRes.rows[0];

            if (dto.items && dto.items.length > 0) {
                let sortOrder = 0;
                for (const item of dto.items) {
                    const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
                    const basePrice = Number(item.basePrice) || 0;
                    const costPrice = Number(item.costPrice) || 0;
                    const discountFactor = (100 - discountPercent) / 100;
                    const finalPrice = Math.round(basePrice * discountFactor * 100) / 100;

                    await client.query(`
                        INSERT INTO "ClientPriceDocumentItem" (
                            "documentId", "productId", "costPrice", "basePrice", "discountPercent", "finalPrice", "sortOrder"
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [doc.id, item.productId, costPrice, basePrice, discountPercent, finalPrice, sortOrder++]);
                }
            }

            await client.query('COMMIT');
            return doc;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Update draft document
     */
    static async update(id: string, dto: CreateClientPriceDocDto) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const checkRes = await client.query('SELECT status FROM "ClientPriceDocument" WHERE id = $1 FOR UPDATE', [id]);
            if (checkRes.rows.length === 0) throw new Error('Документ не знайдено');
            if (checkRes.rows[0].status === 'APPLIED') {
                throw new Error('Неможливо редагувати проведений документ. Спочатку розпроведіть його.');
            }

            await client.query(`
                UPDATE "ClientPriceDocument"
                SET "date" = COALESCE($1, "date"), "comment" = $2, "updatedAt" = NOW()
                WHERE id = $3
            `, [dto.date, dto.comment || null, id]);

            await client.query('DELETE FROM "ClientPriceDocumentItem" WHERE "documentId" = $1', [id]);

            if (dto.items && dto.items.length > 0) {
                let sortOrder = 0;
                for (const item of dto.items) {
                    const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
                    const basePrice = Number(item.basePrice) || 0;
                    const costPrice = Number(item.costPrice) || 0;
                    const discountFactor = (100 - discountPercent) / 100;
                    const finalPrice = Math.round(basePrice * discountFactor * 100) / 100;

                    await client.query(`
                        INSERT INTO "ClientPriceDocumentItem" (
                            "documentId", "productId", "costPrice", "basePrice", "discountPercent", "finalPrice", "sortOrder"
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [id, item.productId, costPrice, basePrice, discountPercent, finalPrice, sortOrder++]);
                }
            }

            await client.query('COMMIT');
            return await this.getById(id);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Post (Apply) document - applies discounts to CounterpartyDiscountMatrix
     */
    static async apply(id: string, userId?: number) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const docRes = await client.query('SELECT * FROM "ClientPriceDocument" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rows.length === 0) throw new Error('Документ не знайдено');
            const doc = docRes.rows[0];

            if (doc.status === 'APPLIED') throw new Error('Документ вже проведено');

            const itemsRes = await client.query('SELECT * FROM "ClientPriceDocumentItem" WHERE "documentId" = $1', [id]);

            for (const item of itemsRes.rows) {
                const discountPercent = Number(item.discountPercent);
                if (discountPercent > 0) {
                    await client.query(`
                        INSERT INTO "CounterpartyDiscountMatrix" (
                            "counterpartyId", "productId", "discountPercent", "documentId", "updatedAt"
                        )
                        VALUES ($1, $2, $3, $4, NOW())
                        ON CONFLICT ("counterpartyId", "productId")
                        DO UPDATE SET 
                            "discountPercent" = EXCLUDED."discountPercent",
                            "documentId" = EXCLUDED."documentId",
                            "updatedAt" = NOW()
                    `, [doc.counterpartyId, item.productId, discountPercent, id]);
                } else {
                    await client.query(`
                        DELETE FROM "CounterpartyDiscountMatrix"
                        WHERE "counterpartyId" = $1 AND "productId" = $2
                    `, [doc.counterpartyId, item.productId]);
                }
            }

            await client.query(`
                UPDATE "ClientPriceDocument"
                SET "status" = 'APPLIED', "postedBy" = $1, "postedAt" = NOW(), "updatedAt" = NOW()
                WHERE id = $2
            `, [userId || null, id]);

            await client.query('COMMIT');
            return await this.getById(id);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Unpost document - removes applied discounts from CounterpartyDiscountMatrix
     */
    static async unpost(id: string, userId?: number) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const docRes = await client.query('SELECT * FROM "ClientPriceDocument" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rows.length === 0) throw new Error('Документ не знайдено');
            const doc = docRes.rows[0];

            if (doc.status !== 'APPLIED') throw new Error('Документ не проведено');

            await client.query(`
                DELETE FROM "CounterpartyDiscountMatrix"
                WHERE "documentId" = $1
            `, [id]);

            await client.query(`
                UPDATE "ClientPriceDocument"
                SET "status" = 'DRAFT', "postedBy" = NULL, "postedAt" = NULL, "updatedAt" = NOW()
                WHERE id = $2
            `, [id]);

            await client.query('COMMIT');
            return await this.getById(id);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Delete document (soft delete)
     */
    static async delete(id: string) {
        const docRes = await pool.query('SELECT status FROM "ClientPriceDocument" WHERE id = $1', [id]);
        if (docRes.rows.length === 0) throw new Error('Документ не знайдено');
        if (docRes.rows[0].status === 'APPLIED') {
            throw new Error('Неможливо видалити проведений документ. Спочатку розпроведіть його.');
        }

        await pool.query('UPDATE "ClientPriceDocument" SET "isDeleted" = true, "updatedAt" = NOW() WHERE id = $1', [id]);
        return { success: true };
    }

    /**
     * Get active discounts for a counterparty from CounterpartyDiscountMatrix
     */
    static async getActiveDiscounts(counterpartyId: string) {
        const res = await pool.query(`
            SELECT cdm.*, p.code as "productCode", p.name as "productName"
            FROM "CounterpartyDiscountMatrix" cdm
            JOIN "Product" p ON cdm."productId" = p.id
            WHERE cdm."counterpartyId" = $1
        `, [counterpartyId]);
        return res.rows.map(r => ({
            ...r,
            discountPercent: Number(r.discountPercent)
        }));
    }
}
