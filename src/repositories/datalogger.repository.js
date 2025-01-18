import prisma from "../models/index.model.js";

class DataLoggerRepository {
    static async storeData(data) {
        return await prisma.$runCommandRaw({
            insert: 'DataLogger',
            documents: [{
                ...data,
                timestamp: data.timestamp || new Date(),
            }]
        });
        // return await prisma.DataLogger.create({
        //     data: data,
        //     select: {
        //         id: true,
        //         macAddress: true,
        //         date: true,
        //         fileName: true,
        //         // Include all other fields that might be in the data
        //         ...Object.keys(data).reduce((acc, key) => {
        //             acc[key] = true;
        //             return acc;
        //         }, {})
        //     }
        // });
    }
}

export default DataLoggerRepository;