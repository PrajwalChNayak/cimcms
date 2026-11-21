import { cloudBucketConfig } from "@utils/config.utils";
import { Client as MinioClient } from "minio";

const bucketClient = new MinioClient(cloudBucketConfig);

export const deletefileFromMinio = async (
  folderName: string,
  fileName: string,
): Promise<void> => {
  await bucketClient.removeObject(
    cloudBucketConfig.bucketName,
    `${folderName}/${fileName}`,
  );
};
