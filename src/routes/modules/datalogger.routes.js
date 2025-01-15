import DataLoggerController from "../../controllers/datalogger.controller.js";
import fileUpload from "../../middleware/fileuploader.middleware.js";





export default (router) => {

    router.post('/datalogger/storeData', fileUpload([
        { name: "file", maxCount: 1, folderName: process.env.DATA_LOGGER, isOptional: false },
    ]), DataLoggerController.storeData);

    return router;
};