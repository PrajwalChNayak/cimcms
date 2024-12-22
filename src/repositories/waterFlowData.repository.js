import prisma from "../models/index.model.js";

class WaterFlowDataRepository {
    static async create(data) {

        return await prisma.$runCommandRaw({
            insert: 'WaterFlowData',
            documents: [{
                ...data,
                timestamp: data.timestamp || new Date(),
            }]
        });

    }


    static async findById(id) {
        return await prisma.waterFlowData.findUnique({
            where: { id },
            include: { alerts: true }
        });
    }

    static async findByMacAddress(macAddress) {
        return await prisma.waterFlowData.findMany({
            where: { macAddress },
            include: { alerts: true },
            orderBy: { timestamp: 'desc' }
        });
    }

    static async findAll(query = {}) {
        const {
            skip = 0,
            take = 10,
            orderBy = { timestamp: 'desc' },
            where = {}
        } = query;

        return await prisma.waterFlowData.findMany({
            skip,
            take,
            where,
            orderBy,
            include: { alerts: true }
        });
    }

    static async update(id, data) {
        return await prisma.waterFlowData.update({
            where: { id },
            data,
            include: { alerts: true }
        });
    }

    static async delete(id) {
        return await prisma.waterFlowData.delete({
            where: { id }
        });
    }

    static async getAnalytics(macAddress, timeRange) {
        return await prisma.waterFlowData.aggregate({
            where: {
                macAddress,
                timestamp: timeRange
            },
            _avg: {
                flowRate: true,
                temperature: true,
                humidity: true,
                pressure: true,
                pH: true,
                tds: true,
                conductivity: true,
                turbidity: true
            },
            _sum: {
                totalLiters: true
            }
        });
    }
}

export default WaterFlowDataRepository;