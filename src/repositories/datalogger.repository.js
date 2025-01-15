import prisma from "../models/index.model.js";


class DataLoggerRepository {

    static async storeData(data) {
        return await prisma.DataLogger.create({
            data: data,
        });
    }
}

export default DataLoggerRepository;