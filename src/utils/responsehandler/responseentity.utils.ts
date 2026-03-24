class ResponseEntity {
  result: unknown;
  statusCode: number;
  status: boolean | string;
  message: string;

  constructor(
    result: unknown,
    statusCode: number,
    status: boolean | string,
    message: string,
  ) {
    this.result = result;
    this.statusCode = statusCode;
    this.status = status;
    this.message = message;
  }
}

export default ResponseEntity;
