import DataLoggerRepository from "../repositories/datalogger.repository.js";


class DataLoggerService {

    static async storeData(data) {
        return DataLoggerRepository.storeData(data);
    }
}

export default DataLoggerService;