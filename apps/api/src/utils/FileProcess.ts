import { NotFoundError } from "@utils/errors/custom.errors";
import csvParser from "csv-parser";
import multer from "multer";
import stream from "stream";
import xlsx from "xlsx";

class FileProcessor {
  static async processFile(
    file: Express.Multer.File,
  ): Promise<Record<string, unknown>[]> {
    const fileBuffer = file.buffer;
    switch (file.mimetype) {
      case "text/csv":
        return await FileProcessor.processCsvFile(fileBuffer);
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return FileProcessor.processExcelFile(fileBuffer);
      default:
        throw new NotFoundError("Invalid file format");
    }
  }

  static processCsvFile(buffer: Buffer): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const results: Record<string, unknown>[] = [];
      const readableStream = new stream.PassThrough();
      readableStream.end(buffer);

      readableStream
        .pipe(csvParser())
        .on("data", (data: Record<string, unknown>) => results.push(data))
        .on("end", () => resolve(results))
        .on("error", (error: Error) => reject(error));
    });
  }

  static processExcelFile(buffer: Buffer): Record<string, unknown>[] {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
  }

  static upload(): multer.Multer {
    const storage = multer.memoryStorage();
    return multer({ storage });
  }
}

export default FileProcessor;
