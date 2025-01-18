import DataLoggerService from "../services/datalogger.service.js";
import { handelServerDataCreated } from "../utils/responsehandler/index.utils.js";

class DataLoggerController {

    static async storeData(req, res) {
        const reqData = {
            ...req.body,
            fileName: req.uploadedFiles?.file[0]?.fileName,
        };
        const data = await DataLoggerService.storeData(reqData);
        return handelServerDataCreated(res, data);
    }
}

export default DataLoggerController;