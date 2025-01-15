import UserController from "../../controllers/user.controller.js";
import authenticateToken from "../../middleware/auth.middleware.js";
//import fileUpload from "../../middleware/fileuploader.middleware.js";



export default (router)=>{
    
    router.post('/loginUser', UserController.loginUser);
    router.get('/getrandomkey', UserController.getRandomKey);
    router.get('/getUserById/:id', authenticateToken, UserController.getUserById);
    
    router.put("/toggleActiveUser/:id",authenticateToken,UserController.toggleActive);
    router.delete("/toggleDeleteUser/:id",authenticateToken,UserController.toggleDelete);
    router.delete('/deleteUserById/:id', authenticateToken, UserController.deleteUser);
} 