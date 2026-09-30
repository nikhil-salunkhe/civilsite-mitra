const Joi = require('joi');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * Joi request validation (spec sections 36 + 42).
 * `allowUnknown` keeps optional client fields (notes, customPassword, photos...)
 * from ever breaking a request, while `convert` accepts numeric strings that
 * arrive through multipart forms.
 */
const validate = (schema) =>
  asyncHandler(async (req, res, next) => {
    const { error } = schema.validate(req.body, {
      allowUnknown: true,
      abortEarly: false,
      convert: true,
    });
    if (error) {
      throw new ApiError(
        error.details.map((d) => d.message.replace(/"/g, "'")).join('; '),
        422
      );
    }
    next();
  });

const email = Joi.string()
  .trim()
  .email({ tlds: { allow: false } })
  .required()
  .messages({ 'string.email': 'Please enter a valid email address' });

const loginSchema = Joi.object({ email, password: Joi.string().min(6).required() });

// The geo-tag is captured by the Google Maps picker on site creation. Both
// halves of a coordinate pair must arrive together, otherwise the pin is
// meaningless - a lone latitude is rejected at the request boundary.
const latitude = Joi.number().min(-90).max(90).allow(null, '');
const longitude = Joi.number().min(-180).max(180).allow(null, '');

const siteSchema = Joi.object({
  siteName: Joi.string().trim().min(2).max(100).required(),
  ownerName: Joi.string().trim().min(2).required(),
  ownerMobile: Joi.string()
    .pattern(/^\d{10}$/)
    .required()
    .messages({ 'string.pattern.base': 'Owner mobile must be a 10-digit number' }),
  address: Joi.string().trim().required(),
  city: Joi.string().trim().required(),
  totalArea: Joi.number().positive().required(),
  ratePerArea: Joi.number().positive().required(),
  latitude,
  longitude,
  locationLabel: Joi.string().trim().max(300).allow('', null),
  geoSource: Joi.string().valid('gps', 'map', 'manual').allow('', null),
});

const paymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  date: Joi.date().required(),
  paymentMode: Joi.string()
    .valid('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other')
    .required(),
});

const expenseSchema = Joi.object({
  category: Joi.string().trim().required(),
  amount: Joi.number().positive().required(),
});

module.exports = { validate, loginSchema, siteSchema, paymentSchema, expenseSchema };