import jwt from 'jsonwebtoken'; //* Import the entire CommonJS module
import { JWT_SECRET_KEY } from '../utils/config.utils.js';
import { Constants } from '../utils/constant.utils.js';
import logger from '../utils/logger.utils.js';
import { handleUnauthorized, handleError } from '../utils/responsehandler/index.utils.js';

const { verify } = jwt; //* Destructure the `verify` function from the imported module

const authenticateToken = (req, res, next) => {
  
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return handleUnauthorized(res);
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  verify(token, JWT_SECRET_KEY, (err, user) => {
    if (err) {
      logger.error(err);
      return handleError(res, err, Constants.HTTPFORBIDDEN);
    }

    req.user = user;
    next();
  });
};

export default authenticateToken;
