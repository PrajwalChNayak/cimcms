import { POSTNETWORK } from "netflex-react";
import Urls from "../utils/url";

class Authservice {
    async loginUser(payload) {
        return await POSTNETWORK(Urls.LOGIN, payload);
      }
}

const authService = new Authservice();
export default authService;