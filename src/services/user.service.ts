import { type FieldNameDetail } from "@middleware/fileuploader.middleware";
import { Constants } from "@utils/constant.utils";

type ReqUser = { userId: number };

const userImageField = (ownerId?: number): FieldNameDetail[] => [
  {
    name: "image",
    maxCount: 1,
    folderName: Constants.USER_IMAGE_FOLDER,
    isOptional: true,
    ownerId,
  },
];

class UserService {}

export default UserService;
