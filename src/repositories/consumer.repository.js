import prisma from "../models/index.model.js";

class ConsumerRepository {
    static async create(data) {
        return await prisma.Consumer.create({
            data,
            select: {
                id: true,
                consumerEmail: true,
                mobileNo: true,
                consumerStatus: true,
                createdAt: true
            }
        });
    }

    static async findByEmail(email) {
        return await prisma.Consumer.findUnique({
            where: { consumerEmail: email }
        });
    }

    static async updateAuthToken(id, authToken) {
        return await prisma.Consumer.update({
            where: { id },
            data: {
                authToken,
                updatedAt: new Date()
            },
            select: {
                id: true,
                consumerEmail: true,
                authToken: true
            }
        });
    }
}

export default ConsumerRepository;
