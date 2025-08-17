import ConsumerService from "../services/consumer.service.js";
import { handleDataCreation, handleSuccess } from "../utils/responsehandler/index.utils.js";

class ConsumerController {
    static async register(req, res) {
        const data = await ConsumerService.register(req.body);
        return handleDataCreation(res, data);
    }

    static async login(req, res) {
        const { email, password } = req.body;
        const data = await ConsumerService.login(email, password);
        return handleSuccess(res, data);
    }

    static async logout(req, res) {
        const consumerId = req.params.id;
        await ConsumerService.logout(consumerId);
        return handleSuccess(res, { message: 'Logged out successfully' });
    }
}

export default ConsumerController;
