const Joi = require("joi");

const contactUsSchema = Joi.object({
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
  email: Joi.string().email().required(),
  country_code: Joi.string().required(),  
  phone: Joi.string().required(),
  message: Joi.string().required(),
});

module.exports = { contactUsSchema };
