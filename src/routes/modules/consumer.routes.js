import ConsumerController from "../../controllers/consumer.controller.js";
import authenticateToken from "../../middleware/auth.middleware.js";


export default (router) => {
    router.post('/consumer/register', ConsumerController.register);
    router.post('/consumer/login', ConsumerController.login);
    router.get('/consumer/logout/:id', authenticateToken, ConsumerController.logout);

    return router;
};
