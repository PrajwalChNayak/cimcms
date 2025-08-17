import DataLoggerService from "../services/datalogger.service.js";
import { handleDataCreation } from "../utils/responsehandler/index.utils.js";


class DataLoggerController {

    static async storeData(req, res) {
        const reqData = {
            ...req.body,
            fileName: req.uploadedFiles?.file[0]?.fileName,
        };
        const data = await DataLoggerService.storeData(reqData);
        return handleDataCreation(res, data);
    }
}

export default DataLoggerController;