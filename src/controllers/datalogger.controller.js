import DataLoggerService from "../services/datalogger.service.js";
import { handelServerDataCreated } from "../utils/responsehandler/index.utils.js";

class DataLoggerController {

    static async storeData(req, res) {
        const reqData = {
            macAddress: req.body.macAddress,
            date: req.body.date,
            fileName: req.uploadedFiles?.file[0]?.fileName,
        };
        const data = DataLoggerService.storeData(reqData);
        return handelServerDataCreated(res, data);
    }
}

export default DataLoggerController;