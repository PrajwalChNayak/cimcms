import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import ConsumerRepository from "../repositories/consumer.repository.js";
import CryptoUtils from "../utils/crypto.utils.js";
import { ValidationError } from "../utils/custom.errors.js";
dotenv.config();

class ConsumerService {
    static async register(data) {
        const hashedPassword = CryptoUtils.hashPassword(data.password);

        return await ConsumerRepository.create({
            ...data,
            password: hashedPassword,
        });
    }

    static async login(email, password) {
        const consumer = await ConsumerRepository.findByEmail(email);
        if (!consumer || !CryptoUtils.verifyPassword(password, consumer.password)) {
            throw new ValidationError('Invalid username or password');
        }
        const authToken = jwt.sign({ id: consumer.id }, process.env.JWT_SECRET_KEY);

        return await ConsumerRepository.updateAuthToken(consumer.id, authToken);
    }

    static async logout(consumerId) {
        console.log(consumerId);
        return await ConsumerRepository.updateAuthToken(consumerId, null);
    }
}

export default ConsumerService;
