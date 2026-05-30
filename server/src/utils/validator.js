/**
 * Request Validation Engine
 * 
 * Defines express-validator rules and helpers to safely parse:
 *  - Single YouTube URLs (handling watch, share, short, embed formats)
 *  - Batch URL arrays (limiting concurrency bounds between 1-10 jobs)
 *  - Requested video extraction quality presets (360p up to 4K)
 */

const { body, validationResult } = require('express-validator');

// Strict YouTube URL Regex: matches standard watch URLs, short youtu.be, embed, mobile forms
const YOUTUBE_URL_REGEX =
  /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/;

/**
 * Standard single extraction request validator schema
 */
const validateExtractionRequest = [
  body('url')
    .trim()
    .notEmpty().withMessage('YouTube URL is required')
    .isURL().withMessage('Must be a valid URL')
    .matches(YOUTUBE_URL_REGEX).withMessage('Must be a valid YouTube video URL'),
  
  body('quality')
    .optional()
    .trim()
    .isIn(['360', '480', '720', '1080', '1440', '2160', 'best'])
    .withMessage('Unsupported video resolution request')
];

/**
 * Batch extraction request validator schema
 */
const validateBatchRequest = [
  body('urls')
    .isArray({ min: 1, max: 10 }).withMessage('Please provide between 1 and 10 YouTube URLs'),
  
  body('urls.*')
    .trim()
    .notEmpty().withMessage('URL item cannot be empty')
    .isURL().withMessage('Must be a valid URL format')
    .matches(YOUTUBE_URL_REGEX).withMessage('Must be a valid YouTube URL format')
];

/**
 * Validation Middleware: evaluates standard rule lists and rejects requests with error 400
 */
const checkValidationResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: errors.array().map(err => ({ field: err.path, message: err.msg }))
    });
  }
  next();
};

module.exports = {
  YOUTUBE_URL_REGEX,
  validateExtractionRequest,
  validateBatchRequest,
  checkValidationResult
};
